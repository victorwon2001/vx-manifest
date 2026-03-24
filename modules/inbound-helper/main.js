module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "inbound-helper";
  const MODULE_NAME = "입고도우미";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm106edit4.jsp*"];

  const KEY_QUEUE_MAP = "ebut_v5_queue_map";
  const KEY_RUNNING = "ebut_v5_running";
  const KEY_ERRORS = "ebut_v5_errors";
  const KEY_LOGS = "ebut_v5_logs";
  const KEY_RETRY = "ebut_v5_retry";

  const DOCK_ID = "tmInboundHelperDock";
  const GUI_ID = "tmInboundHelperGui";
  const TOGGLE_ID = "tmInboundHelperToggle";
  const INPUT_ID = "tmInboundHelperInput";
  const LOG_ID = "tmInboundHelperLog";
  const STYLE_ID = "tm-inbound-helper-style";
  const STATE_KEY = "__tmInboundHelperState";

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
    return null;
  }

  function getJQuery(scope) {
    const candidate = (scope && (scope.jQuery || scope.$)) || (typeof globalThis !== "undefined" && (globalThis.jQuery || globalThis.$));
    return typeof candidate === "function" ? candidate : null;
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

  function normCode(value) {
    return safeTrim(value).toUpperCase();
  }

  function normalizeLooseText(value) {
    return safeTrim(value).toLowerCase().replace(/[\s\-_]/g, "");
  }

  function parseLine(line) {
    const normalized = String(line == null ? "" : line).replace(/\u00a0/g, " ").trim();
    if (!normalized) return null;
    const match = normalized.match(/^(\S+)\s+(-?[\d,]+)(?:\s+(.+))?$/);
    if (!match) return null;
    const qty = parseInt(match[2].replace(/,/g, ""), 10);
    if (Number.isNaN(qty)) return null;
    return {
      code: normCode(match[1]),
      qty,
      loc: safeTrim(match[3] || ""),
    };
  }

  function parseDataForBatch(text, merge) {
    const map = new Map();
    const keys = [];
    String(text == null ? "" : text).split(/\r?\n/).forEach((line) => {
      const parsed = parseLine(line);
      if (!parsed) return;
      const key = merge ? parsed.code : parsed.code + "||" + parsed.loc;
      if (!map.has(key)) {
        map.set(key, {
          code: parsed.code,
          qty: parsed.qty,
          loc: parsed.loc,
        });
        keys.push(key);
        return;
      }
      const target = map.get(key);
      target.qty += parsed.qty;
      if (!target.loc && parsed.loc) target.loc = parsed.loc;
    });
    return { data: map, keys };
  }

  function buildQueueMapFromText(text) {
    const queueMap = {};
    let totalTasks = 0;
    String(text == null ? "" : text).split(/\r?\n/).forEach((line) => {
      const parsed = parseLine(line);
      if (!parsed) return;
      if (!queueMap[parsed.code]) queueMap[parsed.code] = [];
      queueMap[parsed.code].push({ qty: parsed.qty, loc: parsed.loc, original: line });
      totalTasks += 1;
    });
    return { queueMap, totalTasks };
  }

  function extractCodeTokensFromText(text) {
    const normalized = safeTrim(String(text == null ? "" : text).replace(/\u00a0/g, " ").replace(/\u200b/g, " ")).toUpperCase();
    const tokens = [];
    const seen = new Set();
    let match;
    const paren = /\(([A-Z0-9][A-Z0-9_\-]{1,})\)/g;
    while ((match = paren.exec(normalized))) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        tokens.push(match[1]);
      }
    }
    const looseTokens = normalized.match(/[A-Z0-9][A-Z0-9_\-]{2,}/g) || [];
    looseTokens.forEach((token) => {
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    });
    return tokens;
  }

  function pickFirstActiveCode(tokens, activeCodes) {
    for (const token of Array.isArray(tokens) ? tokens : []) {
      if (activeCodes && typeof activeCodes.has === "function" && activeCodes.has(token)) return token;
    }
    return "";
  }

  function getPageState(win, unsafeWin) {
    if (!win[STATE_KEY]) {
      win[STATE_KEY] = {
        win,
        initialized: false,
        runningScheduled: false,
        originalAlert: win.alert,
        originalConfirm: win.confirm,
        unsafeWindow: unsafeWin || win,
        $: null,
      };
    }
    win[STATE_KEY].win = win;
    if (unsafeWin) win[STATE_KEY].unsafeWindow = unsafeWin;
    return win[STATE_KEY];
  }

  function buildGuiHtml(moduleUi) {
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "panel", className: "tm-inbound-helper", density: "compact" })
      : 'class="tm-ui-root tm-ui-panel tm-inbound-helper" data-tm-density="compact"';
    return [
      '<div id="' + DOCK_ID + '" class="tm-inbound-helper__dock">',
      '  <button type="button" id="' + TOGGLE_ID + '" class="tm-ui-btn tm-ui-btn--secondary" aria-controls="' + GUI_ID + '" aria-pressed="false" aria-expanded="false"><span class="tm-inbound-helper__toggle-dot" aria-hidden="true"></span><span class="tm-inbound-helper__toggle-label">입고도우미 열기</span></button>',
      '  <div id="' + GUI_ID + '" ' + rootAttrs + ' style="display:none">',
      '    <div class="tm-ui-card tm-inbound-helper__shell">',
      '      <div class="tm-ui-panel-head tm-ui-panel-head--compact">',
      '        <div class="tm-ui-head-meta">',
      "          <div>",
      '            <p class="tm-ui-kicker">Inbound Helper</p>',
      '            <h3 class="tm-ui-title">입고도우미</h3>',
      '            <p class="tm-ui-subtitle">단순 일괄 입력과 병렬 순차 반복을 한 화면에서 처리합니다.</p>',
      "          </div>",
      '          <button type="button" class="tm-ui-btn tm-ui-btn--ghost tm-inbound-helper__close" data-action="close-panel">닫기</button>',
      "        </div>",
      "      </div>",
      '      <div class="tm-inbound-helper__body tm-ui-stack">',
      '        <div class="tm-inbound-helper__tabs">',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--secondary tm-inbound-helper__tab is-active" data-mode="batch">단순 일괄 입력</button>',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--secondary tm-inbound-helper__tab" data-mode="seq">병렬 순차 반복</button>',
      "        </div>",
      '        <div id="tmInboundHelperDescBatch" class="tm-ui-message tm-inbound-helper__desc"><strong>단순 입력</strong><br>화면에 있는 상품에 수량을 한 번에 채워 넣습니다. 같은 상품이 여러 줄이면 합산되고, 행 분할은 하지 않습니다.</div>',
      '        <div id="tmInboundHelperDescSeq" class="tm-ui-message tm-inbound-helper__desc tm-inbound-helper__desc--accent" hidden><strong>고속 병렬 처리</strong><br>현재 화면의 모든 상품을 한 번씩 입력하고 저장한 뒤 자동 새로고침으로 다음 회차를 반복합니다. 정확코드 매칭, 로케이션 검증, 알림창 무시를 포함합니다.</div>',
      '        <div id="tmInboundHelperInputArea" class="tm-ui-stack">',
      '          <label class="tm-ui-label" for="' + INPUT_ID + '"><span>입력 데이터</span><textarea id="' + INPUT_ID + '" class="tm-ui-textarea" placeholder="[붙여넣기]\n상품코드  수량  [로케이션]"></textarea></label>',
      '          <div id="tmInboundHelperBatchOptions" class="tm-inbound-helper__options tm-ui-stack">',
      '            <label class="tm-inbound-helper__checkbox"><input type="checkbox" id="tmInboundHelperMerge" checked> <span>중복 상품 수량 합산하기</span></label>',
      '            <label class="tm-inbound-helper__checkbox"><input type="checkbox" id="tmInboundHelperAutoSave"> <span>입력 후 자동 저장 (오류 0건 시)</span></label>',
      '            <button type="button" class="tm-ui-btn tm-ui-btn--primary" id="tmInboundHelperRunBatch">일괄 입력 시작</button>',
      "          </div>",
      '          <div id="tmInboundHelperSeqOptions" class="tm-inbound-helper__options" hidden>',
      '            <button type="button" class="tm-ui-btn tm-ui-btn--success" id="tmInboundHelperRunSeq">병렬 순차 시작</button>',
      "          </div>",
      "        </div>",
      '        <div id="tmInboundHelperRunningArea" class="tm-ui-stack" hidden>',
      '          <div class="tm-ui-statusbar"><span class="tm-ui-inline-note">자동 처리</span><span class="tm-ui-badge tm-ui-badge--success">실행 중</span></div>',
      '          <div id="tmInboundHelperProgress" class="tm-ui-message">남은 작업을 계산하는 중입니다.</div>',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--danger" id="tmInboundHelperStopSeq">강제 중지</button>',
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
      "#" + DOCK_ID + "{position:fixed;top:12px;right:12px;z-index:9999;display:grid;justify-items:end;gap:10px;pointer-events:none}",
      "#" + DOCK_ID + ">*{pointer-events:auto}",
      "#" + DOCK_ID + ".is-open{z-index:10000}",
      "#" + GUI_ID + "{position:relative;width:min(460px,calc(100vw - 24px));max-height:calc(90vh - 46px);overflow:auto;resize:both}",
      "#" + GUI_ID + ".is-running .tm-inbound-helper__shell{border-color:#d1e2da;box-shadow:0 24px 42px rgba(45,52,53,.12)}",
      "#" + GUI_ID + " .tm-inbound-helper__shell{display:grid;gap:0;overflow:hidden}",
      "#" + GUI_ID + " .tm-inbound-helper__body{padding:14px 16px}",
      "#" + GUI_ID + " .tm-inbound-helper__tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
      "#" + GUI_ID + " .tm-inbound-helper__tab.is-active{background:var(--tm-accent-wash);color:#fff;border-color:var(--tm-primary-strong)}",
      "#" + GUI_ID + " .tm-inbound-helper__desc{line-height:1.6}",
      "#" + GUI_ID + " .tm-inbound-helper__desc--accent{background:#edf3f8;border-color:#c8d9ea;color:#2a3f52}",
      "#" + GUI_ID + " .tm-inbound-helper__options{display:grid;gap:8px}",
      "#" + GUI_ID + " .tm-inbound-helper__checkbox{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tm-text)}",
      "#" + GUI_ID + " .tm-inbound-helper__checkbox input{width:16px;height:16px;margin:0}",
      "#" + GUI_ID + " textarea{min-height:132px;font-family:Consolas,'Courier New',monospace;font-size:12px}",
      "#" + GUI_ID + " .tm-ui-log{max-height:160px;overflow:auto}",
      "#" + TOGGLE_ID + "{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;box-shadow:0 14px 28px rgba(45,52,53,.12)}",
      "#" + TOGGLE_ID + " .tm-inbound-helper__toggle-dot{width:8px;height:8px;border-radius:50%;background:var(--tm-primary-strong);display:inline-block}",
      "#" + TOGGLE_ID + " .tm-inbound-helper__toggle-label{display:inline-flex;align-items:center;font-weight:700;letter-spacing:-.01em}",
      "#" + TOGGLE_ID + ".is-open{background:var(--tm-surface-alt)}",
      "#" + TOGGLE_ID + ".is-open .tm-inbound-helper__toggle-dot{background:var(--tm-success)}",
      "@media (max-width: 768px){#" + DOCK_ID + "{top:8px;right:8px}#" + GUI_ID + "{width:min(100vw - 16px,520px)}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/stm\/stm106edit4\.jsp/i.test(String(win && win.location && win.location.href || ""));
  }

  function getTargetRows($) {
    return $("table.tb > tbody > tr").filter((index, row) => {
      const cells = $(row).find("td");
      return cells.length > 5 && /^\d+$/.test(safeTrim(cells.first().text())) && cells.find("input").length > 0;
    });
  }

  function getRowSearchText($, $row) {
    const parts = [];
    $row.find("td").each(function eachCell() {
      const $cell = $(this);
      if ($cell.find("select").length) return;
      parts.push($cell.text());
    });
    return safeTrim(parts.join(" ").replace(/\u00a0/g, " ").replace(/\u200b/g, " ")).toUpperCase();
  }

  function extractRowCodesOrdered($, $row) {
    return extractCodeTokensFromText(getRowSearchText($, $row));
  }

  function findRowCodeForActiveSet($, $row, activeCodes) {
    return pickFirstActiveCode(extractRowCodesOrdered($, $row), activeCodes);
  }

  function buildRowIndex($, $rows) {
    const index = new Map();
    $rows.each(function eachRow() {
      const row = this;
      extractRowCodesOrdered($, $(row)).forEach((code) => {
        if (!index.has(code)) index.set(code, []);
        index.get(code).push(row);
      });
    });
    return index;
  }

  function setLocation($, $select, locText) {
    if (!$select || !$select.length || !locText) return false;
    const target = normalizeLooseText(locText);
    let matchedValue = "";
    $select.find("option").each(function eachOption() {
      const value = $(this).val();
      if (value && (value === locText || String(value).endsWith("," + locText))) {
        matchedValue = value;
        return false;
      }
      return undefined;
    });
    if (!matchedValue) {
      $select.find("option").each(function eachOptionText() {
        if (normalizeLooseText($(this).text()).indexOf(target) !== -1) {
          matchedValue = $(this).val();
          return false;
        }
        return undefined;
      });
    }
    if (!matchedValue) return false;
    $select.val(matchedValue).trigger("change").trigger("chosen:updated");
    const $chosen = $select.next(".chosen-container").find(".chosen-single span");
    if ($chosen.length) $chosen.text($select.find("option[value='" + matchedValue + "']").text());
    return true;
  }

  function setInput($, $row, qty, loc) {
    $row.find("input[name='PREINSTOCK_CQTY']").val(qty);
    $row.find("input[name='ckbox']").prop("checked", true);
    if (loc) setLocation($, $row.find("select[name='INOUTSTOCK_LOCA']"), loc);
  }

  function syncTogglePosition($) {
    const isVisible = $("#" + GUI_ID).is(":visible");
    $("#" + DOCK_ID).toggleClass("is-open", isVisible);
    $("#" + TOGGLE_ID)
      .toggleClass("is-open", isVisible)
      .attr("aria-pressed", isVisible ? "true" : "false")
      .attr("aria-expanded", isVisible ? "true" : "false");
    $("#" + TOGGLE_ID + " .tm-inbound-helper__toggle-label").text(isVisible ? "입고도우미 닫기" : "입고도우미 열기");
  }

  function readLogs(win) {
    return win.localStorage.getItem(KEY_LOGS) || "";
  }

  function writeLogs(win, html) {
    win.localStorage.setItem(KEY_LOGS, html);
  }

  function appendLog(state, message, isError) {
    const color = isError ? "#fca5a5" : "#ecf2f2";
    const current = readLogs(state.win);
    const next = current + '<div style="color:' + color + ';border-bottom:1px solid rgba(255,255,255,.08);padding:2px 0">' + escapeHtml(message) + "</div>";
    writeLogs(state.win, next);
    state.$("#" + LOG_ID).html(next);
    const logNode = state.$("#" + LOG_ID).get(0);
    if (logNode) logNode.scrollTop = logNode.scrollHeight;
  }

  function replaceLog(state, html) {
    writeLogs(state.win, html);
    state.$("#" + LOG_ID).html(html || "준비됨.");
  }

  function setProgress(state, text) {
    state.$("#tmInboundHelperProgress").text(text);
  }

  function setMode(state, mode) {
    const isBatch = mode !== "seq";
    state.mode = isBatch ? "batch" : "seq";
    state.$(".tm-inbound-helper__tab").removeClass("is-active");
    state.$(".tm-inbound-helper__tab[data-mode='" + state.mode + "']").addClass("is-active");
    state.$("#tmInboundHelperDescBatch").prop("hidden", !isBatch);
    state.$("#tmInboundHelperBatchOptions").prop("hidden", !isBatch);
    state.$("#tmInboundHelperDescSeq").prop("hidden", isBatch);
    state.$("#tmInboundHelperSeqOptions").prop("hidden", isBatch);
  }

  function showRunningState(state) {
    state.$("#" + GUI_ID).show().addClass("is-running");
    state.$("#tmInboundHelperInputArea").prop("hidden", true);
    state.$("#tmInboundHelperRunningArea").prop("hidden", false);
    replaceLog(state, readLogs(state.win));
    syncTogglePosition(state.$);
  }

  function showIdleState(state) {
    state.$("#" + GUI_ID).removeClass("is-running");
    state.$("#tmInboundHelperInputArea").prop("hidden", false);
    state.$("#tmInboundHelperRunningArea").prop("hidden", true);
    if (!readLogs(state.win)) replaceLog(state, "준비됨.");
  }

  function executeGoSave(win, unsafeWin) {
    const pageWindow = unsafeWin || win;
    try {
      if (pageWindow && typeof pageWindow.go_save === "function") {
        pageWindow.go_save();
        return;
      }
      if (win && typeof win.go_save === "function") {
        win.go_save();
        return;
      }
      win.location.href = "javascript:go_save()";
    } catch (error) {
      if (win.console && typeof win.console.error === "function") win.console.error("[입고도우미] 저장 실행 실패", error);
    }
  }

  function overrideNativePopups(state) {
    if (state.popupsOverridden) return;
    const pageWindow = state.unsafeWindow || state.win;
    state.originalAlert = state.win.alert;
    state.originalConfirm = state.win.confirm;
    const autoConfirm = function autoConfirm() { return true; };
    const autoAlert = function autoAlert(message) {
      if (state.win.console && typeof state.win.console.log === "function") {
        state.win.console.log("[입고도우미] alert 무시", message);
      }
      return true;
    };
    state.win.confirm = autoConfirm;
    state.win.alert = autoAlert;
    if (pageWindow) {
      pageWindow.confirm = autoConfirm;
      pageWindow.alert = autoAlert;
    }
    state.popupsOverridden = true;
  }

  function restoreNativePopups(state) {
    const pageWindow = state.unsafeWindow || state.win;
    state.win.alert = state.originalAlert || state.win.alert;
    state.win.confirm = state.originalConfirm || state.win.confirm;
    if (pageWindow) {
      pageWindow.alert = state.originalAlert || state.win.alert;
      pageWindow.confirm = state.originalConfirm || state.win.confirm;
    }
    state.popupsOverridden = false;
  }

  function finishProcessing(state, errors) {
    state.win.localStorage.setItem(KEY_RUNNING, "false");
    state.win.localStorage.setItem(KEY_RETRY, "0");
    restoreNativePopups(state);
    showIdleState(state);
    setMode(state, "seq");
    appendLog(state, "--- 종료 ---", false);
    let message = "모든 작업이 완료되었습니다.";
    if (Array.isArray(errors) && errors.length) {
      message += "\n\n실패 " + errors.length + "건\n" + errors.join("\n");
    }
    (state.unsafeWindow || state.win).alert(message);
  }

  function stopProcessing(state, message) {
    state.win.localStorage.setItem(KEY_RUNNING, "false");
    state.win.localStorage.setItem(KEY_RETRY, "0");
    restoreNativePopups(state);
    (state.unsafeWindow || state.win).alert(message);
    state.win.location.reload();
  }

  function processParallelQueue(state) {
    const $ = state.$;
    let queueMap = JSON.parse(state.win.localStorage.getItem(KEY_QUEUE_MAP) || "{}");
    let errors = JSON.parse(state.win.localStorage.getItem(KEY_ERRORS) || "[]");
    let remainingTasks = 0;
    Object.keys(queueMap).forEach((key) => {
      remainingTasks += Array.isArray(queueMap[key]) ? queueMap[key].length : 0;
    });
    setProgress(state, "남은 작업: " + remainingTasks + "건");
    if (remainingTasks === 0) {
      finishProcessing(state, errors);
      return;
    }
    const activeCodes = new Set(Object.keys(queueMap).filter((code) => Array.isArray(queueMap[code]) && queueMap[code].length > 0));
    state.win.setTimeout(() => {
      const $rows = getTargetRows($);
      let processedCount = 0;
      $rows.each(function eachRow() {
        const $row = $(this);
        const rowCode = findRowCodeForActiveSet($, $row, activeCodes);
        if (!rowCode) return;
        const tasks = queueMap[rowCode];
        if (!Array.isArray(tasks) || !tasks.length) return;
        const task = tasks[0];
        if (task.loc) {
          const ok = setLocation($, $row.find("select[name='INOUTSTOCK_LOCA']"), task.loc);
          if (!ok) {
            const errorMessage = "[Loc없음] " + rowCode + " -> " + task.loc;
            errors.push(errorMessage);
            appendLog(state, errorMessage, true);
            tasks.shift();
            processedCount += 1;
            return;
          }
        }
        $row.find("input[name='PREINSTOCK_CQTY']").val(task.qty);
        $row.find("input[name='ckbox']").prop("checked", true);
        appendLog(state, "입력: " + rowCode + " (" + task.qty + ")" + (task.loc ? " " + task.loc : ""), false);
        tasks.shift();
        processedCount += 1;
      });
      if (processedCount > 0) {
        state.win.localStorage.setItem(KEY_RETRY, "0");
        state.win.localStorage.setItem(KEY_QUEUE_MAP, JSON.stringify(queueMap));
        state.win.localStorage.setItem(KEY_ERRORS, JSON.stringify(errors));
        appendLog(state, processedCount + "건 입력 완료. 저장합니다.", false);
        state.win.setTimeout(() => executeGoSave(state.win, state.unsafeWindow), 300);
        return;
      }
      let retry = parseInt(state.win.localStorage.getItem(KEY_RETRY) || "0", 10);
      if (retry < 5) {
        retry += 1;
        state.win.localStorage.setItem(KEY_RETRY, String(retry));
        appendLog(state, "매칭 0건. " + retry + "/5 재시도...", true);
        state.win.setTimeout(() => processParallelQueue(state), 800 * retry);
        return;
      }
      Object.keys(queueMap).forEach((codeKey) => {
        (queueMap[codeKey] || []).forEach(() => {
          const message = "[상품미발견] " + codeKey + " - 테이블에 없음";
          errors.push(message);
          appendLog(state, message, true);
        });
      });
      state.win.localStorage.setItem(KEY_QUEUE_MAP, "{}");
      state.win.localStorage.setItem(KEY_ERRORS, JSON.stringify(errors));
      finishProcessing(state, errors);
    }, 700);
  }

  function runBatchMode(state) {
    const $ = state.$;
    replaceLog(state, "");
    const raw = state.$("#" + INPUT_ID).val().trim();
    if (!raw) {
      (state.unsafeWindow || state.win).alert("데이터가 없습니다.");
      return;
    }
    const parsed = parseDataForBatch(raw, state.$("#tmInboundHelperMerge").is(":checked"));
    if (!parsed.keys.length) {
      (state.unsafeWindow || state.win).alert("유효한 데이터가 없습니다.");
      return;
    }
    const rowIndex = buildRowIndex($, getTargetRows($));
    let success = 0;
    let fail = 0;
    parsed.keys.forEach((key) => {
      const item = parsed.data.get(key);
      const candidates = rowIndex.get(item.code) || [];
      let matched = false;
      for (const row of candidates) {
        const $row = $(row);
        if ($row.attr("data-auto-filled")) continue;
        setInput($, $row, item.qty, item.loc);
        $row.attr("data-auto-filled", "true").css("background", "#e7f5ea");
        success += 1;
        matched = true;
        appendLog(state, "[성공] " + item.code + " / " + item.qty + "개", false);
        break;
      }
      if (!matched) {
        fail += 1;
        appendLog(state, "[실패] " + item.code + " - 행을 찾지 못함", true);
      }
    });
    appendLog(state, "결과: 성공 " + success + ", 실패 " + fail, fail > 0);
    if (success > 0 && fail === 0 && state.$("#tmInboundHelperAutoSave").is(":checked")) {
      state.win.setTimeout(() => executeGoSave(state.win, state.unsafeWindow), 1000);
    }
  }

  function runSequentialMode(state) {
    const raw = state.$("#" + INPUT_ID).val().trim();
    if (!raw) {
      (state.unsafeWindow || state.win).alert("데이터가 없습니다.");
      return;
    }
    const queueState = buildQueueMapFromText(raw);
    if (!queueState.totalTasks) {
      (state.unsafeWindow || state.win).alert("데이터 형식 오류");
      return;
    }
    const confirmed = (state.unsafeWindow || state.win).confirm("총 " + queueState.totalTasks + "건의 작업을 시작합니다.\n페이지가 자동으로 새로고침되며 처리됩니다.");
    if (!confirmed) return;
    state.win.localStorage.setItem(KEY_QUEUE_MAP, JSON.stringify(queueState.queueMap));
    state.win.localStorage.setItem(KEY_RUNNING, "true");
    state.win.localStorage.setItem(KEY_ERRORS, "[]");
    state.win.localStorage.setItem(KEY_LOGS, '<div style="color:#ecf2f2;border-bottom:1px solid rgba(255,255,255,.08);padding:2px 0">자동화를 시작했습니다.</div>');
    state.win.localStorage.setItem(KEY_RETRY, "0");
    state.win.location.reload();
  }

  function bindEvents(state) {
    const $ = state.$;
    $("#" + TOGGLE_ID).on("click", () => {
      $("#" + GUI_ID).toggle();
      syncTogglePosition($);
    });
    $("#" + GUI_ID).on("click", "[data-action='close-panel']", () => {
      $("#" + GUI_ID).hide();
      syncTogglePosition($);
    });
    $("#" + GUI_ID).on("click", ".tm-inbound-helper__tab", function onTabClick() {
      if (state.win.localStorage.getItem(KEY_RUNNING) === "true") return;
      setMode(state, $(this).data("mode"));
    });
    $("#tmInboundHelperRunBatch").on("click", () => runBatchMode(state));
    $("#tmInboundHelperRunSeq").on("click", () => runSequentialMode(state));
    $("#tmInboundHelperStopSeq").on("click", () => stopProcessing(state, "사용자 중지"));
  }

  function mountGui(state) {
    if (state.initialized) return;
    ensureStyles(state.win.document);
    const moduleUi = getModuleUi(root);
    state.$("body").append(buildGuiHtml(moduleUi));
    bindEvents(state);
    setMode(state, "batch");
    state.initialized = true;
    syncTogglePosition(state.$);
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    const unsafeWin = context && context.unsafeWindow ? context.unsafeWindow : (win && win.unsafeWindow) || win;
    if (!shouldRun(win)) return;
    const $ = getJQuery(win);
    if (!$) return;
    const state = getPageState(win, unsafeWin);
    state.$ = $;
    $(win.document).ready(() => {
      mountGui(state);
      if (win.localStorage.getItem(KEY_RUNNING) === "true" && !state.runningScheduled) {
        state.runningScheduled = true;
        overrideNativePopups(state);
        showRunningState(state);
        processParallelQueue(state);
      } else if (win.localStorage.getItem(KEY_RUNNING) !== "true") {
        showIdleState(state);
      }
    });
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    normCode,
    parseLine,
    parseDataForBatch,
    buildQueueMapFromText,
    extractCodeTokensFromText,
    pickFirstActiveCode,
    normalizeLooseText,
    buildGuiHtml,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);



