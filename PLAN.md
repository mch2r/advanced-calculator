# PLAN.md — Advanced Online Calculator

> **Document rule:** Every new decision, rule, or feature must be appended to this file as it is made. Keep the "Current Project State", "Decision Log", and "Next Steps" sections up to date.

## 1. Goals

Build a browser-based, keyboard-friendly online calculator that supports:

- Evaluating expressions with logarithms, Euler's number, and trigonometric functions.
- Solving equations for x numerically.
- Symbolic derivatives with step-by-step output.
- Definite integrals with numeric results and numeric step traces.
- A visible on-screen function button that opens a palette of supported functions/symbols.
- Typeset math output inspired by Desmos and Symbolab.
- An interactive graph with shaded area for definite integrals, pan/zoom, trace, and points of interest.
- A fifth Graph workspace for multiple expressions, tables, and parameter sliders.
- History and per-mode example prompts.
- An installable, offline-capable PWA published as a static website on GitHub Pages.

## 2. Current Project State

### Existing files

| File | Status | Purpose |
|---|---|---|
| `PLAN.md` | Working | Project specification, current state, decisions, roadmap, and deployment plan |
| `index.html` | Working | Five-mode UI, palette, graph workspace, steps, history, examples |
| `style.css` | Working | Dark calculator styling, palette, graph workspace/tables/sliders, responsive layout |
| `solver.js` | Working | Normalization, validation, root solving, angle mode, scoped evaluators, shared helpers |
| `calculus.js` | Working | Symbolic derivative tracer and adaptive Simpson integration |
| `plot.js` | Working | Plot model, viewport math, resampling, trace lookup, Canvas renderer |
| `graph.js` | Working | Viewport controller, graph workspace, POIs, tables, sliders, persistence payloads |
| `palette.js` | Working | Function catalog, search, insertion, dialog controller |
| `script.js` | Working | Five-mode controller, rendering, steps, graph, graph persistence, history, examples, DEG/RAD |
| `solver.test.js` | Working | 24 engine checks |
| `calculus.test.js` | Working | 30 derivative/integral/angle checks |
| `plot.test.js` | Working | 20 plot-model and viewport checks |
| `graph.test.js` | Working | 16 controller/workspace/POI/table/slider checks |
| `ui.test.js` | Working | 12 palette/history/mode checks |
| `pwa.test.js` | Working | 12 manifest/worker/install/registration checks |
| `run-tests.jsc.js` | Working | JavaScriptCore CommonJS/assert harness |
| `manifest.webmanifest` | Working | Installable PWA metadata and icons |
| `service-worker.js` | Working | Versioned app-shell cache, navigation fallback, asset refresh |
| `pwa.js` | Working | Service-worker registration, standalone detection, install prompt controller |
| `icons/` | Working | SVG source plus 192/512/maskable/Apple touch PNG icons |
| `.nojekyll` | Working | Disables Jekyll processing on GitHub Pages |
| `.gitignore` | Working | Excludes local OS/editor/secret files from Git |
| `vendor/math.js` | Vendored | math.js 15.2.0 browser bundle |
| `vendor/math.js.LICENSE.txt` | Vendored | math.js license |
| `vendor/katex/` | Vendored | KaTeX 0.16.11 JS, CSS, fonts, license |

### What currently works

- Keyboard-only input with autofocus.
- Five modes: **Evaluate**, **Solve**, **Derivative**, **Integral**, **Graph**.
- Evaluate mode returns a number for constants and treats expressions containing `x` as plottable functions.
- `Tab` cycles modes; `Shift+Tab` reverses; palette-open `Tab` stays in the dialog.
- `Enter` runs and records history; `Escape` closes the palette first, otherwise clears.
- Visible `ƒ(x)` palette with category tabs, search, keyboard navigation, focus trap, and `Ctrl/Cmd+K`.
- Unicode normalization:
  - `√` → `sqrt(...)`, `∛` → `cbrt(...)`
  - `π` → `pi`
  - `÷`, `×`, `·`, `−`, superscripts, `**`
  - `arcsin`/`arccos`/`arctan`, `ln`, `log_2`, `log_10`, `log₂`, `log₁₀`
- Numeric equation solving for real roots:
  - sign-change bracketing + bisection
  - even-multiplicity roots via derivative sign changes and minimization
  - discontinuity/asymptote rejection
  - underflow and zero-interval detection
- Symbolic derivatives via math.js with an AST step tracer:
  - constant, variable, sum, difference, product, quotient, power, chain rules
  - trig, inverse trig, hyperbolic, exp, log, sqrt, cbrt, abs
  - order 1–4, optional evaluation point, numeric fallback
