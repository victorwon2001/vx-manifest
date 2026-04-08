module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "inbound-inspection";
  const MODULE_NAME = "입고검수";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const BASE_ORIGIN = "https://www.ebut3pl.co.kr";
  const BASE100_ENDPOINT = "/base/base100main_jdata";
  const BASE200_ENDPOINT = "/base/base200main_jdata";
  const BASE100_REFERER = "/jsp/base/base100main.jsp";
  const BASE200_REFERER = "/jsp/base/base200main.jsp";
  const PAGE_SIZE = 500;
  const NAV_BUTTON_ID = "tm-inbound-inspection-nav-button";
  const NAV_BUTTON_LABEL = "입고검수";
  const NAV_INSERT_AFTER_LABEL = "패턴분석기";
  const NAV_INSERT_BEFORE_LABEL = "상담전용창";
  const NAV_RETRY_LIMIT = 30;
  const NAV_RETRY_DELAY_MS = 500;
  const NAV_SELECTOR = ".nav.navbar-nav.navbar-right";
  const POPUP_NAME = "tm-inbound-inspection-window";
  const POPUP_FEATURES = "width=1320,height=900,resizable=yes,scrollbars=yes";
  const STATE_KEY = "__tmInboundInspectionState";
  const STYLE_ID = "tm-inbound-inspection-style";
  const MASTER_STORAGE_KEY = "inboundInspectionMasterCacheV1";
  const FALLBACK_MASTER_STORAGE_KEY = "__tmInboundInspectionMasterCacheV1";
  const SESSION_EXPIRED_MARKERS = ["자동 로그아웃 되었습니다", "/home/docs/login.html", "세션종료", "로그인"];
  const MASTER_META_ID = "tmInboundInspectionMasterMeta";
  const STATUS_ID = "tmInboundInspectionStatus";
  const SUMMARY_ID = "tmInboundInspectionSummary";
  const TABLE_BODY_ID = "tmInboundInspectionTableBody";
  const SCAN_INPUT_ID = "tmInboundInspectionScanInput";
  const REFRESH_BUTTON_ID = "tmInboundInspectionRefreshButton";
  const CONFLICT_ID = "tmInboundInspectionConflict";
  const CONFLICT_BODY_ID = "tmInboundInspectionConflictBody";
  const CONFLICT_CODE_ID = "tmInboundInspectionConflictCode";

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
    return null;
  }

  function getNavMenu(scope) {
    if (scope && scope.__tmNavMenu) return scope.__tmNavMenu;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmNavMenu) return globalThis.__tmNavMenu;
    return null;
  }

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeScanCode(value) {
    return safeTrim(value);
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function isExcludedName(name) {
    return safeTrim(name).toUpperCase().indexOf("(ONLINE)") !== -1;
  }

  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null) search.set(key, String(params[key]));
    });
    return search.toString();
  }

  function buildBase100RequestParams(page, nd, basicCust) {
    return {
      BASIC_CUST: basicCust || "4603",
      BASIC_NAME: "",
      BASIC_PROV: "",
      PROV_NAME: "",
      BASIC_NICN: "",
      BASIC_NICN_YN: "undefined",
      BASIC_FINISH2: "",
      BASIC_FINISH: "",
      BASIC_BRAND: "",
      BASIC_MUSER: "",
      BASIC_RDATE1: "",
      BASIC_RDATE2: "",
      BASIC_DEPTH1: "",
      BASIC_DEPTH2: "",
      BASIC_DEPTH3: "",
      BSADD_EDITYN: "",
      BSADD_EDITDT: "",
      BSADD_REGYN: "",
      BSADD_REGDT: "",
      BASIC_LOCATION: "",
      BOPTCODE_BARCODE: "",
      BASIC_BIGO: "",
      BASIC_GBN: "",
      BASIC_UCODE: "",
      gridReload: "true",
      _search: "false",
      rows: String(PAGE_SIZE),
      page: String(page),
      sidx: "basic_seq",
      sord: "desc",
      nd: String(nd),
    };
  }

  function buildBase200RequestParams(page, nd, basicCust) {
    return {
      BASIC_CUST: basicCust || "4603",
      BASIC_NAME: "",
      BASIC_PROV: "",
      PROV_NAME: "",
      BASIC_NICN: "",
      BASIC_NICN_YN: "undefined",
      BASIC_FINISH2: "",
      BASIC_FINISH: "",
      BASIC_BRAND: "",
      BASIC_RDATE1: "",
      BASIC_RDATE2: "",
      BASIC_LOCATION: "",
      BOPTCODE_CBM: "",
      BOPTCODE_BARCODE: "",
      gridReload: "true",
      _search: "false",
      rows: String(PAGE_SIZE),
      page: String(page),
      sidx: "basic_seq",
      sord: "desc",
      nd: String(nd),
    };
  }

  function isSessionExpiredText(text) {
    const body = String(text || "");
    return SESSION_EXPIRED_MARKERS.some((marker) => body.indexOf(marker) !== -1);
  }

  async function fetchJDataPage(pageWin, path, refererPath, params) {
    const fetcher = pageWin && typeof pageWin.fetch === "function"
      ? pageWin.fetch.bind(pageWin)
      : (typeof fetch === "function" ? fetch.bind(root) : null);
    if (!fetcher) throw new Error("fetch를 사용할 수 없습니다.");

    const response = await fetcher(BASE_ORIGIN + path + "?" + toQueryString(params), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: BASE_ORIGIN + refererPath,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(path + " 조회 실패 (" + response.status + ")");
    if (isSessionExpiredText(text)) throw new Error("세션이 종료되었습니다. 다시 로그인하세요.");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(path + " 응답을 해석하지 못했습니다.");
    }
  }

  async function fetchAllJData(pageWin, path, refererPath, buildParams, basicCust) {
    const first = await fetchJDataPage(pageWin, path, refererPath, buildParams(1, Date.now(), basicCust));
    const totalPages = Math.max(Number(first && first.totalpages) || 1, 1);
    const rows = Array.isArray(first && first.rows) ? first.rows.slice() : [];
    for (let page = 2; page <= totalPages; page += 1) {
      const payload = await fetchJDataPage(pageWin, path, refererPath, buildParams(page, Date.now() + page, basicCust));
      if (Array.isArray(payload && payload.rows)) rows.push.apply(rows, payload.rows);
    }
    return rows;
  }

  function mergeMasterRows(base100Rows, base200Rows) {
    const infoByNicn = new Map();

    function ensureInfo(nicn) {
      if (!infoByNicn.has(nicn)) {
        infoByNicn.set(nicn, {
          id: nicn,
          nicn,
          name: "",
          seller: "",
          barcodes: [],
        });
      }
      return infoByNicn.get(nicn);
    }

    (Array.isArray(base100Rows) ? base100Rows : []).forEach((row) => {
      const nicn = safeTrim(row && row.basic_nicn);
      const name = safeTrim(row && row.basic_name);
      if (!nicn || isExcludedName(name)) return;
      const seller = safeTrim(row && row.basic_bigo);
      const item = ensureInfo(nicn);
      if (!item.name && name) item.name = name;
      if (!item.seller && seller) item.seller = seller;
    });

    (Array.isArray(base200Rows) ? base200Rows : []).forEach((row) => {
      const nicn = safeTrim(row && row.basic_nicn);
      const name = safeTrim(row && row.basic_name);
      if (!nicn || isExcludedName(name)) return;
      const seller = safeTrim(row && row.basic_bigo);
      const barcode = normalizeScanCode(row && row.boptcode_barcode);
      const item = ensureInfo(nicn);
      if (!item.name && name) item.name = name;
      if (!item.seller && seller) item.seller = seller;
      if (barcode && item.barcodes.indexOf(barcode) === -1) item.barcodes.push(barcode);
    });

    return Array.from(infoByNicn.values()).map((item) => {
      const barcodes = unique(item.barcodes);
      return {
        id: item.id,
        nicn: item.nicn,
        name: item.name || "-",
        seller: item.seller || "-",
        barcodes,
        primaryBarcode: barcodes[0] || "",
      };
    }).sort((left, right) => left.nicn.localeCompare(right.nicn));
  }

  function buildScanIndex(records) {
    const recordsById = {};
    const idsByCode = {};

    function link(code, recordId) {
      const key = normalizeScanCode(code);
      if (!key) return;
      if (!idsByCode[key]) idsByCode[key] = [];
      if (idsByCode[key].indexOf(recordId) === -1) idsByCode[key].push(recordId);
    }

    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!record || !record.id) return;
      recordsById[record.id] = {
        id: record.id,
        nicn: safeTrim(record.nicn) || "-",
        name: safeTrim(record.name) || "-",
        seller: safeTrim(record.seller) || "-",
        barcodes: unique(record.barcodes || []),
        primaryBarcode: safeTrim(record.primaryBarcode),
      };
      link(record.nicn, record.id);
      (record.barcodes || []).forEach((barcode) => link(barcode, record.id));
    });

    return { recordsById, idsByCode };
  }

  function findCandidateRecords(scanIndex, code) {
    const key = normalizeScanCode(code);
    if (!key) return [];
    const ids = scanIndex && scanIndex.idsByCode && Array.isArray(scanIndex.idsByCode[key]) ? scanIndex.idsByCode[key] : [];
    return ids.map((id) => scanIndex.recordsById[id]).filter(Boolean);
  }

  function buildEntry(record, scanCode, previous, options) {
    const nextCount = Math.max(1, Number(options && options.count) || 1);
    const scannedAt = Math.max(
      Number(previous && previous.lastScannedAt) || 0,
      Number(options && options.scannedAt) || Date.now()
    );
    return {
      recordId: record.id,
      seller: record.seller || "-",
      name: record.name || "-",
      nicn: record.nicn || "-",
      barcode: record.primaryBarcode || normalizeScanCode(scanCode) || "-",
      count: previous ? previous.count + nextCount : nextCount,
      lastScanCode: normalizeScanCode(scanCode),
      lastScannedAt: scannedAt,
    };
  }

  function applyScanSelection(entries, record, scanCode, options) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    const index = list.findIndex((entry) => entry && entry.recordId === record.id);
    const previous = index === -1 ? null : list[index];
    if (index !== -1) list.splice(index, 1);
    list.push(buildEntry(record, scanCode, previous, options));
    return list.sort((left, right) => {
      const rightTime = Number(right && right.lastScannedAt) || 0;
      const leftTime = Number(left && left.lastScannedAt) || 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return String(left && left.recordId || "").localeCompare(String(right && right.recordId || ""));
    });
  }

  function buildUnresolvedEntries(unresolvedScans) {
    return Object.keys(unresolvedScans || {}).map((code) => {
      const entry = unresolvedScans[code] || {};
      return {
        code: normalizeScanCode(code),
        count: Math.max(1, Number(entry.count) || 1),
        lastScannedAt: Number(entry.lastScannedAt) || 0,
      };
    }).filter((entry) => entry.code);
  }

  function getLatestUnresolvedCode(unresolvedScans) {
    const entries = buildUnresolvedEntries(unresolvedScans);
    if (!entries.length) return "";
    entries.sort((left, right) => {
      if (right.lastScannedAt !== left.lastScannedAt) return right.lastScannedAt - left.lastScannedAt;
      return left.code.localeCompare(right.code);
    });
    return entries[0].code;
  }

  function buildSummary(state) {
    return {
      totalScans: Number(state && state.totalScans) || 0,
      uniqueCount: Array.isArray(state && state.rows) ? state.rows.length : 0,
      lastMissingCode: safeTrim(state && state.lastMissingCode) || "-",
      unresolvedCount: buildUnresolvedEntries(state && state.unresolvedScans).reduce((sum, entry) => sum + entry.count, 0),
    };
  }

  function buildSummaryHtml(state) {
    const summary = buildSummary(state);
    return [
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">총 스캔 수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.totalScans) + "</span></div>",
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">고유 상품 수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.uniqueCount) + "</span></div>",
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">미확인 코드 수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.unresolvedCount) + "</span></div>",
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">최근 실패 코드</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.lastMissingCode) + "</span></div>",
    ].join("");
  }

  function buildRowsHtml(entries) {
    if (!entries || !entries.length) {
      return '<tr><td colspan="5" class="tm-ui-empty">아직 스캔된 항목이 없습니다.</td></tr>';
    }
    return entries.map((entry) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(entry.seller) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(entry.name) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(entry.nicn) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(entry.barcode) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(entry.count) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildConflictRowsHtml(candidates) {
    if (!candidates || !candidates.length) {
      return '<tr><td colspan="5" class="tm-ui-empty">선택 가능한 후보가 없습니다.</td></tr>';
    }
    return candidates.map((record) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(record.seller) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(record.name) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(record.nicn) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(record.primaryBarcode || "-") + "</td>",
        '<td data-tm-align="center"><button type="button" class="tm-ui-btn tm-ui-btn--primary" data-action="choose-candidate" data-record-id="' + escapeHtml(record.id) + '">선택</button></td>',
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildShellHtml() {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "popup", className: "tm-inbound-inspection", density: "compact" })
      : 'class="tm-inbound-inspection"';
    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-shell">',
      '    <div class="tm-ui-card tm-ui-panel-head tm-ui-panel-head--compact">',
      '      <div class="tm-ui-head-meta">',
      "        <div>",
      '          <p class="tm-ui-kicker">Inbound Inspection</p>',
      '          <h1 class="tm-ui-title">입고검수</h1>',
      '          <p class="tm-ui-subtitle">바코드 또는 관리명을 스캔해 입고 수량을 바로 누적 확인합니다.</p>',
      "        </div>",
      '        <div class="tm-ui-toolbar__actions">',
      '          <button id="' + REFRESH_BUTTON_ID + '" type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="refresh-master">마스터 새로고침</button>',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--ghost" data-action="close-window">닫기</button>',
      "        </div>",
      "      </div>",
      '      <div class="tm-ui-toolbar tm-inbound-inspection__toolbar">',
      '        <label class="tm-ui-label tm-inbound-inspection__scan-field"><span>스캔값</span><input id="' + SCAN_INPUT_ID + '" class="tm-ui-input" type="text" autocomplete="off" placeholder="바코드 또는 관리명을 스캔하세요"></label>',
      '        <div class="tm-ui-toolbar__actions">',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--primary" data-action="submit-scan">스캔 반영</button>',
      "        </div>",
      "      </div>",
      '      <div id="' + MASTER_META_ID + '" class="tm-ui-inline-note">마스터 정보를 준비하는 중입니다.</div>',
      "    </div>",
      '    <div id="' + STATUS_ID + '" class="tm-ui-message">입고검수 창을 열었습니다.</div>',
      '    <div id="' + SUMMARY_ID + '" class="tm-ui-kpis"></div>',
      '    <div class="tm-ui-card">',
      '      <div class="tm-ui-section-head">',
      '        <div><h2 class="tm-ui-section-title">스캔 결과</h2><p class="tm-ui-section-subtitle">가장 최근에 스캔된 상품이 맨 위에 표시됩니다.</p></div>',
      "      </div>",
      '      <div class="tm-ui-scroll tm-inbound-inspection__table-scroll">',
      '        <table class="tm-ui-table">',
      "          <thead>",
      "            <tr>",
      '              <th data-tm-align="center">판매처</th>',
      '              <th data-tm-align="center">상품명</th>',
      '              <th data-tm-align="center">관리명</th>',
      '              <th data-tm-align="center">바코드</th>',
      '              <th data-tm-align="center">수량</th>',
      "            </tr>",
      "          </thead>",
      '          <tbody id="' + TABLE_BODY_ID + '"></tbody>',
      "        </table>",
      "      </div>",
      "    </div>",
      '    <div id="' + CONFLICT_ID + '" class="tm-ui-overlay tm-inbound-inspection__conflict" data-tm-hidden="true">',
      '      <div class="tm-ui-modal">',
      '        <div class="tm-ui-modal__head">',
      "          <div>",
      '            <p class="tm-ui-kicker">Conflict</p>',
      '            <h3 class="tm-ui-section-title">중복 매칭 선택</h3>',
      '            <p class="tm-ui-section-subtitle">같은 스캔값으로 여러 상품이 발견되었습니다. 기준 상품을 선택하세요.</p>',
      "          </div>",
      '          <span id="' + CONFLICT_CODE_ID + '" class="tm-ui-badge tm-ui-badge--warning">-</span>',
      "        </div>",
      '        <div class="tm-ui-modal__body">',
      '          <div class="tm-ui-scroll">',
      '            <table class="tm-ui-table">',
      '              <thead><tr><th data-tm-align="center">판매처</th><th data-tm-align="center">상품명</th><th data-tm-align="center">관리명</th><th data-tm-align="center">바코드</th><th data-tm-align="center">선택</th></tr></thead>',
      '              <tbody id="' + CONFLICT_BODY_ID + '"></tbody>',
      "            </table>",
      "          </div>",
      "        </div>",
      '        <div class="tm-ui-modal__foot"><button type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="cancel-conflict">건너뛰기</button></div>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head) return;
    const moduleUi = getModuleUi(root);
    if (moduleUi && typeof moduleUi.ensureStyles === "function") moduleUi.ensureStyles(doc);
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "body{background:#f3f4f5}",
      ".tm-inbound-inspection{padding:18px}",
      ".tm-inbound-inspection__toolbar{padding:10px 0 0;background:transparent;border:none;border-radius:0}",
      ".tm-inbound-inspection__scan-field{min-width:min(520px,100%);flex:1 1 520px}",
      ".tm-inbound-inspection__scan-field input{width:100%;min-height:38px;font-size:16px;font-weight:600;letter-spacing:.02em}",
      ".tm-inbound-inspection__table-scroll{max-height:min(68vh,760px)}",
      ".tm-inbound-inspection .tm-ui-table th,.tm-inbound-inspection .tm-ui-table td{text-align:center}",
      ".tm-inbound-inspection .tm-ui-message{min-height:44px;display:flex;align-items:center}",
      ".tm-inbound-inspection .tm-ui-message.is-neutral{background:var(--tm-surface-alt);border-color:var(--tm-border);color:var(--tm-text)}",
      ".tm-inbound-inspection .tm-ui-message.is-success{background:rgba(36,90,212,.08);border-color:rgba(36,90,212,.18);color:var(--tm-primary-strong)}",
      ".tm-inbound-inspection .tm-ui-message.is-danger{background:rgba(194,77,77,.08);border-color:rgba(194,77,77,.16);color:var(--tm-danger)}",
      ".tm-inbound-inspection__conflict[data-tm-hidden='true']{display:none !important}",
      ".tm-inbound-inspection__conflict:not([data-tm-hidden='true']){display:flex !important}",
      "@media (max-width: 960px){.tm-inbound-inspection{padding:12px}.tm-inbound-inspection__scan-field{min-width:100%;flex-basis:100%}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function readMasterCache(win, state) {
    const loaderStorage = state && state.loader && state.loader.storage;
    if (loaderStorage && typeof loaderStorage.get === "function") {
      try {
        const raw = loaderStorage.get(MASTER_STORAGE_KEY, "{}");
        return JSON.parse(String(raw || "{}"));
      } catch (error) {
        return {};
      }
    }
    try {
      if (win && win.localStorage) {
        return JSON.parse(String(win.localStorage.getItem(FALLBACK_MASTER_STORAGE_KEY) || "{}"));
      }
    } catch (error) {
      return {};
    }
    return {};
  }

  function writeMasterCache(win, state, payload) {
    const next = JSON.stringify(payload || {});
    const loaderStorage = state && state.loader && state.loader.storage;
    if (loaderStorage && typeof loaderStorage.set === "function") {
      loaderStorage.set(MASTER_STORAGE_KEY, next);
      return;
    }
    try {
      if (win && win.localStorage) win.localStorage.setItem(FALLBACK_MASTER_STORAGE_KEY, next);
    } catch (error) {
      // Ignore fallback storage errors.
    }
  }

  function buildMasterMetaText(masterCache) {
    const state = masterCache || {};
    const records = Array.isArray(state.records)
      ? state.records
      : (Array.isArray(state.masterCache && state.masterCache.records) ? state.masterCache.records : []);
    const count = records.length;
    const fetchedAt = safeTrim(state.lastFetchedAt || state.fetchedAt);
    const cacheSource = safeTrim(state.cacheSource);
    if (state.loadingPromise && count) {
      return "마스터 " + count + "건 · " + (cacheSource === "cache" ? "캐시 기준" : "기존 데이터 기준") + " · 백그라운드 갱신 중";
    }
    if (state.loadingPromise) return "상품 마스터를 조회하는 중입니다.";
    if (!count) return "마스터 캐시 없음";
    return "마스터 " + count + "건" + (cacheSource ? " · " + cacheSource : "") + (fetchedAt ? " · 최종 갱신 " + fetchedAt : "");
  }

  function createMasterState() {
    return {
      masterCache: { records: [], fetchedAt: "" },
      scanIndex: buildScanIndex([]),
      loadingPromise: null,
      lastFetchedAt: "",
      cacheSource: "",
      prefetchStarted: false,
    };
  }

  function createSessionState() {
    return {
      rows: [],
      totalScans: 0,
      lastMissingCode: "",
      unresolvedScans: {},
      statusText: "입고검수 창을 열었습니다.",
      statusKind: "neutral",
      scanQueue: [],
      processing: false,
      pendingConflict: null,
      conflictSelections: {},
    };
  }

  function resolvePageState(state) {
    if (state && state.pageState) return state.pageState;
    return state || null;
  }

  function resolveMasterState(state) {
    const pageState = resolvePageState(state);
    return pageState ? pageState.masterState : null;
  }

  function resolveSessionState(state) {
    const pageState = resolvePageState(state);
    return pageState ? pageState.sessionState : null;
  }

  function getPageState(win, loader) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        pageWin: scope,
        loader: loader || null,
        popupWin: null,
        popupState: null,
        navInstall: null,
        masterState: createMasterState(),
        sessionState: createSessionState(),
      };
    }
    if (loader) scope[STATE_KEY].loader = loader;
    return scope[STATE_KEY];
  }

  function createPopupState(pageState, popupWin) {
    return {
      pageState,
      pageWin: pageState.pageWin,
      popupWin,
    };
  }

  function renderStatus(state) {
    const session = resolveSessionState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const node = doc && doc.getElementById(STATUS_ID);
    if (!node || !session) return;
    node.textContent = session.statusText;
    node.className = "tm-ui-message is-" + (session.statusKind || "neutral");
  }

  function renderMasterMeta(state) {
    const master = resolveMasterState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const node = doc && doc.getElementById(MASTER_META_ID);
    const refreshButton = doc && doc.getElementById(REFRESH_BUTTON_ID);
    if (node && master) node.textContent = buildMasterMetaText(master);
    if (refreshButton && master) {
      refreshButton.textContent = master.loadingPromise ? "새로고침 중..." : "마스터 새로고침";
      refreshButton.disabled = Boolean(master.loadingPromise);
    }
  }

  function renderSummary(state) {
    const session = resolveSessionState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const node = doc && doc.getElementById(SUMMARY_ID);
    if (!node || !session) return;
    node.innerHTML = buildSummaryHtml(session);
  }

  function renderTable(state) {
    const session = resolveSessionState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const node = doc && doc.getElementById(TABLE_BODY_ID);
    if (!node || !session) return;
    node.innerHTML = buildRowsHtml(session.rows);
  }

  function renderConflict(state) {
    const session = resolveSessionState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const overlay = doc && doc.getElementById(CONFLICT_ID);
    const codeNode = doc && doc.getElementById(CONFLICT_CODE_ID);
    const body = doc && doc.getElementById(CONFLICT_BODY_ID);
    if (!overlay || !codeNode || !body || !session) return;
    if (!session.pendingConflict) {
      overlay.setAttribute("data-tm-hidden", "true");
      codeNode.textContent = "-";
      body.innerHTML = "";
      return;
    }
    overlay.removeAttribute("data-tm-hidden");
    codeNode.textContent = session.pendingConflict.code;
    body.innerHTML = buildConflictRowsHtml(session.pendingConflict.candidates);
  }

  function renderAll(state) {
    renderStatus(state);
    renderMasterMeta(state);
    renderSummary(state);
    renderTable(state);
    renderConflict(state);
  }

  function setStatus(state, text, kind) {
    const session = resolveSessionState(state);
    if (!session) return;
    session.statusText = safeTrim(text) || "입고검수 창을 열었습니다.";
    session.statusKind = kind || "neutral";
    renderStatus(state);
  }

  function focusInput(state) {
    const session = resolveSessionState(state);
    const doc = state && state.popupWin && state.popupWin.document;
    const input = doc && doc.getElementById(SCAN_INPUT_ID);
    if (!input || (session && session.pendingConflict)) return;
    state.popupWin.setTimeout(() => {
      try {
        input.focus();
        input.select();
      } catch (error) {
        // Ignore focus errors.
      }
    }, 0);
  }

  function refreshEntriesFromMaster(state) {
    const master = resolveMasterState(state);
    const session = resolveSessionState(state);
    if (!master || !session || !master.scanIndex || !master.scanIndex.recordsById) return;
    session.rows = (session.rows || []).map((entry) => {
      const record = master.scanIndex.recordsById[entry.recordId];
      if (!record) return entry;
      return {
        recordId: entry.recordId,
        seller: record.seller || entry.seller,
        name: record.name || entry.name,
        nicn: record.nicn || entry.nicn,
        barcode: record.primaryBarcode || entry.barcode,
        count: entry.count,
        lastScanCode: entry.lastScanCode,
        lastScannedAt: entry.lastScannedAt,
      };
    });
  }

  async function fetchMasterData(state) {
    const pageState = resolvePageState(state);
    const basicCust = "4603";
    const pageWin = pageState && pageState.pageWin;
    const results = await Promise.all([
      fetchAllJData(pageWin, BASE100_ENDPOINT, BASE100_REFERER, buildBase100RequestParams, basicCust),
      fetchAllJData(pageWin, BASE200_ENDPOINT, BASE200_REFERER, buildBase200RequestParams, basicCust),
    ]);
    return {
      fetchedAt: new Date().toLocaleString("ko-KR", { hour12: false }),
      records: mergeMasterRows(results[0], results[1]),
    };
  }

  function recordUnresolvedScan(state, code, count, scannedAt) {
    const session = resolveSessionState(state);
    const key = normalizeScanCode(code);
    if (!session || !key) return;
    const existing = session.unresolvedScans[key];
    session.unresolvedScans[key] = {
      code: key,
      count: (Number(existing && existing.count) || 0) + Math.max(1, Number(count) || 1),
      lastScannedAt: Math.max(Number(existing && existing.lastScannedAt) || 0, Number(scannedAt) || Date.now()),
    };
    session.lastMissingCode = getLatestUnresolvedCode(session.unresolvedScans);
  }

  function clearUnresolvedScan(state, code) {
    const session = resolveSessionState(state);
    const key = normalizeScanCode(code);
    if (!session || !key) return;
    delete session.unresolvedScans[key];
    session.lastMissingCode = getLatestUnresolvedCode(session.unresolvedScans);
  }

  async function replayUnresolvedScans(state) {
    const session = resolveSessionState(state);
    const master = resolveMasterState(state);
    if (!session || !master) return { applied: 0, remaining: 0, conflicts: 0 };

    const unresolved = buildUnresolvedEntries(session.unresolvedScans)
      .sort((left, right) => {
        if (left.lastScannedAt !== right.lastScannedAt) return left.lastScannedAt - right.lastScannedAt;
        return left.code.localeCompare(right.code);
      });

    if (!unresolved.length) return { applied: 0, remaining: 0, conflicts: 0 };

    session.unresolvedScans = {};
    let applied = 0;
    let conflicts = 0;

    unresolved.forEach((item) => {
      const candidates = findCandidateRecords(master.scanIndex, item.code);
      if (!candidates.length) {
        session.unresolvedScans[item.code] = item;
        return;
      }
      if (candidates.length === 1) {
        applySelectedRecord(state, item.code, candidates[0], {
          count: item.count,
          scannedAt: item.lastScannedAt,
          incrementTotal: false,
          clearUnresolved: false,
          focus: false,
          silent: true,
        });
        applied += item.count;
        return;
      }
      conflicts += item.count;
      if (!session.pendingConflict) {
        session.pendingConflict = {
          code: item.code,
          candidates,
          count: item.count,
          scannedAt: item.lastScannedAt,
          replay: true,
        };
        return;
      }
      session.unresolvedScans[item.code] = item;
    });

    session.lastMissingCode = getLatestUnresolvedCode(session.unresolvedScans);
    return {
      applied,
      conflicts,
      remaining: buildUnresolvedEntries(session.unresolvedScans).reduce((sum, item) => sum + item.count, 0),
    };
  }

  async function ensureMasterLoaded(state, forceRefresh) {
    const pageState = resolvePageState(state);
    const master = resolveMasterState(state);
    const session = resolveSessionState(state);
    if (!pageState || !master || !session) return { records: [], fetchedAt: "" };
    if (master.loadingPromise) return master.loadingPromise;
    if (!forceRefresh && Array.isArray(master.masterCache.records) && master.masterCache.records.length) {
      return master.masterCache;
    }
    if (!forceRefresh) {
      const cached = readMasterCache(pageState.pageWin, pageState);
      if (Array.isArray(cached.records) && cached.records.length) {
        master.masterCache = cached;
        master.scanIndex = buildScanIndex(cached.records);
        master.lastFetchedAt = safeTrim(cached.fetchedAt);
        master.cacheSource = "캐시 기준";
        refreshEntriesFromMaster(pageState);
        renderAll(pageState.popupState || state);
        return cached;
      }
    }

    renderAll(pageState.popupState || state);
    master.loadingPromise = fetchMasterData(pageState)
      .then((masterCache) => {
        master.masterCache = masterCache;
        master.scanIndex = buildScanIndex(masterCache.records);
        master.lastFetchedAt = safeTrim(masterCache.fetchedAt);
        master.cacheSource = "원격 기준";
        session.conflictSelections = {};
        refreshEntriesFromMaster(pageState);
        writeMasterCache(pageState.pageWin, pageState, masterCache);
        return replayUnresolvedScans(pageState).then((replayResult) => {
          if (forceRefresh) {
            if (replayResult.applied > 0) {
              setStatus(pageState, "새 마스터에서 미확인 코드 " + replayResult.applied + "건을 반영했습니다.", "success");
            } else if (replayResult.remaining > 0 || replayResult.conflicts > 0) {
              setStatus(pageState, "마스터를 새로고침했습니다. 미확인 코드 " + replayResult.remaining + "건이 남아 있습니다.", "danger");
            } else {
              setStatus(pageState, "상품 마스터 " + masterCache.records.length + "건을 새로고침했습니다.", "success");
            }
          } else if (!session.rows.length && replayResult.remaining === 0) {
            setStatus(pageState, "상품 마스터 " + masterCache.records.length + "건을 준비했습니다.", "success");
          }
          renderAll(pageState.popupState || state);
          return masterCache;
        });
      })
      .catch((error) => {
        setStatus(pageState, error && error.message ? error.message : "상품 마스터를 불러오지 못했습니다.", "danger");
        throw error;
      })
      .finally(() => {
        master.loadingPromise = null;
        renderAll(pageState.popupState || state);
      });
    return master.loadingPromise;
  }

  function primeMasterState(pageState) {
    const master = resolveMasterState(pageState);
    if (!master || master.prefetchStarted) return;
    master.prefetchStarted = true;

    const cached = readMasterCache(pageState.pageWin, pageState);
    if (Array.isArray(cached.records) && cached.records.length) {
      master.masterCache = cached;
      master.scanIndex = buildScanIndex(cached.records);
      master.lastFetchedAt = safeTrim(cached.fetchedAt);
      master.cacheSource = "캐시 기준";
      refreshEntriesFromMaster(pageState);
    }

    void ensureMasterLoaded(pageState, true)
      .catch(() => {
        renderAll(pageState.popupState || pageState);
      });
    renderAll(pageState.popupState || pageState);
  }

  function consumeInputValue(state) {
    const doc = state && state.popupWin && state.popupWin.document;
    const input = doc && doc.getElementById(SCAN_INPUT_ID);
    if (!input) return "";
    const value = normalizeScanCode(input.value);
    input.value = "";
    return value;
  }

  function enqueueScan(state, code) {
    const session = resolveSessionState(state);
    const normalized = normalizeScanCode(code);
    if (!session || !normalized) {
      focusInput(state);
      return;
    }
    session.totalScans += 1;
    session.scanQueue.push({
      code: normalized,
      count: 1,
      scannedAt: Date.now(),
      incrementTotal: false,
      source: "live",
    });
    void processScanQueue(state);
  }

  function rememberConflictSelection(state, code, recordId) {
    const session = resolveSessionState(state);
    const key = normalizeScanCode(code);
    if (!session || !key || !recordId) return;
    session.conflictSelections[key] = recordId;
  }

  function applySelectedRecord(state, code, record, options) {
    const session = resolveSessionState(state);
    if (!session) return;
    const nextOptions = Object.assign({
      count: 1,
      scannedAt: Date.now(),
      incrementTotal: false,
      clearUnresolved: true,
      focus: true,
      silent: false,
      label: "스캔 반영",
    }, options || {});
    session.rows = applyScanSelection(session.rows, record, code, nextOptions);
    if (nextOptions.incrementTotal) session.totalScans += Math.max(1, Number(nextOptions.count) || 1);
    if (nextOptions.clearUnresolved) clearUnresolvedScan(state, code);
    if (!nextOptions.silent) {
      setStatus(state, nextOptions.label + " · " + record.nicn + " / " + session.rows[0].count + "개", "success");
      renderAll(state);
    } else {
      renderSummary(state);
      renderTable(state);
    }
    if (nextOptions.focus) focusInput(state);
  }

  function finishConflict(state) {
    const session = resolveSessionState(state);
    if (!session) return;
    session.pendingConflict = null;
    renderConflict(state);
    focusInput(state);
    void processScanQueue(state);
  }

  async function processScanQueue(state) {
    const session = resolveSessionState(state);
    const master = resolveMasterState(state);
    if (!session || !master || session.processing || session.pendingConflict) return;
    if (!session.scanQueue.length) {
      focusInput(state);
      return;
    }
    session.processing = true;
    const nextItem = session.scanQueue.shift();
    const code = normalizeScanCode(nextItem && nextItem.code ? nextItem.code : nextItem);
    const count = Math.max(1, Number(nextItem && nextItem.count) || 1);
    const scannedAt = Number(nextItem && nextItem.scannedAt) || Date.now();
    const incrementTotal = Boolean(nextItem && nextItem.incrementTotal);
    try {
      await ensureMasterLoaded(state, false);
      const candidates = findCandidateRecords(master.scanIndex, code);
      if (!candidates.length) {
        recordUnresolvedScan(state, code, count, scannedAt);
        setStatus(state, "일치하는 상품을 찾지 못했습니다 · " + code, "danger");
        renderSummary(state);
        focusInput(state);
        return;
      }
      if (candidates.length === 1) {
        applySelectedRecord(state, code, candidates[0], { count, scannedAt, incrementTotal, clearUnresolved: true });
        return;
      }
      const rememberedId = session.conflictSelections[code];
      const rememberedRecord = rememberedId ? candidates.find((candidate) => candidate.id === rememberedId) : null;
      if (rememberedRecord) {
        applySelectedRecord(state, code, rememberedRecord, { count, scannedAt, incrementTotal, clearUnresolved: true });
        return;
      }
      session.pendingConflict = { code, candidates, count, scannedAt, incrementTotal };
      setStatus(state, "중복 매칭 감지 · 기준 상품을 선택하세요.", "danger");
      renderConflict(state);
    } catch (error) {
      setStatus(state, error && error.message ? error.message : "스캔 처리 중 오류가 발생했습니다.", "danger");
    } finally {
      session.processing = false;
    }
  }

  function renderShell(state) {
    const doc = state.popupWin.document;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>입고검수</title></head><body></body></html>");
    doc.close();
    ensureStyles(doc);
    doc.body.innerHTML = buildShellHtml();
    renderAll(state);
  }

  function bindEvents(state) {
    const doc = state.popupWin.document;
    doc.body.addEventListener("click", (event) => {
      const actionTarget = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
      if (!actionTarget) return;
      const action = actionTarget.getAttribute("data-action");
      if (action === "close-window") {
        state.popupWin.close();
        return;
      }
      if (action === "refresh-master") {
        void ensureMasterLoaded(state, true);
        return;
      }
      if (action === "submit-scan") {
        enqueueScan(state, consumeInputValue(state));
        return;
      }
      if (action === "choose-candidate") {
        const session = resolveSessionState(state);
        const recordId = safeTrim(actionTarget.getAttribute("data-record-id"));
        const pending = session && session.pendingConflict;
        if (!pending) return;
        const record = (pending.candidates || []).find((item) => item.id === recordId);
        if (!record) return;
        rememberConflictSelection(state, pending.code, recordId);
        applySelectedRecord(state, pending.code, record, {
          count: pending.count,
          scannedAt: pending.scannedAt,
          incrementTotal: pending.incrementTotal,
          clearUnresolved: true,
        });
        finishConflict(state);
        return;
      }
      if (action === "cancel-conflict") {
        const session = resolveSessionState(state);
        const pending = session && session.pendingConflict;
        if (pending) {
          recordUnresolvedScan(state, pending.code, pending.count, pending.scannedAt);
          setStatus(state, "중복 매칭을 건너뛰었습니다 · " + pending.code, "danger");
          renderSummary(state);
        }
        finishConflict(state);
      }
    });

    doc.addEventListener("keydown", (event) => {
      const session = resolveSessionState(state);
      if (event.key === "Escape" && session && session.pendingConflict) {
        event.preventDefault();
        const pending = session.pendingConflict;
        if (pending) {
          recordUnresolvedScan(state, pending.code, pending.count, pending.scannedAt);
          setStatus(state, "중복 매칭을 건너뛰었습니다 · " + pending.code, "danger");
          renderSummary(state);
        }
        finishConflict(state);
      }
    });

    const input = doc.getElementById(SCAN_INPUT_ID);
    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        enqueueScan(state, consumeInputValue(state));
      });
    }

    state.popupWin.addEventListener("beforeunload", () => {
      state.pageState.popupWin = null;
      state.pageState.popupState = null;
    });
  }

  function openInspectionWindow(pageState) {
    if (pageState.popupWin && !pageState.popupWin.closed) {
      pageState.popupWin.focus();
      if (pageState.popupState) focusInput(pageState.popupState);
      return;
    }
    const popupWin = pageState.pageWin.open("", POPUP_NAME, POPUP_FEATURES);
    if (!popupWin) return;
    const popupState = createPopupState(pageState, popupWin);
    pageState.popupWin = popupWin;
    pageState.popupState = popupState;
    renderShell(popupState);
    bindEvents(popupState);
    popupWin.focus();
    focusInput(popupState);
    primeMasterState(pageState);
    void processScanQueue(popupState);
  }

  function resolveUiWindow(win) {
    const navMenu = getNavMenu(win);
    if (navMenu && typeof navMenu.resolveNavTargetWindow === "function") {
      const resolved = navMenu.resolveNavTargetWindow(win, { navSelector: NAV_SELECTOR });
      if (resolved && resolved.win && resolved.win.document) return resolved.win;
    }
    return win;
  }

  function resolveNavInstallContext(win) {
    const navMenu = getNavMenu(win);
    if (!navMenu || typeof navMenu.installNavButton !== "function") return null;

    if (typeof navMenu.resolveNavTargetWindow === "function") {
      const resolved = navMenu.resolveNavTargetWindow(win, { navSelector: NAV_SELECTOR });
      if (!resolved || !resolved.win || !resolved.win.document || !resolved.navMenu) return null;
      return {
        api: navMenu,
        win: resolved.win,
        navMenu: resolved.navMenu,
      };
    }

    if (win && win.document && typeof win.document.querySelector === "function") {
      const navContainer = win.document.querySelector(NAV_SELECTOR);
      if (navContainer) {
        return {
          api: navMenu,
          win,
          navMenu: navContainer,
        };
      }
    }

    return null;
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\//i.test(String(win && win.location && win.location.href || ""));
  }

  function start(context) {
    const sourceWin = context && context.window ? context.window : root;
    if (!sourceWin || !sourceWin.document || !shouldRun(sourceWin)) return;
    const navContext = resolveNavInstallContext(sourceWin);
    if (!navContext || !navContext.win) return;
    const win = navContext.win;
    if (!win || !win.document || win.__tmInboundInspectionStarted) return;
    win.__tmInboundInspectionStarted = true;

    const loader = context && context.loader ? context.loader : null;
    const pageState = getPageState(win, loader);

    pageState.navInstall = navContext.api.installNavButton(win, {
      navSelector: NAV_SELECTOR,
      retryLimit: NAV_RETRY_LIMIT,
      retryDelayMs: NAV_RETRY_DELAY_MS,
      buttonId: NAV_BUTTON_ID,
      label: NAV_BUTTON_LABEL,
      insertAfterLabel: NAV_INSERT_AFTER_LABEL,
      insertBeforeLabel: NAV_INSERT_BEFORE_LABEL,
      onClick() {
        openInspectionWindow(pageState);
      },
    });
    primeMasterState(pageState);
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    buildBase100RequestParams,
    buildBase200RequestParams,
    mergeMasterRows,
    buildScanIndex,
    findCandidateRecords,
    applyScanSelection,
    buildRowsHtml,
    buildSummary,
    resolveNavInstallContext,
    shouldRun,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);



