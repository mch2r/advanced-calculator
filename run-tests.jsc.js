"use strict";

(function () {
  if (typeof print !== "function") {
    return;
  }

  var cache = {};

  function sameValue(left, right) {
    if (Object.is(left, right)) {
      return true;
    }

    if (typeof left !== typeof right || left === null || right === null) {
      return false;
    }

    if (typeof left !== "object") {
      return false;
    }

    var leftKeys = Object.keys(left);
    var rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (var i = 0; i < leftKeys.length; i += 1) {
      if (leftKeys[i] !== rightKeys[i]) {
        return false;
      }

      if (!sameValue(left[leftKeys[i]], right[rightKeys[i]])) {
        return false;
      }
    }

    return true;
  }

  function fail(message) {
    var error = new Error(message || "Assertion failed");
    error.name = "AssertionError";
    throw error;
  }

  var assert = {
    ok: function (value, message) {
      if (!value) {
        fail(message);
      }
    },
    equal: function (actual, expected, message) {
      if (actual != expected) {
        fail(message || "Expected " + actual + " to equal " + expected);
      }
    },
    strictEqual: function (actual, expected, message) {
      if (actual !== expected) {
        fail(message || "Expected " + actual + " to equal " + expected);
      }
    },
    notStrictEqual: function (actual, expected, message) {
      if (actual === expected) {
        fail(message || "Expected values to differ");
      }
    },
    deepStrictEqual: function (actual, expected, message) {
      if (!sameValue(actual, expected)) {
        fail(message || "Expected " + JSON.stringify(actual) + " to deeply equal " + JSON.stringify(expected));
      }
    },
    throws: function (callback, message) {
      try {
        callback();
      } catch (error) {
        return;
      }

      fail(message || "Expected function to throw");
    },
  };

  function resolvePath(request) {
    var path = String(request);

    if (path.indexOf("node:") === 0) {
      path = path.slice(5);
    }

    if (path === "assert") {
      return null;
    }

    return path.replace(/^\.\//, "");
  }

  function requireModule(request) {
    if (request === "assert" || request === "node:assert") {
      return assert;
    }

    var path = resolvePath(request);

    if (cache[path]) {
      return cache[path].exports;
    }

    var module = { exports: {} };
    cache[path] = module;

    var previousModule = globalThis.module;
    var previousExports = globalThis.exports;
    var previousRequire = globalThis.require;

    globalThis.module = module;
    globalThis.exports = module.exports;
    globalThis.require = requireModule;

    try {
      load(path);
    } finally {
      globalThis.module = previousModule;
      globalThis.exports = previousExports;
      globalThis.require = previousRequire;
    }

    return module.exports;
  }

  globalThis.require = requireModule;
  globalThis.exports = {};
  globalThis.console = {
    log: function () {
      print(Array.prototype.join.call(arguments, " "));
    },
    warn: function () {
      print(Array.prototype.join.call(arguments, " "));
    },
    error: function () {
      print(Array.prototype.join.call(arguments, " "));
    },
  };
  globalThis.process = { exitCode: 0 };

  var files = [
    "solver.test.js",
    "calculus.test.js",
    "plot.test.js",
    "graph.test.js",
    "ui.test.js",
    "pwa.test.js",
    "security.test.js",
  ];

  for (var i = 0; i < files.length; i += 1) {
    var source;

    try {
      source = read(files[i]);
    } catch (error) {
      continue;
    }

    var runner = new Function("require", "module", "exports", "process", "console", source);
    runner(requireModule, { exports: {} }, {}, globalThis.process, globalThis.console);
  }

  if (globalThis.process && globalThis.process.exitCode) {
    quit(globalThis.process.exitCode);
  }
})();
