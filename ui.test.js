"use strict";

const assert = require("node:assert");
const paletteLib = require("./palette.js");
const ui = require("./script.js");

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

function FakeElement(tag, doc) {
  this.tagName = String(tag).toUpperCase();
  this.ownerDocument = doc;
  this.children = [];
  this.listeners = {};
  this.attributes = {};
  this.dataset = {};
  this.className = "";
  this.textContent = "";
  this.value = "";
  this.hidden = false;
  this.parentNode = null;

  const self = this;
  this.classList = {
    toggle: function (name, force) {
      const classes = self.className.split(/\s+/).filter(Boolean);
      const index = classes.indexOf(name);
      const shouldAdd = force === undefined ? index < 0 : Boolean(force);

      if (shouldAdd && index < 0) {
        classes.push(name);
      } else if (!shouldAdd && index >= 0) {
        classes.splice(index, 1);
      }

      self.className = classes.join(" ");
    },
    add: function (name) {
      self.classList.toggle(name, true);
    },
    remove: function (name) {
      self.classList.toggle(name, false);
    },
    contains: function (name) {
      return self.className.split(/\s+/).indexOf(name) >= 0;
    },
  };
}

FakeElement.prototype.appendChild = function (child) {
  child.parentNode = this;
  this.children.push(child);
  return child;
};

FakeElement.prototype.replaceChildren = function () {
  this.children = [];

  for (let i = 0; i < arguments.length; i += 1) {
    this.appendChild(arguments[i]);
  }
};

FakeElement.prototype.addEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    this.listeners[type] = [];
  }

  this.listeners[type].push(callback);
};

FakeElement.prototype.dispatch = function (type, properties) {
  const event = Object.assign(
    { type: type, target: this, preventDefault: function () {}, stopPropagation: function () {} },
    properties || {}
  );
  const list = this.listeners[type] || [];

  for (let i = 0; i < list.length; i += 1) {
    list[i](event);
  }

  return event;
};

FakeElement.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};

FakeElement.prototype.getAttribute = function (name) {
  return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
};

FakeElement.prototype.focus = function () {
  if (this.ownerDocument) {
    this.ownerDocument.activeElement = this;
  }
};

FakeElement.prototype.scrollIntoView = function () {};

FakeElement.prototype.querySelectorAll = function (selector) {
  const results = [];

  function walk(node) {
    for (const child of node.children) {
      if (selector === ".palette-key" && child.classList.contains("palette-key")) {
        results.push(child);
      } else if (selector === ".palette-category" && child.classList.contains("palette-category")) {
        results.push(child);
      } else if (selector.indexOf("button") === 0 && child.tagName === "BUTTON") {
        results.push(child);
      }

      walk(child);
    }
  }

  walk(this);
  return results;
};

function FakeDocument() {
  this.elements = {};
  this.listeners = {};
  this.activeElement = null;
}

FakeDocument.prototype.getElementById = function (id) {
  return this.elements[id] || null;
};

FakeDocument.prototype.createElement = function (tag) {
  return new FakeElement(tag, this);
};

FakeDocument.prototype.addEventListener = function (type, callback) {
  if (!this.listeners[type]) {
    this.listeners[type] = [];
  }

  this.listeners[type].push(callback);
};

FakeDocument.prototype.dispatch = function (type, properties) {
  const event = Object.assign(
    { type: type, target: this, preventDefault: function () {}, stopPropagation: function () {} },
    properties || {}
  );
  const list = this.listeners[type] || [];

  for (let i = 0; i < list.length; i += 1) {
    list[i](event);
  }
};

function buildPaletteDocument() {
  const doc = new FakeDocument();
  const ids = ["palette", "palette-backdrop", "palette-search", "palette-categories", "palette-grid", "palette-close", "palette-toggle"];

  for (const id of ids) {
    const tag = id === "palette-search" ? "input" : "div";
    const element = doc.createElement(tag);
    element.id = id;
    doc.elements[id] = element;
  }

  return doc;
}

function findButtonByDataset(container, key, value) {
  for (const child of container.children) {
    if (child.dataset && child.dataset[key] === value) {
      return child;
    }
  }

  return null;
}

