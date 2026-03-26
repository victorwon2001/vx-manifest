const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/invoice-list-viewer/main.js");
const meta = require("../modules/invoice-list-viewer/meta.json");
const registry = require("../config/registry.json");

test("invoice list viewer exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "invoice-list-viewer");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.deepEqual(moduleUnderTest.matches, ["https://www.ebut3pl.co.kr/*"]);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("invoice list viewer list request params keep the expected query shape", () => {
  const params = moduleUnderTest.buildListRequestParams("2026-03-26", 2, 12345);

  assert.equal(params.IVMSTR_DATE, "2026-03-26");
  assert.equal(params.ORDLIST_DATE1, "2025-03-26");
  assert.equal(params.ORDLIST_DATE2, "2026-03-26");
  assert.equal(params.page, "2");
  assert.equal(params.rows, "300");
  assert.equal(params.sidx, "ivmstr_seq");
});

test("invoice list viewer workbook query uses selected date and batch", () => {
  const query = moduleUnderTest.buildWorkbookRequestQuery({
    ivmstr_date: "20260318",
    ivmstr_ivno: "25",
  });

  assert.match(query, /ORDLIST_IVDATE=20260318/);
  assert.match(query, /ORDLIST_IVNO=25/);
  assert.match(query, /formType=site320main/);
});

test("invoice list viewer formats compact batch dates", () => {
  assert.equal(moduleUnderTest.formatBatchDateLabel("20260318"), "2026-03-18");
  assert.equal(moduleUnderTest.formatBatchDateLabel("2026-03-18"), "2026-03-18");
});

test("invoice list viewer resolves the top frame home url for nav injection", () => {
  const scope = {
    location: { href: "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp" },
    top: {
      location: { href: "https://www.ebut3pl.co.kr/home" },
    },
  };

  assert.equal(moduleUnderTest.resolveTopHref(scope), "https://www.ebut3pl.co.kr/home");
});

test("invoice list viewer dedupes invoice numbers while preserving row positions", () => {
  const rows = moduleUnderTest.dedupeInvoiceRows([
    { invoiceNumber: "A", orderNumber: "1" },
    { invoiceNumber: "A", orderNumber: "2" },
    { invoiceNumber: "A", orderNumber: "3" },
    { invoiceNumber: "B", orderNumber: "4" },
    { invoiceNumber: "B", orderNumber: "5" },
  ]);

  assert.deepEqual(rows.map((row) => row.invoiceNumber), ["A", "", "", "B", ""]);
  assert.deepEqual(rows.map((row) => row.orderNumber), ["1", "2", "3", "4", "5"]);
});

test("invoice list viewer workbook rows map the requested columns", () => {
  const result = moduleUnderTest.buildWorkbookDisplayRows([
    ["송장번호", "발송일", "쇼핑몰", "주문번호", "매칭관리명", "매칭상품명", "매칭수량"],
    ["A", "2026-03-18", "몰A", "1001", "관리A", "상품A", "2"],
    ["A", "2026-03-18", "몰A", "1002", "관리B", "상품B", "1"],
    ["B", "2026-03-18", "몰B", "1003", "관리C", "상품C", "4"],
  ]);

  assert.deepEqual(result, [
    {
      invoiceNumber: "A",
      shippedAt: "2026-03-18",
      mall: "몰A",
      orderNumber: "1001",
      matchedNicn: "관리A",
      matchedName: "상품A",
      matchedQty: "2",
    },
    {
      invoiceNumber: "",
      shippedAt: "2026-03-18",
      mall: "몰A",
      orderNumber: "1002",
      matchedNicn: "관리B",
      matchedName: "상품B",
      matchedQty: "1",
    },
    {
      invoiceNumber: "B",
      shippedAt: "2026-03-18",
      mall: "몰B",
      orderNumber: "1003",
      matchedNicn: "관리C",
      matchedName: "상품C",
      matchedQty: "4",
    },
  ]);
});

test("invoice list viewer panel html uses popup shell and table contract", () => {
  const html = moduleUnderTest.buildPanelHtml({
    buildRootAttributes() {
      return 'class="tm-ui-root tm-ui-popup tm-invoice-list-viewer-popup" data-tm-density="compact"';
    },
  });

  assert.doesNotMatch(html, /tmInvoiceListViewerDock/);
  assert.match(html, /id="tmInvoiceListViewerPanel"/);
  assert.match(html, /tm-ui-popup/);
  assert.match(html, /data-action="close-window"/);
  assert.match(html, /id="tmInvoiceListViewerDate"/);
  assert.match(html, /<th data-tm-align="center">건수<\/th>/);
  assert.match(html, /<th data-tm-align="center">매칭수량<\/th>/);
  assert.match(html, /B2B 출고데이터 뷰어/);
  assert.match(html, /출력 차수 목록/);
  assert.match(html, /XLS 데이터/);
  assert.match(html, /tm-ui-table/);
});

test("invoice list viewer registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "invoice-list-viewer");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.deepEqual(script.matches, ["https://www.ebut3pl.co.kr/*"]);
  assert.equal(script.metaPath, "modules/invoice-list-viewer/meta.json");
  assert.equal(meta.entry, "modules/invoice-list-viewer/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id).sort();
  assert.deepEqual(dependencyIds, ["module-ui", "nav-menu", "xlsx"]);
});