- Definite integration via adaptive Simpson:
  - reversed limits, equal limits, discontinuity/asymptote detection
  - numeric step trace, evaluation count, error estimate
- DEG/RAD toggle applied through an AST transform in all modes.
- KaTeX typeset previews/results with plain-text fallback.
- Canvas graph: axes, grid, curve breaks, shaded integral area, root markers, `f`/`f'` overlays, HiDPI, responsive resize, text summary.
- Interactive graph viewport in both the mode graph and the fifth Graph workspace: drag/touch pan, cursor-anchored wheel/pinch zoom, double-click zoom, keyboard pan/zoom, trace readout, fit/reset.
- Fifth **Graph** tab with up to 8 expressions, visibility toggles, per-expression colors, points of interest (roots, extrema, y-intercepts, intersections), tables (up to 50 rows each), and parameter sliders.
- Graph workspace persisted to localStorage, including expressions, tables, sliders, visibility, and viewport under `advanced-calculator-graph`.
- Graph workspace includes a POI toggle, duplicate RAD/DEG controls, Fit view, and per-expression table/visibility controls.
- localStorage history (max 50, deduplicated, restore/rerun, clear).
- Empty-state example chips per mode.
- Strict symbol/function whitelist.
- Installable PWA shell:
  - web app manifest with 192/512 and maskable icons
  - versioned service worker precaching 81 app-shell URLs
  - navigation network-first with cached `index.html` offline fallback
  - same-origin asset cache-first behavior with background refresh
  - install button driven by `beforeinstallprompt`, hidden when unsupported or standalone
  - Apple touch icon and mobile web-app metadata
- Tests pass through the JavaScriptCore harness: 114 checks (24 solver + 30 calculus + 20 plot + 16 graph + 12 UI + 12 PWA).
  - Node is not installed, so `node` was not used.
  - All 81 service-worker app-shell paths were served successfully by a local HTTP server.

### Current limitations

- Solver scans only `[-100, 100]` by default and reports real roots only.
- Integral steps describe numeric Simpson subdivisions, not symbolic antiderivatives.
- Derivative step tracing covers the whitelist; unsupported expressions show the final derivative with a note.
- Graph requires manual browser verification for pointer/touch behavior; the fake DOM cannot fully exercise gestures.
- Graph expressions are functions of `x`; implicit equations and inequalities are not plotted.
- Graph parameter sliders use fixed `-10..10` bounds with `0.1` steps.
- PWA install/offline behavior still needs manual verification in a real browser; this environment has no Chrome.
- The install button appears only when a compatible browser fires `beforeinstallprompt`; iOS uses Share → Add to Home Screen.
- GitHub Pages publication is pending until a remote is configured and `main` is pushed.
- No symbolic/indefinite integration.
- No camera/handwriting input.

## 3. Confirmed Decisions

- **Integrals:** definite numeric only. No symbolic/indefinite integration.
- **Math library:** math.js, vendored locally.
- **Math rendering:** vendor KaTeX locally for input previews and results.
- **Input:** keyboard-driven plain-text input; on-screen keypad is not required.
- **Function palette:** a physical `ƒ(x)` button opens a category-tabbed popover/bottom sheet.
- **Modes:** Evaluate, Solve for x, Derivative, Integral, Graph.
- **Tab key:** cycles all five modes; Shift+Tab reverses.
- **Palette open:** Tab navigates inside the palette instead of switching modes.
- **Trig angles:** DEG/RAD toggle, applied consistently to all modes.
- **Derivatives:** symbolic result via math.js; step-by-step via a custom AST rule tracer.
- **Integral steps:** numeric method steps (adaptive Simpson), not symbolic antiderivative steps.
- **Graph:** custom Canvas plot with shaded area for integrals, a shared interactive viewport, and a fifth Graph workspace for multiple expressions/tables/sliders.
- **Graph expressions:** functions of `x` only; `y = ...` and `f(x) = ...` definitions are accepted, but implicit equations and inequalities are not.
- **Graph limits:** maximum 8 expressions, 50 table rows per expression, and parameter sliders with fixed `-10..10` bounds.
- **Graph persistence:** expressions, tables, slider values, visibility, and viewport persist in localStorage.
- **History:** localStorage, max 50 entries, created only on explicit run.
- **Examples:** empty-state chips per mode, including Graph examples.
- **Tests:** keep a dependency-free Node-style test file; also verify via the JavaScriptCore harness in this environment.
- **No build step:** plain scripts with the existing UMD/global-script pattern.
- **Delivery:** static website plus installable PWA, hosted on GitHub Pages.
- **Offline:** service-worker app-shell caching with no external CDN dependencies.
- **Deployment:** relative asset paths for project-site URLs under `/advanced-calculator/`.
- **PWA install UI:** show the install button only when `beforeinstallprompt` is available; hide it after install or in standalone mode.
- **Service-worker updates:** use a versioned cache name and `updateViaCache: "none"`; bump the version when deploying changed shell assets.
- **Not planned in this phase:** native App Store/Play Store packaging.

