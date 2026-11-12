(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Plot = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_COLORS = ["#ff9f0a", "#5a82ff", "#4fd1a1", "#ff6b6b"];
  const DEFAULT_X_MIN = -10;
  const DEFAULT_X_MAX = 10;
  const DEFAULT_SAMPLES = 480;
  const MIN_VIEW_SPAN = 1e-9;
  const MAX_VIEW_SPAN = 1e12;

  function normalizeAxis(minValue, maxValue, fallbackMin, fallbackMax) {
    let min = minValue == null ? NaN : Number(minValue);
    let max = maxValue == null ? NaN : Number(maxValue);

    if (!Number.isFinite(min)) {
      min = fallbackMin;
    }

    if (!Number.isFinite(max)) {
      max = fallbackMax;
    }

    if (min > max) {
      const swap = min;
      min = max;
      max = swap;
    }

    if (min === max) {
      const span = Math.max(1, Math.abs(min) * 0.5);
      min -= span;
      max += span;
    }

    const span = max - min;

    if (span < MIN_VIEW_SPAN) {
      const center = (min + max) / 2;
      min = center - MIN_VIEW_SPAN / 2;
      max = center + MIN_VIEW_SPAN / 2;
    } else if (span > MAX_VIEW_SPAN) {
      const center = (min + max) / 2;
      min = center - MAX_VIEW_SPAN / 2;
      max = center + MAX_VIEW_SPAN / 2;
    }

    return [min, max];
  }

  function normalizeViewport(viewport, fallback) {
    const base = fallback || {
      xMin: DEFAULT_X_MIN,
      xMax: DEFAULT_X_MAX,
      yMin: -10,
      yMax: 10,
    };
    const x = normalizeAxis(viewport && viewport.xMin, viewport && viewport.xMax, base.xMin, base.xMax);
    const y = normalizeAxis(viewport && viewport.yMin, viewport && viewport.yMax, base.yMin, base.yMax);

    return { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] };
  }

  function viewportFromModel(model) {
    if (!model || !Array.isArray(model.xRange) || !Array.isArray(model.yRange)) {
      return normalizeViewport(null);
    }

    return normalizeViewport({
      xMin: model.xRange[0],
      xMax: model.xRange[1],
      yMin: model.yRange[0],
      yMax: model.yRange[1],
    });
  }

  function screenToWorld(viewport, rect, screenX, screenY) {
    const active = normalizeViewport(viewport);
    const width = Math.max(1, rect && rect.width ? rect.width : 1);
    const height = Math.max(1, rect && rect.height ? rect.height : 1);
    const ratioX = (screenX - (rect && rect.left ? rect.left : 0)) / width;
    const ratioY = (screenY - (rect && rect.top ? rect.top : 0)) / height;

    return {
      x: active.xMin + ratioX * (active.xMax - active.xMin),
      y: active.yMax - ratioY * (active.yMax - active.yMin),
    };
  }

  function worldToScreen(viewport, rect, worldX, worldY) {
    const active = normalizeViewport(viewport);
    const width = Math.max(1, rect && rect.width ? rect.width : 1);
    const height = Math.max(1, rect && rect.height ? rect.height : 1);

    return {
      x: (rect && rect.left ? rect.left : 0) + ((worldX - active.xMin) / (active.xMax - active.xMin)) * width,
      y: (rect && rect.top ? rect.top : 0) + ((active.yMax - worldY) / (active.yMax - active.yMin)) * height,
    };
  }

  function zoomViewport(viewport, factor, anchor) {
    const active = normalizeViewport(viewport);
    const numeric = Number(factor);
    const scale = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    const focus = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
      ? anchor
      : {
          x: (active.xMin + active.xMax) / 2,
          y: (active.yMin + active.yMax) / 2,
        };
    const xRatio = (focus.x - active.xMin) / (active.xMax - active.xMin);
    const yRatio = (focus.y - active.yMin) / (active.yMax - active.yMin);
    const xSpan = (active.xMax - active.xMin) / scale;
    const ySpan = (active.yMax - active.yMin) / scale;

    return normalizeViewport({
      xMin: focus.x - xRatio * xSpan,
      xMax: focus.x + (1 - xRatio) * xSpan,
      yMin: focus.y - yRatio * ySpan,
      yMax: focus.y + (1 - yRatio) * ySpan,
    });
  }

  function panViewport(viewport, dxPixels, dyPixels, rect) {
    const active = normalizeViewport(viewport);
    const width = Math.max(1, rect && rect.width ? rect.width : 1);
    const height = Math.max(1, rect && rect.height ? rect.height : 1);
    const dx = (Number(dxPixels) || 0) * ((active.xMax - active.xMin) / width);
    const dy = (Number(dyPixels) || 0) * ((active.yMax - active.yMin) / height);

    return normalizeViewport({
      xMin: active.xMin - dx,
      xMax: active.xMax - dx,
      yMin: active.yMin + dy,
      yMax: active.yMax + dy,
    });
  }

  function percentileIndex(length, fraction) {
    return Math.min(length - 1, Math.max(0, Math.round((length - 1) * fraction)));
  }

  function fitViewportFromPoints(points, options) {
    const settings = options || {};
    const xs = [];
    const ys = [];

    for (const point of points || []) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        continue;
      }

      xs.push(point.x);
      ys.push(point.y);
    }

    if (xs.length === 0) {
      return normalizeViewport(settings.fallback || null);
    }

    xs.sort(function (left, right) {
      return left - right;
    });
    ys.sort(function (left, right) {
      return left - right;
    });

    let xMin = xs[0];
    let xMax = xs[xs.length - 1];
    let yMin = ys[percentileIndex(ys.length, settings.lower || 0.02)];
    let yMax = ys[percentileIndex(ys.length, settings.upper || 0.98)];

    if (xMin === xMax) {
      const span = Math.max(1, Math.abs(xMin) * 0.5);
      xMin -= span;
      xMax += span;
    }

    if (yMin === yMax) {
      const span = Math.max(1, Math.abs(yMin) * 0.5);
      yMin -= span;
      yMax += span;
    }

    const xPad = (xMax - xMin) * 0.1;
    const yPad = (yMax - yMin) * 0.12;

    return normalizeViewport({
      xMin: xMin - xPad,
      xMax: xMax + xPad,
      yMin: yMin - yPad,
      yMax: yMax + yPad,
    });
  }

  function fitViewportFromModel(model, options) {
    const settings = options || {};
    const points = [];

    if (model) {
      for (const curve of model.curves || []) {
        for (const point of curve.points || []) {
          if (point) {
            points.push(point);
          }
        }
      }

      for (const point of (model.area && model.area.points) || []) {
        if (point) {
          points.push(point);
        }
      }

      for (const point of model.points || []) {
        points.push(point);
      }

      for (const root of model.roots || []) {
        points.push({ x: root.x, y: 0 });
      }
    }

    const fitted = fitViewportFromPoints(points, {
      fallback: viewportFromModel(model),
    });
    let xMin = fitted.xMin;
    let xMax = fitted.xMax;
    let yMin = fitted.yMin;
    let yMax = fitted.yMax;

    if (Number.isFinite(settings.xPadding) && model && Array.isArray(model.xRange)) {
      const xPadding = (model.xRange[1] - model.xRange[0]) * settings.xPadding;
      xMin = model.xRange[0] - xPadding;
      xMax = model.xRange[1] + xPadding;
    }

    if (model && model.area) {
      yMin = Math.min(yMin, 0);
      yMax = Math.max(yMax, 0);

      const yPadding = (yMax - yMin) * 0.08;
      yMin -= yPadding;
      yMax += yPadding;
    }

    return normalizeViewport({
      xMin: xMin,
      xMax: xMax,
      yMin: yMin,
      yMax: yMax,
    });
  }

  function resampleModel(model, viewport, samples) {
    if (!model) {
      return null;
    }

    const active = normalizeViewport(viewport, viewportFromModel(model));
    const count = Number.isFinite(samples) ? Math.max(24, Math.round(samples)) : DEFAULT_SAMPLES;
    const curves = (model.curves || []).map(function (curve) {
      return Object.assign({}, curve, {
        points: sampleCurve(curve, active.xMin, active.xMax, count),
      });
    });
    const area = model.area && typeof model.area.evaluate === "function"
      ? buildArea(
          Object.assign({}, model.area, {
            from: model.area.from,
            to: model.area.to,
            evaluate: model.area.evaluate,
          }),
          active.xMin,
          active.xMax,
          count
        )
      : null;

    return Object.assign({}, model, {
      xRange: [active.xMin, active.xMax],
      yRange: [active.yMin, active.yMax],
      curves: curves,
      area: area,
      points: (model.points || []).filter(function (point) {
        return point &&
          point.x >= active.xMin &&
          point.x <= active.xMax &&
          point.y >= active.yMin &&
          point.y <= active.yMax;
      }),
      roots: (model.roots || []).filter(function (root) {
        return root.x >= active.xMin && root.x <= active.xMax;
      }),
    });
  }

  function findTrace(model, viewport, rect, screenX, screenY, threshold) {
    const active = normalizeViewport(viewport, model ? viewportFromModel(model) : null);
    const limit = Number.isFinite(threshold) ? threshold : 18;
    let best = null;

    if (!model) {
      return null;
    }

    for (const curve of model.curves || []) {
      for (const point of curve.points || []) {
        if (!point) {
          continue;
        }

        const screen = worldToScreen(active, rect, point.x, point.y);
        const distance = Math.sqrt(
          Math.pow(screen.x - screenX, 2) + Math.pow(screen.y - screenY, 2)
        );

        if (!best || distance < best.distance) {
          best = {
            x: point.x,
            y: point.y,
            distance: distance,
            label: curve.label || "f(x)",
            color: curve.color || DEFAULT_COLORS[0],
            kind: "curve",
          };
        }
      }
    }

    return best && best.distance <= limit ? best : null;
  }

  function defaultCurve(index) {
    return {
      label: index === 0 ? "f(x)" : "curve " + (index + 1),
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    };
  }

  function gatherCurves(evaluate, options) {
    const curves = [];

    if (Array.isArray(options.curves)) {
      options.curves.forEach(function (curve, index) {
        if (!curve || typeof curve.evaluate !== "function") {
          return;
        }

        const fallback = defaultCurve(curves.length);
        curves.push({
          evaluate: curve.evaluate,
          label: curve.label || fallback.label,
          color: curve.color || fallback.color,
          width: curve.width || 2.2,
          dashed: Boolean(curve.dashed),
          kind: curve.kind || "curve",
          index: index,
        });
      });
    }

    if (typeof evaluate === "function") {
      const fallback = defaultCurve(curves.length);
      curves.push({
        evaluate: evaluate,
        label: options.curveLabel || fallback.label,
        color: options.curveColor || fallback.color,
        width: 2.4,
        dashed: false,
        kind: "curve",
      });
    }

    return curves;
  }

  function resolveXRange(options, area, roots, scatter) {
    const explicitMin = Number.isFinite(options.xMin) ? options.xMin : null;
    const explicitMax = Number.isFinite(options.xMax) ? options.xMax : null;

    if (explicitMin !== null && explicitMax !== null && explicitMin < explicitMax) {
      return [explicitMin, explicitMax];
    }

    let min = explicitMin !== null ? explicitMin : Infinity;
    let max = explicitMax !== null ? explicitMax : -Infinity;

    if (area && Number.isFinite(area.from) && Number.isFinite(area.to)) {
      min = Math.min(min, area.from, area.to);
      max = Math.max(max, area.from, area.to);
    }

    for (const root of roots || []) {
      if (Number.isFinite(root)) {
        min = Math.min(min, root);
        max = Math.max(max, root);
      }
    }

    for (const point of scatter || []) {
      if (point && Number.isFinite(point.x)) {
        min = Math.min(min, point.x);
        max = Math.max(max, point.x);
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [DEFAULT_X_MIN, DEFAULT_X_MAX];
    }

    if (min === max) {
      const span = Math.max(1, Math.abs(min) * 0.5);
      return [min - span, max + span];
    }

    if (explicitMin === null) {
      min -= Math.abs(max - min) * 0.12 || 1;
    }

    if (explicitMax === null) {
      max += Math.abs(max - min) * 0.12 || 1;
    }

    return [min, max];
  }

  function sampleCurve(curve, xMin, xMax, samples) {
    const points = [];
    const step = (xMax - xMin) / samples;

    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + i * step;
      let y;

      try {
        y = curve.evaluate(x);
      } catch (error) {
        y = NaN;
      }

      points.push(Number.isFinite(y) ? { x: x, y: y } : null);
    }

    return points;
  }

  function percentile(sorted, fraction) {
    if (sorted.length === 0) {
      return null;
    }

    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
    return sorted[index];
  }

  function resolveYRange(curves, area, options, scatter) {
    if (Number.isFinite(options.yMin) && Number.isFinite(options.yMax) && options.yMin < options.yMax) {
      return [options.yMin, options.yMax];
    }

    const values = [];

    for (const curve of curves) {
      for (const point of curve.points) {
        if (point) {
          values.push(point.y);
        }
      }
    }

    if (area) {
      for (const point of area.points) {
        if (point) {
          values.push(point.y);
        }
      }

      values.push(0);
    }

    for (const point of scatter || []) {
      if (point) {
        values.push(point.y);
      }
    }

    values.sort(function (left, right) {
      return left - right;
    });

    if (values.length === 0) {
      return [-1, 1];
    }

    let low = percentile(values, 0.02);
    let high = percentile(values, 0.98);

    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      low = values[0];
      high = values[values.length - 1];
    }

    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return [-1, 1];
    }

    const forceZero =
      Boolean(area) ||
      (Array.isArray(options.roots) && options.roots.length > 0);

    if (forceZero) {
      low = Math.min(low, 0);
      high = Math.max(high, 0);
    }

    if (low === high) {
      low -= 1;
      high += 1;
    }

    const padding = (high - low) * 0.1;
    return [low - padding, high + padding];
  }

  function buildArea(areaOptions, xMin, xMax, samples) {
    if (!areaOptions || typeof areaOptions.evaluate !== "function") {
      return null;
    }

    const from = Number(areaOptions.from);
    const to = Number(areaOptions.to);

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return null;
    }

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const sampleMin = Number.isFinite(xMin) ? Math.max(start, xMin) : start;
    const sampleMax = Number.isFinite(xMax) ? Math.min(end, xMax) : end;

    if (sampleMax <= sampleMin) {
      return null;
    }

    const points = sampleCurve({ evaluate: areaOptions.evaluate }, sampleMin, sampleMax, Math.max(24, Math.round(samples / 2)));

    return {
      from: from,
      to: to,
      fromLabel: areaOptions.fromLabel || formatNumber(from),
      toLabel: areaOptions.toLabel || formatNumber(to),
      start: sampleMin,
      end: sampleMax,
      points: points,
      evaluate: areaOptions.evaluate,
      color: areaOptions.color || "rgba(255, 159, 10, 0.22)",
      stroke: areaOptions.stroke || "rgba(255, 159, 10, 0.55)",
      label: areaOptions.label || "area",
    };
  }

  function buildPlotModel(evaluate, options) {
    const settings = options || {};
    const roots = Array.isArray(settings.roots)
      ? settings.roots.filter(function (root) {
          return Number.isFinite(root);
        })
      : [];
    const baseAreaOptions = settings.area
      ? Object.assign({}, settings.area, {
          evaluate: settings.area.evaluate || (typeof evaluate === "function" ? evaluate : null),
        })
      : null;
    const scatter = Array.isArray(settings.points)
      ? settings.points
          .filter(function (point) {
            return point && Number.isFinite(point.x) && Number.isFinite(point.y);
          })
          .map(function (point) {
            return {
              x: point.x,
              y: point.y,
              color: point.color || "#4fd1a1",
              label: point.label || "",
            };
          })
      : [];
    const xRange = resolveXRange(settings, baseAreaOptions, roots, scatter);
    const xMin = xRange[0];
    const xMax = xRange[1];
    const samples = Number.isFinite(settings.samples) ? Math.max(24, Math.round(settings.samples)) : DEFAULT_SAMPLES;
    const curves = gatherCurves(evaluate, settings);

    for (const curve of curves) {
      curve.points = sampleCurve(curve, xMin, xMax, samples);
    }

    const area = buildArea(baseAreaOptions, xMin, xMax, samples);
    const yRange = resolveYRange(curves, area, settings, scatter);
    const summaryParts = [];

    if (area) {
      summaryParts.push((curves.length > 0 ? curves[0].label : "f(x)") + " shaded area from " +
        (area.fromLabel || formatNumber(area.from)) + " to " + (area.toLabel || formatNumber(area.to)));
    } else {
      for (const curve of curves) {
        summaryParts.push(curve.label + " over x from " + formatNumber(xMin) + " to " + formatNumber(xMax));
      }
    }

    if (roots.length > 0) {
      summaryParts.push(roots.length + " root marker" + (roots.length === 1 ? "" : "s"));
    }

    if (scatter.length > 0) {
      summaryParts.push(scatter.length + " plotted point" + (scatter.length === 1 ? "" : "s"));
    }

    return {
      xRange: xRange,
      yRange: yRange,
      curves: curves,
      area: area,
      points: scatter,
      roots: roots.map(function (root) {
        return { x: root, y: 0 };
      }),
      summary: summaryParts.length > 0 ? summaryParts.join("; ") + "." : "No plot data.",
    };
  }

  function formatNumber(value) {
    if (Math.abs(value) >= 1000 || (Math.abs(value) < 0.001 && value !== 0)) {
      return value.toExponential(2);
    }

    return String(Math.round(value * 1000) / 1000);
  }

  function formatTick(value, step) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return "";
    }

    if (numeric === 0) {
      return "0";
    }

    const absolute = Math.abs(numeric);

    if (absolute >= 1000000 || absolute < 0.0001) {
      return numeric
        .toExponential(2)
        .replace(/\.?0+e/, "e")
        .replace("e+", "e");
    }

    const stepSize = Number.isFinite(step) ? Math.abs(step) : 1;
    const decimals = stepSize > 0 && stepSize < 1
      ? Math.min(6, Math.ceil(-Math.log(stepSize) / Math.LN10))
      : 0;
    const parts = numeric.toFixed(decimals).split(".");
    const sign = parts[0].charAt(0) === "-" ? "-" : "";
    const whole = (sign ? parts[0].slice(1) : parts[0]).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = parts[1] ? parts[1].replace(/0+$/, "") : "";

    return sign + whole + (fraction ? "." + fraction : "");
  }

  function niceStep(range, target) {
    if (!Number.isFinite(range) || range <= 0) {
      return 1;
    }

    const rough = range / Math.max(1, target);
    const power = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    const normalized = rough / power;
    let step = 10;

    if (normalized <= 1) {
      step = 1;
    } else if (normalized <= 2) {
      step = 2;
    } else if (normalized <= 5) {
      step = 5;
    }

    return step * power;
  }

  function drawPlot(canvas, model, viewport, extras) {
    if (!canvas || !model) {
      return null;
    }

    const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;

    if (!context) {
      return null;
    }

    const cssWidth = canvas.clientWidth || Number(canvas.getAttribute("width")) || 640;
    const cssHeight = canvas.clientHeight || Number(canvas.getAttribute("height")) || 320;
    const ratio = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    const activeViewport = normalizeViewport(viewport, viewportFromModel(model));
    const xMin = activeViewport.xMin;
    const xMax = activeViewport.xMax;
    const yMin = activeViewport.yMin;
    const yMax = activeViewport.yMax;
    const options = extras || {};
    const xStep = niceStep(xMax - xMin, 6);
    const yStep = niceStep(yMax - yMin, 5);
    const xStart = Math.ceil(xMin / xStep) * xStep;
    const yStart = Math.ceil(yMin / yStep) * yStep;
    const xTicks = [];
    const yTicks = [];

    for (let x = xStart; x <= xMax + xStep * 1e-9; x += xStep) {
      const value = Math.abs(x) < xStep * 1e-9 ? 0 : x;
      xTicks.push({ value: value, label: formatTick(value, xStep) });
    }

    for (let y = yStart; y <= yMax + yStep * 1e-9; y += yStep) {
      const value = Math.abs(y) < yStep * 1e-9 ? 0 : y;
      yTicks.push({ value: value, label: formatTick(value, yStep) });
    }

    context.save();
    context.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillStyle = "rgba(139, 147, 165, 0.9)";
    context.strokeStyle = "rgba(255, 255, 255, 0.07)";
    context.lineWidth = 1;

    let maxYLabelWidth = 0;
    let maxXLabelWidth = 0;

    for (const tick of yTicks) {
      maxYLabelWidth = Math.max(maxYLabelWidth, context.measureText(tick.label).width);
    }

    for (const tick of xTicks) {
      maxXLabelWidth = Math.max(maxXLabelWidth, context.measureText(tick.label).width);
    }

    const padding = {
      left: Math.max(40, Math.ceil(maxYLabelWidth) + 14),
      right: Math.max(18, Math.ceil(maxXLabelWidth / 2) + 8),
      top: 18,
      bottom: 30,
    };
    const plotWidth = Math.max(1, cssWidth - padding.left - padding.right);
    const plotHeight = Math.max(1, cssHeight - padding.top - padding.bottom);

    function toX(x) {
      return padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
    }

    function toY(y) {
      return padding.top + (1 - (y - yMin) / (yMax - yMin)) * plotHeight;
    }

    for (const tick of xTicks) {
      const px = toX(tick.value);
      context.beginPath();
      context.moveTo(px, padding.top);
      context.lineTo(px, padding.top + plotHeight);
      context.stroke();

      if (tick.value !== 0) {
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(tick.label, px, padding.top + plotHeight + 7);
      }
    }

    for (const tick of yTicks) {
      const py = toY(tick.value);
      context.beginPath();
      context.moveTo(padding.left, py);
      context.lineTo(padding.left + plotWidth, py);
      context.stroke();
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(tick.label, padding.left - 8, py);
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.28)";

    if (yMin <= 0 && yMax >= 0) {
      context.beginPath();
      context.moveTo(padding.left, toY(0));
      context.lineTo(padding.left + plotWidth, toY(0));
      context.stroke();
    }

    if (xMin <= 0 && xMax >= 0) {
      context.beginPath();
      context.moveTo(toX(0), padding.top);
      context.lineTo(toX(0), padding.top + plotHeight);
      context.stroke();
    }

    context.save();
    context.beginPath();
    context.rect(padding.left, padding.top, plotWidth, plotHeight);
    context.clip();

    if (model.area) {
      context.fillStyle = model.area.color;
      context.beginPath();
      let started = false;

      for (const point of model.area.points) {
        if (!point) {
          continue;
        }

        const px = toX(point.x);
        const py = toY(point.y);

        if (!started) {
          context.moveTo(px, toY(0));
          context.lineTo(px, py);
          started = true;
        } else {
          context.lineTo(px, py);
        }
      }

      if (started) {
        const endX = toX(model.area.end);
        context.lineTo(endX, toY(0));
        context.closePath();
        context.fill();
      }
    }

    for (const curve of model.curves) {
      context.strokeStyle = curve.color;
      context.lineWidth = curve.width || 2.2;
      context.setLineDash(curve.dashed ? [5, 4] : []);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.beginPath();
      let drawing = false;

      for (const point of curve.points) {
        if (!point) {
          drawing = false;
          continue;
        }

        const px = toX(point.x);
        const py = toY(point.y);

        if (!drawing) {
          context.moveTo(px, py);
          drawing = true;
        } else {
          context.lineTo(px, py);
        }
      }

      context.stroke();
    }

    context.setLineDash([]);

    for (const point of model.points || []) {
      const px = toX(point.x);
      const py = toY(point.y);

      if (px < padding.left || px > padding.left + plotWidth || py < padding.top || py > padding.top + plotHeight) {
        continue;
      }

      context.fillStyle = point.color || "#4fd1a1";
      context.beginPath();
      context.arc(px, py, 3.2, 0, Math.PI * 2);
      context.fill();
    }

    for (const point of options.pointsOfInterest || []) {
      const px = toX(point.x);
      const py = toY(point.y);

      if (px < padding.left || px > padding.left + plotWidth || py < padding.top || py > padding.top + plotHeight) {
        continue;
      }

      context.fillStyle = point.color || "#ff9f0a";
      context.beginPath();
      context.arc(px, py, 3.6, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#181c24";
      context.lineWidth = 1.5;
      context.stroke();

      if (point.label && options.pointLabels !== false) {
        const labelX = Math.min(padding.left + plotWidth - 48, px + 7);
        const labelY = Math.max(padding.top + 8, py - 7);
        context.fillStyle = "rgba(18, 21, 28, 0.82)";
        const textWidth = context.measureText(point.label).width;
        context.fillRect(labelX - 3, labelY - 9, textWidth + 6, 14);
        context.fillStyle = "rgba(245, 247, 250, 0.9)";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(point.label, labelX, labelY - 2);
      }
    }

    for (const root of model.roots) {
      const px = toX(root.x);
      const py = toY(0);
      context.fillStyle = "#ff9f0a";
      context.beginPath();
      context.arc(px, py, 4, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#181c24";
      context.lineWidth = 1.5;
      context.stroke();
    }

    context.restore();

    if (options.trace) {
      const trace = options.trace;
      const px = toX(trace.x);
      const py = toY(trace.y);

      if (px >= padding.left && px <= padding.left + plotWidth && py >= padding.top && py <= padding.top + plotHeight) {
        context.setLineDash([3, 4]);
        context.strokeStyle = "rgba(245, 247, 250, 0.35)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(px, padding.top);
        context.lineTo(px, padding.top + plotHeight);
        context.moveTo(padding.left, py);
        context.lineTo(padding.left + plotWidth, py);
        context.stroke();
        context.setLineDash([]);

        context.fillStyle = trace.color || "#f5f7fa";
        context.beginPath();
        context.arc(px, py, 4.5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#181c24";
        context.lineWidth = 2;
        context.stroke();

        const label = (trace.label ? trace.label + " " : "") +
          "(" + formatNumber(trace.x) + ", " + formatNumber(trace.y) + ")";
        context.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
        const textWidth = context.measureText(label).width;
        const labelX = Math.min(padding.left + plotWidth - textWidth - 10, Math.max(padding.left + 4, px + 8));
        const labelY = Math.max(padding.top + 12, py - 10);
        context.fillStyle = "rgba(18, 21, 28, 0.9)";
        context.fillRect(labelX - 4, labelY - 10, textWidth + 8, 17);
        context.fillStyle = "rgba(245, 247, 250, 0.95)";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(label, labelX, labelY - 1);
      }
    }

    context.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    const legendStart = padding.left + 8;
    const legendRight = padding.left + plotWidth - 8;
    let legendX = legendStart;
    let legendY = padding.top + 10;

    for (const curve of model.curves) {
      const itemWidth = 15 + context.measureText(curve.label).width + 19;

      if (legendX > legendStart && legendX + itemWidth > legendRight) {
        legendX = legendStart;
        legendY += 16;
      }

      context.fillStyle = curve.color;
      context.fillRect(legendX, legendY - 3, 10, 3);
      context.fillStyle = "rgba(245, 247, 250, 0.85)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(curve.label, legendX + 15, legendY);
      legendX += itemWidth;
    }

    context.restore();
    return { width: cssWidth, height: cssHeight, ratio: ratio };
  }

  return {
    DEFAULT_COLORS: DEFAULT_COLORS,
    buildPlotModel: buildPlotModel,
    drawPlot: drawPlot,
    normalizeViewport: normalizeViewport,
    viewportFromModel: viewportFromModel,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    zoomViewport: zoomViewport,
    panViewport: panViewport,
    fitViewportFromPoints: fitViewportFromPoints,
    fitViewportFromModel: fitViewportFromModel,
    resampleModel: resampleModel,
    findTrace: findTrace,
    niceStep: niceStep,
    formatNumber: formatNumber,
    formatTick: formatTick,
  };
});
