const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function resolveRepoPath(candidates) {
  for (const candidate of candidates) {
    const fullPath = path.resolve(__dirname, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  throw new Error("path not found: " + candidates.join(", "));
}

const orderImportSync = require(resolveRepoPath([
  "../modules/order-import-sync/main.js",
]));

test("buildPreviewQueue keeps only positive-count rows with buttons and sorts them", () => {
  const result = orderImportSync.buildPreviewQueue([
    { siteCode: "100", name: "B몰", count: 3, hasGetButton: true },
    { siteCode: "200", name: "A몰", count: 3, hasGetButton: true },
    { siteCode: "300", name: "C몰", count: 0, hasGetButton: true },
    { siteCode: "400", name: "D몰", count: 5, hasGetButton: false },
  ]);

  assert.deepEqual(result, [
    { siteCode: "200", name: "A몰", count: 3, hasGetButton: true },
    { siteCode: "100", name: "B몰", count: 3, hasGetButton: true },
  ]);
});

test("parseResultTableHtml summarizes row-based results", () => {
  const html = [
    "<table>",
    "<tr><td>수령자</td><td>상품명</td><td>옵션명</td><td>결과</td></tr>",
    "<tr><td>홍길동</td><td>사과</td><td>빨강</td><td>등록성공</td></tr>",
    "<tr><td>김영희</td><td>배</td><td>선물포장</td><td>등록실패</td></tr>",
    "</table>",
  ].join("");

  const result = orderImportSync.parseResultTableHtml(html);

  assert.deepEqual(result, {
    total: 2,
    success: 1,
    fail: 1,
    completed: true,
    details: [
      { receiver: "홍길동", product: "사과", option: "빨강", result: "등록성공" },
      { receiver: "김영희", product: "배", option: "선물포장", result: "등록실패" },
    ],
  });
});

test("parseResultTableHtml falls back to completion message", () => {
  const result = orderImportSync.parseResultTableHtml("<div>3건 주문등록이 완료되었습니다.</div>");

  assert.deepEqual(result, {
    total: 3,
    success: 3,
    fail: 0,
    completed: true,
    details: [],
  });
});

test("hasOrderCountDecreased returns true only when current count decreased", () => {
  assert.equal(orderImportSync.hasOrderCountDecreased(5, 4), true);
  assert.equal(orderImportSync.hasOrderCountDecreased(5, 5), false);
  assert.equal(orderImportSync.hasOrderCountDecreased(5, 6), false);
});

test("isResultTextCandidate recognizes result tables and completion messages", () => {
  assert.equal(orderImportSync.isResultTextCandidate("주문수집결과 수령자 상품명 결과"), true);
  assert.equal(orderImportSync.isResultTextCandidate("3건 주문등록이 완료되었습니다"), true);
  assert.equal(orderImportSync.isResultTextCandidate("일반 안내 문구"), false);
});

test("shouldRefreshQueueFromLivePage refreshes only when idle", () => {
  assert.equal(orderImportSync.shouldRefreshQueueFromLivePage({
    active: false,
    processing: false,
  }), true);
  assert.equal(orderImportSync.shouldRefreshQueueFromLivePage({
    active: true,
    processing: false,
  }), false);
  assert.equal(orderImportSync.shouldRefreshQueueFromLivePage({
    active: false,
    processing: true,
  }), false);
});

test("buildDialogPatchScript targets page context and local storage toggle", () => {
  const script = orderImportSync.buildDialogPatchScript("EBUT_UI_AUTOYES");

  assert.match(script, /localStorage\.getItem\("EBUT_UI_AUTOYES"\)/);
  assert.match(script, /window\.confirm = function/);
  assert.match(script, /window\.alert = function/);
  assert.match(script, /window\.prompt = function/);
});

test("reduceImportState tracks start, success, timeout and stop transitions", () => {
  let state = orderImportSync.reduceImportState(undefined, {
    type: "start",
    queue: [{ siteCode: "100" }, { siteCode: "200" }],
  });
  state = orderImportSync.reduceImportState(state, {
    type: "complete-site",
    siteCode: "100",
    result: { total: 2, success: 2, fail: 0, details: [] },
  });
  state = orderImportSync.reduceImportState(state, {
    type: "timeout-site",
    siteCode: "200",
    result: { total: 1, success: 0, fail: 0, details: [], timeout: true },
  });
  state = orderImportSync.reduceImportState(state, { type: "stop" });

  assert.deepEqual(state, {
    active: false,
    processing: false,
    index: 2,
    current: "",
    queue: [{ siteCode: "100" }, { siteCode: "200" }],
    results: {
      "100": { total: 2, success: 2, fail: 0, details: [] },
      "200": { total: 1, success: 0, fail: 0, details: [], timeout: true },
    },
  });
});

test("summarizeImportResults totals success and failure lines", () => {
  const result = orderImportSync.summarizeImportResults(
    {
      "100": {
        total: 2,
        success: 1,
        fail: 1,
        details: [
          { receiver: "홍길동", product: "사과", option: "빨강", result: "등록성공" },
          { receiver: "김영희", product: "배", option: "선물", result: "등록실패" },
        ],
      },
      "200": {
        total: 3,
        success: 3,
        fail: 0,
        details: [],
      },
    },
    [
      { siteCode: "100", name: "A몰" },
      { siteCode: "200", name: "B몰" },
    ]
  );

  assert.deepEqual(result, {
    anyFail: true,
    totalSuccess: 4,
    totalFail: 1,
    lines: [
      "[A몰] 성공 1/2, 실패 1",
      "  - 수령자:김영희 | 상품:배 | 결과:등록실패",
    ],
  });
});

test("module exports loader contract and order import helpers", () => {
  assert.equal(orderImportSync.id, "order-import-sync");
  assert.equal(Array.isArray(orderImportSync.matches), true);
  assert.equal(typeof orderImportSync.run, "function");
  assert.equal(typeof orderImportSync.buildPreviewQueue, "function");
  assert.equal(typeof orderImportSync.parseResultTableHtml, "function");
  assert.equal(typeof orderImportSync.hasOrderCountDecreased, "function");
  assert.equal(typeof orderImportSync.isResultTextCandidate, "function");
  assert.equal(typeof orderImportSync.shouldRefreshQueueFromLivePage, "function");
  assert.equal(typeof orderImportSync.buildDialogPatchScript, "function");
  assert.equal(typeof orderImportSync.reduceImportState, "function");
  assert.equal(typeof orderImportSync.summarizeImportResults, "function");
});

test("panel html uses the shared panel, toolbar and table classes", () => {
  const html = orderImportSync.buildPanelHtml({
    collapsed: false,
    autoYes: true,
  });

  assert.match(html, /class='tm-ui-root tm-ui-panel/);
  assert.match(html, /data-tm-density='normal'/);
  assert.match(html, /tm-ui-toolbar/);
  assert.match(html, /tm-ui-btn tm-ui-btn--success/);
  assert.match(html, /tm-ui-table/);
  assert.match(html, /tm-ui-log/);
});
