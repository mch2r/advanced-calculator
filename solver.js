(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./vendor/math.js"));
  } else {
    root.EquationSolver = factory(root.math);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (math) {
  "use strict";

  const DEFAULT_OPTIONS = {
    min: -100,
    max: 100,
    samples: 4000,
    tol: 1e-10,
    valueTol: 1e-8,
    mergeTol: 1e-6,
    maxRoots: 50,
    angleMode: "rad",
  };

  const SOLVE_SYMBOLS = ["x", "pi", "e"];
  const EVAL_SYMBOLS = ["pi", "e", "i", "x"];

  const ALLOWED_FUNCTIONS = [
    "sqrt", "cbrt", "nthRoot", "abs", "exp", "log", "log10", "log2", "log1p",
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "sec", "csc", "cot", "floor", "ceil", "round", "sign", "min", "max",
    "pow", "mod", "hypot", "gcd", "lcm",
  ];

  const ALLOWED_NODE_TYPES = new Set([
    "ConstantNode",
    "SymbolNode",
    "OperatorNode",
    "ParenthesisNode",
    "FunctionNode",
  ]);

  const ALLOWED_OPERATORS = new Set(["+", "-", "*", "/", "^", "mod", "%", "!"]);

  const DIRECT_TRIG = new Set(["sin", "cos", "tan", "sec", "csc", "cot"]);
  const INVERSE_TRIG = new Set(["asin", "acos", "atan"]);

  const DEG_TO_RAD = "pi/180";
  const RAD_TO_DEG = "180/pi";

  const SUPERSCRIPTS = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-",
  };

  class SolverError extends Error {
    constructor(message) {
      super(message);
      this.name = "SolverError";
    }
  }

  function normalize(input) {
    let text = String(input == null ? "" : input).replace(/\r?\n/g, " ").trim();

    text = text.replace(/\*\*/g, "^");
    text = text.replace(/[−–—]/g, "-");
    text = text.replace(/[×·⋅✕]/g, "*");
    text = text.replace(/÷/g, "/");
    text = text.replace(/[πΠ]/g, "pi");
    text = text.replace(/∞/g, " Infinity ");
    text = text.replace(/\binfinity\b/gi, "Infinity");

    text = text.replace(/√\s*-\s*([0-9]+(?:\.[0-9]+)?)/g, " sqrt(-$1)");
    text = text.replace(/√\s*\(/g, " sqrt(");
    text = text.replace(/√\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)/gi, " sqrt($1)");
    text = text.replace(/√\s*([a-zA-Z][a-zA-Z0-9]*)/g, " sqrt($1)");
    text = text.replace(/√/g, " sqrt");

    text = text.replace(/∛\s*-\s*([0-9]+(?:\.[0-9]+)?)/g, " cbrt(-$1)");
    text = text.replace(/∛\s*\(/g, " cbrt(");
    text = text.replace(/∛\s*([0-9]+(?:\.[0-9]+)?)/g, " cbrt($1)");
    text = text.replace(/∛\s*([a-zA-Z][a-zA-Z0-9]*)/g, " cbrt($1)");
    text = text.replace(/∛/g, " cbrt");

    text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, function (run) {
      let exponent = "";
      for (const char of run) {
        exponent += SUPERSCRIPTS[char];
      }
      return "^(" + exponent + ")";
    });

    text = text.replace(/\barc(sinh|cosh|tanh|sin|cos|tan)\b/gi, function (match, name) {
      return "a" + name.toLowerCase();
    });

    text = text.replace(/\blog\s*_\s*10\s*\(/gi, "log10(");
    text = text.replace(/\blog\s*_\s*2\s*\(/gi, "log2(");
    text = text.replace(/log₁₀/g, "log10");
    text = text.replace(/log₂/g, "log2");

    text = text.replace(/\bln\s*\(/gi, "log(");

    return text.replace(/\s+/g, " ").trim();
  }

  function findEquality(text) {
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== "=") {
        continue;
      }

      const previous = text[i - 1];
      const next = text[i + 1];

      if (previous === "=" || previous === "!" || previous === "<" || previous === ">") {
        continue;
      }

      return { index: i, length: next === "=" ? 2 : 1 };
    }

    return null;
  }

  function splitEquation(text) {
    const equality = findEquality(text);

    if (!equality) {
      return { lhs: text, rhs: "0", hasEquals: false };
    }

    const remainder = text.slice(equality.index + equality.length);
    if (findEquality(remainder)) {
      throw new SolverError("Only one '=' is allowed in an equation.");
    }

    return {
      lhs: text.slice(0, equality.index),
      rhs: remainder,
      hasEquals: true,
    };
  }

  function cleanMessage(error) {
    let message = error && error.message ? error.message : String(error);
    message = message.replace(/^SyntaxError:\s*/, "");
    message = message.replace(/\s*\(char \d+\)\s*$/, "");
    return message.trim() || "Something went wrong.";
  }

  function parseExpression(text, label) {
    const name = label || "expression";
    const source = String(text == null ? "" : text);

    if (!source.trim()) {
      throw new SolverError("The " + name + " is empty.");
    }

    if (source.length > 500) {
      throw new SolverError("The " + name + " is too long (maximum 500 characters).");
    }

    try {
      return math.parse(source);
    } catch (error) {
      throw new SolverError("Could not parse the " + name + ": " + cleanMessage(error));
    }
  }

  function parseSide(text, label) {
    return parseExpression(text, label === "left side" ? "left side" : label && label.indexOf("side") >= 0 ? label : label || "expression");
  }

  function toTex(node) {
    try {
      return node.toTex();
    } catch (error) {
      return null;
    }
  }

  function transformChildren(node, angleMode) {
    if (node.type === "OperatorNode") {
      const args = node.args.map(function (arg) {
        return applyAngleMode(arg, angleMode);
      });
      return new math.OperatorNode(node.op, node.fn, args, node.implicit);
    }

    if (node.type === "ParenthesisNode") {
      return new math.ParenthesisNode(applyAngleMode(node.content, angleMode));
    }

    if (node.type === "FunctionNode") {
      const fn = node.fn.cloneDeep();
      const args = node.args.map(function (arg) {
        return applyAngleMode(arg, angleMode);
      });
      const rebuilt = new math.FunctionNode(fn, args);

      if (angleMode !== "deg") {
        return rebuilt;
      }

      if (args.length !== 1) {
        return rebuilt;
      }

      if (DIRECT_TRIG.has(fn.name)) {
        return new math.FunctionNode(fn, [
          new math.OperatorNode("*", "multiply", [args[0], math.parse(DEG_TO_RAD)]),
        ]);
      }

      if (INVERSE_TRIG.has(fn.name)) {
        return new math.OperatorNode("*", "multiply", [rebuilt, math.parse(RAD_TO_DEG)]);
      }

      return rebuilt;
    }

    return node.cloneDeep();
  }

  function applyAngleMode(node, angleMode) {
    if (!node) {
      return node;
    }

    if (angleMode !== "deg") {
      return node;
    }

    return transformChildren(node, angleMode);
  }

  function validateNode(node, allowedSymbols) {
    const errors = [];

    node.traverse(function (current, path, parent) {
      if (!ALLOWED_NODE_TYPES.has(current.type)) {
        errors.push("Unsupported syntax: " + current.type + ".");
        return;
      }

      if (current.type === "ConstantNode" && typeof current.value !== "number") {
        errors.push("Only numeric constants are supported.");
        return;
      }

      if (current.type === "SymbolNode") {
        const isFunctionName = parent && parent.type === "FunctionNode" && parent.fn === current;

        if (isFunctionName) {
          if (!ALLOWED_FUNCTIONS.includes(current.name)) {
            errors.push("Function '" + current.name + "' is not supported.");
          }
        } else if (!allowedSymbols.includes(current.name)) {
          if (current.name === "x") {
            errors.push("x is not defined in Evaluate mode. Press Tab to solve for x.");
          } else {
            errors.push("Unknown symbol '" + current.name + "'.");
          }
        }
        return;
      }

      if (current.type === "FunctionNode") {
        if (!current.fn || current.fn.type !== "SymbolNode") {
          errors.push("Unsupported function syntax.");
        } else if (!ALLOWED_FUNCTIONS.includes(current.fn.name)) {
          errors.push("Function '" + current.fn.name + "' is not supported.");
        }
        return;
      }

      if (current.type === "OperatorNode" && !ALLOWED_OPERATORS.has(current.op)) {
        errors.push("Operator '" + current.op + "' is not supported.");
      }
    });

    if (errors.length > 0) {
      throw new SolverError(errors[0]);
    }
  }

  function collectSymbolNames(node) {
    const names = new Set();

    node.traverse(function (current, path, parent) {
      if (current.type !== "SymbolNode") {
        return;
      }

      const isFunctionName = parent && parent.type === "FunctionNode" && parent.fn === current;
      if (!isFunctionName) {
        names.add(current.name);
      }
    });

    return names;
  }

  function safeNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : NaN;
    }

    if (math.isBigNumber && math.isBigNumber(value)) {
      return safeNumber(value.toNumber());
    }

    if (math.isFraction && math.isFraction(value)) {
      return safeNumber(value.valueOf());
    }

    if (math.isComplex && math.isComplex(value)) {
      return Math.abs(value.im) < 1e-12 ? value.re : NaN;
    }

    return NaN;
  }

  function makeEvaluator(node, variable, extraScope) {
    const compiled = node.compile();
    const name = variable || "x";

    return function (x) {
      const scope = Object.assign({}, extraScope || {});
      scope[name] = x;

      try {
        return safeNumber(compiled.evaluate(scope));
      } catch (error) {
        return NaN;
      }
    };
  }

  function makeDerivative(node, evaluate, variable) {
    const name = variable || "x";
    let compiled = null;

    try {
      compiled = math.derivative(node, name).compile();
    } catch (error) {
      compiled = null;
    }

    return function (x) {
      if (compiled) {
        try {
          const scope = {};
          scope[name] = x;
          const value = safeNumber(compiled.evaluate(scope));
          if (Number.isFinite(value)) {
            return value;
          }
        } catch (error) {
          // fall through to the numerical derivative
        }
      }

      const step = 1e-6 * Math.max(1, Math.abs(x));
      const before = evaluate(x - step);
      const after = evaluate(x + step);

      if (!Number.isFinite(before) || !Number.isFinite(after)) {
        return NaN;
      }

      return (after - before) / (2 * step);
    };
  }

  function bisect(fn, low, high, tolerance, maxIterations) {
    let a = low;
    let b = high;
    let fa = fn(a);
    let fb = fn(b);

    if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) {
      return null;
    }

    if (fa === 0) {
      return a;
    }

    if (fb === 0) {
      return b;
    }

    const iterations = maxIterations || 200;

    for (let i = 0; i < iterations && b - a > tolerance; i += 1) {
      const middle = (a + b) / 2;
      const fm = fn(middle);

      if (!Number.isFinite(fm)) {
        return null;
      }

      if (fm === 0) {
        return middle;
      }

      if (fa * fm < 0) {
        b = middle;
        fb = fm;
      } else {
        a = middle;
        fa = fm;
      }
    }

    return (a + b) / 2;
  }

  function minimizeAbsolute(evaluate, low, high, tolerance) {
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = low;
    let b = high;
    let c = b - ratio * (b - a);
    let d = a + ratio * (b - a);
    let fc = Math.abs(evaluate(c));
    let fd = Math.abs(evaluate(d));

    if (!Number.isFinite(fc) || !Number.isFinite(fd)) {
      return { x: (a + b) / 2, value: Math.abs(evaluate((a + b) / 2)) };
    }

    for (let i = 0; i < 200 && b - a > tolerance; i += 1) {
      if (fc < fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - ratio * (b - a);
        fc = Math.abs(evaluate(c));
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + ratio * (b - a);
        fd = Math.abs(evaluate(d));
      }

      if (!Number.isFinite(fc) || !Number.isFinite(fd)) {
        break;
      }
    }

    const x = (a + b) / 2;
    return { x: x, value: Math.abs(evaluate(x)) };
  }

  function isNearConstant(evaluate) {
    const probes = [-7.3, -1.1, 0, 0.7, 2.9, 11.2, 37.5];
    let first = null;
    let minimum = Infinity;
    let maximum = -Infinity;
    let count = 0;

    for (const x of probes) {
      const value = evaluate(x);

      if (!Number.isFinite(value)) {
        continue;
      }

      if (first === null) {
        first = value;
      }

      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      count += 1;
    }

    if (count < 3) {
      return { constant: false, value: NaN };
    }

    const scale = Math.max(1, Math.abs(minimum), Math.abs(maximum));

    return {
      constant: maximum - minimum <= 1e-10 * scale,
      value: first,
    };
  }

  function findRoots(evaluate, derivative, options) {
    const settings = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const { min, max, samples, tol, valueTol, mergeTol, maxRoots } = settings;
    const step = (max - min) / samples;
    const values = new Array(samples + 1);
    const slopes = new Array(samples + 1);

    for (let i = 0; i <= samples; i += 1) {
      const x = min + i * step;
      values[i] = evaluate(x);
      slopes[i] = derivative(x);
    }

    const candidates = [];

    function consider(value, residual, scale) {
      if (!Number.isFinite(value)) {
        return;
      }

      if (!Number.isFinite(residual)) {
        return;
      }

      const limit = valueTol + 1e-6 * Math.max(1, scale || 0);
      if (Math.abs(residual) <= limit) {
        candidates.push(value);
      }
    }

    for (let i = 0; i < samples; i += 1) {
      const a = min + i * step;
      const b = a + step;
      const fa = values[i];
      const fb = values[i + 1];

      if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
        continue;
      }

      if (fa === 0 || fb === 0) {
        continue;
      }

      if (fa * fb < 0) {
        const root = bisect(evaluate, a, b, tol);
        if (root === null) {
          continue;
        }

        const residual = evaluate(root);
        const scale = Math.max(Math.abs(fa), Math.abs(fb));
        consider(root, residual, scale);
      }
    }

    for (let i = 0; i < samples; i += 1) {
      const a = min + i * step;
      const b = a + step;
      const da = slopes[i];
      const db = slopes[i + 1];

      if (!Number.isFinite(da) || !Number.isFinite(db)) {
        continue;
      }

      if (da * db >= 0) {
        continue;
      }

      const minimum = minimizeAbsolute(evaluate, a, b, tol);

      if (Number.isFinite(minimum.value) && minimum.value <= 5e-10) {
        candidates.push(minimum.x);
      }
    }

    let hasZeroInterval = false;

    for (let i = 0; i <= samples; ) {
      if (values[i] !== 0) {
        i += 1;
        continue;
      }

      let end = i;
      while (end <= samples && values[end] === 0) {
        end += 1;
      }

      const left = i > 0 ? values[i - 1] : NaN;
      const right = end <= samples ? values[end] : NaN;
      const neighborScale = Math.max(
        Number.isFinite(left) ? Math.abs(left) : 0,
        Number.isFinite(right) ? Math.abs(right) : 0
      );

      if (neighborScale <= valueTol) {
        i = end;
        continue;
      }

      const firstZeroX = min + i * step;
      const lastZeroX = min + (end - 1) * step;
      const probeValue = evaluate(firstZeroX + (lastZeroX - firstZeroX) * 0.25);

      if (
        end - i >= 2 &&
        Number.isFinite(probeValue) &&
        Math.abs(probeValue) <= valueTol
      ) {
        hasZeroInterval = true;
        break;
      }

      for (let index = i; index < end; index += 1) {
        consider(min + index * step, values[index], neighborScale);
      }

      i = end;
    }

    candidates.sort(function (left, right) {
      return left - right;
    });

    const roots = [];

    for (const candidate of candidates) {
      if (!Number.isFinite(candidate)) {
        continue;
      }

      const previous = roots.length > 0 ? roots[roots.length - 1] : null;
      const threshold = mergeTol * Math.max(1, Math.abs(candidate));

      if (previous === null || Math.abs(candidate - previous) > threshold) {
        roots.push(candidate);
      }
    }

    const manyRoots = roots.length > maxRoots;
    let displayed = roots;

    if (manyRoots) {
      displayed = roots
        .slice()
        .sort(function (left, right) {
          return Math.abs(left) - Math.abs(right);
        })
        .slice(0, maxRoots)
        .sort(function (left, right) {
          return left - right;
        });
    }

    return {
      roots: displayed,
      manyRoots: manyRoots,
      hasZeroInterval: hasZeroInterval,
    };
  }

  function greatestCommonDivisor(a, b) {
    let left = Math.abs(a);
    let right = Math.abs(b);

    while (right) {
      const temp = right;
      right = left % right;
      left = temp;
    }

    return left || 1;
  }

  function findFraction(value) {
    if (!Number.isFinite(value)) {
      return null;
    }

    for (let denominator = 2; denominator <= 64; denominator += 1) {
      const numerator = Math.round(value * denominator);
      const difference = Math.abs(value - numerator / denominator);
      const tolerance = 1e-10 * Math.max(1, Math.abs(value));

      if (difference <= tolerance) {
        const divisor = greatestCommonDivisor(numerator, denominator);
        const reducedNumerator = numerator / divisor;
        const reducedDenominator = denominator / divisor;

        if (reducedDenominator === 1) {
          return String(reducedNumerator);
        }

        return reducedNumerator + "/" + reducedDenominator;
      }
    }

    return null;
  }

  function formatRoot(value) {
    const cleaned = Math.abs(value) < 1e-12 ? 0 : value;

    if (Number.isInteger(cleaned)) {
      return { value: value, text: String(cleaned), approximate: false };
    }

    const nearestInteger = Math.round(cleaned);
    const scale = Math.max(1, Math.abs(cleaned));

    if (Math.abs(cleaned - nearestInteger) <= 1e-10 * scale) {
      return { value: value, text: String(nearestInteger), approximate: false };
    }

    const fraction = findFraction(cleaned);
    if (fraction !== null) {
      return { value: value, text: fraction, approximate: false };
    }

    return {
      value: value,
      text: math.format(cleaned, { precision: 12 }),
      approximate: true,
    };
  }

  function formatValue(value) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return String(value);
    }

    try {
      return math.format(value, { precision: 14 });
    } catch (error) {
      return String(value);
    }
  }

  function errorResult(mode, error) {
    return {
      ok: false,
      mode: mode,
      status: "error",
      message: cleanMessage(error),
    };
  }

  function solveEquation(input, options) {
    try {
      const normalized = normalize(input);

      if (!normalized) {
        throw new SolverError("Type an equation to solve, for example x^2 - 4x + 4 = 0.");
      }

      const parts = splitEquation(normalized);
      const leftNode = parseSide(parts.lhs, "left side");
      const rightNode = parseSide(parts.rhs, "right side");
      const combined = new math.OperatorNode("-", "subtract", [leftNode, rightNode]);
      validateNode(combined, SOLVE_SYMBOLS);

      const settings = Object.assign({}, DEFAULT_OPTIONS, options || {});
      const working = applyAngleMode(combined, settings.angleMode);
      const equation = leftNode.toString() + " = " + rightNode.toString();
      const tex = toTex(leftNode) && toTex(rightNode)
        ? toTex(leftNode) + " = " + toTex(rightNode)
        : null;
      const evaluate = makeEvaluator(working, "x");
      const derivative = makeDerivative(working, evaluate, "x");
      const hasX = collectSymbolNames(working).has("x");
      const plotEvaluate = evaluate;

      if (!hasX) {
        let value = NaN;

        for (const probe of [0, 1, 2, -1]) {
          const result = evaluate(probe);
          if (Number.isFinite(result)) {
            value = result;
            break;
          }
        }

        if (!Number.isFinite(value)) {
          return {
            ok: true,
            mode: "solve",
            status: "out-of-domain",
            equation: equation,
            tex: tex,
            evaluate: plotEvaluate,
            message: "The expression is not defined for real numbers.",
            roots: [],
          };
        }

        if (Math.abs(value) <= settings.valueTol) {
          return {
            ok: true,
            mode: "solve",
            status: "infinite-solutions",
            equation: equation,
            tex: tex,
            evaluate: plotEvaluate,
            message: "Every real number is a solution.",
            roots: [],
          };
        }

        return {
          ok: true,
          mode: "solve",
          status: "no-solution",
          equation: equation,
          tex: tex,
          evaluate: plotEvaluate,
          message: "This equation has no solution.",
          roots: [],
        };
      }

      const constant = isNearConstant(evaluate);

      if (constant.constant) {
        if (Math.abs(constant.value) <= settings.valueTol) {
          return {
            ok: true,
            mode: "solve",
            status: "infinite-solutions",
            equation: equation,
            tex: tex,
            evaluate: plotEvaluate,
            message: "Every real number is a solution.",
            roots: [],
          };
        }

        return {
          ok: true,
          mode: "solve",
          status: "no-solution",
          equation: equation,
          tex: tex,
          evaluate: plotEvaluate,
          message: "This equation has no solution.",
          roots: [],
        };
      }

      const found = findRoots(evaluate, derivative, settings);
      const roots = found.roots.map(formatRoot);

      if (found.hasZeroInterval) {
        return {
          ok: true,
          mode: "solve",
          status: "infinite-solutions",
          equation: equation,
          tex: tex,
          evaluate: plotEvaluate,
          message: "Infinitely many solutions: the equation holds across a range of x values.",
          roots: [],
        };
      }

      if (roots.length === 0) {
        return {
          ok: true,
          mode: "solve",
          status: "no-real-roots",
          equation: equation,
          tex: tex,
          evaluate: plotEvaluate,
          message: "No real solutions found in [" + settings.min + ", " + settings.max + "].",
          roots: [],
          range: [settings.min, settings.max],
        };
      }

      return {
        ok: true,
        mode: "solve",
        status: "roots",
        equation: equation,
        tex: tex,
        evaluate: plotEvaluate,
        roots: roots,
        manyRoots: found.manyRoots,
        range: [settings.min, settings.max],
        message: found.manyRoots
          ? "Showing the first " + settings.maxRoots + " roots."
          : roots.length + (roots.length === 1 ? " solution." : " solutions."),
      };
    } catch (error) {
      return errorResult("solve", error);
    }
  }

  function evaluateExpression(input, options) {
    try {
      const normalized = normalize(input);

      if (!normalized) {
        throw new SolverError("Type an expression to evaluate, for example 2 + 3 * 4.");
      }

      if (findEquality(normalized)) {
        throw new SolverError("Evaluate mode takes an expression, not an equation. Press Tab to solve for x.");
      }

      const settings = Object.assign({}, DEFAULT_OPTIONS, options || {});
      const node = parseSide(normalized, "expression");
      validateNode(node, EVAL_SYMBOLS);
      const working = applyAngleMode(node, settings.angleMode);
      const names = collectSymbolNames(working);

      if (names.has("x")) {
        return {
          ok: true,
          mode: "evaluate",
          status: "function",
          expression: node.toString(),
          tex: toTex(node),
          normalized: normalized,
          value: null,
          text: "f(x)",
          variable: "x",
          evaluate: makeEvaluator(working, "x"),
        };
      }

      const value = working.evaluate({});

      return {
        ok: true,
        mode: "evaluate",
        status: "value",
        expression: node.toString(),
        tex: toTex(node),
        normalized: normalized,
        value: value,
        text: formatValue(value),
        variable: null,
        evaluate: null,
      };
    } catch (error) {
      return errorResult("evaluate", error);
    }
  }

  return {
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    SolverError: SolverError,
    ALLOWED_FUNCTIONS: ALLOWED_FUNCTIONS,
    normalize: normalize,
    splitEquation: splitEquation,
    findEquality: findEquality,
    parseExpression: parseExpression,
    validateNode: validateNode,
    collectSymbolNames: collectSymbolNames,
    cleanMessage: cleanMessage,
    makeEvaluator: makeEvaluator,
    makeDerivative: makeDerivative,
    applyAngleMode: applyAngleMode,
    toTex: toTex,
    safeNumber: safeNumber,
    findRoots: findRoots,
    formatRoot: formatRoot,
    formatValue: formatValue,
    solveEquation: solveEquation,
    evaluateExpression: evaluateExpression,
  };
});