## 4. Feature Specification

### 4.1 Modes

#### Evaluate
- Constant expression input, or a single-variable expression in `x`.
- Supports logs, trig, `e`, powers, roots, arithmetic.
- Constant results are typeset; expressions containing `x` are treated as functions and plotted.

#### Solve for x
- Existing numeric root solving.
- Roots rendered as a list.
- Root markers drawn on the graph when applicable.

#### Derivative
- Inputs:
  - expression (`x^3`, `f(x)=x^3`, or `y=x^3`)
  - variable (default `x`)
  - order (1–4)
  - optional “evaluate at”
- Outputs:
  - simplified symbolic derivative
  - optional numeric value at the given point
  - collapsible step-by-step trace
- Graph overlays `f(x)` and the resulting derivative.

#### Integral
- Inputs:
  - integrand
  - variable
  - lower limit
  - upper limit
- Outputs:
  - numeric definite integral
  - warning states for discontinuities/undefined regions
  - numeric Simpson step trace
- Graph shades the area between limits.

#### Graph
- Fifth tab with a dedicated expressions sidebar and large interactive canvas.
- Expression input accepts normal expressions, `y = ...`, and `f(x) = ...`.
- Up to 8 expressions, each with:
  - color-coded curve
  - visibility toggle
  - optional table
  - parameter sliders discovered from symbols such as `a` and `b`
- Example expressions: `x^2 - 4`, `sin(x)`, `x^3 - 3x`, `1/x`.
- Tables accept numeric values or constant expressions and plot as scatter points.
- Points-of-interest toggle marks roots, local extrema, y-intercepts, and curve intersections.
- Canvas interactions:
  - drag/touch pan
  - wheel/pinch zoom anchored at the cursor or touch midpoint
  - double-click zoom
  - keyboard arrow pan and `+`/`-` zoom, `0`/`Home` fit
  - hover trace with coordinate readout
- Persistent workspace state survives reloads.
- Does not plot implicit equations, inequalities, or unsupported syntax.

### 4.2 Function Palette

- Visible `ƒ(x)` button at the right edge of the expression field.
- Desktop: popover under the button.
- Mobile: bottom sheet with backdrop and safe-area padding.
- Category tabs:
  - **Basic:** `+ − × ÷ ^ ( ) √ ∛ |x| π e`
  - **Trig:** `sin cos tan`, inverse and hyperbolic variants
  - **Logs:** `ln`, `log₁₀`, `log₂`, `log(x, base)`, `e^x`, `10^x`
  - **Calculus:** `d/dx`, `d²/dx²`, `∫`, `∞`, `dx`
- Search field filters by label and synonyms.
- Insertion behavior:
  - inserts at cursor
  - wraps selected text (e.g. `sin(selected)`)
  - returns focus to input
  - dispatches an input event for live preview
- Calculus keys switch modes:
  - `d/dx` → Derivative mode
  - `∫` → Integral mode
- Accessibility:
  - `role="dialog"`, `aria-expanded`, focus trap
  - click-outside and Escape close
  - keyboard navigation
  - `Ctrl/Cmd+K` toggles the palette

### 4.3 Results and Steps

- KaTeX-rendered previews and results.
- Plain-text fallback if KaTeX fails.
- Collapsible **Show steps** section:
  - derivative rule trace
  - integral Simpson trace
- Steps are real DOM content, not canvas.

### 4.4 Graph

- Custom Canvas renderer in `plot.js`; interactive controller/workspace in `graph.js`.
- Pure helpers:
  - `buildPlotModel(evaluate, options)` and `drawPlot(canvas, model, viewport, extras)`
  - viewport conversion, pan, cursor-anchored zoom, fit, resampling, trace lookup
  - points-of-interest detection
- Draws:
  - axes, grid, ticks, labels
  - curve with breaks at non-finite values
  - shaded integral area
  - root markers in Solve mode
  - `f(x)` and `f'(x)` in Derivative mode
  - function curve in Evaluate mode when `x` is present
  - table scatter points, POI dots, trace crosshair/readout
- Interactive shared viewport:
  - drag/touch pan, wheel/pinch zoom, double-click zoom
  - keyboard pan/zoom, fit/reset
  - viewport preserved across reruns within a mode
