const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/inbound-inspection/main.js");
const meta = require("../modules/inbound-inspection/meta.json");
const registry = require("../config/registry.json");

test("inbound inspection exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "inbound-inspection");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("inbound inspection shouldRun matches ebut pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/home" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://example.com/" } }), false);
});

test("inbound inspection base100/base200 query params keep required shape", () => {
  const base100 = moduleUnderTest.buildBase100RequestParams(1, 123, "4603");
  const base200 = moduleUnderTest.buildBase200RequestParams(2, 456, "4603");

  assert.equal(base100.BASIC_CUST, "4603");
  assert.equal(base100.BASIC_NICN_YN, "undefined");
  assert.equal(base100.rows, "500");
  assert.equal(base100.page, "1");
  assert.equal(base200.BOPTCODE_BARCODE, "");
  assert.equal(base200.page, "2");
  assert.equal(base200.nd, "456");
});

test("inbound inspection master merge excludes online rows and keeps first info with merged barcodes", () => {
  const records = moduleUnderTest.mergeMasterRows([
    { basic_nicn: "NICN-A", basic_name: "일반 상품", basic_bigo: "판매처A" },
    { basic_nicn: "NICN-B", basic_name: "테스트 (ONLINE)", basic_bigo: "판매처B" },
  ], [
    { basic_nicn: "NICN-A", basic_name: "일반 상품", basic_bigo: "", boptcode_barcode: "BC-1" },
    { basic_nicn: "NICN-A", basic_name: "일반 상품", basic_bigo: "판매처A", boptcode_barcode: "BC-2" },
    { basic_nicn: "NICN-C", basic_name: "추가 상품", basic_bigo: "판매처C", boptcode_barcode: "BC-3" },
  ]);

  assert.deepEqual(records, [
    { id: "NICN-A", nicn: "NICN-A", name: "일반 상품", seller: "판매처A", barcodes: ["BC-1", "BC-2"], primaryBarcode: "BC-1" },
    { id: "NICN-C", nicn: "NICN-C", name: "추가 상품", seller: "판매처C", barcodes: ["BC-3"], primaryBarcode: "BC-3" },
  ]);
});

test("inbound inspection scan index matches exact barcode and nicn keys", () => {
  const scanIndex = moduleUnderTest.buildScanIndex([
    { id: "NICN-A", nicn: "NICN-A", name: "A", seller: "S1", barcodes: ["BC-1", "BC-X"], primaryBarcode: "BC-1" },
    { id: "NICN-B", nicn: "NICN-B", name: "B", seller: "S2", barcodes: ["BC-1"], primaryBarcode: "BC-1" },
  ]);

  assert.deepEqual(moduleUnderTest.findCandidateRecords(scanIndex, "NICN-A").map((item) => item.id), ["NICN-A"]);
  assert.deepEqual(moduleUnderTest.findCandidateRecords(scanIndex, "BC-1").map((item) => item.id), ["NICN-A", "NICN-B"]);
  assert.deepEqual(moduleUnderTest.findCandidateRecords(scanIndex, "UNKNOWN"), []);
});

test("inbound inspection applyScanSelection increments count and moves latest item to top", () => {
  const recordA = { id: "NICN-A", nicn: "NICN-A", name: "상품A", seller: "판매처A", primaryBarcode: "BC-A" };
  const recordB = { id: "NICN-B", nicn: "NICN-B", name: "상품B", seller: "판매처B", primaryBarcode: "BC-B" };

  let rows = moduleUnderTest.applyScanSelection([], recordA, "BC-A", { scannedAt: 100 });
  rows = moduleUnderTest.applyScanSelection(rows, recordB, "BC-B", { scannedAt: 200 });
  rows = moduleUnderTest.applyScanSelection(rows, recordA, "BC-A", { scannedAt: 300 });

  assert.deepEqual(rows, [
    { recordId: "NICN-A", seller: "판매처A", name: "상품A", nicn: "NICN-A", barcode: "BC-A", count: 2, lastScanCode: "BC-A", lastScannedAt: 300 },
    { recordId: "NICN-B", seller: "판매처B", name: "상품B", nicn: "NICN-B", barcode: "BC-B", count: 1, lastScanCode: "BC-B", lastScannedAt: 200 },
  ]);
});

test("inbound inspection rows html centers all requested columns", () => {
  const html = moduleUnderTest.buildRowsHtml([
    { seller: "판매처A", name: "상품A", nicn: "NICN-A", barcode: "BC-A", count: 2 },
  ]);

  assert.match(html, /data-tm-align="center">판매처A/);
  assert.match(html, /data-tm-align="center">상품A/);
  assert.match(html, /data-tm-align="center">NICN-A/);
  assert.match(html, /data-tm-align="center">BC-A/);
  assert.match(html, /data-tm-align="center">2/);
});

