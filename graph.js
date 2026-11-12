(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./plot.js"), require("./solver.js"));
  } else {
    root.GraphWorkspace = factory(root.Plot, root.EquationSolver);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (plot, solver) {
  "use strict";

  const DEFAULT_SAMPLES = 720;
  const MIN_ZOOM = 1e-6;
  const MAX_ZOOM = 1e6;
  const MAX_EXPRESSIONS = 8;
  const MAX_TABLE_ROWS = 50;

  function copyViewport(viewport) {
    return {
      xMin: viewport.xMin,
      xMax: viewport.xMax,
      yMin: viewport.yMin,
      yMax: viewport.yMax,
    };
  }

  function clampZoom(factor) {
    const numeric = Number(factor);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 1;
    }

    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, numeric));
  }

  function localRect(canvas) {
    if (canvas && typeof canvas.getBoundingClientRect === "function") {
      const rect = canvas.getBoundingClientRect();

      if (rect && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
        return {
          left: rect.left || 0,
          top: rect.top || 0,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
      }
    }

    return {
      left: 0,
      top: 0,
      width: Math.max(1, (canvas && canvas.clientWidth) || 640),
      height: Math.max(1, (canvas && canvas.clientHeight) || 320),
    };
  }

  function createViewportController(options) {
    const settings = options || {};
    const canvas = settings.canvas;
    const onChange = typeof settings.onChange === "function" ? settings.onChange : function () {};
    const samples = Number.isFinite(settings.samples) ? settings.samples : DEFAULT_SAMPLES;
    const state = {
      model: settings.model || null,
      viewport: null,
      extras: settings.extras || {},
      trace: null,
      dragging: false,
      pointers: new Map(),
      pinchDistance: 0,
      lastPointer: null,
      rendered: null,
    };

    state.viewport = state.model
      ? (settings.viewport
          ? plot.normalizeViewport(settings.viewport, plot.viewportFromModel(state.model))
          : plot.fitViewportFromModel(state.model))
      : plot.normalizeViewport(settings.viewport || null);

    function currentRect() {
      return localRect(canvas);
    }

    function pointFromEvent(event) {
      return {
        x: Number.isFinite(event.clientX) ? event.clientX : event.offsetX,
        y: Number.isFinite(event.clientY) ? event.clientY : event.offsetY,
      };
    }

    function notify() {
      onChange({
        viewport: copyViewport(state.viewport),
        model: state.rendered,
        trace: state.trace,
        extras: state.extras,
      });
    }

    function render() {
      if (!state.model) {
        state.rendered = null;
        notify();
        return null;
      }

      state.rendered = plot.resampleModel(state.model, state.viewport, samples);
      plot.drawPlot(canvas, state.rendered, state.viewport, Object.assign({}, state.extras, {
        trace: state.trace,
      }));
      notify();
      return state.rendered;
    }

    function setModel(model, modelOptions) {
      const modelSettings = modelOptions || {};
      state.model = model || null;
      state.trace = null;

      if (!state.model) {
        state.rendered = null;
        notify();
        return;
      }

      if (modelSettings.fit !== false) {
        state.viewport = plot.fitViewportFromModel(state.model);
      } else {
        state.viewport = plot.normalizeViewport(state.viewport, plot.viewportFromModel(state.model));
      }

      render();
    }

    function setViewport(viewport, renderNow) {
      state.viewport = plot.normalizeViewport(viewport, state.viewport);

      if (renderNow !== false) {
        render();
      }
    }

    function zoomAt(factor, screenX, screenY) {
      const rect = currentRect();
      const anchor = plot.screenToWorld(state.viewport, rect, screenX, screenY);
      state.viewport = plot.zoomViewport(state.viewport, clampZoom(factor), anchor);
      render();
    }

    function zoomBy(factor) {
      const rect = currentRect();
      zoomAt(factor, rect.width / 2, rect.height / 2);
    }

    function panBy(dx, dy) {
      state.viewport = plot.panViewport(state.viewport, dx, dy, currentRect());
      render();
    }

    function fit() {
      if (!state.model) {
        return;
      }

      state.viewport = plot.fitViewportFromModel(state.model);
      state.trace = null;
      render();
    }

    function clearTrace() {
      if (!state.trace) {
        return;
      }

      state.trace = null;
      render();
    }

    function updateTrace(event) {
      if (!state.model || !state.rendered) {
        return;
      }

      const point = pointFromEvent(event);
      const rect = currentRect();
      const trace = plot.findTrace(state.rendered, state.viewport, rect, point.x, point.y, 20);
      const changed = (!trace && state.trace) || (trace && (!state.trace ||
        trace.x !== state.trace.x || trace.y !== state.trace.y));

      if (changed) {
        state.trace = trace;
        render();
      }
    }

    function updateExtras(extras, renderNow) {
      state.extras = extras || {};

      if (renderNow !== false) {
        render();
      }
    }

    function pointerDown(event) {
      const point = pointFromEvent(event);
      state.pointers.set(event.pointerId == null ? 1 : event.pointerId, point);

      if (state.pointers.size >= 2) {
        const points = Array.from(state.pointers.values());
        state.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        state.dragging = false;
      } else {
        state.dragging = true;
        state.lastPointer = point;
      }

      state.trace = null;
      canvas.classList.add("is-dragging");

      if (typeof canvas.setPointerCapture === "function" && event.pointerId != null) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          // capture is best effort
        }
      }

      if (event.preventDefault) {
        event.preventDefault();
      }
    }

    function pointerMove(event) {
      const point = pointFromEvent(event);
      const id = event.pointerId == null ? 1 : event.pointerId;

      if (state.pointers.has(id)) {
        state.pointers.set(id, point);
      }

      if (state.pointers.size >= 2) {
        const points = Array.from(state.pointers.values());
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;

        if (state.pinchDistance > 0) {
          const rect = currentRect();
          const anchor = plot.screenToWorld(state.viewport, rect, centerX, centerY);
          state.viewport = plot.zoomViewport(state.viewport, clampZoom(distance / state.pinchDistance), anchor);
        }

        state.pinchDistance = distance;
        state.lastPointer = { x: centerX, y: centerY };
        render();
        return;
      }

      if (state.dragging && state.lastPointer) {
        panBy(point.x - state.lastPointer.x, point.y - state.lastPointer.y);
        state.lastPointer = point;
        return;
      }

      updateTrace(event);
    }

    function pointerUp(event) {
      const id = event.pointerId == null ? 1 : event.pointerId;
      state.pointers.delete(id);

      if (typeof canvas.releasePointerCapture === "function" && event.pointerId != null) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (error) {
          // release is best effort
        }
      }

      if (state.pointers.size === 0) {
        state.dragging = false;
        state.lastPointer = null;
        state.pinchDistance = 0;
        canvas.classList.remove("is-dragging");
      } else if (state.pointers.size === 1) {
        state.dragging = true;
        state.lastPointer = Array.from(state.pointers.values())[0];
        state.pinchDistance = 0;
      }
    }

    function wheel(event) {
      if (event.preventDefault) {
        event.preventDefault();
      }

      const point = pointFromEvent(event);
      const delta = Number(event.deltaY) || 0;
      zoomAt(Math.exp(-delta * 0.0015), point.x, point.y);
    }

    function keyDown(event) {
      const key = event.key;
      const step = event.shiftKey ? 80 : 30;

      if (key === "ArrowLeft") {
        event.preventDefault();
        panBy(step, 0);
      } else if (key === "ArrowRight") {
        event.preventDefault();
        panBy(-step, 0);
      } else if (key === "ArrowUp") {
        event.preventDefault();
        panBy(0, step);
      } else if (key === "ArrowDown") {
        event.preventDefault();
        panBy(0, -step);
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        zoomBy(1.25);
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        zoomBy(0.8);
      } else if (key === "0" || key === "Home") {
        event.preventDefault();
        fit();
      }
    }

    if (canvas && typeof canvas.addEventListener === "function") {
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointermove", pointerMove);
      canvas.addEventListener("pointerup", pointerUp);
      canvas.addEventListener("pointercancel", pointerUp);
      canvas.addEventListener("pointerleave", function (event) {
        if (!state.dragging) {
          clearTrace();
        }

        if (state.pointers.size === 0 && event && event.pointerId != null) {
          state.pointers.delete(event.pointerId);
        }
      });
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.addEventListener("keydown", keyDown);
      canvas.addEventListener("dblclick", function (event) {
        if (event.preventDefault) {
          event.preventDefault();
        }

        const point = pointFromEvent(event);
        zoomAt(2, point.x, point.y);
      });
    }

    render();

    return {
      render: render,
      setModel: setModel,
      setViewport: setViewport,
      zoomAt: zoomAt,
      zoomBy: zoomBy,
      panBy: panBy,
      fit: fit,
      clearTrace: clearTrace,
      updateExtras: updateExtras,
      getViewport: function () {
        return copyViewport(state.viewport);
      },
      getState: function () {
        return state;
      },
    };
  }

  function stripGraphDefinition(text) {
    let source = String(text == null ? "" : text).trim();
    source = source.replace(/^y\s*=\s*/i, "");
    source = source.replace(/^[a-zA-Z][a-zA-Z0-9]*\s*\(\s*x\s*\)\s*=\s*/, "");
    return source;
  }

  function compileExpression(text, options) {
    const settings = options || {};
    const scope = settings.parameters || {};

    try {
      const source = stripGraphDefinition(text);

      if (!source) {
        return { ok: false, error: "Enter an expression." };
      }

      if (source.length > 500) {
        return { ok: false, error: "The expression is too long (maximum 500 characters)." };
      }

      const normalized = solver.normalize(source);

      if (solver.findEquality(normalized)) {
        return { ok: false, error: "Graph expressions cannot contain '=' except a leading y = or f(x) =." };
      }

      const node = solver.parseExpression(normalized, "expression");
      const allowed = ["x", "e", "pi"].concat(Object.keys(scope));
      solver.validateNode(node, allowed);
      const working = solver.applyAngleMode(node, settings.angleMode);
      const evaluate = solver.makeEvaluator(working, "x", scope);

      return {
        ok: true,
        evaluate: evaluate,
        normalized: normalized,
        tex: solver.toTex(node),
        parameters: Object.keys(scope),
      };
    } catch (error) {
      return {
        ok: false,
        error: solver.cleanMessage(error && error.message ? error.message : String(error)),
      };
    }
  }

  function extractParameters(text) {
    try {
      const source = stripGraphDefinition(text);

      if (!source || solver.findEquality(solver.normalize(source))) {
        return [];
      }

      const node = solver.parseExpression(solver.normalize(source), "expression");

      return Array.from(solver.collectSymbolNames(node))
        .filter(function (name) {
          return name !== "x" && name !== "e" && name !== "pi";
        })
        .sort();
    } catch (error) {
      return [];
    }
  }

  function tableValue(text, angleMode, parameters) {
    if (text == null || !String(text).trim()) {
      return null;
    }

    const scope = parameters || {};

    try {
      const source = solver.normalize(text);

      if (!source || solver.findEquality(source)) {
        return null;
      }

      const node = solver.parseExpression(source, "table value");
      solver.validateNode(node, ["e", "pi"].concat(Object.keys(scope)));
      const working = solver.applyAngleMode(node, angleMode);
      return solver.safeNumber(working.evaluate(scope));
    } catch (error) {
      return null;
    }
  }

  function findZeroBetween(left, right, evaluate) {
    let low = left;
    let high = right;
    let lowValue = evaluate(low);

    for (let i = 0; i < 40; i += 1) {
      const middle = (low + high) / 2;
      const middleValue = evaluate(middle);

      if (!Number.isFinite(middleValue)) {
        return null;
      }

      if (Math.abs(middleValue) < 1e-12) {
        return middle;
      }

      if ((lowValue < 0) === (middleValue < 0)) {
        low = middle;
        lowValue = middleValue;
      } else {
        high = middle;
      }
    }

    return (low + high) / 2;
  }

  function computePointsOfInterest(model, options) {
    const settings = options || {};
    const result = [];
    const seen = new Set();
    const maxPerCurve = Number.isFinite(settings.maxPerCurve) ? settings.maxPerCurve : 12;
    const maxIntersections = Number.isFinite(settings.maxIntersections) ? settings.maxIntersections : 30;
    let intersectionCount = 0;

    function addPoint(x, y, type, label, color) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
      }

      const key = type + ":" + Math.round(x * 1e6) / 1e6 + ":" + Math.round(y * 1e6) / 1e6;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      result.push({ x: x, y: y, type: type, label: label, color: color });
      return true;
    }

    for (const curve of (model && model.curves) || []) {
      const color = curve.color || "#ff9f0a";
      const points = curve.points || [];
      let roots = 0;
      let extrema = 0;
      let previous = null;

      for (const point of points) {
        if (!point) {
          previous = null;
          continue;
        }

        if (previous) {
          if (Math.abs(point.y) < 1e-7 || (previous.y < 0 && point.y > 0) || (previous.y > 0 && point.y < 0)) {
            if (roots < maxPerCurve) {
              let x = point.x;

              if (curve.evaluate) {
                const zero = findZeroBetween(previous.x, point.x, curve.evaluate);
                if (zero != null) {
                  x = zero;
                }
              }

              if (addPoint(x, 0, "root", "zero", color)) {
                roots += 1;
              }
            }
          }
        }

        previous = point;
      }

      for (let i = 1; i < points.length - 1; i += 1) {
        const before = points[i - 1];
        const current = points[i];
        const after = points[i + 1];

        if (!before || !current || !after || extrema >= maxPerCurve) {
          continue;
        }

        if (current.y > before.y && current.y >= after.y) {
          if (addPoint(current.x, current.y, "max", "max", color)) {
            extrema += 1;
          }
        } else if (current.y < before.y && current.y <= after.y) {
          if (addPoint(current.x, current.y, "min", "min", color)) {
            extrema += 1;
          }
        }
      }

      if (curve.evaluate) {
        const yIntercept = curve.evaluate(0);

        if (Number.isFinite(yIntercept)) {
          addPoint(0, yIntercept, "intercept", "y-intercept", color);
        }
      }
    }

    if (settings.includeIntersections !== false) {
      const curves = ((model && model.curves) || []).filter(function (curve) {
        return typeof curve.evaluate === "function" && curve.points && curve.points.length > 1;
      });
      const sampleCount = 500;

      for (let a = 0; a < curves.length; a += 1) {
        for (let b = a + 1; b < curves.length; b += 1) {
          if (intersectionCount >= maxIntersections) {
            break;
          }

          const first = curves[a];
          const second = curves[b];
          const start = Math.max(first.points[0].x, second.points[0].x);
          const end = Math.min(first.points[first.points.length - 1].x, second.points[second.points.length - 1].x);

          if (!(end > start)) {
            continue;
          }

          const step = (end - start) / sampleCount;
          let leftX = start;
          let leftValue = first.evaluate(leftX) - second.evaluate(leftX);

          for (let i = 1; i <= sampleCount && intersectionCount < maxIntersections; i += 1) {
            const rightX = start + step * i;
            const rightValue = first.evaluate(rightX) - second.evaluate(rightX);

            if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
              leftX = rightX;
              leftValue = rightValue;
              continue;
            }

            if (leftValue === 0 && Math.abs(rightValue) > 1e-12) {
              const y = first.evaluate(leftX);

              if (addPoint(leftX, y, "intersection", "intersection", first.color || "#5a82ff")) {
                intersectionCount += 1;
              }
            } else if (leftValue !== 0 && rightValue !== 0 && (leftValue < 0) !== (rightValue < 0)) {
              let low = leftX;
              let high = rightX;
              let lowValue = leftValue;

              for (let j = 0; j < 40; j += 1) {
                const middle = (low + high) / 2;
                const middleValue = first.evaluate(middle) - second.evaluate(middle);

                if ((lowValue < 0) === (middleValue < 0)) {
                  low = middle;
                  lowValue = middleValue;
                } else {
                  high = middle;
                }
              }

              const x = (low + high) / 2;
              const y = first.evaluate(x);

              if (addPoint(x, y, "intersection", "intersection", first.color || "#5a82ff")) {
                intersectionCount += 1;
              }
            }

            leftX = rightX;
            leftValue = rightValue;
          }
        }
      }
    }

    return result;
  }

  function createGraphWorkspace(options) {
    const settings = options || {};
    const doc = settings.document;
    const canvas = settings.canvas;
    const listElement = settings.list;
    const emptyElement = settings.empty;
    const statusElement = settings.status;
    const readoutElement = settings.readout;
    const addButton = settings.addButton;
    const fitButton = settings.fitButton;
    const resetButton = settings.resetButton;
    const poiToggle = settings.poiToggle;
    const slidersElement = settings.sliders;
    const onChange = typeof settings.onChange === "function" ? settings.onChange : function () {};
    const colors = plot.DEFAULT_COLORS;
    const state = {
      expressions: [],
      nextId: 1,
      controller: null,
      hasFit: false,
      timer: null,
      angleMode: settings.angleMode || "rad",
      showPoints: true,
      parameters: {},
      sliderSignature: "",
      destroyed: false,
    };

    function notifyChange() {
      onChange(serialize());
    }

    function renderSliders() {
      if (!slidersElement) {
        return;
      }

      const names = Object.keys(state.parameters).sort();
      const signature = names.join(",");

      if (signature === state.sliderSignature) {
        return;
      }

      state.sliderSignature = signature;
      slidersElement.replaceChildren();
      slidersElement.hidden = names.length === 0;

      for (const name of names) {
        const parameter = state.parameters[name];
        const wrapper = doc.createElement("div");
        wrapper.className = "graph-slider";
        const label = doc.createElement("label");
        label.className = "graph-slider-label";
        const title = doc.createElement("span");
        title.textContent = name;
        const output = doc.createElement("output");
        output.textContent = String(parameter.value);
        label.append(title, output);

        const range = doc.createElement("input");
        range.type = "range";
        range.min = String(parameter.min);
        range.max = String(parameter.max);
        range.step = String(parameter.step);
        range.value = String(parameter.value);
        range.setAttribute("aria-label", "Slider for " + name);

        range.addEventListener("input", function () {
          parameter.value = Number(range.value);
          output.textContent = String(parameter.value);
          scheduleRebuild(30);
        });

        wrapper.append(label, range);
        slidersElement.appendChild(wrapper);
      }
    }

    function setStatus(text, isError) {
      if (!statusElement) {
        return;
      }

      statusElement.textContent = text || "";
      statusElement.classList.toggle("is-error", Boolean(isError));
    }

    function setReadout(info) {
      if (!readoutElement) {
        return;
      }

      if (info && info.trace) {
        readoutElement.textContent =
          (info.trace.label ? info.trace.label + " " : "") +
          "(" + plot.formatNumber(info.trace.x) + ", " + plot.formatNumber(info.trace.y) + ")";
      } else {
        readoutElement.textContent = "";
      }
    }

    function ensureController() {
      if (state.controller || !canvas) {
        return state.controller;
      }

      state.controller = createViewportController({
        canvas: canvas,
        onChange: setReadout,
      });

      return state.controller;
    }

    function focusTable(entry) {
      if (!entry.tableVisible || !listElement || !listElement.querySelector) {
        return;
      }

      const target = listElement.querySelector('[data-id="' + entry.id + '"] .graph-table-input');

      if (target && target.focus) {
        target.focus();
      }
    }

    function addTableRow(entry) {
      if (entry.tableRows.length >= MAX_TABLE_ROWS) {
        setStatus("A table can contain at most " + MAX_TABLE_ROWS + " rows.", true);
        return;
      }

      entry.tableRows.push({ x: "", y: "" });
      renderRows();
      rebuild();

      const inputs = listElement && listElement.querySelectorAll
        ? listElement.querySelectorAll('[data-id="' + entry.id + '"] .graph-table-input')
        : [];

      if (inputs.length > 0 && inputs[inputs.length - 2] && inputs[inputs.length - 2].focus) {
        inputs[inputs.length - 2].focus();
      }
    }

    function updateRowMessage(entry) {
      if (!entry.rowError) {
        return;
      }

      entry.rowError.textContent = entry.error || "";
      entry.rowError.hidden = !entry.error;
      entry.rowInput.classList.toggle("is-invalid", Boolean(entry.error));
    }

    function makeRow(entry) {
      const row = doc.createElement("li");
      row.className = "graph-expression";
      row.dataset.id = String(entry.id);

      const swatch = doc.createElement("span");
      swatch.className = "graph-swatch";
      swatch.style.backgroundColor = entry.color;
      swatch.setAttribute("aria-hidden", "true");

      const body = doc.createElement("div");
      body.className = "graph-expression-body";

      const input = doc.createElement("input");
      input.className = "graph-expression-input";
      input.type = "text";
      input.value = entry.text;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.autocorrect = "off";
      input.spellcheck = false;
      input.placeholder = "x^2";
      input.setAttribute("aria-label", "Expression " + entry.id);

      const error = doc.createElement("p");
      error.className = "graph-expression-error";
      error.hidden = !entry.error;
      error.textContent = entry.error || "";

      const actions = doc.createElement("div");
      actions.className = "graph-expression-actions";

      const visibility = doc.createElement("button");
      visibility.className = "graph-icon-button";
      visibility.type = "button";
      visibility.textContent = entry.visible ? "\u25c9" : "\u25cb";
      visibility.setAttribute("aria-label", entry.visible ? "Hide expression" : "Show expression");
      visibility.setAttribute("aria-pressed", String(entry.visible));

      const tableToggle = doc.createElement("button");
      tableToggle.className = "graph-icon-button";
      tableToggle.type = "button";
      tableToggle.textContent = "\u25a6";
      tableToggle.setAttribute("aria-label", entry.tableVisible ? "Hide table" : "Show table");
      tableToggle.setAttribute("aria-pressed", String(entry.tableVisible));

      const remove = doc.createElement("button");
      remove.className = "graph-icon-button";
      remove.type = "button";
      remove.textContent = "\u00d7";
      remove.setAttribute("aria-label", "Remove expression");

      body.append(input, error);

      if (entry.tableVisible) {
        const table = doc.createElement("div");
        table.className = "graph-table";
        const header = doc.createElement("div");
        header.className = "graph-table-head";
        const xLabel = doc.createElement("span");
        xLabel.textContent = "x";
        const yLabel = doc.createElement("span");
        yLabel.textContent = "y";
        header.append(xLabel, yLabel);
        table.appendChild(header);

        entry.tableRows.forEach(function (tableRow, index) {
          const tableLine = doc.createElement("div");
          tableLine.className = "graph-table-row";
          const xInput = doc.createElement("input");
          xInput.type = "text";
          xInput.className = "graph-table-input";
          xInput.value = tableRow.x;
          xInput.placeholder = "x";
          xInput.setAttribute("aria-label", "Table x value " + (index + 1));
          const yInput = doc.createElement("input");
          yInput.type = "text";
          yInput.className = "graph-table-input";
          yInput.value = tableRow.y;
          yInput.placeholder = "y";
          yInput.setAttribute("aria-label", "Table y value " + (index + 1));
          const removeRow = doc.createElement("button");
          removeRow.className = "graph-icon-button graph-table-remove";
          removeRow.type = "button";
          removeRow.textContent = "\u00d7";
          removeRow.setAttribute("aria-label", "Remove table row " + (index + 1));

          xInput.addEventListener("input", function () {
            tableRow.x = xInput.value;
            scheduleRebuild();
          });

          yInput.addEventListener("input", function () {
            tableRow.y = yInput.value;
            scheduleRebuild();
          });

          xInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
              event.preventDefault();
              addTableRow(entry);
            }
          });

          yInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
              event.preventDefault();
              addTableRow(entry);
            }
          });

          removeRow.addEventListener("click", function () {
            entry.tableRows.splice(index, 1);

            if (entry.tableRows.length === 0) {
              entry.tableRows.push({ x: "", y: "" });
            }

            renderRows();
            rebuild();
          });

          tableLine.append(xInput, yInput, removeRow);
          table.appendChild(tableLine);
        });

        const addRow = doc.createElement("button");
        addRow.className = "graph-table-add";
        addRow.type = "button";
        addRow.textContent = "+ Add row";
        addRow.addEventListener("click", function () {
          addTableRow(entry);
        });
        table.appendChild(addRow);
        body.appendChild(table);
      }

      actions.append(visibility, tableToggle, remove);
      row.append(swatch, body, actions);
      entry.tableToggle = tableToggle;
      entry.row = row;
      entry.rowInput = input;
      entry.rowError = error;
      entry.visibilityButton = visibility;

      input.addEventListener("input", function () {
        entry.text = input.value;
        scheduleRebuild();
      });

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          addExpression("", { afterId: entry.id, focus: true });
        } else if (event.key === "Escape") {
          event.preventDefault();
          input.value = entry.text;
          input.blur();
        }
      });

      visibility.addEventListener("click", function () {
        entry.visible = !entry.visible;
        visibility.textContent = entry.visible ? "\u25c9" : "\u25cb";
        visibility.setAttribute("aria-label", entry.visible ? "Hide expression" : "Show expression");
        visibility.setAttribute("aria-pressed", String(entry.visible));
        row.classList.toggle("is-hidden", !entry.visible);
        rebuild();
      });

      tableToggle.addEventListener("click", function () {
        entry.tableVisible = !entry.tableVisible;
        renderRows();
        rebuild();
        focusTable(entry);
      });

      remove.addEventListener("click", function () {
        removeExpression(entry.id);
      });

      updateRowMessage(entry);
      return row;
    }

    function renderRows() {
      if (!listElement) {
        return;
      }

      listElement.replaceChildren();

      for (const entry of state.expressions) {
        listElement.appendChild(makeRow(entry));
      }

      if (emptyElement) {
        emptyElement.hidden = state.expressions.some(function (entry) {
          return entry.text.trim();
        });
      }
    }

    function rebuild() {
      if (state.destroyed) {
        return;
      }

      const curves = [];
      const tablePoints = [];
      const usedParameters = new Set();

      for (const entry of state.expressions) {
        if (!entry.visible) {
          continue;
        }

        if (entry.text.trim()) {
          for (const name of extractParameters(entry.text)) {
            usedParameters.add(name);
          }
        }

        if (entry.tableVisible) {
          for (const tableRow of entry.tableRows || []) {
            for (const name of extractParameters(tableRow.x).concat(extractParameters(tableRow.y))) {
              usedParameters.add(name);
            }
          }
        }
      }

      for (const name of Array.from(usedParameters)) {
        if (!state.parameters[name]) {
          state.parameters[name] = { name: name, value: 1, min: -10, max: 10, step: 0.1 };
        }
      }

      for (const name of Object.keys(state.parameters)) {
        if (!usedParameters.has(name)) {
          delete state.parameters[name];
        }
      }

      renderSliders();
      const scope = {};

      for (const name of Object.keys(state.parameters)) {
        scope[name] = state.parameters[name].value;
      }

      for (const entry of state.expressions) {
        if (!entry.visible) {
          entry.error = "";
          entry.evaluate = null;
          updateRowMessage(entry);
          continue;
        }

        for (const tableRow of entry.tableVisible ? entry.tableRows : []) {
          const x = tableValue(tableRow.x, state.angleMode, scope);
          const y = tableValue(tableRow.y, state.angleMode, scope);

          if (x != null && y != null) {
            tablePoints.push({
              x: x,
              y: y,
              color: entry.color,
              label: "table",
            });
          }
        }

        if (!entry.text.trim()) {
          entry.error = "";
          entry.evaluate = null;
          updateRowMessage(entry);
          continue;
        }

        const compiled = compileExpression(entry.text, {
          angleMode: state.angleMode,
          parameters: scope,
        });
        entry.error = compiled.ok ? "" : compiled.error;
        entry.evaluate = compiled.ok ? compiled.evaluate : null;
        entry.normalized = compiled.ok ? compiled.normalized : "";
        updateRowMessage(entry);

        if (compiled.ok) {
          curves.push({
            evaluate: compiled.evaluate,
            label: "f" + (curves.length + 1) + "(x)",
            color: entry.color,
            width: 2.2,
          });
        }
      }

      const valid = curves.length;
      const controller = ensureController();

      if (valid === 0 && tablePoints.length === 0) {
        if (controller) {
          controller.setModel(null);
        }

        setStatus(state.expressions.length > 0
          ? (state.expressions.some(function (entry) { return entry.error; })
              ? "Fix the highlighted expression to plot it."
              : "Enter an expression or table values to plot.")
          : "Add an expression to start graphing.", false);
        notifyChange();
        return;
      }

      const model = plot.buildPlotModel(null, {
        xMin: -10,
        xMax: 10,
        samples: 560,
        curves: curves,
        points: tablePoints,
      });
      const points = state.showPoints && valid > 0
        ? computePointsOfInterest(model, { includeIntersections: valid > 1 })
        : [];
      const fit = !state.hasFit;
      state.hasFit = true;

      if (controller) {
        controller.setModel(model, { fit: fit });
        controller.updateExtras({
          pointsOfInterest: points,
          pointLabels: false,
        });
      } else {
        plot.drawPlot(canvas, model, null, { pointsOfInterest: points });
      }

      const parts = [];

      if (valid > 0) {
        parts.push(valid + " expression" + (valid === 1 ? "" : "s"));
      }

      if (tablePoints.length > 0) {
        parts.push(tablePoints.length + " table point" + (tablePoints.length === 1 ? "" : "s"));
      }

      if (points.length > 0) {
        parts.push(points.length + " point" + (points.length === 1 ? "" : "s") + " of interest");
      }

      setStatus(parts.join(" \u00b7 "), false);
      notifyChange();
    }

    function scheduleRebuild(delay) {
      if (typeof setTimeout !== "function") {
        rebuild();
        return;
      }

      if (state.timer && typeof clearTimeout === "function") {
        clearTimeout(state.timer);
      }

      state.timer = setTimeout(rebuild, Number.isFinite(delay) ? delay : 160);
    }

    function addExpression(text, addOptions) {
      if (state.expressions.length >= MAX_EXPRESSIONS) {
        setStatus("At most " + MAX_EXPRESSIONS + " expressions can be plotted.", true);
        return null;
      }

      const rowOptions = addOptions || {};
      const entry = {
        id: state.nextId,
        text: String(text == null ? "" : text),
        color: colors[(state.nextId - 1) % colors.length],
        visible: true,
        error: "",
        evaluate: null,
        tableVisible: false,
        tableRows: [{ x: "1", y: "1" }],
      };
      state.nextId += 1;

      if (rowOptions.afterId != null) {
        const index = state.expressions.findIndex(function (item) {
          return item.id === rowOptions.afterId;
        });
        state.expressions.splice(index < 0 ? state.expressions.length : index + 1, 0, entry);
      } else {
        state.expressions.push(entry);
      }

      renderRows();
      rebuild();

      if (rowOptions.focus !== false) {
        const target = listElement && listElement.querySelector
          ? listElement.querySelector('[data-id="' + entry.id + '"] .graph-expression-input')
          : null;

        if (target && target.focus) {
          target.focus();
        }
      }

      return entry;
    }

    function removeExpression(id) {
      state.expressions = state.expressions.filter(function (entry) {
        return entry.id !== id;
      });
      renderRows();
      rebuild();
    }

    function refresh() {
      rebuild();
    }

    function setAngleMode(mode) {
      state.angleMode = mode === "deg" ? "deg" : "rad";
      rebuild();
    }

    function setShowPoints(value) {
      state.showPoints = Boolean(value);
      rebuild();
    }

    function focus() {
      const target = listElement && listElement.querySelector
        ? listElement.querySelector(".graph-expression-input")
        : null;

      if (target && target.focus) {
        target.focus();
      } else if (addButton && addButton.focus) {
        addButton.focus();
      }
    }

    function load(data) {
      if (!data || !Array.isArray(data.expressions)) {
        return;
      }

      if (typeof clearTimeout === "function") {
        clearTimeout(state.timer);
      }

      state.expressions = [];
      state.nextId = 1;
      state.parameters = {};
      state.sliderSignature = "";
      state.hasFit = false;

      data.expressions.slice(0, MAX_EXPRESSIONS).forEach(function (entry) {
        if (!entry || typeof entry.text !== "string") {
          return;
        }

        const rows = Array.isArray(entry.tableRows)
          ? entry.tableRows.slice(0, MAX_TABLE_ROWS).map(function (row) {
              return {
                x: String(row && row.x != null ? row.x : ""),
                y: String(row && row.y != null ? row.y : ""),
              };
            })
          : [{ x: "1", y: "1" }];

        state.expressions.push({
          id: state.nextId,
          text: entry.text.slice(0, 500),
          color: colors[(state.nextId - 1) % colors.length],
          visible: entry.visible !== false,
          error: "",
          evaluate: null,
          tableVisible: Boolean(entry.tableVisible),
          tableRows: rows.length > 0 ? rows : [{ x: "", y: "" }],
        });
        state.nextId += 1;
      });

      renderRows();
      rebuild();

      if (data.parameters && typeof data.parameters === "object") {
        setParameters(data.parameters);
        rebuild();
      }

      if (data.viewport && state.controller) {
        state.controller.setViewport(data.viewport, false);
        state.controller.render();
        state.hasFit = true;
      }
    }

    function serialize() {
      return {
        expressions: state.expressions.map(function (entry) {
          return {
            text: entry.text,
            visible: entry.visible,
            tableVisible: entry.tableVisible,
            tableRows: entry.tableRows.map(function (row) {
              return { x: row.x, y: row.y };
            }),
          };
        }),
        parameters: Object.keys(state.parameters).reduce(function (result, name) {
          result[name] = state.parameters[name].value;
          return result;
        }, {}),
        viewport: state.controller ? state.controller.getViewport() : null,
      };
    }

    function setParameters(values) {
      const source = values || {};
      let changed = false;

      for (const name of Object.keys(state.parameters)) {
        if (Number.isFinite(source[name]) && state.parameters[name].value !== source[name]) {
          state.parameters[name].value = source[name];
          changed = true;
        }
      }

      if (changed) {
        state.sliderSignature = "";
        renderSliders();
      }
    }

    if (addButton) {
      addButton.addEventListener("click", function () {
        addExpression("", { focus: true });
      });
    }

    if (fitButton) {
      fitButton.addEventListener("click", function () {
        if (state.controller) {
          state.controller.fit();
        }
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        if (state.controller) {
          state.controller.fit();
        }
      });
    }

    if (poiToggle) {
      poiToggle.addEventListener("change", function () {
        setShowPoints(poiToggle.checked);
      });
      state.showPoints = poiToggle.checked !== false;
    }

    if (canvas) {
      ensureController();
    }

    return {
      addExpression: addExpression,
      removeExpression: removeExpression,
      rebuild: rebuild,
      refresh: refresh,
      focus: focus,
      setAngleMode: setAngleMode,
      setShowPoints: setShowPoints,
      setParameters: setParameters,
      serialize: serialize,
      load: load,
      getParameters: function () {
        return Object.keys(state.parameters).reduce(function (result, name) {
          result[name] = state.parameters[name].value;
          return result;
        }, {});
      },
      getExpressions: function () {
        return state.expressions.map(function (entry) {
          return {
            id: entry.id,
            text: entry.text,
            visible: entry.visible,
            error: entry.error,
            tableVisible: entry.tableVisible,
            tableRows: entry.tableRows.map(function (row) {
              return { x: row.x, y: row.y };
            }),
          };
        });
      },
      getController: function () {
        return state.controller;
      },
      destroy: function () {
        state.destroyed = true;

        if (typeof clearTimeout === "function") {
          clearTimeout(state.timer);
        }
      },
    };
  }

  return {
    DEFAULT_SAMPLES: DEFAULT_SAMPLES,
    createViewportController: createViewportController,
    createGraphWorkspace: createGraphWorkspace,
    compileExpression: compileExpression,
    stripGraphDefinition: stripGraphDefinition,
    extractParameters: extractParameters,
    tableValue: tableValue,
    computePointsOfInterest: computePointsOfInterest,
    localRect: localRect,
    clampZoom: clampZoom,
  };
});
