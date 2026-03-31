const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUi = require("../shared/module-ui.js");

test("shared module ui exposes fixed light admin tokens", () => {
  assert.deepEqual(moduleUi.TOKENS, {
    bg: "#f3f4f5",
    surface: "#ffffff",
    surfaceAlt: "#eef0f2",
    primary: "#245ad4",
    primaryStrong: "#1a44a8",
    success: "#245ad4",
    warning: "#c24d4d",
    danger: "#c24d4d",
    text: "#15181a",
    muted: "#5d656d",
    border: "#d7dbe0",
    shadow: "0 24px 56px rgba(15,23,32,.14)",
  });
});

test("buildModuleUiCss contains the shared class contract and density variants", () => {
  const css = moduleUi.buildModuleUiCss();

  assert.match(css, /projectnoonnu\/pretendard@1\.0\/Pretendard-Regular\.woff2/);
  assert.match(css, /font-family:'Pretendard'/);
  assert.match(css, /\.tm-ui-root/);
  assert.match(css, /\.tm-ui-toolbar__group/);
  assert.match(css, /\.tm-ui-toolbar__actions/);
  assert.match(css, /\.tm-ui-card/);
  assert.match(css, /\.tm-ui-panel-head/);
  assert.match(css, /\.tm-ui-section-head/);
  assert.match(css, /\.tm-ui-statusbar/);
  assert.match(css, /\.tm-ui-kpi/);
  assert.match(css, /\.tm-ui-btn/);
  assert.match(css, /\.tm-ui-btn--primary/);
  assert.match(css, /\.tm-ui-table/);
  assert.match(css, /\.tm-ui-badge--success/);
  assert.match(css, /\.tm-ui-message--success/);
  assert.match(css, /\.tm-ui-modal/);
  assert.match(css, /\.tm-ui-log/);
  assert.match(css, /\.tm-ui-dock/);
  assert.match(css, /\.tm-ui-dock__toggle/);
  assert.match(css, /\.tm-ui-dock__panel/);
  assert.match(css, /body,button,input,select,textarea/);
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

test("shared module ui exposes the external font source configuration", () => {
  assert.equal(moduleUi.FONT_FAMILY, "Pretendard");
  assert.equal(
    moduleUi.FONT_SOURCE_BASE_URL,
    "https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/"
  );
  assert.equal(moduleUi.FONT_IMPORT_URL, moduleUi.FONT_SOURCE_BASE_URL);
});
