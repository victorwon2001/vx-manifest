const test = require("node:test");
const assert = require("node:assert/strict");
const moduleUnderTest = require("../modules/inbound-data-viewer/main.js");
const meta = require("../modules/inbound-data-viewer/meta.json");
const registry = require("../config/registry.json");

test("inbound data viewer exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "inbound-data-viewer");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("inbound data viewer formatDate compacts yyyy-mm-dd text", () => {
  assert.equal(moduleUnderTest.formatDate("2026-03-24 10:15:00"), "20260324");
  assert.equal(moduleUnderTest.formatDate(""), "-");
});

test("inbound data viewer clipboard text keeps tabular order", () => {
  const text = moduleUnderTest.buildClipboardText([
    {
      inoutstock_sysdate: "2026-03-24 10:15:00",
      basic_nicn: "관리명",
      basic_name: "상품명",
      inoutstock_inqty: 12,
    },
  ]);
  assert.match(text, /^입고일\t관리명\t상품명\t입고수량/);
  assert.match(text, /20260324\t관리명\t상품명\t12/);
});

test("inbound data viewer meta and registry stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "inbound-data-viewer");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/inbound-data-viewer/meta.json");
  assert.equal(meta.entry, "modules/inbound-data-viewer/main.js");
  const dependency = (meta.dependencies || []).find((item) => item.id === "module-ui");
  assert.ok(dependency);
  assert.equal(dependency.path, "shared/module-ui.js");
});