- Fifth **Graph** tab:
  - multiple expressions with per-expression colors and visibility
  - maximum 8 expressions
  - `y = ...` and `f(x) = ...` definitions accepted
  - parameter sliders discovered from symbols such as `a`, `b`
  - per-expression tables with numeric or constant-expression values
  - maximum 50 table rows per expression
  - POI toggle for roots, local extrema, y-intercepts, and curve intersections
  - localStorage persistence for expressions, tables, sliders, visibility, and viewport
  - expression/table editing, Fit view, and duplicate RAD/DEG controls
- Auto-fits ranges with percentile clipping to avoid asymptotes.
- Responsive resizing and HiDPI scaling.
- Accessible text summary fallback and graph readout.

### 4.5 History and Examples

- History:
  - stores mode, inputs, angle mode, result summary, timestamp
  - max 50 entries
  - deduplicates consecutive entries
  - click to restore and rerun
  - clear-all action
  - persisted in `localStorage`
- Examples:
  - Evaluate: `sin(pi/4)`, `ln(e^3)`, `log10(1000)`
  - Solve: `x^2-4x+4=0`, `sin(x)=0.5`
  - Derivative: `x^3-3x`, `sin(x)*e^x`
  - Integral: `x^2` from `0` to `1`
  - Graph: `x^2 - 4`, `sin(x)`, `x^3 - 3x`, `1/x`

### 4.6 DEG/RAD

- Toggle near the input and in the Graph workspace.
- Both toggles stay synchronized.
- Radians default.
- Applied before evaluation/solving/differentiation/integration/graphing via AST transform:
  - direct trig arguments × π/180
  - inverse trig results × 180/π

### 4.7 Installable PWA and Website

- The existing static app is installable as a progressive web app.
- Implemented files:
  - `manifest.webmanifest`
  - `service-worker.js`
  - `pwa.js`
  - `icons/icon.svg`
  - `icons/icon-192.png`
  - `icons/icon-512.png`
  - `icons/maskable-512.png`
  - `icons/apple-touch-icon.png`
  - `.nojekyll`
  - `.gitignore`
- Web app manifest:
  - name: **Advanced Calculator**
  - short name: **Calculator**
  - `display: standalone`
  - `start_url` and `scope`: `./`
  - theme/background: `#0f1115`
- Service worker:
  - versioned app-shell cache
  - all local scripts, styles, manifest, icons, math.js, KaTeX, and KaTeX fonts precached
  - navigation requests use network-first with cached `index.html` fallback
  - static assets use cache-first with background refresh
  - old caches removed on activation
- Install experience:
  - register the service worker on HTTPS or localhost
  - show an install button only when `beforeinstallprompt` is available
  - hide it after installation or when already running standalone
- GitHub Pages:
  - repository: `advanced-calculator`
  - URL: `https://<username>.github.io/advanced-calculator/`
  - relative paths so the project-site subpath works
  - local Git repository and initial commit prepared; no remote push is performed without explicit authorization

## 5. File Structure

```text
/Users/mark/my-first-project/
├── PLAN.md                  # this file
├── index.html               # 5 tabs, palette, mode fields, graph workspace, steps, history
├── style.css                # palette, fields, preview, graph, history, responsive
├── solver.js                # parse/validate/format helpers + angle transform
├── calculus.js              # derivative tracer + adaptive Simpson integral
├── plot.js                  # plot model, viewport helpers, canvas renderer
├── graph.js                 # viewport controller, graph workspace, POIs, tables, sliders
├── palette.js               # function catalog, categories, search, insertion
├── script.js                # mode controller, rendering, history, examples, graph persistence
├── solver.test.js           # 24 engine/regression tests
├── calculus.test.js         # 30 derivative/integral/angle tests
├── plot.test.js             # 20 plot-model + viewport tests
├── graph.test.js            # 16 controller/compilation/POI/workspace tests
├── ui.test.js               # 12 fake-DOM palette/history/mode tests
├── pwa.test.js              # 12 manifest/worker/install/registration tests
├── run-tests.jsc.js         # JavaScriptCore test harness
├── manifest.webmanifest     # PWA manifest and icon declarations
├── service-worker.js        # offline cache/update worker
├── pwa.js                   # service-worker registration + install prompt
├── icons/                   # SVG/PNG/maskable/Apple touch icons
├── .nojekyll                # GitHub Pages marker
├── .gitignore               # local-file exclusions
└── vendor/
    ├── math.js
    ├── math.js.LICENSE.txt
    └── katex/
        ├── katex.min.js
        ├── katex.min.css
        └── fonts/
```

Current script load order:

