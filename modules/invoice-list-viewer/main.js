module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "invoice-list-viewer";
  const MODULE_NAME = "B2B 출고데이터 뷰어";
  const MODULE_VERSION = "0.1.8";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const SITE_URL_PATTERN = /^https:\/\/www\.ebut3pl\.co\.kr\//i;
  const EXCLUDED_PAGE_PATTERNS = [/\/jsp\/site\/site3217main\.jsp(?:[?#].*)?$/i];
  const LIST_ENDPOINT = "/site/site320main_jdata";
  const XLS_ENDPOINT = "/util/ExlForm_DB3";
  const STATE_KEY = "__tmInvoiceListViewerState";
  const STYLE_ID = "tm-invoice-list-viewer-style";
  const NAV_SELECTOR = ".nav.navbar-nav.navbar-right";
  const NAV_BUTTON_ID = "tm-invoice-list-viewer-nav-button";
  const NAV_BUTTON_LABEL = "B2B출고";
  const NAV_INSERT_BEFORE_LABEL = "상담전용창";
  const NAV_RETRY_LIMIT = 30;
  const NAV_RETRY_DELAY_MS = 500;
  const POPUP_NAME = "tm-invoice-list-viewer-window";
  const POPUP_FEATURES = "width=1520,height=920,resizable=yes,scrollbars=yes";
  const PANEL_ID = "tmInvoiceListViewerPanel";
  const STATUS_ID = "tmInvoiceListViewerStatus";
  const LIST_META_ID = "tmInvoiceListViewerListMeta";
  const LIST_BODY_ID = "tmInvoiceListViewerListBody";
  const RESULT_BODY_ID = "tmInvoiceListViewerResultBody";
  const RESULT_META_ID = "tmInvoiceListViewerResultMeta";
  const DATE_INPUT_ID = "tmInvoiceListViewerDate";
  const EMPTY_CELL_FILLER = "\u00A0";

  const HEADER_ALIASES = {
    invoiceNumber: ["송장번호", "운송장번호"],
    shippedAt: ["발송일", "출고일", "배송일"],
    mall: ["쇼핑몰", "판매처"],
    orderNumber: ["주문번호"],
    matchedNicn: ["매칭관리명", "관리명"],
    matchedName: ["매칭상품명", "상품명"],
    matchedQty: ["매칭수량", "수량"],
  };

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

  function getXlsx(scope) {
    if (scope && scope.XLSX) return scope.XLSX;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.XLSX) return globalThis.XLSX;
    return root && root.XLSX ? root.XLSX : null;
  }

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function resolveTopHref(win) {
    if (!win) return "";
    try {
      if (win.top && win.top.location && win.top.location.href) return String(win.top.location.href);
    } catch (error) {
      // Ignore cross-frame access issues and fall back to the current window.
    }
    return String(win.location && win.location.href || "");
  }

  function isExcludedPageHref(href) {
    const value = String(href || "");
    return EXCLUDED_PAGE_PATTERNS.some((pattern) => pattern.test(value));
  }

  function resolveUiWindow(win) {
    const navMenu = getNavMenu(win);
    if (navMenu && typeof navMenu.resolveNavTargetWindow === "function") {
      const resolved = navMenu.resolveNavTargetWindow(win, { navSelector: NAV_SELECTOR });
      if (resolved && resolved.win && resolved.win.document) return resolved.win;
    }
    return win;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDisplayCellText(value) {
    const text = safeTrim(value);
    return text || EMPTY_CELL_FILLER;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  }

  function todayString() {
    return formatDate(new Date());
  }

  function compactDate(value) {
    return safeTrim(value).replace(/-/g, "");
  }

  function formatBatchDateLabel(value) {
    const compact = compactDate(value);
    if (!/^\d{8}$/.test(compact)) return safeTrim(value);
    return [compact.slice(0, 4), compact.slice(4, 6), compact.slice(6, 8)].join("-");
  }

  function shiftYears(value, diffYears) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return value;
    const year = Number(match[1]) + diffYears;
    const month = Number(match[2]);
    const day = Number(match[3]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return [year, pad2(month), pad2(Math.min(day, lastDay))].join("-");
  }

  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null) search.set(key, String(params[key]));
    });
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

  function buildRowViewModel(row) {
    return {
      id: safeTrim(row && row.ivmstr_seq) || safeTrim(row && row.ivmstr_ivno),
      ivmstr_date: compactDate(row && row.ivmstr_date),
      ivmstr_ivno: safeTrim(row && row.ivmstr_ivno),
      expr_name: safeTrim(row && row.expr_name),
      site_name: safeTrim(row && row.site_name),
      ivcnt: safeTrim(row && (row.ivcnt || row.ivcnt_num)),
      ivmstr_memo: safeTrim(row && row.ivmstr_memo),
    };
  }

  function isSessionExpiredResponse(bodyText, contentType) {
    const text = String(bodyText || "");
    const type = String(contentType || "").toLowerCase();
    return text.indexOf("자동 로그아웃 되었습니다") !== -1 ||
      text.indexOf("/home/docs/login.html") !== -1 ||
      (type.indexOf("text/html") !== -1 && text.indexOf("로그인") !== -1);
  }

  async function fetchListPage(win, dateString, pageNumber) {
    const params = buildListRequestParams(dateString, pageNumber, Date.now() + pageNumber);
    const response = await win.fetch(LIST_ENDPOINT + "?" + toQueryString(params), {
      credentials: "include",
      headers: { Accept: "application/json, text/javascript, */*; q=0.01" },
    });
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();

    if (!response.ok) throw new Error("출력리스트 조회 실패 (" + response.status + ")");
    if (isSessionExpiredResponse(bodyText, contentType)) throw new Error("세션이 종료되었습니다. 다시 로그인하세요.");

    try {
      return JSON.parse(bodyText);
    } catch (error) {
      throw new Error("출력리스트 응답을 해석하지 못했습니다.");
    }
  }

  async function fetchAllRows(win, dateString) {
    const firstPage = await fetchListPage(win, dateString, 1);
    const totalPages = Math.max(Number(firstPage.totalpages) || 1, 1);
    const rows = Array.isArray(firstPage.rows) ? firstPage.rows.slice() : [];
    for (let page = 2; page <= totalPages; page += 1) {
      const payload = await fetchListPage(win, dateString, page);
      if (Array.isArray(payload.rows)) rows.push.apply(rows, payload.rows);
    }
    return rows.map(buildRowViewModel);
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
    if (!value) throw new Error("XLS 응답 본문이 비어 있습니다.");
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    throw new Error("XLS 응답을 ArrayBuffer로 읽지 못했습니다.");
  }

  function arrayBufferToText(buffer) {
    return new TextDecoder("utf-8").decode(new Uint8Array(buffer));
  }

  function resolveRequestScope(scope) {
    if (scope) return scope;
    if (root && root.unsafeWindow && root.unsafeWindow.location) return root.unsafeWindow;
    if (root && root.window && root.window.location) return root.window;
    return root;
  }

  function buildFetchRequestUrl(details, scope) {
    const preferredUrl = safeTrim(details && details.fetchUrl ? details.fetchUrl : details && details.url);
    const resolvedScope = resolveRequestScope(scope);
    if (/^https?:\/\//i.test(preferredUrl) && resolvedScope && resolvedScope.location) {
      const origin = String(resolvedScope.location.origin || "");
      if (preferredUrl.indexOf(origin) === 0) return preferredUrl.slice(origin.length) || "/";
    }
    return preferredUrl;
  }

  function requestViaXhr(details, scope) {
    const win = resolveRequestScope(scope);
    const Xhr = (win && win.XMLHttpRequest) || (typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest : null);
    if (typeof Xhr !== "function") return Promise.reject(new Error("요청 수단을 찾지 못했습니다."));

    return new Promise((resolve, reject) => {
      const xhr = new Xhr();
      xhr.open(details && details.method ? details.method : "GET", buildFetchRequestUrl(details, win), true);
      xhr.responseType = "arraybuffer";
      xhr.withCredentials = true;
      xhr.timeout = details && details.timeout ? details.timeout : 30000;
      Object.keys(details && details.headers ? details.headers : {}).forEach((key) => {
        xhr.setRequestHeader(key, details.headers[key]);
      });
      xhr.onload = () => resolve({
        status: xhr.status,
        responseHeaders: typeof xhr.getAllResponseHeaders === "function" ? xhr.getAllResponseHeaders() : "",
        response: xhr.response,
      });
      xhr.onerror = () => reject(new Error("요청에 실패했습니다."));
      xhr.ontimeout = () => reject(new Error("요청 시간이 초과되었습니다."));
      xhr.send(null);
    });
  }

  function gmRequest(loader, details, scope) {
    if (loader && typeof loader.gmRequest === "function") {
      return loader.gmRequest(details);
    }

    const requestScope = resolveRequestScope(scope);
    const gmTransport = (requestScope && requestScope.GM_xmlhttpRequest) || (typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
    if (typeof gmTransport === "function") {
      return new Promise((resolve, reject) => {
        gmTransport(Object.assign({}, details, {
          onload: resolve,
          onerror: (response) => reject(new Error(response && response.error ? response.error : "요청에 실패했습니다.")),
          ontimeout: () => reject(new Error("요청 시간이 초과되었습니다.")),
        }));
      });
    }

    const fetchTransport = requestScope && typeof requestScope.fetch === "function"
      ? requestScope.fetch.bind(requestScope)
      : (typeof fetch === "function" ? fetch.bind(root) : null);

    if (!fetchTransport) return requestViaXhr(details, requestScope);

    return fetchTransport(buildFetchRequestUrl(details, requestScope), {
      method: details && details.method ? details.method : "GET",
      headers: Object.assign({}, details && details.headers ? details.headers : {}),
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      mode: "same-origin",
    }).then(async (response) => ({
      status: response.status,
      responseHeaders: Array.from(response.headers.entries()).map((entry) => entry[0] + ": " + entry[1]).join("\r\n"),
      response: await response.arrayBuffer(),
    })).catch(() => requestViaXhr(details, requestScope));
  }

  function buildWorkbookRequestQuery(selection) {
    return toQueryString({
      ORDLIST_IVDATE: compactDate(selection.ivmstr_date || todayString()),
      ORDLIST_IVNO: selection.ivmstr_ivno,
      formType: "site320main",
    });
  }

  async function downloadWorkbookBuffer(runtime, selection) {
    const query = buildWorkbookRequestQuery(selection);
    const response = await gmRequest(runtime.loader, {
      method: "GET",
      url: runtime.win.location.origin + XLS_ENDPOINT + "?" + query,
      fetchUrl: XLS_ENDPOINT + "?" + query,
      responseType: "arraybuffer",
      timeout: 30000,
      headers: { Accept: "application/vnd.ms-excel,application/octet-stream,*/*" },
      anonymous: false,
    }, runtime.win);

    const headers = parseResponseHeaders(response.responseHeaders);
    const buffer = ensureArrayBuffer(response.response);
    const contentType = String(headers["content-type"] || "").toLowerCase();

    if (Number(response.status) >= 400) throw new Error("XLS 다운로드 실패 (" + response.status + ")");
    if (contentType.indexOf("text/html") !== -1 || contentType.indexOf("application/json") !== -1) {
      const text = arrayBufferToText(buffer);
      if (isSessionExpiredResponse(text, contentType)) throw new Error("세션이 종료되었습니다. 다시 로그인하세요.");
      throw new Error("XLS 대신 HTML 응답이 내려왔습니다.");
    }

    return buffer;
  }

  function normalizeHeaderLabel(value) {
    return safeTrim(value).replace(/\s+/g, "").toLowerCase();
  }

  function findHeaderIndex(headerRow, aliases) {
    const normalizedHeader = (Array.isArray(headerRow) ? headerRow : []).map(normalizeHeaderLabel);
    const targets = (Array.isArray(aliases) ? aliases : []).map(normalizeHeaderLabel);
    for (let index = 0; index < normalizedHeader.length; index += 1) {
      if (targets.indexOf(normalizedHeader[index]) !== -1) return index;
    }
    return -1;
  }

  function dedupeInvoiceRows(rows) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const invoice = safeTrim(row && row.invoiceNumber);
      if (!invoice) return Object.assign({}, row, { invoiceNumber: "" });
      if (seen.has(invoice)) return Object.assign({}, row, { invoiceNumber: "" });
      seen.add(invoice);
      return Object.assign({}, row, { invoiceNumber: invoice });
    });
  }

  function buildWorkbookDisplayRows(sheetRows) {
    if (!Array.isArray(sheetRows) || !sheetRows.length) throw new Error("엑셀 데이터가 비어 있습니다.");

    const headerRow = sheetRows[0];
    const columnIndexes = {
      invoiceNumber: findHeaderIndex(headerRow, HEADER_ALIASES.invoiceNumber),
      shippedAt: findHeaderIndex(headerRow, HEADER_ALIASES.shippedAt),
      mall: findHeaderIndex(headerRow, HEADER_ALIASES.mall),
      orderNumber: findHeaderIndex(headerRow, HEADER_ALIASES.orderNumber),
      matchedNicn: findHeaderIndex(headerRow, HEADER_ALIASES.matchedNicn),
      matchedName: findHeaderIndex(headerRow, HEADER_ALIASES.matchedName),
      matchedQty: findHeaderIndex(headerRow, HEADER_ALIASES.matchedQty),
    };

    const missingKeys = Object.keys(columnIndexes).filter((key) => columnIndexes[key] === -1);
    if (missingKeys.length) throw new Error("엑셀 헤더를 찾지 못했습니다: " + missingKeys.join(", "));

    const rows = [];
    for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
      const row = Array.isArray(sheetRows[rowIndex]) ? sheetRows[rowIndex] : [];
      const item = {
        invoiceNumber: safeTrim(row[columnIndexes.invoiceNumber]),
        shippedAt: safeTrim(row[columnIndexes.shippedAt]),
        mall: safeTrim(row[columnIndexes.mall]),
        orderNumber: safeTrim(row[columnIndexes.orderNumber]),
        matchedNicn: safeTrim(row[columnIndexes.matchedNicn]),
        matchedName: safeTrim(row[columnIndexes.matchedName]),
        matchedQty: safeTrim(row[columnIndexes.matchedQty]),
      };
      if (Object.keys(item).some((key) => !!item[key])) rows.push(item);
    }

    return dedupeInvoiceRows(rows);
  }

  function summarizeWorkbookRows(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    return {
      totalRows: normalizedRows.length,
      uniqueInvoiceCount: normalizedRows.filter((row) => !!safeTrim(row.invoiceNumber)).length,
    };
  }

  function parseWorkbookBuffer(buffer, scope) {
    const xlsx = getXlsx(scope);
    if (!xlsx || typeof xlsx.read !== "function") throw new Error("XLSX 라이브러리가 로드되지 않았습니다.");

    const workbook = xlsx.read(new Uint8Array(buffer), { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    return buildWorkbookDisplayRows(rows);
  }

  function buildPanelHtml(moduleUi) {
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "popup", className: "tm-invoice-list-viewer-popup", density: "compact" })
      : 'class="tm-ui-root tm-ui-popup tm-invoice-list-viewer-popup" data-tm-density="compact"';

    return [
      '<div id="' + PANEL_ID + '" ' + rootAttrs + '>',
      '  <div class="tm-ui-shell tm-invoice-list-viewer__shell">',
      '    <section class="tm-ui-card tm-invoice-list-viewer__card">',
      '      <div class="tm-ui-panel-head">',
      '        <div class="tm-ui-head-meta">',
      "          <div>",
      '            <p class="tm-ui-kicker">B2B Outbound</p>',
      '            <h1 class="tm-ui-title">B2B 출고데이터 뷰어</h1>',
      '            <p class="tm-ui-subtitle">B2B 출고 차수 목록을 조회하고 선택 차수의 XLS를 바로 읽어 표로 확인합니다.</p>',
      "          </div>",
      '          <div class="tm-invoice-list-viewer__head-actions">',
      '            <span class="tm-ui-badge tm-ui-badge--info tm-invoice-list-viewer__head-note">오늘 자동 조회</span>',
      '            <button type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="close-window">창 닫기</button>',
      "          </div>",
      "        </div>",
      "      </div>",
      '      <div class="tm-invoice-list-viewer__body tm-ui-stack">',
      '        <div class="tm-invoice-list-viewer__toolbar">',
      '          <div class="tm-ui-statusbar tm-invoice-list-viewer__filters">',
      '            <label class="tm-ui-label"><span>출력일</span><input id="' + DATE_INPUT_ID + '" type="date" class="tm-ui-input"></label>',
      '            <button type="button" data-action="refresh-list" class="tm-ui-btn tm-ui-btn--primary" id="tm-invoice-list-viewer-refresh">조회</button>',
      "          </div>",
      '          <div id="' + STATUS_ID + '" class="tm-ui-message tm-invoice-list-viewer__status">준비됨. 오늘 날짜 기준으로 자동 조회합니다.</div>',
      "        </div>",
      '        <div class="tm-ui-card tm-invoice-list-viewer__section">',
      '          <div class="tm-ui-section-head">',
      "            <div>",
      '              <div class="tm-ui-section-title">출력 차수 목록</div>',
      '              <p class="tm-ui-section-subtitle">차수, 택배사, 판매처, 건수, 메모 기준으로 표시합니다.</p>',
      "            </div>",
      '            <span id="' + LIST_META_ID + '" class="tm-ui-inline-note">0건</span>',
      "          </div>",
      '          <div class="tm-ui-scroll tm-invoice-list-viewer__list-scroll">',
      '            <table class="tm-ui-table">',
      '              <thead><tr><th data-tm-align="center">차수</th><th data-tm-align="center">택배사</th><th data-tm-align="center">판매처</th><th data-tm-align="center">건수</th><th data-tm-align="left">메모</th><th data-tm-align="center">동작</th></tr></thead>',
      '              <tbody id="' + LIST_BODY_ID + '"><tr><td colspan="6" class="tm-ui-empty">조회된 출력 차수가 없습니다.</td></tr></tbody>',
      "            </table>",
      "          </div>",
      "        </div>",
      '        <div class="tm-ui-card tm-invoice-list-viewer__section">',
      '          <div class="tm-ui-section-head">',
      "            <div>",
      '              <div class="tm-ui-section-title">XLS 데이터</div>',
      '              <p class="tm-ui-section-subtitle">송장번호는 중복을 제거하되 행 위치는 유지합니다.</p>',
      "            </div>",
      '            <span id="' + RESULT_META_ID + '" class="tm-ui-inline-note">선택된 차수 없음</span>',
      "          </div>",
      '          <div class="tm-ui-scroll tm-invoice-list-viewer__result-scroll">',
      '            <table class="tm-ui-table">',
      '              <thead><tr><th data-tm-align="center">송장번호</th><th data-tm-align="center">발송일</th><th data-tm-align="center">쇼핑몰</th><th data-tm-align="center">주문번호</th><th data-tm-align="left">매칭관리명</th><th data-tm-align="left">매칭상품명</th><th data-tm-align="center">매칭수량</th></tr></thead>',
      '              <tbody id="' + RESULT_BODY_ID + '"><tr><td colspan="7" class="tm-ui-empty">차수를 선택하면 여기에서 결과를 볼 수 있습니다.</td></tr></tbody>',
      "            </table>",
      "          </div>",
      "        </div>",
      "      </div>",
      "    </section>",
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
      ".tm-invoice-list-viewer-popup{background:#f4f6f6;min-height:100vh}",
      ".tm-invoice-list-viewer__shell{padding:18px;max-width:1480px;margin:0 auto}",
      ".tm-invoice-list-viewer__card{overflow:hidden}",
      ".tm-invoice-list-viewer__body{padding:14px 16px}",
      ".tm-invoice-list-viewer__head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__toolbar{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:10px;align-items:stretch}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__filters{justify-content:space-between;gap:10px;align-items:end}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__status{display:flex;align-items:center;min-height:54px}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__status.is-success{background:rgba(45,95,212,.08);border-color:rgba(45,95,212,.18);color:var(--tm-primary-strong)}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__status.is-danger,#" + PANEL_ID + " .tm-invoice-list-viewer__status.is-warning{background:rgba(201,81,81,.08);border-color:rgba(201,81,81,.18);color:var(--tm-danger)}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__section{padding:12px}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll{max-height:300px}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll{max-height:380px}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll thead th,#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll thead th{position:sticky;top:0;z-index:2;background:#f0f2f4;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll tbody td,#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll tbody td{text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll th:nth-child(1),#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll td:nth-child(1){width:78px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll th:nth-child(4),#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll td:nth-child(4){width:76px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll th:nth-child(6),#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll td:nth-child(6){width:92px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll th:nth-child(5),#" + PANEL_ID + " .tm-invoice-list-viewer__list-scroll td:nth-child(5){text-align:left}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(1),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(1){width:120px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(2),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(2){width:94px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(4),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(4){width:120px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(7),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(7){width:84px;text-align:center}",
      "#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(5),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(5),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll th:nth-child(6),#" + PANEL_ID + " .tm-invoice-list-viewer__result-scroll td:nth-child(6){text-align:left}",
      "#" + PANEL_ID + " .tm-row-selected td{background:rgba(45,95,212,.06)}",
      "@media (max-width: 900px){.tm-invoice-list-viewer__shell{padding:10px}.tm-invoice-list-viewer__body{padding:12px}#" + PANEL_ID + " .tm-invoice-list-viewer__toolbar{grid-template-columns:1fr}#" + PANEL_ID + " .tm-invoice-list-viewer__filters{justify-content:flex-start}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getPageState(win, loader) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        pageWin: scope,
        loader: loader || null,
        navReady: false,
        lastQueryDate: todayString(),
        popupWin: null,
        popupState: null,
      };
    }
    if (loader) scope[STATE_KEY].loader = loader;
    return scope[STATE_KEY];
  }

  function syncNavButtonState(pageState, isOpen) {
    const doc = pageState.pageWin.document;
    const button = doc.getElementById(NAV_BUTTON_ID);
    if (button) {
      button.classList.toggle("is-open", !!isOpen);
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  function getPopupDocument(popupState) {
    return popupState && popupState.popupWin ? popupState.popupWin.document : null;
  }

  function createPopupState(pageState, popupWin) {
    return {
      pageState,
      popupWin,
      queryDate: pageState.lastQueryDate || todayString(),
      rows: [],
      listLoading: false,
      selectedRowId: "",
      resultRows: [],
      resultMetaText: "선택된 차수 없음",
    };
  }

  function setStatus(popupState, text, tone) {
    const doc = getPopupDocument(popupState);
    const node = doc && doc.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = text;
    node.className = "tm-ui-message tm-invoice-list-viewer__status" +
      (tone === "danger"
        ? " is-danger"
        : tone === "success"
          ? " is-success"
          : tone === "warning"
            ? " is-warning"
            : "");
  }

  function setRefreshing(popupState, refreshing) {
    const doc = getPopupDocument(popupState);
    const button = doc && doc.getElementById("tm-invoice-list-viewer-refresh");
    if (!button) return;
    button.disabled = !!refreshing;
    button.textContent = refreshing ? "조회 중..." : "조회";
  }

  function renderListTable(popupState) {
    const doc = getPopupDocument(popupState);
    const tbody = doc.getElementById(LIST_BODY_ID);
    const meta = doc.getElementById(LIST_META_ID);
    if (!tbody || !meta) return;

    meta.textContent = popupState.rows.length + "건";
    if (!popupState.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="tm-ui-empty">조회된 출력 차수가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = popupState.rows.map((row) => {
      const selected = row.id === popupState.selectedRowId;
      return [
        "<tr" + (selected ? " class='tm-row-selected'" : "") + ">",
        "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.ivmstr_ivno ? row.ivmstr_ivno + "차" : "-")) + "</td>",
        "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.expr_name || "-")) + "</td>",
        "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.site_name || "-")) + "</td>",
        "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.ivcnt || "-")) + "</td>",
        "<td data-tm-align='left' class='tm-invoice-list-viewer__memo-cell' title='" + escapeHtml(row.ivmstr_memo || "-") + "'>" + escapeHtml(toDisplayCellText(row.ivmstr_memo || "-")) + "</td>",
        "<td data-tm-align='center'><button type='button' class='tm-ui-btn " + (selected ? "tm-ui-btn--success" : "tm-ui-btn--secondary") + "' data-action='load-row' data-row-id='" + escapeHtml(row.id) + "'>" + (selected ? "다시 불러오기" : "불러오기") + "</button></td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function renderResultTable(popupState) {
    const doc = getPopupDocument(popupState);
    const tbody = doc.getElementById(RESULT_BODY_ID);
    const meta = doc.getElementById(RESULT_META_ID);
    if (!tbody || !meta) return;

    meta.textContent = popupState.resultMetaText || "선택된 차수 없음";
    if (!popupState.resultRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="tm-ui-empty">차수를 선택하면 여기에서 결과를 볼 수 있습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = popupState.resultRows.map((row) => [
      "<tr>",
      "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.invoiceNumber)) + "</td>",
      "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.shippedAt)) + "</td>",
      "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.mall)) + "</td>",
      "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.orderNumber)) + "</td>",
      "<td data-tm-align='left'>" + escapeHtml(toDisplayCellText(row.matchedNicn)) + "</td>",
      "<td data-tm-align='left'>" + escapeHtml(toDisplayCellText(row.matchedName)) + "</td>",
      "<td data-tm-align='center'>" + escapeHtml(toDisplayCellText(row.matchedQty)) + "</td>",
      "</tr>",
    ].join("")).join("");
  }

  function render(popupState) {
    const doc = getPopupDocument(popupState);
    if (!doc) return;
    const dateInput = doc.getElementById(DATE_INPUT_ID);
    if (dateInput) dateInput.value = popupState.queryDate;
    renderListTable(popupState);
    renderResultTable(popupState);
  }

  async function refreshList(popupState) {
    if (!popupState || popupState.listLoading) return;

    popupState.listLoading = true;
    popupState.rows = [];
    popupState.selectedRowId = "";
    popupState.resultRows = [];
    popupState.resultMetaText = "선택된 차수 없음";
    popupState.pageState.lastQueryDate = popupState.queryDate;
    setRefreshing(popupState, true);
    setStatus(popupState, "출력 차수 목록을 조회하는 중입니다.", "");
    render(popupState);

    try {
      popupState.rows = await fetchAllRows(popupState.pageState.pageWin, popupState.queryDate);
      setStatus(popupState, "출력 차수 " + popupState.rows.length + "건을 불러왔습니다.", "success");
    } catch (error) {
      setStatus(popupState, error && error.message ? error.message : "출력 차수 조회에 실패했습니다.", "danger");
    } finally {
      popupState.listLoading = false;
      setRefreshing(popupState, false);
      render(popupState);
    }
  }

  async function loadSelection(popupState, rowId) {
    const selection = popupState.rows.find((row) => row.id === rowId);
    if (!selection) return;

    const dateLabel = formatBatchDateLabel(selection.ivmstr_date);
    popupState.selectedRowId = selection.id;
    popupState.resultRows = [];
    popupState.resultMetaText = dateLabel + " / " + selection.ivmstr_ivno + "차 적재 중";
    setStatus(popupState, selection.ivmstr_ivno + "차 XLS를 내려받아 파싱하는 중입니다.", "");
    render(popupState);

    try {
      const rows = parseWorkbookBuffer(await downloadWorkbookBuffer({
        win: popupState.pageState.pageWin,
        loader: popupState.pageState.loader,
      }, selection), popupState.pageState.pageWin);
      const summary = summarizeWorkbookRows(rows);
      popupState.resultRows = rows;
      popupState.resultMetaText = [
        dateLabel,
        selection.ivmstr_ivno + "차",
        selection.site_name || "",
        "총 " + summary.totalRows + "건 / 고유 송장 " + summary.uniqueInvoiceCount + "건",
      ].filter(Boolean).join(" / ");
      setStatus(popupState, selection.ivmstr_ivno + "차 XLS를 " + summary.totalRows + "행으로 정리했습니다.", "success");
    } catch (error) {
      popupState.resultRows = [];
      popupState.resultMetaText = selection.ivmstr_ivno + "차 적재 실패";
      setStatus(popupState, error && error.message ? error.message : "XLS를 처리하지 못했습니다.", "danger");
    } finally {
      render(popupState);
    }
  }

  function renderPopupShell(popupState) {
    const popupWin = popupState.popupWin;
    const doc = popupWin.document;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>B2B 출고데이터 뷰어</title></head><body></body></html>");
    doc.close();
    ensureStyles(doc);
    doc.body.innerHTML = buildPanelHtml(getModuleUi(root));
    render(popupState);
  }

  function bindPopupEvents(popupState) {
    const popupWin = popupState.popupWin;
    const doc = popupWin.document;
    const dateInput = doc.getElementById(DATE_INPUT_ID);
    const panel = doc.getElementById(PANEL_ID);

    if (!panel || !dateInput) return;

    panel.addEventListener("click", (event) => {
      const actionTarget = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
      if (!actionTarget) return;

      const action = actionTarget.getAttribute("data-action");
      if (action === "close-window") {
        popupWin.close();
        return;
      }
      if (action === "refresh-list") {
        popupState.queryDate = dateInput.value || todayString();
        void refreshList(popupState);
        return;
      }
      if (action === "load-row") {
        void loadSelection(popupState, actionTarget.getAttribute("data-row-id"));
      }
    });

    dateInput.addEventListener("change", (event) => {
      popupState.queryDate = event.target.value || todayString();
      popupState.pageState.lastQueryDate = popupState.queryDate;
    });

    popupWin.addEventListener("beforeunload", () => {
      popupState.pageState.popupWin = null;
      popupState.pageState.popupState = null;
      syncNavButtonState(popupState.pageState, false);
    });
  }

  function openDashboard(pageState) {
    if (pageState.popupWin && !pageState.popupWin.closed) {
      pageState.popupWin.focus();
      return;
    }

    const popupWin = pageState.pageWin.open("", POPUP_NAME, POPUP_FEATURES);
    if (!popupWin) return;

    const popupState = createPopupState(pageState, popupWin);
    pageState.popupWin = popupWin;
    pageState.popupState = popupState;
    renderPopupShell(popupState);
    bindPopupEvents(popupState);
    syncNavButtonState(pageState, true);
    popupWin.focus();
    void refreshList(popupState);
  }

  function installNavButton(pageState) {
    if (pageState.navReady) return;

    const navMenu = getNavMenu(pageState.pageWin);
    if (!navMenu || typeof navMenu.installNavButton !== "function") return;

    pageState.navReady = true;
    navMenu.installNavButton(pageState.pageWin, {
      navSelector: NAV_SELECTOR,
      retryLimit: NAV_RETRY_LIMIT,
      retryDelayMs: NAV_RETRY_DELAY_MS,
      buttonId: NAV_BUTTON_ID,
      label: NAV_BUTTON_LABEL,
      insertBeforeLabel: NAV_INSERT_BEFORE_LABEL,
      onClick() {
        openDashboard(pageState);
      },
    });
  }

  function shouldRun(win) {
    if (!win) return false;
    const currentHref = String(win.location && win.location.href || "");
    const topHref = resolveTopHref(win);
    if (isExcludedPageHref(currentHref) || isExcludedPageHref(topHref)) return false;
    return SITE_URL_PATTERN.test(currentHref) || SITE_URL_PATTERN.test(topHref);
  }

  function start(context) {
    const sourceWin = context && context.window ? context.window : root;
    if (!sourceWin || !sourceWin.document || !shouldRun(sourceWin)) return;

    const win = resolveUiWindow(sourceWin);
    if (!win || !win.document || win.__tmInvoiceListViewerStarted) return;
    win.__tmInvoiceListViewerStarted = true;

    const loader = context && context.loader ? context.loader : null;
    const pageState = getPageState(win, loader);
    const mountAndInstall = function mountAndInstall() {
      installNavButton(pageState);
    };

    if (win.document.readyState === "loading") {
      win.document.addEventListener("DOMContentLoaded", mountAndInstall, { once: true });
      return;
    }
    mountAndInstall();
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    buildListRequestParams,
    buildWorkbookRequestQuery,
    buildWorkbookDisplayRows,
    buildRowViewModel,
    dedupeInvoiceRows,
    EMPTY_CELL_FILLER,
    toDisplayCellText,
    buildPanelHtml,
    formatBatchDateLabel,
    shouldRun,
    resolveTopHref,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);









