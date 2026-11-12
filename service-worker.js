"use strict";

const CACHE_PREFIX = "advanced-calculator-";
const CACHE_NAME = "advanced-calculator-v2";
const INDEX_URL = "./index.html";

const APP_SHELL = [
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
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/math.js",
  "./vendor/math.js.LICENSE.txt",
  "./vendor/katex/katex.min.js",
  "./vendor/katex/katex.min.css",
  "./vendor/katex/LICENSE",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.ttf",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.ttf",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Bold.ttf",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.ttf",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Italic.ttf",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.ttf",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Math-Italic.ttf",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.ttf",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.ttf",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Script-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.ttf",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
];

const APP_SHELL_URLS = new Set(
  APP_SHELL.map(function (path) {
    return new URL(path, self.location.href).href;
  })
);

function isSameOriginUrl(value) {
  try {
    return new URL(value, self.location.href).origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

function isCacheableResponse(response, request) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return false;
  }

  return isSameOriginUrl(response.url || request.url);
}

function isShellNavigation(request) {
  if (!isSameOriginUrl(request.url)) {
    return false;
  }

  const basePath = new URL("./", self.location.href).pathname;
  const path = new URL(request.url).pathname;
  return path === basePath || path === basePath + "index.html";
}

function offlineResponse() {
  return new Response("Advanced Calculator is offline. Reconnect and reload to try again.", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (isShellNavigation(request) && isCacheableResponse(response, request)) {
      await cache.put(INDEX_URL, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(INDEX_URL);

    if (cached) {
      return cached;
    }

    return offlineResponse();
  }
}

function serveAsset(event) {
  const cachePromise = caches.open(CACHE_NAME);
  const cachedPromise = cachePromise.then(function (cache) {
    return cache.match(event.request);
  });
  const networkPromise = cachePromise.then(function (cache) {
    return fetch(event.request).then(function (response) {
      if (isCacheableResponse(response, event.request)) {
        return cache.put(event.request, response.clone()).then(function () {
          return response;
        });
      }

      return response;
    });
  });

  event.waitUntil(
    cachedPromise.then(function (cached) {
      if (cached) {
        return networkPromise.catch(function () {
          return null;
        });
      }

      return null;
    })
  );

  event.respondWith(
    cachedPromise.then(function (cached) {
      if (cached) {
        return cached;
      }

      return networkPromise.catch(function () {
        return offlineResponse();
      });
    })
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(APP_SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (request.headers && typeof request.headers.has === "function" && request.headers.has("Range")) {
    return;
  }

  if (!APP_SHELL_URLS.has(request.url)) {
    return;
  }

  serveAsset(event);
});