test("inbound inspection summary reflects total scans and latest missing code", () => {
  assert.deepEqual(moduleUnderTest.buildSummary({
    totalScans: 3,
    rows: [{}, {}],
    lastMissingCode: "MISS-1",
    unresolvedScans: {
      "MISS-1": { code: "MISS-1", count: 2, lastScannedAt: 100 },
      "MISS-2": { code: "MISS-2", count: 1, lastScannedAt: 200 },
    },
  }), {
    totalScans: 3,
    uniqueCount: 2,
    lastMissingCode: "MISS-1",
    unresolvedCount: 3,
  });
});

test("inbound inspection registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "inbound-inspection");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/inbound-inspection/meta.json");
  assert.equal(meta.entry, "modules/inbound-inspection/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id);
  assert.deepEqual(dependencyIds, ["module-ui", "nav-menu"]);
});

test("inbound inspection start installs nav button next to pattern analyzer with 상담전용창 fallback", () => {
  const targetWindow = {
    location: { href: "https://www.ebut3pl.co.kr/home" },
    document: {},
  };
  let installOptions = null;
  const navMenu = {
    resolveNavTargetWindow() {
      return { win: targetWindow, navMenu: {} };
    },
    installNavButton(win, options) {
      installOptions = { win, options };
      return { dispose() {} };
    },
  };
  const sourceWindow = {
    location: { href: "https://www.ebut3pl.co.kr/home" },
    document: {},
    __tmNavMenu: navMenu,
  };
  targetWindow.__tmNavMenu = navMenu;

  moduleUnderTest.start({ window: sourceWindow, loader: null });

  assert.ok(installOptions);
  assert.equal(installOptions.win, targetWindow);
  assert.equal(installOptions.options.buttonId, "tm-inbound-inspection-nav-button");
  assert.equal(installOptions.options.label, "입고검수");
  assert.equal(installOptions.options.insertAfterLabel, "패턴분석기");
  assert.equal(installOptions.options.insertBeforeLabel, "상담전용창");
  assert.equal(typeof installOptions.options.onClick, "function");
});

test("inbound inspection start does not fetch master on nav pages before manual refresh", () => {
  let fetchCount = 0;
  const targetWindow = {
    location: { href: "https://www.ebut3pl.co.kr/home" },
    document: {},
    fetch() {
      fetchCount += 1;
      throw new Error("should not fetch");
    },
  };
  let installOptions = null;
  const navMenu = {
    resolveNavTargetWindow() {
      return { win: targetWindow, navMenu: {} };
    },
    installNavButton(win, options) {
      installOptions = { win, options };
      return { dispose() {} };
    },
  };
  const sourceWindow = {
    location: { href: "https://www.ebut3pl.co.kr/home" },
    document: {},
    __tmNavMenu: navMenu,
  };
  targetWindow.__tmNavMenu = navMenu;

  moduleUnderTest.start({ window: sourceWindow, loader: null });

  assert.ok(installOptions);
  assert.equal(fetchCount, 0);
});

test("inbound inspection loads cached master without remote fetch until manual refresh", async () => {
  let fetchCount = 0;
  const cachedPayload = {
    fetchedAt: "2026-04-08 12:00:00",
    records: [
      { id: "NICN-A", nicn: "NICN-A", name: "상품A", seller: "판매처A", barcodes: ["BC-A"], primaryBarcode: "BC-A" },
    ],
  };
  const pageState = {
    pageWin: {
      localStorage: {
        getItem() {
          return JSON.stringify(cachedPayload);
        },
      },
      fetch() {
        fetchCount += 1;
        throw new Error("should not fetch");
      },
    },
    loader: null,
    popupState: null,
    masterState: {
      masterCache: { records: [], fetchedAt: "" },
      scanIndex: moduleUnderTest.buildScanIndex([]),
      loadingPromise: null,
      lastFetchedAt: "",
      cacheSource: "",
    },
    sessionState: {
      rows: [],
      totalScans: 0,
      lastMissingCode: "",
      unresolvedScans: {},
      statusText: "",
      statusKind: "neutral",
      scanQueue: [],
      processing: false,
      pendingConflict: null,
      conflictSelections: {},
    },
  };

  const cached = await moduleUnderTest.ensureMasterLoaded(pageState, false);

  assert.equal(fetchCount, 0);
  assert.equal(cached.records.length, 1);
  assert.equal(pageState.masterState.masterCache.records.length, 1);
  assert.equal(pageState.masterState.cacheSource, "캐시 기준");
});

test("inbound inspection does not start prefetch on pages without an accessible nav target", () => {
  let installed = false;
  const navMenu = {
    resolveNavTargetWindow() {
      return { win: { document: {} }, navMenu: null };
    },
    installNavButton() {
      installed = true;
    },
  };
  const sourceWindow = {
    location: { href: "https://www.ebut3pl.co.kr/jsp/base/base100main.jsp" },
    document: {},
    __tmNavMenu: navMenu,
  };

  const resolved = moduleUnderTest.resolveNavInstallContext(sourceWindow);
  moduleUnderTest.start({ window: sourceWindow, loader: null });

  assert.equal(resolved, null);
  assert.equal(installed, false);
  assert.equal(sourceWindow.__tmInboundInspectionStarted, undefined);
});
