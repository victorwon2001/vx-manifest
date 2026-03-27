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

const analyzer = require(resolveRepoPath([
  "../modules/pattern-analyzer/main.js",
]));

function createSampleOrders() {
  return [
    {
      ordlist_dno: "INV-001",
      ordlist_dno_ori: "INV-001",
      ordlist_ivno: "12",
      basic_name: "사과",
      basic_nicn: "사과 1kg",
      boptcode_name: "빨강",
      ordlist_qty: "2",
      ordlist_ivnum: "10",
      ordlist_fnsh: "완료",
      site_name: "스토어A",
    },
    {
      ordlist_dno: "INV-001",
      ordlist_dno_ori: "INV-001",
      ordlist_ivno: "12",
      basic_name: "배",
      basic_nicn: "배 1kg",
      boptcode_name: "기본",
      ordlist_qty: "1",
      ordlist_ivnum: "10",
      ordlist_fnsh: "완료",
      site_name: "스토어A",
    },
    {
      ordlist_dno: "INV-002",
      ordlist_dno_ori: "INV-002",
      ordlist_ivno: "13",
      basic_name: "배",
      basic_nicn: "배 1kg",
      boptcode_name: "기본",
      ordlist_qty: "1",
      ordlist_ivnum: "20",
      ordlist_fnsh: "발송대기",
      site_name: "스토어B",
    },
    {
      ordlist_dno: "INV-002",
      ordlist_dno_ori: "INV-002",
      ordlist_ivno: "13",
      basic_name: "사과",
      basic_nicn: "사과 1kg",
      boptcode_name: "빨강",
      ordlist_qty: "2",
      ordlist_ivnum: "20",
      ordlist_fnsh: "발송대기",
      site_name: "스토어B",
    },
    {
      ordlist_dno: "INV-003",
      ordlist_dno_ori: "INV-003",
      ordlist_ivno: "14",
      basic_name: "김치",
      basic_nicn: "김치 5kg",
      boptcode_name: "실온",
      ordlist_qty: "1",
      ordlist_ivnum: "30",
      ordlist_fnsh: "발송대기",
      site_name: "스토어A",
    },
  ];
}

test("analyzeOrderPatterns groups invoices with identical item composition", () => {
  const patterns = analyzer.analyzeOrderPatterns(createSampleOrders());

  assert.equal(patterns.length, 2);
  assert.equal(patterns[0].count, 2);
  assert.deepEqual(patterns[0].invoices, ["INV-001", "INV-002"]);
  assert.deepEqual(patterns[0].batchNumbers, ["12", "13"]);
  assert.deepEqual(patterns[0].siteNames, ["스토어A", "스토어B"]);
  assert.equal(patterns[0].completedCount, 1);
  assert.equal(patterns[0].pendingCount, 1);
  assert.deepEqual(
    patterns[0].items.map((item) => item.productName),
    ["배", "사과"]
  );
});

test("filterPatterns applies keyword filters and aggregates leftovers", () => {
  const patterns = analyzer.analyzeOrderPatterns(createSampleOrders());

  const result = analyzer.filterPatterns(patterns, {
    includeKeywords: ["사과"],
    excludeKeywords: ["김치"],
    minRepetition: 3,
  });

  assert.equal(result.leftoverCount, 1);
  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].id, 999999);
  assert.deepEqual(result.patterns[0].invoices, ["INV-001", "INV-002"]);
  assert.equal(result.stats.leftoverInvoiceCount, 2);
  assert.equal(result.stats.regularInvoiceCount, 0);
});

test("extractInvoiceNumbers returns only checked pattern invoices", () => {
  const patterns = analyzer.analyzeOrderPatterns(createSampleOrders());
  const invoiceNumbers = analyzer.extractInvoiceNumbers(patterns, [patterns[1].id]);

  assert.deepEqual(invoiceNumbers, ["INV-003"]);
});

test("formatInvoicesForCopy and buildInvoicesCsv preserve source invoices", () => {
  const invoices = ["INV-001", "INV-002", "INV-003"];

  assert.equal(
    analyzer.formatInvoicesForCopy(invoices, "\n"),
    "INV-001\nINV-002\nINV-003"
  );
  assert.equal(
    analyzer.formatInvoicesForCopy(invoices, ","),
    "INV-001,INV-002,INV-003"
  );
  assert.equal(
    analyzer.buildInvoicesCsv(invoices),
    "송장번호\nINV-001\nINV-002\nINV-003\n"
  );
  assert.deepEqual(invoices, ["INV-001", "INV-002", "INV-003"]);
});

test("calculateProgress returns percentage and counts", () => {
  assert.deepEqual(
    analyzer.calculateProgress(7, 10, 5, 2),
    {
      current: 7,
      total: 10,
      completed: 5,
      failed: 2,
      percentage: 70,
    }
  );
});

test("shipping mode theme separates ship and cancel visuals", () => {
  const ship = analyzer.getShippingModeTheme(false);
  const cancel = analyzer.getShippingModeTheme(true);

  assert.equal(ship.badgeText, "출고 모드");
  assert.equal(cancel.badgeText, "출고취소 모드");
  assert.notEqual(ship.progressBackground, cancel.progressBackground);
});

test("getPatternToneClass alternates by pattern group and keeps leftovers distinct", () => {
  assert.equal(analyzer.getPatternToneClass({ id: 1 }, 0), "tone-even");
  assert.equal(analyzer.getPatternToneClass({ id: 2 }, 1), "tone-odd");
  assert.equal(analyzer.getPatternToneClass({ id: 999999 }, 3), "tone-leftover");
});

