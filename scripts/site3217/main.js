module.exports = (function (root) {
  "use strict";

  const PAGE_PATTERN = /\/jsp\/site\/site3217main\.jsp/i;
  const LIST_ENDPOINT = "/site/site320main_jdata";
  const XLS_ENDPOINT = "/util/ExlForm_DB3";
  const PANEL_ID = "tm-ebut-site3217";
  const STYLE_ID = PANEL_ID + "-style";
  const BEFORE_EVENT_NAME = "tm-site3217-before-scan";
  const AFTER_EVENT_NAME = "tm-site3217-after-scan";
  const BRIDGE_ATTRIBUTE = "data-tm-site3217-bridge";
  const HISTORY_STORAGE_KEY = PANEL_ID + "-history-v2";
  const HISTORY_KEEP_DAYS = 14;
  const RECENT_MISMATCH_LIMIT = 20;
  const BRIDGE_RETRY_LIMIT = 40;

  function SessionExpiredError(message) {
    this.name = "SessionExpiredError";
    this.message = message || "세션 종료, 다시 로그인 필요";
    if (Error.captureStackTrace) Error.captureStackTrace(this, SessionExpiredError);
  }
  SessionExpiredError.prototype = Object.create(Error.prototype);
  SessionExpiredError.prototype.constructor = SessionExpiredError;

  function pad2(value) { return String(value).padStart(2, "0"); }
  function formatDate(date) {
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  }
  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      formatDate(date),
      [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(":"),
    ].join(" ");
  }
  function todayString() { return formatDate(new Date()); }
  function safeTrim(value) { return String(value == null ? "" : value).trim(); }
  function compactDate(value) { return String(value || "").replace(/-/g, ""); }
  function formatCompactDate(value) {
    const compact = safeTrim(value);
    return /^\d{8}$/.test(compact)
      ? [compact.slice(0, 4), compact.slice(4, 6), compact.slice(6, 8)].join("-")
      : compact;
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function parseDateString(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) throw new Error("날짜 형식이 올바르지 않습니다.");
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  function lastDayOfMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function shiftYears(value, years) {
    const parsed = parseDateString(value);
    const targetYear = parsed.year + years;
    const targetDay = Math.min(parsed.day, lastDayOfMonth(targetYear, parsed.month));
    return [targetYear, pad2(parsed.month), pad2(targetDay)].join("-");
  }
  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params).forEach((key) => search.set(key, params[key]));
    return search.toString();
  }
  function buildListRequestParams(dateString, pageNumber, nd) {
    return {
      IVMSTR_CUST: "",
      IVMSTR_DATE: dateString,
      IVMSTR_IVNO1: "",
      IVMSTR_IVNO2: "",
      IVMSTR_EXPR: "",
      IVMSTR_USER: "",
      ORDLIST_DATE1: shiftYears(dateString, -1),
      ORDLIST_DATE2: dateString,
      IVMSTR_VIEWYN: "Y",
      _search: "false",
      nd: String(nd),
      rows: "300",
      page: String(pageNumber),
      sidx: "ivmstr_seq",
      sord: "asc",
    };
  }
  function getModeLabel(mode) {
    return mode === "ordlist_dno" ? "송장번호" : "주문번호";
  }
  function getCurrentMode(doc) {
    const checked = doc.querySelector("input[name='SEARCH_TYPE']:checked");
    return checked ? checked.value : "ordlist_no1";
  }
  function isSessionExpiredResponse(bodyText, contentType) {
    const text = String(bodyText || "");
    const type = String(contentType || "").toLowerCase();
    return text.indexOf("자동 로그아웃 되었습니다") !== -1 ||
      text.indexOf("/home/docs/login.html") !== -1 ||
      (type.indexOf("text/html") !== -1 && text.indexOf("이벗3PL 로그인") !== -1);
  }
  function parseResponseHeaders(text) {
    const headers = {};
    String(text || "").split(/\r?\n/).forEach((line) => {
      const index = line.indexOf(":");
      if (index !== -1) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    });
    return headers;
  }
  function ensureArrayBuffer(value) {
    if (!value) throw new Error("상세 응답 본문이 비어 있습니다.");
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    throw new Error("상세 응답을 ArrayBuffer로 읽지 못했습니다.");
  }
  function arrayBufferToText(buffer) {
    return new TextDecoder("utf-8").decode(new Uint8Array(buffer));
  }
  function createItemId(selectionId, orderNumber, invoiceNumber) {
    return [selectionId || "UNBOUND", orderNumber || "~", invoiceNumber || "~"].join("::");
  }
  function pushToLookupMap(map, key, value) {
    if (!key) return;
    if (!map[key]) map[key] = [];
    if (map[key].indexOf(value) === -1) map[key].push(value);
  }
  function uniqueArray(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }
  function cloneSet(setLike) {
    return new Set(Array.from(setLike || []));
  }
  function buildSelectionSummary(selection) {
    if (!selection) return "선택 차수 없음";
    const chunks = [
      formatCompactDate(selection.ivmstr_date || ""),
      selection.ivmstr_ivno ? selection.ivmstr_ivno + "차" : "",
      selection.site_name || "",
      selection.ivmstr_memo || "",
    ].filter(Boolean);
    return chunks.join(" / ") || "선택 차수";
  }
  function buildSelectionBadge(selection) {
    const chunks = [
      formatCompactDate(selection.ivmstr_date || ""),
      selection.ivmstr_ivno ? selection.ivmstr_ivno + "차" : "",
      selection.expr_name || "",
      selection.site_name || "",
    ].filter(Boolean);
    return chunks.join(" · ");
  }
  function buildSelectedOverview(selectedRows) {
    if (!selectedRows.length) return "선택 차수 없음";
    if (selectedRows.length === 1) return buildSelectionSummary(selectedRows[0]);
    return selectedRows.length + "개 차수 선택 중";
  }
  function buildSelectedSummaryText(selectedRows) {
    if (!selectedRows || !selectedRows.length) return "선택 차수 없음";
    const labels = selectedRows
      .map((selection) => safeTrim(selection.ivmstr_ivno))
      .filter(Boolean)
      .map((ivno) => ivno + "차");
    if (!labels.length) return "선택 차수 " + selectedRows.length + "건";
    if (labels.length <= 3) return "선택 차수: " + labels.join(", ");
    return "선택 차수: " + labels.slice(0, 3).join(", ") + " 외 " + (labels.length - 3);
  }
  function summarizeValues(values, emptyFallback) {
    const unique = uniqueArray((values || []).map(safeTrim));
    if (!unique.length) return emptyFallback || "-";
    if (unique.length === 1) return unique[0];
    return unique[0] + " 외 " + (unique.length - 1);
  }
  function shouldShowDrawer(filterModeEnabled, drawerOpen, isListLoading, pendingDetailCount) {
    return !!filterModeEnabled && (!!drawerOpen || !!isListLoading || Number(pendingDetailCount || 0) > 0);
  }
  function shouldShowSelectedList(filterModeEnabled, selectedListOpen, selectedCount) {
    return !!filterModeEnabled && !!selectedListOpen && Number(selectedCount || 0) > 0;
  }
  function sortDetailRows(rows) {
    return (rows || []).slice().sort((left, right) => {
      if (!!left.scanned !== !!right.scanned) return left.scanned ? 1 : -1;

      const leftDate = compactDate(left.ivmstrDate || "");
      const rightDate = compactDate(right.ivmstrDate || "");
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

      const leftNo = Number(left.ivmstrIvno || 0);
      const rightNo = Number(right.ivmstrIvno || 0);
      if (!Number.isNaN(leftNo) && !Number.isNaN(rightNo) && leftNo !== rightNo) return leftNo - rightNo;

      return String(left.itemId || "").localeCompare(String(right.itemId || ""));
    });
  }
  function getModeCount(scanData, mode) {
    if (!scanData) return { total: 0, processed: 0, remaining: 0 };
    const invoiceMode = mode === "ordlist_dno";
    const total = invoiceMode ? scanData.invoiceNumbers.length : scanData.orderNumbers.length;
    const processed = invoiceMode ? scanData.processedInvoiceSet.size : scanData.processedOrderSet.size;
    return { total, processed, remaining: Math.max(total - processed, 0) };
  }
  function getAggregateCounts(aggregate) {
    if (!aggregate) return { total: 0, processed: 0, remaining: 0 };
    const total = aggregate.items.length;
    const processed = aggregate.processedItemSet.size;
    return { total, processed, remaining: Math.max(total - processed, 0) };
  }
  function extractScanTargets(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("엑셀 데이터가 비어 있습니다.");
    const header = rows[0].map(safeTrim);
    const orderIndex = header.indexOf("주문번호");
    const invoiceIndex = header.indexOf("송장번호");
    if (orderIndex === -1 || invoiceIndex === -1) {
      throw new Error("엑셀 헤더에서 주문번호 또는 송장번호 열을 찾지 못했습니다.");
    }

    const seen = new Set();
    const orderNumbers = [];
    const invoiceNumbers = [];
    const orderSet = new Set();
    const invoiceSet = new Set();
    const orderToItemIds = {};
    const invoiceToItemIds = {};
    const items = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const orderNumber = safeTrim(row[orderIndex]);
      const invoiceNumber = safeTrim(row[invoiceIndex]);
      if (!orderNumber && !invoiceNumber) continue;

      const rawId = createItemId("", orderNumber, invoiceNumber);
      if (!seen.has(rawId)) {
        seen.add(rawId);
        items.push({
          rawId,
          id: rawId,
          orderNumber,
          invoiceNumber,
          dataLabel: orderNumber || invoiceNumber || "-",
        });
      }
      if (orderNumber && !orderSet.has(orderNumber)) {
        orderSet.add(orderNumber);
        orderNumbers.push(orderNumber);
      }
      if (invoiceNumber && !invoiceSet.has(invoiceNumber)) {
        invoiceSet.add(invoiceNumber);
        invoiceNumbers.push(invoiceNumber);
      }
      pushToLookupMap(orderToItemIds, orderNumber, rawId);
      pushToLookupMap(invoiceToItemIds, invoiceNumber, rawId);
    }

    return {
      items,
      orderNumbers,
      invoiceNumbers,
      orderSet,
      invoiceSet,
      orderToItemIds,
      invoiceToItemIds,
      processedOrderSet: new Set(),
      processedInvoiceSet: new Set(),
      processedItemSet: new Set(),
    };
  }
  function attachSelectionMeta(scanData, selection) {
    if (!scanData) return null;

    const items = scanData.items.map((item) => ({
      id: createItemId(selection.id, item.orderNumber, item.invoiceNumber),
      selectionId: selection.id,
      orderNumber: item.orderNumber,
      invoiceNumber: item.invoiceNumber,
      dataLabel: item.dataLabel,
      ivmstr_date: selection.ivmstr_date,
      ivmstr_ivno: selection.ivmstr_ivno,
      expr_name: selection.expr_name,
      site_name: selection.site_name,
      ivmstr_memo: selection.ivmstr_memo,
      selectionLabel: buildSelectionSummary(selection),
      selectionBadge: buildSelectionBadge(selection),
    }));
    const orderToItemIds = {};
    const invoiceToItemIds = {};
    items.forEach((item) => {
      pushToLookupMap(orderToItemIds, item.orderNumber, item.id);
      pushToLookupMap(invoiceToItemIds, item.invoiceNumber, item.id);
    });

    return {
      items,
      orderNumbers: scanData.orderNumbers.slice(),
      invoiceNumbers: scanData.invoiceNumbers.slice(),
      orderSet: cloneSet(scanData.orderSet),
      invoiceSet: cloneSet(scanData.invoiceSet),
      orderToItemIds,
      invoiceToItemIds,
      processedOrderSet: new Set(),
      processedInvoiceSet: new Set(),
      processedItemSet: new Set(),
      selection,
    };
  }
  function itemIdsForValue(scanData, mode, key) {
    if (!scanData || !key) return [];
    const lookup = mode === "ordlist_dno" ? scanData.invoiceToItemIds : scanData.orderToItemIds;
    return (lookup && lookup[key]) ? lookup[key].slice() : [];
  }
  function evaluateScanGate(activeData, mode, scannedValue) {
    const key = safeTrim(scannedValue);
    const invoiceMode = mode === "ordlist_dno";
    const allowedSet = invoiceMode ? activeData.invoiceSet : activeData.orderSet;
    const processedSet = invoiceMode ? activeData.processedInvoiceSet : activeData.processedOrderSet;
    return {
      allowed: !!key && allowedSet.has(key),
      key,
      alreadyProcessed: !!key && processedSet.has(key),
      mode,
      itemIds: itemIdsForValue(activeData, mode, key),
    };
  }
  function markProcessed(activeData, mode, key) {
    if (!activeData || !key) return [];
    const itemIds = itemIdsForValue(activeData, mode, key);
    if (mode === "ordlist_dno") activeData.processedInvoiceSet.add(key);
    else activeData.processedOrderSet.add(key);
    itemIds.forEach((itemId) => activeData.processedItemSet.add(itemId));
    return itemIds;
  }
  function buildAggregateScanData(selectedRows, detailByRowId) {
    const items = [];
    const orderSet = new Set();
    const invoiceSet = new Set();
    const processedOrderSet = new Set();
    const processedInvoiceSet = new Set();
    const processedItemSet = new Set();
    const orderToItemIds = {};
    const invoiceToItemIds = {};
    const selectedSummaries = [];

    selectedRows.forEach((selection) => {
      const detail = detailByRowId[selection.id];
      if (!detail) return;

      selectedSummaries.push(selection);
      detail.items.forEach((item) => {
        items.push(item);
        pushToLookupMap(orderToItemIds, item.orderNumber, item.id);
        pushToLookupMap(invoiceToItemIds, item.invoiceNumber, item.id);
      });
      detail.orderNumbers.forEach((value) => orderSet.add(value));
      detail.invoiceNumbers.forEach((value) => invoiceSet.add(value));
      detail.processedOrderSet.forEach((value) => processedOrderSet.add(value));
      detail.processedInvoiceSet.forEach((value) => processedInvoiceSet.add(value));
      detail.processedItemSet.forEach((value) => processedItemSet.add(value));
    });

    return {
      items,
      selectedSummaries,
      orderNumbers: Array.from(orderSet),
      invoiceNumbers: Array.from(invoiceSet),
      orderSet,
      invoiceSet,
      orderToItemIds,
      invoiceToItemIds,
      processedOrderSet,
      processedInvoiceSet,
      processedItemSet,
    };
  }
  function normalizeHistoryEntry(entry) {
    if (!entry || !entry.timestamp) return null;
    const timestamp = new Date(entry.timestamp);
    if (Number.isNaN(timestamp.getTime())) return null;
    const normalized = {
      id: safeTrim(entry.id) || ("history-" + timestamp.getTime()),
      timestamp: timestamp.toISOString(),
      timeLabel: formatDateTime(timestamp),
      status: entry.status === "mismatch" ? "mismatch" : "success",
      mode: safeTrim(entry.mode) || "ordlist_no1",
      modeLabel: getModeLabel(entry.mode),
      value: safeTrim(entry.value),
      matchedItemIds: Array.isArray(entry.matchedItemIds) ? uniqueArray(entry.matchedItemIds.map(safeTrim)) : [],
      selections: Array.isArray(entry.selections) ? entry.selections.map((selection) => ({
        id: safeTrim(selection.id),
        ivmstr_date: safeTrim(selection.ivmstr_date),
        ivmstr_ivno: safeTrim(selection.ivmstr_ivno),
        site_name: safeTrim(selection.site_name),
        ivmstr_memo: safeTrim(selection.ivmstr_memo),
        expr_name: safeTrim(selection.expr_name),
      })) : [],
    };
    return normalized;
  }
  function pruneHistoryEntries(entries, nowValue) {
    const now = typeof nowValue === "number" ? nowValue : (nowValue ? new Date(nowValue).getTime() : Date.now());
    const threshold = now - (HISTORY_KEEP_DAYS * 24 * 60 * 60 * 1000);
    return (entries || [])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .filter((entry) => new Date(entry.timestamp).getTime() >= threshold)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }
  function searchHistoryEntries(entries, filters, nowValue) {
    const base = pruneHistoryEntries(entries, nowValue);
    const keyword = safeTrim(filters && filters.keyword).toLowerCase();
    const status = safeTrim(filters && filters.status) || "all";
    const days = Number(filters && filters.days) || HISTORY_KEEP_DAYS;
    const now = typeof nowValue === "number" ? nowValue : (nowValue ? new Date(nowValue).getTime() : Date.now());
    const threshold = now - (days * 24 * 60 * 60 * 1000);

    return base.filter((entry) => {
      if (status !== "all" && entry.status !== status) return false;
      if (new Date(entry.timestamp).getTime() < threshold) return false;
      if (!keyword) return true;

      const haystack = [
        entry.value,
        entry.modeLabel,
        entry.status === "mismatch" ? "불일치" : "성공",
      ].concat(entry.selections.map((selection) => [
        formatCompactDate(selection.ivmstr_date),
        selection.ivmstr_ivno ? selection.ivmstr_ivno + "차" : "",
        selection.site_name,
        selection.ivmstr_memo,
      ].join(" "))).join(" ").toLowerCase();

      return haystack.indexOf(keyword) !== -1;
    });
  }
  function buildHistoryIndex(historyEntries) {
    const map = {};
    pruneHistoryEntries(historyEntries).forEach((entry) => {
      entry.matchedItemIds.forEach((itemId) => {
        if (!map[itemId] || map[itemId].timestamp < entry.timestamp) map[itemId] = entry;
      });
    });
    return map;
  }
  function buildDetailRows(aggregate, localHistoryEntries, sessionHistoryEntries) {
    if (!aggregate) return [];
    const localHistoryIndex = buildHistoryIndex(localHistoryEntries);
    const sessionHistoryIndex = buildHistoryIndex(sessionHistoryEntries);
    return aggregate.items.map((item) => {
      const localHistoryEntry = localHistoryIndex[item.id];
      const sessionHistoryEntry = sessionHistoryIndex[item.id];
      return {
        itemId: item.id,
        orderNumber: item.orderNumber,
        invoiceNumber: item.invoiceNumber,
        scanned: aggregate.processedItemSet.has(item.id),
        hasLocalHistory: !!localHistoryEntry,
        lastLocalHistoryAt: localHistoryEntry ? localHistoryEntry.timeLabel : "",
        lastSessionAt: sessionHistoryEntry ? sessionHistoryEntry.timeLabel : "",
        selectionLabel: item.selectionLabel,
        selectionBadge: item.selectionBadge,
        siteName: item.site_name,
        memo: item.ivmstr_memo,
        exprName: item.expr_name,
        ivmstrDate: item.ivmstr_date,
        ivmstrIvno: item.ivmstr_ivno,
      };
    });
  }
  function readHistory(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    try {
      const raw = storage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      return pruneHistoryEntries(JSON.parse(raw));
    } catch (error) {
      return [];
    }
  }
  function writeHistory(storage, entries) {
    if (!storage || typeof storage.setItem !== "function") return;
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(pruneHistoryEntries(entries)));
    } catch (error) {
      // ignore localStorage errors
    }
  }
  function appendHistoryEntry(entries, entry, storage) {
    const nextEntries = pruneHistoryEntries([entry].concat(entries || []));
    writeHistory(storage, nextEntries);
    return nextEntries;
  }
  function createHistoryEntry(status, mode, value, selections, matchedItemIds) {
    const timestamp = new Date();
    return normalizeHistoryEntry({
      id: [status, timestamp.getTime(), safeTrim(value)].join("-"),
      timestamp: timestamp.toISOString(),
      status,
      mode,
      value,
      selections,
      matchedItemIds,
    });
  }
  function buildStatus(state) {
    if (state.listError || state.detailError) {
      return { className: "tm-status tm-status-error", text: state.listError || state.detailError };
    }
    if (state.listLoading) {
      return { className: "tm-status tm-status-loading", text: "차수 목록을 조회하는 중입니다." };
    }
    if (state.pendingDetailIds.size) {
      return { className: "tm-status tm-status-loading", text: "선택한 차수 데이터 상세를 불러오는 중입니다." };
    }
    return { className: "tm-status", text: state.statusText || "오늘 기준 차수 목록을 조회했습니다." };
  }
  function filterDetailRows(rows, filters) {
    const keyword = safeTrim(filters && filters.keyword).toLowerCase();
    const status = safeTrim(filters && filters.status) || "all";
    const historyState = safeTrim(filters && filters.historyState) || "all";

    return rows.filter((row) => {
      if (status === "scanned" && !row.scanned) return false;
      if (status === "pending" && row.scanned) return false;
      if (historyState === "history" && !row.hasLocalHistory) return false;
      if (historyState === "no-history" && row.hasLocalHistory) return false;
      if (!keyword) return true;
      const haystack = [
        row.orderNumber,
        row.invoiceNumber,
        row.ivmstrDate,
        row.ivmstrIvno,
        row.selectionLabel,
        row.siteName,
        row.memo,
        row.exprName,
      ].join(" ").toLowerCase();
      return haystack.indexOf(keyword) !== -1;
    });
  }
  function buildHistoryDisplayRows(entries) {
    return (entries || []).map((entry) => {
      const selections = entry.selections || [];
      return {
        id: entry.id,
        statusLabel: entry.status === "mismatch" ? "불일치" : "성공",
        statusClass: entry.status === "mismatch" ? "tm-history" : "tm-done",
        value: entry.value || "-",
        modeLabel: entry.modeLabel || getModeLabel(entry.mode),
        timeLabel: entry.timeLabel || "",
        dateSummary: summarizeValues(selections.map((selection) => formatCompactDate(selection.ivmstr_date || "")), "-"),
        ivnoSummary: summarizeValues(
          selections.map((selection) => selection.ivmstr_ivno ? selection.ivmstr_ivno + "차" : ""),
          "-"
        ),
        siteSummary: summarizeValues(selections.map((selection) => selection.site_name), "-"),
        memoSummary: summarizeValues(selections.map((selection) => selection.ivmstr_memo), "-"),
        matchedCount: Array.isArray(entry.matchedItemIds) ? entry.matchedItemIds.length : 0,
      };
    });
  }
  function clearLiveSelectionState(state) {
    state.selectedRowIds = [];
    state.detailByRowId = {};
    state.pendingDetailIds.clear();
    state.aggregate = buildAggregateScanData([], {});
    state.selectedListOpen = false;
    state.detailError = "";
    if (state.modalType === "detail") state.modalType = "";
  }
  function resetSessionHistoryState(state) {
    state.sessionHistoryEntries = [];
    state.recentMismatches = [];
    state.baselineHistoryEntries = pruneHistoryEntries(state.localHistoryEntries);
    return state;
  }
  function disableFilterModeState(state) {
    resetSessionHistoryState(state);
    clearLiveSelectionState(state);
    state.filterModeEnabled = false;
    state.drawerOpen = false;
    state.statusText = "필터링모드 OFF: 원래 페이지 스캔 모드";
    state.modalType = "";
    return state;
  }
  function gmRequest(details) {
    const request = root.GM_xmlhttpRequest || (typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
    if (!request) return Promise.reject(new Error("GM_xmlhttpRequest를 사용할 수 없습니다."));
    return new Promise((resolve, reject) => {
      request(Object.assign({}, details, {
        onload: resolve,
        onerror: (response) => reject(new Error(response && response.error ? response.error : "요청이 실패했습니다.")),
        ontimeout: () => reject(new Error("요청 시간이 초과되었습니다.")),
      }));
    });
  }
  function waitForElement(selector, attempts, delay) {
    let remaining = attempts;
    return new Promise((resolve) => {
      function check() {
        const element = root.document.querySelector(selector);
        if (element || remaining <= 0) {
          resolve(element);
          return;
        }
        remaining -= 1;
        root.setTimeout(check, delay);
      }
      check();
    });
  }
  function buildPageBridgeSource(options) {
    const before = JSON.stringify(options.beforeEventName);
    const after = JSON.stringify(options.afterEventName);
    const inputId = JSON.stringify(options.inputId || "ordlist_dno");
    const attr = JSON.stringify(options.bridgeAttribute || BRIDGE_ATTRIBUTE);
    const retryLimit = Number(options.retryLimit || BRIDGE_RETRY_LIMIT);

    return [
      "(function(){",
      "'use strict';",
      "var beforeEventName=" + before + ";",
      "var afterEventName=" + after + ";",
      "var inputId=" + inputId + ";",
      "var bridgeAttribute=" + attr + ";",
      "var retryLimit=" + retryLimit + ";",
      "if(window.__tmSite3217BridgeInstalled){return;}",
      "window.__tmSite3217BridgeInstalled=true;",
      "function setStatus(value){if(document&&document.documentElement){document.documentElement.setAttribute(bridgeAttribute,value);}}",
      "function getMode(){var checked=document.querySelector(\"input[name='SEARCH_TYPE']:checked\");return checked?checked.value:'ordlist_no1';}",
      "function wrap(){",
      "if(typeof window.KeyDown!=='function'){return false;}",
      "if(window.KeyDown.__tmSite3217BridgeWrapped){setStatus('ready');return true;}",
      "var original=window.KeyDown;",
      "function wrapped(){",
      "var eventObject=window.event;",
      "if(!(eventObject&&Number(eventObject.keyCode)===13)){return original.apply(this,arguments);}",
      "var input=document.getElementById(inputId);",
      "var detail={value:input&&input.value!=null?String(input.value).trim():'',mode:getMode()};",
      "var beforeEvent=new CustomEvent(beforeEventName,{cancelable:true,detail:detail});",
      "if(!document.dispatchEvent(beforeEvent)){return false;}",
      "var result=original.apply(this,arguments);",
      "document.dispatchEvent(new CustomEvent(afterEventName,{detail:detail}));",
      "return result;}",
      "wrapped.__tmSite3217BridgeWrapped=true;",
      "wrapped.__tmSite3217Original=original;",
      "window.KeyDown=wrapped;",
      "setStatus('ready');",
      "return true;}",
      "if(wrap()){return;}",
      "var attempts=0;",
      "var timer=window.setInterval(function(){attempts+=1;if(wrap()){window.clearInterval(timer);return;}if(attempts>=retryLimit){setStatus('failed');window.clearInterval(timer);}},150);",
      "})();",
    ].join("\n");
  }
  function applyStyles(doc) {
    if (doc.getElementById(STYLE_ID)) return;

    const css = [
      "#" + PANEL_ID + "{margin-bottom:4px;font-size:11px;color:#333}",
      "#" + PANEL_ID + " .tm-toolbar{display:grid;grid-template-columns:auto 1fr auto;align-items:end;gap:6px;padding:4px 0 2px;background:transparent;border:0}",
      "#" + PANEL_ID + " .tm-toolbar-head{display:flex;align-items:center;gap:4px;min-width:0}",
      "#" + PANEL_ID + " .tm-compact-status{color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}",
      "#" + PANEL_ID + " .tm-toolbar-controls{display:flex;align-items:flex-end;gap:4px;flex-wrap:wrap;justify-content:flex-start}",
      "#" + PANEL_ID + " .tm-toolbar-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}",
      "#" + PANEL_ID + " .tm-field{display:grid;gap:2px;color:#555}",
      "#" + PANEL_ID + " .tm-field span{font-size:11px;line-height:1}",
      "#" + PANEL_ID + " input[type='date'],#" + PANEL_ID + " input[type='text'],#" + PANEL_ID + " select{height:22px;padding:0 6px;border:1px solid #bcbcbc;border-radius:0;background:#fff;color:#222;box-sizing:border-box;font-size:11px}",
      "#" + PANEL_ID + " button{height:22px;padding:0 8px;border:1px solid #bcbcbc;border-radius:0;background:linear-gradient(#ffffff,#ececec);color:#333;cursor:pointer;font-size:11px;line-height:20px}",
      "#" + PANEL_ID + " button:hover{background:linear-gradient(#ffffff,#e5e5e5);border-color:#9f9f9f}",
      "#" + PANEL_ID + " button:active{background:linear-gradient(#e8e8e8,#ffffff)}",
      "#" + PANEL_ID + " button:disabled{color:#999;background:#f3f3f3;cursor:default}",
      "#" + PANEL_ID + " .tm-mode-toggle{font-weight:700;min-width:96px}",
      "#" + PANEL_ID + " .tm-mode-toggle.tm-mode-on{background:linear-gradient(#f7fff8,#dbeedc);border-color:#8cb28f;color:#24552b}",
      "#" + PANEL_ID + " .tm-mode-toggle.tm-mode-off{background:linear-gradient(#fffdf8,#eee7d7);border-color:#b7ab8b;color:#665028}",
      "#" + PANEL_ID + " .tm-button-strong{font-weight:700}",
      "#" + PANEL_ID + " .tm-mode{color:#666;white-space:nowrap}",
      "#" + PANEL_ID + " .tm-selection-line{margin-top:3px;padding:3px 0 0;color:#555;line-height:1.45;border-top:1px solid #ececec}",
      "#" + PANEL_ID + " .tm-selection-note{display:inline-block}",
      "#" + PANEL_ID + " .tm-selected-panel{margin-top:4px}",
      "#" + PANEL_ID + " .tm-selected-panel button[hidden]{display:none !important}",
      "#" + PANEL_ID + "-selected-list[hidden]{display:none !important}",
      "#" + PANEL_ID + "-selected-list{margin-top:4px;border:1px solid #d3d3d3;background:#fafafa}",
      "#" + PANEL_ID + "-selected-list table{width:100%;border-collapse:collapse;table-layout:fixed}",
      "#" + PANEL_ID + "-selected-list th,#" + PANEL_ID + "-selected-list td{padding:6px 7px;border-bottom:1px solid #ececec;text-align:left;vertical-align:top;word-break:break-word}",
      "#" + PANEL_ID + "-selected-list th{background:#f0f0f0;color:#555}",
      "#" + PANEL_ID + "-selected-list tr:last-child td{border-bottom:0}",
      "#" + PANEL_ID + " .tm-chip{display:inline-block;padding:1px 5px;border:1px solid #c9c9c9;border-radius:0;background:#f7f7f7;color:#555}",
      "#" + PANEL_ID + "-drawer-row[hidden]{display:none !important}",
      "#" + PANEL_ID + "-drawer{padding-top:4px}",
      "#" + PANEL_ID + "-drawer .tm-status{margin-bottom:4px;padding:5px 6px;border:1px solid #cfcfcf;background:#f7f7f7;color:#444}",
      "#" + PANEL_ID + "-drawer .tm-status-loading{background:#f7f7f7}",
      "#" + PANEL_ID + "-drawer .tm-status-error{background:#fff3f1;border-color:#dfb7b1;color:#8a443d}",
      "#" + PANEL_ID + "-drawer .tm-table-wrap{border:1px solid #cfcfcf;overflow:auto;background:#fff;max-height:336px}",
      "#" + PANEL_ID + "-drawer table{width:100%;border-collapse:collapse;table-layout:fixed}",
      "#" + PANEL_ID + "-drawer th,#" + PANEL_ID + "-drawer td{padding:6px 7px;border-bottom:1px solid #ebebeb;text-align:left;vertical-align:top;word-break:break-word}",
      "#" + PANEL_ID + "-drawer th{position:sticky;top:0;background:#f3f3f3;z-index:1;color:#555}",
      "#" + PANEL_ID + "-drawer tr.tm-active-row{background:#f8f8f8}",
      "#" + PANEL_ID + "-drawer .tm-select-button.tm-selected{font-weight:700;background:linear-gradient(#ffffff,#dfdfdf);border-color:#959595;color:#222}",
      "#" + PANEL_ID + "-drawer .tm-empty{padding:18px 12px;text-align:center;color:#777}",
      "#" + PANEL_ID + "-drawer .tm-bottom{display:block;margin-top:4px;padding:4px 2px;color:#555;line-height:1.5}",
      "#" + PANEL_ID + "-drawer .tm-mini-card{display:inline;padding:0;border:0;background:transparent;color:#555}",
      "#" + PANEL_ID + "-drawer .tm-mini-card::after{content:' | ';color:#999}",
      "#" + PANEL_ID + "-drawer .tm-mini-card:last-child::after{content:''}",
      "#" + PANEL_ID + "-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,0.38);z-index:2147483647}",
      "#" + PANEL_ID + "-modal-backdrop.tm-open{display:flex}",
      "#" + PANEL_ID + "-modal{width:min(980px,calc(100vw - 36px));max-height:calc(100vh - 36px);display:grid;grid-template-rows:auto auto auto minmax(0,1fr);border:1px solid #bfbfbf;border-radius:0;background:#fff;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,0.18)}",
      "#" + PANEL_ID + "-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px 10px;border-bottom:1px solid #dddddd;background:#f5f5f5}",
      "#" + PANEL_ID + "-modal-title{margin:0;font-size:16px;line-height:1.2;color:#222}",
      "#" + PANEL_ID + "-modal-subtitle{margin-top:3px;color:#666}",
      "#" + PANEL_ID + "-modal-summary{display:grid;gap:6px;padding:10px 14px;border-bottom:1px solid #e5e5e5;background:#fafafa;max-height:170px;overflow:auto}",
      "#" + PANEL_ID + "-modal-summary .tm-selection-card{display:grid;grid-template-columns:140px 1fr 1fr;gap:10px;padding:8px 10px;border:1px solid #dddddd;border-radius:0;background:#fff}",
      "#" + PANEL_ID + "-modal-summary .tm-selection-card strong{display:block;color:#17212b}",
      "#" + PANEL_ID + "-modal-controls{display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #e5e5e5;background:#fff}",
      "#" + PANEL_ID + "-modal-content{min-height:220px;overflow:auto;padding:12px 14px;background:#fff}",
      "#" + PANEL_ID + "-modal-grid{display:grid;gap:6px}",
      "#" + PANEL_ID + "-detail-summary{margin-bottom:8px;color:#555}",
      "#" + PANEL_ID + "-detail-table-wrap{border:1px solid #d0d0d0;max-height:520px;overflow:auto}",
      "#" + PANEL_ID + "-detail-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}",
      "#" + PANEL_ID + "-detail-table th,#" + PANEL_ID + "-detail-table td{padding:7px 8px;border-bottom:1px solid #ececec;text-align:left;vertical-align:top;word-break:break-word}",
      "#" + PANEL_ID + "-detail-table th{position:sticky;top:0;background:#f3f3f3;color:#555;z-index:1}",
      "#" + PANEL_ID + "-detail-table tr.tm-detail-pending{background:#fffdf6}",
      "#" + PANEL_ID + "-detail-table tr.tm-detail-done{background:#fbfcfd}",
      "#" + PANEL_ID + " .tm-meta-text{display:block;margin-top:3px;color:#777;font-size:10px;line-height:1.35}",
      "#" + PANEL_ID + "-modal-badge{display:inline-flex;align-items:center;padding:2px 6px;border:1px solid #c8c8c8;border-radius:0;font-weight:700;width:max-content;background:#f5f5f5;color:#444}",
      "#" + PANEL_ID + "-modal-badge.tm-done{background:#eef7ef;color:#2e6d36;border-color:#bfd4c2}",
      "#" + PANEL_ID + "-modal-badge.tm-pending{background:#f4f6f8;color:#526170;border-color:#d7dde3}",
      "#" + PANEL_ID + "-modal-badge.tm-history{background:#f8f1e8;color:#7d5524;border-color:#e1d0b7}",
      "#" + PANEL_ID + "-modal-history-item{display:grid;gap:6px;padding:10px 12px;border:1px solid #dcdcdc;border-radius:0;background:#fff}",
      "#" + PANEL_ID + "-modal-history-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#5f6e7c}",
      "#" + PANEL_ID + "-modal-history-selections{display:flex;gap:6px;flex-wrap:wrap}",
      "#" + PANEL_ID + "-history-table-wrap{border:1px solid #d0d0d0;max-height:520px;overflow:auto}",
      "#" + PANEL_ID + "-history-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}",
      "#" + PANEL_ID + "-history-table th,#" + PANEL_ID + "-history-table td{padding:7px 8px;border-bottom:1px solid #ececec;text-align:left;vertical-align:top;word-break:break-word}",
      "#" + PANEL_ID + "-history-table th{position:sticky;top:0;background:#f3f3f3;color:#555;z-index:1}",
      "#" + PANEL_ID + "-modal-empty{padding:28px 12px;text-align:center;color:#738292}",
      "#" + PANEL_ID + "-modal-close{height:24px;padding:0 10px}",
      "@media (max-width:900px){#" + PANEL_ID + " .tm-toolbar{grid-template-columns:1fr}#" + PANEL_ID + " .tm-toolbar-actions{justify-content:flex-start}#" + PANEL_ID + "-modal-summary .tm-selection-card{grid-template-columns:1fr}}",
    ].join("\n");

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      const marker = doc.createElement("meta");
      marker.id = STYLE_ID;
      doc.head.appendChild(marker);
      return;
    }

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    doc.head.appendChild(style);
  }
  function createDrawerRow(doc) {
    const row = doc.createElement("tr");
    row.id = PANEL_ID + "-drawer-row";

    const th = doc.createElement("td");
    th.className = "th";
    th.innerHTML = "<b>주문필터</b>";

    const td = doc.createElement("td");
    td.className = "td";
    td.colSpan = 3;

    const wrap = doc.createElement("div");
    wrap.id = PANEL_ID + "-drawer";
    wrap.innerHTML = [
      "<div class='tm-status' id='" + PANEL_ID + "-status'></div>",
      "<div class='tm-table-wrap'>",
      "<table><thead><tr>",
      "<th style='width:72px'>선택</th>",
      "<th style='width:96px'>날짜</th>",
      "<th style='width:60px'>차수</th>",
      "<th style='width:60px'>건수</th>",
      "<th style='width:96px'>택배사</th>",
      "<th style='width:136px'>판매처</th>",
      "<th>메모</th>",
      "</tr></thead><tbody id='" + PANEL_ID + "-rows'></tbody></table>",
      "</div>",
      "<div class='tm-bottom' id='" + PANEL_ID + "-summary'></div>",
    ].join("");

    td.appendChild(wrap);
    row.appendChild(th);
    row.appendChild(td);
    return row;
  }
  function createModal(doc) {
    let backdrop = doc.getElementById(PANEL_ID + "-modal-backdrop");
    if (backdrop) return backdrop;

    backdrop = doc.createElement("div");
    backdrop.id = PANEL_ID + "-modal-backdrop";
    backdrop.innerHTML = [
      "<div class='tm-modal' id='" + PANEL_ID + "-modal' role='dialog' aria-modal='true'>",
      "<div id='" + PANEL_ID + "-modal-head'></div>",
      "<div id='" + PANEL_ID + "-modal-summary'></div>",
      "<div id='" + PANEL_ID + "-modal-controls'></div>",
      "<div id='" + PANEL_ID + "-modal-content'></div>",
      "</div>",
    ].join("");
    doc.body.appendChild(backdrop);
    return backdrop;
  }
  function createUi(doc) {
    const input = doc.getElementById("ordlist_dno");
    if (!input) throw new Error("스캔 입력창을 찾지 못했습니다.");

    const inputRow = input.closest("tr");
    const inputCell = input.parentElement;
    const tableBody = inputRow ? inputRow.parentElement : null;
    if (!inputRow || !inputCell || !tableBody) throw new Error("스캔 입력 영역의 테이블 구조를 찾지 못했습니다.");

    let toolbar = doc.getElementById(PANEL_ID);
    if (!toolbar) {
      toolbar = doc.createElement("div");
      toolbar.id = PANEL_ID;
      toolbar.innerHTML = [
        "<div class='tm-toolbar'>",
        "<div class='tm-toolbar-head'>",
        "<button type='button' id='" + PANEL_ID + "-mode-toggle' class='tm-mode-toggle tm-mode-off'>필터링모드 OFF</button>",
        "<button type='button' id='" + PANEL_ID + "-toggle'>차수목록 열기</button>",
        "<span class='tm-compact-status' id='" + PANEL_ID + "-compact'></span>",
        "</div>",
        "<div class='tm-toolbar-controls' id='" + PANEL_ID + "-controls'>",
        "<label class='tm-field'><span>조회일</span><input type='date' id='" + PANEL_ID + "-date'></label>",
        "<button type='button' id='" + PANEL_ID + "-refresh'>조회</button>",
        "<button type='button' id='" + PANEL_ID + "-clear'>선택 해제</button>",
        "<span class='tm-mode' id='" + PANEL_ID + "-mode'></span>",
        "</div>",
        "<div class='tm-toolbar-actions'>",
        "<button type='button' id='" + PANEL_ID + "-data' class='tm-button-strong'>데이터 0건</button>",
        "<button type='button' id='" + PANEL_ID + "-history'>이전 로컬 기록</button>",
        "</div>",
        "</div>",
        "<div class='tm-selection-line' id='" + PANEL_ID + "-selection-line'></div>",
        "<div class='tm-selected-panel'>",
        "<button type='button' id='" + PANEL_ID + "-selected-toggle' hidden>선택차수 0건 보기</button>",
        "<div id='" + PANEL_ID + "-selected-list' hidden></div>",
        "</div>",
      ].join("");
      inputCell.insertBefore(toolbar, input);
    }

    let drawerRow = doc.getElementById(PANEL_ID + "-drawer-row");
    if (!drawerRow) {
      drawerRow = createDrawerRow(doc);
      if (inputRow.nextSibling) tableBody.insertBefore(drawerRow, inputRow.nextSibling);
      else tableBody.appendChild(drawerRow);
    }

    const backdrop = createModal(doc);
    return {
      input,
      shell: toolbar,
      compactStatus: doc.getElementById(PANEL_ID + "-compact"),
      controls: doc.getElementById(PANEL_ID + "-controls"),
      modeToggleButton: doc.getElementById(PANEL_ID + "-mode-toggle"),
      dateInput: doc.getElementById(PANEL_ID + "-date"),
      refreshButton: doc.getElementById(PANEL_ID + "-refresh"),
      clearButton: doc.getElementById(PANEL_ID + "-clear"),
      toggleButton: doc.getElementById(PANEL_ID + "-toggle"),
      dataButton: doc.getElementById(PANEL_ID + "-data"),
      historyButton: doc.getElementById(PANEL_ID + "-history"),
      modeText: doc.getElementById(PANEL_ID + "-mode"),
      selectionLine: doc.getElementById(PANEL_ID + "-selection-line"),
      selectedToggleButton: doc.getElementById(PANEL_ID + "-selected-toggle"),
      selectedList: doc.getElementById(PANEL_ID + "-selected-list"),
      drawerRow,
      status: doc.getElementById(PANEL_ID + "-status"),
      rowsBody: doc.getElementById(PANEL_ID + "-rows"),
      summary: doc.getElementById(PANEL_ID + "-summary"),
      modalBackdrop: backdrop,
      modal: doc.getElementById(PANEL_ID + "-modal"),
      modalHead: doc.getElementById(PANEL_ID + "-modal-head"),
      modalSummary: doc.getElementById(PANEL_ID + "-modal-summary"),
      modalControls: doc.getElementById(PANEL_ID + "-modal-controls"),
      modalContent: doc.getElementById(PANEL_ID + "-modal-content"),
    };
  }
  function buildRowViewModel(row) {
    return {
      id: safeTrim(row.ivmstr_seq) || safeTrim(row.ivmstr_ivno),
      ivmstr_seq: safeTrim(row.ivmstr_seq),
      ivmstr_date: safeTrim(row.ivmstr_date),
      ivmstr_ivno: safeTrim(row.ivmstr_ivno),
      ivmstr_cust: safeTrim(row.ivmstr_cust),
      expr_name: safeTrim(row.expr_name),
      site_name: safeTrim(row.site_name),
      ivmstr_memo: safeTrim(row.ivmstr_memo),
      ivcnt: safeTrim(row.ivcnt) || safeTrim(row.ivcnt_num),
    };
  }
  async function fetchListPage(dateString, pageNumber) {
    const params = buildListRequestParams(dateString, pageNumber, Date.now() + pageNumber);
    const response = await fetch(LIST_ENDPOINT + "?" + toQueryString(params), {
      credentials: "include",
      headers: { Accept: "application/json, text/javascript, */*; q=0.01" },
    });
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();

    if (!response.ok) throw new Error("차수 목록 조회 실패 (" + response.status + ")");
    if (isSessionExpiredResponse(bodyText, contentType)) throw new SessionExpiredError();
    try {
      return JSON.parse(bodyText);
    } catch (error) {
      throw new Error("차수 목록 응답을 JSON으로 읽지 못했습니다.");
    }
  }
  async function fetchAllRows(dateString) {
    const firstPage = await fetchListPage(dateString, 1);
    const totalPages = Math.max(Number(firstPage.totalpages) || 1, 1);
    const rows = Array.isArray(firstPage.rows) ? firstPage.rows.slice() : [];

    for (let page = 2; page <= totalPages; page += 1) {
      const payload = await fetchListPage(dateString, page);
      if (Array.isArray(payload.rows)) rows.push.apply(rows, payload.rows);
    }

    return rows.map(buildRowViewModel);
  }
  async function downloadDetailWorkbook(selection) {
    const response = await gmRequest({
      method: "GET",
      url: root.location.origin + XLS_ENDPOINT + "?" + toQueryString({
        ORDLIST_IVDATE: selection.ivmstr_date || compactDate(todayString()),
        ORDLIST_IVNO: selection.ivmstr_ivno,
        formType: "site320main",
      }),
      responseType: "arraybuffer",
      timeout: 30000,
      headers: { Accept: "application/vnd.ms-excel,application/octet-stream,*/*" },
      anonymous: false,
    });

    const headers = parseResponseHeaders(response.responseHeaders);
    const buffer = ensureArrayBuffer(response.response);
    const contentType = String(headers["content-type"] || "").toLowerCase();

    if (Number(response.status) >= 400) throw new Error("상세 XLS 다운로드 실패 (" + response.status + ")");
    if (contentType.indexOf("text/html") !== -1 || contentType.indexOf("application/json") !== -1) {
      const text = arrayBufferToText(buffer);
      if (isSessionExpiredResponse(text, contentType)) throw new SessionExpiredError();
      throw new Error("상세 XLS 대신 HTML 응답이 내려왔습니다.");
    }

    return buffer;
  }
  function parseWorkbookBuffer(buffer) {
    if (!root.XLSX || typeof root.XLSX.read !== "function") throw new Error("XLSX 라이브러리가 로드되지 않았습니다.");
    const workbook = root.XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");
    const rows = root.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    return extractScanTargets(rows);
  }
  function focusScanInput(state) {
    if (!state.elements || !state.elements.input) return;
    state.elements.input.focus();
    state.elements.input.select();
  }
  function getSelectedRows(state) {
    return state.selectedRowIds
      .map((id) => state.rows.find((row) => row.id === id))
      .filter(Boolean);
  }
  function rebuildAggregate(state) {
    state.aggregate = buildAggregateScanData(getSelectedRows(state), state.detailByRowId);
  }
  function clearSelections(state) {
    clearLiveSelectionState(state);
    state.statusText = "차수 선택을 해제했습니다.";
    if (state.filterModeEnabled) state.drawerOpen = true;
    render(state);
  }
  function recordHistory(state, status, mode, value, matchedItemIds) {
    const selections = matchedItemIds && matchedItemIds.length
      ? uniqueArray(matchedItemIds.map((itemId) => itemId.split("::")[0]))
        .map((rowId) => state.rows.find((row) => row.id === rowId))
        .filter(Boolean)
      : getSelectedRows(state);

    const entry = createHistoryEntry(status, mode, value, selections, matchedItemIds || []);
    state.localHistoryEntries = appendHistoryEntry(state.localHistoryEntries, entry, state.storage);
    state.sessionHistoryEntries = pruneHistoryEntries([entry].concat(state.sessionHistoryEntries || []));
  }
  function pushRecentMismatch(state, mode, value) {
    state.recentMismatches.unshift({
      value,
      modeLabel: getModeLabel(mode),
      timeLabel: formatDateTime(new Date()),
    });
    if (state.recentMismatches.length > RECENT_MISMATCH_LIMIT) state.recentMismatches.length = RECENT_MISMATCH_LIMIT;
  }
  async function refreshList(state, options) {
    const opts = Object.assign({ keepSelection: false }, options);
    state.listLoading = true;
    state.listError = "";
    state.detailError = "";
    state.statusText = "차수 목록을 새로 조회합니다.";
    if (!opts.keepSelection) {
      resetSessionHistoryState(state);
      clearLiveSelectionState(state);
    }
    render(state);

    try {
      state.rows = await fetchAllRows(state.queryDate);
      if (opts.keepSelection) {
        state.selectedRowIds = state.selectedRowIds.filter((id) => state.rows.some((row) => row.id === id));
      }
      rebuildAggregate(state);
      state.statusText = formatCompactDate(compactDate(state.queryDate)) + " 기준 차수 " + state.rows.length + "건을 조회했습니다.";
    } catch (error) {
      state.rows = [];
      clearLiveSelectionState(state);
      state.listError = error.message;
    } finally {
      state.listLoading = false;
      render(state);
      focusScanInput(state);
    }
  }
  async function ensureDetailLoaded(state, selection) {
    if (!selection || state.detailByRowId[selection.id] || state.pendingDetailIds.has(selection.id)) return;

    state.pendingDetailIds.add(selection.id);
    state.detailError = "";
    state.statusText = selection.ivmstr_ivno + "차 데이터를 불러오는 중입니다.";
    render(state);

    try {
      const detail = attachSelectionMeta(parseWorkbookBuffer(await downloadDetailWorkbook(selection)), selection);
      state.detailByRowId[selection.id] = detail;
      state.statusText = selection.ivmstr_ivno + "차 데이터 " + detail.items.length + "건을 적재했습니다.";
    } catch (error) {
      state.detailError = error.message;
      state.selectedRowIds = state.selectedRowIds.filter((id) => id !== selection.id);
      if (!state.selectedRowIds.length) {
        state.drawerOpen = true;
        state.selectedListOpen = false;
      }
    } finally {
      state.pendingDetailIds.delete(selection.id);
      rebuildAggregate(state);
      render(state);
      focusScanInput(state);
    }
  }
  function toggleSelection(state, rowId) {
    if (!rowId || !state.filterModeEnabled) return;
    const exists = state.selectedRowIds.indexOf(rowId) !== -1;
    if (exists) {
      state.selectedRowIds = state.selectedRowIds.filter((id) => id !== rowId);
      if (!state.selectedRowIds.length) state.selectedListOpen = false;
      rebuildAggregate(state);
      state.statusText = "차수 선택을 해제했습니다.";
      render(state);
      focusScanInput(state);
      return;
    }

    const row = state.rows.find((item) => item.id === rowId);
    if (!row) return;
    state.selectedRowIds = state.selectedRowIds.concat(rowId);
    state.drawerOpen = true;
    rebuildAggregate(state);
    render(state);
    ensureDetailLoaded(state, row);
  }
  function markProcessedAcrossSelections(state, mode, key) {
    const selectedRows = getSelectedRows(state);
    let itemIds = [];
    selectedRows.forEach((selection) => {
      const detail = state.detailByRowId[selection.id];
      if (!detail) return;
      if (!(mode === "ordlist_dno" ? detail.invoiceSet.has(key) : detail.orderSet.has(key))) return;
      itemIds = itemIds.concat(markProcessed(detail, mode, key));
    });
    rebuildAggregate(state);
    return uniqueArray(itemIds);
  }
  function openModal(state, modalType) {
    state.modalType = modalType;
    render(state);
  }
  function closeModal(state) {
    state.modalType = "";
    render(state);
    focusScanInput(state);
  }
  function renderRows(state) {
    if (!state.rows.length) {
      state.elements.rowsBody.innerHTML = "<tr><td colspan='7' class='tm-empty'>조회 결과가 없습니다.</td></tr>";
      return;
    }

    state.elements.rowsBody.innerHTML = state.rows.map((row) => {
      const selected = state.selectedRowIds.indexOf(row.id) !== -1;
      const loading = state.pendingDetailIds.has(row.id);
      return [
        "<tr class='" + (selected ? "tm-active-row" : "") + "'>",
        "<td><button type='button' class='tm-select-button" + (selected ? " tm-selected" : "") + "' data-row-id='" + escapeHtml(row.id) + "'>" + (loading ? "로딩" : (selected ? "해제" : "추가")) + "</button></td>",
        "<td>" + escapeHtml(formatCompactDate(row.ivmstr_date || "-")) + "</td>",
        "<td>" + escapeHtml(row.ivmstr_ivno || "-") + "</td>",
        "<td>" + escapeHtml(row.ivcnt || "-") + "</td>",
        "<td>" + escapeHtml(row.expr_name || "-") + "</td>",
        "<td>" + escapeHtml(row.site_name || "-") + "</td>",
        "<td title='" + escapeHtml(row.ivmstr_memo || "-") + "'>" + escapeHtml(row.ivmstr_memo || "-") + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }
  function renderSelectionLine(state) {
    if (!state.filterModeEnabled) {
      state.elements.selectionLine.innerHTML = "<span class='tm-selection-note'>필터링모드 OFF. 원래 페이지처럼 자유 스캔합니다.</span>";
      return;
    }

    const selectedRows = getSelectedRows(state);
    if (!selectedRows.length) {
      state.elements.selectionLine.innerHTML = "<span class='tm-selection-note'>필터링모드 ON. 차수를 선택하세요. 선택 전에는 스캔이 차단됩니다.</span>";
      return;
    }
    state.elements.selectionLine.innerHTML = "<span class='tm-selection-note'>" + escapeHtml(buildSelectedSummaryText(selectedRows)) + "</span>";
  }
  function renderSelectedList(state) {
    const selectedRows = getSelectedRows(state);
    const open = shouldShowSelectedList(state.filterModeEnabled, state.selectedListOpen, selectedRows.length);

    state.elements.selectedToggleButton.hidden = !state.filterModeEnabled || !selectedRows.length;
    state.elements.selectedToggleButton.textContent = open
      ? ("선택차수 " + selectedRows.length + "건 닫기")
      : ("선택차수 " + selectedRows.length + "건 보기");
    state.elements.selectedList.hidden = !open;

    if (!open) {
      state.elements.selectedList.innerHTML = "";
      return;
    }

    state.elements.selectedList.innerHTML = [
      "<table><thead><tr>",
      "<th style='width:92px'>날짜</th>",
      "<th style='width:58px'>차수</th>",
      "<th style='width:140px'>판매처</th>",
      "<th>메모</th>",
      "<th style='width:64px'>해제</th>",
      "</tr></thead><tbody>",
      selectedRows.map((row) => [
        "<tr>",
        "<td>" + escapeHtml(formatCompactDate(row.ivmstr_date || "-")) + "</td>",
        "<td>" + escapeHtml(row.ivmstr_ivno ? row.ivmstr_ivno + "차" : "-") + "</td>",
        "<td>" + escapeHtml(row.site_name || "-") + "</td>",
        "<td title='" + escapeHtml(row.ivmstr_memo || "-") + "'>" + escapeHtml(row.ivmstr_memo || "-") + "</td>",
        "<td><button type='button' data-selected-row-id='" + escapeHtml(row.id) + "'>해제</button></td>",
        "</tr>",
      ].join("")).join(""),
      "</tbody></table>",
    ].join("");
  }
  function renderSummary(state) {
    const selectedRows = getSelectedRows(state);
    const counts = getAggregateCounts(state.aggregate);
    const loadedRows = selectedRows.filter((selection) => !!state.detailByRowId[selection.id]).length;
    const sessionMismatchCount = state.sessionHistoryEntries.filter((entry) => entry.status === "mismatch").length;

    state.elements.summary.innerHTML = [
      "<span class='tm-mini-card'>선택 <strong>" + selectedRows.length + "차수</strong></span>",
      "<span class='tm-mini-card'>데이터 <strong>" + counts.total + "건</strong></span>",
      "<span class='tm-mini-card'>스캔 <strong>" + counts.processed + " / " + counts.total + "</strong></span>",
      "<span class='tm-mini-card'>적재 <strong>" + loadedRows + " / " + selectedRows.length + "</strong></span>",
      "<span class='tm-mini-card'>이번 기록 <strong>" + state.sessionHistoryEntries.length + "건</strong></span>",
      "<span class='tm-mini-card'>로컬 기록 <strong>" + state.localHistoryEntries.length + "건</strong></span>",
      "<span class='tm-mini-card'>불일치 <strong>" + sessionMismatchCount + "건</strong></span>",
    ].join("");
  }
  function buildModalHeader(title, subtitle) {
    return [
      "<div>",
      "<h2 class='tm-modal-title'>" + escapeHtml(title) + "</h2>",
      "<div class='tm-modal-subtitle'>" + escapeHtml(subtitle) + "</div>",
      "</div>",
      "<button type='button' class='tm-modal-close' id='" + PANEL_ID + "-modal-close'>닫기</button>",
    ].join("");
  }
  function renderModalSelections(state) {
    const selectedRows = getSelectedRows(state);
    if (!selectedRows.length) {
      return "<div class='tm-empty'>선택된 차수가 없습니다.</div>";
    }

    return selectedRows.map((selection) => [
      "<div class='tm-selection-card'>",
      "<div><strong>" + escapeHtml(formatCompactDate(selection.ivmstr_date || "")) + "</strong><span>" + escapeHtml(selection.ivmstr_ivno ? selection.ivmstr_ivno + "차" : "-") + "</span></div>",
      "<div><strong>" + escapeHtml(selection.site_name || "-") + "</strong><span>" + escapeHtml(selection.expr_name || "-") + "</span></div>",
      "<div><strong>메모</strong><span>" + escapeHtml(selection.ivmstr_memo || "-") + "</span></div>",
      "</div>",
    ].join("")).join("");
  }
  function renderDetailModal(state) {
    const detailRows = sortDetailRows(filterDetailRows(
      buildDetailRows(state.aggregate, state.baselineHistoryEntries, state.sessionHistoryEntries),
      state.detailFilters
    ));
    const pendingCount = detailRows.filter((row) => !row.scanned).length;

    state.elements.modalHead.innerHTML = buildModalHeader(
      "데이터 상세",
      buildSelectedOverview(getSelectedRows(state))
    );
    state.elements.modalSummary.innerHTML = renderModalSelections(state);
    state.elements.modalControls.innerHTML = [
      "<label class='tm-field'><span>검색</span><input type='text' id='" + PANEL_ID + "-detail-search' value='" + escapeHtml(state.detailFilters.keyword) + "' placeholder='주문번호, 송장번호, 차수, 판매처, 메모'></label>",
      "<label class='tm-field'><span>상태</span><select id='" + PANEL_ID + "-detail-status'>",
      "<option value='all'" + (state.detailFilters.status === "all" ? " selected" : "") + ">전체</option>",
      "<option value='scanned'" + (state.detailFilters.status === "scanned" ? " selected" : "") + ">스캔됨</option>",
      "<option value='pending'" + (state.detailFilters.status === "pending" ? " selected" : "") + ">미스캔</option>",
      "</select></label>",
      "<label class='tm-field'><span>로컬 이력</span><select id='" + PANEL_ID + "-detail-history'>",
      "<option value='all'" + (state.detailFilters.historyState === "all" ? " selected" : "") + ">전체</option>",
      "<option value='history'" + (state.detailFilters.historyState === "history" ? " selected" : "") + ">이력 있음</option>",
      "<option value='no-history'" + (state.detailFilters.historyState === "no-history" ? " selected" : "") + ">이력 없음</option>",
      "</select></label>",
    ].join("");

    if (!detailRows.length) {
      state.elements.modalContent.innerHTML = "<div class='tm-modal-empty'>조건에 맞는 데이터가 없습니다.</div>";
      return;
    }

    state.elements.modalContent.innerHTML = [
      "<div class='tm-detail-summary'>총 " + detailRows.length + "건 / 미스캔 " + pendingCount + "건 / 스캔됨 " + (detailRows.length - pendingCount) + "건</div>",
      "<div class='tm-detail-table-wrap'>",
      "<table class='tm-detail-table'><thead><tr>",
      "<th style='width:74px'>상태</th>",
      "<th style='width:120px'>주문번호</th>",
      "<th style='width:120px'>송장번호</th>",
      "<th style='width:92px'>날짜</th>",
      "<th style='width:58px'>차수</th>",
      "<th style='width:138px'>판매처</th>",
      "<th>메모</th>",
      "<th style='width:126px'>이전 로컬이력</th>",
      "<th style='width:132px'>최근기록</th>",
      "</tr></thead><tbody>",
      detailRows.map((row) => [
        "<tr class='" + (row.scanned ? "tm-detail-done" : "tm-detail-pending") + "'>",
        "<td><span class='tm-modal-badge " + (row.scanned ? "tm-done" : "tm-pending") + "'>" + (row.scanned ? "스캔됨" : "미스캔") + "</span></td>",
        "<td>" + escapeHtml(row.orderNumber || "-") + "</td>",
        "<td>" + escapeHtml(row.invoiceNumber || "-") + "</td>",
        "<td>" + escapeHtml(formatCompactDate(row.ivmstrDate || "-")) + "</td>",
        "<td>" + escapeHtml(row.ivmstrIvno ? row.ivmstrIvno + "차" : "-") + "</td>",
        "<td>" + escapeHtml(row.siteName || "-") + "</td>",
        "<td title='" + escapeHtml(row.memo || "-") + "'>" + escapeHtml(row.memo || "-") + "</td>",
        "<td>" + (row.hasLocalHistory
          ? "<span class='tm-modal-badge tm-history'>있음</span><span class='tm-meta-text'>" + escapeHtml(row.lastLocalHistoryAt || "") + "</span>"
          : "-") + "</td>",
        "<td>" + escapeHtml(row.lastSessionAt || "-") + "</td>",
        "</tr>",
      ].join("")).join(""),
      "</tbody></table>",
      "</div>",
    ].join("");
  }
  function renderHistoryModal(state) {
    const rows = buildHistoryDisplayRows(searchHistoryEntries(state.localHistoryEntries, state.historyFilters));

    state.elements.modalHead.innerHTML = buildModalHeader(
      "이전 로컬 기록",
      "최대 2주 동안 보관된 성공/불일치 기록"
    );
    state.elements.modalSummary.innerHTML = [
      "<div class='tm-selection-card'>",
      "<div><strong>총 기록</strong><span>" + state.localHistoryEntries.length + "건</span></div>",
      "<div><strong>성공</strong><span>" + state.localHistoryEntries.filter((entry) => entry.status === "success").length + "건</span></div>",
      "<div><strong>불일치</strong><span>" + state.localHistoryEntries.filter((entry) => entry.status === "mismatch").length + "건</span></div>",
      "</div>",
    ].join("");
    state.elements.modalControls.innerHTML = [
      "<label class='tm-field'><span>기간</span><select id='" + PANEL_ID + "-history-days'>",
      "<option value='3'" + (String(state.historyFilters.days) === "3" ? " selected" : "") + ">3일</option>",
      "<option value='7'" + (String(state.historyFilters.days) === "7" ? " selected" : "") + ">7일</option>",
      "<option value='14'" + (String(state.historyFilters.days) === "14" ? " selected" : "") + ">14일</option>",
      "</select></label>",
      "<label class='tm-field'><span>상태</span><select id='" + PANEL_ID + "-history-status'>",
      "<option value='all'" + (state.historyFilters.status === "all" ? " selected" : "") + ">전체</option>",
      "<option value='success'" + (state.historyFilters.status === "success" ? " selected" : "") + ">성공</option>",
      "<option value='mismatch'" + (state.historyFilters.status === "mismatch" ? " selected" : "") + ">불일치</option>",
      "</select></label>",
      "<label class='tm-field'><span>검색</span><input type='text' id='" + PANEL_ID + "-history-keyword' value='" + escapeHtml(state.historyFilters.keyword) + "' placeholder='입력값, 차수, 판매처, 메모'></label>",
    ].join("");

    if (!rows.length) {
      state.elements.modalContent.innerHTML = "<div class='tm-modal-empty'>조건에 맞는 로컬 기록이 없습니다.</div>";
      return;
    }

    state.elements.modalContent.innerHTML = [
      "<div class='tm-history-table-wrap'>",
      "<table class='tm-history-table'><thead><tr>",
      "<th style='width:70px'>상태</th>",
      "<th style='width:72px'>구분</th>",
      "<th style='width:120px'>입력값</th>",
      "<th style='width:138px'>기록시각</th>",
      "<th style='width:104px'>날짜</th>",
      "<th style='width:88px'>차수</th>",
      "<th style='width:138px'>판매처</th>",
      "<th>메모</th>",
      "<th style='width:66px'>매칭</th>",
      "</tr></thead><tbody>",
      rows.map((entry) => [
        "<tr>",
        "<td><span class='tm-modal-badge " + escapeHtml(entry.statusClass) + "'>" + escapeHtml(entry.statusLabel) + "</span></td>",
        "<td>" + escapeHtml(entry.modeLabel) + "</td>",
        "<td>" + escapeHtml(entry.value) + "</td>",
        "<td>" + escapeHtml(entry.timeLabel) + "</td>",
        "<td>" + escapeHtml(entry.dateSummary) + "</td>",
        "<td>" + escapeHtml(entry.ivnoSummary) + "</td>",
        "<td>" + escapeHtml(entry.siteSummary) + "</td>",
        "<td title='" + escapeHtml(entry.memoSummary) + "'>" + escapeHtml(entry.memoSummary) + "</td>",
        "<td>" + escapeHtml(String(entry.matchedCount)) + "</td>",
        "</tr>",
      ].join("")).join(""),
      "</tbody></table>",
      "</div>",
    ].join("");
  }
  function renderModal(state) {
    const open = !!state.modalType;
    state.elements.modalBackdrop.className = open ? "tm-open" : "";
    if (!open) {
      state.elements.modalHead.innerHTML = "";
      state.elements.modalSummary.innerHTML = "";
      state.elements.modalControls.innerHTML = "";
      state.elements.modalContent.innerHTML = "";
      return;
    }

    if (state.modalType === "detail") renderDetailModal(state);
    else renderHistoryModal(state);
  }
  function render(state) {
    if (!state.elements) return;

    const mode = getCurrentMode(state.doc);
    const aggregateCounts = getAggregateCounts(state.aggregate);
    const expanded = shouldShowDrawer(state.filterModeEnabled, state.drawerOpen, state.listLoading, state.pendingDetailIds.size);
    const status = buildStatus(state);

    state.elements.dateInput.value = state.queryDate;
    state.elements.controls.hidden = !state.filterModeEnabled;
    state.elements.drawerRow.hidden = !expanded;
    state.elements.toggleButton.disabled = !state.filterModeEnabled;
    state.elements.toggleButton.textContent = expanded ? "차수목록 닫기" : "차수목록 열기";
    state.elements.modeToggleButton.className = "tm-mode-toggle " + (state.filterModeEnabled ? "tm-mode-on" : "tm-mode-off");
    state.elements.modeToggleButton.textContent = state.filterModeEnabled ? "필터링모드 ON" : "필터링모드 OFF";
    state.elements.modeToggleButton.setAttribute("aria-pressed", state.filterModeEnabled ? "true" : "false");
    state.elements.toggleButton.setAttribute("aria-pressed", expanded ? "true" : "false");
    state.elements.modeText.textContent = state.filterModeEnabled
      ? ("게이트 ON: 선택 차수의 " + getModeLabel(mode) + "만 통과")
      : "게이트 OFF: 원래 페이지 스캔";
    state.elements.compactStatus.textContent = state.filterModeEnabled
      ? (buildSelectedSummaryText(getSelectedRows(state)) + " / 데이터 " + aggregateCounts.total + "건")
      : "일반 스캔 모드";
    state.elements.clearButton.disabled = !state.selectedRowIds.length && !state.pendingDetailIds.size;
    state.elements.refreshButton.disabled = state.listLoading || state.pendingDetailIds.size > 0;
    state.elements.dateInput.disabled = state.listLoading || state.pendingDetailIds.size > 0;
    state.elements.dataButton.disabled = aggregateCounts.total === 0;
    state.elements.dataButton.textContent = "데이터 " + aggregateCounts.total + "건";
    state.elements.status.className = status.className;
    state.elements.status.textContent = status.text;

    renderRows(state);
    renderSelectionLine(state);
    renderSelectedList(state);
    renderSummary(state);
    renderModal(state);
  }
  function installPageBridge(doc) {
    const script = doc.createElement("script");
    script.textContent = buildPageBridgeSource({
      beforeEventName: BEFORE_EVENT_NAME,
      afterEventName: AFTER_EVENT_NAME,
      inputId: "ordlist_dno",
      bridgeAttribute: BRIDGE_ATTRIBUTE,
      retryLimit: BRIDGE_RETRY_LIMIT,
    });
    (doc.head || doc.documentElement).appendChild(script);
    script.remove();
  }
  function watchBridgeStatus(state) {
    let attempts = 0;
    function check() {
      const status = state.doc.documentElement.getAttribute(BRIDGE_ATTRIBUTE);
      if (status === "ready") return;
      if (status === "failed") {
        state.detailError = "기존 KeyDown 함수를 페이지 컨텍스트에서 연결하지 못했습니다.";
        render(state);
        return;
      }
      attempts += 1;
      if (attempts < BRIDGE_RETRY_LIMIT) root.setTimeout(check, 150);
    }
    check();
  }
  function handleBeforeScan(state, event) {
    if (!state.filterModeEnabled) return;
    if (!state.selectedRowIds.length) {
      state.detailError = "";
      state.statusText = "차수를 선택하세요. 필터링모드 ON 상태입니다.";
      render(state);
      focusScanInput(state);
      event.preventDefault();
      return;
    }
    if (state.pendingDetailIds.size || !state.aggregate || !state.aggregate.items.length) {
      state.detailError = "선택한 차수 데이터를 아직 불러오는 중입니다.";
      render(state);
      focusScanInput(state);
      event.preventDefault();
      return;
    }

    const mode = safeTrim(event.detail && event.detail.mode) || getCurrentMode(state.doc);
    const value = safeTrim(event.detail && event.detail.value);
    const gate = evaluateScanGate(state.aggregate, mode, value);

    if (!gate.allowed) {
      state.detailError = "";
      state.statusText = "선택 차수 데이터에 없는 " + getModeLabel(mode) + "입니다." + (value ? " " + value : "");
      pushRecentMismatch(state, mode, value);
      recordHistory(state, "mismatch", mode, value, []);
      render(state);
      state.elements.input.value = "";
      focusScanInput(state);
      event.preventDefault();
    }
  }
  function handleAfterScan(state, event) {
    if (!state.filterModeEnabled || !state.selectedRowIds.length || !state.aggregate) return;

    const mode = safeTrim(event.detail && event.detail.mode) || getCurrentMode(state.doc);
    const value = safeTrim(event.detail && event.detail.value);
    const gate = evaluateScanGate(state.aggregate, mode, value);
    if (!gate.allowed) return;

    const matchedItemIds = markProcessedAcrossSelections(state, mode, gate.key);
    recordHistory(state, "success", mode, value, matchedItemIds);
    state.detailError = "";
    state.statusText = "선택 차수 데이터와 일치해 기존 출력 흐름으로 전달했습니다.";
    render(state);
  }
  function attachEvents(state) {
    state.elements.modeToggleButton.addEventListener("click", async function () {
      if (state.filterModeEnabled) {
        disableFilterModeState(state);
        render(state);
        focusScanInput(state);
        return;
      }

      state.filterModeEnabled = true;
      state.drawerOpen = true;
      state.statusText = "필터링모드 ON. 차수를 선택하세요.";
      render(state);
      focusScanInput(state);
      if (!state.rows.length) await refreshList(state, { keepSelection: false });
    });
    state.elements.toggleButton.addEventListener("click", function () {
      if (!state.filterModeEnabled) return;
      state.drawerOpen = !state.drawerOpen;
      render(state);
      focusScanInput(state);
    });
    state.elements.refreshButton.addEventListener("click", function () {
      state.queryDate = state.elements.dateInput.value || todayString();
      refreshList(state, { keepSelection: false });
    });
    state.elements.clearButton.addEventListener("click", function () {
      clearSelections(state);
      focusScanInput(state);
    });
    state.elements.dateInput.addEventListener("change", function () {
      state.queryDate = state.elements.dateInput.value || todayString();
      refreshList(state, { keepSelection: false });
    });
    state.elements.dataButton.addEventListener("click", function () {
      if (state.aggregate && state.aggregate.items.length) openModal(state, "detail");
    });
    state.elements.historyButton.addEventListener("click", function () {
      openModal(state, "history");
    });
    state.elements.selectedToggleButton.addEventListener("click", function () {
      state.selectedListOpen = !state.selectedListOpen;
      render(state);
    });
    state.doc.addEventListener(BEFORE_EVENT_NAME, (event) => handleBeforeScan(state, event));
    state.doc.addEventListener(AFTER_EVENT_NAME, (event) => handleAfterScan(state, event));
    Array.prototype.forEach.call(state.doc.querySelectorAll("input[name='SEARCH_TYPE']"), function (radio) {
      radio.addEventListener("change", function () {
        state.statusText = "현재 검색구분은 " + getModeLabel(getCurrentMode(state.doc)) + "입니다.";
        render(state);
        focusScanInput(state);
      });
    });
    state.elements.rowsBody.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-row-id]");
      if (!button || state.listLoading) return;
      toggleSelection(state, button.getAttribute("data-row-id"));
    });
    state.elements.selectedList.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-selected-row-id]");
      if (!button) return;
      toggleSelection(state, button.getAttribute("data-selected-row-id"));
    });
    state.elements.modalBackdrop.addEventListener("click", function (event) {
      if (event.target === state.elements.modalBackdrop) closeModal(state);
    });
    state.elements.modalBackdrop.addEventListener("click", function (event) {
      const target = event.target;
      if (!target || !target.id) return;
      if (target.id === PANEL_ID + "-modal-close") closeModal(state);
    });
    state.elements.modalBackdrop.addEventListener("input", function (event) {
      const target = event.target;
      if (!target || !target.id) return;
      if (target.id === PANEL_ID + "-detail-search") state.detailFilters.keyword = target.value;
      if (target.id === PANEL_ID + "-history-keyword") state.historyFilters.keyword = target.value;
      render(state);
    });
    state.elements.modalBackdrop.addEventListener("change", function (event) {
      const target = event.target;
      if (!target || !target.id) return;
      if (target.id === PANEL_ID + "-detail-status") state.detailFilters.status = target.value;
      if (target.id === PANEL_ID + "-detail-history") state.detailFilters.historyState = target.value;
      if (target.id === PANEL_ID + "-history-status") state.historyFilters.status = target.value;
      if (target.id === PANEL_ID + "-history-days") state.historyFilters.days = target.value;
      render(state);
    });
    state.doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.modalType) closeModal(state);
    });
  }
  function shouldRun(win) {
    return PAGE_PATTERN.test(String(win.location.href || ""));
  }
  async function boot(win) {
    const input = await waitForElement("#ordlist_dno", 40, 150);
    if (!input) return;

    const doc = win.document;
    applyStyles(doc);

    const storage = win.localStorage;
    const localHistoryEntries = readHistory(storage);
    const state = {
      doc,
      storage,
      queryDate: todayString(),
      filterModeEnabled: false,
      drawerOpen: false,
      listLoading: false,
      listError: "",
      detailError: "",
      statusText: "필터링모드 OFF: 원래 페이지 스캔 모드",
      rows: [],
      selectedRowIds: [],
      detailByRowId: {},
      pendingDetailIds: new Set(),
      aggregate: buildAggregateScanData([], {}),
      recentMismatches: [],
      localHistoryEntries,
      baselineHistoryEntries: pruneHistoryEntries(localHistoryEntries),
      sessionHistoryEntries: [],
      modalType: "",
      selectedListOpen: false,
      detailFilters: { keyword: "", status: "all", historyState: "all" },
      historyFilters: { keyword: "", status: "all", days: String(HISTORY_KEEP_DAYS) },
      elements: createUi(doc),
    };

    state.elements.dateInput.value = state.queryDate;
    attachEvents(state);
    installPageBridge(doc);
    watchBridgeStatus(state);
    render(state);
    focusScanInput(state);
  }
  function start(win) {
    if (!shouldRun(win) || win.__tmSite3217Started) return;
    win.__tmSite3217Started = true;

    if (win.document.readyState === "loading") {
      win.document.addEventListener("DOMContentLoaded", function () {
        boot(win);
      }, { once: true });
    } else {
      boot(win);
    }
  }

  function run(context) {
    const win = context && context.window ? context.window : root;
    start(win);
  }

  return {
    id: "site3217",
    version: "0.1.0",
    matches: ["https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"],
    AFTER_EVENT_NAME,
    BEFORE_EVENT_NAME,
    BRIDGE_ATTRIBUTE,
    HISTORY_KEEP_DAYS,
    HISTORY_STORAGE_KEY,
    attachSelectionMeta,
    buildAggregateScanData,
    buildDetailRows,
    buildHistoryDisplayRows,
    buildListRequestParams,
    buildPageBridgeSource,
    buildSelectedSummaryText,
    compactDate,
    disableFilterModeState,
    evaluateScanGate,
    extractScanTargets,
    filterDetailRows,
    formatCompactDate,
    formatDateTime,
    getAggregateCounts,
    getModeCount,
    getModeLabel,
    isSessionExpiredResponse,
    markProcessed,
    pruneHistoryEntries,
    resetSessionHistoryState,
    searchHistoryEntries,
    shouldShowDrawer,
    shouldShowSelectedList,
    sortDetailRows,
    shiftYears,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
