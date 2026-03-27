module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "pattern-analyzer";
  const MODULE_NAME = "패턴분석기";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const LEFTOVER_PATTERN_ID = 999999;
  const NAV_SELECTOR = ".nav.navbar-nav.navbar-right";
  const NAV_BUTTON_ID = "tm-pattern-analyzer-nav-button";
  const POPUP_NAME = "tm-pattern-analyzer-window";
  const POPUP_FEATURES = "width=1400,height=860,resizable=yes,scrollbars=yes";
  const NAV_RETRY_LIMIT = 30;
  const NAV_RETRY_DELAY_MS = 500;
  const PATTERN_FILTER_DEBOUNCE_MS = 300;
  const BATCH_ENDPOINT = "/site/site320main_jdata";
  const ORDER_ENDPOINT = "/site/site210main_jdata";
  const SHIPPING_ENDPOINT = "/site/site413save";
  const SHIPPING_CANCEL_ENDPOINT = "/site/site410save";
  const SESSION_EXPIRED_MARKERS = ["자동 로그아웃 되었습니다", "/home/docs/login.html", "세션종료"];
  const REMOVE_MENU_LABELS = ["알림", "작업상태", "판매처접속", "메모", "발송대기", "문자메세지"];

  function SessionExpiredError(message) {
    this.name = "SessionExpiredError";
    this.message = message || "세션이 종료되었습니다.";
    if (Error.captureStackTrace) Error.captureStackTrace(this, SessionExpiredError);
  }
  SessionExpiredError.prototype = Object.create(Error.prototype);
  SessionExpiredError.prototype.constructor = SessionExpiredError;

  function safeTrim(value) {
    return String(value == null ? "" : value).trim();
  }

  function getModuleUi(win) {
    const scope = win || root;
    const shared = scope && scope.__tmModuleUi;
    if (shared && typeof shared.buildModuleUiCss === "function") return shared;
    return {
      buildModuleUiCss() { return ""; },
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uniqueValues(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  }

  function compactDate(value) {
    return safeTrim(value).replace(/-/g, "");
  }

  function formatCompactDate(value) {
    const compact = compactDate(value);
    if (!/^\d{8}$/.test(compact)) return safeTrim(value);
    return [compact.slice(0, 4), compact.slice(4, 6), compact.slice(6, 8)].join("-");
  }

  function addDays(dateString, days) {
    const date = new Date(dateString + "T00:00:00");
    date.setDate(date.getDate() + days);
    return formatDate(date);
  }

  function getKoreaDateString() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    return formatDate(new Date(utc + (9 * 60 * 60 * 1000)));
  }

  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      if (params[key] != null) search.set(key, String(params[key]));
    });
    return search.toString();
  }

  function isSessionExpiredText(text) {
    const body = safeTrim(text);
    return SESSION_EXPIRED_MARKERS.some((marker) => body.indexOf(marker) !== -1);
  }

  function getInvoiceNumber(order) {
    return safeTrim(order && (order.ordlist_dno_ori || order.ordlist_dno));
  }

  function normalizePatternItem(order) {
    return {
      productName: safeTrim(order.basic_name),
      managementName: safeTrim(order.basic_nicn),
      optionName: safeTrim(order.boptcode_name),
      quantity: parseInt(order.ordlist_qty, 10) || 0,
      invoiceNumber: getInvoiceNumber(order),
      batchNumber: safeTrim(order.ordlist_ivno),
      siteName: safeTrim(order.site_name),
      shippingStatus: safeTrim(order.ordlist_fnsh),
      orderSequence: parseInt(order.ordlist_ivnum, 10) || 0,
    };
  }

  function sortPatternItems(items) {
    return (items || []).slice().sort((left, right) => {
      if (left.productName !== right.productName) return left.productName.localeCompare(right.productName);
      if (left.managementName !== right.managementName) return left.managementName.localeCompare(right.managementName);
      if (left.optionName !== right.optionName) return left.optionName.localeCompare(right.optionName);
      return left.quantity - right.quantity;
    });
  }

  function buildPatternKey(items) {
    return sortPatternItems(items).map((item) => {
      return [item.productName, item.managementName, item.optionName, item.quantity].join("|");
    }).join("||");
  }

  function analyzeOrderPatterns(orders) {
    const ordersByInvoice = {};
    const invoiceStatus = {};
    const invoiceSequence = {};

    (orders || []).forEach((order) => {
      const invoiceNumber = getInvoiceNumber(order);
      if (!invoiceNumber) return;
      if (!ordersByInvoice[invoiceNumber]) {
        ordersByInvoice[invoiceNumber] = [];
        invoiceStatus[invoiceNumber] = safeTrim(order.ordlist_fnsh);
        invoiceSequence[invoiceNumber] = parseInt(order.ordlist_ivnum, 10) || 0;
      }
      ordersByInvoice[invoiceNumber].push(normalizePatternItem(order));
    });

    const patternsByKey = {};
    let patternId = 1;

    Object.keys(ordersByInvoice).forEach((invoiceNumber) => {
      const items = sortPatternItems(ordersByInvoice[invoiceNumber]);
      const patternKey = buildPatternKey(items);
      const firstItem = items[0] || {};
      const status = invoiceStatus[invoiceNumber];

      if (!patternsByKey[patternKey]) {
        patternsByKey[patternKey] = {
          id: patternId++,
          items,
          count: 0,
          invoices: [],
          orderSequences: [],
          batchNumbers: [],
          siteNames: [],
          completedCount: 0,
          pendingCount: 0,
        };
      }

      const pattern = patternsByKey[patternKey];
      pattern.count += 1;
      pattern.invoices.push(invoiceNumber);
      pattern.orderSequences.push(invoiceSequence[invoiceNumber]);
      if (firstItem.batchNumber && pattern.batchNumbers.indexOf(firstItem.batchNumber) === -1) pattern.batchNumbers.push(firstItem.batchNumber);
      if (firstItem.siteName && pattern.siteNames.indexOf(firstItem.siteName) === -1) pattern.siteNames.push(firstItem.siteName);
      if (status === "완료") pattern.completedCount += 1;
      else if (status === "발송대기") pattern.pendingCount += 1;
    });

    return Object.values(patternsByKey).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return (left.orderSequences[0] || 0) - (right.orderSequences[0] || 0);
    });
  }

  function filterPatterns(patterns, options) {
    const settings = options || {};
    const includeKeywords = (settings.includeKeywords || []).filter(Boolean).map((value) => safeTrim(value).toLowerCase());
    const excludeKeywords = (settings.excludeKeywords || []).filter(Boolean).map((value) => safeTrim(value).toLowerCase());
    const minRepetition = Math.max(parseInt(settings.minRepetition, 10) || 1, 1);

    const sourcePatterns = (patterns || []).slice();
    let filteredPatterns = sourcePatterns.slice();
    const leftoverPatterns = [];
    let leftoverInvoices = [];
    let leftoverOrderSequences = [];

    if (includeKeywords.length || excludeKeywords.length) {
      filteredPatterns = filteredPatterns.filter((pattern) => {
        const text = pattern.items.map((item) => [item.productName, item.managementName, item.optionName].join(" ")).join(" ").toLowerCase();
        const includeMatch = !includeKeywords.length || includeKeywords.some((keyword) => text.indexOf(keyword) !== -1);
        const excludeMatch = !excludeKeywords.length || excludeKeywords.every((keyword) => text.indexOf(keyword) === -1);
        return includeMatch && excludeMatch;
      });
    }

    if (minRepetition > 1) {
      filteredPatterns.forEach((pattern) => {
        if (pattern.count < minRepetition) {
          leftoverPatterns.push(pattern);
          leftoverInvoices = leftoverInvoices.concat(pattern.invoices);
          leftoverOrderSequences = leftoverOrderSequences.concat(pattern.orderSequences);
        }
      });
      filteredPatterns = filteredPatterns.filter((pattern) => pattern.count >= minRepetition);
    }

    const allBatchNumbers = new Set();
    const allSiteNames = new Set();
    let completedCount = 0;
    let pendingCount = 0;
    let totalInvoiceCount = 0;

    sourcePatterns.forEach((pattern) => {
      pattern.batchNumbers.forEach((value) => allBatchNumbers.add(value));
      pattern.siteNames.forEach((value) => allSiteNames.add(value));
      completedCount += pattern.completedCount;
      pendingCount += pattern.pendingCount;
      totalInvoiceCount += pattern.invoices.length;
    });

    if (leftoverInvoices.length) {
      const leftoverCompletedCount = leftoverPatterns.reduce((sum, pattern) => sum + pattern.completedCount, 0);
      const leftoverPendingCount = leftoverPatterns.reduce((sum, pattern) => sum + pattern.pendingCount, 0);
      filteredPatterns.push({
        id: LEFTOVER_PATTERN_ID,
        items: [{ productName: "짜투리", managementName: "짜투리", optionName: "짜투리", quantity: 0 }],
        count: leftoverInvoices.length,
        invoices: leftoverInvoices,
        orderSequences: leftoverOrderSequences,
        batchNumbers: [],
        siteNames: [],
        completedCount: leftoverCompletedCount,
        pendingCount: leftoverPendingCount,
      });
    }

    return {
      patterns: filteredPatterns,
      leftoverCount: leftoverPatterns.length,
      stats: {
        totalPatternCount: sourcePatterns.length,
        totalInvoiceCount,
        regularPatternCount: filteredPatterns.filter((pattern) => pattern.id !== LEFTOVER_PATTERN_ID).length,
        leftoverPatternCount: leftoverPatterns.length,
        leftoverInvoiceCount: leftoverInvoices.length,
        regularInvoiceCount: filteredPatterns.filter((pattern) => pattern.id !== LEFTOVER_PATTERN_ID).reduce((sum, pattern) => sum + pattern.invoices.length, 0),
        batchNumbers: Array.from(allBatchNumbers).sort(),
        siteNames: Array.from(allSiteNames).sort(),
        completedCount,
        pendingCount,
      },
    };
  }

  function extractInvoiceNumbers(patterns, selectedPatternIds) {
    const selectedSet = new Set((selectedPatternIds || []).map((value) => String(value)));
    return (patterns || []).reduce((result, pattern) => {
      if (!selectedSet.has(String(pattern.id))) return result;
      return result.concat(pattern.invoices);
    }, []);
  }

  function formatInvoicesForCopy(invoices, separator) {
    return (invoices || []).join(separator || "\n");
  }

  function buildInvoicesCsv(invoices) {
    const body = (invoices || []).join("\n");
    return body ? "송장번호\n" + body + "\n" : "송장번호\n";
  }

  function calculateProgress(current, total, completed, failed) {
    const safeTotal = Math.max(Number(total) || 0, 0);
    const safeCurrent = Math.max(Number(current) || 0, 0);
    return {
      current: safeCurrent,
      total: safeTotal,
      completed: Math.max(Number(completed) || 0, 0),
      failed: Math.max(Number(failed) || 0, 0),
      percentage: safeTotal > 0 ? Math.round((safeCurrent / safeTotal) * 100) : 0,
    };
  }

  function formatSelectedFilterLabel(values) {
    const items = (values || []).map(safeTrim).filter(Boolean);
    return items.length ? items.join(", ") : "전체";
  }

  function resolvePrintableBatches(allBatches, batchNumbers) {
    const source = Array.isArray(allBatches) ? allBatches.slice() : [];
    const targets = new Set((batchNumbers || []).map(safeTrim).filter(Boolean));
    if (!targets.size) return source;
    return source.filter((batch) => targets.has(safeTrim(batch && batch.ivmstr_ivno)));
  }

  function getShippingModeTheme(isCancelMode) {
    return isCancelMode ? {
      title: "종합 출고취소 처리",
      completedLabel: "취소완료",
      failedLabel: "취소실패",
      badgeText: "출고취소 모드",
      badgeClass: "mode-badge cancel",
      progressBackground: "linear-gradient(180deg,rgba(159,64,61,.98) 0%,rgba(128,46,46,.98) 100%)",
    } : {
      title: "종합 출고 처리",
      completedLabel: "출고완료",
      failedLabel: "출고실패",
      badgeText: "출고 모드",
      badgeClass: "mode-badge ship",
      progressBackground: "linear-gradient(180deg,rgba(47,107,87,.98) 0%,rgba(35,87,70,.98) 100%)",
    };
  }

  function getPatternToneClass(pattern, index) {
    if (pattern && pattern.id === LEFTOVER_PATTERN_ID) return "tone-leftover";
    return index % 2 === 0 ? "tone-even" : "tone-odd";
  }

  function buildPatternPrintDocumentHtml(options) {
    const settings = options || {};
    const filters = settings.filters || {};
    const batches = Array.isArray(settings.batches) ? settings.batches : [];
    const patterns = Array.isArray(settings.patterns) ? settings.patterns : [];
    const stats = settings.stats || {};
    const regularInvoiceCount = Math.max(parseInt(stats.regularInvoiceCount, 10) || 0, 0);
    const leftoverInvoiceCount = Math.max(parseInt(stats.leftoverInvoiceCount, 10) || 0, 0);
    const totalInvoiceCount = Math.max(parseInt(stats.totalInvoiceCount, 10) || 0, regularInvoiceCount + leftoverInvoiceCount);
    const summaryItems = [
      { label: "총건수", value: totalInvoiceCount + "건" },
      { label: "패턴건수", value: regularInvoiceCount + "건" },
      { label: "필터 제외 짜투리", value: leftoverInvoiceCount + "건" },
    ];
    const metaItems = [
      settings.dateLabel ? "기준일 " + escapeHtml(settings.dateLabel) : "",
      settings.siteLabel ? "판매처 " + escapeHtml(settings.siteLabel) : "",
      settings.exprLabel ? "택배사 " + escapeHtml(settings.exprLabel) : "",
      (filters.includeKeywords || []).length ? "포함 " + escapeHtml((filters.includeKeywords || []).join(", ")) : "",
      (filters.excludeKeywords || []).length ? "제외 " + escapeHtml((filters.excludeKeywords || []).join(", ")) : "",
      filters.minRepetition ? "최소반복 " + escapeHtml(String(filters.minRepetition)) : "",
    ].filter(Boolean);
    const batchRows = batches.length ? batches.map((batch, index) => [
      "<li class='batch-item " + (index % 2 === 0 ? "tone-even" : "tone-odd") + "'>",
      "<span class='batch-no'>" + escapeHtml(safeTrim(batch.ivmstr_ivno) ? safeTrim(batch.ivmstr_ivno) + "차" : "-") + "</span>",
      "<span class='batch-site'>" + escapeHtml(batch.site_name || "-") + "</span>",
      "<span class='batch-expr'>" + escapeHtml(batch.expr_name || "-") + "</span>",
      "<span class='batch-count'>" + escapeHtml(String(parseInt(batch.ivcnt, 10) || 0)) + "건</span>",
      "<span class='batch-memo'>" + escapeHtml(batch.ivmstr_memo || "-") + "</span>",
      "</li>",
    ].join("")).join("") : "<li class='batch-item'><span class='batch-memo'>출력할 차수 정보가 없습니다.</span></li>";
    const patternRows = patterns.length ? patterns.map((pattern, index) => {
      const toneClass = getPatternToneClass(pattern, index);
      return (pattern.items || []).map((item, itemIndex) => [
        "<tr class='" + toneClass + "'>",
        itemIndex === 0 ? "<td rowspan='" + pattern.items.length + "'>" + (index + 1) + "</td>" : "",
        "<td class='left product-cell'>" + escapeHtml(item.productName || "-") + "</td>",
        "<td class='left management-cell'>" + escapeHtml(item.managementName || "-") + "</td>",
        "<td>" + escapeHtml(item.optionName || "-") + "</td>",
        "<td>" + escapeHtml(String(item.quantity || 0)) + "</td>",
        itemIndex === 0 ? "<td rowspan='" + pattern.items.length + "'>" + escapeHtml(String(pattern.count || 0)) + "</td>" : "",
        "</tr>",
      ].join("")).join("");
    }).join("") : "<tr><td colspan='6'>출력할 패턴 정보가 없습니다.</td></tr>";

    return [
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>" + MODULE_NAME + " 인쇄</title><style>",
      "@page{size:A4 portrait;margin:6mm 5mm 7mm}",
      "body{margin:0;font-family:'Public Sans','Noto Sans KR','Segoe UI','Malgun Gothic',sans-serif;color:#1f2728;background:#fff;font-size:10.5px;line-height:1.3}",
      ".sheet{display:grid;gap:10px}.summary-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.summary-chip{display:grid;gap:1px;padding:6px 8px;border:1px solid #d8dfdf;border-radius:10px;background:#f7f8f8}.summary-chip .label{font-size:9px;color:#546064;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.summary-chip .value{font-size:14px;line-height:1.05;font-weight:800;color:#1f2728}.meta-strip{display:flex;flex-wrap:wrap;gap:4px 6px}.meta-chip{display:inline-flex;align-items:center;padding:2px 7px;border:1px solid #d8dfdf;border-radius:999px;background:#f7f8f8;color:#455255;font-size:10px}.section{display:grid;gap:5px}.section h2{margin:0;font-size:12px;letter-spacing:-.02em}.batch-list{list-style:none;margin:0;padding:0;border:1px solid #d7dfdf;border-radius:10px;overflow:hidden}.batch-item{display:grid;grid-template-columns:56px minmax(78px,1fr) minmax(78px,1fr) 48px minmax(0,2fr);gap:6px;align-items:center;padding:4px 6px;border-bottom:1px solid #e3e9e9}.batch-item:last-child{border-bottom:none}.batch-no,.batch-count{font-weight:700;color:#223033}.batch-memo{color:#4e5758;white-space:normal;word-break:break-word}.table{width:100%;border-collapse:collapse}.pattern-table{table-layout:auto}.table th,.table td{padding:4px 6px;border:1px solid #d8dfdf;font-size:10px;text-align:center;vertical-align:middle;line-height:1.25}.table th{background:#eef1f1;color:#495255;font-weight:800}.table td.left,.table th.left{text-align:left}.pattern-table .product-cell,.pattern-table .management-cell{word-break:break-word}.pattern-table .col-pattern{width:34px}.pattern-table .col-product{width:38%}.pattern-table .col-option{width:18%}.pattern-table .col-qty{width:44px}.pattern-table .col-repeat{width:48px}.tone-even td,.tone-even{background:#fbfcfc}.tone-odd td,.tone-odd{background:#eef2f2}.tone-leftover td,.tone-leftover{background:#fbefee}",
      "</style></head><body><div class='sheet'>",
      "<div class='summary-strip'>" + summaryItems.map((item) => "<div class='summary-chip'><span class='label'>" + escapeHtml(item.label) + "</span><span class='value'>" + escapeHtml(item.value) + "</span></div>").join("") + "</div>",
      metaItems.length ? "<div class='meta-strip'>" + metaItems.map((item) => "<span class='meta-chip'>" + item + "</span>").join("") + "</div>" : "",
      "<section class='section'><h2>차수 정보</h2><ul class='batch-list'>" + batchRows + "</ul></section>",
      "<section class='section'><h2>패턴 정보</h2><table class='table pattern-table'><thead><tr><th class='col-pattern'>패턴</th><th class='col-product left'>제품명</th><th class='left'>관리명</th><th class='col-option'>옵션명</th><th class='col-qty'>수량</th><th class='col-repeat'>반복수</th></tr></thead><tbody>" + patternRows + "</tbody></table></section>",
      "</div><script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},120);});window.addEventListener('afterprint',function(){window.close();});<\/script></body></html>",
    ].join("");
  }

  function evaluateShippingResponse(responseData, isCancelMode) {
    if (isCancelMode) {
      return safeTrim(responseData && responseData.sucess) === "true" && (parseInt(responseData && responseData.cnt, 10) || 0) > 0;
    }
    return safeTrim(responseData && responseData.fnsh) === "0";
  }

  function reduceShippingRunState(previousState, action) {
    const state = previousState || { token: "", status: "idle", totalCount: 0, completedCount: 0, failedCount: 0 };
    const nextAction = action || {};
    if (nextAction.type === "start") return { token: safeTrim(nextAction.token), status: "running", totalCount: Math.max(parseInt(nextAction.totalCount, 10) || 0, 0), completedCount: 0, failedCount: 0 };
    if (nextAction.type === "success") return Object.assign({}, state, { completedCount: state.completedCount + 1 });
    if (nextAction.type === "fail") return Object.assign({}, state, { failedCount: state.failedCount + 1 });
    if (nextAction.type === "stop-request") return state.status !== "running" ? state : Object.assign({}, state, { status: "stopping" });
    if (nextAction.type === "finish") {
      const processed = state.completedCount + state.failedCount;
      return Object.assign({}, state, { status: state.status === "stopping" && processed < state.totalCount ? "stopped" : "completed" });
    }
    if (nextAction.type === "reset") return { token: "", status: "idle", totalCount: 0, completedCount: 0, failedCount: 0 };
    return state;
  }

  function buildBatchUrl(dateCompactValue) {
    const formattedDate = formatCompactDate(dateCompactValue);
    const days90Before = addDays(formattedDate, -90);
    return BATCH_ENDPOINT + "?" + toQueryString({
      IVMSTR_DATE: formattedDate,
      ORDLIST_DATE1: days90Before,
      ORDLIST_DATE2: formattedDate,
      IVMSTR_VIEWYN: "Y",
      _search: "false",
      rows: "1000",
      page: "1",
      sidx: "ivmstr_seq",
      sord: "asc",
    });
  }

  function buildOrderUrl(dateCompactValue) {
    const formattedDate = formatCompactDate(dateCompactValue);
    return ORDER_ENDPOINT + "?" + toQueryString({
      site_code: "",
      basic_prov: "",
      basic_prov_name: "",
      VIEW_TYPE: "2",
      ORDLIST_CUST: "",
      ORDLIST_BRAND: "",
      ORDLIST_IVLEVEL: "",
      ORDLIST_NO1: "",
      ORDLIST_OMAN: "",
      ORDLIST_RMAN: "",
      ORDLIST_TEL: "",
      ORDLIST_FNSH: "",
      ORDLIST_IVTRUE: "Y",
      ORDLIST_GBN: "",
      ORDLIST_MIYN: "",
      DATE_GBN: "ord_ivdate",
      DATE1: formattedDate,
      DATE2: formattedDate,
      ORDLIST_UPTYPE: "",
      ORDLIST_NAME: "",
      ORDLIST_MAT: "",
      ORDLIST_DNO: "",
      ORDLIST_SEQ: "",
      ORDLIST_DOFC: "",
      GROUP_VIEW_TYPE: "1",
      ORDLIST_IVAFYN: "",
      BASIC_NAME_GBN: "",
      BASIC_NAME_VAL: "",
      BASIC_BRAND: "",
      ORDADD_REYN: "",
      ORDLIST_NAME_NOT: "",
      ORDLIST_OPT1_NOT: "",
      gridReload: "true",
      _search: "false",
      rows: "2000000",
      page: "1",
      sidx: "ordlist_code",
      sord: "asc",
    });
  }

  function createPopupHtml() {
    const sharedCss = getModuleUi(root).buildModuleUiCss();
    return [
      "<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>" + MODULE_NAME + "</title><style>",
      sharedCss,
      "html,body{margin:0;padding:0}body{padding:14px;box-sizing:border-box;background:#f0f1f0;color:var(--tm-text)}",
      ".shell{display:grid;gap:14px;max-width:1480px;margin:0 auto}.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end;padding:14px 16px;background:#ffffff;border:1px solid var(--tm-border);border-radius:16px}.hero-copy{display:grid;gap:6px}.hero h2{margin:0;font-size:24px;line-height:1.06;letter-spacing:-.04em;color:var(--tm-text)}.hero p{margin:0;color:#495255;font-size:13px;line-height:1.58;max-width:640px}.hero-meta{display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex-wrap:wrap}",
      ".card{margin:0;border:1px solid var(--tm-border);border-radius:16px;background:var(--tm-surface);box-shadow:none}.controls,.filters,.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 14px}.controls{justify-content:space-between}.controls-main{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;flex:1}.control-field,.filters>label{display:grid;gap:6px;color:#4f5758;font-weight:700}.control-field>span,.filters>label>span{display:block}.controls-main input[type='date'],.controls-main .multi-selected,.controls-extra .tm-ui-btn{height:36px;min-height:36px}.controls-extra{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch}.actions{justify-content:flex-end}.card.scrollable{overflow:auto}",
      ".tabs{display:inline-grid;grid-auto-flow:column;gap:6px;padding:5px;border:1px solid var(--tm-border);border-radius:999px;background:var(--tm-surface-alt);align-self:flex-start}.tab{height:36px;padding:0 14px;border:1px solid transparent;border-radius:999px;background:transparent;color:#4b5456;cursor:pointer;font-weight:800;font-size:13px;transition:background .18s ease,color .18s ease,border-color .18s ease,box-shadow .18s ease}.tab:hover{color:var(--tm-text)}.tab.active{background:var(--tm-surface);border-color:#cfd8da;color:#263032;box-shadow:inset 0 0 0 1px rgba(38,48,50,.04)}",
      ".content{display:none}.content.active{display:grid;gap:12px}.message{padding:12px 14px;border-radius:10px;margin-bottom:16px;font-weight:700;border:1px solid var(--tm-border);background:var(--tm-surface-alt)}.message.error{background:#fbefee;color:var(--tm-danger);border-color:#e2c3c1}.message.success{background:#edf5f1;color:var(--tm-success);border-color:#d1e2da}",
      ".info{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;background:var(--tm-surface-alt);border:1px solid var(--tm-border);color:#4f5758;font-size:12px;font-weight:700}.summary{display:none;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin:0;padding:0}",
      ".summary-item{background:var(--tm-surface-alt);border:1px solid var(--tm-border);border-radius:10px;padding:12px 14px}.summary-item .label{display:block;font-size:12px;color:#4f5758;margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em}.summary-item .value{font-size:18px;font-weight:800;color:var(--tm-text)}.tags{display:flex;gap:6px;flex-wrap:wrap}.tag{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:var(--tm-surface-alt);color:var(--tm-primary-strong);font-size:12px;border:1px solid var(--tm-border)}",
      ".tm-ui-table th,.tm-ui-table td{text-align:center}.tm-ui-table td.left,.tm-ui-table th.left{text-align:left}tr.clickable{cursor:pointer}#pattern-table-body tr.tone-even td{background:#fafbfb}#pattern-table-body tr.tone-odd td{background:#edf2f2}#pattern-table-body tr.tone-leftover td{background:#fbefee!important}tfoot tr{background:var(--tm-surface-alt);font-weight:700}",
      ".badge{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700;margin:2px;border:1px solid var(--tm-border)}.badge.complete{background:#edf5f1;color:var(--tm-success);border-color:#d1e2da}.badge.pending{background:#f7f0e8;color:var(--tm-warning);border-color:#e3d4c0}",
      ".link{color:var(--tm-primary-strong);text-decoration:underline;cursor:pointer;font-weight:700}.multi{position:relative;min-width:220px}.multi-selected{height:36px;padding:0 12px;border:1px solid var(--tm-border);border-radius:10px;background:var(--tm-surface);display:flex;align-items:center;justify-content:space-between;cursor:pointer}.multi-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.multi-badge{display:inline-flex;align-items:center;background:var(--tm-surface-alt);border:1px solid var(--tm-border);border-radius:999px;padding:3px 8px;font-size:12px}.multi-badge-remove{margin-left:4px;cursor:pointer;font-weight:700}.multi-dropdown{display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:12px;box-shadow:var(--tm-shadow);z-index:10;max-height:260px;overflow:auto}.multi-dropdown.show{display:block}.multi-search{padding:8px;border-bottom:1px solid var(--tm-border);background:var(--tm-surface);position:sticky;top:0}.multi-search input{width:100%}.multi-option{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--tm-border);font-size:13px;color:var(--tm-text)}.multi-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:nowrap;padding:8px 10px;background:var(--tm-surface-alt);position:sticky;bottom:0}.multi-count{white-space:nowrap;font-size:12px;flex:0 0 auto}.multi-actions{display:flex;gap:6px;flex-wrap:nowrap;white-space:nowrap;flex:0 0 auto}.multi-action{height:28px;padding:0 8px;min-width:70px;border:1px solid var(--tm-border);background:var(--tm-surface);border-radius:8px;cursor:pointer;white-space:nowrap;flex:0 0 auto}",
      ".overlay{z-index:1000}.overlay[style*='display: flex'],.overlay[style*='display:flex']{display:flex!important}.shipping-modal{width:min(720px,92vw)}.invoice-modal{width:min(560px,92vw)}.close{border:none;background:none;font-size:22px;cursor:pointer;color:var(--tm-muted)}",
      ".stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.stat{background:var(--tm-surface-alt);border:1px solid var(--tm-border);border-radius:10px;padding:12px;text-align:center}.stat .label{font-size:12px;color:#4f5758;text-transform:uppercase;letter-spacing:.08em}.stat .value{font-size:18px;font-weight:800;color:var(--tm-text)}.stat .value.click{cursor:pointer;color:var(--tm-primary-strong)}.progress-wrap{display:grid;gap:8px}.progress-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.progress-label{font-size:12px;color:#4f5758;text-transform:uppercase;letter-spacing:.08em;font-weight:700}.mode-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid var(--tm-border);font-size:12px;font-weight:700;background:var(--tm-surface-alt);color:var(--tm-primary-strong)}.mode-badge.ship{background:#edf5f1;color:var(--tm-success);border-color:#d1e2da}.mode-badge.cancel{background:#fbefee;color:var(--tm-danger);border-color:#e2c3c1}.progress{height:14px;background:var(--tm-surface-alt);border-radius:999px;overflow:hidden;border:1px solid var(--tm-border)}.progress > div{height:100%;width:0;background:linear-gradient(180deg,rgba(47,107,87,.98) 0%,rgba(35,87,70,.98) 100%);transition:width .2s ease}.shipping-config{display:grid;gap:12px}.shipping-mode-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--tm-border);border-radius:12px;background:var(--tm-surface-alt)}.shipping-check{display:inline-flex;align-items:center;gap:8px;color:var(--tm-text);font-weight:700}.shipping-field{display:grid;gap:6px;color:#4f5758;font-weight:700}.shipping-stepper{display:flex;gap:8px;align-items:center}.log{max-height:220px;overflow:auto;padding:10px;border:1px solid var(--tm-border);border-radius:12px;background:var(--tm-surface-alt)}.log-item{padding:4px 0;border-bottom:1px solid rgba(45,52,53,.08);color:#4d5658}.log-item:last-child{border-bottom:none}.log-item.success{color:var(--tm-success)}.log-item.error{color:var(--tm-danger)}",
      ".list{max-height:260px;overflow:auto;border:1px solid var(--tm-border);border-radius:10px;margin-bottom:12px;background:var(--tm-surface)}.list-item{padding:8px 10px;border-bottom:1px solid var(--tm-border);font-family:Consolas,'Courier New',monospace;font-size:12px}.list-item:nth-child(odd){background:var(--tm-surface-alt)}.list-item:last-child{border-bottom:none}.textarea{width:100%;font-family:Consolas,'Courier New',monospace}.success{display:none;margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#edf5f1;color:var(--tm-success);font-weight:700;border:1px solid #d1e2da}",
      "#print-section{display:none}@media print{body{padding:0;background:#fff}.hero,.controls,.tabs,.filters,.actions,.overlay{display:none!important}#print-section{display:block!important}}@media (max-width:980px){body{padding:12px}.hero{grid-template-columns:1fr;align-items:flex-start}.hero-meta{justify-content:flex-start}.controls{flex-direction:column;align-items:flex-start}.controls-main,.controls-extra{width:100%}.control-field,.multi{width:100%}.tabs{gap:12px}}</style></head><body class='tm-ui-root tm-ui-popup' data-tm-density='normal'>",
      "<div class='shell'>",
      "<div class='hero'><div class='hero-copy'><span class='tm-ui-kicker'>패턴 작업</span><h2>" + MODULE_NAME + "</h2><p>차수 데이터를 묶어 반복 패턴과 종합 출고 대상을 빠르게 정리합니다.</p></div><div class='hero-meta'><span id='data-info' class='info tm-ui-badge'>데이터 정보: 없음</span></div></div><div id='message-root'></div>",
      "<div class='card controls tm-ui-card'><div class='controls-main'><label class='control-field' for='date-input'><span>출력일</span><input type='date' id='date-input'></label><div class='control-field'><span>판매처</span><div id='site-multiselect' class='multi'><div class='multi-selected'><span class='multi-text'>전체</span><span>▼</span></div><div class='multi-badges'></div></div></div><div class='control-field'><span>택배사</span><div id='expr-multiselect' class='multi'><div class='multi-selected'><span class='multi-text'>전체</span><span>▼</span></div><div class='multi-badges'></div></div></div></div><div class='controls-extra'><button id='search-button' class='tm-ui-btn tm-ui-btn--primary'>조회</button></div></div>",
      "<div class='tabs'><button id='batch-tab' class='tab active'>차수 목록</button><button id='pattern-tab' class='tab'>패턴 분석</button></div>",
      "<div id='batch-content' class='content active'><div class='card tm-ui-card scrollable'><table class='tm-ui-table'><thead><tr><th>차수</th><th>판매처</th><th>택배사</th><th>건수</th><th>배송상태</th><th>메모</th><th>패턴</th><th><input type='checkbox' id='select-all-batches'></th></tr></thead><tbody id='batch-table-body'><tr><td colspan='8'>데이터를 조회해주세요.</td></tr></tbody><tfoot id='batch-table-foot'></tfoot></table></div></div>",
      "<div id='pattern-content' class='content'><div class='card filters tm-ui-card'><label>포함검색어 <input type='text' id='include-input' placeholder='예: 김치, 사과'></label><label>제외검색어 <input type='text' id='exclude-input' placeholder='예: 김치, 사과'></label><label>최소반복수 <input type='number' id='min-rep-input' min='1' value='1' style='width:88px'></label><button id='print-pattern-button' class='tm-ui-btn tm-ui-btn--secondary gray'>인쇄</button></div><div id='pattern-summary' class='summary tm-ui-summary'></div><div class='card tm-ui-card scrollable'><table class='tm-ui-table'><thead><tr><th>순번</th><th>제품명</th><th>관리명</th><th>옵션명</th><th>수량</th><th>반복수</th><th>배송상태</th><th>송장번호</th><th><input type='checkbox' id='select-all-patterns'></th></tr></thead><tbody id='pattern-table-body'><tr><td colspan='9'>패턴 데이터가 없습니다.</td></tr></tbody><tfoot id='pattern-table-foot'></tfoot></table></div><div class='card actions tm-ui-card'><button id='show-invoices-button' class='tm-ui-btn tm-ui-btn--secondary secondary'>종합송장</button><button id='shipping-button' class='tm-ui-btn tm-ui-btn--success green'>종합출고</button></div></div>",
      "<div id='print-section'></div>",
      "<div id='shipping-modal' class='overlay tm-ui-overlay'><div class='modal shipping-modal tm-ui-modal'><div class='modal-head tm-ui-modal__head'><h3 id='shipping-title'>종합 출고 처리</h3><button id='close-shipping-modal' class='close'>&times;</button></div><div class='modal-body tm-ui-modal__body'><div class='stats'><div class='stat'><div class='label'>총 건수</div><div id='total-invoices' class='value'>0</div></div><div class='stat'><div class='label'>출고완료</div><div id='completed-invoices' class='value click'>0</div></div><div class='stat'><div class='label'>출고실패</div><div id='failed-invoices' class='value click'>0</div></div><div class='stat'><div class='label'>진행률</div><div id='progress-percentage' class='value'>0%</div></div></div><div class='progress-wrap'><div class='progress-meta'><span class='progress-label'>진행 상태</span><span id='shipping-mode-badge' class='mode-badge ship'>출고 모드</span></div><div class='progress'><div id='shipping-progress-bar'></div></div></div><div class='shipping-config'><div class='shipping-mode-row'><label class='shipping-check'><input type='checkbox' id='cancel-mode'> 출고취소 모드</label><span class='tm-ui-inline-note'>ON일 때 취소 기준으로 처리</span></div><label class='shipping-field' for='shipping-date'><span>출고날짜</span><input type='date' id='shipping-date' style='width:100%'></label><div class='shipping-field'><span>병렬 처리 개수</span><div class='shipping-stepper'><button id='decrease-parallel' class='tm-ui-btn tm-ui-btn--secondary secondary'>-</button><input type='number' id='parallel-count' min='1' max='10' value='2' style='width:64px;text-align:center'><button id='increase-parallel' class='tm-ui-btn tm-ui-btn--secondary secondary'>+</button><small>1~10 범위 내</small></div></div><div id='shipping-log' class='log tm-ui-log'></div></div></div><div class='modal-foot tm-ui-modal__foot'><button id='start-shipping-button' class='tm-ui-btn tm-ui-btn--success green'>작업시작</button><button id='stop-shipping-button' class='tm-ui-btn tm-ui-btn--danger danger' style='display:none'>작업중지</button><button id='close-shipping-button' class='tm-ui-btn tm-ui-btn--secondary secondary'>닫기</button></div></div></div>",
      "<div id='invoice-modal' class='overlay tm-ui-overlay'><div class='modal invoice-modal tm-ui-modal'><div class='modal-head tm-ui-modal__head'><h3 id='invoice-title'>송장번호 목록</h3><button id='close-invoice-modal' class='close'>&times;</button></div><div class='modal-body tm-ui-modal__body'><div style='margin-bottom:10px'>총 <span id='invoice-count'>0</span>개의 송장번호가 있습니다.</div><div id='invoice-copy-success' class='success'>클립보드에 복사되었습니다.</div><div id='invoice-list' class='list'></div><textarea id='invoice-textarea' class='textarea tm-ui-textarea' readonly></textarea><div style='display:flex;gap:8px;flex-wrap:wrap'><button id='copy-newline-button' class='tm-ui-btn tm-ui-btn--primary'>개행으로 복사</button><button id='copy-comma-button' class='tm-ui-btn tm-ui-btn--primary'>쉼표로 복사</button><button id='download-csv-button' class='tm-ui-btn tm-ui-btn--secondary secondary'>CSV 다운로드</button></div></div></div></div></div></body></html>",
    ].join("");
  }

  function createPopupState(pageWin, popupWin, pageState) {
    return {
      pageWin,
      popupWin,
      pageState,
      dataStore: { batches: [], orders: [], currentDate: "", lastFetchTime: 0, filteredBatches: null },
      selectedBatches: new Set(),
      basePatterns: [],
      renderedPatterns: [],
      lastPatternResult: null,
      currentInvoices: [],
      readAbortController: null,
      patternFilterTimer: null,
      shippingLogs: { completed: [], failed: [] },
      shippingRuntime: null,
    };
  }

  function isPopupAlive(popupState) {
    return !!(popupState && popupState.popupWin && !popupState.popupWin.closed);
  }

  function showPopupMessage(popupState, message, type) {
    if (!isPopupAlive(popupState)) return;
    const rootElement = popupState.popupWin.document.getElementById("message-root");
    rootElement.innerHTML = "";
    const item = popupState.popupWin.document.createElement("div");
    item.className = "message " + (type === "success" ? "success" : "error");
    item.textContent = message;
    rootElement.appendChild(item);
    popupState.popupWin.setTimeout(() => { if (item.parentNode) item.remove(); }, 3000);
  }

  function renderPopupShell(popupState) {
    const doc = popupState.popupWin.document;
    doc.open();
    doc.write(createPopupHtml());
    doc.close();
  }

  function initMultiSelect(doc, containerId, options, onChange) {
    const container = doc.getElementById(containerId);
    const selectedElement = container.querySelector(".multi-selected");
    const selectedText = container.querySelector(".multi-text");
    const badges = container.querySelector(".multi-badges");

    if (!container.querySelector(".multi-dropdown")) {
      const dropdown = doc.createElement("div");
      dropdown.className = "multi-dropdown";
      dropdown.innerHTML = "<div class='multi-search'><input type='text' placeholder='검색...'></div><div class='multi-options'></div><div class='multi-controls'><div class='multi-count'>선택: 전체</div><div class='multi-actions'><button type='button' class='multi-action all'>전체선택</button><button type='button' class='multi-action clear'>선택해제</button></div></div>";
      container.appendChild(dropdown);

      dropdown.querySelector(".multi-search input").addEventListener("input", function () {
        const term = safeTrim(this.value).toLowerCase();
        Array.prototype.forEach.call(dropdown.querySelectorAll(".multi-option"), (option) => {
          option.style.display = option.textContent.toLowerCase().indexOf(term) !== -1 ? "" : "none";
        });
      });
      dropdown.querySelector(".all").addEventListener("click", () => {
        container.setValues([]);
        if (typeof onChange === "function") onChange();
      });
      dropdown.querySelector(".clear").addEventListener("click", () => {
        container.setValues(["__EMPTY__"]);
        if (typeof onChange === "function") onChange();
      });
      selectedElement.addEventListener("click", (event) => {
        event.stopPropagation();
        dropdown.classList.toggle("show");
      });
      doc.addEventListener("click", (event) => {
        if (!container.contains(event.target)) dropdown.classList.remove("show");
      });
    }

    const dropdown = container.querySelector(".multi-dropdown");
    const optionsRoot = dropdown.querySelector(".multi-options");
    const countElement = dropdown.querySelector(".multi-count");

    function syncSummary() {
      const values = container.getValues();
      badges.innerHTML = "";
      if (!values.length) {
        selectedText.textContent = "전체";
        countElement.textContent = "선택: 전체";
        return;
      }
      if (values.length === 1 && values[0] === "__EMPTY__") {
        selectedText.textContent = "선택해주세요";
        countElement.textContent = "선택: 0";
        return;
      }
      selectedText.textContent = values.length <= 2 ? values.join(", ") : (values.length + "개 선택됨");
      countElement.textContent = "선택: " + values.length;
      values.forEach((value) => {
        const badge = doc.createElement("span");
        badge.className = "multi-badge";
        badge.innerHTML = escapeHtml(value) + "<span class='multi-badge-remove'>×</span>";
        badge.querySelector(".multi-badge-remove").addEventListener("click", (event) => {
          event.stopPropagation();
          const nextValues = container.getValues().filter((item) => item !== value && item !== "__EMPTY__");
          container.setValues(nextValues.length ? nextValues : ["__EMPTY__"]);
          if (typeof onChange === "function") onChange();
        });
        badges.appendChild(badge);
      });
    }

    container.setValues = function (values) {
      const normalized = !values || !values.length ? [] : (values[0] === "__EMPTY__" ? ["__EMPTY__"] : uniqueValues(values));
      container.dataset.values = JSON.stringify(normalized);
      const selectedSet = new Set(normalized);
      Array.prototype.forEach.call(optionsRoot.querySelectorAll("input"), (checkbox) => {
        checkbox.checked = checkbox.value === "__ALL__" ? !normalized.length : selectedSet.has(checkbox.value);
      });
      syncSummary();
    };

    container.getValues = function () {
      try {
        const values = JSON.parse(container.dataset.values || "[]");
        return Array.isArray(values) ? values : [];
      } catch (error) {
        return [];
      }
    };

    container.updateOptions = function (nextOptions) {
      const currentValues = container.getValues();
      optionsRoot.innerHTML = "";
      const allLabel = doc.createElement("label");
      allLabel.className = "multi-option";
      allLabel.innerHTML = "<input type='checkbox' value='__ALL__'> 전체";
      optionsRoot.appendChild(allLabel);
      (nextOptions || []).forEach((option) => {
        const item = doc.createElement("label");
        item.className = "multi-option";
        item.innerHTML = "<input type='checkbox' value='" + escapeHtml(option) + "'> " + escapeHtml(option);
        optionsRoot.appendChild(item);
      });
      Array.prototype.forEach.call(optionsRoot.querySelectorAll("input"), (checkbox) => {
        checkbox.addEventListener("change", () => {
          if (checkbox.value === "__ALL__") container.setValues(checkbox.checked ? [] : ["__EMPTY__"]);
          else {
            const checked = Array.prototype.map.call(optionsRoot.querySelectorAll("input:checked"), (input) => input.value).filter((value) => value !== "__ALL__");
            container.setValues(checked.length ? checked : ["__EMPTY__"]);
          }
          if (typeof onChange === "function") onChange();
        });
      });
      if (currentValues.length && currentValues[0] !== "__EMPTY__") container.setValues(currentValues.filter((value) => (nextOptions || []).indexOf(value) !== -1));
      else container.setValues([]);
    };

    container.updateOptions(options || []);
  }

  function getMultiSelectValues(doc, id) {
    const container = doc.getElementById(id);
    if (!container || typeof container.getValues !== "function") return [];
    const values = container.getValues();
    return values.length && values[0] !== "__EMPTY__" ? values : [];
  }

  async function fetchJson(win, url, signal) {
    const response = await win.fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
      signal,
    });
    const text = await response.text();
    if (isSessionExpiredText(text)) throw new SessionExpiredError("세션이 종료되어 다시 로그인해야 합니다.");
    return JSON.parse(text);
  }

  function updateDataInfo(popupState) {
    const element = popupState.popupWin.document.getElementById("data-info");
    if (!popupState.dataStore.lastFetchTime) {
      element.textContent = "데이터 정보: 없음";
      return;
    }
    const time = new Date(popupState.dataStore.lastFetchTime).toLocaleTimeString();
    element.textContent = "데이터 정보: " + popupState.dataStore.currentDate + " (" + time + ") - 차수: " + popupState.dataStore.batches.length + "개, 주문: " + popupState.dataStore.orders.length + "개";
  }

  function updateFilterOptions(popupState) {
    const doc = popupState.popupWin.document;
    const batches = popupState.dataStore.batches || [];
    doc.getElementById("site-multiselect").updateOptions(uniqueValues(batches.map((batch) => safeTrim(batch.site_name))).sort());
    doc.getElementById("expr-multiselect").updateOptions(uniqueValues(batches.map((batch) => safeTrim(batch.expr_name))).sort());
  }

  function buildBatchShippingStatusMap(orders) {
    const batches = {};
    (orders || []).forEach((order) => {
      const batchNumber = safeTrim(order.ordlist_ivno);
      const invoiceNumber = getInvoiceNumber(order);
      if (!batchNumber) return;
      if (!batches[batchNumber]) batches[batchNumber] = {};
      if (invoiceNumber && !batches[batchNumber][invoiceNumber]) batches[batchNumber][invoiceNumber] = safeTrim(order.ordlist_fnsh);
    });
    const result = {};
    Object.keys(batches).forEach((batchNumber) => {
      const statuses = Object.values(batches[batchNumber]);
      result[batchNumber] = {
        completed: statuses.filter((value) => value === "완료").length,
        pending: statuses.filter((value) => value === "발송대기").length,
        hasInvoices: statuses.length > 0,
      };
    });
    return result;
  }

  function renderStatusBadges(doc, status) {
    const wrapper = doc.createElement("div");
    if (!status || !status.hasInvoices) {
      const badge = doc.createElement("span");
      badge.className = "badge pending";
      badge.textContent = "송장 발번 전";
      wrapper.appendChild(badge);
      return wrapper;
    }
    const completed = doc.createElement("span");
    completed.className = "badge complete";
    completed.textContent = "완료: " + status.completed;
    const pending = doc.createElement("span");
    pending.className = "badge pending";
    pending.textContent = "대기: " + status.pending;
    wrapper.appendChild(completed);
    wrapper.appendChild(pending);
    return wrapper;
  }

  function syncBatchSelectionUi(popupState) {
    const boxes = Array.prototype.slice.call(popupState.popupWin.document.querySelectorAll("#batch-table-body input[data-batch-number]"));
    popupState.popupWin.document.getElementById("select-all-batches").checked = boxes.length > 0 && boxes.every((box) => popupState.selectedBatches.has(box.dataset.batchNumber));
  }

  function displayBatches(popupState, batches) {
    const doc = popupState.popupWin.document;
    const body = doc.getElementById("batch-table-body");
    const foot = doc.getElementById("batch-table-foot");
    body.innerHTML = "";
    foot.innerHTML = "";
    if (!batches || !batches.length) {
      body.innerHTML = "<tr><td colspan='8'>데이터가 없습니다.</td></tr>";
      return;
    }

    const statuses = buildBatchShippingStatusMap(popupState.dataStore.orders);
    let totalCount = 0;
    let totalCompleted = 0;
    let totalPending = 0;
    const fragment = doc.createDocumentFragment();

    batches.forEach((batch) => {
      const batchNumber = safeTrim(batch.ivmstr_ivno);
      const count = parseInt(batch.ivcnt, 10) || 0;
      const status = statuses[batchNumber] || { completed: 0, pending: 0, hasInvoices: false };
      totalCount += count;
      totalCompleted += status.completed;
      totalPending += status.pending;

      const row = doc.createElement("tr");
      row.className = "clickable";
      row.dataset.batchNumber = batchNumber;
      row.innerHTML = [
        "<td>" + escapeHtml(batchNumber) + "</td>",
        "<td>" + escapeHtml(batch.site_name) + "</td>",
        "<td>" + escapeHtml(batch.expr_name) + "</td>",
        "<td><strong>" + count + "</strong></td>",
        "<td class='status-cell'></td>",
        "<td class='left'>" + escapeHtml(batch.ivmstr_memo) + "</td>",
        "<td><button type='button' data-action='pattern' data-batch-number='" + escapeHtml(batchNumber) + "'>패턴</button></td>",
        "<td><input type='checkbox' data-batch-number='" + escapeHtml(batchNumber) + "'" + (popupState.selectedBatches.has(batchNumber) ? " checked" : "") + "></td>",
      ].join("");
      row.querySelector(".status-cell").appendChild(renderStatusBadges(doc, status));
      fragment.appendChild(row);
    });

    const actionRow = doc.createElement("tr");
    actionRow.innerHTML = "<td colspan='6' style='font-weight:700'>선택된 차수로 종합 패턴 분석</td><td><button type='button' data-action='pattern-all'>종합패턴</button></td><td></td>";
    fragment.appendChild(actionRow);
    body.appendChild(fragment);

    const totalRow = doc.createElement("tr");
    totalRow.innerHTML = "<td colspan='3'>총계</td><td><strong>" + totalCount + "</strong></td><td class='status-cell'></td><td colspan='3'></td>";
    totalRow.querySelector(".status-cell").appendChild(renderStatusBadges(doc, {
      completed: totalCompleted,
      pending: totalPending,
      hasInvoices: totalCompleted + totalPending > 0,
    }));
    foot.appendChild(totalRow);
    syncBatchSelectionUi(popupState);
  }

  function filterLocalData(popupState) {
    const doc = popupState.popupWin.document;
    const siteFilters = getMultiSelectValues(doc, "site-multiselect");
    const exprFilters = getMultiSelectValues(doc, "expr-multiselect");
    let filtered = popupState.dataStore.batches.slice();
    if (siteFilters.length) filtered = filtered.filter((batch) => siteFilters.indexOf(safeTrim(batch.site_name)) !== -1);
    if (exprFilters.length) filtered = filtered.filter((batch) => exprFilters.indexOf(safeTrim(batch.expr_name)) !== -1);
    popupState.dataStore.filteredBatches = filtered;
    displayBatches(popupState, filtered);
  }

  async function fetchAllData(popupState, dateValue) {
    if (!isPopupAlive(popupState)) return;
    const compact = compactDate(dateValue);
    if (!/^\d{8}$/.test(compact)) {
      showPopupMessage(popupState, "날짜 형식이 올바르지 않습니다.", "error");
      return;
    }
    if (popupState.readAbortController) popupState.readAbortController.abort();
    popupState.readAbortController = new AbortController();
    popupState.selectedBatches.clear();
    popupState.basePatterns = [];
    popupState.renderedPatterns = [];
    popupState.lastPatternResult = null;
    popupState.popupWin.document.getElementById("batch-table-body").innerHTML = "<tr><td colspan='8'>데이터 로딩 중...</td></tr>";
    popupState.popupWin.document.getElementById("pattern-table-body").innerHTML = "<tr><td colspan='9'>패턴 데이터가 없습니다.</td></tr>";
    popupState.popupWin.document.getElementById("pattern-summary").style.display = "none";

    try {
      const [batchData, orderData] = await Promise.all([
        fetchJson(popupState.pageWin, buildBatchUrl(compact), popupState.readAbortController.signal),
        fetchJson(popupState.pageWin, buildOrderUrl(compact), popupState.readAbortController.signal),
      ]);
      popupState.dataStore.batches = Array.isArray(batchData.rows) ? batchData.rows : [];
      popupState.dataStore.orders = Array.isArray(orderData.rows) ? orderData.rows : [];
      popupState.dataStore.filteredBatches = null;
      popupState.dataStore.currentDate = compact;
      popupState.dataStore.lastFetchTime = Date.now();
      updateDataInfo(popupState);
      updateFilterOptions(popupState);
      displayBatches(popupState, popupState.dataStore.batches);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      popupState.popupWin.document.getElementById("batch-table-body").innerHTML = "<tr><td colspan='8'>" + escapeHtml(error.message) + "</td></tr>";
      showPopupMessage(popupState, error instanceof SessionExpiredError ? "세션이 종료되었습니다. 다시 로그인한 뒤 시도해주세요." : ("데이터를 불러오는 중 오류가 발생했습니다. (" + error.message + ")"), "error");
    } finally {
      popupState.readAbortController = null;
    }
  }

  function openPatternTab(popupState) {
    const doc = popupState.popupWin.document;
    doc.getElementById("batch-tab").classList.remove("active");
    doc.getElementById("batch-content").classList.remove("active");
    doc.getElementById("pattern-tab").classList.add("active");
    doc.getElementById("pattern-content").classList.add("active");
  }

  function openBatchTab(popupState) {
    const doc = popupState.popupWin.document;
    doc.getElementById("pattern-tab").classList.remove("active");
    doc.getElementById("pattern-content").classList.remove("active");
    doc.getElementById("batch-tab").classList.add("active");
    doc.getElementById("batch-content").classList.add("active");
  }

  function getPatternFilterOptions(popupState) {
    const doc = popupState.popupWin.document;
    return {
      includeKeywords: safeTrim(doc.getElementById("include-input").value).split(",").map((value) => safeTrim(value)).filter(Boolean),
      excludeKeywords: safeTrim(doc.getElementById("exclude-input").value).split(",").map((value) => safeTrim(value)).filter(Boolean),
      minRepetition: parseInt(doc.getElementById("min-rep-input").value, 10) || 1,
    };
  }

  function updatePatternSummary(popupState) {
    const doc = popupState.popupWin.document;
    const summary = doc.getElementById("pattern-summary");
    if (!popupState.lastPatternResult || !popupState.lastPatternResult.patterns.length) {
      summary.style.display = "none";
      summary.innerHTML = "";
      return;
    }
    const stats = popupState.lastPatternResult.stats;
    summary.innerHTML = [
      "<div class='summary-item'><span class='label'>패턴 수</span><span class='value'>" + popupState.lastPatternResult.patterns.filter((pattern) => pattern.id !== LEFTOVER_PATTERN_ID).length + "개</span></div>",
      "<div class='summary-item'><span class='label'>패턴 건수</span><span class='value'>" + stats.regularInvoiceCount + "개</span></div>",
      "<div class='summary-item'><span class='label'>짜투리 건수</span><span class='value'>" + stats.leftoverInvoiceCount + "개</span></div>",
      "<div class='summary-item'><span class='label'>판매처</span><div class='tags'>" + stats.siteNames.map((name) => "<span class='tag'>" + escapeHtml(name) + "</span>").join("") + "</div></div>",
      "<div class='summary-item'><span class='label'>차수</span><div class='tags'>" + stats.batchNumbers.map((name) => "<span class='tag'>" + escapeHtml(name) + "</span>").join("") + "</div></div>",
    ].join("");
    summary.style.display = "grid";
  }

  function syncPatternSelectionUi(popupState) {
    const boxes = Array.prototype.slice.call(popupState.popupWin.document.querySelectorAll("#pattern-table-body input[data-pattern-id]"));
    popupState.popupWin.document.getElementById("select-all-patterns").checked = boxes.length > 0 && boxes.every((box) => box.checked);
  }

  function displayPatterns(popupState) {
    const doc = popupState.popupWin.document;
    const body = doc.getElementById("pattern-table-body");
    const foot = doc.getElementById("pattern-table-foot");
    body.innerHTML = "";
    foot.innerHTML = "";
    if (!popupState.renderedPatterns.length) {
      body.innerHTML = "<tr><td colspan='9'>패턴 데이터가 없습니다.</td></tr>";
      syncPatternSelectionUi(popupState);
      return;
    }

    const fragment = doc.createDocumentFragment();
    let totalItems = 0;
    let totalInvoices = 0;
    let totalCompleted = 0;
    let totalPending = 0;

    popupState.renderedPatterns.forEach((pattern, index) => {
      const leftover = pattern.id === LEFTOVER_PATTERN_ID;
      const toneClass = getPatternToneClass(pattern, index);
      pattern.items.forEach((item, itemIndex) => {
        const row = doc.createElement("tr");
        row.className = toneClass;
        if (itemIndex === 0) {
          totalItems += pattern.count;
          totalInvoices += pattern.invoices.length;
          totalCompleted += pattern.completedCount;
          totalPending += pattern.pendingCount;
          row.dataset.patternId = String(pattern.id);
          row.innerHTML = [
            "<td rowspan='" + pattern.items.length + "'>" + (index + 1) + "</td>",
            "<td class='left'>" + escapeHtml(item.productName) + "</td>",
            "<td>" + escapeHtml(item.managementName) + "</td>",
            "<td>" + escapeHtml(item.optionName) + "</td>",
            "<td>" + (leftover ? pattern.count : item.quantity) + "</td>",
            "<td rowspan='" + pattern.items.length + "'><strong>" + pattern.count + "</strong></td>",
            "<td rowspan='" + pattern.items.length + "' class='status-cell'></td>",
            "<td rowspan='" + pattern.items.length + "'><a class='link' data-action='pattern-invoices' data-pattern-id='" + escapeHtml(pattern.id) + "'>" + pattern.invoices.length + "개</a></td>",
            "<td rowspan='" + pattern.items.length + "'><input type='checkbox' data-pattern-id='" + escapeHtml(pattern.id) + "'></td>",
          ].join("");
          row.querySelector(".status-cell").appendChild(renderStatusBadges(doc, {
            completed: pattern.completedCount,
            pending: pattern.pendingCount,
            hasInvoices: pattern.completedCount + pattern.pendingCount > 0,
          }));
        } else {
          row.innerHTML = "<td class='left'>" + escapeHtml(item.productName) + "</td><td>" + escapeHtml(item.managementName) + "</td><td>" + escapeHtml(item.optionName) + "</td><td>" + item.quantity + "</td>";
        }
        fragment.appendChild(row);
      });
    });

    body.appendChild(fragment);
    const totalRow = doc.createElement("tr");
    totalRow.innerHTML = "<td colspan='5'>총계</td><td><strong>" + totalItems + "</strong></td><td class='status-cell'></td><td><strong>" + totalInvoices + "</strong></td><td></td>";
    totalRow.querySelector(".status-cell").appendChild(renderStatusBadges(doc, {
      completed: totalCompleted,
      pending: totalPending,
      hasInvoices: totalCompleted + totalPending > 0,
    }));
    foot.appendChild(totalRow);
    syncPatternSelectionUi(popupState);
  }

  function applyPatternFilters(popupState) {
    popupState.lastPatternResult = filterPatterns(popupState.basePatterns, getPatternFilterOptions(popupState));
    popupState.renderedPatterns = popupState.lastPatternResult.patterns;
    displayPatterns(popupState);
    updatePatternSummary(popupState);
  }

  function processPatterns(popupState, batchNumber) {
    if (!popupState.dataStore.orders.length) {
      showPopupMessage(popupState, "주문 데이터가 없습니다. 먼저 조회해주세요.", "error");
      return;
    }
    let orders = popupState.dataStore.orders.slice();
    if (batchNumber) orders = orders.filter((order) => safeTrim(order.ordlist_ivno) === safeTrim(batchNumber));
    else if (popupState.selectedBatches.size) orders = orders.filter((order) => popupState.selectedBatches.has(safeTrim(order.ordlist_ivno)));
    popupState.basePatterns = analyzeOrderPatterns(orders);
    openPatternTab(popupState);
    applyPatternFilters(popupState);
  }

  function openPatternPrintWindow(popupState) {
    const filters = getPatternFilterOptions(popupState);
    const analysisBatchNumbers = popupState.lastPatternResult && popupState.lastPatternResult.stats
      ? popupState.lastPatternResult.stats.batchNumbers
      : Array.from(popupState.selectedBatches || []);
    const batches = resolvePrintableBatches(popupState.dataStore.batches || [], analysisBatchNumbers);
    const patterns = popupState.renderedPatterns.filter((pattern) => pattern.id !== LEFTOVER_PATTERN_ID);
    const html = buildPatternPrintDocumentHtml({
      printedAt: formatDate(new Date()),
      dateLabel: popupState.dataStore.currentDate ? formatCompactDate(popupState.dataStore.currentDate) : "-",
      siteLabel: formatSelectedFilterLabel(getMultiSelectValues(popupState.popupWin.document, "site-multiselect")),
      exprLabel: formatSelectedFilterLabel(getMultiSelectValues(popupState.popupWin.document, "expr-multiselect")),
      filters,
      stats: popupState.lastPatternResult ? popupState.lastPatternResult.stats : null,
      batches,
      patterns,
    });
    const printWindow = popupState.popupWin.open("", "tm-pattern-print", "width=1280,height=860");
    if (!printWindow) {
      showPopupMessage(popupState, "인쇄 창을 열지 못했습니다. 팝업 차단을 확인해주세요.", "error");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function showInvoiceModal(popupState, invoices, title) {
    const doc = popupState.popupWin.document;
    popupState.currentInvoices = (invoices || []).slice();
    doc.getElementById("invoice-title").textContent = title || "송장번호 목록";
    doc.getElementById("invoice-count").textContent = popupState.currentInvoices.length;
    doc.getElementById("invoice-copy-success").style.display = "none";
    doc.getElementById("invoice-list").innerHTML = popupState.currentInvoices.map((invoice, index) => "<div class='list-item'>" + (index + 1) + ". " + escapeHtml(invoice) + "</div>").join("");
    doc.getElementById("invoice-textarea").value = formatInvoicesForCopy(popupState.currentInvoices, "\n");
    doc.getElementById("invoice-modal").style.display = "flex";
  }

  async function copyInvoices(popupState, separator) {
    const text = formatInvoicesForCopy(popupState.currentInvoices, separator);
    const doc = popupState.popupWin.document;
    if (popupState.popupWin.navigator.clipboard && popupState.popupWin.isSecureContext) {
      await popupState.popupWin.navigator.clipboard.writeText(text);
    } else {
      const textarea = doc.getElementById("invoice-textarea");
      textarea.focus();
      textarea.select();
      doc.execCommand("copy");
    }
    doc.getElementById("invoice-copy-success").style.display = "block";
    popupState.popupWin.setTimeout(() => {
      if (isPopupAlive(popupState)) doc.getElementById("invoice-copy-success").style.display = "none";
    }, 2500);
  }

  function downloadInvoicesCsv(popupState) {
    const blob = new popupState.popupWin.Blob([buildInvoicesCsv(popupState.currentInvoices)], { type: "text/csv;charset=utf-8;" });
    const url = popupState.popupWin.URL.createObjectURL(blob);
    const link = popupState.popupWin.document.createElement("a");
    link.href = url;
    link.download = "송장번호_" + formatDate(new Date()) + ".csv";
    popupState.popupWin.document.body.appendChild(link);
    link.click();
    popupState.popupWin.setTimeout(() => {
      if (link.parentNode) link.remove();
      popupState.popupWin.URL.revokeObjectURL(url);
    }, 0);
  }

  function updateShippingLabels(popupState, isCancelMode) {
    const doc = popupState.popupWin.document;
    const theme = getShippingModeTheme(isCancelMode);
    const labels = doc.querySelectorAll(".stat .label");
    labels[1].textContent = theme.completedLabel;
    labels[2].textContent = theme.failedLabel;
    doc.getElementById("shipping-title").textContent = theme.title;
    doc.getElementById("shipping-progress-bar").style.background = theme.progressBackground;
    doc.getElementById("shipping-mode-badge").textContent = theme.badgeText;
    doc.getElementById("shipping-mode-badge").className = theme.badgeClass;
  }

  function renderShippingProgress(popupState, state) {
    const progress = calculateProgress(state.completedCount + state.failedCount, state.totalCount, state.completedCount, state.failedCount);
    const doc = popupState.popupWin.document;
    doc.getElementById("total-invoices").textContent = state.totalCount;
    doc.getElementById("completed-invoices").textContent = state.completedCount;
    doc.getElementById("failed-invoices").textContent = state.failedCount;
    doc.getElementById("progress-percentage").textContent = progress.percentage + "%";
    doc.getElementById("shipping-progress-bar").style.width = progress.percentage + "%";
  }

  function addShippingLog(popupState, message, type) {
    const item = popupState.popupWin.document.createElement("div");
    item.className = "log-item" + (type ? " " + type : "");
    item.textContent = "[" + new Date().toLocaleTimeString() + "] " + message;
    const root = popupState.popupWin.document.getElementById("shipping-log");
    root.appendChild(item);
    root.scrollTop = root.scrollHeight;
  }

  function buildShippingQuery(invoiceNumber, shippingDate, isCancelMode) {
    if (isCancelMode) {
      return SHIPPING_CANCEL_ENDPOINT + "?" + toQueryString({
        CANCEL_TYPE: "2",
        RDNO_DATE: shippingDate,
        RDNO_NUM: invoiceNumber,
      });
    }
    return SHIPPING_ENDPOINT + "?" + toQueryString({
      rdno_date: shippingDate,
      inoutstock_gbn1: "4871",
      inoutstock_wah: "1060",
      loca_wah_none: "1059",
      loca_zone_none: "2244",
      loca_seq_none: "210221",
      ebutcam_start: "N",
      ebutcam_ofc_code: "",
      ebutcam_wuser: "BMF1",
      SOfc_dbtype: "A",
      SUser_ofc: "377",
      SUser_id: "BMF1",
      SOfc_jaego: "Y",
      SOfc_matyn: "Y",
      SOfc_dnoayn: "N",
      SUser_gbn: "2",
      SUser_cust: "4603",
      SOfc_jgtyp: "4",
      rdno_num: invoiceNumber,
    });
  }

  async function requestShipping(popupState, invoiceNumber, shippingDate, isCancelMode) {
    const response = await popupState.pageWin.fetch(buildShippingQuery(invoiceNumber, shippingDate, isCancelMode), {
      credentials: "include",
      headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
    });
    const text = await response.text();
    if (isSessionExpiredText(text)) throw new SessionExpiredError("세션이 종료되어 다시 로그인해야 합니다.");
    return JSON.parse(text);
  }

  function resetShippingModalState(popupState, invoices) {
    const doc = popupState.popupWin.document;
    popupState.currentInvoices = (invoices || []).slice();
    popupState.shippingLogs.completed = [];
    popupState.shippingLogs.failed = [];
    popupState.shippingRuntime = null;
    doc.getElementById("total-invoices").textContent = popupState.currentInvoices.length;
    doc.getElementById("completed-invoices").textContent = "0";
    doc.getElementById("failed-invoices").textContent = "0";
    doc.getElementById("progress-percentage").textContent = "0%";
    doc.getElementById("shipping-progress-bar").style.width = "0%";
    doc.getElementById("shipping-log").innerHTML = "";
    doc.getElementById("start-shipping-button").style.display = "inline-flex";
    doc.getElementById("start-shipping-button").disabled = false;
    doc.getElementById("stop-shipping-button").style.display = "none";
    doc.getElementById("stop-shipping-button").disabled = false;
    doc.getElementById("cancel-mode").disabled = false;
    doc.getElementById("shipping-date").disabled = false;
    doc.getElementById("parallel-count").disabled = false;
  }

  function showShippingModal(popupState, invoices) {
    const doc = popupState.popupWin.document;
    resetShippingModalState(popupState, invoices);
    doc.getElementById("shipping-date").value = doc.getElementById("date-input").value || getKoreaDateString();
    doc.getElementById("cancel-mode").checked = false;
    updateShippingLabels(popupState, false);
    doc.getElementById("shipping-modal").style.display = "flex";
  }

  function requestStopShipping(popupState) {
    const runtime = popupState.shippingRuntime;
    if (!runtime || runtime.stopRequested) return;
    runtime.stopRequested = true;
    runtime.state = reduceShippingRunState(runtime.state, { type: "stop-request" });
    popupState.popupWin.document.getElementById("stop-shipping-button").disabled = true;
    addShippingLog(popupState, "작업 중지 요청됨. 진행 중인 요청이 끝난 뒤 중지합니다.", "error");
  }

  async function processShippingQueue(popupState, invoices, shippingDate, isCancelMode) {
    const doc = popupState.popupWin.document;
    const token = "shipping-" + Date.now();
    const parallelCount = clamp(parseInt(doc.getElementById("parallel-count").value, 10) || 2, 1, 10);
    const runtime = {
      token,
      stopRequested: false,
      state: reduceShippingRunState(undefined, { type: "start", token, totalCount: invoices.length }),
    };
    popupState.shippingRuntime = runtime;
    popupState.shippingLogs.completed = [];
    popupState.shippingLogs.failed = [];
    doc.getElementById("start-shipping-button").style.display = "none";
    doc.getElementById("stop-shipping-button").style.display = "inline-flex";
    doc.getElementById("stop-shipping-button").disabled = false;
    doc.getElementById("cancel-mode").disabled = true;
    doc.getElementById("shipping-date").disabled = true;
    doc.getElementById("parallel-count").disabled = true;
    updateShippingLabels(popupState, isCancelMode);
    renderShippingProgress(popupState, runtime.state);
    addShippingLog(popupState, (isCancelMode ? "출고취소" : "출고") + " 작업 시작 (총 " + invoices.length + "건, 병렬 " + parallelCount + "개)");

    let currentIndex = 0;
    async function worker() {
      while (true) {
        if (popupState.shippingRuntime !== runtime || runtime.stopRequested) return;
        const index = currentIndex;
        currentIndex += 1;
        if (index >= invoices.length) return;
        const invoiceNumber = invoices[index];
        try {
          const responseData = await requestShipping(popupState, invoiceNumber, shippingDate, isCancelMode);
          if (popupState.shippingRuntime !== runtime) return;
          const success = evaluateShippingResponse(responseData, isCancelMode);
          runtime.state = reduceShippingRunState(runtime.state, { type: success ? "success" : "fail" });
          if (success) {
            popupState.shippingLogs.completed.push(invoiceNumber);
            addShippingLog(popupState, "성공: " + invoiceNumber, "success");
          } else {
            popupState.shippingLogs.failed.push(invoiceNumber);
            addShippingLog(popupState, "실패: " + invoiceNumber, "error");
          }
        } catch (error) {
          if (popupState.shippingRuntime !== runtime) return;
          runtime.state = reduceShippingRunState(runtime.state, { type: "fail" });
          popupState.shippingLogs.failed.push(invoiceNumber);
          addShippingLog(popupState, "오류: " + invoiceNumber + " (" + error.message + ")", "error");
          if (error instanceof SessionExpiredError) runtime.stopRequested = true;
        }
        renderShippingProgress(popupState, runtime.state);
      }
    }

    await Promise.all(Array.from({ length: parallelCount }, () => worker()));
    if (popupState.shippingRuntime !== runtime) return;
    runtime.state = reduceShippingRunState(runtime.state, { type: "finish" });
    renderShippingProgress(popupState, runtime.state);
    doc.getElementById("start-shipping-button").style.display = "inline-flex";
    doc.getElementById("start-shipping-button").disabled = false;
    doc.getElementById("stop-shipping-button").style.display = "none";
    doc.getElementById("cancel-mode").disabled = false;
    doc.getElementById("shipping-date").disabled = false;
    doc.getElementById("parallel-count").disabled = false;
    const label = isCancelMode ? "취소" : "출고";
    if (runtime.state.status === "stopped") addShippingLog(popupState, "작업 중지: " + label + "완료 " + runtime.state.completedCount + "건, " + label + "실패 " + runtime.state.failedCount + "건");
    else addShippingLog(popupState, "작업 완료: " + label + "완료 " + runtime.state.completedCount + "건, " + label + "실패 " + runtime.state.failedCount + "건");
  }

  function bindPopupEvents(popupState) {
    const doc = popupState.popupWin.document;
    const today = getKoreaDateString();
    doc.getElementById("date-input").value = today;
    initMultiSelect(doc, "site-multiselect", [], () => { if (popupState.dataStore.batches.length) filterLocalData(popupState); });
    initMultiSelect(doc, "expr-multiselect", [], () => { if (popupState.dataStore.batches.length) filterLocalData(popupState); });

    const schedulePatternFilter = () => {
      if (popupState.patternFilterTimer) popupState.popupWin.clearTimeout(popupState.patternFilterTimer);
      popupState.patternFilterTimer = popupState.popupWin.setTimeout(() => {
        if (popupState.basePatterns.length) applyPatternFilters(popupState);
      }, PATTERN_FILTER_DEBOUNCE_MS);
    };

    doc.getElementById("batch-tab").addEventListener("click", () => openBatchTab(popupState));
    doc.getElementById("pattern-tab").addEventListener("click", () => openPatternTab(popupState));
    doc.getElementById("search-button").addEventListener("click", () => fetchAllData(popupState, doc.getElementById("date-input").value));
    doc.getElementById("date-input").addEventListener("keydown", (event) => { if (event.key === "Enter") fetchAllData(popupState, doc.getElementById("date-input").value); });
    doc.getElementById("include-input").addEventListener("input", schedulePatternFilter);
    doc.getElementById("exclude-input").addEventListener("input", schedulePatternFilter);
    doc.getElementById("min-rep-input").addEventListener("input", schedulePatternFilter);
    doc.getElementById("print-pattern-button").addEventListener("click", () => {
      if (!popupState.renderedPatterns.length) {
        showPopupMessage(popupState, "인쇄할 패턴 데이터가 없습니다.", "error");
        return;
      }
      openPatternPrintWindow(popupState);
    });

    doc.getElementById("select-all-batches").addEventListener("change", (event) => {
      const visible = popupState.dataStore.filteredBatches || popupState.dataStore.batches;
      popupState.selectedBatches = event.target.checked ? new Set((visible || []).map((batch) => safeTrim(batch.ivmstr_ivno))) : new Set();
      displayBatches(popupState, visible);
    });

    doc.getElementById("batch-table-body").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='pattern']");
      if (button) return void processPatterns(popupState, button.dataset.batchNumber);
      if (event.target.closest("button[data-action='pattern-all']")) return void processPatterns(popupState);
      const checkbox = event.target.closest("input[data-batch-number]");
      if (checkbox) {
        if (checkbox.checked) popupState.selectedBatches.add(checkbox.dataset.batchNumber);
        else popupState.selectedBatches.delete(checkbox.dataset.batchNumber);
        return void syncBatchSelectionUi(popupState);
      }
      const row = event.target.closest("tr[data-batch-number]");
      if (!row) return;
      const rowCheckbox = row.querySelector("input[data-batch-number]");
      rowCheckbox.checked = !rowCheckbox.checked;
      if (rowCheckbox.checked) popupState.selectedBatches.add(row.dataset.batchNumber);
      else popupState.selectedBatches.delete(row.dataset.batchNumber);
      syncBatchSelectionUi(popupState);
    });

    doc.getElementById("select-all-patterns").addEventListener("change", (event) => {
      Array.prototype.forEach.call(doc.querySelectorAll("#pattern-table-body input[data-pattern-id]"), (checkbox) => {
        checkbox.checked = event.target.checked;
      });
      syncPatternSelectionUi(popupState);
    });

    doc.getElementById("pattern-table-body").addEventListener("click", (event) => {
      const link = event.target.closest("a[data-action='pattern-invoices']");
      if (link) {
        const pattern = popupState.renderedPatterns.find((item) => String(item.id) === String(link.dataset.patternId));
        if (pattern) showInvoiceModal(popupState, pattern.invoices, "송장번호 목록");
        return;
      }
      const checkbox = event.target.closest("input[data-pattern-id]");
      if (checkbox) return void syncPatternSelectionUi(popupState);
      const row = event.target.closest("tr[data-pattern-id]");
      if (!row) return;
      const rowCheckbox = row.querySelector("input[data-pattern-id]");
      rowCheckbox.checked = !rowCheckbox.checked;
      syncPatternSelectionUi(popupState);
    });

    doc.getElementById("show-invoices-button").addEventListener("click", () => {
      const ids = Array.prototype.map.call(doc.querySelectorAll("#pattern-table-body input[data-pattern-id]:checked"), (box) => box.dataset.patternId);
      if (!ids.length) return void showPopupMessage(popupState, "선택된 패턴이 없습니다. 패턴을 선택해주세요.", "error");
      showInvoiceModal(popupState, extractInvoiceNumbers(popupState.renderedPatterns, ids), "종합송장");
    });
    doc.getElementById("shipping-button").addEventListener("click", () => {
      const ids = Array.prototype.map.call(doc.querySelectorAll("#pattern-table-body input[data-pattern-id]:checked"), (box) => box.dataset.patternId);
      if (!ids.length) return void showPopupMessage(popupState, "선택된 패턴이 없습니다. 패턴을 선택해주세요.", "error");
      showShippingModal(popupState, extractInvoiceNumbers(popupState.renderedPatterns, ids));
    });
    doc.getElementById("close-shipping-modal").addEventListener("click", () => { doc.getElementById("shipping-modal").style.display = "none"; });
    doc.getElementById("close-shipping-button").addEventListener("click", () => { doc.getElementById("shipping-modal").style.display = "none"; });
    doc.getElementById("close-invoice-modal").addEventListener("click", () => { doc.getElementById("invoice-modal").style.display = "none"; });
    doc.getElementById("copy-newline-button").addEventListener("click", () => { copyInvoices(popupState, "\n"); });
    doc.getElementById("copy-comma-button").addEventListener("click", () => { copyInvoices(popupState, ","); });
    doc.getElementById("download-csv-button").addEventListener("click", () => { downloadInvoicesCsv(popupState); });
    doc.getElementById("completed-invoices").addEventListener("click", () => { if (popupState.shippingLogs.completed.length) showInvoiceModal(popupState, popupState.shippingLogs.completed, doc.querySelectorAll(".stat .label")[1].textContent + " 송장번호"); });
    doc.getElementById("failed-invoices").addEventListener("click", () => { if (popupState.shippingLogs.failed.length) showInvoiceModal(popupState, popupState.shippingLogs.failed, doc.querySelectorAll(".stat .label")[2].textContent + " 송장번호"); });
    doc.getElementById("increase-parallel").addEventListener("click", () => { const input = doc.getElementById("parallel-count"); input.value = String(clamp((parseInt(input.value, 10) || 2) + 1, 1, 10)); });
    doc.getElementById("decrease-parallel").addEventListener("click", () => { const input = doc.getElementById("parallel-count"); input.value = String(clamp((parseInt(input.value, 10) || 2) - 1, 1, 10)); });
    doc.getElementById("cancel-mode").addEventListener("change", (event) => {
      updateShippingLabels(popupState, event.target.checked);
      resetShippingModalState(popupState, popupState.currentInvoices);
      doc.getElementById("cancel-mode").checked = event.target.checked;
      updateShippingLabels(popupState, event.target.checked);
    });
    doc.getElementById("start-shipping-button").addEventListener("click", async () => {
      if (!popupState.currentInvoices.length) return void addShippingLog(popupState, "처리할 송장번호가 없습니다.", "error");
      await processShippingQueue(popupState, popupState.currentInvoices.slice(), doc.getElementById("shipping-date").value, !!doc.getElementById("cancel-mode").checked);
    });
    doc.getElementById("stop-shipping-button").addEventListener("click", () => { requestStopShipping(popupState); });

    popupState.popupWin.addEventListener("beforeunload", () => {
      if (popupState.readAbortController) popupState.readAbortController.abort();
      popupState.pageState.analyzerWindow = null;
      popupState.pageState.popupState = null;
    });

    popupState.popupWin.setTimeout(() => fetchAllData(popupState, today), 300);
  }

  function getPageState(win) {
    if (!win.__tmPatternAnalyzerState) win.__tmPatternAnalyzerState = { analyzerWindow: null, popupState: null };
    return win.__tmPatternAnalyzerState;
  }

  function openAnalyzerWindow(win, pageState) {
    if (pageState.analyzerWindow && !pageState.analyzerWindow.closed) {
      pageState.analyzerWindow.focus();
      return;
    }
    const popupWin = win.open("", POPUP_NAME, POPUP_FEATURES);
    if (!popupWin) return;
    pageState.analyzerWindow = popupWin;
    pageState.popupState = createPopupState(win, popupWin, pageState);
    renderPopupShell(pageState.popupState);
    bindPopupEvents(pageState.popupState);
    popupWin.focus();
  }

  function addNavMenuButton(win, pageState) {
    const doc = win.document;
    const navMenu = doc.querySelector(NAV_SELECTOR);
    if (!navMenu || doc.getElementById(NAV_BUTTON_ID)) return false;
    Array.prototype.forEach.call(navMenu.querySelectorAll("li"), (item) => {
      const text = safeTrim(item.textContent);
      if (text.indexOf(MODULE_NAME) !== -1) return;
      if (REMOVE_MENU_LABELS.some((label) => text.indexOf(label) !== -1)) item.remove();
    });
    const menuItem = doc.createElement("li");
    menuItem.innerHTML = "<a href='javascript:void(0);' id='" + NAV_BUTTON_ID + "'><strong>" + MODULE_NAME + "</strong></a>";
    const csItem = Array.prototype.find.call(navMenu.querySelectorAll("li"), (item) => safeTrim(item.textContent).indexOf("상담전용창") !== -1);
    if (csItem) navMenu.insertBefore(menuItem, csItem);
    else navMenu.appendChild(menuItem);
    doc.getElementById(NAV_BUTTON_ID).addEventListener("click", () => openAnalyzerWindow(win, pageState));
    return true;
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\//i.test(String(win.location.href || ""));
  }

  function start(win) {
    if (!shouldRun(win) || win.__tmPatternAnalyzerStarted) return;
    win.__tmPatternAnalyzerStarted = true;
    const pageState = getPageState(win);
    let attempts = 0;
    const install = () => {
      if (addNavMenuButton(win, pageState)) return;
      attempts += 1;
      if (attempts < NAV_RETRY_LIMIT) win.setTimeout(install, NAV_RETRY_DELAY_MS);
    };
    if (win.document.readyState === "loading") win.document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }

  function run(context) {
    const win = context && context.window ? context.window : root;
    start(win);
  }

  return {
    id: MODULE_ID,
    version: "0.1.12",
    name: MODULE_NAME,
    matches: MATCHES,
    LEFTOVER_PATTERN_ID,
    analyzeOrderPatterns,
    filterPatterns,
    extractInvoiceNumbers,
    formatInvoicesForCopy,
    buildInvoicesCsv,
    calculateProgress,
    getPatternToneClass,
    buildPatternPrintDocumentHtml,
    evaluateShippingResponse,
    formatSelectedFilterLabel,
    resolvePrintableBatches,
    getShippingModeTheme,
    reduceShippingRunState,
    buildBatchUrl,
    buildOrderUrl,
    run,
    start,
    createPopupHtml,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);












