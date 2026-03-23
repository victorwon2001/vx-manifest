const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUi = require("../shared/module-ui.js");

test("shared module ui exposes fixed light admin tokens", () => {
  assert.deepEqual(moduleUi.TOKENS, {
    bg: "#f4f7fb",
    surface: "#ffffff",
    surfaceAlt: "#f8fafc",
    primary: "#2563eb",
    primaryStrong: "#1d4ed8",
    success: "#15803d",
    warning: "#d97706",
    danger: "#dc2626",
    text: "#0f172a",
    muted: "#64748b",
    border: "#dbe3ef",
    shadow: "0 12px 32px rgba(15,23,42,.12)",
  });
});

test("buildModuleUiCss contains the shared class contract and density variants", () => {
  const css = moduleUi.buildModuleUiCss();

  assert.match(css, /\.tm-ui-root/);
  assert.match(css, /\.tm-ui-card/);
  assert.match(css, /\.tm-ui-btn/);
  assert.match(css, /\.tm-ui-btn--primary/);
  assert.match(css, /\.tm-ui-table/);
  assert.match(css, /\.tm-ui-badge--success/);
  assert.match(css, /\.tm-ui-modal/);
  assert.match(css, /\.tm-ui-log/);
  assert.match(css, /\[data-tm-density='compact'\]/);
  assert.match(css, /\[data-tm-density='normal'\]/);
});

test("buildRootAttributes creates class and density attributes for module roots", () => {
  const panelAttrs = moduleUi.buildRootAttributes({ kind: "panel", density: "normal", className: "custom-panel" });
  const embeddedAttrs = moduleUi.buildRootAttributes({ kind: "embedded", density: "compact" });

  assert.match(panelAttrs, /class="tm-ui-root tm-ui-panel custom-panel"/);
  assert.match(panelAttrs, /data-tm-density="normal"/);
  assert.match(embeddedAttrs, /class="tm-ui-root tm-ui-embedded"/);
  assert.match(embeddedAttrs, /data-tm-density="compact"/);
});
