"use strict";

const assert = require("node:assert");
const pwa = require("./pwa.js");

let passed = 0;
let failed = 0;

function check(label, callback) {
  try {
    callback();
    passed += 1;
    console.log("ok - " + label);
  } catch (error) {
    failed += 1;
    console.error("not ok - " + label);
    console.error("  " + error.message);
  }
}

function readText(name) {
  if (typeof read === "function") {
    return read(name);
  }

  return require("fs").readFileSync(name, "utf8");
}

function fileExists(name) {
  try {
    readText(name);
    return true;
  } catch (error) {
    return false;
  }
}

function fakeTarget() {
  const listeners = {};

  return {
    hidden: true,
    listeners: listeners,
    addEventListener: function (type, callback) {
      (listeners[type] = listeners[type] || []).push(callback);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (callback) {
        callback(event || {});
      });
    },
  };
}

function fakeWindow() {
  const listeners = {};

  return {
    navigator: {},
    console: { warn: function () {} },
    addEventListener: function (type, callback) {
      (listeners[type] = listeners[type] || []).push(callback);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (callback) {
        callback(event || {});
      });
    },
    matchMedia: function () {
      return {
        matches: false,
        addEventListener: function () {},
      };
    },
  };
}

const manifest = JSON.parse(readText("manifest.webmanifest"));
const index = readText("index.html");
const worker = readText("service-worker.js");
const shellMatch = worker.match(/const APP_SHELL = \[([\s\S]*?)\n\];/);
const shell = shellMatch
  ? Array.from(shellMatch[1].matchAll(/"([^"]+)"/g)).map(function (match) {
      return match[1];
    })
  : [];

check("manifest declares an installable calculator", function () {
  assert.strictEqual(manifest.name, "Advanced Calculator");
  assert.strictEqual(manifest.short_name, "Calculator");
  assert.strictEqual(manifest.display, "standalone");
  assert.strictEqual(manifest.start_url, "./");
  assert.strictEqual(manifest.scope, "./");
  assert.strictEqual(manifest.theme_color, "#0f1115");
});

check("manifest includes 192, 512, and maskable icons", function () {
  const sizes = manifest.icons.map(function (icon) {
    return icon.sizes;
  });
  const purposes = manifest.icons.map(function (icon) {
    return icon.purpose;
  });

  assert.ok(sizes.indexOf("192x192") >= 0);
  assert.ok(sizes.indexOf("512x512") >= 0);
  assert.ok(purposes.indexOf("maskable") >= 0);
});

check("index links the manifest, icons, theme, and registration script", function () {
  assert.ok(index.indexOf('rel="manifest" href="manifest.webmanifest"') >= 0);
  assert.ok(index.indexOf('rel="apple-touch-icon" href="icons/apple-touch-icon.png"') >= 0);
  assert.ok(index.indexOf('name="theme-color" content="#0f1115"') >= 0);
  assert.ok(index.indexOf('<script src="pwa.js"></script>') >= 0);
});

check("index exposes a hidden install button after the app script", function () {
  assert.ok(index.indexOf('id="install-app"') >= 0);
  assert.ok(index.indexOf('aria-label="Install Advanced Calculator"') >= 0);
  assert.ok(index.indexOf("hidden>") >= 0);
  assert.ok(index.indexOf('<script src="script.js"></script>') < index.indexOf('<script src="pwa.js"></script>'));
});

check("service worker precaches every app entrypoint", function () {
  [
    "./",
    "./index.html",
    "./style.css",
    "./solver.js",
    "./calculus.js",
    "./plot.js",
    "./graph.js",
    "./palette.js",
    "./script.js",
    "./pwa.js",
    "./manifest.webmanifest",
    "./vendor/math.js",
    "./vendor/katex/katex.min.js",
    "./vendor/katex/katex.min.css",
  ].forEach(function (path) {
    assert.ok(shell.indexOf(path) >= 0, "Missing app shell entry " + path);
  });
});

check("service worker precache stays same-origin and complete", function () {
  assert.ok(shell.length > 20);
  assert.ok(shell.every(function (path) {
    return /^\.\//.test(path);
  }));

  shell.forEach(function (path) {
    if (path === "./") {
      return;
    }

    assert.ok(fileExists(path.slice(2)), "Missing precached file " + path);
  });
});

