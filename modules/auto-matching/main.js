module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "auto-matching";
  const MODULE_NAME = "자동 매칭";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/site/site217edit.jsp*"];

  const STATE_KEY = "__tmAutoMatchingState";
  const STYLE_ID = "tm-auto-matching-style";
  const DOCK_ID = "tmAutoMatchingDock";
  const PANEL_ID = "tmAutoMatchingPanel";
  const TOGGLE_ID = "tmAutoMatchingToggle";
  const STATUS_ID = "tmAutoMatchingStatus";
  const LOG_ID = "tmAutoMatchingLog";
  const START_ID = "tmAutoMatchingStart";
  const STOP_ID = "tmAutoMatchingStop";

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
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

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/site\/site217edit\.jsp/i.test(String(win && win.location && win.location.href || ""));
  }

  function sleep(win, ms) {
    const scope = win || root;
    return new Promise((resolve) => scope.setTimeout(resolve, ms));
  }

  function readCellText(cell) {
    if (!cell) return "";
    return safeTrim(cell.getAttribute("title") || cell.textContent || "");
  }

  function extractRowData(row) {
    return Array.from(row ? row.querySelectorAll("td") : []).map(readCellText);
  }

  function shouldSkipCs(rowTexts) {
    return (Array.isArray(rowTexts) ? rowTexts : []).some((text) => safeTrim(text).toUpperCase() === "CS");
  }

  function selectTargetIndex(leftRowData, candidateCodes) {
    const leftValues = (Array.isArray(leftRowData) ? leftRowData : []).map(safeTrim).filter(Boolean);
    const codes = (Array.isArray(candidateCodes) ? candidateCodes : []).map(safeTrim);
    if (!codes.length) return -1;
    if (codes.length === 1) return 0;
    for (let index = 0; index < codes.length; index += 1) {
      if (codes[index] && leftValues.includes(codes[index])) return index;
    }
    return -1;
  }

  function getRightRowCode(row) {
    return readCellText(row && row.querySelector("td[aria-describedby$='_basic_nicn']"));
  }

  function pickTargetRightRow(leftRowData, rightRows) {
    const rows = Array.isArray(rightRows) ? rightRows : [];
    const index = selectTargetIndex(leftRowData, rows.map(getRightRowCode));
    return index >= 0 ? rows[index] : null;
  }

  function isSetProductCandidate(rowCount, html) {
    return Number(rowCount) > 1 || String(html || "").indexOf("<b>ㄴ</b>") !== -1;
  }

  function getOrderQuantity(doc) {
    const orderQtyElem = doc && doc.getElementById("name1_qty");
    return parseInt(safeTrim(orderQtyElem && orderQtyElem.textContent).replace(/[^0-9]/g, ""), 10) || 1;
  }

  function dispatchInputEvents(win, input) {
    if (!input) return;
    input.dispatchEvent(new win.Event("keyup", { bubbles: true }));
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  function handleSetProductQuantity(win) {
    const doc = win && win.document;
    const listTable = doc && doc.getElementById("list_table");
    if (!listTable) return 0;
    const rows = listTable.querySelectorAll("tr");
    if (!isSetProductCandidate(rows.length, listTable.innerHTML)) return 0;

    const orderQty = getOrderQuantity(doc);
    const inputs = listTable.querySelectorAll("input[name='bmat_qty']");
    inputs.forEach((input) => {
      input.value = String(orderQty);
      dispatchInputEvents(win, input);
    });

    const qtyCheck = doc.getElementById("qty_check");
    if (qtyCheck && !qtyCheck.checked) qtyCheck.checked = true;
    return inputs.length;
  }

  async function waitForLoaderToDisappear(win, timeoutMs) {
    const doc = win && win.document;
    const loader = doc && doc.querySelector("#load_gridList_right");
    if (!loader) return true;

    await sleep(win, 100);

    const startedAt = Date.now();
    while (Date.now() - startedAt < (timeoutMs || 8000)) {
      const hidden = loader.style.display === "none" ||
        loader.hidden ||
        (typeof win.getComputedStyle === "function" && win.getComputedStyle(loader).display === "none");
      if (hidden) return true;
      await sleep(win, 100);
    }
    return false;
  }

  async function waitForClearData(win, timeoutMs) {
    const doc = win && win.document;
    const startedAt = Date.now();
    const limit = timeoutMs || 10000;

    while (Date.now() - startedAt < limit) {
      const nameElem = doc && doc.getElementById("name1");
      if (!nameElem || safeTrim(nameElem.textContent) === "") return true;
      await sleep(win, 200);
    }
    return false;
  }

  function setChecked(win, input) {
    if (!input) return;
    if (!input.checked && typeof input.click === "function") input.click();
    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new win.Event("change", { bubbles: true }));
    }
  }

  async function setConfigurations(win) {
    const doc = win && win.document;
    const radioProductCode = doc && doc.querySelector("input[name='autogbn'][value='6']");
    if (radioProductCode) {
      radioProductCode.checked = true;
      if (typeof radioProductCode.click === "function") radioProductCode.click();
    }

    setChecked(win, doc && doc.getElementById("qty_copy"));
    setChecked(win, doc && doc.getElementById("alert_check"));

    const searchSelect = doc && doc.getElementById("r_search_select");
    if (searchSelect) {
      searchSelect.value = "3";
      searchSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    }

    await sleep(win, 300);
  }

  function buildPanelHtml(moduleUi) {
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "panel", className: "tm-auto-matching", density: "compact" })
      : 'class="tm-ui-root tm-ui-panel tm-auto-matching" data-tm-density="compact"';
    const panelAttrs = rootAttrs.replace('class="', 'class="tm-ui-dock__panel ');

    return [
      '<div id="' + DOCK_ID + '" class="tm-ui-dock tm-auto-matching__dock">',
      '  <button type="button" id="' + TOGGLE_ID + '" class="tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary" aria-controls="' + PANEL_ID + '" aria-pressed="false" aria-expanded="false">',
      '    <span class="tm-ui-dock__toggle-dot tm-auto-matching__toggle-dot" aria-hidden="true"></span>',
      '    <span class="tm-ui-dock__toggle-label tm-auto-matching__toggle-label">자동 매칭 열기</span>',
      "  </button>",
      '  <div id="' + PANEL_ID + '" ' + panelAttrs + ' style="display:none">',
      '    <div class="tm-ui-card tm-auto-matching__shell">',
      '      <div class="tm-ui-panel-head tm-ui-panel-head--compact">',
      '        <div class="tm-ui-head-meta">',
      "          <div>",
      '            <p class="tm-ui-kicker">Auto Matching</p>',
      '            <h3 class="tm-ui-title">자동 매칭</h3>',
      '            <p class="tm-ui-subtitle">상품코드 기준 자동 매칭과 세트 수량 동기화를 순차 처리합니다.</p>',
      "          </div>",
      '          <button type="button" class="tm-ui-btn tm-ui-btn--ghost" data-action="close-panel">닫기</button>',
      "        </div>",
      "      </div>",
      '      <div class="tm-auto-matching__body tm-ui-stack">',
      '        <div class="tm-ui-statusbar">',
      '          <span class="tm-ui-inline-note">고정 옵션</span>',
      '          <div class="tm-auto-matching__badges">',
      '            <span class="tm-ui-badge">상품코드</span>',
      '            <span class="tm-ui-badge">수량복사</span>',
      '            <span class="tm-ui-badge">알림체크</span>',
      '            <span class="tm-ui-badge tm-ui-badge--warning">CS 제외</span>',
      "          </div>",
      "        </div>",
      '        <div id="' + STATUS_ID + '" class="tm-ui-message">준비됨. 시작 버튼을 누르면 현재 목록을 순서대로 처리합니다.</div>',
      '        <div class="tm-auto-matching__actions">',
      '          <button type="button" id="' + START_ID + '" class="tm-ui-btn tm-ui-btn--primary">자동 매칭 시작</button>',
      '          <button type="button" id="' + STOP_ID + '" class="tm-ui-btn tm-ui-btn--secondary" disabled>중지</button>',
      "        </div>",
      '        <div id="' + LOG_ID + '" class="tm-ui-log">준비됨.</div>',
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
      "#" + DOCK_ID + ".tm-ui-dock{top:14px;right:14px}",
      "#" + PANEL_ID + "{width:min(432px,calc(100vw - 28px));max-height:calc(90vh - 46px);overflow:auto}",
      "#" + PANEL_ID + ".is-running .tm-auto-matching__shell{border-color:rgba(45,95,212,.16);box-shadow:none}",
      "#" + PANEL_ID + " .tm-auto-matching__shell{display:grid;gap:0;overflow:hidden;border:0;box-shadow:none;background:transparent}",
      "#" + PANEL_ID + " .tm-auto-matching__body{padding:14px 16px}",
      "#" + PANEL_ID + " .tm-auto-matching__badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}",
      "#" + PANEL_ID + " .tm-auto-matching__actions{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}",
      "#" + LOG_ID + "{max-height:240px;overflow:auto;line-height:1.6}",
      "#" + TOGGLE_ID + ".tm-ui-dock__toggle{min-height:38px;padding:0 16px}",
      "#" + STATUS_ID + ".is-success{background:rgba(45,95,212,.08);border-color:rgba(45,95,212,.16);color:var(--tm-success)}",
      "#" + STATUS_ID + ".is-warning{background:rgba(201,81,81,.08);border-color:rgba(201,81,81,.14);color:var(--tm-warning)}",
      "#" + STATUS_ID + ".is-danger{background:rgba(201,81,81,.1);border-color:rgba(201,81,81,.16);color:var(--tm-danger)}",
      "@media (max-width: 768px){#" + DOCK_ID + ".tm-ui-dock{top:8px;right:8px}#" + PANEL_ID + "{width:min(100vw - 16px,420px)}#" + PANEL_ID + " .tm-auto-matching__actions{grid-template-columns:1fr}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getState(win, loader) {
    if (!win[STATE_KEY]) {
      win[STATE_KEY] = {
        win,
        loader: loader || null,
        initialized: false,
        running: false,
        cancelRequested: false,
      };
    }
    if (loader) win[STATE_KEY].loader = loader;
    return win[STATE_KEY];
  }

  function syncToggleState(state, isOpen) {
    const doc = state.win.document;
    const dock = doc.getElementById(DOCK_ID);
    const button = doc.getElementById(TOGGLE_ID);
    const panel = doc.getElementById(PANEL_ID);
    if (dock) dock.classList.toggle("is-open", !!isOpen);
    if (panel) panel.classList.toggle("is-open", !!isOpen);
    if (!button) return;
    button.classList.toggle("is-open", !!isOpen);
    button.setAttribute("aria-pressed", isOpen ? "true" : "false");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const label = button.querySelector(".tm-auto-matching__toggle-label");
    if (label) label.textContent = isOpen ? "자동 매칭 닫기" : "자동 매칭 열기";
  }

  function openPanel(state) {
    const panel = state.win.document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "block";
    syncToggleState(state, true);
  }

  function closePanel(state) {
    const panel = state.win.document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "none";
    syncToggleState(state, false);
  }

  function setStatus(state, text, tone) {
    const node = state.win.document.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = text;
    node.classList.remove("is-success", "is-warning", "is-danger");
    if (tone === "success") node.classList.add("is-success");
    else if (tone === "warning") node.classList.add("is-warning");
    else if (tone === "danger") node.classList.add("is-danger");
  }

  function getLogToneColor(tone) {
    if (tone === "danger") return "#ffb7af";
    if (tone === "warning") return "#f3d98f";
    return "#eef2f2";
  }

  function appendLog(state, message, tone) {
    const logNode = state.win.document.getElementById(LOG_ID);
    if (!logNode) return;
    const color = getLogToneColor(tone);
    const time = new Date().toLocaleTimeString("ko-KR");
    logNode.innerHTML += "<div style='color:" + color + ";border-bottom:1px solid rgba(255,255,255,.08);padding:3px 0'>[" +
      escapeHtml(time) + "] " + escapeHtml(message) + "</div>";
    logNode.scrollTop = logNode.scrollHeight;
  }

  function resetLog(state) {
    const logNode = state.win.document.getElementById(LOG_ID);
    if (logNode) logNode.innerHTML = "";
  }

  function setRunningState(state, running) {
    state.running = !!running;
    const doc = state.win.document;
    const panel = doc.getElementById(PANEL_ID);
    const startButton = doc.getElementById(START_ID);
    const stopButton = doc.getElementById(STOP_ID);
    if (panel) panel.classList.toggle("is-running", !!running);
    if (startButton) startButton.disabled = !!running;
    if (stopButton) stopButton.disabled = !running;
  }

  function notify(state, text) {
    const loader = state.loader;
    if (loader && typeof loader.notify === "function") {
      loader.notify({ title: MODULE_NAME, text });
      return;
    }
    if (state.win.alert) state.win.alert(text);
  }

  async function runAutomation(state) {
    if (state.running) return;

    const win = state.win;
    const doc = win.document;
    const leftRows = Array.from(doc.querySelectorAll("#gridList_left tbody tr.jqgrow"));

    state.cancelRequested = false;
    setRunningState(state, true);
    openPanel(state);
    resetLog(state);
    setStatus(state, "환경 설정을 적용하는 중입니다.", "");
    appendLog(state, "자동 매칭을 시작합니다.", "");

    await setConfigurations(win);

    let matched = 0;
    let skipped = 0;
    let failed = 0;

    appendLog(state, "총 " + leftRows.length + "개의 항목을 검사합니다.", "");

    for (let index = 0; index < leftRows.length; index += 1) {
      if (state.cancelRequested) break;

      const leftRow = leftRows[index];
      const leftRowData = extractRowData(leftRow);
      const progress = "[" + (index + 1) + "/" + leftRows.length + "]";

      if (shouldSkipCs(leftRowData)) {
        skipped += 1;
        appendLog(state, progress + " CS 코드 감지로 패스", "warning");
        continue;
      }

      setStatus(state, "항목 " + (index + 1) + "/" + leftRows.length + " 처리 중", "");

      if (typeof leftRow.scrollIntoView === "function") {
        leftRow.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      if (typeof leftRow.click === "function") leftRow.click();

      const loaderCleared = await waitForLoaderToDisappear(win, 8000);
      if (!loaderCleared) appendLog(state, progress + " 우측 목록 로딩 대기 시간이 초과되었습니다.", "warning");
      await sleep(win, 300);

      const rightRows = Array.from(doc.querySelectorAll("#gridList_right tbody tr.jqgrow"));
      const targetRightRow = pickTargetRightRow(leftRowData, rightRows);

      if (!targetRightRow) {
        skipped += 1;
        appendLog(state, progress + " 일치하는 우측 항목을 찾지 못해 패스", "warning");
        await sleep(win, 200);
        continue;
      }

      if (typeof targetRightRow.click === "function") targetRightRow.click();
      await sleep(win, 500);

      const syncedInputs = handleSetProductQuantity(win);
      if (syncedInputs > 0) {
        appendLog(state, progress + " 세트 상품 수량 " + syncedInputs + "건을 주문 수량으로 동기화", "");
      }

      await sleep(win, 200);

      const matchButton = doc.querySelector("a[href=\"javascript:go_new()\"]");
      if (!matchButton) {
        failed += 1;
        appendLog(state, progress + " 매칭 처리 버튼을 찾지 못했습니다.", "danger");
        continue;
      }

      if (typeof matchButton.click === "function") matchButton.click();

      const actionCleared = await waitForLoaderToDisappear(win, 8000);
      const dataCleared = await waitForClearData(win, 10000);
      matched += 1;
      appendLog(state, progress + " 매칭 완료" + (!actionCleared || !dataCleared ? " (대기 시간 초과 후 진행)" : ""), actionCleared && dataCleared ? "" : "warning");
      await sleep(win, 200);
    }

    setRunningState(state, false);

    if (state.cancelRequested) {
      setStatus(state, "작업이 중지되었습니다. 완료 " + matched + "건, 패스 " + skipped + "건", "warning");
      appendLog(state, "사용자 요청으로 작업을 중지했습니다.", "warning");
      return;
    }

    const message = "완료 " + matched + "건, 패스 " + skipped + "건, 오류 " + failed + "건";
    setStatus(state, "자동 매칭 작업이 끝났습니다. " + message, failed > 0 ? "warning" : "success");
    appendLog(state, "자동 매칭 작업 완료. " + message, failed > 0 ? "warning" : "");
    notify(state, "자동 매칭 작업이 완료되었습니다. " + message);
  }

  function bindEvents(state) {
    const doc = state.win.document;
    doc.getElementById(TOGGLE_ID).addEventListener("click", () => {
      const panel = doc.getElementById(PANEL_ID);
      const isVisible = panel && panel.style.display !== "none";
      if (isVisible) closePanel(state);
      else openPanel(state);
    });
    doc.getElementById(PANEL_ID).addEventListener("click", (event) => {
      const actionTarget = event.target && event.target.closest ? event.target.closest("[data-action='close-panel']") : null;
      if (actionTarget) closePanel(state);
    });
    doc.getElementById(START_ID).addEventListener("click", () => {
      runAutomation(state).catch((error) => {
        setRunningState(state, false);
        setStatus(state, "오류가 발생했습니다. 로그를 확인하세요.", "danger");
        appendLog(state, error && error.message ? error.message : "알 수 없는 오류", "danger");
      });
    });
    doc.getElementById(STOP_ID).addEventListener("click", () => {
      state.cancelRequested = true;
      setStatus(state, "중지 요청을 받았습니다. 현재 항목을 마무리한 뒤 멈춥니다.", "warning");
      appendLog(state, "중지 요청 수신", "warning");
    });
  }

  function mount(state) {
    if (state.initialized) return;
    ensureStyles(state.win.document);
    const moduleUi = getModuleUi(root);
    state.win.document.body.insertAdjacentHTML("beforeend", buildPanelHtml(moduleUi));
    bindEvents(state);
    state.initialized = true;
    syncToggleState(state, false);
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;
    const loader = context && context.loader ? context.loader : null;
    const state = getState(win, loader);
    if (win.document.readyState === "loading") {
      win.document.addEventListener("DOMContentLoaded", () => mount(state), { once: true });
      return;
    }
    mount(state);
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    shouldSkipCs,
    selectTargetIndex,
    pickTargetRightRow,
    isSetProductCandidate,
    getLogToneColor,
    handleSetProductQuantity,
    buildPanelHtml,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);




