const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/outbound-manager/main.js");
const meta = require("../modules/outbound-manager/meta.json");
const registry = require("../config/registry.json");

test("outbound manager exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "outbound-manager");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("outbound manager shouldRun only matches site413edit page", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/jsp/site/site413edit.jsp" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/jsp/com/ScanWindow.jsp" } }), false);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://example.com/" } }), false);
});

test("outbound manager input parser trims lines and removes duplicates while preserving order", () => {
  const parsed = moduleUnderTest.parseInvoiceInput(" 511656028216 \n\n511656028054\n511656028216\n521609033403\n511656028054\n");

  assert.deepEqual(parsed.uniqueLines, [
    "511656028216",
    "511656028054",
    "521609033403",
  ]);
  assert.equal(parsed.rawCount, 5);
  assert.equal(parsed.duplicatesRemoved, 2);
  assert.deepEqual(parsed.duplicateEntries, [
    { value: "511656028054", total: 2, removed: 1 },
    { value: "511656028216", total: 2, removed: 1 },
  ]);
});

test("outbound manager classifies outbound response by fnsh code", () => {
  const success = moduleUnderTest.classifyOutboundResponse("511656028216", { fnsh: "0", ord_cnt: 1, out_cnt: 1 });
  const alreadyDone = moduleUnderTest.classifyOutboundResponse("511656028054", { fnsh: "1", ord_cnt: 0, out_cnt: 0 });
  const missing = moduleUnderTest.classifyOutboundResponse("521609033403", { fnsh: "5", ord_cnt: 0, out_cnt: 0 });

  assert.equal(success.resultKind, "success");
  assert.equal(success.resultLabel, "완료");
  assert.match(success.message, /1건 발송처리/);

  assert.equal(alreadyDone.resultKind, "error");
  assert.equal(alreadyDone.resultLabel, "기처리");
  assert.equal(alreadyDone.errorGroup, "기처리");

  assert.equal(missing.resultLabel, "송장미등록");
  assert.equal(missing.errorGroup, "미존재\/대상없음");
});

test("outbound manager classifies cancel response from count", () => {
  const success = moduleUnderTest.classifyCancelResponse("511656028216", { cnt: 2 });
  const none = moduleUnderTest.classifyCancelResponse("511656028054", { cnt: 0 });

  assert.equal(success.resultKind, "success");
  assert.equal(success.resultLabel, "취소완료");
  assert.match(success.message, /2건의 주문이 출고취소/);

  assert.equal(none.resultKind, "error");
  assert.equal(none.resultLabel, "취소대상없음");
  assert.equal(none.errorGroup, "취소대상없음");
});

test("outbound manager result filter supports partial match across invoice and message", () => {
  const rows = [
    { invoiceNumber: "511656028216", modeLabel: "출고", resultLabel: "완료", message: "1건 발송처리(1건 재고출고처리)", processedAt: new Date("2026-04-06T10:00:00Z").getTime() },
    { invoiceNumber: "511656028054", modeLabel: "출고취소", resultLabel: "취소대상없음", message: "출고취소할 주문이 없습니다.", processedAt: new Date("2026-04-06T11:00:00Z").getTime() },
  ];

  assert.deepEqual(moduleUnderTest.filterResults(rows, "028216").map((row) => row.invoiceNumber), ["511656028216"]);
  assert.deepEqual(moduleUnderTest.filterResults(rows, "취소대상").map((row) => row.invoiceNumber), ["511656028054"]);
  assert.equal(moduleUnderTest.filterResults(rows, "").length, 2);
});

test("outbound manager error summary groups by category and includes unprocessed numbers", () => {
  const groups = moduleUnderTest.buildErrorSummary([
    { invoiceNumber: "A", resultKind: "error", errorGroup: "기처리" },
    { invoiceNumber: "B", resultKind: "warning", errorGroup: "부분처리/경고" },
    { invoiceNumber: "C", resultKind: "error", errorGroup: "기처리" },
    { invoiceNumber: "D", resultKind: "success", errorGroup: "" },
  ], ["E", "F"]);

  assert.deepEqual(groups, [
    { label: "기처리", count: 2, invoiceNumbers: ["A", "C"] },
    { label: "중지로 미처리", count: 2, invoiceNumbers: ["E", "F"] },
    { label: "부분처리/경고", count: 1, invoiceNumbers: ["B"] },
  ]);
});

test("outbound manager summary counts successes, errors, duplicates, and remaining queue", () => {
  assert.deepEqual(moduleUnderTest.buildSummary({
    totalUnique: 4,
    duplicatesRemoved: 2,
    queue: ["C", "D"],
    currentInvoice: "B",
    unprocessed: ["D"],
    results: [
      { resultKind: "success" },
      { resultKind: "error" },
      { resultKind: "warning" },
    ],
  }), {
    totalUnique: 4,
    duplicatesRemoved: 2,
    successCount: 1,
    errorCount: 2,
    remainingCount: 3,
    unprocessedCount: 1,
  });
});

test("outbound manager rows html keeps centered columns", () => {
  const html = moduleUnderTest.buildResultRowsHtml([
    {
      invoiceNumber: "511656028216",
      modeLabel: "출고",
      resultKind: "success",
      resultLabel: "완료",
      message: "1건 발송처리(1건 재고출고처리)",
      processedAt: new Date("2026-04-06T10:00:00Z").getTime(),
    },
  ]);

  assert.match(html, /data-tm-align="center">511656028216/);
  assert.match(html, /data-tm-align="center">출고/);
  assert.match(html, /data-tm-align="center" data-tm-tone="primary"><strong>완료/);
});

test("outbound manager registry and meta stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "outbound-manager");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/outbound-manager/meta.json");
  assert.equal(meta.entry, "modules/outbound-manager/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["module-ui"]);
});
