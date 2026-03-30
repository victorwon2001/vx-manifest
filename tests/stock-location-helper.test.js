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

function createRow(values) {
  const cells = {
    gridList_zone_name: createCell(values.zoneName),
    gridList_loca_name: createCell(values.locationName),
    gridList_basic_name: createCell(values.productName),
    gridList_basic_nicn: createCell(values.nicn),
    gridList_boptcode_name: createCell(values.optionName),
    gridList_boptcode_barcode: createCell(values.barcode),
    gridList_locastock_qty: createCell(String(values.availableQty)),
    gridList_locastock_aqty: createCell(String(values.allocatedQty)),
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
  const rows = [
    createRow({
      zoneName: "A존",
      locationName: "A-01",
      productName: "상품A",
      nicn: "관리명A",
      optionName: "옵션A",
      barcode: "8800001",
      availableQty: 10,
      allocatedQty: 4,
    }),
    createRow({
      zoneName: "B존",
      locationName: "B-01",
      productName: "상품B",
      nicn: "관리명B",
      optionName: "옵션B",
      barcode: "8800002",
      availableQty: 3,
      allocatedQty: 1,
    }),
  ];
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
  const visibleRow = createRow({
    zoneName: "A존",
    locationName: "A-01",
    productName: "상품A",
    nicn: "관리명A",
    optionName: "옵션A",
    barcode: "8800001",
    availableQty: 8,
    allocatedQty: 3,
  });
  const hiddenRow = createRow({
    zoneName: "B존",
    locationName: "B-01",
    productName: "상품B",
    nicn: "관리명B",
    optionName: "옵션B",
    barcode: "8800002",
    availableQty: 20,
    allocatedQty: 10,
  });
  hiddenRow.style.display = "none";
  const parts = createParts([visibleRow, hiddenRow]);

  const metrics = moduleUnderTest.collectVisibleRowMetrics(parts);
  moduleUnderTest.applyDeltaSlotToParts(parts);

  assert.deepEqual(metrics, [{ availableQty: 8, allocatedQty: 3 }]);
  assert.equal(parts.footCells.gridList_locastock_qty.textContent, "8");
  assert.equal(parts.footCells.gridList_locastock_aqty.textContent, "3");
  assert.equal(parts.footCells.gridList_locastock_bqty.textContent, "5");
});

test("stock location helper builds preview rows from the current visible table", () => {
  const parts = createParts([
    createRow({
      zoneName: "A존",
      locationName: "A-01",
      productName: "상품A",
      nicn: "관리명A",
      optionName: "옵션A",
      barcode: "8800001",
      availableQty: 11,
      allocatedQty: 4,
    }),
  ]);

  const rows = moduleUnderTest.buildPreviewRows(parts);

  assert.deepEqual(rows, [{
    zoneName: "A존",
    locationName: "A-01",
    productName: "상품A",
    nicn: "관리명A",
    optionName: "옵션A",
    barcode: "8800001",
    availableQty: "11",
    allocatedQty: "4",
    deltaQty: "7",
  }]);
});

test("stock location helper preview clipboard text keeps the requested centered columns", () => {
  const text = moduleUnderTest.buildPreviewClipboardText([{
    zoneName: "A존",
    locationName: "A-01",
    productName: "상품A",
    nicn: "관리명A",
    optionName: "옵션A",
    barcode: "8800001",
    availableQty: "11",
    allocatedQty: "4",
    deltaQty: "7",
  }]);

  assert.match(text, /^존명\t로케이션\t상품명\t관리명\t옵션\t바코드번호\t가용수량\t할당수량\(가용\)\t가용-할당수량/);
  assert.match(text, /A존\tA-01\t상품A\t관리명A\t옵션A\t8800001\t11\t4\t7/);
});

test("stock location helper preview table html centers every column", () => {
  const html = moduleUnderTest.buildPreviewTableBodyHtml([{
    zoneName: "A존",
    locationName: "A-01",
    productName: "상품A",
    nicn: "관리명A",
    optionName: "옵션A",
    barcode: "8800001",
    availableQty: "11",
    allocatedQty: "4",
    deltaQty: "7",
  }]);

  assert.match(html, /data-tm-align="center">A존/);
  assert.match(html, /data-tm-align="center">A-01/);
  assert.match(html, /data-tm-align="center">상품A/);
  assert.match(html, /data-tm-align="center">관리명A/);
  assert.match(html, /data-tm-align="center">옵션A/);
  assert.match(html, /data-tm-align="center">8800001/);
  assert.match(html, /data-tm-align="center">11/);
  assert.match(html, /data-tm-align="center">4/);
  assert.match(html, /data-tm-align="center">7/);
  assert.doesNotMatch(html, /data-tm-align="left"|data-tm-align="right"/);
});

test("stock location helper preview action link keeps the original action link tone", () => {
  const clicked = [];
  const button = {
    id: "",
    textContent: "일별재고마감현황",
    attributes: {},
    removed: [],
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      this.removed.push(name);
      delete this.attributes[name];
    },
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
  };
  const targetLink = {
    cloneNode() {
      return button;
    },
  };

  const created = moduleUnderTest.createPreviewActionLink({}, targetLink, () => {
    clicked.push("open");
  });

  assert.equal(created, button);
  assert.equal(created.id, "tm-stock-location-helper-preview-button");
  assert.equal(created.textContent, "재고프리뷰");
  assert.equal(created.attributes.href, "javascript:void(0)");
  assert.equal(created.attributes.title, "재고프리뷰");
  assert.deepEqual(created.removed, ["onclick", "target"]);
  created.listeners.click({ preventDefault() {} });
  assert.deepEqual(clicked, ["open"]);
});

test("stock location helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "stock-location-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/stock-location-helper/meta.json");
  assert.equal(meta.entry, "modules/stock-location-helper/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["module-ui"]);
});