```html
<script src="vendor/math.js"></script>
<script src="vendor/katex/katex.min.js"></script>
<script src="solver.js"></script>
<script src="calculus.js"></script>
<script src="plot.js"></script>
<script src="graph.js"></script>
<script src="palette.js"></script>
<script src="script.js"></script>
<script src="pwa.js"></script>
```

## 6. Technical Design

### 6.1 Shared solver helpers

Expose/reuse from `solver.js`:

- `normalize(input)`
- `parseExpression(text, label)`
- `validateNode(node, allowedSymbols)`
- `cleanMessage(error)`
- `formatValue(value)`
- `formatRoot(value)`
- `applyAngleMode(node, angleMode)`
- TeX conversion helpers using `node.toTex()`

### 6.2 Derivative engine

- Parse and validate the expression.
- Accept `f(x)=...` and `y=...` forms.
- Apply DEG transform if needed.
- Symbolic final result:
  - `math.derivative(node, variable)` repeated by order
  - `math.simplify` in try/catch
- Step tracer:
  - recursive AST differentiation
  - rules: constant, symbol, sum/difference, product, quotient, power, chain
  - functions: trig/inverse trig/hyperbolic, exp, log, log10, log2, sqrt, abs where supported
  - each step records rule name, current expression, explanation
- Fallbacks:
  - unsupported rule → final derivative only, with a note
  - symbolic failure + evaluation point → central-difference numeric derivative

### 6.3 Integral engine

- Definite integral only.
- Adaptive Simpson:
  - tolerance ≈ `1e-8`
  - depth ≤ `20`
  - non-finite/discontinuity detection
- Reversed limits swap and negate.
- `a = b` returns `0`.
- Infinite limits rejected in v1 with a clear message.
- Numeric step trace:
  - initial interval
  - successive Simpson estimates
  - evaluation count
  - estimated error
  - final result

### 6.4 Validation and limits

- Extend normalization:
  - `arcsin`/`arccos`/`arctan`
  - `log_2(...)`
- Extend function whitelist for logs/trig/hyperbolic as needed.
- Variable whitelist per mode.
- Reject inequalities, assignments, and unknown functions.
- Caps:
  - expression length ≈ 500 chars
  - derivative order ≤ 4
  - palette search length 80
  - Simpson depth/evaluations
  - graph expressions ≤ 8
  - graph table rows ≤ 50 per expression
- Graph caps and limits:
  - viewport span clamped to `1e-9..1e12`
  - controller zoom factor clamped to `1e-6..1e6`
  - graph sampling defaults to 720 points after resampling
  - initial graph range is `x = -10..10`, then fitted to plotted data
  - trace hit radius is 20 px
  - parameter sliders use `-10..10` with step `0.1`
- Handle complex results in real calculus modes with clear messages.

### 6.5 Graph workspace and persistence

- `plot.js` owns pure viewport math:
  - normalization/clamping
  - screen↔world conversion
  - pan, anchor-preserving zoom, fit
  - curve resampling, trace lookup, scatter ranges
- `graph.js` owns:
  - pointer, wheel, pinch, double-click, and keyboard viewport interaction
  - expression compilation with optional parameter scope
  - parameter discovery and slider state
  - table parsing/plotting
  - POI detection (roots, extrema, y-intercepts, intersections)
  - workspace DOM and persistence payloads
- Persistence:
  - graph key: `advanced-calculator-graph`
  - history key: `advanced-calculator-history`
  - angle key: `advanced-calculator-angle`
  - load sanitizes expression text, expression count, table rows, slider values, and viewport
  - saves are suppressed until initial load completes so stored data is not overwritten

### 6.6 PWA and GitHub Pages design

- No build step; `pwa.js` registers `./service-worker.js` after the app loads.
- Cache name is versioned as `advanced-calculator-v1`; bump on each deployment.
- Precache 81 app-shell URLs, including every local script, style, manifest, icon, math.js, KaTeX asset, and KaTeX font.
- Fetch strategy:
  - navigation: network-first, cached `index.html` fallback
  - same-origin static assets: cache-first with background refresh
  - non-GET, Range, and cross-origin requests: pass through
- Service worker requires HTTPS or localhost.
- GitHub Pages project sites run under a subpath, so every URL must remain relative (`./...`).
- `.nojekyll` prevents Jekyll from altering static files.
- The install button uses `beforeinstallprompt` and `appinstalled`; it is hidden in standalone mode and where unsupported.
- Deployment is manual until credentials/remote configuration are explicitly provided.
- PWA static tests validate manifest metadata/icons, app-shell completeness and file existence, worker versioning/fallback, secure-context gating, registration options, and the install controller.