check("mode cycling wraps in both directions", function () {
  assert.strictEqual(ui.cycleMode("evaluate", 1), "solve");
  assert.strictEqual(ui.cycleMode("solve", 1), "derivative");
  assert.strictEqual(ui.cycleMode("integral", 1), "graph");
  assert.strictEqual(ui.cycleMode("graph", 1), "evaluate");
  assert.strictEqual(ui.cycleMode("evaluate", -1), "graph");
  assert.strictEqual(ui.cycleMode("solve", -1), "evaluate");
});

check("history store caps, deduplicates, and clears", function () {
  const storage = {
    data: {},
    getItem: function (key) {
      return this.data[key] || null;
    },
    setItem: function (key, value) {
      this.data[key] = value;
    },
  };
  const store = ui.createHistoryStore("test-history", storage);
  store.load();

  for (let i = 0; i < 60; i += 1) {
    store.add({ mode: "evaluate", inputs: { expression: String(i) }, summary: String(i), timestamp: i });
  }

  assert.strictEqual(store.list().length, 50);
  assert.strictEqual(store.list()[0].summary, "59");

  store.add({ mode: "evaluate", inputs: { expression: "59" }, summary: "59", timestamp: 60 });
  assert.strictEqual(store.list().length, 50);

  store.clear();
  assert.strictEqual(store.list().length, 0);
});

check("palette filters by label and synonyms", function () {
  const roots = paletteLib.filterCatalog("root", "basic").map(function (item) {
    return item.id;
  });
  assert.ok(roots.indexOf("sqrt") >= 0);
  assert.ok(roots.indexOf("cbrt") >= 0);

  const logs = paletteLib.filterCatalog("", "logs");
  assert.ok(logs.length >= 4);
  assert.ok(logs.every(function (item) {
    return item.category === "logs";
  }));
});

check("palette finds tangent and inverse tangent synonyms", function () {
  const tangent = paletteLib.filterCatalog("tangent", "trig").map(function (item) {
    return item.id;
  });
  const inverse = paletteLib.filterCatalog("inverse tangent", "trig").map(function (item) {
    return item.id;
  });

  assert.ok(tangent.indexOf("tan") >= 0);
  assert.ok(inverse.indexOf("atan") >= 0);
});

check("palette insertion handles cursor and selections", function () {
  const plain = paletteLib.applyInsertion("2+", 2, 2, { insert: "sin(|)" });
  assert.strictEqual(plain.value, "2+sin()");
  assert.strictEqual(plain.start, 6);

  const wrapped = paletteLib.applyInsertion("2+x", 2, 3, { insert: "sin(|)" });
  assert.strictEqual(wrapped.value, "2+sin(x)");
  assert.strictEqual(wrapped.start, 7);

  const plus = paletteLib.applyInsertion("2", 1, 1, { insert: "+" });
  assert.strictEqual(plus.value, "2+");
  assert.strictEqual(plus.start, 2);

  const constant = paletteLib.applyInsertion("x", 0, 1, { insert: "pi" });
  assert.strictEqual(constant.value, "pi");
  assert.strictEqual(constant.start, 2);

  const dx = paletteLib.applyInsertion("x", 0, 1, { insert: "dx" });
  assert.strictEqual(dx.value, "dx");
});

check("palette opens, searches, and inserts a key", function () {
  const doc = buildPaletteDocument();
  const inserted = [];
  const palette = paletteLib.createPalette({
    document: doc,
    onInsert: function (item) {
      inserted.push(item);
    },
  });

  assert.ok(palette);

  palette.open();
  assert.strictEqual(doc.getElementById("palette").hidden, false);
  assert.strictEqual(doc.getElementById("palette-toggle").getAttribute("aria-expanded"), "true");
  assert.strictEqual(doc.activeElement, doc.getElementById("palette-search"));
  assert.ok(doc.getElementById("palette-grid").children.length > 0);

  const search = doc.getElementById("palette-search");
  search.value = "sin";
  search.dispatch("input");

  const keys = doc.getElementById("palette-grid").querySelectorAll(".palette-key");
  assert.ok(keys.length >= 1);
  assert.strictEqual(keys[0].dataset.id, "sin");

  search.dispatch("keydown", { key: "Enter" });
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0].id, "sin");
  assert.strictEqual(doc.getElementById("palette").hidden, true);
});

