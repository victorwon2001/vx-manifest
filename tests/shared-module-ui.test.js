const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUi = require("../shared/module-ui.js");

test("shared module ui exposes fixed light admin tokens", () => {
  assert.deepEqual(moduleUi.TOKENS, {
    bg: "#f9f9f9",
    surface: "#ffffff",
    surfaceAlt: "#f2f4f4",
    primary: "#546067",
    primaryStrong: "#455a64",
    success: "#2f6b57",
    warning: "#8b6b3f",
    danger: "#9f403d",
    text: "#2d3435",
    muted: "#5a6061",
    border: "#dde4e5",
    shadow: "0 20px 40px rgba(45,52,53,.08)",
  });
});

test("buildModuleUiCss contains the shared class contract and density variants", () => {
  const css = moduleUi.buildModuleUiCss();

  assert.match(css, /fonts\.googleapis\.com/);
  assert.match(css, /\.tm-ui-root/);
  assert.match(css, /\.tm-ui-card/);
  assert.match(css, /\.tm-ui-panel-head/);
  assert.match(css, /\.tm-ui-section-head/);
  assert.match(css, /\.tm-ui-statusbar/);
  assert.match(css, /\.tm-ui-kpi/);
  assert.match(css, /\.tm-ui-btn/);
  assert.match(css, /\.tm-ui-btn--primary/);
  assert.match(css, /\.tm-ui-table/);
  assert.match(css, /\.tm-ui-badge--success/);
  assert.match(css, /\.tm-ui-modal/);
  assert.match(css, /\.tm-ui-log/);
  assert.match(css, /@keyframes tm-ui-rise/);
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

test("shared module ui exposes the external font import url", () => {
  assert.equal(
    moduleUi.FONT_IMPORT_URL,
    "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap"
  );
});