## 7. Keyboard and Accessibility

| Key | Behavior |
|---|---|
| `Enter` | Run current mode; in a graph expression row, add a new expression |
| `Escape` | Close palette if open; in Graph mode, return focus without clearing; otherwise clear |
| `Tab` | Cycle Evaluate → Solve → Derivative → Integral → Graph |
| `Shift+Tab` | Cycle backward |
| `Tab` (palette open) | Navigate palette keys |
| `Ctrl/Cmd+K` | Toggle palette; inserts into the focused graph expression when Graph mode is active |
| Arrow keys | Navigate palette; pan the graph canvas when focused |
| `+` / `-` | Zoom the focused graph canvas |
| `0` / `Home` | Fit the focused graph canvas |
| `Enter` in palette | Insert selected key |
| `Enter` in graph table | Add a table row |

- Palette has dialog semantics and focus management.
- Graph provides a text summary fallback, a live trace readout, keyboard-operable viewport, canvas labels, and labeled table/slider controls.
- Graph expression inputs, table inputs, sliders, visibility controls, and remove buttons have accessible labels.
- All interactive controls have visible focus styles.
- Respect `prefers-reduced-motion`.
- The install button exposes an accessible label and stays hidden until a compatible install prompt is available.

## 8. Testing Plan

Current automated baseline: **114 checks** = 24 solver + 30 calculus + 20 plot + 16 graph + 12 UI + 12 PWA.

### Solver and calculus engine tests (`solver.test.js`, `calculus.test.js`)

- Derivatives:
  - `x^3 → 3x^2`
  - `sin(x) → cos(x)`
  - `ln(x) → 1/x`
  - `e^x → e^x`
  - product, quotient, chain rules
  - second derivative
  - DEG mode
  - step trace consistent with final result
- Integrals:
  - `∫₀¹ x² dx = 1/3`
  - `∫₀^π sin(x) dx = 2`
  - `∫₁^e 1/x dx = 1`
  - `∫₀¹ √x dx = 2/3`
  - reversed bounds
  - `a = b`
  - discontinuity warning
- Evaluate:
  - logs, trig, `e`
  - DEG/RAD
- Existing solve/regression tests remain.

### Plot tests (`plot.test.js`)

- Range calculation, percentile clipping, discontinuity breaks
- Integral area limits, root markers, empty/invalid handling
- Screen/world conversion, cursor-anchored zoom, pan, fit
- Resampling, trace lookup, scatter-point ranges

### Graph tests (`graph.test.js`)

- Viewport controller fit/zoom/pan/render/model lifecycle
- Expression compilation, definitions, equations, parameters
- Parameter discovery, table values, POIs (roots/extrema/intersections)
- Workspace slider/table/serialize/load behavior
- Visibility/table toggles and scoped evaluator support

### UI tests (`ui.test.js`)

- Five-mode Tab cycling and Shift+Tab
- Palette open/close, search, insertion at cursor/selection
- Escape precedence (palette first), including Graph mode
- History restore and clear
- Steps expand/collapse

### PWA static tests (`pwa.test.js`)

- Manifest JSON validity, standalone metadata, and 192/512/maskable icons
- Index manifest/icon/theme integration and install-script order
- Complete same-origin app-shell list with every referenced file present
- Cache versioning, navigation fallback, activation cleanup, and client claiming
- Same-origin GET filtering and Range-request pass-through
- Standalone detection and HTTPS/localhost registration gating
- Relative registration path with update-safe options
- Install controller show/hide and prompt consumption

### Manual browser checks

- Safari/Chrome pointer, wheel, pinch, and double-click graph gestures
- First PWA load online, then offline reload and cached asset reuse
- Install prompt/button, standalone launch, and update behavior
- iOS Add to Home Screen and standalone launch
- localStorage persistence across reloads and PWA restarts
- GitHub Pages subpath asset loading

### Security tests

- Unsupported functions and identifiers rejected
- No parser escape routes

## 9. Implementation Order / Next Steps

### Completed

