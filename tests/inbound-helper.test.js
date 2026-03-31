const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const moduleUnderTest = require("../modules/inbound-helper/main.js");
const meta = require("../modules/inbound-helper/meta.json");
const registry = require("../config/registry.json");
const source = fs.readFileSync(path.resolve(__dirname, "../modules/inbound-helper/main.js"), "utf8");

test("inbound helper exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "inbound-helper");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("inbound helper parseLine supports tabs and optional location", () => {
  assert.deepEqual(moduleUnderTest.parseLine("ABC-123\t10\tS35-01"), {
    code: "ABC-123",
    qty: 10,
    loc: "S35-01",
  });
  assert.deepEqual(moduleUnderTest.parseLine("abc-123  5"), {
    code: "ABC-123",
    qty: 5,
    loc: "",
  });
  assert.equal(moduleUnderTest.parseLine(""), null);
});

test("inbound helper parseDataForBatch merges duplicate codes when requested", () => {
  const result = moduleUnderTest.parseDataForBatch([
    "ABC-123\t10\tS35-01",
    "abc-123\t5\tS35-01",
    "XYZ-999\t3",
  ].join("\n"), true);

  assert.equal(result.keys.length, 2);
  assert.deepEqual(result.data.get("ABC-123"), {
    code: "ABC-123",
    qty: 15,
    loc: "S35-01",
  });
});

test("inbound helper builds sequential queue map by exact code", () => {
  const result = moduleUnderTest.buildQueueMapFromText([
    "ABC-123\t10\tS35-01",
    "ABC-123\t5\tS35-02",
    "XYZ-999\t3",
  ].join("\n"));

  assert.equal(result.totalTasks, 3);
  assert.equal(result.queueMap["ABC-123"].length, 2);
  assert.equal(result.queueMap["XYZ-999"][0].qty, 3);
});

test("inbound helper extracts ordered code tokens without duplicate substrings", () => {
  const tokens = moduleUnderTest.extractCodeTokensFromText("상품명 (ABC-123) 기타 ABC-123 DEF_45");

  assert.deepEqual(tokens, ["ABC-123", "DEF_45"]);
  assert.equal(moduleUnderTest.pickFirstActiveCode(tokens, new Set(["DEF_45"])), "DEF_45");
});

test("inbound helper gui html uses shared panel contract", () => {
  const html = moduleUnderTest.buildGuiHtml({
    buildRootAttributes() {
      return 'class="tm-ui-root tm-ui-panel tm-inbound-helper" data-tm-density="compact"';
    },
  });

  assert.match(html, /id="tmInboundHelperDock"/);
  assert.match(html, /class="tm-ui-dock tm-inbound-helper__dock"/);
  assert.match(html, /id="tmInboundHelperToggle"[\s\S]*id="tmInboundHelperGui"/);
  assert.match(html, /class="tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary"/);
  assert.match(html, /tm-ui-dock__panel tm-ui-root tm-ui-panel tm-inbound-helper/);
  assert.match(html, /tm-ui-card tm-inbound-helper__shell/);
  assert.match(html, /tm-ui-panel-head/);
  assert.match(html, /tm-ui-log/);
  assert.match(html, /tm-ui-btn tm-ui-btn--success/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /tm-ui-dock__toggle-label tm-inbound-helper__toggle-label/);
});

test("inbound helper state keeps window reference for gui mounting", () => {
  assert.match(source, /win\[STATE_KEY\]\s*=\s*\{\s*[\s\S]*?\bwin,\s*[\s\S]*?initialized:/);
  assert.match(source, /win\[STATE_KEY\]\.win = win;/);
});

test("inbound helper toggle state no longer shifts horizontal position", () => {
  assert.doesNotMatch(source, /\.css\("right",\s*isVisible/);
  assert.match(source, /\.attr\("aria-expanded",\s*isVisible \? "true" : "false"\)/);
  assert.match(source, /#"\s*\+\s*DOCK_ID\s*\+\s*"\{position:fixed;top:14px;right:14px;z-index:9999;display:grid;justify-items:end;gap:10px;pointer-events:none\}/);
  assert.match(source, /#"\s*\+\s*TOGGLE_ID\s*\+\s*"\{display:inline-flex;align-items:center;gap:8px;min-height:38px/);
});

test("inbound helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "inbound-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/inbound-helper/meta.json");
  assert.equal(meta.entry, "modules/inbound-helper/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id).sort();
  assert.deepEqual(dependencyIds, ["jquery", "module-ui"]);
});
