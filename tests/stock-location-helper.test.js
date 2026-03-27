const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/stock-location-helper/main.js");
const meta = require("../modules/stock-location-helper/meta.json");
const registry = require("../config/registry.json");

test("stock location helper exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "stock-location-helper");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("stock location helper shouldRun only matches stm410 main pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/jsp/stm/stm400main4.jsp" } }), false);
});

test("stock location helper parses numeric text and formats totals", () => {
  assert.equal(moduleUnderTest.parseNumericText("1,234"), 1234);
  assert.equal(moduleUnderTest.parseNumericText("NaN"), 0);
  assert.equal(moduleUnderTest.formatNumber(4321), "4,321");
});

test("stock location helper hides requested columns by default", () => {
  const hiddenIds = moduleUnderTest.getHiddenColumnIds();

  assert.deepEqual(hiddenIds, [
    "gridList_cust_name",
    "gridList_basic_sptyp",
    "gridList_basic_gbn",
    "gridList_locastock_edate",
    "gridList_loca_sqty",
    "gridList_locastock_impot",
    "gridList_bsadd_qpb",
    "gridList_box_qty",
    "gridList_pallet_qty",
    "gridList_boptcode_weight_total",
    "gridList_boptcode_ucode",
    "gridList_depth1_name",
  ]);
});

test("stock location helper builds column definitions with computed delta after allocated qty", () => {
  const columns = moduleUnderTest.buildColumnDefinitions([
    { id: "gridList_cb", text: "" },
    { id: "gridList_cust_name", text: "고객사" },
    { id: "gridList_locastock_qty", text: "가용수량" },
    { id: "gridList_locastock_aqty", text: "할당수량(가용)" },
    { id: "gridList_locastock_impot", text: "할당우선순위" },
  ]);

  assert.deepEqual(columns.map((column) => column.id), [
    "gridList_cb",
    "gridList_cust_name",
    "gridList_locastock_qty",
    "gridList_locastock_aqty",
    "gridList_available_minus_allocated",
    "gridList_locastock_impot",
  ]);
  assert.equal(columns[1].hiddenByDefault, true);
  assert.equal(columns[4].label, "가용-할당수량");
  assert.equal(columns[5].hiddenByDefault, true);
});

test("stock location helper normalizes visibility from fixed defaults", () => {
  const visibility = moduleUnderTest.normalizeColumnVisibility([
    { id: "gridList_locastock_qty", hiddenByDefault: false },
    { id: "gridList_available_minus_allocated", hiddenByDefault: false },
    { id: "gridList_cust_name", hiddenByDefault: true },
  ]);

  assert.deepEqual(visibility, {
    gridList_locastock_qty: true,
    gridList_available_minus_allocated: true,
    gridList_cust_name: false,
  });
});

test("stock location helper computes available, allocated and delta totals", () => {
  const summary = moduleUnderTest.computeInventorySummary([
    { availableQty: 10, allocatedQty: 4 },
    { availableQty: 3, allocatedQty: 1 },
    { availableQty: 7, allocatedQty: 0 },
  ]);

  assert.deepEqual(summary, {
    availableQty: 20,
    allocatedQty: 5,
    deltaQty: 15,
  });
});

test("stock location helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "stock-location-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/stock-location-helper/meta.json");
  assert.equal(meta.entry, "modules/stock-location-helper/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["module-ui"]);
});
