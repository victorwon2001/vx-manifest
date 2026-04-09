const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/waybill-pdf-manager/main.js");
const meta = require("../modules/waybill-pdf-manager/meta.json");
const registry = require("../config/registry.json");

test("waybill pdf manager exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "waybill-pdf-manager");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("waybill pdf manager shouldRun matches oms main pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/main.do" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/main.do?x=1" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/login.do" } }), false);
});

test("waybill pdf manager input parser trims blank lines", () => {
  assert.deepEqual(moduleUnderTest.parseWaybillCodes(" 511656028216 \n\n511656028054 \n"), [
    "511656028216",
    "511656028054",
  ]);
});

test("waybill pdf manager builds encoded fetch urls", () => {
  assert.equal(
    moduleUnderTest.buildWaybillFetchUrl("511656028216"),
    "https://oms.bstage.systems/stan/order/orderWaybillPdfPrint.do?scanText=511656028216"
  );
});

test("waybill pdf manager merges saved ui state with viewport-safe defaults", () => {
  const merged = moduleUnderTest.mergeUiState({ x: 1200, y: 900, width: 280, height: 160, isOpen: true }, { width: 1280, height: 720 });
  assert.equal(merged.width, 320);
  assert.equal(merged.height, 220);
  assert.equal(merged.isOpen, true);
  assert.equal(merged.x <= 1218, true);
});

test("waybill pdf manager registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "waybill-pdf-manager");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/waybill-pdf-manager/meta.json");
  assert.equal(meta.entry, "modules/waybill-pdf-manager/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["pdf-lib"]);
});