check("service worker has versioning, navigation fallback, and cleanup", function () {
  const version = worker.match(/const CACHE_NAME = "advanced-calculator-v(\d+)";/);

  assert.ok(version);
  assert.ok(Number(version[1]) >= 3, "Cache version was not bumped for the graph fix");
  assert.ok(worker.indexOf('request.mode === "navigate"') >= 0);
  assert.ok(worker.indexOf("cache.match(INDEX_URL") >= 0);
  assert.ok(worker.indexOf("self.clients.claim()") >= 0);
  assert.ok(worker.indexOf("self.skipWaiting()") >= 0);
});

check("service worker limits caching to same-origin GET requests", function () {
  assert.ok(worker.indexOf('request.method !== "GET"') >= 0);
  assert.ok(worker.indexOf("url.origin !== self.location.origin") >= 0);
  assert.ok(worker.indexOf("./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2") >= 0);
});

check("index sets a restrictive CSP and no-referrer policy", function () {
  assert.ok(index.indexOf('http-equiv="Content-Security-Policy"') >= 0);
  assert.ok(index.indexOf("default-src 'none'") >= 0);
  assert.ok(index.indexOf("script-src 'self'") >= 0);
  assert.ok(index.indexOf("object-src 'none'") >= 0);
  assert.ok(index.indexOf('name="referrer" content="no-referrer"') >= 0);
  assert.ok(index.indexOf('maxlength="500"') >= 0);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(index), "Inline script found");
  assert.ok(!/\son[a-z]+\s*=/i.test(index), "Inline event handler found");
});

check("service worker only caches app shell assets and safe responses", function () {
  assert.ok(worker.indexOf("const APP_SHELL_URLS = new Set(") >= 0);
  assert.ok(worker.indexOf("if (!APP_SHELL_URLS.has(request.url))") >= 0);
  assert.ok(worker.indexOf("isCacheableResponse") >= 0);
  assert.ok(worker.indexOf('response.type !== "basic"') >= 0);
  assert.ok(worker.indexOf("isShellNavigation(request)") >= 0);
  assert.ok(worker.indexOf("ignoreSearch") < 0);
});

check("standalone detection covers display mode and iOS", function () {
  assert.strictEqual(pwa.isStandalone({ navigator: { standalone: true } }), true);
  assert.strictEqual(
    pwa.isStandalone({
      navigator: {},
      matchMedia: function () {
        return { matches: true };
      },
    }),
    true
  );
  assert.strictEqual(
    pwa.isStandalone({
      navigator: {},
      matchMedia: function () {
        return { matches: false };
      },
    }),
    false
  );
});

check("service worker registration requires HTTPS or localhost", function () {
  const workerStub = {};

  assert.strictEqual(
    pwa.canRegisterServiceWorker({
      navigator: { serviceWorker: workerStub },
      location: { protocol: "https:", hostname: "example.github.io" },
    }),
    true
  );
  assert.strictEqual(
    pwa.canRegisterServiceWorker({
      navigator: { serviceWorker: workerStub },
      location: { protocol: "http:", hostname: "localhost" },
    }),
    true
  );
  assert.strictEqual(
    pwa.canRegisterServiceWorker({
      navigator: { serviceWorker: workerStub },
      location: { protocol: "http:", hostname: "example.com" },
    }),
    false
  );
});

check("registration uses the relative worker and update-safe options", function () {
  let registration = null;
  const win = {
    location: { protocol: "https:", hostname: "example.github.io" },
    navigator: {
      serviceWorker: {
        register: function (path, options) {
          registration = { path: path, options: options };
          return Promise.resolve({ scope: "/advanced-calculator/" });
        },
      },
    },
    console: { warn: function () {} },
  };

  pwa.registerServiceWorker(win);
  assert.strictEqual(registration.path, "./service-worker.js");
  assert.strictEqual(registration.options.scope, "./");
  assert.strictEqual(registration.options.updateViaCache, "none");
});

check("install controller shows on prompt and consumes it on click", function () {
  const win = fakeWindow();
  const button = fakeTarget();
  const doc = {
    getElementById: function (id) {
      return id === "install-app" ? button : null;
    },
  };
  let prevented = false;
  let prompted = false;

  pwa.createInstallController(win, doc);
  assert.strictEqual(button.hidden, true);
  win.dispatch("beforeinstallprompt", {
    preventDefault: function () {
      prevented = true;
    },
    prompt: function () {
      prompted = true;
    },
  });
  assert.strictEqual(prevented, true);
  assert.strictEqual(button.hidden, false);
  button.dispatch("click");
  assert.strictEqual(prompted, true);
  assert.strictEqual(button.hidden, true);
});

if (globalThis.process) {
  if (failed) {
    globalThis.process.exitCode = 1;
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
}
