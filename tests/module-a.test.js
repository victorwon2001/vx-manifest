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

const moduleA = require(resolveRepoPath(["../modules/module-a/main.js"]));
const moduleSource = fs.readFileSync(resolveRepoPath(["../modules/module-a/main.js"]), "utf8");

test("module-a toolbar html uses compact embedded shared ui classes", () => {
  const html = moduleA.buildToolbarHtml();

  assert.match(html, /tm-ui-root tm-ui-embedded/);
  assert.match(html, /data-tm-density=['"]compact['"]/);
  assert.match(html, /tm-ui-panel-head/);
  assert.match(html, /tm-ui-kicker/);
  assert.match(html, /tm-ui-btn/);
  assert.match(html, /tm-ui-input/);
  assert.match(html, /스캔 기록/);
  assert.match(html, /송장출력\(스캔\) 필터링/);
  assert.match(html, /tm-module-a-batch-panel/);
  assert.match(html, /차수 표/);
});

test("module-a modal html uses the shared overlay and modal contract", () => {
  const html = moduleA.buildModalShellHtml();

  assert.match(html, /tm-ui-root tm-ui-panel tm-ui-overlay/);
  assert.match(html, /data-tm-density=['"]compact['"]/);
  assert.match(html, /tm-ui-overlay/);
  assert.match(html, /tm-ui-modal/);
  assert.match(html, /tm-ui-modal__head/);
  assert.match(html, /tm-ui-modal__body/);
});

test("module-a local tables keep center alignment with memo columns left aligned", () => {
  assert.match(moduleSource, /selected-list th,#\" \+ PANEL_ID \+ \"-selected-list td\{padding:6px 7px;border-bottom:1px solid var\(--tm-border\);text-align:center/);
  assert.match(moduleSource, /selected-list th:nth-child\(4\),#\" \+ PANEL_ID \+ \"-selected-list td:nth-child\(4\)\{text-align:left\}/);
  assert.match(moduleSource, /-batch-panel th,#\" \+ PANEL_ID \+ \"-batch-panel td\{padding:6px 7px;border-bottom:1px solid var\(--tm-border\);text-align:center/);
  assert.match(moduleSource, /-batch-panel th:nth-child\(7\),#\" \+ PANEL_ID \+ \"-batch-panel td:nth-child\(7\)\{text-align:left\}/);
  assert.match(moduleSource, /-detail-table th,#\" \+ PANEL_ID \+ \"-detail-table td\{padding:7px 8px;border-bottom:1px solid var\(--tm-border\);text-align:center/);
  assert.match(moduleSource, /-detail-table th:nth-child\(7\),#\" \+ PANEL_ID \+ \"-detail-table td:nth-child\(7\)\{text-align:left\}/);
  assert.match(moduleSource, /-history-table th,#\" \+ PANEL_ID \+ \"-history-table td\{padding:7px 8px;border-bottom:1px solid var\(--tm-border\);text-align:center/);
  assert.match(moduleSource, /-history-table th:nth-child\(11\),#\" \+ PANEL_ID \+ \"-history-table td:nth-child\(11\)\{text-align:left\}/);
});

test("module-a modal open state keeps shared modal classes intact", () => {
  assert.match(moduleSource, /modalBackdrop\.classList\.toggle\("tm-open", open\)/);
  assert.doesNotMatch(moduleSource, /modalBackdrop\.className\s*=\s*open\s*\?\s*"tm-open"\s*:\s*""/);
});

test("resolveBinaryRequestTransport prefers fetch when GM_xmlhttpRequest is unavailable", () => {
  const scope = {
    fetch() {},
  };

  const transport = moduleA.resolveBinaryRequestTransport(scope);

  assert.deepEqual(transport && transport.kind, "fetch");
  assert.equal(typeof transport.request, "function");
});

test("gmRequest falls back to fetch and returns binary-compatible response shape", async () => {
  const buffer = new TextEncoder().encode("ok").buffer;
  const calledUrls = [];
  const scope = {
    fetch: async (url) => {
      calledUrls.push(url);
      return ({
        status: 200,
        headers: {
          forEach(callback) {
            callback("application/octet-stream", "content-type");
            callback("attachment; filename=test.xls", "content-disposition");
          },
        },
        arrayBuffer: async () => buffer,
      });
    },
  };

  const response = await moduleA.gmRequest({
    method: "GET",
    url: "https://example.com/file.xls",
    fetchUrl: "/util/ExlForm_DB3?ORDLIST_IVNO=12",
    headers: { Accept: "application/octet-stream" },
  }, scope);

  assert.deepEqual(calledUrls, ["/util/ExlForm_DB3?ORDLIST_IVNO=12"]);
  assert.equal(response.status, 200);
  assert.match(response.responseHeaders, /content-type: application\/octet-stream/i);
  assert.equal(response.response.byteLength, 2);
});

test("captureScanOptions reads current search mode and print flags", () => {
  const doc = {
    querySelector(selector) {
      if (selector === "input[name='SEARCH_TYPE']:checked") return { value: "ordlist_dno" };
      if (selector === "input[name='PRINT_CHECK']:checked") return { value: "Y" };
      if (selector === "input[name='SCAN_DISPATCH']:checked") return { value: "N" };
      return null;
    },
  };

  const snapshot = moduleA.captureScanOptions(doc, false);

  assert.equal(snapshot.mode, "ordlist_dno");
  assert.equal(snapshot.modeLabel, "송장번호");
  assert.equal(snapshot.printCheck, "Y");
  assert.equal(snapshot.printCheckLabel, "예");
  assert.equal(snapshot.scanDispatch, "N");
  assert.equal(snapshot.scanDispatchLabel, "아니오");
  assert.equal(snapshot.filterModeEnabled, false);
  assert.equal(snapshot.filterModeLabel, "필터링 OFF");
});

test("normalizeHistoryEntry preserves scan option labels for recorded rows", () => {
  const entry = moduleA.normalizeHistoryEntry({
    id: "recorded-1",
    timestamp: "2026-04-03T09:15:00.000Z",
    status: "recorded",
    mode: "ordlist_no1",
    value: "ORD-123",
    printCheck: "N",
    scanDispatch: "Y",
    filterModeEnabled: false,
  });

  assert.equal(entry.status, "recorded");
  assert.equal(entry.modeLabel, "주문번호");
  assert.equal(entry.printCheckLabel, "아니오");
  assert.equal(entry.scanDispatchLabel, "예");
  assert.equal(entry.filterModeLabel, "필터링 OFF");
});

test("searchHistoryEntries supports partial keyword matches for scan options", () => {
  const entries = [
    {
      id: "scan-a",
      timestamp: "2026-04-03T09:15:00.000Z",
      status: "recorded",
      mode: "ordlist_dno",
      value: "INV-001",
      printCheck: "Y",
      scanDispatch: "N",
      filterModeEnabled: false,
      selections: [],
      matchedItemIds: [],
    },
  ];

  assert.equal(moduleA.searchHistoryEntries(entries, { keyword: "필터링 off", status: "all", days: "14" }, "2026-04-03T10:00:00.000Z").length, 1);
  assert.equal(moduleA.searchHistoryEntries(entries, { keyword: "중복출력금지 예", status: "all", days: "14" }, "2026-04-03T10:00:00.000Z").length, 1);
  assert.equal(moduleA.searchHistoryEntries(entries, { keyword: "출고처리 아니오", status: "all", days: "14" }, "2026-04-03T10:00:00.000Z").length, 1);
});

test("buildHistoryDisplayRows exposes filter and option labels for scan records", () => {
  const rows = moduleA.buildHistoryDisplayRows([
    {
      id: "scan-a",
      timestamp: "2026-04-03T09:15:00.000Z",
      timeLabel: "2026-04-03 18:15:00",
      status: "recorded",
      mode: "ordlist_dno",
      value: "INV-001",
      printCheck: "Y",
      printCheckLabel: "예",
      scanDispatch: "N",
      scanDispatchLabel: "아니오",
      filterModeEnabled: false,
      filterModeLabel: "필터링 OFF",
      selections: [],
      matchedItemIds: [],
    },
  ]);

  assert.equal(rows[0].statusLabel, "기록");
  assert.equal(rows[0].statusClass, "tm-recorded");
  assert.equal(rows[0].filterModeLabel, "필터링 OFF");
  assert.equal(rows[0].printCheckLabel, "예");
  assert.equal(rows[0].scanDispatchLabel, "아니오");
});
