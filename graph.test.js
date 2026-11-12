"use strict";

const assert = require("node:assert");
const plot = require("./plot.js");
const graph = require("./graph.js");

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

function fakeCanvas() {
  return {
    clientWidth: 400,
    clientHeight: 240,
    listeners: {},
    classList: {
      add: function () {},
      remove: function () {},
    },
    addEventListener: function (type, callback) {
      this.listeners[type] = callback;
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 400, height: 240 };
    },
  };
}

function fakeElement(tag) {
  const element = {
    tagName: String(tag).toUpperCase(),
    children: [],
    listeners: {},
    attributes: {},
    dataset: {},
    style: {},
    className: "",
    textContent: "",
    value: "",
    hidden: false,
    checked: true,
    classList: {
      contains: function () {
        return false;
      },
      toggle: function () {},
      add: function () {},
      remove: function () {},
    },
    append: function () {
      for (let i = 0; i < arguments.length; i += 1) {
        element.children.push(arguments[i]);
      }
    },
    appendChild: function (child) {
      element.children.push(child);
      return child;
    },
    replaceChildren: function () {
      element.children = [];

      for (let i = 0; i < arguments.length; i += 1) {
        element.children.push(arguments[i]);
      }
    },
    setAttribute: function (name, value) {
      element.attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return element.attributes[name] || null;
    },
    addEventListener: function (type, callback) {
      (element.listeners[type] = element.listeners[type] || []).push(callback);
    },
    focus: function () {},
    blur: function () {},
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
  };

  return element;
}

function fakeDocument() {
  return {
    createElement: fakeElement,
  };
}

function sampleModel() {
  return plot.buildPlotModel(function (x) {
    return x * x;
  }, { xMin: -4, xMax: 4, yMin: -2, yMax: 12, samples: 100 });
}

check("localRect falls back to canvas dimensions", function () {
  const rect = graph.localRect({ clientWidth: 320, clientHeight: 180 });
  assert.strictEqual(rect.width, 320);
  assert.strictEqual(rect.height, 180);
});

check("controller fits a model on creation", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  const viewport = controller.getViewport();
  assert.ok(viewport.xMin < -4);
  assert.ok(viewport.xMax > 4);
  assert.ok(viewport.yMax > 12);
});

check("fitted models override a restored viewport", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    viewport: { xMin: -13, xMax: 13, yMin: -40, yMax: 40 },
  });
  const model = plot.buildPlotModel(function (x) {
    return Math.sin(x);
  }, {
    xMin: -2,
    xMax: 2,
    area: { from: -2, to: 2 },
    samples: 100,
  });

  controller.setModel(model, { fit: true, xPadding: 0 });

  const viewport = controller.getViewport();
  assert.strictEqual(viewport.xMin, -2);
  assert.strictEqual(viewport.xMax, 2);
});

check("controller zooms around a point", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  const before = controller.getViewport();
  controller.zoomAt(2, 200, 120);
  const after = controller.getViewport();
  assert.ok(after.xMax - after.xMin < before.xMax - before.xMin);
  assert.ok(after.yMax - after.yMin < before.yMax - before.yMin);
});

check("controller pans the viewport", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  const before = controller.getViewport();
  controller.panBy(40, 0);
  const after = controller.getViewport();
  assert.ok(after.xMin < before.xMin);
  assert.ok(Math.abs(after.xMax - after.xMin - (before.xMax - before.xMin)) < 1e-9);
});

check("controller fit restores the model extent", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  const fitted = controller.getViewport();
  controller.zoomAt(4, 200, 120);
  controller.fit();
  const restored = controller.getViewport();
  assert.ok(Math.abs(restored.xMin - fitted.xMin) < 1e-9);
  assert.ok(Math.abs(restored.yMax - fitted.yMax) < 1e-9);
});

check("setViewport normalizes reversed input", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  controller.setViewport({ xMin: 5, xMax: 1, yMin: 8, yMax: 2 }, false);
  const viewport = controller.getViewport();
  assert.ok(viewport.xMin < viewport.xMax);
  assert.ok(viewport.yMin < viewport.yMax);
  assert.strictEqual(viewport.xMin, 1);
  assert.strictEqual(viewport.xMax, 5);
});

check("setModel can preserve the viewport", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  controller.setViewport({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, false);
  const before = controller.getViewport();
  controller.setModel(sampleModel(), { fit: false });
  const after = controller.getViewport();
  assert.deepStrictEqual(after, before);
});

check("extras can be updated without breaking rendering", function () {
  const controller = graph.createViewportController({
    canvas: fakeCanvas(),
    model: sampleModel(),
  });
  controller.updateExtras({
    pointsOfInterest: [{ x: 0, y: 0, label: "root", color: "#fff" }],
    trace: null,
  });
  assert.strictEqual(controller.getState().extras.pointsOfInterest.length, 1);
  assert.strictEqual(controller.getState().rendered.curves.length, 1);
});


check("graph expressions accept definitions and compile", function () {
  const compiled = graph.compileExpression("f(x) = x^2 + 1");
  assert.strictEqual(compiled.ok, true);
  assert.strictEqual(compiled.evaluate(2), 5);
});

