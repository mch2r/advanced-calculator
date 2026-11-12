(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FunctionPalette = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CATEGORIES = [
    { id: "basic", label: "Basic" },
    { id: "trig", label: "Trig" },
    { id: "logs", label: "Logs" },
    { id: "calculus", label: "Calculus" },
  ];

  const CATALOG = [
    { id: "plus", category: "basic", label: "+", insert: "+", synonyms: "add plus sum" },
    { id: "minus", category: "basic", label: "\u2212", insert: "-", synonyms: "subtract minus difference" },
    { id: "times", category: "basic", label: "\u00d7", insert: "*", synonyms: "multiply times product" },
    { id: "divide", category: "basic", label: "\u00f7", insert: "/", synonyms: "divide quotient fraction" },
    { id: "power", category: "basic", label: "^", insert: "^", synonyms: "power exponent" },
    { id: "open", category: "basic", label: "(", insert: "(", synonyms: "open parenthesis bracket" },
    { id: "close", category: "basic", label: ")", insert: ")", synonyms: "close parenthesis bracket" },
    { id: "sqrt", category: "basic", label: "\u221a", insert: "sqrt(|)", synonyms: "square root radical" },
    { id: "cbrt", category: "basic", label: "\u221b", insert: "cbrt(|)", synonyms: "cube root" },
    { id: "abs", category: "basic", label: "|x|", insert: "abs(|)", synonyms: "absolute value magnitude" },
    { id: "pi", category: "basic", label: "\u03c0", insert: "pi", synonyms: "pi circle constant" },
    { id: "e", category: "basic", label: "e", insert: "e", synonyms: "euler constant exponential" },

    { id: "sin", category: "trig", label: "sin", insert: "sin(|)", synonyms: "sine" },
    { id: "cos", category: "trig", label: "cos", insert: "cos(|)", synonyms: "cosine" },
    { id: "tan", category: "trig", label: "tan", insert: "tan(|)", synonyms: "tangent" },
    { id: "asin", category: "trig", label: "sin\u207b\u00b9", insert: "asin(|)", synonyms: "arcsin inverse sine" },
    { id: "acos", category: "trig", label: "cos\u207b\u00b9", insert: "acos(|)", synonyms: "arccos inverse cosine" },
    { id: "atan", category: "trig", label: "tan\u207b\u00b9", insert: "atan(|)", synonyms: "arctan inverse tangent" },
    { id: "sinh", category: "trig", label: "sinh", insert: "sinh(|)", synonyms: "hyperbolic sine" },
    { id: "cosh", category: "trig", label: "cosh", insert: "cosh(|)", synonyms: "hyperbolic cosine" },
    { id: "tanh", category: "trig", label: "tanh", insert: "tanh(|)", synonyms: "hyperbolic tangent" },
    { id: "asinh", category: "trig", label: "sinh\u207b\u00b9", insert: "asinh(|)", synonyms: "inverse hyperbolic sine" },
    { id: "acosh", category: "trig", label: "cosh\u207b\u00b9", insert: "acosh(|)", synonyms: "inverse hyperbolic cosine" },
    { id: "atanh", category: "trig", label: "tanh\u207b\u00b9", insert: "atanh(|)", synonyms: "inverse hyperbolic tangent" },

    { id: "ln", category: "logs", label: "ln", insert: "ln(|)", synonyms: "natural log logarithm" },
    { id: "log10", category: "logs", label: "log\u2081\u2080", insert: "log10(|)", synonyms: "log base ten common logarithm" },
    { id: "log2", category: "logs", label: "log\u2082", insert: "log2(|)", synonyms: "log base two binary logarithm" },
    { id: "log", category: "logs", label: "log(x, b)", insert: "log(|, 10)", synonyms: "logarithm base" },
    { id: "exp", category: "logs", label: "e^x", insert: "e^(|)", synonyms: "exponential e power" },
    { id: "tenpow", category: "logs", label: "10^x", insert: "10^(|)", synonyms: "power of ten exponential" },

    { id: "ddx", category: "calculus", label: "d/dx", insert: "", mode: "derivative", synonyms: "derivative differentiate d dx" },
    { id: "ddx2", category: "calculus", label: "d\u00b2/dx\u00b2", insert: "", mode: "derivative", order: 2, synonyms: "second derivative" },
    { id: "integral", category: "calculus", label: "\u222b", insert: "", mode: "integral", synonyms: "integral integrate area" },
    { id: "infinity", category: "calculus", label: "\u221e", insert: "Infinity", synonyms: "infinity infinite limit" },
    { id: "dx", category: "calculus", label: "dx", insert: "dx", synonyms: "differential dx" },
  ];

  function normalizeQuery(query) {
    return String(query == null ? "" : query).trim().slice(0, 80).toLowerCase();
  }

  function matches(item, query) {
    if (!query) {
      return true;
    }

    const haystack = [
      item.label,
      item.insert,
      item.synonyms || "",
      item.category,
    ].join(" ").toLowerCase();

    return haystack.indexOf(query) >= 0;
  }

  function filterCatalog(query, category) {
    const search = normalizeQuery(query);
    const selected = category || "basic";

    return CATALOG.filter(function (item) {
      if (search) {
        return matches(item, search);
      }

      return item.category === selected;
    });
  }

  function applyInsertion(value, start, end, item) {
    const text = String(value == null ? "" : value);
    const selectionStart = Math.max(0, Math.min(start, end));
    const selectionEnd = Math.min(text.length, Math.max(start, end));
    const selected = text.slice(selectionStart, selectionEnd);
    const template = item && typeof item.insert === "string" ? item.insert : "";
    const marker = template.indexOf("|");
    let inserted;
    let caret;

    if (marker >= 0) {
      const before = template.slice(0, marker);
      const after = template.slice(marker + 1);
      const middle = selected || "";
      inserted = before + middle + after;
      caret = selectionStart + before.length + middle.length;
    } else {
      inserted = template;
      caret = selectionStart + inserted.length;
    }

    return {
      value: text.slice(0, selectionStart) + inserted + text.slice(selectionEnd),
      start: caret,
      end: caret,
    };
  }

  function createPalette(config) {
    const settings = config || {};
    const doc = settings.document || (typeof document !== "undefined" ? document : null);

    if (!doc) {
      return null;
    }

    const elements = {
      root: doc.getElementById("palette"),
      backdrop: doc.getElementById("palette-backdrop"),
      search: doc.getElementById("palette-search"),
      categories: doc.getElementById("palette-categories"),
      grid: doc.getElementById("palette-grid"),
      close: doc.getElementById("palette-close"),
      toggle: doc.getElementById("palette-toggle"),
    };

    if (!elements.root || !elements.grid) {
      return null;
    }

    let open = false;
    let category = "basic";
    let query = "";
    let items = [];
    let activeIndex = 0;
    let lastFocus = null;

    function emitOpenChange(value) {
      if (typeof settings.onOpenChange === "function") {
        settings.onOpenChange(value);
      }
    }

    function renderCategories() {
      if (!elements.categories) {
        return;
      }

      elements.categories.replaceChildren();

      for (const entry of CATEGORIES) {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "palette-category" + (entry.id === category && !query ? " is-active" : "");
        button.textContent = entry.label;
        button.dataset.category = entry.id;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(entry.id === category && !query));
        button.addEventListener("click", function () {
          category = entry.id;
          query = "";
          if (elements.search) {
            elements.search.value = "";
          }
          renderCategories();
          renderGrid();
        });
        elements.categories.appendChild(button);
      }
    }

    function renderGrid() {
      items = filterCatalog(query, category);
      activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, items.length - 1)));
      elements.grid.replaceChildren();

      if (items.length === 0) {
        const empty = doc.createElement("p");
        empty.className = "palette-empty";
        empty.textContent = "No functions match that search.";
        elements.grid.appendChild(empty);
        return;
      }

      items.forEach(function (item, index) {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "palette-key" + (index === activeIndex ? " is-highlighted" : "");
        button.dataset.id = item.id;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(index === activeIndex));
        button.title = item.synonyms || item.label;

        const label = doc.createElement("span");
        label.className = "palette-key-label";
        label.textContent = item.label;
        button.appendChild(label);

        button.addEventListener("mouseenter", function () {
          activeIndex = index;
          highlight();
        });

        button.addEventListener("click", function () {
          choose(item);
        });

        elements.grid.appendChild(button);
      });
    }

    function highlight() {
      const buttons = elements.grid.querySelectorAll(".palette-key");

      for (let i = 0; i < buttons.length; i += 1) {
        const selected = i === activeIndex;
        buttons[i].classList.toggle("is-highlighted", selected);
        buttons[i].setAttribute("aria-selected", String(selected));
      }

      if (buttons[activeIndex] && typeof buttons[activeIndex].scrollIntoView === "function") {
        buttons[activeIndex].scrollIntoView({ block: "nearest" });
      }
    }

    function choose(item) {
      if (!item) {
        return;
      }

      if (item.mode && typeof settings.onModeSwitch === "function") {
        settings.onModeSwitch(item);
      }

      if (item.insert && typeof settings.onInsert === "function") {
        settings.onInsert(item);
      }

      closePalette();
    }

    function openPalette() {
      if (open) {
        return;
      }

      open = true;
      lastFocus = doc.activeElement;
      query = "";
      activeIndex = 0;
      elements.root.hidden = false;

      if (elements.backdrop) {
        elements.backdrop.hidden = false;
      }

      if (elements.toggle) {
        elements.toggle.setAttribute("aria-expanded", "true");
      }

      renderCategories();
      renderGrid();

      if (elements.search) {
        elements.search.value = "";
        elements.search.focus();
      }

      emitOpenChange(true);
    }

    function closePalette() {
      if (!open) {
        return;
      }

      open = false;
      elements.root.hidden = true;

      if (elements.backdrop) {
        elements.backdrop.hidden = true;
      }

      if (elements.toggle) {
        elements.toggle.setAttribute("aria-expanded", "false");
      }

      emitOpenChange(false);

      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    function togglePalette() {
      if (open) {
        closePalette();
      } else {
        openPalette();
      }
    }

    function isOpen() {
      return open;
    }

    if (elements.toggle) {
      elements.toggle.addEventListener("click", function (event) {
        event.preventDefault();
        togglePalette();
      });
    }

    if (elements.close) {
      elements.close.addEventListener("click", function () {
        closePalette();
      });
    }

    if (elements.backdrop) {
      elements.backdrop.addEventListener("click", function () {
        closePalette();
      });
    }

    if (elements.search) {
      elements.search.addEventListener("input", function () {
        query = elements.search.value;
        activeIndex = 0;
        renderCategories();
        renderGrid();
      });

      elements.search.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          event.preventDefault();
          activeIndex = Math.max(0, Math.min(items.length - 1, activeIndex + 1));
          highlight();
          return;
        }

        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          event.preventDefault();
          activeIndex = Math.max(0, activeIndex - 1);
          highlight();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          choose(items[activeIndex]);
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          closePalette();
        }
      });
    }

    elements.root.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (
        event.target !== elements.search &&
        (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft")
      ) {
        event.preventDefault();

        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          activeIndex = Math.max(0, Math.min(items.length - 1, activeIndex + 1));
        } else {
          activeIndex = Math.max(0, activeIndex - 1);
        }

        highlight();
        const keys = elements.grid.querySelectorAll(".palette-key");

        if (keys[activeIndex] && typeof keys[activeIndex].focus === "function") {
          keys[activeIndex].focus();
        }

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = elements.root.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])");

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    doc.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
      }
    });

    return {
      open: openPalette,
      close: closePalette,
      toggle: togglePalette,
      isOpen: isOpen,
      refresh: renderGrid,
      elements: elements,
    };
  }

  return {
    CATEGORIES: CATEGORIES,
    CATALOG: CATALOG,
    filterCatalog: filterCatalog,
    applyInsertion: applyInsertion,
    createPalette: createPalette,
  };
});
