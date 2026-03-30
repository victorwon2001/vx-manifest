module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "inbound-data-viewer";
  const MODULE_NAME = "입고 데이터 뷰어";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const DATA_ENDPOINT = "/stm/stm100main4_jdata";
  const CATALOG_XLS_ENDPOINT = "/util/ExlForm_DB";
  const CATALOG_FORM_TYPE = "base100main_3";
  const STATE_KEY = "__tmInboundDataViewerState";
  const STYLE_ID = "tm-inbound-data-viewer-style";
  const MODAL_ID = "tm-inbound-data-viewer-modal";
  const FALLBACK_CACHE_KEY = "__tmInboundDataViewerSiteCache";
  const STORAGE_CACHE_KEY = "siteCache";

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(dateString) {
    if (!dateString || typeof dateString !== "string") return "-";
    return dateString.split(" ")[0].replace(/-/g, "");
  }

  function normalizeCacheKey(value) {
    return safeTrim(value);
  }

  function isValidSiteValue(value) {
    const normalized = safeTrim(value);
    const lowered = normalized.toLowerCase();
    return !!normalized && lowered !== "null" && lowered !== "undefined";
  }

  function createNormalizedRow(item) {
    if (item && Object.prototype.hasOwnProperty.call(item, "date") && Object.prototype.hasOwnProperty.call(item, "nicn")) {
      return {
        date: safeTrim(item.date) || "-",
        site: isValidSiteValue(item.site) ? safeTrim(item.site) : "-",
        nicn: safeTrim(item.nicn) || "-",
        name: safeTrim(item.name) || "-",
        quantity: safeTrim(item.quantity) || "0",
      };
    }

    return {
      date: formatDate(item && item.inoutstock_sysdate),
      site: "-",
      nicn: item && item.basic_nicn ? String(item.basic_nicn) : "-",
      name: item && item.basic_name ? String(item.basic_name) : "-",
      quantity: item && item.inoutstock_inqty != null && item.inoutstock_inqty !== ""
        ? String(item.inoutstock_inqty)
        : "0",
    };
  }

  function applySiteCache(rows, cache) {
    const cacheMap = cache && typeof cache === "object" ? cache : {};
    return (Array.isArray(rows) ? rows : []).map((item) => {
      const row = createNormalizedRow(item);
      const cacheKey = normalizeCacheKey(row.nicn);
      const cachedSite = cacheKey ? cacheMap[cacheKey] : "";
      row.site = isValidSiteValue(cachedSite)
        ? safeTrim(cachedSite)
        : (isValidSiteValue(row.site) ? safeTrim(row.site) : "-");
      return row;
    });
  }

  function normalizeRows(rows, cache) {
    return applySiteCache((Array.isArray(rows) ? rows : []).map(createNormalizedRow), cache);
  }

  function buildClipboardText(rows) {
    const header = "입고일\t판매처\t관리명\t상품명\t입고수량";
    const body = normalizeRows(rows).map((row) => {
      return [row.date, row.site, row.nicn, row.name, row.quantity].join("\t");
    }).join("\n");
    return body ? header + "\n" + body : header;
  }

  function buildTableBodyHtml(rows) {
    const normalizedRows = normalizeRows(rows);
    if (!normalizedRows.length) {
      return '<tr><td colspan="5" class="tm-ui-empty">표시할 입고 데이터가 없습니다.</td></tr>';
    }
    return normalizedRows.map((row) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(row.date) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.site) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.nicn) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.name) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.quantity) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildModalHtml(state) {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "embedded", className: "tm-inbound-viewer", density: "compact" })
      : 'class="tm-inbound-viewer"';
    const normalizedRows = normalizeRows(state && state.rows);
    const noteText = safeTrim(state && state.noteText) || "표 형식으로 클립보드 복사를 지원합니다.";

    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-overlay tm-inbound-viewer__overlay" style="display:flex;">',
      '    <div class="tm-ui-modal tm-inbound-viewer__modal">',
      '      <div class="tm-ui-modal__head">',
      "        <div>",
      '          <p class="tm-ui-kicker">Inbound Data</p>',
      '          <h3 class="tm-ui-section-title">입고 데이터 확인</h3>',
      '          <p class="tm-ui-section-subtitle">최근 조회 결과를 판매처 포함 표로 확인하고 그대로 복사할 수 있습니다.</p>',
      "        </div>",
      '        <span class="tm-ui-badge">' + normalizedRows.length + "건</span>",
      "      </div>",
      '      <div class="tm-ui-modal__body tm-ui-stack">',
      '        <div class="tm-ui-scroll">',
      '          <table class="tm-ui-table">',
      "            <thead>",
      "              <tr>",
      '                <th data-tm-align="center">입고일</th>',
      '                <th data-tm-align="center">판매처</th>',
      '                <th data-tm-align="center">관리명</th>',
      '                <th data-tm-align="center">상품명</th>',
      '                <th data-tm-align="center">입고수량</th>',
      "              </tr>",
      "            </thead>",
      '            <tbody>' + buildTableBodyHtml(normalizedRows) + "</tbody>",
      "          </table>",
      "        </div>",
      '        <div id="tm-inbound-viewer-feedback" class="tm-ui-inline-note">' + escapeHtml(noteText) + "</div>",
      "      </div>",
      '      <div class="tm-ui-modal__foot">',
      '        <button type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="close">닫기</button>',
      '        <button type="button" class="tm-ui-btn tm-ui-btn--primary" data-action="copy">테이블 복사</button>',
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
      "#" + MODAL_ID + "{position:fixed;inset:0;z-index:99999}",
      "#" + MODAL_ID + " .tm-inbound-viewer__overlay{padding:20px;background:rgba(45,52,53,.28);backdrop-filter:blur(6px)}",
      "#" + MODAL_ID + " .tm-inbound-viewer__modal{width:min(1180px,94vw)}",
      "#" + MODAL_ID + " .tm-ui-modal__head{align-items:flex-start}",
      "#" + MODAL_ID + " .tm-ui-scroll{max-height:min(66vh,720px)}",
      "#" + MODAL_ID + " .tm-ui-table th,#" + MODAL_ID + " .tm-ui-table td{text-align:center}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(1),#" + MODAL_ID + " .tm-ui-table td:nth-child(1){width:110px}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(2),#" + MODAL_ID + " .tm-ui-table td:nth-child(2){width:150px}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(3),#" + MODAL_ID + " .tm-ui-table td:nth-child(3){width:160px}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(5),#" + MODAL_ID + " .tm-ui-table td:nth-child(5){width:100px}",
      "#" + MODAL_ID + " .tm-ui-table tbody tr:nth-child(even) td{background:rgba(84,96,103,.03)}",
      "#" + MODAL_ID + " .tm-ui-modal__foot{justify-content:space-between}",
      "@media (max-width: 768px){#" + MODAL_ID + " .tm-inbound-viewer__modal{width:min(100vw,100%)}#" + MODAL_ID + " .tm-inbound-viewer__overlay{padding:12px}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getState(win, loader) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        rows: [],
        loader: loader || null,
        noteText: "표 형식으로 클립보드 복사를 지원합니다.",
        catalogPromise: null,
      };
    }
    if (loader) scope[STATE_KEY].loader = loader;
    return scope[STATE_KEY];
  }

  function closeModal(win) {
    const doc = win && win.document;
    if (!doc) return;
    const modal = doc.getElementById(MODAL_ID);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  function setFeedback(win, text, kind) {
    const doc = win && win.document;
    const feedback = doc && doc.getElementById("tm-inbound-viewer-feedback");
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = kind === "error"
      ? "tm-ui-badge tm-ui-badge--danger"
      : "tm-ui-badge tm-ui-badge--success";
  }

  function fallbackCopy(win, text) {
    const doc = win && win.document;
    if (!doc || !doc.body) return Promise.reject(new Error("문서를 찾지 못했습니다."));
    const textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    doc.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
    doc.body.removeChild(textarea);
    if (!succeeded) return Promise.reject(new Error("복사 명령을 수행하지 못했습니다."));
    return Promise.resolve();
  }

  function copyRows(win, state) {
    const text = buildClipboardText(state.rows);
    const loader = state && state.loader;
    if (loader && typeof loader.copyText === "function") return loader.copyText(text);
    if (win && win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === "function") {
      return win.navigator.clipboard.writeText(text);
    }
    return fallbackCopy(win, text);
  }

  function openModal(win, state) {
    const doc = win && win.document;
    if (!doc || !doc.body) return;
    ensureStyles(doc);
    closeModal(win);
    const container = doc.createElement("div");
    container.id = MODAL_ID;
    container.innerHTML = buildModalHtml(state);
    doc.body.appendChild(container);

    container.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("button[data-action]") : null;
      if (button) {
        const action = button.getAttribute("data-action");
        if (action === "close") return void closeModal(win);
        if (action === "copy") {
          copyRows(win, state)
            .then(() => setFeedback(win, "테이블 데이터가 클립보드에 복사되었습니다.", "success"))
            .catch((error) => {
              setFeedback(win, error && error.message ? error.message : "클립보드 복사에 실패했습니다.", "error");
            });
          return;
        }
      }
      if (event.target === container) closeModal(win);
    });
  }

  function renderIfOpen(win, state) {
    const doc = win && win.document;
    if (!doc || !doc.getElementById(MODAL_ID)) return;
    openModal(win, state);
  }

  function buildResponseHeadersText(headers) {
    const items = [];
    headers.forEach((value, key) => {
      items.push(String(key) + ": " + String(value));
    });
    return items.join("\r\n");
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
      responseHeaders: buildResponseHeadersText(response.headers),
      response: await response.arrayBuffer(),
    })).catch(() => requestViaXhr(details, requestScope));
  }

  function isSessionExpiredResponse(bodyText, contentType) {
    const text = String(bodyText || "");
    const type = String(contentType || "").toLowerCase();
    return text.indexOf("자동 로그아웃 되었습니다") !== -1 ||
      text.indexOf("/home/docs/login.html") !== -1 ||
      (type.indexOf("text/html") !== -1 && text.indexOf("로그인") !== -1);
  }

  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null) search.set(key, String(params[key]));
    });
    return search.toString();
  }

  function buildCatalogRequestQuery() {
    return toQueryString({
      BASIC_CUST: "4603",
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
      BASIC_DEPTH1: "",
      BASIC_DEPTH2: "",
      BASIC_DEPTH3: "",
      BASIC_SPTYP: "",
      BASIC_SPRTN: "",
      BSADD_EDITYN: "",
      BSADD_EDITDT: "",
      BSADD_REGYN: "",
      BSADD_REGDT: "",
      BASIC_LOCATION: "",
      BASIC_GBN: "S",
      BASIC_BIGO: "",
      formType: CATALOG_FORM_TYPE,
    });
  }

  async function downloadCatalogWorkbookBuffer(win, state) {
    const query = buildCatalogRequestQuery();
    const response = await gmRequest(state && state.loader, {
      method: "GET",
      url: win.location.origin + CATALOG_XLS_ENDPOINT + "?" + query,
      fetchUrl: CATALOG_XLS_ENDPOINT + "?" + query,
      responseType: "arraybuffer",
      timeout: 30000,
      headers: { Accept: "application/vnd.ms-excel,application/octet-stream,*/*" },
      anonymous: false,
    }, win);

    const headers = parseResponseHeaders(response.responseHeaders);
    const buffer = ensureArrayBuffer(response.response);
    const contentType = String(headers["content-type"] || "").toLowerCase();

    if (Number(response.status) >= 400) throw new Error("상품정보 XLS 다운로드 실패 (" + response.status + ")");
    if (contentType.indexOf("text/html") !== -1 || contentType.indexOf("application/json") !== -1) {
      const text = arrayBufferToText(buffer);
      if (isSessionExpiredResponse(text, contentType)) throw new Error("세션이 종료되었습니다. 다시 로그인하세요.");
      throw new Error("상품정보 XLS 대신 HTML 응답이 내려왔습니다.");
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

  function buildCatalogSiteMap(sheetRows) {
    const rows = Array.isArray(sheetRows) ? sheetRows : [];
    const headerRow = rows[0] || [];
    const nicnIndex = findHeaderIndex(headerRow, ["관리명"]);
    const siteIndex = findHeaderIndex(headerRow, ["비고"]);
    if (nicnIndex === -1 || siteIndex === -1) throw new Error("상품정보 XLS 헤더에서 관리명/비고 열을 찾지 못했습니다.");

    const siteMap = {};
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const cacheKey = normalizeCacheKey(row[nicnIndex]);
      const site = safeTrim(row[siteIndex]);
      if (!cacheKey || !isValidSiteValue(site)) continue;
      if (!Object.prototype.hasOwnProperty.call(siteMap, cacheKey)) {
        siteMap[cacheKey] = site;
      }
    }
    return siteMap;
  }

  function parseCatalogWorkbookBuffer(buffer, scope) {
    const xlsx = getXlsx(scope);
    if (!xlsx || typeof xlsx.read !== "function") throw new Error("XLSX 라이브러리가 로드되지 않았습니다.");

    const workbook = xlsx.read(new Uint8Array(buffer), { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("상품정보 엑셀 시트를 찾지 못했습니다.");

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    return buildCatalogSiteMap(rows);
  }

  function sanitizeSiteCache(cache) {
    const source = cache && typeof cache === "object" ? cache : {};
    const next = {};
    Object.keys(source).forEach((key) => {
      const normalizedKey = normalizeCacheKey(key);
      const value = source[key];
      if (normalizedKey && isValidSiteValue(value)) {
        next[normalizedKey] = safeTrim(value);
      }
    });
    return next;
  }

  function mergeSiteCache(cache, siteMap) {
    return Object.assign({}, sanitizeSiteCache(cache), sanitizeSiteCache(siteMap));
  }

  function findMissingCatalogKeys(rows, cache) {
    const cacheMap = cache && typeof cache === "object" ? cache : {};
    const keys = [];
    const seen = new Set();
    normalizeRows(rows).forEach((row) => {
      const cacheKey = normalizeCacheKey(row.nicn);
      if (!cacheKey || seen.has(cacheKey)) return;
      seen.add(cacheKey);
      if (!isValidSiteValue(cacheMap[cacheKey])) keys.push(cacheKey);
    });
    return keys;
  }

  function readCacheFromLoaderStorage(storage) {
    const raw = storage && typeof storage.get === "function"
      ? storage.get(STORAGE_CACHE_KEY, "{}")
      : "{}";
    try {
      return sanitizeSiteCache(JSON.parse(String(raw || "{}")));
    } catch (error) {
      return {};
    }
  }

  function readSiteCache(win, state) {
    const loaderStorage = state && state.loader && state.loader.storage;
    if (loaderStorage && typeof loaderStorage.get === "function") {
      return readCacheFromLoaderStorage(loaderStorage);
    }

    try {
      const storage = win && win.localStorage;
      if (!storage) return {};
      return sanitizeSiteCache(JSON.parse(String(storage.getItem(FALLBACK_CACHE_KEY) || "{}")));
    } catch (error) {
      return {};
    }
  }

  function writeSiteCache(win, state, cache) {
    const next = JSON.stringify(sanitizeSiteCache(cache));
    const loaderStorage = state && state.loader && state.loader.storage;
    if (loaderStorage && typeof loaderStorage.set === "function") {
      loaderStorage.set(STORAGE_CACHE_KEY, next);
      return;
    }

    try {
      if (win && win.localStorage) win.localStorage.setItem(FALLBACK_CACHE_KEY, next);
    } catch (error) {
      // Ignore storage failures and continue with the in-memory view.
    }
  }

  async function resolveSites(win, state) {
    const cache = readSiteCache(win, state);
    state.rows = applySiteCache(state.rows, cache);

    const missingKeys = findMissingCatalogKeys(state.rows, cache);
    if (!missingKeys.length) {
      state.noteText = "판매처 매칭이 반영되었습니다.";
      renderIfOpen(win, state);
      return state.rows;
    }

    if (state.catalogPromise) return state.catalogPromise;

    state.noteText = "판매처 매칭 중...";
    renderIfOpen(win, state);

    state.catalogPromise = downloadCatalogWorkbookBuffer(win, state)
      .then((buffer) => parseCatalogWorkbookBuffer(buffer, win))
      .then((catalogMap) => {
        const mergedCache = mergeSiteCache(cache, catalogMap);
        writeSiteCache(win, state, mergedCache);
        state.rows = applySiteCache(state.rows, mergedCache);
        const unresolved = findMissingCatalogKeys(state.rows, mergedCache);
        state.noteText = unresolved.length
          ? "판매처를 찾지 못한 항목은 - 로 표시됩니다."
          : "판매처 매칭이 반영되었습니다.";
      })
      .catch((error) => {
        state.noteText = error && error.message ? error.message : "판매처 매칭에 실패했습니다.";
      })
      .finally(() => {
        state.catalogPromise = null;
        renderIfOpen(win, state);
      });

    return state.catalogPromise;
  }

  function handleResponseRows(win, state, rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    state.rows = normalizeRows(rows);
    state.noteText = "판매처 매칭 중...";
    openModal(win, state);
    resolveSites(win, state);
  }

  function installXhrHook(win, state) {
    const scope = win || root;
    const proto = scope.XMLHttpRequest && scope.XMLHttpRequest.prototype;
    if (!proto || proto.__tmInboundDataViewerHooked) return;
    const originalOpen = proto.open;
    proto.__tmInboundDataViewerHooked = true;
    proto.open = function patchedOpen(method, url) {
      if (typeof url === "string" && url.indexOf(DATA_ENDPOINT) !== -1 && !this.__tmInboundDataViewerBound) {
        this.__tmInboundDataViewerBound = true;
        this.addEventListener("load", function onInboundDataLoad() {
          if (this.readyState !== 4 || Number(this.status) >= 400) return;
          try {
            const responseData = JSON.parse(String(this.responseText || "{}"));
            handleResponseRows(scope, state, responseData && responseData.rows);
          } catch (error) {
            if (scope.console && typeof scope.console.error === "function") {
              scope.console.error("[입고 데이터 뷰어] 데이터 파싱 오류", error);
            }
          }
        });
      }
      return originalOpen.apply(this, arguments);
    };
  }

  function start(win, loader) {
    const scope = win || root;
    if (!scope || !scope.document) return;
    const state = getState(scope, loader);
    installXhrHook(scope, state);
    ensureStyles(scope.document);
  }

  function run(context) {
    const win = context && context.window ? context.window : root;
    const loader = context && context.loader ? context.loader : null;
    start(win, loader);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    run,
    start,
    formatDate,
    normalizeRows,
    buildClipboardText,
    buildTableBodyHtml,
    isValidSiteValue,
    normalizeCacheKey,
    buildCatalogRequestQuery,
    buildCatalogSiteMap,
    mergeSiteCache,
    findMissingCatalogKeys,
    applySiteCache,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

