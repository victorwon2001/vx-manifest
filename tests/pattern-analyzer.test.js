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
      boptcode_name: "포기",
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
});