1. **Vendored KaTeX 0.16.11** — JS, CSS, fonts, license in `vendor/katex/`.
2. **Built the initial shell** — originally four tabs; later extended to five with Graph, plus palette markup, mode fields, preview, steps, graph, history, examples, responsive CSS.
3. **Refactored `solver.js`** — shared helpers, `applyAngleMode`, `toTex`, extended normalization, exports.
4. **Implemented `calculus.js`** — derivative engine/step tracer, adaptive Simpson integral/trace.
5. **Implemented `plot.js`** — pure model + Canvas renderer.
6. **Implemented `palette.js`** — catalog, search, insertion, dialog behavior.
7. **Refactored `script.js`** — originally four-mode, later five-mode controller; per-mode inputs, rendering, steps, graph, graph persistence, examples, history, DEG/RAD, keyboard.
8. **Interactive graph (G0–G2)** — viewport math, scoped evaluators, trace, POIs, shared controller, fifth Graph tab with multi-curve plotting.
9. **Graph tables and sliders (G3–G4)** — per-expression tables, scatter points, discovered parameter sliders, live rebuilds.
10. **Graph persistence and polish (G5)** — localStorage persistence, responsive layout, keyboard/touch affordances.
11. **Verification** — 114 checks pass via `run-tests.jsc.js`; fake-DOM smoke run exercises Evaluate, Solve, Derivative, Integral, steps, mode graph, fifth Graph workspace, history, and palette.
12. **Documentation reconciliation** — state tables, counts, Graph mode, load order, caps, and PWA/deployment notes brought up to date.
13. **PWA implementation** — manifest, service worker, registration script, icons, install button, mobile metadata, `.nojekyll`, and `.gitignore`.
14. **PWA verification** — 12 static tests pass; all 81 app-shell paths return HTTP 200 from a local server.
15. **Local Git preparation** — initialize `main` and create the initial commit; no remote or push.

### Remaining deployment phase

1. **Browser verification** — install prompt, standalone launch, offline reload, and update flow in a real browser.
2. **GitHub repository** — user creates `advanced-calculator` on GitHub.
3. **Publish** — add the remote, push `main`, and enable Pages from `main`/root.
4. **Live verification** — check the project-site subpath, assets, offline reload, and installability.

### Remaining / future

- Manual pass in Safari/Chrome (this environment has no Node or Chrome).
- Optional: widen solver scan range or make it configurable.
- Optional: expand the derivative tracer's supported function set.
- Pending: browser install/offline verification and GitHub Pages publication.

## 10. Scope Boundaries

- No symbolic/indefinite integration.
- Integral steps describe the numerical method, not symbolic antiderivatives.
- Derivative step tracing covers the supported function whitelist; exotic expressions fall back to the final derivative.
- Manual browser verification remains required for pointer/touch gestures.
- Graph expressions are functions of `x`; implicit equations and inequalities are not plotted.
- Sliders currently use fixed -10..10 bounds with 0.1 steps.
- Graph supports at most 8 expressions and 50 table rows per expression.
- PWA app-shell delivery is implemented; GitHub Pages publication is pending.
- PWA installation requires HTTPS or localhost; first load must be online.
- Install prompts are browser-dependent; iOS uses Share → Add to Home Screen.
- Native App Store/Play Store packaging is out of scope for this phase.
- No camera/handwriting input.
- No step-by-step solver for equations (only derivatives/integrals).

## 11. Session / Resumability Notes

- Original full implementation estimate: roughly 135k–280k tokens including tests and debugging; later Graph/PWA work adds to this.
- Context/usage limits are provider-specific; the build does not continue automatically after a limit.
- Files already written persist; a new session can resume by reading this plan, the todo list, and the existing files.
- Recommended checkpoints:
  - After KaTeX + shell
  - After `solver.js` refactor + angle mode
  - After `calculus.js` + tests
  - After `plot.js`
  - After palette + UI controller
  - After Graph workspace/tables/sliders/persistence
  - After PWA implementation
  - After GitHub Pages deployment
- Keep this file updated as phases complete.

## 12. Decision Log

