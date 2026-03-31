const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUi = require("../shared/module-ui.js");

test("shared module ui exposes fixed light admin tokens", () => {
  assert.deepEqual(moduleUi.TOKENS, {
    bg: "#f5f6f7",
    surface: "#ffffff",
    surfaceAlt: "#f1f3f4",
    primary: "#2d5fd4",
    primaryStrong: "#1f49b6",
    success: "#2d5fd4",
    warning: "#c95151",
    danger: "#c95151",
    text: "#17191b",
    muted: "#63696e",
    border: "#d9dde2",
    shadow: "0 20px 44px rgba(17,25,32,.12)",
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
  assert.match(css, /\.tm-ui-dock/);
  assert.match(css, /\.tm-ui-dock__toggle/);
  assert.match(css, /\.tm-ui-dock__panel/);
  assert.match(css, /position:sticky;top:0/);
  assert.match(css, /text-align:center/);
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