check("palette navigation survives empty results", function () {
  const doc = buildPaletteDocument();
  const palette = paletteLib.createPalette({ document: doc });
  palette.open();

  const search = doc.getElementById("palette-search");
  search.value = "zzzz";
  search.dispatch("input");
  search.dispatch("keydown", { key: "ArrowDown" });
  search.dispatch("keydown", { key: "ArrowUp" });

  search.value = "sin";
  search.dispatch("input");
  const keys = doc.getElementById("palette-grid").querySelectorAll(".palette-key");
  assert.ok(keys.length >= 1);
  assert.ok(keys[0].classList.contains("is-highlighted"));
});

check("reopening the palette resets a stale search", function () {
  const doc = buildPaletteDocument();
  const palette = paletteLib.createPalette({ document: doc });
  palette.open();

  const search = doc.getElementById("palette-search");
  search.value = "sin";
  search.dispatch("input");
  palette.close();
  palette.open();

  assert.strictEqual(search.value, "");
  assert.strictEqual(doc.getElementById("palette-grid").querySelectorAll(".palette-key").length, 12);
});

check("calculus keys switch modes", function () {
  const doc = buildPaletteDocument();
  const modes = [];
  const palette = paletteLib.createPalette({
    document: doc,
    onModeSwitch: function (item) {
      modes.push(item.mode);
    },
  });

  palette.open();
  const categories = doc.getElementById("palette-categories");
  const calculus = findButtonByDataset(categories, "category", "calculus");
  assert.ok(calculus);
  calculus.dispatch("click");

  const grid = doc.getElementById("palette-grid");
  const first = grid.children[0];
  assert.ok(first);
  first.dispatch("click");
  assert.strictEqual(modes[0], "derivative");
  assert.strictEqual(doc.getElementById("palette").hidden, true);
});

check("palette escape closes first", function () {
  const doc = buildPaletteDocument();
  const palette = paletteLib.createPalette({ document: doc });
  palette.open();
  assert.strictEqual(palette.isOpen(), true);

  doc.getElementById("palette-search").dispatch("keydown", { key: "Escape" });
  assert.strictEqual(palette.isOpen(), false);
  assert.strictEqual(doc.getElementById("palette").hidden, true);
});

check("palette backdrop closes the dialog", function () {
  const doc = buildPaletteDocument();
  const palette = paletteLib.createPalette({ document: doc });
  palette.open();
  doc.getElementById("palette-backdrop").dispatch("click");
  assert.strictEqual(palette.isOpen(), false);
});

check("Ctrl/Cmd+K toggles the palette", function () {
  const doc = buildPaletteDocument();
  const palette = paletteLib.createPalette({ document: doc });
  doc.dispatch("keydown", { key: "k", metaKey: true });
  assert.strictEqual(palette.isOpen(), true);
  doc.dispatch("keydown", { key: "k", ctrlKey: true });
  assert.strictEqual(palette.isOpen(), false);
});

check("timestamp formatting is non-empty", function () {
  assert.ok(ui.formatTimestamp(Date.now()).length > 0);
});

check("integral plot options fit and label the bounds", function () {
  const options = ui.buildIntegralPlotOptions({
    lower: 0,
    upper: Math.PI,
    lowerText: "0",
    upperText: "π",
    evaluate: function () { return 0; },
  });

  assert.strictEqual(options.xMin, 0);
  assert.strictEqual(options.xMax, Math.PI);
  assert.strictEqual(options.area.from, 0);
  assert.strictEqual(options.area.to, Math.PI);
  assert.strictEqual(options.area.fromLabel, "0");
  assert.strictEqual(options.area.toLabel, "π");
});

check("integral TeX brackets the integrand and uses pi bounds", function () {
  const tex = ui.buildIntegralTex({
    lower: 0,
    upper: Math.PI,
    lowerTex: "0",
    upperTex: "\\pi",
    tex: "x^2",
    variable: "x",
    value: Math.PI,
  });

  assert.ok(tex.indexOf("\\left[x^2\\right]") >= 0);
  assert.ok(tex.indexOf("^{\\pi}") >= 0);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");

if (failed > 0) {
  process.exitCode = 1;
}
