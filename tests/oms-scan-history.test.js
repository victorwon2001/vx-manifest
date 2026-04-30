const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/oms-scan-history/main.js");
const meta = require("../modules/oms-scan-history/meta.json");
const registry = require("../config/registry.json");

test("oms scan history exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "oms-scan-history");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("oms scan history shouldRun matches oms main and order pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/main.do" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/order/orderWaybill.do" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/login.do" } }), false);
});

test("oms scan history builds encoded pdf url", () => {
  assert.equal(
    moduleUnderTest.buildPdfUrl("2414859603949265-136"),
    "https://oms.bstage.systems/stan/order/orderWaybillPdfPrint.do?scanText=2414859603949265-136"
  );
});

test("oms scan history creates pending history rows", () => {
  const row = moduleUnderTest.createPendingHistoryRow("2414859603949265-136", 1000);
  assert.equal(row.code, "2414859603949265-136");
  assert.equal(row.printStatus, "pending");
  assert.equal(row.scannedAt, 1000);
});

test("oms scan history normalizes records to recent seven-day window", () => {
  const now = Date.UTC(2026, 3, 10, 0, 0, 0);
  const history = moduleUnderTest.normalizeHistory([
    { id: "old", code: "A", scannedAt: now - moduleUnderTest.HISTORY_TTL_MS - 1, printStatus: "success", message: "old" },
    { id: "ok", code: "B", scannedAt: now - 1000, printStatus: "success", message: "ok" },
    { id: "legacy", code: "C", createdAt: now - 2000, success: true, message: "legacy" },
  ], now);
  assert.deepEqual(history.map((item) => item.id), ["ok", "legacy"]);
  assert.equal(history[1].printStatus, "success");
});

test("oms scan history duplicate detection only counts success records", () => {
  const now = Date.now();
  const history = [
    { id: "1", code: "A", scannedAt: now - 3000, printStatus: "failed", message: "" },
    { id: "2", code: "A", scannedAt: now - 2000, printStatus: "skipped", message: "" },
    { id: "3", code: "A", scannedAt: now - 1000, printStatus: "success", message: "" },
  ];
  assert.equal(moduleUnderTest.hasPrintedDuplicate(history, "A"), true);
  assert.equal(moduleUnderTest.hasPrintedDuplicate(history, "B"), false);
  assert.equal(moduleUnderTest.findLatestPrintedHistory(history, "A").id, "3");
});

test("oms scan history preview keeps only the latest 10 rows", () => {
  const now = Date.now();
  const history = Array.from({ length: 18 }, (_, index) => ({
    id: String(index + 1),
    code: "S-" + index,
    scannedAt: now - index,
    printStatus: "success",
    message: "",
  }));
  assert.equal(moduleUnderTest.previewHistory(history).length, 10);
});

test("oms scan history search matches partial text from code status message and time", () => {
  const now = Date.now();
  const first = now - 4 * 3600 * 1000;
  const second = now - 2 * 3600 * 1000;
  const firstDate = new Date(first);
  const firstFormatted = [
    firstDate.getFullYear(),
    String(firstDate.getMonth() + 1).padStart(2, "0"),
    String(firstDate.getDate()).padStart(2, "0"),
  ].join("-") + " " + String(firstDate.getHours()).padStart(2, "0");
  const history = [
    { id: "1", code: "2414859603949265-136", scannedAt: first, printStatus: "success", message: "PDF 출력 응답 확인" },
    { id: "2", code: "511656028216", scannedAt: second, printStatus: "failed", message: "출력 요청 오류" },
  ];
  assert.equal(moduleUnderTest.searchHistory(history, "3949").length, 1);
  assert.equal(moduleUnderTest.searchHistory(history, "실패").length, 1);
  assert.equal(moduleUnderTest.searchHistory(history, firstFormatted).length, 1);
});

test("oms scan history paginates records in fixed-size pages", () => {
  const now = Date.now();
  const history = Array.from({ length: 205 }, (_, index) => ({
    id: String(index + 1),
    code: "S-" + index,
    scannedAt: now - index,
    printStatus: "success",
    message: "",
  }));
  const page = moduleUnderTest.paginateHistory(history, 3, 100);
  assert.equal(page.page, 3);
  assert.equal(page.totalPages, 3);
  assert.equal(page.rows.length, 5);
});

test("oms scan history prepared scan dedupe keeps the same code inside the reuse window", () => {
  assert.equal(moduleUnderTest.shouldReusePreparedScan({ code: "A", at: 1000 }, "A", 5500), true);
  assert.equal(moduleUnderTest.shouldReusePreparedScan({ code: "A", at: 1000 }, "A", 6501), false);
  assert.equal(moduleUnderTest.shouldReusePreparedScan({ code: "A", at: 1000 }, "B", 1100), false);
});

test("oms scan history reuses the previous duplicate decision during one scan action", () => {
  const cancelled = moduleUnderTest.getReusablePreparedScanResult({
    code: "A",
    at: 1000,
    result: { blocked: true, reason: "duplicate-cancelled" },
  }, "A", 4000);

  assert.deepEqual(cancelled, {
    blocked: true,
    reason: "duplicate-cancelled",
    reused: true,
  });

  const row = { id: "row-1", code: "A" };
  const confirmed = moduleUnderTest.getReusablePreparedScanResult({
    code: "A",
    at: 1000,
    result: { blocked: false, row },
  }, "A", 4000);

  assert.equal(confirmed.blocked, false);
  assert.equal(confirmed.reused, true);
  assert.equal(confirmed.row, row);
  assert.equal(moduleUnderTest.getReusablePreparedScanResult({ code: "A", at: 1000 }, "A", 6501), null);
});

test("oms scan history detects pdf buffers by magic header", () => {
  const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer;
  const textBytes = Uint8Array.from([0x48, 0x54, 0x4d, 0x4c]).buffer;
  assert.equal(moduleUnderTest.isLikelyPdfBuffer(pdfBytes), true);
  assert.equal(moduleUnderTest.isLikelyPdfBuffer(textBytes), false);
});

test("oms scan history updates one row while preserving others", () => {
  const rows = [
    { id: "1", code: "A", scannedAt: 1, printStatus: "pending", message: "" },
    { id: "2", code: "B", scannedAt: 2, printStatus: "pending", message: "" },
  ];
  const updated = moduleUnderTest.updateHistoryRows(rows, "2", { printStatus: "success", message: "ok" });
  assert.equal(updated[0].printStatus, "pending");
  assert.equal(updated[1].printStatus, "success");
  assert.equal(updated[1].message, "ok");
});

test("oms scan history registry and meta stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "oms-scan-history");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/oms-scan-history/meta.json");
  assert.deepEqual(script.matches, [
    "https://oms.bstage.systems/stan/main.do*",
    "https://oms.bstage.systems/stan/order/orderWaybill.do*",
  ]);
  assert.equal(meta.entry, "modules/oms-scan-history/main.js");
  assert.deepEqual(meta.dependencies || [], []);
});