| Date | Decision |
|---|---|
| 2026-11-09 | Project plan created and saved to `PLAN.md`. |
| 2026-11-09 | Definite numeric integration only; no symbolic/indefinite integrals. |
| 2026-11-09 | Vendor KaTeX locally for typeset output. |
| 2026-11-09 | Tab cycles all four modes; Shift+Tab reverses. **Superseded 2026-11-10 by five-mode Tab.** |
| 2026-11-09 | DEG/RAD toggle included and applied consistently. |
| 2026-11-09 | Graph/area plot, step-by-step output, example chips, and history included. |
| 2026-11-09 | Derivative steps use a custom AST tracer; integral steps describe adaptive Simpson numerically. |
| 2026-11-09 | History uses localStorage, max 50 entries, created only on explicit run. |
| 2026-11-09 | Every future decision/rule/feature must be appended to this document. |
| 2026-11-09 | Vendored KaTeX 0.16.11 (JS, CSS, all woff2 fonts, license) under `vendor/katex/`. |
| 2026-11-09 | Added `run-tests.jsc.js`, a dependency-free JavaScriptCore CommonJS/assert harness, because Node is unavailable. |
| 2026-11-09 | Kept Evaluate mode constant-only (`x` rejected) to preserve existing regression behavior; evaluate-mode graphing is deferred. **Superseded by the later Evaluate-accepts-`x` review entry.** |
| 2026-11-09 | Degree mode is implemented as an AST transform: circular trig arguments × π/180, inverse trig results × 180/π. |
| 2026-11-09 | Integral discontinuity detection samples the interval and rejects sign changes between large-magnitude neighbors (catches `1/x`-style asymptotes). |
| 2026-11-09 | Plot y-range uses 2nd/98th percentile clipping so asymptotes do not dominate the view. |
| 2026-11-09 | Palette search overrides the active category and searches labels, inserts, synonyms, and categories. |
| 2026-11-09 | Tab is globally reserved for mode cycling; palette-open Tab is trapped inside the dialog. |
| 2026-11-09 | Review: Evaluate mode now accepts `x`, returning a function result and graph instead of an error. |
| 2026-11-09 | Review: symbolic derivative failure with an evaluation point falls back to a numeric nth-order central difference; without a point it reports a clear error. |
| 2026-11-09 | Review: palette selection wrapping only applies to template keys (`sin(|)`), so constants like `π` replace the selection instead of producing `pi(...)`. |
| 2026-11-09 | Review: palette search state resets when reopening; `∞` inserts `Infinity`; palette Escape closes even when focus is outside the dialog. |
| 2026-11-09 | Review: integration now rejects non-finite estimates and warns on large interior spikes or large estimated error. |
| 2026-11-09 | Review: root values are rendered once (`x = 2`, not `x = x = 2`); solve graphs also appear when no real roots are found. |
| 2026-11-10 | Review: history loading filters invalid entries and storage access is guarded; palette search/category navigation clamps empty result sets; plot ranges center a single far-away root and no longer force zero for offset functions. |
| 2026-11-10 | Review: expression length is capped at 500 characters, palette search at 80, and nonsmooth derivative point fallbacks add an approximation note. |
| 2026-11-10 | Review: zero-run root candidates are collected before sorting/merging. Underflow-only zero runs are ignored (`neighborScale <= valueTol`), and a quarter-point probe distinguishes a true zero interval from isolated roots that land on adjacent sample points. |
| 2026-11-10 | Added a fifth Graph tab; Tab now cycles all five modes. |
| 2026-11-10 | Graph interaction is shared by mode graphs and the Graph tab via `graph.js` viewport controllers. |
| 2026-11-10 | Graph workspace supports multiple colored expressions, visibility, tables, sliders, POIs, and localStorage persistence. |
| 2026-11-10 | Scoped evaluator support added to `solver.makeEvaluator` for graph parameters. |
| 2026-11-10 | Zoom uses cursor/touch-midpoint anchoring; fit uses plot points with percentile y-clipping and padding. |
| 2026-11-10 | PLAN.md reconciled with all Graph work: five modes, new files, 102 test counts, caps, persistence, and load order. |
| 2026-11-10 | Delivery decision: static website + installable PWA, hosted on GitHub Pages. |
| 2026-11-10 | PWA plan: manifest, service worker, install prompt, icons, offline app-shell cache, HTTPS/localhost requirement. |
| 2026-11-10 | GitHub Pages repository name: `advanced-calculator`; all paths remain relative for the project-site subpath. |
| 2026-11-10 | Git will be initialized and committed locally; no remote push without explicit authorization. |
| 2026-11-11 | PWA implemented: manifest, versioned service worker, registration/install script, SVG/PNG icons, install button, and mobile metadata. |
| 2026-11-11 | App-shell cache `advanced-calculator-v1` precaches 81 same-origin URLs; navigation is network-first with cached `index.html` fallback. |
| 2026-11-11 | PWA static tests added; total automated baseline is 114 checks. |
| 2026-11-11 | Added `.nojekyll` and `.gitignore`; initialized local Git and created the initial commit without a remote. |

## 13. Deployment Checklist

1. [x] Add `manifest.webmanifest`, `service-worker.js`, `pwa.js`, and icon assets.
2. [x] Add head metadata, install button markup, and styles.
3. [x] Run the 114-check suite and local HTTP smoke test.
4. [ ] Verify install prompt, standalone launch, and offline reload in a browser.
5. [x] Add `.nojekyll` and `.gitignore`.
6. [x] Initialize Git on `main` and create an initial commit.
7. [ ] Create the GitHub repository `advanced-calculator`.
8. [ ] Add the remote and push `main`.
9. [ ] Enable GitHub Pages from `main` / root.
10. [ ] Verify `https://<username>.github.io/advanced-calculator/` loads all assets, works offline, and remains installable.