check("graph expressions reject equations", function () {
  const compiled = graph.compileExpression("x^2 = 4");
  assert.strictEqual(compiled.ok, false);
  assert.ok(/cannot contain/i.test(compiled.error));
});

check("graph expressions support parameter scopes", function () {
  const compiled = graph.compileExpression("a*x", { parameters: { a: 4 } });
  assert.strictEqual(compiled.ok, true);
  assert.strictEqual(compiled.evaluate(3), 12);
});

check("points of interest find roots and extrema", function () {
  const model = plot.buildPlotModel(function (x) {
    return x * x - 4;
  }, { xMin: -4, xMax: 4, samples: 400 });
  const points = graph.computePointsOfInterest(model, { includeIntersections: false });
  const roots = points.filter(function (point) { return point.type === "root"; });
  const minima = points.filter(function (point) { return point.type === "min"; });

  assert.ok(roots.length >= 2);
  assert.ok(roots.some(function (point) { return Math.abs(point.x - 2) < 0.02; }));
  assert.ok(roots.some(function (point) { return Math.abs(point.x + 2) < 0.02; }));
  assert.ok(minima.some(function (point) { return Math.abs(point.x) < 0.02; }));
});

check("parameters are discovered without constants", function () {
  assert.deepStrictEqual(graph.extractParameters("a*sin(x) + b"), ["a", "b"]);
  assert.deepStrictEqual(graph.extractParameters("sin(x) + pi"), []);
});

check("table values accept numbers and expressions", function () {
  assert.strictEqual(graph.tableValue("3.5", "rad"), 3.5);
  assert.ok(Math.abs(graph.tableValue("pi/2", "rad") - Math.PI / 2) < 1e-12);
  assert.strictEqual(graph.tableValue("x+1", "rad"), null);
});

check("points of interest find intersections", function () {
  const model = plot.buildPlotModel(null, {
    xMin: -5,
    xMax: 5,
    samples: 300,
    curves: [
      { evaluate: function (x) { return x; }, label: "f0(x)", color: "#f00" },
      { evaluate: function (x) { return -x; }, label: "f1(x)", color: "#00f" },
    ],
  });
  const points = graph.computePointsOfInterest(model);
  const intersections = points.filter(function (point) { return point.type === "intersection"; });

  assert.ok(intersections.some(function (point) { return Math.abs(point.x) < 0.02; }));
});

check("workspace discovers sliders and serializes state", function () {
  const doc = fakeDocument();
  const list = fakeElement("ul");
  const sliders = fakeElement("div");
  const status = fakeElement("p");
  const empty = fakeElement("p");
  const workspace = graph.createGraphWorkspace({
    document: doc,
    canvas: fakeCanvas(),
    list: list,
    sliders: sliders,
    status: status,
    empty: empty,
  });

  workspace.addExpression("a*x+1", { focus: false });
  assert.strictEqual(workspace.getExpressions()[0].text, "a*x+1");
  assert.strictEqual(workspace.getParameters().a, 1);
  assert.strictEqual(sliders.children.length, 1);

  workspace.setParameters({ a: 3 });
  workspace.rebuild();
  assert.strictEqual(workspace.getParameters().a, 3);

  const row = list.children[0];
  const actions = row.children[2];
  actions.children[1].listeners.click[0]();
  assert.strictEqual(workspace.getExpressions()[0].tableVisible, true);
  assert.strictEqual(workspace.getController().getState().rendered.points.length, 1);

  const saved = workspace.serialize();
  assert.strictEqual(saved.expressions.length, 1);
  assert.strictEqual(saved.parameters.a, 3);
  assert.strictEqual(saved.expressions[0].tableVisible, true);
  assert.ok(saved.viewport && Number.isFinite(saved.viewport.xMin));

  workspace.load(saved);
  assert.strictEqual(workspace.getExpressions()[0].text, "a*x+1");
  assert.strictEqual(workspace.getParameters().a, 3);
  assert.strictEqual(workspace.getExpressions()[0].tableVisible, true);
});

check("workspace load clamps stored parameters and text sizes", function () {
  const workspace = graph.createGraphWorkspace({
    document: fakeDocument(),
    canvas: fakeCanvas(),
    list: fakeElement("ul"),
    sliders: fakeElement("div"),
    status: fakeElement("p"),
    empty: fakeElement("p"),
  });

  workspace.load({
    expressions: [
      {
        text: "a*x",
        tableVisible: true,
        tableRows: [{ x: "9".repeat(600), y: "y".repeat(600) }],
      },
    ],
    parameters: { a: 999 },
  });

  assert.strictEqual(workspace.getParameters().a, 10);
  assert.strictEqual(workspace.getExpressions()[0].tableRows[0].x.length, 500);
  assert.strictEqual(workspace.getExpressions()[0].tableRows[0].y.length, 500);

  workspace.load({ expressions: [{ text: "x".repeat(600), tableRows: [] }] });
  assert.strictEqual(workspace.getExpressions()[0].text.length, 500);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
