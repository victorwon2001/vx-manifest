module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "oms-scan-history";
  const MODULE_NAME = "OMS 스캔기록";
  const MODULE_VERSION = "0.1.2";
  const MATCHES = [
    "https://oms.bstage.systems/stan/main.do*",
    "https://oms.bstage.systems/stan/order/orderWaybill.do*",
  ];
  const MAIN_PAGE_PATTERN = /^https:\/\/oms\.bstage\.systems\/stan\/main\.do/i;
  const ORDER_PAGE_PATTERN = /^https:\/\/oms\.bstage\.systems\/stan\/order\/orderWaybill\.do/i;
  const PDF_URL_BASE = "https://oms.bstage.systems/stan/order/orderWaybillPdfPrint.do";
  const HISTORY_STORAGE_KEY = "scan-history";
  const STYLE_ID = "tm-oms-scan-history-style";
  const EXTENSION_ID = "tm-oms-scan-history-extension";
  const OVERLAY_ID = "tm-oms-scan-history-overlay";
  const RUNTIME_KEY = "__tmOmsScanHistoryRuntime";
  const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const PREVIEW_LIMIT = 10;
  const PAGE_SIZE = 100;
  const PREPARED_REUSE_MS = 500;
  const SEARCH_DEBOUNCE_MS = 140;

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\r/g, "").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-"),
      [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(":"),
    ].join(" ");
  }

  function createId(prefix, nowValue) {
    return prefix + "-" + String(nowValue || Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function shouldRun(win) {
    const href = String((win && win.location && win.location.href) || "");
    return MAIN_PAGE_PATTERN.test(href) || ORDER_PAGE_PATTERN.test(href);
  }

  function isMainPageWindow(win) {
    return MAIN_PAGE_PATTERN.test(String((win && win.location && win.location.href) || ""));
  }

  function isOrderPageWindow(win) {
    return ORDER_PAGE_PATTERN.test(String((win && win.location && win.location.href) || ""));
  }

  function buildPdfUrl(code) {
    return PDF_URL_BASE + "?scanText=" + encodeURIComponent(safeTrim(code));
  }

  function getStatusMeta(status) {
    const map = {
      pending: { label: "대기", tone: "pending" },
      success: { label: "성공", tone: "success" },
      failed: { label: "실패", tone: "failed" },
      skipped: { label: "취소", tone: "skipped" },
    };
    return map[String(status)] || map.failed;
  }

  function createHistoryRow(code, printStatus, message, nowValue) {
    const scannedAt = Number(nowValue) || Date.now();
    return {
      id: createId("scan", scannedAt),
      code: safeTrim(code),
      scannedAt,
      printStatus: safeTrim(printStatus) || "pending",
      message: safeTrim(message) || "",
    };
  }

  function createPendingHistoryRow(code, nowValue) {
    return createHistoryRow(code, "pending", "출력 응답 대기 중", nowValue);
  }

  function normalizeHistory(entries, nowValue) {
    const nowMs = Number(nowValue) || Date.now();
    return (Array.isArray(entries) ? entries : [])
      .map((entry, index) => {
        const code = safeTrim(entry && entry.code);
        const scannedAt = Number(entry && (entry.scannedAt || entry.createdAt)) || 0;
        if (!code || !scannedAt || nowMs - scannedAt > HISTORY_TTL_MS) return null;
        const legacyStatus = entry && entry.success ? "success" : "failed";
        const printStatus = safeTrim(entry && entry.printStatus) || legacyStatus;
        return {
          id: safeTrim(entry && entry.id) || ("legacy-" + scannedAt + "-" + index),
          code,
          scannedAt,
          printStatus: ["pending", "success", "failed", "skipped"].indexOf(printStatus) !== -1 ? printStatus : "failed",
          message: safeTrim(entry && entry.message),
        };
      })
      .filter(Boolean)
      .sort((left, right) => Number(right.scannedAt) - Number(left.scannedAt));
  }

  function updateHistoryRows(history, rowId, patch) {
    const updates = patch && typeof patch === "object" ? patch : {};
    return (Array.isArray(history) ? history : []).map((row) => {
      if (!row || row.id !== rowId) return row;
      return Object.assign({}, row, updates);
    });
  }

  function previewHistory(history) {
    return normalizeHistory(history).slice(0, PREVIEW_LIMIT);
  }

  function buildHistorySearchText(row) {
    const meta = getStatusMeta(row && row.printStatus);
    return [
      safeTrim(row && row.code),
      safeTrim(row && row.message),
      meta.label,
      formatDateTime(row && row.scannedAt),
    ].join(" ").toLowerCase();
  }

  function searchHistory(history, query) {
    const needle = safeTrim(query).toLowerCase();
    const rows = normalizeHistory(history);
    if (!needle) return rows;
    return rows.filter((row) => buildHistorySearchText(row).indexOf(needle) !== -1);
  }

  function paginateHistory(rows, page, pageSize) {
    const items = Array.isArray(rows) ? rows : [];
    const size = Math.max(1, Number(pageSize) || PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(items.length / size));
    const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const startIndex = (currentPage - 1) * size;
    return {
      page: currentPage,
      pageSize: size,
      totalPages,
      totalCount: items.length,
      rows: items.slice(startIndex, startIndex + size),
    };
  }

  function findLatestPrintedHistory(history, code) {
    const target = safeTrim(code);
    if (!target) return null;
    return normalizeHistory(history).find((row) => row.code === target && row.printStatus === "success") || null;
  }

  function hasPrintedDuplicate(history, code) {
    return !!findLatestPrintedHistory(history, code);
  }

  function shouldReusePreparedScan(lastPrepared, code, nowValue) {
    const prepared = lastPrepared && typeof lastPrepared === "object" ? lastPrepared : null;
    if (!prepared) return false;
    if (safeTrim(prepared.code) !== safeTrim(code)) return false;
    return Math.abs((Number(nowValue) || Date.now()) - (Number(prepared.at) || 0)) <= PREPARED_REUSE_MS;
  }

  function isLikelyPdfBuffer(buffer) {
    if (!buffer) return false;
    let bytes = null;
    if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
    else if (ArrayBuffer.isView(buffer)) bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    else return false;
    if (bytes.length < 4) return false;
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

  function isPdfResponseLike(headers) {
    const contentType = safeTrim(headers && headers.get ? headers.get("content-type") : headers && headers["content-type"]).toLowerCase();
    const disposition = safeTrim(headers && headers.get ? headers.get("content-disposition") : headers && headers["content-disposition"]).toLowerCase();
    return contentType.indexOf("application/pdf") !== -1 || disposition.indexOf(".pdf") !== -1;
  }

  function resolveStorage(context, win) {
    if (context && context.loader && context.loader.storage) return context.loader.storage;
    const prefix = "__tm:" + MODULE_ID + ":";
    return {
      get(key, fallbackValue) {
        if (!win || !win.localStorage) return fallbackValue;
        const raw = win.localStorage.getItem(prefix + key);
        if (raw == null) return fallbackValue;
        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallbackValue;
        }
      },
      set(key, value) {
        if (!win || !win.localStorage) return;
        win.localStorage.setItem(prefix + key, JSON.stringify(value));
      },
      delete(key) {
        if (!win || !win.localStorage) return;
        win.localStorage.removeItem(prefix + key);
      },
    };
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#waybillPrintModal.tm-oms-scan-history-modal{width:920px !important;max-width:calc(100vw - 48px)}",
      "#" + EXTENSION_ID + "{margin-top:16px;padding-top:14px;border-top:1px solid #dde3ea;font:12px/1.5 'Pretendard','Segoe UI','Malgun Gothic',sans-serif;color:#18202a}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__title{font-size:13px;font-weight:700}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__summary{font-size:11px;color:#5a6673}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__button{border:1px solid #c7d0da;background:#fff;color:#1d2834;border-radius:8px;padding:6px 10px;font:600 12px/1 'Pretendard','Segoe UI','Malgun Gothic',sans-serif;cursor:pointer}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__button:hover{background:#f3f6f9}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__status{margin-bottom:10px;padding:8px 10px;border-radius:10px;background:#f6f8fa;color:#495567}",
      "#" + EXTENSION_ID + " .tm-oms-scan-history__table-wrap{max-height:240px;overflow:auto;border:1px solid #dbe2e9;border-radius:12px;background:#fff}",
      "#" + EXTENSION_ID + " table{width:100%;border-collapse:collapse;table-layout:fixed}",
      "#" + EXTENSION_ID + " th,#" + EXTENSION_ID + " td{padding:8px 10px;border-bottom:1px solid #edf1f5;text-align:center;vertical-align:middle;font-size:12px;word-break:break-word}",
      "#" + EXTENSION_ID + " thead th{position:sticky;top:0;background:#f9fbfc;z-index:1;font-weight:700}",
      "#" + EXTENSION_ID + " tbody tr:last-child td{border-bottom:none}",
      ".tm-oms-scan-history__status-badge{display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:4px 8px;border-radius:999px;font-weight:700;font-size:11px}",
      ".tm-oms-scan-history__status-badge[data-tone='pending']{background:#fff4d6;color:#9b6b00}",
      ".tm-oms-scan-history__status-badge[data-tone='success']{background:#e7f4ea;color:#16794d}",
      ".tm-oms-scan-history__status-badge[data-tone='failed']{background:#fdecec;color:#c73838}",
      ".tm-oms-scan-history__status-badge[data-tone='skipped']{background:#eef2f7;color:#5b6573}",
      "#" + OVERLAY_ID + "{position:fixed;inset:0;z-index:2147483646;display:none}",
      "#" + OVERLAY_ID + "[data-open='true']{display:block}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__backdrop{position:absolute;inset:0;background:rgba(10,16,24,.42)}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1080px,calc(100vw - 40px));max-height:calc(100vh - 40px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:12px;padding:18px;border-radius:18px;background:#fff;box-shadow:0 22px 48px rgba(12,18,24,.28)}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-title{font-size:18px;font-weight:800}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__search{flex:1 1 260px;min-height:40px;padding:0 12px;border:1px solid #d2d9e0;border-radius:10px;font:13px/1 'Pretendard','Segoe UI','Malgun Gothic',sans-serif}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__meta{font-size:12px;color:#5c6672}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-table{min-height:0;overflow:auto;border:1px solid #dbe2e9;border-radius:14px}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-table table{width:100%;border-collapse:collapse;table-layout:fixed}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-table th,#" + OVERLAY_ID + " .tm-oms-scan-history__panel-table td{padding:9px 10px;border-bottom:1px solid #edf1f5;text-align:center;vertical-align:middle;font-size:12px;word-break:break-word}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__panel-table thead th{position:sticky;top:0;background:#f9fbfc;z-index:1}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__pagination{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      "#" + OVERLAY_ID + " .tm-oms-scan-history__pagination-actions{display:flex;align-items:center;gap:8px}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getRuntimeState(win, storage) {
    if (!win[RUNTIME_KEY]) {
      win[RUNTIME_KEY] = {
        started: false,
        shellStarted: false,
        orderStarted: false,
        shellTimer: 0,
        orderTimer: 0,
        storage: storage || null,
        history: [],
        historyLoaded: false,
        statusText: "스캔 대기 중",
        pendingAttempts: [],
        lastPrepared: null,
        renderScheduled: false,
        overlayOpen: false,
        overlayQuery: "",
        overlayPage: 1,
        overlaySearchTimer: 0,
        fetchWrapped: false,
        xhrWrapped: false,
        blobWrapped: false,
        nativeWrapped: false,
        lastNativeOriginal: null,
        eventsBound: false,
      };
    }
    if (storage) win[RUNTIME_KEY].storage = storage;
    win[RUNTIME_KEY].win = win;
    return win[RUNTIME_KEY];
  }

  function loadHistory(state, forceReload) {
    if (!forceReload && state.historyLoaded) return state.history;
    const raw = state.storage ? state.storage.get(HISTORY_STORAGE_KEY, []) : [];
    state.history = normalizeHistory(raw);
    state.historyLoaded = true;
    if (state.storage) state.storage.set(HISTORY_STORAGE_KEY, state.history);
    return state.history;
  }

  function saveHistory(state) {
    state.history = normalizeHistory(state.history);
    state.historyLoaded = true;
    if (state.storage) state.storage.set(HISTORY_STORAGE_KEY, state.history);
    return state.history;
  }

  function appendHistoryRow(state, row) {
    loadHistory(state);
    state.history = [row].concat(state.history || []);
    return saveHistory(state);
  }

  function patchHistoryRow(state, rowId, patch) {
    loadHistory(state);
    state.history = updateHistoryRows(state.history, rowId, patch);
    return saveHistory(state);
  }

  function setStatus(state, nextText) {
    state.statusText = safeTrim(nextText) || "스캔 대기 중";
  }

  function scheduleRender(state) {
    const win = state && state.win;
    if (!win || state.renderScheduled) return;
    state.renderScheduled = true;
    win.setTimeout(() => {
      state.renderScheduled = false;
      renderOrderPage(state);
    }, 0);
  }

  function clearAttemptTimer(attempt) {
    if (attempt && attempt.timeoutId) {
      root.clearTimeout(attempt.timeoutId);
      attempt.timeoutId = 0;
    }
  }

  function removeFinalizedAttempts(state) {
    state.pendingAttempts = (state.pendingAttempts || []).filter((item) => item && !item.finalized);
  }

  function findPendingAttemptByCode(state, code) {
    const target = safeTrim(code);
    if (!target) return null;
    return (state.pendingAttempts || []).find((item) => item && !item.finalized && item.code === target) || null;
  }

  function findOldestPendingAttempt(state) {
    return (state.pendingAttempts || [])
      .filter((item) => item && !item.finalized)
      .sort((left, right) => Number(left.preparedAt) - Number(right.preparedAt))[0] || null;
  }

  function finalizePrint(state, attempt, nextStatus, message) {
    if (!attempt || attempt.finalized) return null;
    attempt.finalized = true;
    clearAttemptTimer(attempt);
    const patch = {
      printStatus: nextStatus,
      message: safeTrim(message) || "",
    };
    patchHistoryRow(state, attempt.rowId, patch);
    setStatus(state, patch.message || (nextStatus === "success" ? "출력 완료" : "출력 실패"));
    removeFinalizedAttempts(state);
    scheduleRender(state);
    return patch;
  }

  function appendFallbackHistory(state, code, nextStatus, message) {
    const cleanCode = safeTrim(code);
    if (!cleanCode) return null;
    const row = createHistoryRow(cleanCode, nextStatus, message, Date.now());
    appendHistoryRow(state, row);
    setStatus(state, row.message || (nextStatus === "success" ? "출력 완료" : "출력 실패"));
    scheduleRender(state);
    return row;
  }

  function finalizePrintSuccessByCode(state, code, message) {
    const attempt = findPendingAttemptByCode(state, code) || findOldestPendingAttempt(state);
    if (attempt) return finalizePrint(state, attempt, "success", message || "PDF 출력 응답 확인");
    return appendFallbackHistory(state, code, "success", message || "PDF 출력 응답 확인");
  }

  function finalizePrintFailureByCode(state, code, message) {
    const attempt = findPendingAttemptByCode(state, code) || findOldestPendingAttempt(state);
    if (attempt) return finalizePrint(state, attempt, "failed", message || "출력 요청이 실패했습니다.");
    return appendFallbackHistory(state, code, "failed", message || "출력 요청이 실패했습니다.");
  }

  function handlePreparedDuplicate(state, code) {
    const latest = findLatestPrintedHistory(loadHistory(state), code);
    if (!latest) return true;
    const confirmed = state.win.confirm(
      "이미 출력 성공 이력이 있습니다.\n최근 출력: " + formatDateTime(latest.scannedAt) + "\n재출력하시겠습니까?"
    );
    if (confirmed) return true;
    appendHistoryRow(state, createHistoryRow(code, "skipped", "중복 재출력을 취소했습니다.", Date.now()));
    setStatus(state, "중복 재출력을 취소했습니다.");
    scheduleRender(state);
    return false;
  }

  function prepareScanAttempt(state, code) {
    const nextCode = safeTrim(code);
    const nowMs = Date.now();
    if (!nextCode) {
      return { blocked: false, reason: "empty" };
    }
    if (shouldReusePreparedScan(state.lastPrepared, nextCode, nowMs)) {
      return { blocked: false, reused: true, attempt: findPendingAttemptByCode(state, nextCode) };
    }
    if (!handlePreparedDuplicate(state, nextCode)) {
      state.lastPrepared = { code: nextCode, at: nowMs };
      return { blocked: true, reason: "duplicate-cancelled" };
    }
    const row = createHistoryRow(nextCode, "success", "스캔 기록 저장", nowMs);
    appendHistoryRow(state, row);
    state.lastPrepared = { code: nextCode, at: nowMs, rowId: row.id };
    setStatus(state, "스캔 기록을 저장했습니다.");
    scheduleRender(state);
    return { blocked: false, reused: false, row };
  }

  function readCurrentPrintCode(doc) {
    const input = doc && doc.getElementById("print_input");
    return safeTrim(input && input.value);
  }

  function parseScanTextFromUrl(urlValue) {
    const raw = safeTrim(urlValue);
    if (!raw || raw.indexOf("orderWaybillPdfPrint.do") === -1) return "";
    try {
      const url = new URL(raw, "https://oms.bstage.systems");
      return safeTrim(url.searchParams.get("scanText"));
    } catch (error) {
      const match = raw.match(/[?&]scanText=([^&]+)/);
      return match ? safeTrim(decodeURIComponent(match[1])) : "";
    }
  }

  function wrapFetch(state) {
    const win = state.win;
    if (!win || typeof win.fetch !== "function" || state.fetchWrapped) return;
    const originalFetch = win.fetch.bind(win);
    win.fetch = function wrappedFetch(input, init) {
      const requestUrl = typeof input === "string" ? input : (input && input.url) || "";
      return originalFetch(input, init)
        .then((response) => {
          const scanText = parseScanTextFromUrl(requestUrl || (response && response.url) || "");
          if (!scanText) return response;
          if (!response || !response.ok) {
            finalizePrintFailureByCode(state, scanText, "출력 요청이 실패했습니다.");
            return response;
          }
          if (isPdfResponseLike(response.headers || {})) {
            finalizePrintSuccessByCode(state, scanText, "PDF 출력 응답 확인");
            return response;
          }
          if (typeof response.clone === "function") {
            response.clone().arrayBuffer().then((buffer) => {
              if (isLikelyPdfBuffer(buffer)) {
                finalizePrintSuccessByCode(state, scanText, "PDF 출력 응답 확인");
              }
            }).catch(() => {});
          }
          return response;
        })
        .catch((error) => {
          const scanText = parseScanTextFromUrl(requestUrl);
          if (scanText) finalizePrintFailureByCode(state, scanText, safeTrim(error && error.message) || "출력 요청 오류");
          throw error;
        });
    };
    state.fetchWrapped = true;
  }

  function wrapXhr(state) {
    const win = state.win;
    const Xhr = win && win.XMLHttpRequest;
    if (!Xhr || !Xhr.prototype || state.xhrWrapped) return;
    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;

    Xhr.prototype.open = function wrappedOpen(method, url) {
      this.__tmOmsScanHistoryUrl = safeTrim(url);
      return originalOpen.apply(this, arguments);
    };

    Xhr.prototype.send = function wrappedSend() {
      const requestUrl = safeTrim(this.__tmOmsScanHistoryUrl);
      const scanText = parseScanTextFromUrl(requestUrl);
      if (scanText) {
        this.addEventListener("load", () => {
          if (Number(this.status) < 200 || Number(this.status) >= 300) {
            finalizePrintFailureByCode(state, scanText, "출력 요청이 실패했습니다.");
            return;
          }
          const headers = {
            "content-type": this.getResponseHeader && this.getResponseHeader("content-type"),
            "content-disposition": this.getResponseHeader && this.getResponseHeader("content-disposition"),
          };
          if (isPdfResponseLike(headers)) {
            finalizePrintSuccessByCode(state, scanText, "PDF 출력 응답 확인");
            return;
          }
          const response = this.response;
          if (isLikelyPdfBuffer(response)) {
            finalizePrintSuccessByCode(state, scanText, "PDF 출력 응답 확인");
          }
        });
        this.addEventListener("error", () => {
          finalizePrintFailureByCode(state, scanText, "출력 요청 오류");
        });
      }
      return originalSend.apply(this, arguments);
    };
    state.xhrWrapped = true;
  }

  function wrapBlobUrl(state) {
    const win = state.win;
    if (!win || !win.URL || typeof win.URL.createObjectURL !== "function" || state.blobWrapped) return;
    const original = win.URL.createObjectURL.bind(win.URL);
    win.URL.createObjectURL = function wrappedCreateObjectURL(blob) {
      const url = original(blob);
      if (blob && /application\/pdf/i.test(safeTrim(blob.type))) {
        finalizePrintSuccessByCode(state, "", "PDF blob 생성 확인");
      }
      return url;
    };
    state.blobWrapped = true;
  }

  function wrapNativePrint(state) {
    const win = state.win;
    const current = win && win.currPrint;
    if (typeof current !== "function") return;
    if (current.__tmOmsScanHistoryWrapped) {
      state.nativeWrapped = true;
      state.lastNativeOriginal = current.__tmOmsScanHistoryOriginal || current;
      return;
    }
    if (state.lastNativeOriginal === current) return;
    const original = current;
    const wrapped = function wrappedCurrPrint() {
      const code = readCurrentPrintCode(win.document);
      const prepared = prepareScanAttempt(state, code);
      if (prepared.blocked && prepared.reason === "duplicate-cancelled") return false;
      return original.apply(this, arguments);
    };
    wrapped.__tmOmsScanHistoryWrapped = true;
    wrapped.__tmOmsScanHistoryOriginal = original;
    win.currPrint = wrapped;
    state.nativeWrapped = true;
    state.lastNativeOriginal = original;
  }

  function getActivePrintModal(doc) {
    const modal = doc && doc.getElementById("waybillPrintModal");
    if (!modal) return null;
    const style = modal.style || {};
    const visible = style.display !== "none" && style.visibility !== "hidden";
    return visible ? modal : null;
  }

  function getNativePrintButton(modal) {
    if (!modal || !modal.querySelectorAll) return null;
    const buttons = Array.from(modal.querySelectorAll("button"));
    return buttons.find((button) => {
      const inline = safeTrim(button.getAttribute("onclick"));
      const label = safeTrim(button.textContent).toLowerCase();
      return inline.indexOf("currPrint") !== -1 || label.indexOf("print waybill") !== -1;
    }) || null;
  }

  function buildStatusBadge(status) {
    const meta = getStatusMeta(status);
    return '<span class="tm-oms-scan-history__status-badge" data-tone="' + meta.tone + '">' + escapeHtml(meta.label) + "</span>";
  }

  function buildRowsHtml(rows) {
    if (!rows.length) {
      return '<tr><td colspan="4">기록이 없습니다.</td></tr>';
    }
    return rows.map((row) => [
      "<tr>",
      "<td>" + escapeHtml(formatDateTime(row.scannedAt)) + "</td>",
      "<td>" + escapeHtml(row.code) + "</td>",
      "<td>" + buildStatusBadge(row.printStatus) + "</td>",
      "<td>" + escapeHtml(row.message || "-") + "</td>",
      "</tr>",
    ].join("")).join("");
  }

  function ensureOverlay(state) {
    const doc = state.win.document;
    let overlay = doc.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = doc.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = [
      '<div class="tm-oms-scan-history__backdrop" data-action="close-history"></div>',
      '<div class="tm-oms-scan-history__panel">',
      '  <div class="tm-oms-scan-history__panel-head">',
      '    <div class="tm-oms-scan-history__panel-title">OMS 스캔기록</div>',
      '    <button type="button" class="tm-oms-scan-history__button" data-action="close-history">닫기</button>',
      "  </div>",
      '  <div class="tm-oms-scan-history__panel-toolbar">',
      '    <input type="text" class="tm-oms-scan-history__search" data-role="history-search" placeholder="송장번호, 상태, 메시지, 시간 검색">',
      '    <div class="tm-oms-scan-history__meta" data-role="history-meta"></div>',
      "  </div>",
      '  <div class="tm-oms-scan-history__panel-table">',
      "    <table>",
      "      <thead><tr><th>시간</th><th>송장</th><th>상태</th><th>메시지</th></tr></thead>",
      '      <tbody data-role="history-tbody"></tbody>',
      "    </table>",
      "  </div>",
      '  <div class="tm-oms-scan-history__pagination">',
      '    <div class="tm-oms-scan-history__meta" data-role="history-page"></div>',
      '    <div class="tm-oms-scan-history__pagination-actions">',
      '      <button type="button" class="tm-oms-scan-history__button" data-action="history-prev">이전</button>',
      '      <button type="button" class="tm-oms-scan-history__button" data-action="history-next">다음</button>',
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");
    overlay.setAttribute("data-open", "false");
    doc.body.appendChild(overlay);
    return overlay;
  }

  function openHistoryOverlay(state) {
    state.overlayOpen = true;
    state.overlayPage = 1;
    renderOverlay(state);
  }

  function closeHistoryOverlay(state) {
    state.overlayOpen = false;
    renderOverlay(state);
  }

  function renderOverlay(state) {
    const overlay = ensureOverlay(state);
    overlay.setAttribute("data-open", state.overlayOpen ? "true" : "false");
    if (!state.overlayOpen) return;
    const searchInput = overlay.querySelector("[data-role='history-search']");
    const meta = overlay.querySelector("[data-role='history-meta']");
    const tbody = overlay.querySelector("[data-role='history-tbody']");
    const pageMeta = overlay.querySelector("[data-role='history-page']");
    const filtered = searchHistory(loadHistory(state), state.overlayQuery);
    const pageData = paginateHistory(filtered, state.overlayPage, PAGE_SIZE);
    state.overlayPage = pageData.page;
    if (searchInput && searchInput.value !== state.overlayQuery) searchInput.value = state.overlayQuery;
    if (meta) meta.textContent = "최근 7일 " + filtered.length + "건";
    if (pageMeta) pageMeta.textContent = pageData.page + " / " + pageData.totalPages + " 페이지";
    if (tbody) tbody.innerHTML = buildRowsHtml(pageData.rows);
    const prevButton = overlay.querySelector("[data-action='history-prev']");
    const nextButton = overlay.querySelector("[data-action='history-next']");
    if (prevButton) prevButton.disabled = pageData.page <= 1;
    if (nextButton) nextButton.disabled = pageData.page >= pageData.totalPages;
  }

  function ensureExtension(state) {
    const doc = state.win.document;
    const modal = getActivePrintModal(doc);
    if (!modal) {
      if (state.overlayOpen) closeHistoryOverlay(state);
      return null;
    }
    modal.classList.add("tm-oms-scan-history-modal");
    let extension = doc.getElementById(EXTENSION_ID);
    if (!extension || !modal.contains(extension)) {
      extension = doc.createElement("div");
      extension.id = EXTENSION_ID;
      const footer = modal.querySelector(".co_btn_wrap");
      if (footer && footer.parentNode === modal) modal.insertBefore(extension, footer);
      else modal.appendChild(extension);
    }
    const rows = previewHistory(loadHistory(state));
    extension.innerHTML = [
      '<div class="tm-oms-scan-history__toolbar">',
      '  <div>',
      '    <div class="tm-oms-scan-history__title">최근 스캔 이력</div>',
      '    <div class="tm-oms-scan-history__summary">최근 7일 기록 기준, 미리보기는 최신 10건만 표시됩니다.</div>',
      "  </div>",
      '  <button type="button" class="tm-oms-scan-history__button" data-action="open-history">전체 기록</button>',
      "</div>",
      '<div class="tm-oms-scan-history__status">' + escapeHtml(state.statusText || "스캔 대기 중") + "</div>",
      '<div class="tm-oms-scan-history__table-wrap">',
      "  <table>",
      "    <thead><tr><th>시간</th><th>송장</th><th>상태</th><th>메시지</th></tr></thead>",
      "    <tbody>",
      buildRowsHtml(rows),
      "    </tbody>",
      "  </table>",
      "</div>",
    ].join("");
    renderOverlay(state);
    return extension;
  }

  function renderOrderPage(state) {
    ensureStyles(state.win.document);
    ensureExtension(state);
  }

  function onSearchInput(state, value) {
    if (state.overlaySearchTimer) {
      state.win.clearTimeout(state.overlaySearchTimer);
      state.overlaySearchTimer = 0;
    }
    state.overlaySearchTimer = state.win.setTimeout(() => {
      state.overlayQuery = safeTrim(value);
      state.overlayPage = 1;
      renderOverlay(state);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handlePrintIntent(state, event) {
    const code = readCurrentPrintCode(state.win.document);
    const prepared = prepareScanAttempt(state, code);
    if (prepared.blocked && prepared.reason === "duplicate-cancelled" && event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }
    return prepared;
  }

  function bindDocumentEvents(state) {
    const doc = state.win.document;
    if (!doc || state.eventsBound) return;
    state.eventsBound = true;

    doc.addEventListener("keydown", (event) => {
      const target = event.target;
      if (!target || target.id !== "print_input" || event.key !== "Enter") return;
      handlePrintIntent(state, event);
    }, true);

    doc.addEventListener("click", (event) => {
      const target = event.target;
      const actionNode = target && target.closest ? target.closest("[data-action]") : null;
      if (actionNode) {
        const action = actionNode.getAttribute("data-action");
        if (action === "open-history") {
          event.preventDefault();
          openHistoryOverlay(state);
          return;
        }
        if (action === "close-history") {
          event.preventDefault();
          closeHistoryOverlay(state);
          return;
        }
        if (action === "history-prev") {
          event.preventDefault();
          state.overlayPage = Math.max(1, state.overlayPage - 1);
          renderOverlay(state);
          return;
        }
        if (action === "history-next") {
          event.preventDefault();
          state.overlayPage += 1;
          renderOverlay(state);
          return;
        }
      }

      const modal = getActivePrintModal(doc);
      if (!modal || !target || !target.closest) return;
      const button = target.closest("button");
      if (!button || !modal.contains(button)) return;
      if (button === getNativePrintButton(modal)) {
        handlePrintIntent(state, event);
      }
    }, true);

    doc.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target && target.matches && target.matches("[data-role='history-search']"))) return;
      onSearchInput(state, target.value);
    }, true);
  }

  function syncOrderPage(state) {
    ensureStyles(state.win.document);
    loadHistory(state);
    bindDocumentEvents(state);
    renderOrderPage(state);
  }

  function startOrderPage(context, win) {
    if (!win || !win.document || !isOrderPageWindow(win)) return null;
    const storage = resolveStorage(context, win);
    const state = getRuntimeState(win, storage);
    if (state.orderStarted) return state;
    state.orderStarted = true;
    const init = () => {
      syncOrderPage(state);
      state.orderTimer = win.setInterval(() => syncOrderPage(state), 1000);
    };
    if (win.document.body) init();
    else win.addEventListener("DOMContentLoaded", init, { once: true });
    return state;
  }

  function findOrderFrames(win) {
    if (!win || !win.document || !win.document.querySelectorAll) return [];
    return Array.from(win.document.querySelectorAll("iframe")).map((frame) => {
      try {
        return frame.contentWindow;
      } catch (error) {
        return null;
      }
    }).filter((frameWin) => frameWin && isOrderPageWindow(frameWin));
  }

  function startMainShell(context, win) {
    if (!win || !win.document || !isMainPageWindow(win)) return null;
    const storage = resolveStorage(context, win);
    const state = getRuntimeState(win, storage);
    if (state.shellStarted) return state;
    state.shellStarted = true;
    const syncFrames = () => {
      findOrderFrames(win).forEach((frameWin) => {
        try {
          startOrderPage(context, frameWin);
        } catch (error) {
          // Ignore transient frame access issues.
        }
      });
    };
    const init = () => {
      syncFrames();
      state.shellTimer = win.setInterval(syncFrames, 1200);
    };
    if (win.document.body) init();
    else win.addEventListener("DOMContentLoaded", init, { once: true });
    return state;
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;
    const state = getRuntimeState(win, resolveStorage(context, win));
    if (state.started) return;
    state.started = true;
    if (isOrderPageWindow(win)) {
      startOrderPage(context, win);
      return;
    }
    if (isMainPageWindow(win)) {
      startMainShell(context, win);
    }
  }

  function run(context) {
    start(context);
  }

  return {
    HISTORY_TTL_MS,
    PAGE_SIZE,
    PREVIEW_LIMIT,
    buildPdfUrl,
    createHistoryRow,
    createPendingHistoryRow,
    findLatestPrintedHistory,
    hasPrintedDuplicate,
    id: MODULE_ID,
    isLikelyPdfBuffer,
    isMainPageWindow,
    isOrderPageWindow,
    matches: MATCHES,
    name: MODULE_NAME,
    normalizeHistory,
    paginateHistory,
    previewHistory,
    run,
    searchHistory,
    shouldReusePreparedScan,
    shouldRun,
    start,
    updateHistoryRows,
    version: MODULE_VERSION,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


