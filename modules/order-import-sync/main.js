module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "order-import-sync";
  const MODULE_NAME = "연동데이터 불러오기";
  const MODULE_VERSION = "0.1.2";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/site/site230main.jsp*"];
  const PAGE_PATTERN = /\/jsp\/site\/site230main\.jsp/i;
  const PANEL_ID = "ebut-ui-panel";
  const PANEL_STYLE_ID = "ebut-ui-panel-style";
  const PANEL_RUNTIME_KEY = "__tmOrderImportSyncRuntime";
  const IFRAME_PATCH_KEY = "__tmOrderImportSyncIframePatched";
  const PAGE_PATCH_SCRIPT_ID = "tm-order-import-sync-page-patch";
  const CLICK_GAP_MS = 3000;
  const WAIT_RESULT_MS = 120000;
  const POLL_MS = 300;
  const LOADING_CHECK_MS = 1000;

  const STORAGE_KEYS = {
    ACTIVE: "EBUT_UI_ACTIVE",
    QUEUE: "EBUT_UI_QUEUE",
    INDEX: "EBUT_UI_INDEX",
    CURRENT: "EBUT_UI_CURRENT",
    RESULTS: "EBUT_UI_RESULTS",
    AUTOYES: "EBUT_UI_AUTOYES",
    COLLAPSED: "EBUT_UI_COLLAPSED",
    PROCESSING: "EBUT_UI_PROCESSING",
  };

  const STYLE_TEXT = [
    "#" + PANEL_ID + "{position:fixed;top:16px;right:16px;z-index:99999;background:rgba(0,0,0,0.9);color:#fff;padding:8px 10px;border-radius:10px;font-size:12px;line-height:1.45;box-shadow:0 8px 18px rgba(0,0,0,0.35);resize:both;overflow:auto;max-height:80vh;min-width:280px}",
    "#" + PANEL_ID + " button{border:none;border-radius:4px}",
    "#" + PANEL_ID + " table{width:100%;border-collapse:collapse}",
    "#" + PANEL_ID + " input[type='checkbox']{vertical-align:middle}",
  ].join("");

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function stripTags(value) {
    return String(value == null ? "" : value).replace(/<[^>]+>/g, "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseIntSafe(value) {
    const cleaned = String(value == null ? "" : value).replace(/[^\d-]/g, "");
    if (!cleaned) return 0;
    const parsed = parseInt(cleaned, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buildPreviewQueue(rowInfos) {
    return (Array.isArray(rowInfos) ? rowInfos : [])
      .filter((item) => Number(item && item.count) > 0 && !!(item && item.hasGetButton))
      .sort((left, right) => {
        if (Number(right.count) !== Number(left.count)) {
          return Number(right.count) - Number(left.count);
        }
        return safeTrim(left.name).localeCompare(safeTrim(right.name), "ko");
      })
      .map((item) => ({
        siteCode: String(item.siteCode || ""),
        name: safeTrim(item.name),
        count: Number(item.count) || 0,
        hasGetButton: !!item.hasGetButton,
      }));
  }

  function parseResultRowHtml(html) {
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let match;
    while ((match = cellPattern.exec(html))) {
      cells.push(safeTrim(stripTags(match[1])));
    }
    return cells;
  }

  function parseResultTableHtml(html) {
    const text = safeTrim(stripTags(html));
    const completionMatch = text.match(/(\d+)\s*건?\s*주문등록이\s*완료/);
    if (completionMatch) {
      const total = parseInt(completionMatch[1], 10) || 0;
      return {
        total,
        success: total,
        fail: 0,
        completed: true,
        details: [],
      };
    }

    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const details = [];
    let rowMatch;
    while ((rowMatch = rowPattern.exec(String(html || "")))) {
      const cells = parseResultRowHtml(rowMatch[1]);
      if (cells.length < 4) continue;
      if (cells[0].indexOf("수령자") !== -1 || cells[3] === "결과") continue;
      details.push({
        receiver: cells[0],
        product: cells[1],
        option: cells[2],
        result: cells[3],
      });
    }

    if (!details.length) return null;
    const success = details.filter((item) => /등록성공|성공|완료/.test(item.result)).length;
    return {
      total: details.length,
      success,
      fail: details.length - success,
      completed: true,
      details,
    };
  }

  function isResultTextCandidate(text) {
    const normalized = safeTrim(text);
    return normalized.indexOf("주문수집결과") !== -1 ||
      normalized.indexOf("주문등록이 완료") !== -1 ||
      normalized.indexOf("등록성공") !== -1 ||
      normalized.indexOf("등록실패") !== -1 ||
      (normalized.indexOf("수령자") !== -1 && normalized.indexOf("상품명") !== -1 && normalized.indexOf("결과") !== -1);
  }

  function hasOrderCountDecreased(originalCount, currentCount) {
    return Number(currentCount) < Number(originalCount);
  }

  function shouldRefreshQueueFromLivePage(state) {
    const current = state || {};
    return !(current.active || current.processing);
  }

  function buildDialogPatchScript(storageKey) {
    return [
      "(function(){",
      "if(window.__tmOrderImportSyncPagePatched)return;",
      "window.__tmOrderImportSyncPagePatched=true;",
      "function isAutoYesEnabled(){",
      "try{return localStorage.getItem(\"" + storageKey + "\") !== \"0\";}catch(error){return true;}",
      "}",
      "var originalConfirm = window.confirm;",
      "var originalAlert = window.alert;",
      "var originalPrompt = window.prompt;",
      "window.confirm = function(message){",
      "if(isAutoYesEnabled()) return true;",
      "return originalConfirm ? originalConfirm.call(window, message) : true;",
      "};",
      "window.alert = function(message){",
      "if(isAutoYesEnabled()) return undefined;",
      "return originalAlert ? originalAlert.call(window, message) : undefined;",
      "};",
      "window.prompt = function(message, defaultValue){",
      "if(isAutoYesEnabled()) return defaultValue == null ? \"\" : defaultValue;",
      "return originalPrompt ? originalPrompt.call(window, message, defaultValue) : (defaultValue == null ? \"\" : defaultValue);",
      "};",
      "})();",
    ].join("");
  }

  function reduceImportState(state, action) {
    const current = state || {
      active: false,
      processing: false,
      index: 0,
      current: "",
      queue: [],
      results: {},
    };
    const next = {
      active: current.active,
      processing: current.processing,
      index: current.index,
      current: current.current,
      queue: Array.isArray(current.queue) ? current.queue.slice() : [],
      results: Object.assign({}, current.results || {}),
    };
    const payload = action || {};

    if (payload.type === "start") {
      next.active = true;
      next.processing = true;
      next.index = 0;
      next.current = "";
      next.queue = Array.isArray(payload.queue) ? payload.queue.slice() : [];
      next.results = {};
      return next;
    }
    if (payload.type === "set-current") {
      next.current = payload.siteCode || "";
      return next;
    }
    if (payload.type === "complete-site" || payload.type === "timeout-site") {
      next.results[payload.siteCode] = payload.result;
      next.index += 1;
      next.current = "";
      return next;
    }
    if (payload.type === "finish") {
      next.active = false;
      next.processing = false;
      next.current = "";
      return next;
    }
    if (payload.type === "stop") {
      next.active = false;
      next.processing = false;
      next.current = "";
      return next;
    }
    return next;
  }

  function summarizeImportResults(resultsMap, queue) {
    const resultEntries = resultsMap || {};
    const queueItems = Array.isArray(queue) ? queue : [];
    const nameMap = {};
    queueItems.forEach((item) => {
      nameMap[item.siteCode] = item.name || item.siteCode;
    });

    let anyFail = false;
    let totalSuccess = 0;
    let totalFail = 0;
    const lines = [];

    Object.keys(resultEntries).forEach((siteCode) => {
      const result = resultEntries[siteCode] || {};
      const total = Number(result.total) || 0;
      const success = Number(result.success) || 0;
      const fail = Number(result.fail) || 0;
      totalSuccess += success;
      totalFail += fail;
      if (fail <= 0) return;
      anyFail = true;
      lines.push("[" + (nameMap[siteCode] || siteCode) + "] 성공 " + success + "/" + total + ", 실패 " + fail);
      (Array.isArray(result.details) ? result.details : [])
        .filter((item) => !/등록성공|성공/.test(item.result || ""))
        .slice(0, 5)
        .forEach((item) => {
          lines.push("  - 수령자:" + safeTrim(item.receiver) + " | 상품:" + safeTrim(item.product) + " | 결과:" + safeTrim(item.result));
        });
    });

    return {
      anyFail,
      totalSuccess,
      totalFail,
      lines,
    };
  }

  function createStorage(win) {
    const localStorageRef = win.localStorage;

    function setRaw(key, value) {
      localStorageRef.setItem(key, String(value));
    }

    function setJson(key, value) {
      localStorageRef.setItem(key, JSON.stringify(value));
    }

    function getStr(key, fallbackValue) {
      const value = localStorageRef.getItem(key);
      return value == null ? fallbackValue : value;
    }

    function getObj(key, fallbackValue) {
      try {
        const raw = localStorageRef.getItem(key);
        return raw == null ? fallbackValue : (JSON.parse(raw) ?? fallbackValue);
      } catch (error) {
        return fallbackValue;
      }
    }

    return {
      isAutoYes() {
        return getStr(STORAGE_KEYS.AUTOYES, "1") === "1";
      },
      setAutoYes(enabled) {
        setRaw(STORAGE_KEYS.AUTOYES, enabled ? "1" : "0");
      },
      isCollapsed() {
        return getStr(STORAGE_KEYS.COLLAPSED, "0") === "1";
      },
      setCollapsed(collapsed) {
        setRaw(STORAGE_KEYS.COLLAPSED, collapsed ? "1" : "0");
      },
      readState() {
        return {
          active: getStr(STORAGE_KEYS.ACTIVE, "") === "1",
          processing: getStr(STORAGE_KEYS.PROCESSING, "") === "1",
          index: parseInt(getStr(STORAGE_KEYS.INDEX, "0"), 10) || 0,
          current: getStr(STORAGE_KEYS.CURRENT, ""),
          queue: getObj(STORAGE_KEYS.QUEUE, []) || [],
          results: getObj(STORAGE_KEYS.RESULTS, {}) || {},
        };
      },
      writeState(state) {
        const nextState = state || {};
        setRaw(STORAGE_KEYS.ACTIVE, nextState.active ? "1" : "0");
        setRaw(STORAGE_KEYS.PROCESSING, nextState.processing ? "1" : "0");
        setRaw(STORAGE_KEYS.INDEX, String(nextState.index || 0));
        setRaw(STORAGE_KEYS.CURRENT, nextState.current || "");
        setJson(STORAGE_KEYS.QUEUE, Array.isArray(nextState.queue) ? nextState.queue : []);
        setJson(STORAGE_KEYS.RESULTS, nextState.results || {});
      },
    };
  }

  function readState(runtime) {
    return runtime.storage.readState();
  }

  function writeState(runtime, state) {
    runtime.storage.writeState(state);
    return state;
  }

  function applyAction(runtime, action) {
    return writeState(runtime, reduceImportState(readState(runtime), action));
  }

  function ensureStyle(doc) {
    if (doc.getElementById(PANEL_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = PANEL_STYLE_ID;
    style.textContent = STYLE_TEXT;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function injectDialogPatch(doc, storageKey, suffix) {
    if (!doc) return;
    const scriptId = PAGE_PATCH_SCRIPT_ID + (suffix ? "-" + suffix : "");
    if (doc.getElementById(scriptId)) return;
    const script = doc.createElement("script");
    script.id = scriptId;
    script.textContent = buildDialogPatchScript(storageKey);
    (doc.head || doc.documentElement || doc.body).appendChild(script);
  }

  function getElements(runtime) {
    if (runtime.elements && runtime.elements.panel && runtime.elements.panel.isConnected) {
      return runtime.elements;
    }
    return null;
  }

  function ensurePanel(runtime) {
    const doc = runtime.doc;
    ensureStyle(doc);

    const cached = getElements(runtime);
    if (cached) return cached;

    let panel = doc.getElementById(PANEL_ID);
    if (!panel) {
      panel = doc.createElement("div");
      panel.id = PANEL_ID;
      doc.body.appendChild(panel);
    }

    const collapsed = runtime.storage.isCollapsed();
    const checked = runtime.storage.isAutoYes() ? "checked" : "";

    panel.innerHTML = [
      "<div style='display:flex;align-items:center;gap:8px;margin-bottom:6px;'>",
      "<div style='font-weight:bold;font-size:13px;'>📦 연동데이터 불러오기</div>",
      "<button id='ebut-ui-collapse' style='margin-left:auto;padding:2px 6px;cursor:pointer;'>" + (collapsed ? "펼치기" : "축소") + "</button>",
      "</div>",
      "<div id='ebut-ui-body'" + (collapsed ? " style='display:none;'" : "") + ">",
      "<div style='margin-bottom:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;'>",
      "<label style='cursor:pointer;'><input type='checkbox' id='ebut-auto-yes' " + checked + "/> 확인창 자동 '예'</label>",
      "<button id='ebut-scan' style='padding:4px 8px;cursor:pointer;'>🔍 대상 스캔</button>",
      "<button id='ebut-run' style='padding:4px 8px;cursor:pointer;background:#4CAF50;color:white;'>▶ 시작</button>",
      "<button id='ebut-stop' style='padding:4px 8px;cursor:pointer;background:#f44336;color:white;'>⏹ 정지</button>",
      "</div>",
      "<div id='ebut-status' style='background:rgba(255,255,255,0.1);padding:6px 8px;border-radius:6px;margin-bottom:8px;display:none;'><span id='ebut-status-text'>대기 중...</span></div>",
      "<div id='ebut-preview-wrap' style='background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;'>",
      "<div style='font-weight:bold;margin-bottom:6px;'>📋 프리뷰 (신규주문수 > 0)</div>",
      "<table id='ebut-preview'><thead><tr>",
      "<th style='text-align:left;padding:4px;border-bottom:1px solid rgba(255,255,255,0.15);'>판매처</th>",
      "<th style='text-align:right;padding:4px;border-bottom:1px solid rgba(255,255,255,0.15);'>신규주문수</th>",
      "<th style='text-align:center;padding:4px;border-bottom:1px solid rgba(255,255,255,0.15);'>상태</th>",
      "</tr></thead><tbody></tbody></table>",
      "<div id='ebut-preview-empty' style='color:#ddd;padding:6px 2px;display:none;'>대상이 없습니다. 화면의 '확인'으로 숫자를 갱신해 주세요.</div>",
      "</div>",
      "<div id='ebut-log' style='margin-top:8px;'></div>",
      "</div>",
    ].join("");

    const elements = {
      panel,
      collapse: panel.querySelector("#ebut-ui-collapse"),
      body: panel.querySelector("#ebut-ui-body"),
      autoYes: panel.querySelector("#ebut-auto-yes"),
      scan: panel.querySelector("#ebut-scan"),
      run: panel.querySelector("#ebut-run"),
      stop: panel.querySelector("#ebut-stop"),
      status: panel.querySelector("#ebut-status"),
      statusText: panel.querySelector("#ebut-status-text"),
      previewBody: panel.querySelector("#ebut-preview tbody"),
      previewEmpty: panel.querySelector("#ebut-preview-empty"),
      log: panel.querySelector("#ebut-log"),
    };

    elements.collapse.addEventListener("click", () => {
      const nextCollapsed = elements.body.style.display !== "none";
      elements.body.style.display = nextCollapsed ? "none" : "";
      runtime.storage.setCollapsed(nextCollapsed);
      elements.collapse.textContent = nextCollapsed ? "펼치기" : "축소";
    });
    elements.autoYes.addEventListener("change", (event) => {
      const enabled = !!event.target.checked;
      runtime.storage.setAutoYes(enabled);
      runtime.autoYesEnabled = enabled;
    });
    elements.scan.addEventListener("click", () => buildPreview(runtime, { resetState: true }));
    elements.run.addEventListener("click", () => start(runtime));
    elements.stop.addEventListener("click", () => stop(runtime));

    runtime.elements = elements;
    return elements;
  }

  function updateStatus(runtime, message, color) {
    const elements = ensurePanel(runtime);
    elements.status.style.display = "";
    elements.statusText.textContent = message;
    elements.statusText.style.color = color || "#fff";
  }

  function updatePreviewStatus(runtime, siteCode, status, color) {
    const elements = ensurePanel(runtime);
    const row = elements.previewBody.querySelector("tr[data-sitecode='" + siteCode + "']");
    if (!row) return;
    const statusCell = row.querySelector(".ebut-status-cell");
    if (!statusCell) return;
    statusCell.textContent = status;
    statusCell.style.color = color || "#fff";
  }

  function log(runtime, message) {
    runtime.win.console.log("[EBUT]", message);
    const elements = ensurePanel(runtime);
    elements.log.innerHTML = "<div style='margin-bottom:2px;'>" + escapeHtml(new Date().toLocaleTimeString()) + " - " + escapeHtml(message) + "</div>" + elements.log.innerHTML;
    elements.log.style.maxHeight = "160px";
    elements.log.style.overflow = "auto";
    elements.log.style.background = "rgba(255,255,255,0.06)";
    elements.log.style.padding = "6px";
    elements.log.style.borderRadius = "6px";
  }

  function renderPreview(runtime, queue) {
    const elements = ensurePanel(runtime);
    const previewQueue = Array.isArray(queue) ? queue : [];
    elements.previewBody.innerHTML = "";

    if (!previewQueue.length) {
      elements.previewEmpty.style.display = "";
      return;
    }
    elements.previewEmpty.style.display = "none";

    previewQueue.forEach((item) => {
      const tr = runtime.doc.createElement("tr");
      tr.dataset.sitecode = item.siteCode;
      tr.innerHTML = [
        "<td style='padding:4px;border-bottom:1px dashed rgba(255,255,255,0.12);'>",
        escapeHtml(item.name),
        " <span style='opacity:0.6;font-size:11px;'>(" + escapeHtml(item.siteCode) + ")</span>",
        "</td>",
        "<td style='padding:4px;border-bottom:1px dashed rgba(255,255,255,0.12);text-align:right;font-weight:bold;'>" + escapeHtml(item.count) + "</td>",
        "<td class='ebut-status-cell' style='padding:4px;border-bottom:1px dashed rgba(255,255,255,0.12);text-align:center;font-size:11px;'>대기</td>",
      ].join("");
      elements.previewBody.appendChild(tr);
    });
  }

  function getRowInfoList(doc) {
    return Array.from(doc.querySelectorAll("span[id^='NewOrderCnt']"))
      .filter((element) => String(element.id || "").indexOf("_btn_") === -1)
      .map((element) => {
        const siteCode = String(element.id || "").replace("NewOrderCnt", "");
        if (!/^\d+$/.test(siteCode)) return null;
        const count = parseIntSafe(element.textContent);
        let name = "";
        const row = element.closest("tr");
        if (row) {
          const link = row.querySelector("a[href*=\"go_edit('" + siteCode + "'\"]");
          if (link) name = safeTrim(link.textContent);
        }
        if (!name) {
          const buttonWrap = doc.querySelector("#btn_" + siteCode);
          const fallbackRow = buttonWrap ? buttonWrap.closest("tr") : null;
          const fallbackLink = fallbackRow ? fallbackRow.querySelector("a[href*=\"go_edit('" + siteCode + "'\"]") : null;
          if (fallbackLink) name = safeTrim(fallbackLink.textContent);
        }
        return {
          siteCode,
          name: name || siteCode,
          count,
          hasGetButton: !!doc.querySelector("#btn_" + siteCode + " a"),
        };
      })
      .filter(Boolean);
  }

  function buildPreview(runtime, options) {
    const queue = buildPreviewQueue(getRowInfoList(runtime.doc));
    renderPreview(runtime, queue);
    if (options && options.resetState === false) return queue;
    writeState(runtime, {
      active: false,
      processing: false,
      index: 0,
      current: "",
      queue,
      results: {},
    });
    log(runtime, "✅ 대상 스캔 완료: " + queue.length + "개 판매처");
    return queue;
  }

  function clickGetOrders(runtime, siteCode) {
    const link = runtime.doc.querySelector("#btn_" + siteCode + " a");
    if (!link) return false;
    link.click();
    return true;
  }

  function isVisibleElement(element) {
    return !!(element && element.offsetParent !== null);
  }

  function isPageLoading(runtime) {
    const selectors = [".loading", "#loading", "[class*='loading']", "[class*='spinner']", ".ajax-loading"];
    for (let index = 0; index < selectors.length; index += 1) {
      const element = runtime.doc.querySelector(selectors[index]);
      if (isVisibleElement(element)) return true;
    }
    const iframes = runtime.doc.querySelectorAll("iframe");
    for (let index = 0; index < iframes.length; index += 1) {
      try {
        const iframeDoc = iframes[index].contentDocument || (iframes[index].contentWindow && iframes[index].contentWindow.document);
        if (!iframeDoc) continue;
        for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
          const iframeElement = iframeDoc.querySelector(selectors[selectorIndex]);
          if (isVisibleElement(iframeElement)) return true;
        }
      } catch (error) {
        continue;
      }
    }
    return false;
  }

  function findResultCandidatesInDoc(doc) {
    if (!doc) return [];
    const candidates = [];
    Array.from(doc.querySelectorAll("table")).forEach((table) => {
      if (isResultTextCandidate(table.textContent || "")) candidates.push(table);
    });
    Array.from(doc.querySelectorAll("div, span, p")).forEach((element) => {
      if (!isResultTextCandidate(element.textContent || "")) return;
      const parentTable = element.closest("table");
      if (parentTable) {
        if (candidates.indexOf(parentTable) === -1) candidates.push(parentTable);
        return;
      }
      if (candidates.indexOf(element) === -1) candidates.push(element);
    });
    return candidates;
  }

  function scanAllContextsForResultOnce(runtime) {
    const docs = [runtime.doc];
    Array.from(runtime.doc.querySelectorAll("iframe")).forEach((iframe) => {
      try {
        const iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (iframeDoc) docs.push(iframeDoc);
      } catch (error) {
        return;
      }
    });

    for (let index = 0; index < docs.length; index += 1) {
      const candidates = findResultCandidatesInDoc(docs[index]);
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        const parsed = parseResultTableHtml(candidates[candidateIndex].outerHTML || candidates[candidateIndex].textContent || "");
        if (parsed && parsed.completed) return parsed;
      }
    }
    return null;
  }

  function checkOrderCountChanged(runtime, siteCode, originalCount) {
    const element = runtime.doc.querySelector("#NewOrderCnt" + siteCode);
    if (!element) return false;
    return hasOrderCountDecreased(originalCount, parseIntSafe(element.textContent));
  }

  function getQueueItemName(runtime, siteCode) {
    const match = (readState(runtime).queue || []).find((item) => item.siteCode === siteCode);
    return match ? match.name : siteCode;
  }

  async function waitForOrderCompletion(runtime, siteCode, originalCount) {
    const startedAt = Date.now();
    let lastLogAt = 0;
    const siteName = getQueueItemName(runtime, siteCode);

    log(runtime, "⏳ [" + siteName + "] 주문수집 진행 중...");
    updateStatus(runtime, "주문수집 중: " + siteName, "#ffeb3b");
    updatePreviewStatus(runtime, siteCode, "수집중", "#ffeb3b");

    while ((Date.now() - startedAt) < WAIT_RESULT_MS) {
      if (!readState(runtime).active) return null;

      if (isPageLoading(runtime)) {
        if ((Date.now() - lastLogAt) > 5000) {
          log(runtime, "⏳ [" + siteName + "] 로딩 중... (" + Math.round((Date.now() - startedAt) / 1000) + "초)");
          lastLogAt = Date.now();
        }
        await sleep(LOADING_CHECK_MS);
        continue;
      }

      const parsed = scanAllContextsForResultOnce(runtime);
      if (parsed && parsed.completed) {
        log(runtime, "✅ [" + siteName + "] 결과 감지됨");
        return parsed;
      }

      if (checkOrderCountChanged(runtime, siteCode, originalCount)) {
        log(runtime, "✅ [" + siteName + "] 주문수 변경 감지 (" + originalCount + " → 감소)");
        await sleep(1000);
        return scanAllContextsForResultOnce(runtime) || {
          total: originalCount,
          success: originalCount,
          fail: 0,
          details: [],
          completed: true,
        };
      }

      await sleep(POLL_MS);
    }

    log(runtime, "⚠️ [" + siteName + "] 결과 대기 시간 초과");
    return null;
  }

  function summarizeAndNotify(runtime) {
    const state = readState(runtime);
    const resultsMap = state.results || {};
    const keys = Object.keys(resultsMap);
    if (!keys.length) {
      runtime.win.alert("처리된 결과가 없습니다.");
      return;
    }

    const summary = summarizeImportResults(resultsMap, state.queue || []);
    updateStatus(runtime, "완료!", "#4CAF50");

    if (!summary.anyFail) {
      runtime.win.alert("✅ 모든 판매처가 성공적으로 완료되었습니다!\n\n총 " + summary.totalSuccess + "건 등록 완료");
      return;
    }

    runtime.win.alert("⚠️ 일부 실패가 있습니다.\n\n성공: " + summary.totalSuccess + "건, 실패: " + summary.totalFail + "건\n\n" + summary.lines.join("\n"));
  }

  async function runLoop(runtime) {
    while (readState(runtime).active) {
      const state = readState(runtime);
      const queue = state.queue || [];
      const index = state.index || 0;

      if (index >= queue.length) {
        applyAction(runtime, { type: "finish" });
        summarizeAndNotify(runtime);
        buildPreview(runtime, { resetState: true });
        log(runtime, "🎉 모든 판매처 처리 완료");
        return;
      }

      const item = queue[index];
      applyAction(runtime, { type: "set-current", siteCode: item.siteCode });
      updateStatus(runtime, "처리 중: " + item.name + " (" + (index + 1) + "/" + queue.length + ")", "#2196F3");
      updatePreviewStatus(runtime, item.siteCode, "처리중", "#2196F3");

      runtime.autoYesEnabled = runtime.storage.isAutoYes();
      patchIframeDialogs(runtime);

      if (!clickGetOrders(runtime, item.siteCode)) {
        log(runtime, "⚠️ [" + item.name + "] '주문가져오기' 버튼을 찾지 못했습니다. 건너뜀");
        updatePreviewStatus(runtime, item.siteCode, "스킵", "#ff9800");
        applyAction(runtime, {
          type: "timeout-site",
          siteCode: item.siteCode,
          result: { total: item.count, success: 0, fail: 0, details: [], skipped: true },
        });
        continue;
      }

      log(runtime, "📥 [" + item.name + "] '주문가져오기' 클릭됨 (주문수: " + item.count + ")");
      await sleep(500);

      const parsed = await waitForOrderCompletion(runtime, item.siteCode, item.count);
      if (parsed) {
        applyAction(runtime, { type: "complete-site", siteCode: item.siteCode, result: parsed });
        if ((parsed.fail || 0) === 0) {
          log(runtime, "✅ [" + item.name + "] " + parsed.success + "/" + parsed.total + " 모두 성공");
          updatePreviewStatus(runtime, item.siteCode, "✓ 완료", "#4CAF50");
        } else {
          log(runtime, "⚠️ [" + item.name + "] 성공 " + parsed.success + ", 실패 " + parsed.fail);
          updatePreviewStatus(runtime, item.siteCode, "⚠ " + parsed.fail + "실패", "#f44336");
        }
      } else {
        applyAction(runtime, {
          type: "timeout-site",
          siteCode: item.siteCode,
          result: { total: item.count, success: 0, fail: 0, details: [], timeout: true },
        });
        log(runtime, "⚠️ [" + item.name + "] 결과 감지 실패 (다음 진행)");
        updatePreviewStatus(runtime, item.siteCode, "?", "#ff9800");
      }

      if (!readState(runtime).active) break;
      if ((index + 1) < queue.length) {
        log(runtime, "⏳ " + (CLICK_GAP_MS / 1000) + "초 대기 후 다음 판매처...");
        await sleep(CLICK_GAP_MS);
      }
    }

    applyAction(runtime, { type: "stop" });
  }

  function start(runtime) {
    const state = readState(runtime);
    if (state.processing) {
      log(runtime, "⚠️ 이미 처리 중입니다.");
      return;
    }

    let queue = shouldRefreshQueueFromLivePage(state)
      ? buildPreview(runtime, { resetState: true })
      : (state.queue || []);
    if (!queue.length) {
      log(runtime, "❌ 대상이 없습니다. 프리뷰에서 먼저 확인해 주세요.");
      return;
    }

    applyAction(runtime, { type: "start", queue });
    log(runtime, "🚀 자동화 시작: " + queue.length + "개 판매처");
    updateStatus(runtime, "시작: " + queue.length + "개 판매처", "#4CAF50");

    runLoop(runtime).catch((error) => {
      runtime.win.console.error("[EBUT] 오류:", error);
      log(runtime, "❌ 오류 발생: " + error.message);
      applyAction(runtime, { type: "stop" });
    });
  }

  function stop(runtime) {
    applyAction(runtime, { type: "stop" });
    buildPreview(runtime, { resetState: true });
    updateStatus(runtime, "정지됨", "#f44336");
    log(runtime, "⏹ 정지됨");
  }

  function patchDialogHost(targetWin, runtime) {
    if (!targetWin || targetWin.__tmOrderImportSyncDialogsPatched) return;

    const originalConfirm = typeof targetWin.confirm === "function" ? targetWin.confirm.bind(targetWin) : null;
    const originalAlert = typeof targetWin.alert === "function" ? targetWin.alert.bind(targetWin) : null;
    const originalPrompt = typeof targetWin.prompt === "function" ? targetWin.prompt.bind(targetWin) : null;

    targetWin.confirm = function (message) {
      runtime.win.console.log("[EBUT] confirm 자동처리:", message);
      if (runtime.autoYesEnabled) return true;
      return originalConfirm ? originalConfirm(message) : true;
    };
    targetWin.alert = function (message) {
      runtime.win.console.log("[EBUT] alert 자동처리:", message);
      if (runtime.autoYesEnabled) return undefined;
      return originalAlert ? originalAlert(message) : undefined;
    };
    targetWin.prompt = function (message, defaultValue) {
      runtime.win.console.log("[EBUT] prompt 자동처리:", message);
      if (runtime.autoYesEnabled) return defaultValue == null ? "" : defaultValue;
      return originalPrompt ? originalPrompt(message, defaultValue) : (defaultValue == null ? "" : defaultValue);
    };

    targetWin.__tmOrderImportSyncDialogsPatched = true;
  }

  function patchIframeDialogs(runtime) {
    Array.from(runtime.doc.querySelectorAll("iframe")).forEach((iframe) => {
      try {
        const frameWin = iframe.contentWindow;
        if (!frameWin || frameWin[IFRAME_PATCH_KEY]) return;
        const frameDoc = iframe.contentDocument || (frameWin && frameWin.document);
        injectDialogPatch(frameDoc, STORAGE_KEYS.AUTOYES, "iframe");
        patchDialogHost(frameWin, runtime);
        frameWin[IFRAME_PATCH_KEY] = true;
      } catch (error) {
        return;
      }
    });
  }

  function setupIframePatchObserver(runtime) {
    if (runtime.iframePatchIntervalId) return;
    runtime.iframePatchIntervalId = runtime.win.setInterval(() => patchIframeDialogs(runtime), 500);

    const startObserver = () => {
      if (runtime.iframePatchObserver || !runtime.doc.body) return;
      runtime.iframePatchObserver = new runtime.win.MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          Array.from(mutation.addedNodes || []).forEach((node) => {
            if (node && node.tagName === "IFRAME") {
              runtime.win.setTimeout(() => patchIframeDialogs(runtime), 100);
            }
          });
        });
      });
      runtime.iframePatchObserver.observe(runtime.doc.body, { childList: true, subtree: true });
    };

    if (runtime.doc.body) startObserver();
    else runtime.doc.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }

  function boot(runtime) {
    if (runtime.booted) return;
    runtime.booted = true;
    ensurePanel(runtime);
    setupIframePatchObserver(runtime);
    patchIframeDialogs(runtime);

    const state = readState(runtime);
    if (!shouldRefreshQueueFromLivePage(state) && Array.isArray(state.queue) && state.queue.length) {
      renderPreview(runtime, state.queue);
    } else {
      buildPreview(runtime, { resetState: true });
    }

    if (state.active && !state.processing) {
      log(runtime, "이전 세션 재개...");
      writeState(runtime, {
        active: true,
        processing: true,
        index: state.index,
        current: state.current,
        queue: state.queue,
        results: state.results,
      });
      runLoop(runtime).catch((error) => runtime.win.console.error(error));
    }

    log(runtime, "✅ 스크립트 로드 완료 (v1.4)");
  }

  function createRuntime(win, context) {
    if (win[PANEL_RUNTIME_KEY]) return win[PANEL_RUNTIME_KEY];
    const runtime = {
      win,
      doc: win.document,
      context: context || null,
      storage: createStorage(win),
      autoYesEnabled: true,
      elements: null,
      booted: false,
      bootScheduled: false,
      iframePatchIntervalId: 0,
      iframePatchObserver: null,
    };
    runtime.autoYesEnabled = runtime.storage.isAutoYes();
    win[PANEL_RUNTIME_KEY] = runtime;
    return runtime;
  }

  function scheduleBoot(runtime) {
    if (runtime.bootScheduled) return;
    runtime.bootScheduled = true;
    if (runtime.doc.readyState === "loading") {
      runtime.doc.addEventListener("DOMContentLoaded", () => boot(runtime), { once: true });
      return;
    }
    boot(runtime);
  }

  function run(context) {
    const win = (context && context.window) || (typeof window !== "undefined" ? window : root.window);
    if (!win || !win.document || !PAGE_PATTERN.test(String(win.location.href || ""))) {
      return false;
    }
    const runtime = createRuntime(win, context);
    injectDialogPatch(win.document, STORAGE_KEYS.AUTOYES, "main");
    patchDialogHost(win, runtime);
    scheduleBoot(runtime);
    return true;
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    run,
    buildPreviewQueue,
    parseResultTableHtml,
    isResultTextCandidate,
    hasOrderCountDecreased,
    shouldRefreshQueueFromLivePage,
    buildDialogPatchScript,
    reduceImportState,
    summarizeImportResults,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


