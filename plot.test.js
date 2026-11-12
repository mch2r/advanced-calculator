"use strict";

const assert = require("node:assert");
const plot = require("./plot.js");

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

check("range calculation uses explicit bounds", function () {
  const model = plot.buildPlotModel(function (x) {
    return x * x;
  }, { xMin: -2, xMax: 2, samples: 100 });

  assert.deepStrictEqual(model.xRange, [-2, 2]);
  assert.strictEqual(model.curves[0].points.length, 101);
  assert.ok(model.yRange[0] <= 0);
  assert.ok(model.yRange[1] >= 4);
});

check("range auto-fits area bounds", function () {
  const model = plot.buildPlotModel(function (x) {
    return x;
  }, { area: { from: 0, to: 1 }, samples: 80 });

  assert.ok(model.xRange[0] < 0);
  assert.ok(model.xRange[1] > 1);
  assert.strictEqual(model.area.start, 0);
  assert.strictEqual(model.area.end, 1);
});

check("offset functions are not forced down to zero", function () {
  const model = plot.buildPlotModel(function (x) {
    return x * x + 1000;
  }, { xMin: -2, xMax: 2, samples: 100 });

  assert.ok(model.yRange[0] > 900);
  assert.ok(model.yRange[1] > 1000);
});

check("a single far-away root gets a centered range", function () {
  const model = plot.buildPlotModel(function (x) {
    return x - 100;
  }, { roots: [100], samples: 40 });

  assert.ok(model.xRange[0] < 100);
  assert.ok(model.xRange[1] > 100);
});

check("discontinuities produce line breaks", function () {
  const model = plot.buildPlotModel(function (x) {
    return 1 / x;
  }, { xMin: -1, xMax: 1, samples: 100 });

  const nulls = model.curves[0].points.filter(function (point) {
    return point === null;
  });

  assert.ok(nulls.length >= 1);
});

check("asymptotes are clipped from the y range", function () {
  const model = plot.buildPlotModel(function (x) {
    return 1 / x;
  }, { xMin: -1, xMax: 1, samples: 400 });

  assert.ok(model.yRange[1] < 100);
  assert.ok(model.yRange[0] > -100);
});

check("root markers are placed on the axis", function () {
  const model = plot.buildPlotModel(function (x) {
    return x - 1;
  }, { roots: [-2, 0, 1], xMin: -3, xMax: 3, samples: 40 });

  assert.strictEqual(model.roots.length, 3);
  assert.deepStrictEqual(model.roots[0], { x: -2, y: 0 });
});

check("area points are bounded by the plot range", function () {
  const model = plot.buildPlotModel(function (x) {
    return x * x;
  }, {
    xMin: -2,
    xMax: 2,
    area: { from: -10, to: 10 },
    samples: 60,
  });

  assert.strictEqual(model.area.start, -2);
  assert.strictEqual(model.area.end, 2);
});

check("empty and invalid input is safe", function () {
  const model = plot.buildPlotModel(null, {});
  assert.strictEqual(model.curves.length, 0);
  assert.deepStrictEqual(model.xRange, [-10, 10]);
  assert.ok(model.summary.length > 0);
});

check("multiple curves are supported", function () {
  const model = plot.buildPlotModel(null, {
    xMin: -1,
    xMax: 1,
    samples: 20,
    curves: [
      { evaluate: function (x) { return x; }, label: "f(x)" },
      { evaluate: function (x) { return x * x; }, label: "f'(x)" },
    ],
  });

  assert.strictEqual(model.curves.length, 2);
  assert.strictEqual(model.curves[1].label, "f'(x)");
});

check("summary mentions the plot", function () {
  const model = plot.buildPlotModel(function (x) {
    return x;
  }, { xMin: -1, xMax: 1, samples: 10, roots: [0] });

  assert.ok(/f\(x\)/.test(model.summary));
  assert.ok(/root marker/.test(model.summary));
});

check("nice steps are rounded to 1/2/5", function () {
  assert.strictEqual(plot.niceStep(10, 5), 2);
  assert.strictEqual(plot.niceStep(100, 5), 20);
});

check("drawPlot tolerates a missing canvas", function () {
  assert.strictEqual(plot.drawPlot(null, {}), null);
});

check("viewport screen and world conversion inverts", function () {
  const viewport = { xMin: -4, xMax: 6, yMin: -2, yMax: 8 };
  const rect = { left: 10, top: 20, width: 500, height: 300 };
  const world = plot.screenToWorld(viewport, rect, 260, 170);
  const screen = plot.worldToScreen(viewport, rect, world.x, world.y);

  assert.ok(Math.abs(screen.x - 260) < 1e-9);
  assert.ok(Math.abs(screen.y - 170) < 1e-9);
});

check("zoom keeps the anchor point fixed", function () {
  const viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const anchor = { x: 5, y: -2 };
  const zoomed = plot.zoomViewport(viewport, 2, anchor);

  assert.ok(Math.abs((zoomed.xMin + zoomed.xMax) / 2) < 10);
  assert.ok(zoomed.xMin < anchor.x && zoomed.xMax > anchor.x);
  const ratio = (anchor.x - zoomed.xMin) / (zoomed.xMax - zoomed.xMin);
  assert.ok(Math.abs(ratio - 0.75) < 1e-9);
});

check("pan shifts the viewport in world units", function () {
  const viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const rect = { width: 200, height: 200 };
  const moved = plot.panViewport(viewport, 20, 20, rect);

  assert.ok(Math.abs(moved.xMin - -12) < 1e-9);
  assert.ok(Math.abs(moved.yMin - -8) < 1e-9);
});

check("resampling uses the requested viewport", function () {
  const model = plot.buildPlotModel(function (x) {
    return x;
  }, { xMin: -1, xMax: 1, samples: 20 });
  const resampled = plot.resampleModel(model, { xMin: 0, xMax: 2, yMin: -1, yMax: 3 }, 40);

  assert.deepStrictEqual(resampled.xRange, [0, 2]);
  assert.deepStrictEqual(resampled.yRange, [-1, 3]);
  assert.strictEqual(resampled.curves[0].points.length, 41);
  assert.ok(resampled.curves[0].points[0].x === 0);
});

check("fit viewport includes points and roots", function () {
  const viewport = plot.fitViewportFromPoints([
    { x: 10, y: 20 },
    { x: 12, y: 30 },
    { x: 11, y: 0 },
  ]);

  assert.ok(viewport.xMin < 10);
  assert.ok(viewport.xMax > 12);
  assert.ok(viewport.yMin < 0);
  assert.ok(viewport.yMax > 30);
});

check("trace finds the nearest curve point", function () {
  const model = plot.buildPlotModel(function (x) {
    return x;
  }, { xMin: -1, xMax: 1, samples: 100 });
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  const viewport = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  const screen = plot.worldToScreen(viewport, rect, 0.5, 0.5);
  const trace = plot.findTrace(model, viewport, rect, screen.x, screen.y, 10);

  assert.ok(trace);
  assert.ok(Math.abs(trace.x - 0.5) < 0.02);
  assert.strictEqual(trace.label, "f(x)");
});

check("scatter points affect auto ranges", function () {
  const model = plot.buildPlotModel(null, {
    points: [{ x: 50, y: 100 }, { x: 60, y: 120 }],
    samples: 20,
  });

  assert.ok(model.xRange[0] <= 50);
  assert.ok(model.xRange[1] >= 60);
  assert.ok(model.yRange[1] >= 120);
  assert.strictEqual(model.points.length, 2);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
