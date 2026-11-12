(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./solver.js"),
      require("./calculus.js"),
      require("./plot.js"),
      require("./palette.js"),
      require("./graph.js"),
      null
    );
  } else {
    root.CalculatorUI = factory(
      root.EquationSolver,
      root.Calculus,
      root.Plot,
      root.FunctionPalette,
      root.GraphWorkspace,
      root
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (solver, calculus, plot, paletteLib, graphLib, root) {
  "use strict";

  const MODES = ["evaluate", "solve", "derivative", "integral", "graph"];
  const HISTORY_KEY = "advanced-calculator-history";
  const ANGLE_KEY = "advanced-calculator-angle";
  const GRAPH_KEY = "advanced-calculator-graph";
  const MAX_HISTORY = 50;
  const MAX_STORED_TEXT = 500;

  const LABELS = {
    evaluate: "Expression",
    solve: "Equation",
    derivative: "Function",
    integral: "Integrand",
    graph: "Expression",
  };

  const PLACEHOLDERS = {
    evaluate: "2 + 3 * 4",
    solve: "x^2 - 4x + 4 = 0",
    derivative: "x^3 - 3x",
    integral: "x^2",
  };

  const HINTS = {
    evaluate: "Type a constant expression to evaluate.",
    solve: "Type an equation to solve. A missing '= 0' is assumed.",
    derivative: "Type a function such as x^3 - 3x, f(x) = x^2, or y = sin(x).",
    integral: "Type an integrand and choose the lower and upper limits.",
    graph: "Add one or more expressions to graph.",
  };

  const EXAMPLES = {
    evaluate: [
      { label: "sin(pi/4)", expression: "sin(pi/4)" },
      { label: "ln(e^3)", expression: "ln(e^3)" },
      { label: "log10(1000)", expression: "log10(1000)" },
      { label: "2+3*4", expression: "2+3*4" },
    ],
    solve: [
      { label: "x^2-4x+4=0", expression: "x^2-4x+4=0" },
      { label: "sin(x)=0.5", expression: "sin(x)=0.5" },
      { label: "x^3-x=0", expression: "x^3-x=0" },
    ],
    derivative: [
      { label: "x^3-3x", expression: "x^3-3x" },
      { label: "sin(x)*e^x", expression: "sin(x)*e^x" },
      { label: "ln(x)", expression: "ln(x)" },
    ],
    integral: [
      { label: "\u222b\u2080\u00b9 x\u00b2 dx", expression: "x^2", lower: "0", upper: "1" },
      { label: "\u222b\u2080^\u03c0 sin(x) dx", expression: "sin(x)", lower: "0", upper: "pi" },
      { label: "\u222b\u2081^e 1/x dx", expression: "1/x", lower: "1", upper: "e" },
    ],
    graph: [
      { label: "x^2 - 4", expression: "x^2 - 4" },
      { label: "sin(x)", expression: "sin(x)" },
      { label: "x^3 - 3x", expression: "x^3 - 3x" },
      { label: "1/x", expression: "1/x" },
    ],
  };

  function cycleMode(mode, direction) {
    const index = MODES.indexOf(mode);
    const start = index < 0 ? 0 : index;
    const delta = direction === -1 || direction === "back" ? -1 : 1;
    return MODES[(start + delta + MODES.length) % MODES.length];
  }

  function storedText(value) {
    return typeof value === "string" ? value.slice(0, MAX_STORED_TEXT) : "";
  }

  function sanitizeHistoryInputs(mode, inputs) {
    const source = inputs && typeof inputs === "object" ? inputs : {};
    const result = { expression: storedText(source.expression) };

    if (mode === "derivative") {
      result.variable = storedText(source.variable) || "x";
      result.order = /^[1-4]$/.test(source.order) ? source.order : "1";
      result.point = storedText(source.point);
    } else if (mode === "integral") {
      result.variable = storedText(source.variable) || "x";
      result.lower = storedText(source.lower);
      result.upper = storedText(source.upper);
    }

    return result;
  }

  function sanitizeHistoryEntry(entry) {
    if (
      !entry ||
      MODES.indexOf(entry.mode) < 0 ||
      !entry.inputs ||
      typeof entry.inputs !== "object" ||
      typeof entry.summary !== "string"
    ) {
      return null;
    }

    return {
      mode: entry.mode,
      inputs: sanitizeHistoryInputs(entry.mode, entry.inputs),
      angleMode: entry.angleMode === "deg" ? "deg" : "rad",
      summary: entry.summary.slice(0, MAX_STORED_TEXT),
      timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : 0,
    };
  }

  function createHistoryStore(storageKey, storage) {
    const key = storageKey || HISTORY_KEY;
    let backend = storage || null;

    if (!backend && root) {
      try {
        backend = root.localStorage || null;
      } catch (error) {
        backend = null;
      }
    }

    let items = [];

    function load() {
      if (!backend) {
        items = [];
        return items;
      }

      try {
        const raw = backend.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        items = Array.isArray(parsed)
          ? parsed
              .map(sanitizeHistoryEntry)
              .filter(function (entry) {
                return entry !== null;
              })
              .slice(0, MAX_HISTORY)
          : [];
      } catch (error) {
        items = [];
      }

      return items;
    }

    function save() {
      if (!backend) {
        return;
      }

      try {
        backend.setItem(key, JSON.stringify(items));
      } catch (error) {
        // storage may be full or blocked
      }
    }

    function list() {
      return items.slice();
    }

    function add(entry) {
      const safeEntry = sanitizeHistoryEntry(entry);

      if (!safeEntry) {
        return;
      }

      const last = items[0];

      if (
        last &&
        last.mode === safeEntry.mode &&
        last.summary === safeEntry.summary &&
        JSON.stringify(last.inputs) === JSON.stringify(safeEntry.inputs)
      ) {
        return;
      }

      items.unshift(safeEntry);

      if (items.length > MAX_HISTORY) {
        items = items.slice(0, MAX_HISTORY);
      }

      save();
    }

    function clear() {
      items = [];
      save();
    }

    return {
      load: load,
      list: list,
      add: add,
      clear: clear,
      save: save,
    };
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    try {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    }
  }

  function escapeTexNumber(value) {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return String(value);
  }

  function buildIntegralTex(result) {
    const lowerTex = result.lowerTex || escapeTexNumber(result.lower);
    const upperTex = result.upperTex || escapeTexNumber(result.upper);
    return "\\int_{" + lowerTex + "}^{" + upperTex + "} \\left[" +
      (result.tex || result.expression) + "\\right]\\, d" + result.variable +
      " = " + escapeTexNumber(result.value);
  }

  function buildIntegralPlotOptions(result) {
    return {
      curveLabel: "f(x)",
      xMin: result.lower,
      xMax: result.upper,
      area: {
        from: result.lower,
        to: result.upper,
        fromLabel: result.lowerText,
        toLabel: result.upperText,
        evaluate: result.evaluate,
        color: "rgba(255, 159, 10, 0.22)",
        label: "area",
      },
    };
  }

  function init() {
    const doc = root && root.document;

    if (!doc || !solver || !calculus || !plot || !paletteLib || !graphLib) {
      return null;
    }

    const elements = {
      expression: doc.getElementById("expression"),
      expressionLabel: doc.getElementById("expression-label"),
      status: doc.getElementById("status"),
      results: doc.getElementById("results"),
      panel: doc.getElementById("panel"),
      preview: doc.getElementById("preview"),
      tabs: Array.from(doc.querySelectorAll(".tab")),
      derivativeOptions: doc.getElementById("derivative-options"),
      integralOptions: doc.getElementById("integral-options"),
      derivativeVariable: doc.getElementById("derivative-variable"),
      derivativeOrder: doc.getElementById("derivative-order"),
      derivativePoint: doc.getElementById("derivative-point"),
      integralVariable: doc.getElementById("integral-variable"),
      integralLower: doc.getElementById("integral-lower"),
      integralUpper: doc.getElementById("integral-upper"),
      angleButtons: Array.from(doc.querySelectorAll(".angle-button")),
      runButton: doc.getElementById("run-button"),
      graphCard: doc.getElementById("graph-card"),
      graph: doc.getElementById("graph"),
      graphSummary: doc.getElementById("graph-summary"),
      graphReset: doc.getElementById("graph-reset"),
      graphReadout: doc.getElementById("graph-readout"),
      graphWorkspace: doc.getElementById("graph-workspace"),
      graphMain: doc.getElementById("graph-main"),
      graphExpressionList: doc.getElementById("graph-expression-list"),
      graphEmptyHint: doc.getElementById("graph-empty-hint"),
      graphAdd: doc.getElementById("graph-add"),
      graphFit: doc.getElementById("graph-fit"),
      graphPois: doc.getElementById("graph-pois"),
      graphStatus: doc.getElementById("graph-status"),
      graphMainReadout: doc.getElementById("graph-main-readout"),
      graphSliders: doc.getElementById("graph-sliders"),
      stepsCard: doc.getElementById("steps-card"),
      stepsToggle: doc.getElementById("steps-toggle"),
      steps: doc.getElementById("steps"),
      examples: doc.getElementById("examples"),
      historyList: doc.getElementById("history"),
      historyEmpty: doc.getElementById("history-empty"),
      historyClear: doc.getElementById("history-clear"),
    };

    if (!elements.expression || !elements.status || !elements.results) {
      return null;
    }

    const state = {
      mode: "evaluate",
      angleMode: "rad",
      inputs: {
        evaluate: { expression: "" },
        solve: { expression: "" },
        derivative: { expression: "", variable: "x", order: "1", point: "" },
        integral: { expression: "", variable: "x", lower: "0", upper: "1" },
        graph: { expressions: [] },
      },
      lastPlot: null,
      lastPlotMode: null,
    };

    let debounceTimer = null;
    let graphController = null;
    let graphWorkspace = null;
    let graphSaveEnabled = false;
    let history = createHistoryStore(HISTORY_KEY, null);

    function storageValue(key, fallback) {
      try {
        return (root.localStorage && root.localStorage.getItem(key)) || fallback;
      } catch (error) {
        return fallback;
      }
    }

    function storageSet(key, value) {
      try {
        if (root.localStorage) {
          root.localStorage.setItem(key, value);
        }
      } catch (error) {
        // ignore storage failures
      }
    }

    state.angleMode = storageValue(ANGLE_KEY, "rad") === "deg" ? "deg" : "rad";

    function setStatus(text, isError) {
      elements.status.replaceChildren();

      if (!text) {
        elements.status.classList.remove("is-error");
        return;
      }

      elements.status.classList.toggle("is-error", Boolean(isError));
      elements.status.textContent = text;
    }

    function clearResults() {
      elements.results.replaceChildren();
    }

    function updateGraphReadout(info) {
      if (!elements.graphReadout) {
        return;
      }

      if (info && info.trace) {
        elements.graphReadout.textContent =
          (info.trace.label ? info.trace.label + " " : "") +
          "(" + plot.formatNumber(info.trace.x) + ", " + plot.formatNumber(info.trace.y) + ")";
      } else {
        elements.graphReadout.textContent = "";
      }
    }

    function ensureGraphController() {
      if (graphController || !elements.graph || !graphLib) {
        return graphController;
      }

      graphController = graphLib.createViewportController({
        canvas: elements.graph,
        onChange: updateGraphReadout,
      });

      if (elements.graphReset) {
        elements.graphReset.addEventListener("click", function () {
          if (graphController) {
            graphController.fit();
          }

          if (elements.expression && elements.expression.focus) {
            elements.expression.focus();
          }
        });
      }

      return graphController;
    }

    function ensureGraphWorkspace() {
      if (graphWorkspace || !graphLib || !doc) {
        return graphWorkspace;
      }

      graphWorkspace = graphLib.createGraphWorkspace({
        document: doc,
        canvas: elements.graphMain,
        list: elements.graphExpressionList,
        empty: elements.graphEmptyHint,
        status: elements.graphStatus,
        readout: elements.graphMainReadout,
        addButton: elements.graphAdd,
        fitButton: elements.graphFit,
        resetButton: null,
        poiToggle: elements.graphPois,
        sliders: elements.graphSliders,
        angleMode: state.angleMode,
        onChange: function (saved) {
          if (!graphSaveEnabled) {
            return;
          }

          try {
            storageSet(GRAPH_KEY, JSON.stringify(saved));
          } catch (error) {
            // ignore storage failures
          }
        },
      });

      return graphWorkspace;
    }

    function hideGraph() {
      state.lastPlot = null;
      state.lastPlotMode = null;

      if (graphController) {
        graphController.setModel(null);
      }

      elements.graphCard.hidden = true;
      elements.graphSummary.textContent = "";
      updateGraphReadout(null);
    }

    function hideSteps() {
      elements.stepsCard.hidden = true;
      elements.steps.replaceChildren();
      elements.steps.hidden = true;
      elements.stepsToggle.setAttribute("aria-expanded", "false");
    }

    function addMessage(text, className) {
      const element = doc.createElement("p");
      element.className = className || "message";
      element.textContent = text;
      elements.results.appendChild(element);
      return element;
    }

    function renderTex(element, tex, fallback, displayMode) {
      if (tex && root.katex) {
        try {
          root.katex.render(tex, element, {
            throwOnError: false,
            displayMode: Boolean(displayMode),
            strict: false,
          });
          return true;
        } catch (error) {
          // fall back to plain text
        }
      }

      element.textContent = fallback || "";
      return false;
    }

    function createCard(label) {
      const card = doc.createElement("div");
      card.className = "result-card";
      const heading = doc.createElement("div");
      heading.className = "result-label";
      heading.textContent = label;
      const body = doc.createElement("div");
      body.className = "result-tex";
      card.append(heading, body);
      elements.results.appendChild(card);
      return { card: card, body: body };
    }

    function addNote(text) {
      const note = doc.createElement("p");
      note.className = "result-note";
      note.textContent = text;
      elements.results.appendChild(note);
    }

    function currentInputs() {
      return state.inputs[state.mode];
    }

    function captureInputs() {
      const inputs = currentInputs();
      inputs.expression = elements.expression.value;

      if (state.mode === "derivative") {
        inputs.variable = elements.derivativeVariable.value;
        inputs.order = elements.derivativeOrder.value;
        inputs.point = elements.derivativePoint.value;
      } else if (state.mode === "integral") {
        inputs.variable = elements.integralVariable.value;
        inputs.lower = elements.integralLower.value;
        inputs.upper = elements.integralUpper.value;
      }
    }

    function applyInputs() {
      const inputs = currentInputs();
      elements.expression.value = inputs.expression || "";

      if (state.mode === "derivative") {
        elements.derivativeVariable.value = inputs.variable || "x";
        elements.derivativeOrder.value = inputs.order || "1";
        elements.derivativePoint.value = inputs.point || "";
      } else if (state.mode === "integral") {
        elements.integralVariable.value = inputs.variable || "x";
        elements.integralLower.value = inputs.lower == null ? "0" : inputs.lower;
        elements.integralUpper.value = inputs.upper == null ? "1" : inputs.upper;
      }
    }

    function setAngleMode(mode, options) {
      state.angleMode = mode === "deg" ? "deg" : "rad";
      storageSet(ANGLE_KEY, state.angleMode);

      for (const button of elements.angleButtons) {
        const active = button.dataset.angle === state.angleMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }

      const workspace = ensureGraphWorkspace();

      if (workspace) {
        workspace.setAngleMode(state.angleMode);
      }

      if (!options || options.run !== false) {
        updatePreview();

        if (state.mode !== "graph") {
          run({ record: false });
        }
      }
    }

    function previewTex() {
      const text = elements.expression.value.trim();

      if (!text) {
        return null;
      }

      try {
        if (state.mode === "integral") {
          const integrand = calculus.cleanIntegrand(text, elements.integralVariable.value);

          if (!integrand) {
            return null;
          }

          const node = solver.parseExpression(integrand, "integrand");
          return solver.toTex(node);
        }

        let working = solver.normalize(text);

        if (state.mode === "derivative") {
          const parts = solver.splitEquation(working);
          working = parts.hasEquals ? parts.rhs : working;
        }

        if (state.mode === "solve") {
          const parts = solver.splitEquation(working);
          const left = solver.parseExpression(parts.lhs, "left side");
          const right = solver.parseExpression(parts.rhs, "right side");
          return solver.toTex(left) + " = " + solver.toTex(right);
        }

        const node = solver.parseExpression(working, "expression");
        return solver.toTex(node);
      } catch (error) {
        return null;
      }
    }

    function updatePreview() {
      if (!elements.preview || state.mode === "graph") {
        return;
      }

      elements.preview.replaceChildren();
      const tex = previewTex();

      if (!tex) {
        return;
      }

      const span = doc.createElement("span");
      elements.preview.appendChild(span);
      renderTex(span, tex, elements.expression.value, false);
    }

    function renderRoots(result) {
      const count = doc.createElement("p");
      count.className = "results-count";
      count.textContent = result.manyRoots
        ? result.roots.length + "+ solutions"
        : result.roots.length + (result.roots.length === 1 ? " solution" : " solutions");
      elements.results.appendChild(count);

      const list = doc.createElement("ul");
      list.className = "roots";

      for (const item of result.roots) {
        const row = doc.createElement("li");
        row.className = "root";
        const variable = doc.createElement("span");
        variable.className = "root-variable";
        variable.textContent = result.variable || "x";
        const operator = doc.createElement("span");
        operator.className = "root-operator";
        operator.textContent = item.approximate ? "\u2248" : "=";
        const value = doc.createElement("span");
        value.className = "root-value";
        row.append(variable, operator, value);
        renderTex(value, item.text, item.text, false);
        list.appendChild(row);
      }

      elements.results.appendChild(list);

      if (result.manyRoots) {
        addMessage(result.message, "note");
      }
    }

    function renderEvaluateResult(result) {
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }

      if (result.status === "function") {
        setStatus("f(" + result.variable + ") = " + result.expression, false);

        const card = createCard("Function");
        renderTex(card.body, result.tex, result.expression, true);
        addNote("The function is plotted below; evaluate a constant expression to get a numeric result.");
        return;
      }

      setStatus(result.expression, false);

      const value = doc.createElement("div");
      value.className = "result-value";
      value.textContent = result.text;
      elements.results.appendChild(value);

      if (result.tex) {
        const card = createCard("Expression");
        renderTex(card.body, result.tex, result.expression, true);
      }
    }

    function renderSolveResult(result) {
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }

      setStatus(result.equation, false);

      if (result.tex) {
        const card = createCard("Equation");
        renderTex(card.body, result.tex, result.equation, true);
      }

      if (result.status === "roots") {
        renderRoots(result);
        return;
      }

      addMessage(result.message, "message");
    }

    function renderDerivativeResult(result) {
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }

      setStatus("Differentiate with respect to " + result.variable + ".", false);

      const original = createCard("Function");
      renderTex(original.body, result.tex, result.expression, true);

      const derivative = createCard(
        (result.order === 1 ? "First" : result.order === 2 ? "Second" : result.order === 3 ? "Third" : "Fourth") +
        " derivative"
      );
      renderTex(derivative.body, result.derivativeTex, result.derivative, true);

      if (result.valueText != null) {
        const valueCard = createCard("Value at " + result.point);
        renderTex(valueCard.body, String(result.value), result.valueText, false);
      }

      for (const note of result.notes || []) {
        addNote(note);
      }
    }

    function renderIntegralResult(result) {
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }

      const lowerText = result.lowerText || solver.formatValue(result.lower);
      const upperText = result.upperText || solver.formatValue(result.upper);

      setStatus(
        "\u222b from " + lowerText + " to " + upperText +
        " with respect to " + result.variable + ".",
        false
      );

      const card = createCard("Definite integral");
      renderTex(card.body, buildIntegralTex(result), result.text, true);

      const value = doc.createElement("div");
      value.className = "result-value";
      value.textContent = result.text;
      elements.results.appendChild(value);

      for (const warning of result.warnings || []) {
        addNote(warning);
      }
    }

    function renderDerivativeSteps(result) {
      if (!result.steps || result.steps.length === 0) {
        return;
      }

      elements.stepsCard.hidden = false;

      result.steps.forEach(function (entry, index) {
        const row = doc.createElement("div");
        row.className = "step";
        const number = doc.createElement("span");
        number.className = "step-index";
        number.textContent = String(index + 1);
        const body = doc.createElement("div");
        const rule = doc.createElement("div");
        rule.className = "step-rule";
        rule.textContent = entry.rule || "Step";
        const expression = doc.createElement("div");
        expression.className = "step-expression";
        expression.textContent = entry.expression || "";
        const explanation = doc.createElement("div");
        explanation.className = "step-explanation";
        explanation.textContent = entry.explanation || "";
        body.append(rule, expression, explanation);
        row.append(number, body);
        elements.steps.appendChild(row);
      });
    }

    function renderIntegralSteps(result) {
      if (!result.steps || result.steps.length === 0) {
        return;
      }

      elements.stepsCard.hidden = false;

      result.steps.forEach(function (entry, index) {
        const row = doc.createElement("div");
        row.className = "step";
        const number = doc.createElement("span");
        number.className = "step-index";
        number.textContent = String(index + 1);
        const body = doc.createElement("div");
        const rule = doc.createElement("div");
        rule.className = "step-rule";
        rule.textContent = entry.final ? "Final result" : "Simpson interval (depth " + entry.depth + ")";
        const expression = doc.createElement("div");
        expression.className = "step-expression";
        const errorText = entry.error == null ? "n/a" : solver.formatValue(entry.error);
        expression.textContent =
          "[" + solver.formatValue(entry.a) + ", " + solver.formatValue(entry.b) + "]" +
          " \u2192 " + solver.formatValue(entry.estimate) +
          " (error \u2248 " + errorText + ")";
        const explanation = doc.createElement("div");
        explanation.className = "step-explanation";
        explanation.textContent = entry.final
          ? "Total evaluations: " + entry.evaluations + "."
          : "Accepted after " + entry.evaluations + " function evaluations.";
        body.append(rule, expression, explanation);
        row.append(number, body);
        elements.steps.appendChild(row);
      });
    }

    function parseRootsText(result) {
      return result.roots.map(function (item) {
        return item.text;
      }).join(", ");
    }

    function summarize(result) {
      if (!result || result.ok === false) {
        return "Error";
      }

      if (state.mode === "evaluate") {
        return result.status === "function" ? result.expression : result.text;
      }

      if (state.mode === "solve") {
        if (result.status === "roots") {
          return result.equation + " \u2192 " + parseRootsText(result);
        }

        return result.message;
      }

      if (state.mode === "derivative") {
        return "d/d" + result.variable + " " + result.expression + " = " + result.derivative;
      }

      return "\u222b [" + result.expression + "] d" + result.variable + " = " + result.text;
    }

    function recordHistory(result) {
      if (!result || result.ok === false) {
        return;
      }

      history.add({
        mode: state.mode,
        inputs: JSON.parse(JSON.stringify(currentInputs())),
        angleMode: state.angleMode,
        summary: summarize(result),
        timestamp: Date.now(),
      });

      renderHistory();
    }

    function renderHistory() {
      const items = history.list();
      elements.historyList.replaceChildren();
      elements.historyEmpty.hidden = items.length > 0;

      items.forEach(function (entry) {
        const row = doc.createElement("li");
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "history-item";
        button.title = "Restore this run";

        const mode = doc.createElement("span");
        mode.className = "history-mode";
        mode.textContent = entry.mode;

        const summary = doc.createElement("span");
        summary.className = "history-summary";
        summary.textContent = entry.summary;

        const time = doc.createElement("span");
        time.className = "history-time";
        time.textContent = formatTimestamp(entry.timestamp);

        button.append(mode, summary, time);
        button.addEventListener("click", function () {
          restoreHistory(entry);
        });
        row.appendChild(button);
        elements.historyList.appendChild(row);
      });
    }

    function restoreHistory(entry) {
      if (!entry || !state.inputs[entry.mode]) {
        return;
      }

      if (entry.mode !== state.mode) {
        setMode(entry.mode, { run: false, focus: false });
      }

      state.inputs[entry.mode] = Object.assign(
        { expression: "" },
        entry.mode === "derivative" ? { variable: "x", order: "1", point: "" } : {},
        entry.mode === "integral" ? { variable: "x", lower: "0", upper: "1" } : {},
        entry.inputs || {}
      );

      setMode(entry.mode, { run: false, focus: false, skipCapture: true });
      setAngleMode(entry.angleMode || "rad", { run: false });
      run({ record: false });
    }

    function renderExamples() {
      elements.examples.replaceChildren();

      for (const example of EXAMPLES[state.mode]) {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "example-chip";
        chip.textContent = example.label;
        chip.addEventListener("click", function () {
          if (state.mode === "graph") {
            const workspace = ensureGraphWorkspace();

            if (workspace) {
              workspace.addExpression(example.expression, { focus: false });
            }

            return;
          }

          const inputs = currentInputs();
          inputs.expression = example.expression;

          if (example.lower != null) {
            inputs.lower = example.lower;
          }

          if (example.upper != null) {
            inputs.upper = example.upper;
          }

          applyInputs();
          updatePreview();
          run({ record: true });
          elements.expression.focus();
        });
        elements.examples.appendChild(chip);
      }
    }

    function updateGraph(result) {
      if (!result || result.ok === false) {
        hideGraph();
        return;
      }

      let model = null;

      if (state.mode === "evaluate" && result.status === "function" && result.evaluate) {
        model = plot.buildPlotModel(result.evaluate, {
          curveLabel: "f(x)",
        });
      } else if (
        state.mode === "solve" &&
        result.evaluate &&
        (result.status === "roots" || result.status === "no-real-roots")
      ) {
        const roots = result.roots.map(function (item) {
          return item.value;
        });
        model = plot.buildPlotModel(result.evaluate, {
          curveLabel: "f(x)",
          roots: roots,
        });
      } else if (state.mode === "derivative" && result.evaluateOriginal && result.evaluateDerivative) {
        model = plot.buildPlotModel(null, {
          xMin: -10,
          xMax: 10,
          curves: [
            { evaluate: result.evaluateOriginal, label: "f(x)", color: "#ff9f0a" },
            { evaluate: result.evaluateDerivative, label: "f'(x)", color: "#5a82ff" },
          ],
        });
      } else if (state.mode === "integral" && result.evaluate) {
        model = plot.buildPlotModel(result.evaluate, buildIntegralPlotOptions(result));
      }

      if (!model || (model.curves.length === 0 && !model.area)) {
        hideGraph();
        return;
      }

      const fit = !state.lastPlot || state.lastPlotMode !== state.mode || state.mode === "integral";
      state.lastPlot = model;
      state.lastPlotMode = state.mode;
      elements.graphCard.hidden = false;

      const controller = ensureGraphController();

      if (controller) {
        controller.setModel(model, {
          fit: fit,
          xPadding: state.mode === "integral" ? 0 : undefined,
        });
      } else {
        plot.drawPlot(elements.graph, model);
      }

      elements.graphSummary.textContent = model.summary;
    }

    function resetForRun() {
      clearTimeout(debounceTimer);
      clearResults();
      setStatus("", false);
      elements.graphCard.hidden = true;
      updateGraphReadout(null);
      hideSteps();
    }

    function run(options) {
      const settings = options || {};

      if (state.mode === "graph") {
        return;
      }

      captureInputs();
      resetForRun();

      const text = currentInputs().expression.trim();

      if (!text) {
        setStatus(HINTS[state.mode], false);
        return;
      }

      let result;

      if (state.mode === "evaluate") {
        result = solver.evaluateExpression(text, { angleMode: state.angleMode });
        renderEvaluateResult(result);
      } else if (state.mode === "solve") {
        result = solver.solveEquation(text, { angleMode: state.angleMode });
        renderSolveResult(result);
      } else if (state.mode === "derivative") {
        result = calculus.differentiate(text, {
          variable: elements.derivativeVariable.value,
          order: elements.derivativeOrder.value,
          point: elements.derivativePoint.value,
          angleMode: state.angleMode,
        });
        renderDerivativeResult(result);
        if (result.ok) {
          renderDerivativeSteps(result);
        }
      } else {
        result = calculus.integrate(text, {
          variable: elements.integralVariable.value,
          lower: elements.integralLower.value,
          upper: elements.integralUpper.value,
          angleMode: state.angleMode,
        });
        renderIntegralResult(result);
        if (result.ok) {
          renderIntegralSteps(result);
        }
      }

      if (result && result.ok !== false) {
        updateGraph(result);
      }

      if (settings.record) {
        recordHistory(result);
      }
    }

    function setMode(nextMode, options) {
      const settings = options || {};

      if (MODES.indexOf(nextMode) < 0) {
        return;
      }

      if (!settings.skipCapture) {
        captureInputs();
      }

      state.mode = nextMode;
      const isGraph = state.mode === "graph";

      for (const tab of elements.tabs) {
        const active = tab.dataset.mode === state.mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      }

      if (elements.panel) {
        elements.panel.hidden = isGraph;
        elements.panel.setAttribute("aria-labelledby", "tab-" + state.mode);
      }

      if (elements.graphWorkspace) {
        elements.graphWorkspace.hidden = !isGraph;
      }

      if (isGraph) {
        hideGraph();
        hideSteps();
        ensureGraphWorkspace();
      }

      elements.expressionLabel.textContent = LABELS[state.mode];
      elements.expression.placeholder = PLACEHOLDERS[state.mode];
      elements.derivativeOptions.hidden = state.mode !== "derivative";
      elements.integralOptions.hidden = state.mode !== "integral";
      applyInputs();
      renderExamples();
      updatePreview();

      if (settings.run !== false && !isGraph) {
        run({ record: false });
      }

      if (settings.focus !== false && !(palette && palette.isOpen())) {
        if (isGraph && graphWorkspace) {
          graphWorkspace.focus();
        } else if (elements.expression.focus) {
          elements.expression.focus();
        }
      }
    }

    function clearCurrent() {
      if (state.mode === "graph") {
        return;
      }

      clearTimeout(debounceTimer);
      currentInputs().expression = "";
      elements.expression.value = "";
      resetForRun();
      updatePreview();
      setStatus(HINTS[state.mode], false);
      elements.expression.focus();
    }

    const palette = paletteLib.createPalette({
      document: doc,
      onInsert: function (item) {
        let input = elements.expression;

        if (state.mode === "graph") {
          const active = doc.activeElement;

          if (active && active.classList && active.classList.contains("graph-expression-input")) {
            input = active;
          } else if (elements.graphExpressionList && elements.graphExpressionList.querySelector) {
            input = elements.graphExpressionList.querySelector(".graph-expression-input") || input;
          }
        }

        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
        const inserted = paletteLib.applyInsertion(input.value, start, end, item);
        input.value = inserted.value;

        if (typeof input.setSelectionRange === "function") {
          input.setSelectionRange(inserted.start, inserted.end);
        }

        if (state.mode !== "graph") {
          captureInputs();
          updatePreview();
        }

        input.focus();

        if (root.Event) {
          input.dispatchEvent(new root.Event("input", { bubbles: true }));
        }
      },
      onModeSwitch: function (item) {
        if (item.mode && item.mode !== state.mode) {
          setMode(item.mode, { run: false, focus: false });
        }

        if (item.order && state.mode === "derivative" && elements.derivativeOrder) {
          elements.derivativeOrder.value = String(item.order);
        }
      },
    });

    for (const tab of elements.tabs) {
      tab.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });

      tab.addEventListener("click", function () {
        setMode(tab.dataset.mode);
      });
    }

    for (const button of elements.angleButtons) {
      button.addEventListener("click", function () {
        setAngleMode(button.dataset.angle);
      });
    }

    elements.runButton.addEventListener("click", function () {
      run({ record: true });
      elements.expression.focus();
    });

    elements.expression.addEventListener("input", function () {
      captureInputs();
      updatePreview();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        run({ record: false });
      }, 180);
    });

    for (const field of [
      elements.derivativeVariable,
      elements.derivativeOrder,
      elements.derivativePoint,
      elements.integralVariable,
      elements.integralLower,
      elements.integralUpper,
    ]) {
      if (!field) {
        continue;
      }

      field.addEventListener("input", function () {
        captureInputs();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          run({ record: false });
        }, 180);
      });

      field.addEventListener("change", function () {
        captureInputs();
        run({ record: false });
      });
    }

    elements.stepsToggle.addEventListener("click", function () {
      const open = elements.stepsToggle.getAttribute("aria-expanded") === "true";
      elements.stepsToggle.setAttribute("aria-expanded", String(!open));
      elements.steps.hidden = open;
    });

    elements.historyClear.addEventListener("click", function () {
      history.clear();
      renderHistory();
    });

    doc.addEventListener("keydown", function (event) {
      if (event.defaultPrevented) {
        return;
      }

      const isGraphInput = Boolean(
        event.target &&
        event.target.classList &&
        event.target.classList.contains("graph-expression-input")
      );

      if (event.key === "Enter" && state.mode === "graph") {
        return;
      }

      if (event.key === "Escape" && state.mode === "graph") {
        if (palette && palette.isOpen()) {
          event.preventDefault();
          palette.close();
          return;
        }

        if (isGraphInput && event.target.blur) {
          event.target.blur();
        } else if (graphWorkspace) {
          graphWorkspace.focus();
        }

        return;
      }

      if (event.key === "Escape") {
        if (palette && palette.isOpen()) {
          event.preventDefault();
          palette.close();
          return;
        }

        event.preventDefault();
        clearCurrent();
        return;
      }

      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (palette && palette.isOpen()) {
          return;
        }

        event.preventDefault();
        setMode(cycleMode(state.mode, event.shiftKey ? -1 : 1));
        return;
      }

      if (event.key === "Enter") {
        if (palette && palette.isOpen()) {
          return;
        }

        const target = event.target;

        if (target && target.tagName && ["BUTTON", "SELECT", "TEXTAREA"].indexOf(target.tagName) >= 0) {
          return;
        }

        event.preventDefault();
        run({ record: true });
      }
    });

    let resizeTimer = null;
    root.addEventListener("resize", function () {
      if (!state.lastPlot) {
        return;
      }

      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.lastPlot && graphController) {
          graphController.render();
        } else if (state.lastPlot) {
          plot.drawPlot(elements.graph, state.lastPlot);
        }
      }, 120);
    });

    setAngleMode(state.angleMode, { run: false });
    const savedGraph = ensureGraphWorkspace();

    if (savedGraph) {
      try {
        const raw = storageValue(GRAPH_KEY, "");
        const parsed = raw ? JSON.parse(raw) : null;

        if (parsed) {
          savedGraph.load(parsed);
        }
      } catch (error) {
        // ignore malformed saved graph data
      }
    }

    graphSaveEnabled = true;
    elements.derivativeOptions.hidden = true;
    elements.integralOptions.hidden = true;
    elements.expressionLabel.textContent = LABELS[state.mode];
    elements.expression.placeholder = PLACEHOLDERS[state.mode];
    renderExamples();
    history.load();
    renderHistory();
    setStatus(HINTS[state.mode], false);
    elements.expression.focus();

    return {
      run: run,
      setMode: setMode,
      state: state,
      palette: palette,
    };
  }

  const api = {
    MODES: MODES,
    cycleMode: cycleMode,
    createHistoryStore: createHistoryStore,
    formatTimestamp: formatTimestamp,
    buildIntegralTex: buildIntegralTex,
    buildIntegralPlotOptions: buildIntegralPlotOptions,
    init: init,
  };

  if (root && root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return api;
});
