const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/auto-matching/main.js");
const meta = require("../modules/auto-matching/meta.json");
const registry = require("../config/registry.json");

test("auto matching exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "auto-matching");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("auto matching skips only exact cs markers", () => {
  assert.equal(moduleUnderTest.shouldSkipCs(["CS", "기타"]), true);
  assert.equal(moduleUnderTest.shouldSkipCs(["cs", "기타"]), true);
  assert.equal(moduleUnderTest.shouldSkipCs(["CS-01", "기타"]), false);
});

test("auto matching picks exact product code matches from multiple candidates", () => {
  assert.equal(moduleUnderTest.selectTargetIndex(["주문", "ABC-123"], []), -1);
  assert.equal(moduleUnderTest.selectTargetIndex(["주문", "ABC-123"], ["ONLY-ONE"]), 0);
  assert.equal(
    moduleUnderTest.selectTargetIndex(["주문", "ABC-123"], ["ZZZ", "ABC-123", "YYY"]),
    1
  );
  assert.equal(
    moduleUnderTest.selectTargetIndex(["주문", "ABC-123"], ["ZZZ", "YYY"]),
    -1
  );
});

test("auto matching detects set-product rows from row count or marker", () => {
  assert.equal(moduleUnderTest.isSetProductCandidate(1, "<table></table>"), false);
  assert.equal(moduleUnderTest.isSetProductCandidate(2, "<table></table>"), true);
  assert.equal(moduleUnderTest.isSetProductCandidate(1, "<b>ㄴ</b> 구성"), true);
});

test("auto matching log colors stay readable on the dark log surface", () => {
  assert.equal(moduleUnderTest.getLogToneColor(), "#eef2f2");
  assert.equal(moduleUnderTest.getLogToneColor("warning"), "#f3d98f");
  assert.equal(moduleUnderTest.getLogToneColor("danger"), "#ffb7af");
});

test("auto matching panel html uses shared dock and panel contract", () => {
  const html = moduleUnderTest.buildPanelHtml({
    buildRootAttributes() {
      return 'class="tm-ui-root tm-ui-panel tm-auto-matching" data-tm-density="compact"';
    },
  });

  assert.match(html, /id="tmAutoMatchingDock"/);
  assert.match(html, /class="tm-ui-dock tm-auto-matching__dock"/);
  assert.match(html, /id="tmAutoMatchingToggle"[\s\S]*id="tmAutoMatchingPanel"/);
  assert.match(html, /class="tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary"/);
  assert.match(html, /tm-ui-dock__panel tm-ui-root tm-ui-panel tm-auto-matching/);
  assert.match(html, /tm-ui-card tm-auto-matching__shell/);
  assert.match(html, /tm-ui-statusbar/);
  assert.match(html, /tm-ui-log/);
  assert.match(html, /tm-ui-dock__toggle-label tm-auto-matching__toggle-label/);
  assert.match(html, /자동 매칭 시작/);
});

test("auto matching registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "auto-matching");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/auto-matching/meta.json");
  assert.equal(meta.entry, "modules/auto-matching/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id).sort();
  assert.deepEqual(dependencyIds, ["module-ui"]);
});
