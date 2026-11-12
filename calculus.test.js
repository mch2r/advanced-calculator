"use strict";

const assert = require("node:assert");
const calculus = require("./calculus.js");
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

function close(actual, expected, tolerance, label) {
  const limit = tolerance == null ? 1e-8 : tolerance;
  assert.ok(
    Math.abs(actual - expected) <= limit,
    (label || "value") + " expected " + expected + " but got " + actual
  );
}

function derivativeValue(input, point, options) {
  const result = calculus.differentiate(input, options);
  assert.strictEqual(result.ok, true, result.message);
  return result.evaluateDerivative(point);
}

check("derivative x^3 is 3x^2", function () {
  close(derivativeValue("x^3", 2), 12);
});

check("derivative sin(x) is cos(x)", function () {
  close(derivativeValue("sin(x)", 0.3), Math.cos(0.3));
});

check("derivative ln(x) is 1/x", function () {
  close(derivativeValue("ln(x)", 4), 0.25);
});

check("derivative e^x stays e^x", function () {
  close(derivativeValue("e^x", 1.1), Math.exp(1.1));
});

check("product rule x*sin(x)", function () {
  const x = 1.2;
  close(derivativeValue("x*sin(x)", x), Math.sin(x) + x * Math.cos(x));
});

check("quotient rule sin(x)/x", function () {
  const x = 1.4;
  const expected = (Math.cos(x) * x - Math.sin(x)) / (x * x);
  close(derivativeValue("sin(x)/x", x), expected);
});

check("chain rule sin(x^2)", function () {
  const x = 0.7;
  close(derivativeValue("sin(x^2)", x), Math.cos(x * x) * 2 * x);
});

check("second derivative of x^3 is 6x", function () {
  const result = calculus.differentiate("x^3", { order: 2 });
  assert.strictEqual(result.ok, true, result.message);
  close(result.evaluateDerivative(2), 12);
});

check("order is capped at four", function () {
  const result = calculus.differentiate("x^5", { order: 9 });
  assert.strictEqual(result.order, 4);
  close(result.evaluateDerivative(2), 240);
});

check("f(x) and y= input forms are accepted", function () {
  assert.strictEqual(calculus.differentiate("f(x)=x^2").ok, true);
  assert.strictEqual(calculus.differentiate("y=x^2").ok, true);
});

