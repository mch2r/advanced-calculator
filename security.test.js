"use strict";

const assert = require("node:assert");
const solver = require("./solver.js");
const ui = require("./script.js");

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

check("shipped scripts avoid HTML and dynamic-code sinks", function () {
  const files = [
    "solver.js",
    "calculus.js",
    "plot.js",
    "graph.js",
    "palette.js",
    "script.js",
    "pwa.js",
    "service-worker.js",
  ];
  const sinks = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bsrcdoc\b/,
  ];

  files.forEach(function (name) {
    const source = readText(name);

    sinks.forEach(function (pattern) {
      assert.ok(!pattern.test(source), name + " contains " + pattern);
    });
  });
});

check("history load sanitizes untrusted storage entries", function () {
  const storage = {
    data: {},
    getItem: function (key) {
      return this.data[key] || null;
    },
    setItem: function (key, value) {
      this.data[key] = value;
    },
  };
  const payload =
    '[{"mode":"derivative","inputs":{"expression":"' +
    "x".repeat(600) +
    '","variable":"x","order":"3","point":"1","__proto__":{"polluted":true},"evil":"drop"},"angleMode":"deg","summary":"' +
    "s".repeat(600) +
    '","timestamp":"bad"}]';
  storage.data["security-history"] = payload;

  const store = ui.createHistoryStore("security-history", storage);
  store.load();
  const entry = store.list()[0];

  assert.ok(entry);
  assert.strictEqual(Object.prototype.polluted, undefined);
  assert.strictEqual(entry.angleMode, "deg");
  assert.strictEqual(entry.summary.length, 500);
  assert.strictEqual(entry.timestamp, 0);
  assert.strictEqual(entry.inputs.expression.length, 500);
  assert.strictEqual(entry.inputs.variable, "x");
  assert.strictEqual(entry.inputs.order, "3");
  assert.deepStrictEqual(Object.keys(entry.inputs).sort(), [
    "expression",
    "order",
    "point",
    "variable",
  ]);
});

check("solver rejects prototype and environment identifiers", function () {
  ["constructor", "__proto__", "prototype", "globalThis", "process"].forEach(function (name) {
    const result = solver.evaluateExpression(name);
    assert.strictEqual(result.ok, false, name + " should be rejected");
  });
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
