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

function fakeContext() {
  const calls = { text: [], fills: [], clips: [] };
  let pathLength = 0;
  let clipRect = null;
  const context = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    lineJoin: "miter",
    lineCap: "butt",
    calls: calls,
    measureText: function (text) {
      return { width: String(text).length * 6.2 };
    },
    fillText: function (text, x, y) {
      calls.text.push({
        text: String(text),
        x: x,
        y: y,
        align: context.textAlign,
        width: context.measureText(text).width,
      });
    },
    beginPath: function () {
      pathLength = 0;
    },
    rect: function (x, y, width, height) {
      clipRect = {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width: width,
        height: height,
      };
    },
    clip: function () {
      if (clipRect) {
        calls.clips.push(clipRect);
        clipRect = null;
      }
    },
    moveTo: function () {
      pathLength += 1;
    },
    lineTo: function () {
      pathLength += 1;
    },
    closePath: function () {},
    fill: function () {
      calls.fills.push({ fillStyle: context.fillStyle, pathLength: pathLength });
    },
    arc: function () {},
    fillRect: function () {},
    stroke: function () {},
    setTransform: function () {},
    clearRect: function () {},
    save: function () {},
    restore: function () {},
    setLineDash: function () {},
  };

  return context;
}

function fakeCanvas(width, height) {
  const context = fakeContext();

  return {
    clientWidth: width,
    clientHeight: height,
    width: 0,
    height: 0,
    context: context,
    getContext: function () {
      return context;
    },
    getAttribute: function () {
      return null;
    },
  };
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

check("integral area fits explicit bounds and keeps pi caption labels", function () {
  const model = plot.buildPlotModel(function (x) {
    return Math.sin(x);
  }, {
    xMin: 0,
    xMax: Math.PI,
    area: {
      from: 0,
      to: Math.PI,
      fromLabel: "0",
      toLabel: "π",
    },
    samples: 80,
  });

  assert.deepStrictEqual(model.xRange, [0, Math.PI]);
  assert.strictEqual(model.area.fromLabel, "0");
  assert.strictEqual(model.area.toLabel, "π");
  assert.ok(model.summary.indexOf("from 0 to π") >= 0);
  assert.strictEqual(model.summary.indexOf("3.14"), -1);
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

check("legend wraps inside a narrow canvas", function () {
  const curves = [];

  for (let index = 1; index <= 8; index += 1) {
    curves.push({
      evaluate: function (x) { return x * index; },
      label: "legend-" + index,
    });
  }

  const model = plot.buildPlotModel(null, { xMin: -1, xMax: 1, curves: curves, samples: 40 });
  const canvas = fakeCanvas(320, 320);

  plot.drawPlot(canvas, model, null, {});

  const labels = canvas.context.calls.text.filter(function (entry) {
    return entry.text.indexOf("legend-") === 0;
  });
  const rows = new Set(labels.map(function (entry) { return entry.y; }));

  assert.strictEqual(labels.length, 8);
  assert.ok(rows.size >= 2);
  assert.ok(labels.every(function (entry) {
    return entry.x + entry.width <= 320;
  }));
});

check("tick labels use readable grouped and compact formats", function () {
  assert.strictEqual(plot.formatTick(200000, 50000), "200,000");
  assert.strictEqual(plot.formatTick(-200000, 50000), "-200,000");
  assert.strictEqual(plot.formatTick(1500000, 500000), "1.5e6");
  assert.strictEqual(plot.formatTick(0.00002, 0.00001), "2e-5");
  assert.strictEqual(plot.formatTick(0.0001, 0.0001), "0.0001");
  assert.strictEqual(plot.formatTick(0, 1), "0");
});

check("y-axis labels stay inside desktop and phone canvases", function () {
  [320, 800].forEach(function (width) {
    const model = plot.buildPlotModel(function (x) {
      return 200000 + x * 100000;
    }, { xMin: 0, xMax: 1, yMin: 180000, yMax: 320000, samples: 40 });
    const canvas = fakeCanvas(width, 320);

    plot.drawPlot(canvas, model, null, {});
    const labels = canvas.context.calls.text.filter(function (call) {
      return call.align === "right";
    });

    assert.ok(labels.length > 0, "No y-axis labels at width " + width);
    labels.forEach(function (label) {
      assert.ok(
        label.x - label.width >= 0,
        "Clipped label " + label.text + " at width " + width
      );
    });
    assert.ok(labels.some(function (label) {
      return label.text === "200,000";
    }), "Expected grouped large-value label");
  });
});

check("integral area fills between the configured bounds", function () {
  const model = plot.buildPlotModel(function (x) {
    return x * x;
  }, {
    xMin: -2,
    xMax: 2,
    area: { from: -1, to: 1, color: "rgba(255, 159, 10, 0.22)" },
    samples: 80,
  });
  const canvas = fakeCanvas(640, 320);

  plot.drawPlot(canvas, model, null, {});
  const areaFill = canvas.context.calls.fills.filter(function (fill) {
    return fill.fillStyle === model.area.color;
  })[0];

  assert.ok(areaFill, "Area fill was not drawn");
  assert.ok(areaFill.pathLength > 3);
});

check("area fit keeps the zero baseline visible", function () {
  const model = plot.buildPlotModel(function (x) {
    return Math.sin(x) * Math.cos(x) * 2 * x * x - 3;
  }, {
    xMin: -2,
    xMax: 2,
    area: { from: -2, to: 2 },
    samples: 80,
  });
  const viewport = plot.fitViewportFromModel(model, { xPadding: 0 });

  assert.ok(viewport.yMin < 0, "Shaded area baseline is below the viewport");
  assert.ok(viewport.yMax > 0, "Zero baseline is not visible in the viewport");
});

check("resampling keeps the shaded integral area", function () {
  const model = plot.buildPlotModel(function (x) {
    return Math.sin(x);
  }, {
    xMin: -2,
    xMax: 2,
    area: { from: -2, to: 2, fromLabel: "-2", toLabel: "2" },
    samples: 80,
  });
  const viewport = plot.fitViewportFromModel(model, { xPadding: 0 });
  const resampled = plot.resampleModel(model, viewport, 80);
  const canvas = fakeCanvas(640, 320);

  assert.ok(resampled.area, "Resampled model lost the shaded area");
  plot.drawPlot(canvas, resampled, viewport, {});

  const areaFill = canvas.context.calls.fills.filter(function (fill) {
    return fill.fillStyle === resampled.area.color;
  })[0];

  assert.ok(areaFill, "Resampled area fill was not drawn");
  assert.ok(areaFill.pathLength > 3);
});

check("plot data is clipped above the x-axis labels", function () {
  const model = plot.buildPlotModel(function (x) {
    return Math.sin(x);
  }, { xMin: -2, xMax: 2, yMin: -0.5, yMax: 0.5, samples: 80 });
  const canvas = fakeCanvas(640, 320);

  plot.drawPlot(canvas, model, null, {});

  const clip = canvas.context.calls.clips[0];
  const xLabel = canvas.context.calls.text.filter(function (entry) {
    return entry.align === "center";
  })[0];

  assert.ok(clip, "Plot data was not clipped");
  assert.ok(clip.width < 640);
  assert.ok(clip.height < 320);
  assert.ok(xLabel, "No x-axis label was drawn");
  assert.ok(clip.bottom < xLabel.y);
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
