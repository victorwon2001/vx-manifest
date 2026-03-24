module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "stock-move-automation";
  const MODULE_NAME = "재고이동 자동화";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const UNSPECIFIED_LOCATION_VALUE = "1059,2244,210221";
  const MODULE_STYLE_ID = "tm-stock-move-style";
  const MODULE_GUI_ID = "stockMoveGuiContainer";
  const MODULE_TOGGLE_ID = "toggleStockMoveGuiBtn";
  const MAIN_ENDPOINT = "/stm/stm300main4_jdata";
  const SAVE_ENDPOINT = "/stm/stm300save4";
  const EDIT_PAGE_PATH = "/jsp/stm/stm300edit4.jsp";
  const MAIN_RETURN_URL = "https://www.ebut3pl.co.kr/html/stm300main4.html";

  const KEY_MOVE_QUEUE = "ebut_move_queue";
  const KEY_MOVE_RUNNING = "ebut_move_running";
  const KEY_MOVE_ERRORS = "ebut_move_errors";
  const KEY_MOVE_LOGS = "ebut_move_logs";
  const KEY_CURRENT_TARGET = "ebut_current_target";
  const KEY_STATS = "ebut_move_stats";

  const STYLE_TEXT = [
    "#stockMoveGuiContainer{position:fixed;top:12px;right:12px;width:min(648px,calc(100vw - 24px));min-width:460px;padding:0;z-index:9999;display:none;max-height:90vh;overflow:auto;resize:both;background:#ffffff !important;background-clip:padding-box;border:1px solid #c7d1d3;border-radius:20px;box-shadow:0 30px 56px rgba(45,52,53,.18),0 8px 18px rgba(45,52,53,.08);opacity:1;backdrop-filter:none;isolation:isolate}",
    "#stockMoveGuiContainer.tm-ui-root,#stockMoveGuiContainer.tm-ui-root.tm-ui-panel{background:#ffffff !important}",
    "#stockMoveGuiContainer::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(69,90,100,.08)}",
    "#stockMoveGuiContainer .tm-stock-shell{padding:0;overflow:hidden;border:0;border-radius:inherit;background:transparent;box-shadow:none}",
    "#stockMoveGuiContainer.running .tm-stock-shell{background:transparent}",
    "#stockMoveGuiContainer.error .tm-stock-shell{background:transparent}",
    "#stockMoveGuiContainer .tm-stock-body{display:grid;gap:12px;padding:0 16px 16px;background:transparent}",
    "#stockMoveGuiContainer .tm-stock-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:0 16px 2px;background:linear-gradient(180deg,#f8faf9 0%,#ffffff 100%);border-bottom:1px solid rgba(69,90,100,.08)}",
    "#stockMoveGuiContainer .tm-stock-head-copy{display:grid;gap:6px}",
    "#stockMoveGuiContainer .tm-stock-title{font-size:18px;font-weight:800}",
    "#stockMoveGuiContainer .tm-stock-head .close-btn{margin-left:auto}",
    "#stockMoveGuiContainer .tm-stock-input-card,#stockMoveGuiContainer .tm-stock-running-card,#stockMoveGuiContainer .tm-stock-report-card{margin:0;padding:12px;background:var(--tm-surface-alt);border:1px solid rgba(69,90,100,.09)}",
    "#stockMoveGuiContainer textarea{width:100%;height:132px;font-size:12.5px;font-family:Consolas,'Courier New',monospace}",
    ".btn-start,.btn-stop,.btn-reset,.btn-close-report{width:100%;display:inline-flex;justify-content:center}",
    ".tm-stock-action-row{display:grid;grid-template-columns:minmax(0,1fr) 128px;gap:8px;margin-top:10px}",
    ".tm-stock-action-row--even{grid-template-columns:repeat(2,minmax(0,1fr))}",
    ".btn-close-report{margin-top:4px}",
    "#stockMoveGuiLog{margin:0;max-height:168px;overflow-y:auto;line-height:1.6;padding:12px;border:1px solid var(--tm-border);border-radius:12px;background:var(--tm-surface-alt)}",
    "#toggleStockMoveGuiBtn{position:fixed;top:14px;right:14px;z-index:10000;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid var(--tm-border);border-radius:999px;background:#ffffff;color:var(--tm-text);box-shadow:0 14px 28px rgba(45,52,53,.12);transition:background .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease}",
    "#toggleStockMoveGuiBtn .tm-stock-toggle__dot{width:8px;height:8px;border-radius:50%;background:var(--tm-primary-strong);flex:0 0 auto}",
    "#toggleStockMoveGuiBtn .tm-stock-toggle__label{display:inline-flex;align-items:center;font-weight:700;letter-spacing:-.01em}",
    "#toggleStockMoveGuiBtn.is-open{background:var(--tm-surface-alt);border-color:#c8d2d3;color:var(--tm-primary-strong);box-shadow:0 10px 22px rgba(45,52,53,.10)}",
    "#toggleStockMoveGuiBtn.is-open .tm-stock-toggle__dot{background:var(--tm-success)}",
    ".status-text{text-align:left;font-weight:700;margin:0 0 10px;color:var(--tm-text);font-size:13px}",
    ".format-hint{font-size:12px;color:#4f5758;margin-bottom:10px;background:var(--tm-surface-alt);padding:10px 12px;border-radius:10px;border:1px solid var(--tm-border);line-height:1.6}",
    ".report-section{display:grid;gap:10px}",
    ".report-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}",
    ".stat-box{text-align:center;padding:12px;border-radius:12px;border:1px solid var(--tm-border);background:var(--tm-surface-alt)}",
    ".stat-box.success{background:#edf5f1;color:var(--tm-success)}",
    ".stat-box.error{background:#fbefee;color:var(--tm-danger)}",
    ".stat-box.skip{background:#f7f0e8;color:var(--tm-warning)}",
    ".stat-num{font-size:22px;font-weight:800}",
    ".error-list{max-height:160px;overflow-y:auto;font-size:12px}",
    ".error-item{padding:5px;border-bottom:1px solid var(--tm-border)}",
    ".error-item:last-child{border-bottom:none}",
    ".error-type{font-weight:bold;color:var(--tm-danger)}",
    ".validation-section{background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:12px;padding:12px}",
    ".validation-section.has-errors{border-color:#e2c3c1;background:#fbefee}",
    ".validation-section h4{margin:0;color:var(--tm-text);font-size:15px}",
    ".validation-table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}",
    ".validation-table th{background:var(--tm-surface-alt);color:#4f5758;padding:8px 6px;text-align:center;font-weight:700}",
    ".validation-table td{padding:8px 6px;border-bottom:1px solid var(--tm-border);vertical-align:middle;text-align:center}",
    ".validation-table .qty-cell{text-align:right;font-family:monospace}",
    ".validation-table .shortage{color:var(--tm-danger);font-weight:bold}",
    ".validation-table .available{color:var(--tm-success)}",
    ".validation-table .location-cell{font-family:monospace;text-transform:uppercase}",
    ".validation-table .product-name{text-align:left;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".validation-summary{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}",
    ".summary-badge{padding:6px 12px;border-radius:999px;font-weight:700;font-size:12px;border:1px solid transparent}",
    ".summary-badge.success{background:#edf5f1;color:var(--tm-success);border-color:#d1e2da}",
    ".summary-badge.warning{background:#f7f0e8;color:var(--tm-warning);border-color:#e3d4c0}",
    ".summary-badge.danger{background:#fbefee;color:var(--tm-danger);border-color:#e2c3c1}",
    ".validation-buttons{display:flex;gap:8px;margin-top:12px}",
    ".validation-buttons button{flex:1}",
    ".btn-proceed{background:var(--tm-success);border-color:var(--tm-success);color:#fff}",
    ".btn-cancel{background:var(--tm-surface);color:var(--tm-text);border-color:var(--tm-border)}",
    ".spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--tm-border);border-top:2px solid var(--tm-primary-strong);border-radius:50%;animation:spin 1s linear infinite;margin-right:8px}",
    "@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"
  ].join("");

  function getModuleUi(win) {
    const scope = win || root;
    const shared = scope && scope.__tmModuleUi;
    if (shared && typeof shared.ensureStyles === "function") return shared;
    return {
      ensureStyles() {},
      buildRootAttributes(options) {
        const density = options && options.density === "compact" ? "compact" : "normal";
        const extra = options && options.className ? " " + options.className : "";
        return 'class="tm-ui-root tm-ui-panel' + extra + '" data-tm-density="' + density + '"';
      },
    };
  }

  function safeTrim(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeJsonParse(value, fallbackValue) {
    if (!value) return fallbackValue;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallbackValue;
    }
  }

  function normalizeLocation(value) {
    return safeTrim(value).toUpperCase();
  }

  function normalizeLooseText(value) {
    return safeTrim(value).toLowerCase().replace(/[\s\-_]/g, "");
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function detectPageMode(url, hints) {
    const text = String(url || "");
    const nextHints = hints || {};
    if (text.indexOf("stm300main4") !== -1 || nextHints.hasMainFrame) return "main";
    if (text.indexOf("stm300edit4") !== -1 || nextHints.hasEditFrame) return "edit";
    if (text.indexOf("/home") !== -1) return "home";
    return "";
  }

  function parseMoveInputDetailed(rawText) {
    const lines = String(rawText == null ? "" : rawText).split(/\r?\n/).filter((line) => line.trim());
    const merged = {};
    const errors = [];

    lines.forEach((line) => {
      const parts = line.split("\t").map((part) => part.trim());
      if (parts.length < 4) {
        errors.push(line);
        return;
      }
      const item = {
        fromLoc: normalizeLocation(parts[0]),
        productCode: parts[1],
        qty: parseInt(parts[2].replace(/,/g, ""), 10) || 0,
        toLoc: parts[3] === "미지정" ? "미지정" : normalizeLocation(parts[3]),
      };
      const key = [item.fromLoc, item.productCode, item.toLoc].join("__");
      if (!merged[key]) merged[key] = item;
      else merged[key].qty += item.qty;
    });

    return { items: Object.values(merged), errors };
  }

  function parseMoveInput(rawText) {
    return parseMoveInputDetailed(rawText).items;
  }

  function buildValidationBuckets(moveItems, searchCache) {
    const validItems = [];
    const problemItems = [];

    ensureArray(moveItems).forEach((item) => {
      const cacheEntry = searchCache && searchCache[item.fromLoc];
      const status = Object.assign({}, item, {
        availableQty: 0,
        productName: "-",
      });

      if (!cacheEntry || !Array.isArray(cacheEntry.rows) || cacheEntry.rows.length === 0) {
        status.errorType = "검색실패";
        status.errorReason = "로케이션이 비어있거나 존재하지 않음";
        status.shortage = item.qty;
        problemItems.push(status);
        return;
      }

      const match = cacheEntry.rows.find((row) => {
        return safeTrim(row.basic_nicn) === item.productCode &&
          normalizeLocation(row.loca_name) === item.fromLoc;
      });

      if (!match) {
        status.errorType = "상품없음";
        status.errorReason = "해당 로케이션에 상품이 존재하지 않음";
        status.shortage = item.qty;
        problemItems.push(status);
        return;
      }

      status.availableQty = parseInt(match.locastock_qty, 10) || 0;
      status.match = match;
      status.productName = safeTrim(match.basic_name) || "-";
      status.seq = safeTrim(match.locastock_loca_boptcode_edate);

      if (status.availableQty < item.qty) {
        status.errorType = "재고부족";
        status.errorReason = "요청 수량보다 재고가 부족함";
        status.shortage = item.qty - status.availableQty;
        problemItems.push(status);
        return;
      }

      validItems.push(status);
    });

    return { validItems, problemItems };
  }

  function groupItemsByTarget(validItems) {
    const grouped = {};
    ensureArray(validItems).forEach((item) => {
      if (!grouped[item.toLoc]) {
        grouped[item.toLoc] = {
          toLoc: item.toLoc,
          seqs: [],
          qtyMap: {},
          infoMap: {},
        };
      }
      grouped[item.toLoc].seqs.push(item.seq);
      grouped[item.toLoc].qtyMap[item.seq] = item.qty;
      grouped[item.toLoc].infoMap[item.seq] = item;
    });
    return Object.values(grouped);
  }

  function groupTaskItemsBySource(task) {
    const grouped = {};
    ensureArray(task && task.seqs).forEach((seq) => {
      const info = task.infoMap[seq] || {};
      const fromLoc = info.fromLoc || "UNKNOWN";
      if (!grouped[fromLoc]) grouped[fromLoc] = [];
      grouped[fromLoc].push({
        seq,
        qty: task.qtyMap[seq],
        info,
      });
    });
    return grouped;
  }

  function matchTargetLocation(targetLocName, options) {
    const normalizedTarget = normalizeLooseText(targetLocName);
    if (normalizedTarget === "미지정") {
      return {
        value: UNSPECIFIED_LOCATION_VALUE,
        text: "미지정 (미지정-미지정)",
      };
    }

    const match = ensureArray(options).find((option) => {
      return normalizeLooseText(option.text).indexOf(normalizedTarget) !== -1 ||
        String(option.text || "").toUpperCase().indexOf(String(targetLocName || "").toUpperCase()) !== -1;
    });
    return match || null;
  }

  function extractInputValuesByRegex(html, name) {
    const pattern = new RegExp('<input[^>]*name=["\\\']' + name + '["\\\'][^>]*value=["\\\']([^"\\\']*)["\\\']', "gi");
    const values = [];
    let match;
    while ((match = pattern.exec(html))) values.push(match[1]);
    return values;
  }

  function extractOptionValuesByRegex(html) {
    const pattern = /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
    const values = [];
    let match;
    while ((match = pattern.exec(html))) {
      values.push({
        value: match[1],
        text: safeTrim(match[2].replace(/<[^>]+>/g, "")),
      });
    }
    return values;
  }

  function parseBatchFormDataFromHtml(html, targetLocName, items) {
    const body = String(html || "");
    const options = extractOptionValuesByRegex(body);
    const inputLookup = {
      wahOld: extractInputValuesByRegex(body, "INOUTSTOCK_WAH_OLD"),
      zoneOld: extractInputValuesByRegex(body, "INOUTSTOCK_ZONE_OLD"),
      locaOld: extractInputValuesByRegex(body, "INOUTSTOCK_LOCA_OLD"),
      edateOld: extractInputValuesByRegex(body, "INOUTSTOCK_EDATE_OLD"),
      optcode: extractInputValuesByRegex(body, "INOUTSTOCK_OPTCODE"),
      basic: extractInputValuesByRegex(body, "INOUTSTOCK_BASIC"),
      prov: extractInputValuesByRegex(body, "INOUTSTOCK_PROV"),
      cost: extractInputValuesByRegex(body, "INOUTSTOCK_COST"),
      qty: extractInputValuesByRegex(body, "LOCASTOCK_QTY"),
      seqs: safeTrim((extractInputValuesByRegex(body, "seqs")[0] || "")),
    };

    const targetLocation = matchTargetLocation(targetLocName, options);
    if (!targetLocation) return null;

    const rows = ensureArray(items).map((item, index) => ({
      INOUTSTOCK_QTY: String(item.qty || 0),
      INOUTSTOCK_FQTY: "0",
      INOUTSTOCK_BIGO: "",
      INOUTSTOCK_WAH_OLD: inputLookup.wahOld[index] || "",
      INOUTSTOCK_ZONE_OLD: inputLookup.zoneOld[index] || "",
      INOUTSTOCK_LOCA_OLD: inputLookup.locaOld[index] || "",
      INOUTSTOCK_EDATE_OLD: inputLookup.edateOld[index] || "",
      INOUTSTOCK_OPTCODE: inputLookup.optcode[index] || "",
      INOUTSTOCK_BASIC: inputLookup.basic[index] || "",
      INOUTSTOCK_PROV: inputLookup.prov[index] || "null",
      INOUTSTOCK_COST: inputLookup.cost[index] || "0",
      LOCASTOCK_QTY: inputLookup.qty[index] || "",
    }));

    return {
      INOUTSTOCK_LOCA: targetLocation.value,
      INOUTSTOCK_EDATE: "",
      rows,
      seqs: inputLookup.seqs || (ensureArray(items).map((item) => item.seq).join(",") + ","),
    };
  }

  function buildBatchSavePayload(formData) {
    const params = new URLSearchParams();
    params.append("INOUTSTOCK_LOCA", formData.INOUTSTOCK_LOCA);
    params.append("INOUTSTOCK_EDATE", formData.INOUTSTOCK_EDATE || "");

    ensureArray(formData.rows).forEach((row) => {
      params.append("INOUTSTOCK_QTY", row.INOUTSTOCK_QTY || "");
      params.append("INOUTSTOCK_FQTY", row.INOUTSTOCK_FQTY || "");
      params.append("INOUTSTOCK_BIGO", row.INOUTSTOCK_BIGO || "");
      params.append("INOUTSTOCK_WAH_OLD", row.INOUTSTOCK_WAH_OLD || "");
      params.append("INOUTSTOCK_ZONE_OLD", row.INOUTSTOCK_ZONE_OLD || "");
      params.append("INOUTSTOCK_LOCA_OLD", row.INOUTSTOCK_LOCA_OLD || "");
      params.append("INOUTSTOCK_EDATE_OLD", row.INOUTSTOCK_EDATE_OLD || "");
      params.append("INOUTSTOCK_OPTCODE", row.INOUTSTOCK_OPTCODE || "");
      params.append("INOUTSTOCK_BASIC", row.INOUTSTOCK_BASIC || "");
      params.append("INOUTSTOCK_PROV", row.INOUTSTOCK_PROV || "");
      params.append("INOUTSTOCK_COST", row.INOUTSTOCK_COST || "");
      params.append("LOCASTOCK_QTY", row.LOCASTOCK_QTY || "");
    });

    params.append("INOUTSTOCK_QTY", "");
    params.append("INOUTSTOCK_FQTY", "");
    params.append("INOUTSTOCK_BIGO", "");
    params.append("INOUTSTOCK_WAH_OLD", "");
    params.append("INOUTSTOCK_ZONE_OLD", "");
    params.append("INOUTSTOCK_LOCA_OLD", "");
    params.append("INOUTSTOCK_OPTCODE", "");
    params.append("LOCASTOCK_QTY", "");
    params.append("seqs", formData.seqs || "");
    return params.toString();
  }

  function evaluateSaveResponse(responseText, statusCode) {
    try {
      const parsed = JSON.parse(String(responseText || ""));
      const success = parsed.success === true || parsed.success === "true";
      return {
        success,
        message: safeTrim(parsed.msg || parsed.message) || (success ? "완료" : "저장 실패"),
      };
    } catch (error) {
      const text = String(responseText || "");
      if (text.indexOf("정상") !== -1 || Number(statusCode) === 200) {
        return { success: true, message: "완료" };
      }
      return { success: false, message: "응답 파싱 실패" };
    }
  }

  function reduceRunStats(state, action) {
    const currentState = state || { total: 0, success: 0, skip: 0 };
    const nextAction = action || {};

    if (nextAction.type === "start") {
      return {
        total: nextAction.total || 0,
        success: 0,
        skip: nextAction.skip || 0,
      };
    }
    if (nextAction.type === "success") {
      return Object.assign({}, currentState, {
        success: currentState.success + (nextAction.count || 1),
      });
    }
    if (nextAction.type === "skip") {
      return Object.assign({}, currentState, {
        skip: currentState.skip + (nextAction.count || 1),
      });
    }
    return currentState;
  }

  function createStorage(win) {
    return {
      getText(key, fallbackValue) {
        const value = win.localStorage.getItem(key);
        return value == null ? fallbackValue : value;
      },
      setText(key, value) {
        win.localStorage.setItem(key, String(value));
      },
      getJson(key, fallbackValue) {
        return safeJsonParse(win.localStorage.getItem(key), fallbackValue);
      },
      setJson(key, value) {
        win.localStorage.setItem(key, JSON.stringify(value));
      },
      clearKeys(keys) {
        ensureArray(keys).forEach((key) => win.localStorage.removeItem(key));
      },
      isRunning() {
        return win.localStorage.getItem(KEY_MOVE_RUNNING) === "true";
      },
      setRunning(flag) {
        win.localStorage.setItem(KEY_MOVE_RUNNING, flag ? "true" : "false");
      },
    };
  }

  function gmRequest(details) {
    const request = root.GM_xmlhttpRequest || (typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
    if (!request) return Promise.reject(new Error("GM_xmlhttpRequest unavailable"));
    return new Promise((resolve, reject) => {
      request(Object.assign({}, details, {
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
      }));
    });
  }

  function getRequest(url) {
    return new URL(url, "https://www.ebut3pl.co.kr");
  }

  function buildLocationSearchUrl(locName) {
    const url = getRequest(MAIN_ENDPOINT);
    url.search = new URLSearchParams({
      BASIC_CUST: "",
      LOCASTOCK_WAH: "",
      LOCASTOCK_ZONE: "",
      LOCA_NAME: locName,
      QTYPM: "1",
      BASIC_NAME: "",
      BASIC_NICN: "",
      BASIC_NAME_MULTI: "",
      BASIC_NICN_MULTI: "",
      BOPTCODE_BARCODE_MULTI: "",
      _search: "false",
      nd: String(Date.now()),
      rows: "1000",
      page: "1",
      sidx: "locastock_sysdate",
      sord: "desc",
    }).toString();
    return url.toString();
  }

  async function searchByLocation(locName) {
    const response = await gmRequest({
      method: "GET",
      url: buildLocationSearchUrl(locName),
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    return JSON.parse(String(response.responseText || "{}"));
  }

  async function fetchPage(url) {
    const response = await gmRequest({
      method: "GET",
      url,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return String(response.responseText || "");
  }

  async function saveBatchStock(formData) {
    const response = await gmRequest({
      method: "POST",
      url: getRequest(SAVE_ENDPOINT).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      data: buildBatchSavePayload(formData),
    });
    return evaluateSaveResponse(response.responseText, response.status);
  }

  function ensureStyles(win) {
    getModuleUi(win).ensureStyles(win.document);
    if (win.document.getElementById(MODULE_STYLE_ID)) return;
    const style = win.document.createElement("style");
    style.id = MODULE_STYLE_ID;
    style.textContent = STYLE_TEXT;
    (win.document.head || win.document.documentElement).appendChild(style);
  }

  function getJQuery(win) {
    if (win.__tmStockMoveJQuery) return win.__tmStockMoveJQuery;
    const jq = win.jQuery || root.jQuery;
    if (!jq) return null;
    win.__tmStockMoveJQuery = typeof jq.noConflict === "function" ? jq.noConflict(true) : jq;
    return win.__tmStockMoveJQuery;
  }

  function createState(win, $, pageMode) {
    if (!win.__tmStockMoveState) {
      win.__tmStockMoveState = {
        win,
        doc: win.document,
        $,
        pageMode,
        storage: createStorage(win),
        processingQueue: false,
      };
    } else {
      win.__tmStockMoveState.$ = $;
      win.__tmStockMoveState.pageMode = pageMode;
    }
    return win.__tmStockMoveState;
  }

  function setToggleOffset(state, isOpen) {
    const button = state.doc.getElementById(MODULE_TOGGLE_ID);
    if (!button) return;
    button.classList.toggle("is-open", !!isOpen);
    button.setAttribute("aria-pressed", isOpen ? "true" : "false");
    const label = button.querySelector(".tm-stock-toggle__label");
    if (label) label.textContent = isOpen ? "재고이동 닫기" : "재고이동 열기";
  }

  function getLogHtml(state) {
    return state.storage.getText(KEY_MOVE_LOGS, "준비됨. 데이터를 입력하고 시작 버튼을 클릭하세요.");
  }

  function setLogHtml(state, html) {
    state.storage.setText(KEY_MOVE_LOGS, html);
    const logNode = state.doc.getElementById("stockMoveGuiLog");
    if (logNode) {
      logNode.innerHTML = html;
      logNode.scrollTop = logNode.scrollHeight;
    }
  }

  function addLog(state, message, isError) {
    const color = isError ? "red" : "#333";
    const time = new Date().toLocaleTimeString("ko-KR");
    const current = state.storage.getText(KEY_MOVE_LOGS, "");
    const next = current + "<div style='color:" + color + "; border-bottom:1px solid #eee;'>[" + escapeHtml(time) + "] " + escapeHtml(message) + "</div>";
    setLogHtml(state, next);
  }

  function addError(state, type, fromLoc, productCode, toLoc, reason) {
    const errors = state.storage.getJson(KEY_MOVE_ERRORS, []);
    errors.push({
      type,
      fromLoc,
      productCode,
      toLoc,
      reason,
      time: new Date().toISOString(),
    });
    state.storage.setJson(KEY_MOVE_ERRORS, errors);
  }

  function updateStats(state, action) {
    const current = state.storage.getJson(KEY_STATS, { total: 0, success: 0, skip: 0 });
    const next = reduceRunStats(current, action);
    state.storage.setJson(KEY_STATS, next);
    return next;
  }

  function clearRuntimeState(state, clearReport) {
    const keys = [KEY_MOVE_QUEUE, KEY_MOVE_RUNNING, KEY_MOVE_LOGS, KEY_CURRENT_TARGET];
    if (clearReport) keys.push(KEY_MOVE_ERRORS, KEY_STATS);
    state.storage.clearKeys(keys);
  }

  function buildMainGuiHtml() {
    const rootAttrs = getModuleUi(root).buildRootAttributes({
      kind: "panel",
      density: "compact",
      className: "tm-stock-panel",
    });
    return [
      "<div id='stockMoveGuiContainer' " + rootAttrs.replace(/"/g, "'") + ">",
      "<div class='tm-stock-shell tm-ui-card'>",
      "<div class='tm-ui-panel-head tm-stock-head'>",
      "<div class='tm-stock-head-copy'>",
      "<span class='tm-ui-kicker'>재고 이동</span>",
      "<div class='tm-stock-title tm-ui-title'>재고이동 자동화</div>",
      "<p class='tm-ui-subtitle'>입력값을 검증한 뒤 목적지별로 묶어 처리합니다.</p>",
      "</div>",
      "<button id='closeGuiBtn' class='close-btn tm-ui-btn tm-ui-btn--secondary'>닫기</button>",
      "</div>",
      "<div class='tm-stock-body'>",
      "<div id='inputArea' class='tm-stock-input-card tm-ui-section'>",
      "<div class='tm-ui-section-head'><div><div class='tm-ui-kicker'>입력</div><div class='tm-ui-section-title'>이동 요청 붙여넣기</div></div><span class='tm-ui-inline-note'>탭 구분 형식</span></div>",
      "<div class='format-hint'><b>형식:</b> 기존로케이션 [탭] 상품코드 [탭] 이동수량 [탭] 이후로케이션<br><b>예시:</b> S35-02-2-A\tO8800244293273\t216\ts35-17-1-b<br><small>※ 재고 부족, 검색 실패 등은 건너뛰고 계속 진행됩니다.</small></div>",
      "<textarea id='moveDataInput' class='tm-ui-textarea' placeholder='S35-02-2-A\tO8800244293273\t216\ts35-17-1-b&#10;S35-04-3-B\tO8800244293273\t174\ts35-17-1-b'></textarea>",
      "<div class='tm-stock-action-row'><button id='startMoveBtn' class='btn-start tm-ui-btn tm-ui-btn--success'>재고이동 시작</button><button id='resetAllBtn' class='btn-reset tm-ui-btn tm-ui-btn--secondary'>초기화</button></div>",
      "</div>",
      "<div id='validationArea' class='tm-stock-stage' style='display:none;'></div>",
      "<div id='runningArea' class='tm-stock-running-card tm-ui-section' style='display:none;'><div class='tm-ui-section-head'><div><div class='tm-ui-kicker'>실행 상태</div><div class='tm-ui-section-title'>처리 상태</div></div></div><div class='status-text' id='statusText'>처리 중...</div><div class='tm-stock-action-row tm-stock-action-row--even'><button id='stopBtn' class='btn-stop tm-ui-btn tm-ui-btn--danger'>강제 중지</button><button id='resetBtn' class='btn-reset tm-ui-btn tm-ui-btn--secondary'>초기화</button></div></div>",
      "<div id='reportArea' class='tm-stock-stage' style='display:none;'></div>",
      "<div id='stockMoveGuiLog' class='tm-ui-log tm-stock-log'>준비됨. 데이터를 입력하고 시작 버튼을 클릭하세요.</div>",
      "</div>",
      "</div>",
      "</div>",
      "<button id='toggleStockMoveGuiBtn' type='button' aria-pressed='false'><span class='tm-stock-toggle__dot'></span><span class='tm-stock-toggle__label'>재고이동 열기</span></button>",
    ].join("");
  }

  function buildEditGuiHtml() {
    const rootAttrs = getModuleUi(root).buildRootAttributes({
      kind: "panel",
      density: "compact",
      className: "tm-stock-panel",
    });
    return [
      "<div id='stockMoveGuiContainer' " + rootAttrs.replace(/"/g, "'") + ">",
      "<div class='tm-stock-shell tm-ui-card'>",
      "<div class='tm-ui-panel-head tm-stock-head'><div class='tm-stock-head-copy'><span class='tm-ui-kicker'>실행 상태</span><div class='tm-stock-title tm-ui-title'>재고이동 처리 중</div><p class='tm-ui-subtitle'>편집 화면에서는 현재 실행 단계와 중지 제어만 노출합니다.</p></div><button id='closeGuiBtn' class='close-btn tm-ui-btn tm-ui-btn--secondary'>닫기</button></div>",
      "<div class='tm-stock-body'>",
      "<div id='runningArea' class='tm-stock-running-card tm-ui-section'><div class='tm-ui-section-head'><div><div class='tm-ui-kicker'>실행 상태</div><div class='tm-ui-section-title'>처리 상태</div></div></div><div class='status-text' id='statusText'>데이터 입력 중...</div><div class='tm-stock-action-row tm-stock-action-row--even'><button id='stopBtn' class='btn-stop tm-ui-btn tm-ui-btn--danger'>강제 중지</button><button id='resetBtn' class='btn-reset tm-ui-btn tm-ui-btn--secondary'>초기화</button></div></div>",
      "<div id='stockMoveGuiLog' class='tm-ui-log tm-stock-log'></div>",
      "</div>",
      "</div>",
      "</div>",
      "<button id='toggleStockMoveGuiBtn' type='button' aria-pressed='false'><span class='tm-stock-toggle__dot'></span><span class='tm-stock-toggle__label'>재고이동 열기</span></button>",
    ].join("");
  }

  function bindSharedGuiEvents(state) {
    const $ = state.$;
    $("#" + MODULE_TOGGLE_ID).off(".stockMove").on("click.stockMove", () => {
      const visible = $("#" + MODULE_GUI_ID).toggle().is(":visible");
      setToggleOffset(state, visible);
    });
    $("#closeGuiBtn").off(".stockMove").on("click.stockMove", () => {
      $("#" + MODULE_GUI_ID).hide();
      setToggleOffset(state, false);
    });
    $("#resetAllBtn, #resetBtn").off(".stockMove").on("click.stockMove", () => forceReset(state));
    $("#stopBtn").off(".stockMove").on("click.stockMove", () => {
      state.storage.setRunning(false);
      state.win.alert("사용자에 의해 중지되었습니다.");
      state.win.location.reload();
    });
  }

  function syncMainGui(state) {
    const $ = state.$;
    const running = state.storage.isRunning();
    const queue = state.storage.getJson(KEY_MOVE_QUEUE, []);
    $("#stockMoveGuiLog").html(getLogHtml(state));

    if (running) {
      $("#" + MODULE_GUI_ID).show().addClass("running").removeClass("error");
      setToggleOffset(state, true);
      $("#inputArea, #validationArea, #reportArea").hide();
      $("#runningArea").show();
      return;
    }

    if (state.storage.getJson(KEY_STATS, null) && queue.length === 0) {
      showFinalReport(state);
      return;
    }

    $("#" + MODULE_GUI_ID).removeClass("running error");
    $("#inputArea").show();
    $("#validationArea, #reportArea, #runningArea").hide();
  }

  function syncEditGui(state) {
    const $ = state.$;
    $("#" + MODULE_GUI_ID).toggle(state.storage.isRunning());
    $("#stockMoveGuiLog").html(getLogHtml(state));
    setToggleOffset(state, state.storage.isRunning());
  }

  function ensureMainGui(state) {
    const $ = state.$;
    if (!state.doc.getElementById(MODULE_GUI_ID)) {
      $("body").append(buildMainGuiHtml());
    }
    bindSharedGuiEvents(state);
    $("#startMoveBtn").off(".stockMove").on("click.stockMove", () => startMoveProcess(state));
    syncMainGui(state);
  }

  function ensureEditGui(state) {
    const $ = state.$;
    if (!state.doc.getElementById(MODULE_GUI_ID)) {
      $("body").append(buildEditGuiHtml());
    }
    bindSharedGuiEvents(state);
    syncEditGui(state);
  }

  function showFinalReport(state) {
    const $ = state.$;
    const stats = state.storage.getJson(KEY_STATS, { total: 0, success: 0, skip: 0 });
    const errors = state.storage.getJson(KEY_MOVE_ERRORS, []);
    const errorListHtml = errors.map((item) => {
      return "<div class='error-item'><span class='error-type'>" + escapeHtml(item.type) + "</span>: [" +
        escapeHtml(item.fromLoc) + "] " + escapeHtml(item.productCode) + " → " + escapeHtml(item.toLoc) +
        "<br><small>" + escapeHtml(item.reason) + "</small></div>";
    }).join("");

    const html = [
      "<div class='report-section tm-ui-section tm-ui-reveal'>",
      "<div class='tm-ui-section-head'><div><div class='tm-ui-kicker'>처리 결과</div><div class='tm-ui-section-title'>작업 리포트</div><p class='tm-ui-section-subtitle'>총 " + (stats.total || 0) + "건 중 " + (stats.success || 0) + "건 완료, " + (stats.skip || 0) + "건 건너뜀</p></div></div>",
      "<div class='report-stats'>",
      "<div class='stat-box success'><div class='stat-num'>" + (stats.success || 0) + "</div><div>성공</div></div>",
      "<div class='stat-box skip'><div class='stat-num'>" + (stats.skip || 0) + "</div><div>건너뜀</div></div>",
      "<div class='stat-box error'><div class='stat-num'>" + errors.length + "</div><div>오류</div></div>",
      "</div>",
      errors.length ? "<div class='tm-ui-section-head' style='margin-top:14px;'><div><div class='tm-ui-kicker'>예외 내역</div><div class='tm-ui-section-title'>오류 상세</div></div><span class='tm-ui-inline-note'>" + errors.length + "건</span></div><div class='error-list tm-ui-scroll'>" + errorListHtml + "</div>" : "<div class='tm-ui-message' style='margin-top:10px;'>오류 없이 작업을 마쳤습니다.</div>",
      "<button id='closeReportBtn' class='btn-close-report tm-ui-btn tm-ui-btn--primary'>확인 후 새 작업 시작</button>",
      "</div>",
    ].join("");

    $("#" + MODULE_GUI_ID).show().removeClass("running").toggleClass("error", errors.length > 0);
    setToggleOffset(state, true);
    $("#inputArea, #validationArea, #runningArea").hide();
    $("#reportArea").html(html).show();
    $("#stockMoveGuiLog").hide();
    $("#closeReportBtn").off(".stockMove").on("click.stockMove", () => {
      state.storage.clearKeys([KEY_STATS, KEY_MOVE_ERRORS, KEY_MOVE_LOGS]);
      state.win.location.reload();
    });
  }

  function forceReset(state) {
    if (!state.win.confirm("정말 모든 작업 상태를 초기화하시겠습니까?\n\n큐, 로그, 에러 기록이 모두 삭제됩니다.")) return;
    clearRuntimeState(state, true);
    state.win.alert("초기화가 완료되었습니다.");
    state.win.location.reload();
  }

  async function startMoveProcess(state) {
    const $ = state.$;
    const raw = $("#moveDataInput").val().trim();
    if (!raw) {
      state.win.alert("데이터를 입력해주세요.");
      return;
    }

    const parsed = parseMoveInputDetailed(raw);
    if (parsed.errors.length) {
      state.win.alert("잘못된 형식: " + parsed.errors[0] + "\n형식: 기존로케이션 [탭] 상품코드 [탭] 수량 [탭] 이후로케이션");
      return;
    }
    if (!parsed.items.length) {
      state.win.alert("유효한 데이터가 없습니다.");
      return;
    }

    $("#inputArea").hide();
    $("#validationArea").html("<div class='validation-section'><h4><span class='spinner'></span> 재고 검증 중...</h4><div id='validationProgress'>데이터를 확인하는 중입니다. 잠시만 기다려주세요...</div></div>").show();
    $("#" + MODULE_GUI_ID).show();
    setToggleOffset(state, true);

    const groups = {};
    parsed.items.forEach((item) => {
      if (!groups[item.fromLoc]) groups[item.fromLoc] = [];
      groups[item.fromLoc].push(item);
    });

    const searchCache = {};
    const locations = Object.keys(groups);
    for (let index = 0; index < locations.length; index += 1) {
      const loc = locations[index];
      $("#validationProgress").text("검색 중... (" + (index + 1) + "/" + locations.length + ") - " + loc);
      try {
        searchCache[loc] = await searchByLocation(loc);
      } catch (error) {
        searchCache[loc] = null;
      }
    }

    const buckets = buildValidationBuckets(parsed.items, searchCache);
    showValidationResult(state, parsed.items, buckets.validItems, buckets.problemItems);
  }

  function buildProblemTable(problemItems) {
    if (!problemItems.length) return "";
    return [
      "<table class='validation-table'><thead><tr><th>출발지</th><th>상품코드</th><th>상품명</th><th>목적지</th><th>요청</th><th>보유</th><th>부족</th><th>오류</th></tr></thead><tbody>",
      problemItems.map((item) => "<tr class='error-row'><td class='location-cell'>" + escapeHtml(item.fromLoc) + "</td><td>" + escapeHtml(item.productCode) + "</td><td class='product-name' title='" + escapeHtml(item.productName) + "'>" + escapeHtml(item.productName) + "</td><td class='location-cell'>" + escapeHtml(item.toLoc) + "</td><td class='qty-cell'>" + Number(item.qty || 0).toLocaleString() + "</td><td class='qty-cell " + (item.availableQty > 0 ? "available" : "") + "'>" + Number(item.availableQty || 0).toLocaleString() + "</td><td class='qty-cell shortage'>-" + Number(item.shortage || 0).toLocaleString() + "</td><td><span class='error-type'>" + escapeHtml(item.errorType) + "</span></td></tr>").join(""),
      "</tbody></table>",
    ].join("");
  }

  function buildValidSummary(validItems) {
    if (!validItems.length) return "";
    if (validItems.length > 10) return "<div style='margin-top:10px;color:var(--tm-success);'>처리 가능한 항목: " + validItems.length + "건</div>";
    return [
      "<details style='margin-top:10px;'>",
      "<summary style='cursor:pointer;color:var(--tm-success);font-weight:600;'>처리 가능한 항목 보기 (" + validItems.length + "건)</summary>",
      "<table class='validation-table' style='margin-top:8px;'><thead><tr><th>출발지</th><th>상품코드</th><th>상품명</th><th>목적지</th><th>이동</th><th>보유</th></tr></thead><tbody>",
      validItems.map((item) => "<tr><td class='location-cell'>" + escapeHtml(item.fromLoc) + "</td><td>" + escapeHtml(item.productCode) + "</td><td class='product-name' title='" + escapeHtml(item.productName) + "'>" + escapeHtml(item.productName) + "</td><td class='location-cell'>" + escapeHtml(item.toLoc) + "</td><td class='qty-cell'>" + Number(item.qty || 0).toLocaleString() + "</td><td class='qty-cell available'>" + Number(item.availableQty || 0).toLocaleString() + "</td></tr>").join(""),
      "</tbody></table></details>",
    ].join("");
  }

  function showValidationResult(state, allItems, validItems, problemItems) {
    const $ = state.$;
    const hasProblems = problemItems.length > 0;
    const allFailed = validItems.length === 0;
    const html = [
      "<div class='validation-section " + (hasProblems ? "has-errors" : "") + "'>",
      "<h4>" + (hasProblems ? "재고 검증 결과" : "재고 검증 완료") + "</h4>",
      "<div class='validation-summary'><span class='summary-badge success'>처리 가능: " + validItems.length + "건</span>" + (hasProblems ? "<span class='summary-badge danger'>문제 발견: " + problemItems.length + "건</span>" : "") + "<span class='summary-badge " + (allFailed ? "danger" : "warning") + "'>전체: " + allItems.length + "건</span></div>",
      hasProblems ? "<h4 style='margin-top:15px;color:var(--tm-danger);'>처리할 수 없는 항목 (" + problemItems.length + "건)</h4><div style='max-height:200px;overflow-y:auto;'>" + buildProblemTable(problemItems) + "</div>" : "",
      buildValidSummary(validItems),
      "<div class='validation-buttons'>" + (!allFailed ? "<button id='proceedBtn' class='btn-proceed tm-ui-btn tm-ui-btn--success'>" + (hasProblems ? validItems.length + "건만 진행" : validItems.length + "건 재고이동 시작") + "</button>" : "") + "<button id='cancelValidationBtn' class='btn-cancel tm-ui-btn tm-ui-btn--secondary'>" + (allFailed ? "돌아가기" : "취소") + "</button></div>",
      "</div>",
    ].join("");

    $("#validationArea").html(html);
    $("#cancelValidationBtn").off(".stockMove").on("click.stockMove", () => {
      $("#validationArea").hide();
      $("#inputArea").show();
    });
    $("#proceedBtn").off(".stockMove").on("click.stockMove", () => {
      state.storage.setJson(KEY_MOVE_ERRORS, []);
      problemItems.forEach((item) => addError(state, item.errorType, item.fromLoc, item.productCode, item.toLoc, item.errorReason));
      executeValidatedItems(state, validItems, problemItems.length);
    });
  }

  function executeValidatedItems(state, validItems, skipCount) {
    const $ = state.$;
    state.storage.setRunning(true);
    state.storage.setText(KEY_MOVE_LOGS, "");
    state.storage.setJson(KEY_STATS, reduceRunStats(undefined, { type: "start", total: validItems.length + skipCount, skip: skipCount }));
    $("#validationArea").hide();
    $("#runningArea").show();
    $("#" + MODULE_GUI_ID).addClass("running").removeClass("error");
    addLog(state, "[시작] 재고이동 시작: " + validItems.length + "건 (" + skipCount + "건 건너뜀)");
    const queue = groupItemsByTarget(validItems);
    state.storage.setJson(KEY_MOVE_QUEUE, queue);
    addLog(state, "[대기] " + queue.length + "개 목적지, 총 " + validItems.length + "건 처리 대기");
    processNextInQueue(state);
  }

  async function processDirectApiTask(state, task) {
    const grouped = groupTaskItemsBySource(task);
    const fromLocations = Object.keys(grouped);
    addLog(state, "  배치 처리: " + fromLocations.length + "개 출발지, 총 " + task.seqs.length + "건");

    for (let index = 0; index < fromLocations.length; index += 1) {
      const fromLoc = fromLocations[index];
      const items = grouped[fromLoc];
      const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
      addLog(state, "  처리중 [" + (index + 1) + "/" + fromLocations.length + "] " + fromLoc + " → " + task.toLoc + " (" + items.length + "건, " + totalQty + "개)");
      try {
        const seqsValue = items.map((item) => item.seq).join(",") + ",";
        const editUrl = getRequest(EDIT_PAGE_PATH);
        editUrl.search = new URLSearchParams({ seqs: seqsValue }).toString();
        const pageHtml = await fetchPage(editUrl.toString());
        const formData = parseBatchFormDataFromHtml(pageHtml, task.toLoc, items);
        if (!formData) {
          addLog(state, "    도착 로케이션 [" + task.toLoc + "] 찾기 실패", true);
          items.forEach((item) => {
            addError(state, "로케이션오류", item.info.fromLoc, item.info.productCode, task.toLoc, "도착 로케이션을 찾을 수 없음");
            updateStats(state, { type: "skip" });
          });
          continue;
        }
        const result = await saveBatchStock(formData);
        if (result.success) {
          addLog(state, "    완료: " + items.length + "건 처리 (" + result.message + ")");
          updateStats(state, { type: "success", count: items.length });
        } else {
          addLog(state, "    실패: " + result.message, true);
          items.forEach((item) => {
            addError(state, "저장실패", item.info.fromLoc, item.info.productCode, task.toLoc, result.message);
            updateStats(state, { type: "skip" });
          });
        }
      } catch (error) {
        addLog(state, "    오류: " + error.message, true);
        items.forEach((item) => {
          addError(state, "통신오류", item.info.fromLoc, item.info.productCode, task.toLoc, error.message);
          updateStats(state, { type: "skip" });
        });
      }
    }
  }

  async function processNextInQueue(state) {
    if (state.processingQueue) return;
    state.processingQueue = true;
    try {
      while (state.storage.isRunning()) {
        const queue = state.storage.getJson(KEY_MOVE_QUEUE, []);
        if (!queue.length) {
          state.storage.setRunning(false);
          addLog(state, "[완료] 모든 작업 완료");
          if (state.pageMode === "main") showFinalReport(state);
          break;
        }
        const current = queue.shift();
        state.storage.setJson(KEY_MOVE_QUEUE, queue);
        const statusNode = state.doc.getElementById("statusText");
        if (statusNode) statusNode.textContent = "처리 중: " + current.toLoc;
        addLog(state, "[처리] [" + current.toLoc + "] (" + current.seqs.length + "건)");
        await processDirectApiTask(state, current);
      }
    } finally {
      state.processingQueue = false;
    }
  }

  function setTargetLocation($select, locText) {
    const options = $select.find("option").map(function () {
      return { value: this.value, text: safeTrim(this.textContent) };
    }).get();
    const match = matchTargetLocation(locText, options);
    if (!match) return false;
    $select.val(match.value);
    $select.trigger("change");
    $select.trigger("chosen:updated");
    const $chosenContainer = $select.next(".chosen-container");
    if ($chosenContainer.length) $chosenContainer.find(".chosen-single span").text(match.text);
    return true;
  }

  function executeGoSave(win) {
    try {
      if (typeof win.go_save === "function") win.go_save();
      else win.location.href = "javascript:go_save()";
    } catch (error) {
      console.error("[stock-move-automation] go_save failed", error);
    }
  }

  function goToNextTask(state) {
    const queue = state.storage.getJson(KEY_MOVE_QUEUE, []);
    if (!queue.length) {
      state.storage.setRunning(false);
      addLog(state, "[완료] 모든 작업 완료");
    }
    state.win.setTimeout(() => {
      state.win.location.href = MAIN_RETURN_URL;
    }, 1000);
  }

  function processEditPage(state) {
    const current = state.storage.getJson(KEY_CURRENT_TARGET, null);
    if (!current) {
      addLog(state, "현재 작업 정보가 없습니다.", true);
      goToNextTask(state);
      return;
    }

    addLog(state, "[입력] [" + current.toLoc + "] 로케이션으로 이동 처리 시작");
    const statusNode = state.doc.getElementById("statusText");
    if (statusNode) statusNode.textContent = "목적지: " + current.toLoc;

    const $select = state.$('select[name="INOUTSTOCK_LOCA"]');
    if (!setTargetLocation($select, current.toLoc)) {
      addLog(state, "이후로케이션 [" + current.toLoc + "] 설정 실패", true);
      current.seqs.forEach((seq) => {
        const info = current.infoMap && current.infoMap[seq] || {};
        addError(state, "로케이션오류", info.fromLoc || "N/A", info.productCode || "N/A", current.toLoc, "목적지 로케이션을 찾을 수 없음");
        updateStats(state, { type: "skip" });
      });
      goToNextTask(state);
      return;
    }

    const $rows = state.$("table.tb > tbody > tr").filter((index, tr) => {
      const $td = state.$(tr).find("td");
      return $td.length > 5 && /^\d+$/.test($td.first().text().trim());
    });

    let filledCount = 0;
    const seqKeys = Object.keys(current.qtyMap || {});
    $rows.each((index, tr) => {
      const $row = state.$(tr);
      const $qtyInput = $row.find('input[name="INOUTSTOCK_QTY"]');
      if (!$qtyInput.length || index >= seqKeys.length) return;
      const seq = seqKeys[index];
      $qtyInput.val(current.qtyMap[seq]);
      $row.css("background-color", "#d4edda");
      filledCount += 1;
      updateStats(state, { type: "success" });
    });

    addLog(state, "[입력] " + filledCount + "건 수량 입력 완료");
    if (!filledCount) {
      addLog(state, "입력할 항목이 없습니다.", true);
      goToNextTask(state);
      return;
    }

    addLog(state, "[저장] 저장 중...");
    state.win.setTimeout(() => {
      executeGoSave(state.win);
      state.win.setTimeout(() => {
        const queue = state.storage.getJson(KEY_MOVE_QUEUE, []);
        addLog(state, "저장 완료 (남은 작업: " + queue.length + "건)");
        goToNextTask(state);
      }, 3000);
    }, 500);
  }

  function overrideNativePopups(win) {
    if (win.__tmStockMovePopupOverrideApplied) return;
    win.__tmStockMovePopupOverrideApplied = true;
    win.confirm = function () { return true; };
    win.alert = function () { return undefined; };
  }

  function monitorIframes(win) {
    if (win.__tmStockMoveIframeMonitor) return;
    win.__tmStockMoveIframeMonitor = true;
    const applyToIframes = () => {
      const frames = win.document.querySelectorAll("iframe");
      Array.prototype.forEach.call(frames, (frame) => {
        try {
          const frameWindow = frame.contentWindow;
          if (!frameWindow || frameWindow.__tmStockMovePopupOverrideApplied) return;
          overrideNativePopups(frameWindow);
        } catch (error) {
          // ignore cross-origin frames
        }
      });
    };
    if (typeof win.MutationObserver === "function") {
      const observer = new win.MutationObserver(() => applyToIframes());
      const startObserve = () => {
        if (win.document.body) observer.observe(win.document.body, { childList: true, subtree: true });
      };
      if (win.document.body) startObserve();
      else win.document.addEventListener("DOMContentLoaded", startObserve, { once: true });
    }
    win.setInterval(applyToIframes, 2000);
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\//i.test(String(win.location.href || ""));
  }

  function bootForPage(state) {
    if (state.storage.isRunning()) {
      overrideNativePopups(state.win);
      monitorIframes(state.win);
    }
    if (state.pageMode === "main") {
      ensureMainGui(state);
      if (state.storage.isRunning() && state.storage.getJson(KEY_MOVE_QUEUE, []).length) {
        state.win.setTimeout(() => processNextInQueue(state), 500);
      } else if (!state.storage.isRunning()) {
        const stats = state.storage.getJson(KEY_STATS, null);
        const queue = state.storage.getJson(KEY_MOVE_QUEUE, []);
        if (stats && !queue.length) showFinalReport(state);
      }
      return;
    }
    if (state.pageMode === "edit") {
      ensureEditGui(state);
      if (state.storage.isRunning()) state.win.setTimeout(() => processEditPage(state), 800);
    }
  }

  function start(win) {
    if (!shouldRun(win) || win.__tmStockMoveAutomationStarted) return;
    win.__tmStockMoveAutomationStarted = true;
    const install = () => {
      ensureStyles(win);
      const $ = getJQuery(win);
      if (!$) return;
      const pageMode = detectPageMode(win.location.href, {
        hasMainFrame: !!win.document.querySelector('iframe[src*="stm300main4"]'),
        hasEditFrame: !!win.document.querySelector('iframe[src*="stm300edit4"]'),
      });
      const state = createState(win, $, pageMode);
      bootForPage(state);
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
    name: MODULE_NAME,
    version: "0.1.8",
    matches: MATCHES,
    run,
    start,
    detectPageMode,
    parseMoveInput,
    buildValidationBuckets,
    groupItemsByTarget,
    groupTaskItemsBySource,
    matchTargetLocation,
    parseBatchFormDataFromHtml,
    buildBatchSavePayload,
    evaluateSaveResponse,
    reduceRunStats,
    buildMainGuiHtml,
    buildEditGuiHtml,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);








