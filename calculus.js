(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./vendor/math.js"), require("./solver.js"));
  } else {
    root.Calculus = factory(root.math, root.EquationSolver);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (math, solver) {
  "use strict";

  const MAX_ORDER = 4;
  const SIMPSON_TOLERANCE = 1e-8;
  const SIMPSON_MAX_DEPTH = 20;
  const MAX_EVALUATIONS = 200000;
  const MAX_STEPS = 60;
  const MAX_STEP_TRACE = 80;

  function constant(value) {
    return new math.ConstantNode(value);
  }

  function symbol(name) {
    return new math.SymbolNode(name);
  }

  function fn(name, args) {
    return new math.FunctionNode(symbol(name), args);
  }

  function op(operator, name, args) {
    return new math.OperatorNode(operator, name, args);
  }

  function add(left, right) {
    return op("+", "add", [left, right]);
  }

  function subtract(left, right) {
    return op("-", "subtract", [left, right]);
  }

  function multiply(left, right) {
    return op("*", "multiply", [left, right]);
  }

  function divide(left, right) {
    return op("/", "divide", [left, right]);
  }

  function power(base, exponent) {
    return op("^", "pow", [base, exponent]);
  }

  function negate(value) {
    return op("-", "unaryMinus", [value]);
  }

  function product(nodes) {
    if (nodes.length === 0) {
      return constant(1);
    }

    if (nodes.length === 1) {
      return nodes[0];
    }

    return op("*", "multiply", nodes);
  }

  function simplifyNode(node) {
    try {
      return math.simplify(node);
    } catch (error) {
      return node;
    }
  }

  function safeEval(node, variable, value) {
    try {
      return solver.safeNumber(node.evaluate({ [variable]: value }));
    } catch (error) {
      return NaN;
    }
  }

  function containsSymbol(node, name) {
    return solver.collectSymbolNames(node).has(name);
  }

  function step(rule, expression, explanation) {
    return {
      rule: rule,
      expression: expression,
      explanation: explanation,
    };
  }

  function traceDifferentiate(node, variable) {
    function record(result, rule, explanation) {
      const simplified = simplifyNode(result);
      return {
        node: simplified,
        steps: [step(rule, simplified.toString(), explanation)],
      };
    }

    function combine(node, steps) {
      return { node: node, steps: steps };
    }

    function differentiate(current) {
      if (current.type === "ConstantNode") {
        return record(constant(0), "Constant rule", "The derivative of a constant is 0.");
      }

      if (current.type === "SymbolNode") {
        if (current.name === variable) {
          return record(constant(1), "Variable rule", "The derivative of " + variable + " with respect to " + variable + " is 1.");
        }

        return record(constant(0), "Constant rule", "'" + current.name + "' does not depend on " + variable + ", so its derivative is 0.");
      }

      if (current.type === "ParenthesisNode") {
        const inner = differentiate(current.content);
        return combine(inner.node, inner.steps);
      }

      if (current.type === "OperatorNode") {
        return differentiateOperator(current);
      }

      if (current.type === "FunctionNode") {
        return differentiateFunction(current);
      }

      throw new Error("Unsupported syntax in the step tracer: " + current.type + ".");
    }

    function differentiateOperator(current) {
      const name = current.fn;
      const args = current.args;

      if (name === "add" || name === "subtract" || name === "unaryMinus") {
        const parts = args.map(differentiate);
        const nodes = parts.map(function (part) {
          return part.node;
        });
        const steps = [];
        parts.forEach(function (part) {
          steps.push.apply(steps, part.steps);
        });
        const combined = name === "unaryMinus" ? negate(nodes[0]) : op(name === "add" ? "+" : "-", name, nodes);
        const label = name === "add" ? "Sum rule" : "Difference rule";
        const explanation = name === "add"
          ? "Differentiate each term: (f + g)' = f' + g'."
          : "Differentiate each side of the subtraction.";
        const result = record(combined, label, explanation);
        result.steps = steps.concat(result.steps);
        return result;
      }

      if (name === "multiply") {
        let left;
        let right;

        if (args.length === 2) {
          left = args[0];
          right = args[1];
        } else {
          left = product(args.slice(0, args.length - 1));
          right = args[args.length - 1];
        }

        const leftDerivative = differentiate(left);
        const rightDerivative = differentiate(right);
        const combined = add(
          multiply(leftDerivative.node, right),
          multiply(left, rightDerivative.node)
        );
        const result = record(combined, "Product rule", "Apply (fg)' = f'g + f g'.");
        result.steps = leftDerivative.steps.concat(rightDerivative.steps, result.steps);
        return result;
      }

      if (name === "divide") {
        const numerator = args[0];
        const denominator = args[1];
        const numeratorDerivative = differentiate(numerator);
        const denominatorDerivative = differentiate(denominator);
        const combined = divide(
          subtract(
            multiply(numeratorDerivative.node, denominator),
            multiply(numerator, denominatorDerivative.node)
          ),
          power(denominator, constant(2))
        );
        const result = record(combined, "Quotient rule", "Apply (f/g)' = (f'g - f g') / g^2.");
        result.steps = numeratorDerivative.steps.concat(denominatorDerivative.steps, result.steps);
        return result;
      }

      if (name === "pow") {
        const base = args[0];
        const exponent = args[1];
        const baseDepends = containsSymbol(base, variable);
        const exponentDepends = containsSymbol(exponent, variable);
        const baseDerivative = differentiate(base);
        const exponentDerivative = differentiate(exponent);

        if (!exponentDepends) {
          const combined = multiply(
            multiply(exponent, power(base, subtract(exponent, constant(1)))),
            baseDerivative.node
          );
          const result = record(combined, "Power rule", "Apply d/dx [u^n] = n u^(n-1) u'.");
          result.steps = baseDerivative.steps.concat(result.steps);
          return result;
        }

        if (!baseDepends) {
          const combined = multiply(
            multiply(current, fn("log", [base])),
            exponentDerivative.node
          );
          const result = record(combined, "Exponential rule", "Apply d/dx [a^u] = a^u ln(a) u'.");
          result.steps = exponentDerivative.steps.concat(result.steps);
          return result;
        }

        const combined = multiply(
          current,
          add(
            multiply(exponentDerivative.node, fn("log", [base])),
            divide(multiply(exponent, baseDerivative.node), base)
          )
        );
        const result = record(combined, "General power rule", "Apply logarithmic differentiation for u^v.");
        result.steps = baseDerivative.steps.concat(exponentDerivative.steps, result.steps);
        return result;
      }

      throw new Error("The step tracer does not support the operator '" + current.op + "'.");
    }

    function differentiateFunction(current) {
      const name = current.fn && current.fn.name;
      const argument = current.args[0];

      if (!argument || current.args.length !== 1) {
        throw new Error("The step tracer only supports single-argument functions.");
      }

      const inner = differentiate(argument);
      const u = argument;
      const du = inner.node;
      let combined;
      let rule;
      let explanation;

      switch (name) {
        case "sin":
          combined = multiply(fn("cos", [u]), du);
          rule = "Chain rule: sin";
          explanation = "d/dx sin(u) = cos(u) u'.";
          break;
        case "cos":
          combined = multiply(negate(fn("sin", [u])), du);
          rule = "Chain rule: cos";
          explanation = "d/dx cos(u) = -sin(u) u'.";
          break;
        case "tan":
          combined = multiply(power(fn("sec", [u]), constant(2)), du);
          rule = "Chain rule: tan";
          explanation = "d/dx tan(u) = sec^2(u) u'.";
          break;
        case "sec":
          combined = multiply(multiply(fn("sec", [u]), fn("tan", [u])), du);
          rule = "Chain rule: sec";
          explanation = "d/dx sec(u) = sec(u) tan(u) u'.";
          break;
        case "csc":
          combined = multiply(multiply(negate(fn("csc", [u])), fn("cot", [u])), du);
          rule = "Chain rule: csc";
          explanation = "d/dx csc(u) = -csc(u) cot(u) u'.";
          break;
        case "cot":
          combined = multiply(negate(power(fn("csc", [u]), constant(2))), du);
          rule = "Chain rule: cot";
          explanation = "d/dx cot(u) = -csc^2(u) u'.";
          break;
        case "asin":
          combined = divide(du, fn("sqrt", [subtract(constant(1), power(u, constant(2)))]));
          rule = "Chain rule: asin";
          explanation = "d/dx asin(u) = u' / sqrt(1 - u^2).";
          break;
        case "acos":
          combined = negate(divide(du, fn("sqrt", [subtract(constant(1), power(u, constant(2)))])));
          rule = "Chain rule: acos";
          explanation = "d/dx acos(u) = -u' / sqrt(1 - u^2).";
          break;
        case "atan":
          combined = divide(du, add(constant(1), power(u, constant(2))));
          rule = "Chain rule: atan";
          explanation = "d/dx atan(u) = u' / (1 + u^2).";
          break;
        case "sinh":
          combined = multiply(fn("cosh", [u]), du);
          rule = "Chain rule: sinh";
          explanation = "d/dx sinh(u) = cosh(u) u'.";
          break;
        case "cosh":
          combined = multiply(fn("sinh", [u]), du);
          rule = "Chain rule: cosh";
          explanation = "d/dx cosh(u) = sinh(u) u'.";
          break;
        case "tanh":
          combined = multiply(power(fn("sech", [u]), constant(2)), du);
          rule = "Chain rule: tanh";
          explanation = "d/dx tanh(u) = sech^2(u) u'.";
          break;
        case "asinh":
          combined = divide(du, fn("sqrt", [add(power(u, constant(2)), constant(1))]));
          rule = "Chain rule: asinh";
          explanation = "d/dx asinh(u) = u' / sqrt(u^2 + 1).";
          break;
        case "acosh":
          combined = divide(du, fn("sqrt", [subtract(power(u, constant(2)), constant(1))]));
          rule = "Chain rule: acosh";
          explanation = "d/dx acosh(u) = u' / sqrt(u^2 - 1).";
          break;
        case "atanh":
          combined = divide(du, subtract(constant(1), power(u, constant(2))));
          rule = "Chain rule: atanh";
          explanation = "d/dx atanh(u) = u' / (1 - u^2).";
          break;
        case "exp":
          combined = multiply(fn("exp", [u]), du);
          rule = "Chain rule: exp";
          explanation = "d/dx e^u = e^u u'.";
          break;
        case "log":
          combined = divide(du, u);
          rule = "Chain rule: log";
          explanation = "d/dx ln(u) = u' / u.";
          break;
        case "log10":
          combined = divide(du, multiply(u, fn("log", [constant(10)])));
          rule = "Chain rule: log10";
          explanation = "d/dx log10(u) = u' / (u ln 10).";
          break;
        case "log2":
          combined = divide(du, multiply(u, fn("log", [constant(2)])));
          rule = "Chain rule: log2";
          explanation = "d/dx log2(u) = u' / (u ln 2).";
          break;
        case "sqrt":
          combined = divide(du, multiply(constant(2), fn("sqrt", [u])));
          rule = "Chain rule: sqrt";
          explanation = "d/dx sqrt(u) = u' / (2 sqrt(u)).";
          break;
        case "cbrt":
          combined = divide(du, multiply(constant(3), power(fn("cbrt", [u]), constant(2))));
          rule = "Chain rule: cbrt";
          explanation = "d/dx cbrt(u) = u' / (3 cbrt(u)^2).";
          break;
        case "abs":
          combined = multiply(divide(u, fn("abs", [u])), du);
          rule = "Chain rule: abs";
          explanation = "d/dx |u| = u u' / |u|, for u not equal to 0.";
          break;
        default:
          throw new Error("The step tracer does not support the function '" + name + "'.");
      }

      const result = record(combined, rule, explanation);
      result.steps = inner.steps.concat(result.steps);
      return result;
    }

    const result = differentiate(node);
    const steps = result.steps.slice(0, MAX_STEP_TRACE);

    return {
      node: result.node,
      steps: steps,
      truncated: result.steps.length > MAX_STEP_TRACE,
    };
  }

  function extractExpression(input) {
    const normalized = solver.normalize(input);

    if (!normalized) {
      throw new solver.SolverError("Type an expression to differentiate.");
    }

    const parts = solver.splitEquation(normalized);

    if (!parts.hasEquals) {
      return { text: normalized, normalized: normalized };
    }

    const left = parts.lhs.replace(/\s+/g, "");

    if (!/^(?:[a-zA-Z]\w*\s*\(\s*[a-zA-Z]\w*\s*\)|[a-zA-Z]\w*)$/.test(left)) {
      throw new solver.SolverError("Use f(x) = expression or y = expression before what you want to differentiate.");
    }

    return { text: parts.rhs, normalized: normalized };
  }

  function parseVariable(value, fallback) {
    const variable = String(value == null ? "" : value).trim() || fallback || "x";

    if (!/^[a-zA-Z]\w*$/.test(variable)) {
      throw new solver.SolverError("The variable must be a single letter or identifier.");
    }

    if (variable === "e" || variable === "pi" || variable === "i" || variable === "Infinity" || variable === "NaN") {
      throw new solver.SolverError("'" + variable + "' is a reserved constant and cannot be the variable.");
    }

    if (solver.ALLOWED_FUNCTIONS.indexOf(variable) >= 0) {
      throw new solver.SolverError("'" + variable + "' is a function name and cannot be the variable.");
    }

    return variable;
  }

  function parseOrder(value) {
    const order = Math.round(Number(String(value == null ? "" : value).trim() || "1"));

    if (!Number.isFinite(order) || order < 1) {
      throw new solver.SolverError("The derivative order must be between 1 and " + MAX_ORDER + ".");
    }

    return Math.min(order, MAX_ORDER);
  }

  function parseLimit(value, label) {
    const text = String(value == null ? "" : value).trim();

    if (!text) {
      throw new solver.SolverError("Enter a " + label + " limit.");
    }

    const node = solver.parseExpression(solver.normalize(text), label + " limit");
    solver.validateNode(node, ["pi", "e"]);
    const result = solver.safeNumber(node.evaluate({}));

    if (!Number.isFinite(result)) {
      throw new solver.SolverError("The " + label + " limit must be a finite real number.");
    }

    return result;
  }

  function limitDisplay(value, numeric) {
    const text = String(value == null ? "" : value).trim();

    if (!text) {
      return solver.formatValue(numeric);
    }

    return text.replace(/\bpi\b/gi, "π").replace(/\*/g, "·");
  }

  function limitTex(value, numeric) {
    const text = String(value == null ? "" : value).trim();

    if (!text) {
      return String(numeric);
    }

    try {
      const node = solver.parseExpression(solver.normalize(text), "limit");
      return solver.toTex(node) || String(numeric);
    } catch (error) {
      return String(numeric);
    }
  }

  function differentiate(input, options) {
    try {
      const settings = options || {};
      const variable = parseVariable(settings.variable, "x");
      const order = parseOrder(settings.order);
      const angleMode = settings.angleMode === "deg" ? "deg" : "rad";
      const extracted = extractExpression(input);
      const node = solver.parseExpression(extracted.text, "expression");
      solver.validateNode(node, [variable, "pi", "e"]);

      const working = solver.applyAngleMode(node, angleMode);
      const evaluateOriginal = solver.makeEvaluator(working, variable);
      const notes = [];
      const pointText = String(settings.point == null ? "" : settings.point).trim();
      let point = null;

      if (pointText) {
        const pointNode = solver.parseExpression(solver.normalize(pointText), "evaluation point");
        solver.validateNode(pointNode, ["pi", "e"]);
        point = solver.safeNumber(pointNode.evaluate({}));

        if (!Number.isFinite(point)) {
          throw new solver.SolverError("The evaluation point must be a finite real number.");
        }
      }

      function numericDerivativeAt(x, depth) {
        const level = depth == null ? order : depth;

        if (level <= 0) {
          return evaluateOriginal(x);
        }

        const step = 1e-5 * Math.max(1, Math.abs(x));
        const before = numericDerivativeAt(x - step, level - 1);
        const after = numericDerivativeAt(x + step, level - 1);

        return Number.isFinite(before) && Number.isFinite(after) ? (after - before) / (2 * step) : NaN;
      }

      let simplified = null;
      let symbolic = true;

      try {
        let current = working;

        for (let i = 0; i < order; i += 1) {
          current = math.derivative(current, variable);
        }

        simplified = simplifyNode(current);
      } catch (error) {
        symbolic = false;
        notes.push("Symbolic differentiation is not available for this expression.");
      }

      let traced = null;

      if (symbolic) {
        try {
          let traceNode = working;
          const allSteps = [];

          for (let i = 0; i < order; i += 1) {
            const trace = traceDifferentiate(traceNode, variable);
            allSteps.push.apply(allSteps, trace.steps);
            if (trace.truncated) {
              notes.push("The step trace was truncated after " + MAX_STEP_TRACE + " steps.");
            }
            traceNode = math.derivative(traceNode, variable);
          }

          traced = allSteps;
        } catch (error) {
          notes.push("Detailed steps are not available for this expression; showing the final derivative only.");
        }
      }

      if (!symbolic) {
        if (!pointText) {
          throw new solver.SolverError(
            "A symbolic derivative is not available for this expression. Add an evaluation point to get a numeric derivative."
          );
        }

        const numericValue = numericDerivativeAt(point);

        if (!Number.isFinite(numericValue)) {
          throw new solver.SolverError("A numeric derivative could not be computed at that point.");
        }

        notes.push("The value was computed with a central-difference approximation.");

        return {
          ok: true,
          mode: "derivative",
          status: "numeric",
          input: extracted.normalized,
          expression: node.toString(),
          tex: solver.toTex(node),
          variable: variable,
          order: order,
          angleMode: angleMode,
          derivative: "numeric derivative",
          derivativeTex: null,
          point: pointText,
          value: numericValue,
          valueText: solver.formatValue(numericValue),
          steps: null,
          notes: notes,
          evaluateOriginal: evaluateOriginal,
          evaluateDerivative: function (x) {
            return numericDerivativeAt(x);
          },
        };
      }

      let value = null;
      let valueText = null;

      if (pointText) {
        value = safeEval(simplified, variable, point);

        if (!Number.isFinite(value)) {
          value = numericDerivativeAt(point);

          if (Number.isFinite(value)) {
            notes.push("The symbolic derivative is undefined at that point, so the value is a numeric estimate.");
          }
        }

        if (Number.isFinite(value)) {
          valueText = solver.formatValue(value);
        } else {
          notes.push("The derivative could not be evaluated at that point.");
        }
      }

      return {
        ok: true,
        mode: "derivative",
        status: "value",
        input: extracted.normalized,
        expression: node.toString(),
        tex: solver.toTex(node),
        variable: variable,
        order: order,
        angleMode: angleMode,
        derivative: simplified.toString(),
        derivativeTex: solver.toTex(simplified),
        point: pointText || null,
        value: value,
        valueText: valueText,
        steps: traced,
        notes: notes,
        evaluateOriginal: evaluateOriginal,
        evaluateDerivative: solver.makeEvaluator(simplified, variable),
      };
    } catch (error) {
      return {
        ok: false,
        mode: "derivative",
        status: "error",
        message: solver.cleanMessage(error),
      };
    }
  }

  function cleanIntegrand(input, variable) {
    let text = solver.normalize(input);
    text = text.replace(/^\s*∫\s*/, "");

    if (variable && /^[a-zA-Z]\w*$/.test(variable)) {
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp("\\s*d\\s*" + escaped + "\\s*$"), "");
    } else {
      text = text.replace(/\s*d\s*[a-zA-Z]\w*\s*$/, "");
    }

    return text.trim();
  }

  function integrate(input, options) {
    try {
      const settings = options || {};
      const variable = parseVariable(settings.variable, "x");
      const angleMode = settings.angleMode === "deg" ? "deg" : "rad";
      const text = cleanIntegrand(input, variable);

      if (!text) {
        throw new solver.SolverError("Type an integrand to integrate.");
      }

      const node = solver.parseExpression(text, "integrand");
      solver.validateNode(node, [variable, "pi", "e"]);
      const working = solver.applyAngleMode(node, angleMode);
      const evaluate = solver.makeEvaluator(working, variable);

      let lower = parseLimit(settings.lower, "lower");
      let upper = parseLimit(settings.upper, "upper");
      let lowerText = limitDisplay(settings.lower, lower);
      let upperText = limitDisplay(settings.upper, upper);
      let lowerTex = limitTex(settings.lower, lower);
      let upperTex = limitTex(settings.upper, upper);
      let reversed = false;
      const warnings = [];

      if (lower > upper) {
        const swap = lower;
        lower = upper;
        upper = swap;
        const swapText = lowerText;
        lowerText = upperText;
        upperText = swapText;
        const swapTex = lowerTex;
        lowerTex = upperTex;
        upperTex = swapTex;
        reversed = true;
      }

      if (lower === upper) {
        return {
          ok: true,
          mode: "integral",
          status: "value",
          expression: node.toString(),
          tex: solver.toTex(node),
          variable: variable,
          lower: lower,
          upper: upper,
          lowerText: lowerText,
          upperText: upperText,
          lowerTex: lowerTex,
          upperTex: upperTex,
          value: 0,
          text: "0",
          steps: [],
          warnings: ["The limits are equal, so the definite integral is 0."],
          evaluations: 0,
          evaluate: evaluate,
        };
      }

      const probes = 256;
      let maximum = 0;
      let maximumIndex = 0;
      const samples = [];

      for (let i = 0; i <= probes; i += 1) {
        const x = lower + (upper - lower) * (i / probes);
        const y = evaluate(x);

        if (!Number.isFinite(y)) {
          throw new solver.SolverError("The integrand is undefined at x = " + solver.formatValue(x) + " inside the interval.");
        }

        samples.push(y);

        if (Math.abs(y) > maximum) {
          maximum = Math.abs(y);
          maximumIndex = i;
        }
      }

      const sortedMagnitudes = samples
        .map(function (value) {
          return Math.abs(value);
        })
        .sort(function (left, right) {
          return left - right;
        });
      const median = sortedMagnitudes.length > 0
        ? sortedMagnitudes[Math.floor(sortedMagnitudes.length / 2)]
        : 0;
      const spikeThreshold = Math.max(1, 20 * median);

      for (let i = 1; i < samples.length; i += 1) {
        const previous = samples[i - 1];
        const current = samples[i];

        if (
          previous !== 0 &&
          current !== 0 &&
          previous * current < 0 &&
          Math.abs(previous) > spikeThreshold &&
          Math.abs(current) > spikeThreshold
        ) {
          throw new solver.SolverError("The integrand appears to have a discontinuity or vertical asymptote inside the interval.");
        }
      }

      if (maximum > 1e12) {
        warnings.push("The integrand grows very large on this interval; the result may be inaccurate.");
      } else if (
        maximumIndex > 0 &&
        maximumIndex < samples.length - 1 &&
        maximum > 1e4 * Math.max(1, median)
      ) {
        warnings.push("The integrand has a large interior spike; the result may be inaccurate.");
      }

      let evaluations = 0;
      const steps = [];
      const whole = simpson(evaluate, lower, upper);

      if (!Number.isFinite(whole)) {
        throw new solver.SolverError("The integrand produced a non-finite estimate; the integral may not converge.");
      }

      evaluations += 3;
      steps.push({
        depth: 0,
        a: lower,
        b: upper,
        estimate: whole,
        error: null,
        evaluations: evaluations,
      });

      function simpsonAt(a, b, fa, fm, fb) {
        return ((b - a) / 6) * (fa + 4 * fm + fb);
      }

      function recurse(a, b, fa, fm, fb, wholeEstimate, epsilon, depth) {
        const middle = (a + b) / 2;
        const leftMiddle = (a + middle) / 2;
        const rightMiddle = (middle + b) / 2;
        const fLeftMiddle = evaluate(leftMiddle);
        const fRightMiddle = evaluate(rightMiddle);
        evaluations += 2;

        if (evaluations > MAX_EVALUATIONS) {
          throw new solver.SolverError("The integral needs too many evaluations. Try a narrower interval.");
        }

        if (!Number.isFinite(fLeftMiddle) || !Number.isFinite(fRightMiddle)) {
          throw new solver.SolverError("The integrand is undefined inside the interval.");
        }

        const left = simpsonAt(a, middle, fa, fLeftMiddle, fm);
        const right = simpsonAt(middle, b, fm, fRightMiddle, fb);
        const delta = left + right - wholeEstimate;
        const estimate = left + right + delta / 15;
        const error = Math.abs(delta) / 15;

        if (!Number.isFinite(estimate) || !Number.isFinite(error)) {
          throw new solver.SolverError("The integral produced a non-finite estimate; the function may not be integrable on this interval.");
        }

        if (depth <= 0 || Math.abs(delta) <= 15 * epsilon) {
          if (steps.length < MAX_STEPS) {
            steps.push({
              depth: depth,
              a: a,
              b: b,
              estimate: estimate,
              error: error,
              evaluations: evaluations,
            });
          }

          return { value: estimate, error: error };
        }

        const leftResult = recurse(a, middle, fa, fLeftMiddle, fm, left, epsilon / 2, depth - 1);
        const rightResult = recurse(middle, b, fm, fRightMiddle, fb, right, epsilon / 2, depth - 1);

        return {
          value: leftResult.value + rightResult.value,
          error: leftResult.error + rightResult.error,
        };
      }

      const result = recurse(lower, upper, evaluate(lower), evaluate((lower + upper) / 2), evaluate(upper), whole, SIMPSON_TOLERANCE, SIMPSON_MAX_DEPTH);
      evaluations += 3;
      const value = reversed ? -result.value : result.value;

      if (!Number.isFinite(value)) {
        throw new solver.SolverError("The integral did not produce a finite result.");
      }

      const finalValue = Math.abs(value) < 1e-14 ? 0 : value;

      if (
        Number.isFinite(result.error) &&
        result.error > Math.max(1e-6, Math.abs(finalValue) * 1e-4)
      ) {
        warnings.push("The estimated integration error is large; the result may be inaccurate.");
      }

      if (reversed) {
        warnings.push("The limits were reversed, so the sign of the result was flipped.");
      }

      steps.push({
        depth: 0,
        a: lower,
        b: upper,
        estimate: finalValue,
        error: result.error,
        evaluations: evaluations,
        final: true,
      });

      return {
        ok: true,
        mode: "integral",
        status: "value",
        expression: node.toString(),
        tex: solver.toTex(node),
        variable: variable,
        lower: lower,
        upper: upper,
        lowerText: lowerText,
        upperText: upperText,
        lowerTex: lowerTex,
        upperTex: upperTex,
        reversed: reversed,
        value: finalValue,
        text: solver.formatValue(finalValue),
        errorEstimate: result.error,
        steps: steps,
        warnings: warnings,
        evaluations: evaluations,
        evaluate: evaluate,
      };
    } catch (error) {
      return {
        ok: false,
        mode: "integral",
        status: "error",
        message: solver.cleanMessage(error),
      };
    }
  }

  function simpson(evaluate, a, b) {
    const middle = (a + b) / 2;
    return ((b - a) / 6) * (evaluate(a) + 4 * evaluate(middle) + evaluate(b));
  }

  return {
    MAX_ORDER: MAX_ORDER,
    differentiate: differentiate,
    integrate: integrate,
    cleanIntegrand: cleanIntegrand,
    traceDifferentiate: traceDifferentiate,
  };
});