check("degree mode scales trig derivatives", function () {
  const result = calculus.differentiate("sin(x)", { angleMode: "deg" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.evaluateDerivative(90), 0, 1e-10);
  close(result.evaluateDerivative(0), Math.PI / 180, 1e-12);
});

check("derivative step trace is produced", function () {
  const result = calculus.differentiate("x^3-3x");
  assert.strictEqual(result.ok, true, result.message);
  assert.ok(result.steps.length > 0);
  assert.ok(result.steps[result.steps.length - 1].expression.length > 0);
});

check("derivative value at a point", function () {
  const result = calculus.differentiate("x^2", { point: "3" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 6);
});

check("integral of x^2 from 0 to 1", function () {
  const result = calculus.integrate("x^2", { lower: "0", upper: "1" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 1 / 3, 1e-9);
});

check("integral of sin(x) from 0 to pi", function () {
  const result = calculus.integrate("sin(x)", { lower: "0", upper: "pi" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 2, 1e-8);
});

check("integral bounds keep pi display labels", function () {
  const result = calculus.integrate("sin(x)", { lower: "0", upper: "pi" });
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(result.lowerText, "0");
  assert.strictEqual(result.upperText, "π");
  assert.strictEqual(result.lowerTex, "0");
  assert.strictEqual(result.upperTex, "\\pi");
});

check("reversed integral bounds swap display labels", function () {
  const result = calculus.integrate("sin(x)", { lower: "pi", upper: "0" });
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(result.reversed, true);
  assert.strictEqual(result.lowerText, "0");
  assert.strictEqual(result.upperText, "π");
});

check("integral of 1/x from 1 to e", function () {
  const result = calculus.integrate("1/x", { lower: "1", upper: "e" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 1, 1e-8);
});

check("integral of sqrt(x) from 0 to 1", function () {
  const result = calculus.integrate("sqrt(x)", { lower: "0", upper: "1" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 2 / 3, 1e-8);
});

check("reversed integral limits negate the result", function () {
  const forward = calculus.integrate("x^2", { lower: "0", upper: "2" });
  const reversed = calculus.integrate("x^2", { lower: "2", upper: "0" });
  assert.strictEqual(reversed.ok, true, reversed.message);
  close(reversed.value, -forward.value, 1e-9);
});

check("equal integral limits give zero", function () {
  const result = calculus.integrate("x^2", { lower: "2", upper: "2" });
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(result.value, 0);
});

check("discontinuous integrand is rejected", function () {
  const result = calculus.integrate("1/x", { lower: "-1", upper: "1" });
  assert.strictEqual(result.ok, false);
  assert.ok(/undefined|discontinu/i.test(result.message));
});

check("integral trace records estimates", function () {
  const result = calculus.integrate("x^2", { lower: "0", upper: "1" });
  assert.ok(result.steps.length >= 2);
  assert.ok(result.evaluations > 0);
});

check("degree mode applies to integration", function () {
  const result = calculus.integrate("sin(x)", { lower: "0", upper: "180", angleMode: "deg" });
  assert.strictEqual(result.ok, true, result.message);
  close(result.value, 2 * 180 / Math.PI, 1e-7);
});

check("log and trig evaluation in degree mode", function () {
  const radians = solver.evaluateExpression("sin(pi/2)", { angleMode: "rad" });
  const degrees = solver.evaluateExpression("sin(90)", { angleMode: "deg" });
  assert.strictEqual(radians.ok, true);
  assert.strictEqual(degrees.ok, true);
  close(solver.safeNumber(degrees.value), 1, 1e-12);
  assert.strictEqual(solver.evaluateExpression("log10(1000)").ok, true);
  assert.strictEqual(solver.evaluateExpression("ln(e^3)").ok, true);
});

check("unsymbolic derivatives fall back to numeric at a point", function () {
  const numeric = calculus.differentiate("max(x, 0)", { point: "2" });
  assert.strictEqual(numeric.ok, true, numeric.message);
  assert.strictEqual(numeric.status, "numeric");
  close(numeric.value, 1, 1e-4);

  const withoutPoint = calculus.differentiate("max(x, 0)");
  assert.strictEqual(withoutPoint.ok, false);
  assert.ok(/evaluation point/i.test(withoutPoint.message));
});

check("a nonsmooth point falls back to a numeric value with a note", function () {
  const result = calculus.differentiate("abs(x)", { point: "0" });
  assert.strictEqual(result.ok, true);
  assert.ok(Number.isFinite(result.value));
  assert.ok(result.notes.some(function (note) {
    return note.indexOf("numeric estimate") >= 0;
  }));
});

check("unsupported functions are rejected", function () {
  assert.strictEqual(calculus.differentiate('import("fs")').ok, false);
  assert.strictEqual(calculus.integrate("x", { lower: "0", upper: "1", variable: "sin" }).ok, false);
});

check("function names are rejected as variables", function () {
  const result = calculus.differentiate("x^2", { variable: "sin" });
  assert.strictEqual(result.ok, false);
});

check("integrand cleaning respects multi-letter variables", function () {
  assert.strictEqual(calculus.cleanIntegrand("x^2 dx", "x"), "x^2");
  assert.strictEqual(calculus.cleanIntegrand("theta^2 dtheta", "theta"), "theta^2");
  assert.strictEqual(calculus.cleanIntegrand("\u222b sin(x) dx", "x"), "sin(x)");
});

check("infinite integral limits are rejected", function () {
  const result = calculus.integrate("e^(-x)", { lower: "0", upper: "Infinity" });
  assert.strictEqual(result.ok, false);
  assert.ok(/finite/i.test(result.message));
});

check("derivative of tan(x) is sec^2(x)", function () {
  const x = 0.3;
  close(derivativeValue("tan(x)", x), 1 / (Math.cos(x) * Math.cos(x)), 1e-10);

  const degree = calculus.differentiate("tan(x)", { angleMode: "deg" });
  assert.strictEqual(degree.ok, true, degree.message);
  close(degree.evaluateDerivative(45), (Math.PI / 180) * 2, 1e-10);
});

check("derivative of atan(x) is 1/(1+x^2)", function () {
  const x = 0.7;
  close(derivativeValue("atan(x)", x), 1 / (1 + x * x), 1e-10);
});

check("arcsin normalization works", function () {
  const result = solver.evaluateExpression("arcsin(1)");
  assert.strictEqual(result.ok, true, result.message);
  close(solver.safeNumber(result.value), Math.PI / 2, 1e-12);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