test("buildPatternPrintDocumentHtml returns standalone print document", () => {
  const html = analyzer.buildPatternPrintDocumentHtml({
    stats: {
      totalInvoiceCount: 5,
      regularInvoiceCount: 4,
      leftoverInvoiceCount: 1,
    },
    dateLabel: "2026-03-23",
    siteLabel: "스토어A",
    exprLabel: "택배사A",
    filters: {
      includeKeywords: ["사과"],
      excludeKeywords: [],
      minRepetition: 2,
    },
    batches: [
      { ivmstr_ivno: "12", site_name: "스토어A", expr_name: "택배사A", ivcnt: "5", ivmstr_memo: "메모A" },
    ],
    patterns: [
      {
        batchNumbers: ["12"],
        count: 2,
        invoices: ["INV-001", "INV-002"],
        items: [
          { productName: "사과", managementName: "사과 1kg", optionName: "빨강", quantity: 2 },
        ],
      },
      {
        batchNumbers: ["13"],
        count: 1,
        invoices: ["INV-003"],
        items: [
          { productName: "BANANA", managementName: "BANANA 1KG", optionName: "BASIC", quantity: 1 },
        ],
      },
    ],
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /batch-list/);
  assert.match(html, /pattern-table/);
  assert.match(html, /summary-strip/);
  assert.match(html, /총건수/);
  assert.match(html, /필터 제외 짜투리/);
  assert.match(html, /5건/);
  assert.match(html, /차수 정보/);
  assert.match(html, /패턴 정보/);
  assert.match(html, /스토어A/);
  assert.match(html, /tone-even/);
  assert.match(html, /tone-odd/);
  assert.match(html, /print-color-adjust:exact/i);
  assert.match(html, /background:#e4ecec/i);
  assert.match(html, /window\.print/);
  assert.doesNotMatch(html, /Pattern Print/);
  assert.doesNotMatch(html, /송장수/);
});

test("resolvePrintableBatches keeps only analyzed batch rows for printing", () => {
  const result = analyzer.resolvePrintableBatches([
    { ivmstr_ivno: "11", site_name: "A" },
    { ivmstr_ivno: "12", site_name: "B" },
    { ivmstr_ivno: "13", site_name: "C" },
  ], ["12", "13"]);

  assert.deepEqual(result.map((item) => item.ivmstr_ivno), ["12", "13"]);
});

test("evaluateShippingResponse distinguishes output and cancel success rules", () => {
  assert.equal(analyzer.evaluateShippingResponse({ fnsh: "0" }, false), true);
  assert.equal(analyzer.evaluateShippingResponse({ fnsh: "1" }, false), false);
  assert.equal(analyzer.evaluateShippingResponse({ sucess: "true", cnt: "1" }, true), true);
  assert.equal(analyzer.evaluateShippingResponse({ sucess: "true", cnt: "0" }, true), false);
});

test("buildBatchUrl and buildOrderUrl keep the expected query shape", () => {
  assert.match(analyzer.buildBatchUrl("20260323"), /IVMSTR_DATE=2026-03-23/);
  assert.match(analyzer.buildBatchUrl("20260323"), /ORDLIST_DATE1=2025-12-23/);
  assert.match(analyzer.buildOrderUrl("20260323"), /DATE1=2026-03-23/);
  assert.match(analyzer.buildOrderUrl("20260323"), /rows=2000000/);
});

test("reduceShippingRunState keeps stopped runs from ending as completed", () => {
  let state = analyzer.reduceShippingRunState(undefined, {
    type: "start",
    token: "job-1",
    totalCount: 3,
  });
  state = analyzer.reduceShippingRunState(state, { type: "success" });
  state = analyzer.reduceShippingRunState(state, { type: "stop-request" });
  state = analyzer.reduceShippingRunState(state, { type: "finish" });

  assert.equal(state.token, "job-1");
  assert.equal(state.completedCount, 1);
  assert.equal(state.failedCount, 0);
  assert.equal(state.status, "stopped");
});

test("remote module exports loader contract and named helpers", () => {
  assert.equal(analyzer.id, "pattern-analyzer");
  assert.equal(Array.isArray(analyzer.matches), true);
  assert.equal(typeof analyzer.run, "function");
  assert.equal(typeof analyzer.analyzeOrderPatterns, "function");
  assert.equal(typeof analyzer.filterPatterns, "function");
  assert.equal(typeof analyzer.reduceShippingRunState, "function");
  assert.equal(typeof analyzer.buildBatchUrl, "function");
  assert.equal(typeof analyzer.buildOrderUrl, "function");
  assert.equal(typeof analyzer.buildPatternPrintDocumentHtml, "function");
  assert.equal(typeof analyzer.resolvePrintableBatches, "function");
  assert.equal(typeof analyzer.getShippingModeTheme, "function");
});

test("popup html uses shared light admin root and component classes", () => {
  const html = analyzer.createPopupHtml();

  assert.match(html, /class='tm-ui-root tm-ui-popup'/);
  assert.match(html, /data-tm-density='normal'/);
  assert.match(html, /class='shell'/);
  assert.match(html, /class='hero'/);
  assert.match(html, /tm-ui-card/);
  assert.match(html, /tm-ui-table/);
  assert.match(html, /tm-ui-btn/);
  assert.match(html, /tm-ui-overlay/);
  assert.match(html, /tm-ui-modal/);
  assert.match(html, /shipping-mode-badge/);
  assert.match(html, /control-field/);
  assert.match(html, /id='batch-tab' class='tab active'/);
  assert.match(html, /\.multi-controls\{/);
  assert.match(html, /flex-wrap:nowrap/);
});
