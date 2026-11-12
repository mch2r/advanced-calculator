"use strict";

const assert = require("node:assert");
const solver = require("./solver.js");

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

function rootTexts(input) {
  return solver.solveEquation(input).roots.map(function (root) {
    return root.text;
  });
}

check("quadratic with two roots", function () {
  assert.deepStrictEqual(rootTexts("x^2=4"), ["-2", "2"]);
});

check("quadratic with a double root", function () {
  assert.deepStrictEqual(rootTexts("x^2-4x+4"), ["2"]);
});

check("no real roots", function () {
  const result = solver.solveEquation("x^2+1=0");
  assert.strictEqual(result.status, "no-real-roots");
});

check("cubic roots", function () {
  assert.deepStrictEqual(rootTexts("x^3-x=0"), ["-1", "0", "1"]);
});

check("implicit multiplication", function () {
  assert.deepStrictEqual(rootTexts("2x+3=7"), ["2"]);
});

check("parentheses", function () {
  assert.deepStrictEqual(rootTexts("(x+1)(x-1)=0"), ["-1", "1"]);
});

check("unicode square and root", function () {
  assert.deepStrictEqual(rootTexts("x\u00b2-4x+4=0"), ["2"]);
  assert.deepStrictEqual(rootTexts("\u221a(x+1)=2"), ["3"]);
});

check("unicode cube root", function () {
  assert.strictEqual(solver.safeNumber(solver.evaluateExpression("\u221b-8").value), -2);
  assert.strictEqual(solver.evaluateExpression("\u221b8").text, "2");
});

check("trigonometric equation", function () {
  const roots = solver.solveEquation("sin(x)=0.5").roots;
  assert.ok(roots.length > 0);
});

check("asymptote is not a root", function () {
  assert.strictEqual(solver.solveEquation("1/x=0").status, "no-real-roots");
});

check("exponential never reaches zero", function () {
  assert.strictEqual(solver.solveEquation("e^x=0").status, "no-real-roots");
  assert.strictEqual(solver.solveEquation("e^(-x^2)=0").status, "no-real-roots");
});

check("tiny positive offset is not a root", function () {
  assert.strictEqual(solver.solveEquation("x^2+1e-9=0").status, "no-real-roots");
});

check("identity has infinite solutions", function () {
  assert.strictEqual(solver.solveEquation("x=x").status, "infinite-solutions");
});

check("zero interval has infinite solutions", function () {
  assert.strictEqual(solver.solveEquation("max(x,0)=0").status, "infinite-solutions");
});

check("adjacent sample roots are not mistaken for a zero interval", function () {
  const result = solver.solveEquation("(x+100)(x+99.95)=0");
  assert.strictEqual(result.status, "roots");
  assert.strictEqual(result.roots.length, 2);
});

check("contradiction has no solution", function () {
  assert.strictEqual(solver.solveEquation("5=3").status, "no-solution");
});

check("multiple equals is rejected", function () {
  assert.strictEqual(solver.solveEquation("x=1=2").status, "error");
});

check("inequalities and assignments are rejected", function () {
  assert.strictEqual(solver.solveEquation("x<2").status, "error");
  assert.strictEqual(solver.evaluateExpression("x=2").status, "error");
});

check("evaluate basic expression", function () {
  assert.strictEqual(solver.evaluateExpression("2+3*4").text, "14");
});

check("evaluate treats x as a function", function () {
  const result = solver.evaluateExpression("x+1");
  assert.strictEqual(result.status, "function");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.evaluate(2), 3);
});

check("evaluate rejects unknown symbols", function () {
  assert.strictEqual(solver.evaluateExpression("y+1").status, "error");
});

check("evaluator accepts parameter scopes", function () {
  const node = solver.parseExpression("a*x+1");
  const evaluate = solver.makeEvaluator(node, "x", { a: 3 });
  assert.strictEqual(evaluate(2), 7);
});

check("evaluate rejects unsupported functions", function () {
  assert.strictEqual(solver.evaluateExpression('import("fs")').status, "error");
});

check("overlong expressions are rejected", function () {
  const result = solver.evaluateExpression("1+" + "1+".repeat(260) + "1");
  assert.strictEqual(result.status, "error");
  assert.ok(/too long/i.test(result.message));
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
