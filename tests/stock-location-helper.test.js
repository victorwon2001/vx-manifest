const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/stock-location-helper/main.js");
const meta = require("../modules/stock-location-helper/meta.json");
const registry = require("../config/registry.json");

function createCell(initialText) {
  return {
    textContent: initialText || "",
    title: initialText || "",
    classList: {
      values: [],
      add(name) {
        this.values.push(name);
      },
    },
    querySelector() {
      return null;
    },
  };
}

function createRow(available, allocated) {
  const cells = {
    gridList_locastock_qty: createCell(String(available)),
    gridList_locastock_aqty: createCell(String(allocated)),
    gridList_locastock_bqty: createCell("0"),
  };

  return {
    style: { display: "" },
    hidden: false,
    querySelector(selector) {
      const match = /aria-describedby="([^"]+)"/.exec(selector);
      return match ? cells[match[1]] || null : null;
    },
    cells,
  };
}

function createParts(rows) {
  const headerLabel = { textContent: "안전수량" };
  const headerCell = {
    classList: {
      values: [],
      add(name) {
        this.values.push(name);
      },
    },
    querySelector(selector) {
      return selector.indexOf("div") >= 0 ? headerLabel : null;
    },
  };
  const footCells = {
    gridList_locastock_qty: createCell("NaN"),
    gridList_locastock_aqty: createCell("0"),
    gridList_locastock_bqty: createCell("0"),
  };

  return {
    headerTable: {
      querySelector(selector) {
        return selector === "#gridList_locastock_bqty" ? headerCell : null;
      },
    },
    bodyTable: {
      querySelectorAll(selector) {
        return selector === "tbody tr.jqgrow" ? rows : [];
      },
    },
    footTable: {
      querySelector(selector) {
        const match = /aria-describedby="([^"]+)"/.exec(selector);
        return match ? footCells[match[1]] || null : null;
      },
    },
    headerCell,
    headerLabel,
    footCells,
  };
}

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
  assert.equal(moduleUnderTest.computeDelta(12, 5), 7);
});

test("stock location helper reuses the safe stock slot for the delta label and values", () => {
  const rows = [createRow(10, 4), createRow(3, 1)];
  const parts = createParts(rows);

  const applied = moduleUnderTest.applyDeltaSlotToParts(parts);

  assert.equal(applied, true);
  assert.equal(parts.headerLabel.textContent, "가용-할당수량");
  assert.equal(rows[0].cells.gridList_locastock_bqty.textContent, "6");
  assert.equal(rows[1].cells.gridList_locastock_bqty.textContent, "2");
  assert.equal(parts.footCells.gridList_locastock_qty.textContent, "13");
  assert.equal(parts.footCells.gridList_locastock_aqty.textContent, "5");
  assert.equal(parts.footCells.gridList_locastock_bqty.textContent, "8");
});

test("stock location helper ignores hidden rows when recalculating footer totals", () => {
  const visibleRow = createRow(8, 3);
  const hiddenRow = createRow(20, 10);
  hiddenRow.style.display = "none";
  const parts = createParts([visibleRow, hiddenRow]);

  const metrics = moduleUnderTest.collectVisibleRowMetrics(parts);
  moduleUnderTest.applyDeltaSlotToParts(parts);

  assert.deepEqual(metrics, [{ availableQty: 8, allocatedQty: 3 }]);
  assert.equal(parts.footCells.gridList_locastock_qty.textContent, "8");
  assert.equal(parts.footCells.gridList_locastock_aqty.textContent, "3");
  assert.equal(parts.footCells.gridList_locastock_bqty.textContent, "5");
});

test("stock location helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "stock-location-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/stock-location-helper/meta.json");
  assert.equal(meta.entry, "modules/stock-location-helper/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["module-ui"]);
});
