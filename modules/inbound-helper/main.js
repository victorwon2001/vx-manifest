module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "inbound-helper";
  const MODULE_NAME = "입고도우미";
  const MODULE_VERSION = "0.1.7";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm106edit4.jsp*"];

  const KEY_RUNNING = "ebut_v5_running";
  const KEY_LOGS = "ebut_v5_logs";
  const KEY_RUN_STATE = "ebut_v6_run_state";
  const LEGACY_KEYS = ["ebut_v5_queue_map", "ebut_v5_errors", "ebut_v5_retry"];

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
          originalLine: line,
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

  function buildBatchTasks(text, merge) {
    const parsed = parseDataForBatch(text, merge);
    return parsed.keys.map((key, index) => {
      const item = parsed.data.get(key);
      return {
        id: "batch-" + String(index + 1),
        mode: "batch",
        order: index,
        code: item.code,
        loc: item.loc,
        qty: Math.max(0, item.qty),
        remainingQty: Math.max(0, item.qty),
        originalLine: item.originalLine || item.code + " " + item.qty + (item.loc ? " " + item.loc : ""),
      };
    });
  }

  function buildSequentialTasks(text) {
    const tasks = [];
    String(text == null ? "" : text).split(/\r?\n/).forEach((line) => {
      const parsed = parseLine(line);
      if (!parsed) return;
      tasks.push({
        id: "seq-" + String(tasks.length + 1),
        mode: "seq",
        order: tasks.length,
        code: parsed.code,
        loc: parsed.loc,
        qty: Math.max(0, parsed.qty),
        remainingQty: Math.max(0, parsed.qty),
        originalLine: line,
      });
    });
    return tasks;
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

  function toSafeInteger(value) {
    const numeric = parseInt(String(value == null ? "" : value).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function calculateRemainingInboundQty(expectedQty, receivedQty) {
    return Math.max(0, toSafeInteger(expectedQty) - toSafeInteger(receivedQty));
  }

  function extractPaginationInfoFromText(text) {
    const normalized = safeTrim(text).replace(/\s+/g, "");
    const match = normalized.match(/(\d+)\/(\d+)페이지/);
    if (!match) {
      return { currentPage: 1, totalPages: 1 };
    }
    const currentPage = Math.max(1, toSafeInteger(match[1]));
    const totalPages = Math.max(currentPage, toSafeInteger(match[2]));
    return { currentPage, totalPages };
  }

  function toPagerTarget(pageNumber) {
    const safePage = Math.max(1, toSafeInteger(pageNumber));
    const zeroBased = safePage - 1;
    return {
      pageNumber: safePage,
      pageValue: String(zeroBased),
      nowBlock: String(Math.floor(zeroBased / 10)),
    };
  }

  function buildIssue(type, details) {
    const base = details || {};
    return {
      type,
      severity: type === "초과분 마지막 행 반영" ? "warn" : "error",
      code: safeTrim(base.code),
      loc: safeTrim(base.loc),
      qty: Math.max(0, toSafeInteger(base.qty)),
      pageNumber: Math.max(0, toSafeInteger(base.pageNumber)),
      rowSeq: safeTrim(base.rowSeq),
      originalLine: safeTrim(base.originalLine),
      note: safeTrim(base.note),
    };
  }

  function groupRunIssues(issues) {
    const map = new Map();
    (Array.isArray(issues) ? issues : []).forEach((issue) => {
      const item = buildIssue(issue.type, issue);
      const key = [item.type, item.code, item.loc, item.note].join("|");
      if (!map.has(key)) {
        map.set(key, {
          type: item.type,
          severity: item.severity,
          code: item.code,
          loc: item.loc,
          note: item.note,
          count: 0,
          qty: 0,
          pages: new Set(),
        });
      }
      const target = map.get(key);
      target.count += 1;
      target.qty += item.qty;
      if (item.pageNumber > 0) target.pages.add(item.pageNumber);
    });
    return Array.from(map.values()).sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
      if (left.type !== right.type) return left.type.localeCompare(right.type, "ko");
      return left.code.localeCompare(right.code, "ko");
    });
  }

  function buildIssueSummaryText(issues) {
    const grouped = groupRunIssues(issues);
    if (!grouped.length) return "문제 없이 완료되었습니다.";
    return grouped.map((item) => {
      const parts = [item.type];
      if (item.code) parts.push(item.code);
      if (item.loc) parts.push("LOC " + item.loc);
      if (item.qty > 0) parts.push("수량 " + item.qty);
      if (item.pages.size) parts.push("페이지 " + Array.from(item.pages).sort((a, b) => a - b).join(", "));
      if (item.note) parts.push(item.note);
      parts.push(item.count + "건");
      return "- " + parts.join(" / ");
    }).join("\n");
  }

  function buildIssueSummaryHtml(issues) {
    const grouped = groupRunIssues(issues);
    if (!grouped.length) {
      return '<div class="tm-ui-message">문제 없이 완료되었습니다.</div>';
    }
    return grouped.map((item) => {
      const pages = item.pages.size ? "페이지 " + Array.from(item.pages).sort((a, b) => a - b).join(", ") : "";
      const qty = item.qty > 0 ? "수량 " + item.qty : "";
      const loc = item.loc ? "LOC " + item.loc : "";
      const note = item.note || "";
      const detail = [item.code, loc, qty, pages, note].filter(Boolean).join(" · ");
      return [
        '<div class="tm-ui-message' + (item.severity === "error" ? ' tm-ui-message--danger' : "") + '">',
        "  <strong>" + escapeHtml(item.type) + "</strong> <span>(" + escapeHtml(String(item.count)) + "건)</span>",
        detail ? "  <div>" + escapeHtml(detail) + "</div>" : "",
        "</div>",
      ].join("");
    }).join("");
  }

  function getModuleUiRootAttributes(moduleUi) {
    if (moduleUi && typeof moduleUi.buildRootAttributes === "function") {
      return moduleUi.buildRootAttributes({ kind: "panel", className: "tm-ui-root tm-ui-panel tm-inbound-helper", density: "compact" });
    }
    return 'class="tm-ui-root tm-ui-panel tm-inbound-helper" data-tm-density="compact"';
  }

  function getPageState(win, unsafeWin) {
    if (!win[STATE_KEY]) {
      win[STATE_KEY] = {
        win,
        initialized: false,
        processing: false,
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
    const rootAttrs = getModuleUiRootAttributes(moduleUi);
    const panelAttrs = rootAttrs.replace('class="', 'class="tm-ui-dock__panel ');
    return [
      '<div id="' + DOCK_ID + '" class="tm-ui-dock tm-inbound-helper__dock">',
      '  <button type="button" id="' + TOGGLE_ID + '" class="tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary" aria-controls="' + GUI_ID + '" aria-pressed="false" aria-expanded="false"><span class="tm-ui-dock__toggle-dot tm-inbound-helper__toggle-dot" aria-hidden="true"></span><span class="tm-ui-dock__toggle-label tm-inbound-helper__toggle-label">입고도우미 열기</span></button>',
      '  <div id="' + GUI_ID + '" ' + panelAttrs + ' style="display:none">',
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
      '        <div id="tmInboundHelperDescBatch" class="tm-ui-message tm-inbound-helper__desc"><strong>단순 입력</strong><br>로케이션 하나 또는 없이 수량을 한 번에 배분합니다. 같은 상품이 여러 행이면 남은 예정수량이 작은 행부터 채웁니다.</div>',
      '        <div id="tmInboundHelperDescSeq" class="tm-ui-message tm-inbound-helper__desc tm-inbound-helper__desc--accent" hidden><strong>병렬 순차 반복</strong><br>같은 상품을 여러 로케이션 라인으로 나눠 반복 입고합니다. 여러 페이지와 행 분할, 마지막 행 초과 배분을 지원합니다.</div>',
      '        <div id="tmInboundHelperInputArea" class="tm-ui-stack">',
      '          <label class="tm-ui-label" for="' + INPUT_ID + '"><span>입력 데이터</span><textarea id="' + INPUT_ID + '" class="tm-ui-textarea" placeholder="[붙여넣기]\n상품코드  수량  [로케이션]"></textarea></label>',
      '          <div id="tmInboundHelperBatchOptions" class="tm-inbound-helper__options tm-ui-stack">',
      '            <label class="tm-inbound-helper__checkbox"><input type="checkbox" id="tmInboundHelperMerge" checked> <span>중복 상품 수량 합산하기</span></label>',
      '            <label class="tm-inbound-helper__checkbox"><input type="checkbox" id="tmInboundHelperAutoSave"> <span>입력 후 자동 저장</span></label>',
      '            <button type="button" class="tm-ui-btn tm-ui-btn--primary" id="tmInboundHelperRunBatch">일괄 입력 시작</button>',
      "          </div>",
      '          <div id="tmInboundHelperSeqOptions" class="tm-inbound-helper__options" hidden>',
      '            <button type="button" class="tm-ui-btn tm-ui-btn--success" id="tmInboundHelperRunSeq">병렬 순차 시작</button>',
      "          </div>",
      "        </div>",
      '        <div id="tmInboundHelperRunningArea" class="tm-ui-stack" hidden>',
      '          <div class="tm-ui-statusbar"><span class="tm-ui-inline-note">자동 처리</span><span class="tm-ui-badge tm-ui-badge--success">실행 중</span></div>',
      '          <div id="tmInboundHelperProgress" class="tm-ui-message">작업을 준비하는 중입니다.</div>',
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
      "#" + DOCK_ID + "{position:fixed;top:14px;right:14px;z-index:9999;display:grid;justify-items:end;gap:10px;pointer-events:none}",
      "#" + DOCK_ID + ">*{pointer-events:auto}",
      "#" + DOCK_ID + ".is-open{z-index:10000}",
      "#" + TOGGLE_ID + "{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border:1px solid var(--tm-border,#d9dde2);border-radius:14px;background:rgba(255,255,255,.98);color:var(--tm-text,#17191b);box-shadow:0 14px 28px rgba(17,25,32,.12);text-decoration:none;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease}",
      "#" + TOGGLE_ID + ":hover{background:var(--tm-surface-alt,#f1f3f4);transform:translateY(-1px)}",
      "#" + TOGGLE_ID + ".is-open{background:rgba(255,255,255,.99);border-color:#c7d1dc;box-shadow:0 18px 34px rgba(17,25,32,.16)}",
      "#" + GUI_ID + "{position:relative;display:none;width:min(476px,calc(100vw - 28px));max-height:calc(90vh - 46px);overflow:auto;resize:both;border:1px solid var(--tm-border,#d9dde2);border-radius:20px;background:rgba(255,255,255,.99);box-shadow:0 28px 56px rgba(17,25,32,.18),0 8px 20px rgba(17,25,32,.08)}",
      "#" + GUI_ID + ".is-open{display:block}",
      "#" + GUI_ID + ".is-running .tm-inbound-helper__shell{border-color:#d1e2da;box-shadow:0 24px 42px rgba(45,52,53,.12)}",
      "#" + GUI_ID + " .tm-inbound-helper__shell{display:grid;gap:0;overflow:hidden;border:0;box-shadow:none;background:transparent}",
      "#" + GUI_ID + " .tm-inbound-helper__body{padding:14px 16px}",
      "#" + GUI_ID + " .tm-inbound-helper__tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
      "#" + GUI_ID + " .tm-inbound-helper__tab.is-active{background:var(--tm-accent-wash);color:#fff;border-color:var(--tm-primary-strong)}",
      "#" + GUI_ID + " .tm-inbound-helper__desc{line-height:1.6;background:var(--tm-surface-alt)}",
      "#" + GUI_ID + " .tm-inbound-helper__desc--accent{background:rgba(45,95,212,.08);border-color:rgba(45,95,212,.16);color:#2447a9}",
      "#" + GUI_ID + " .tm-inbound-helper__options{display:grid;gap:8px}",
      "#" + GUI_ID + " .tm-inbound-helper__checkbox{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tm-text)}",
      "#" + GUI_ID + " .tm-inbound-helper__checkbox input{width:16px;height:16px;margin:0}",
      "#" + GUI_ID + " textarea{min-height:132px;font-family:Consolas,'Courier New',monospace;font-size:12px}",
      "#" + GUI_ID + " .tm-ui-log{max-height:180px;overflow:auto}",
      "#" + TOGGLE_ID + ".tm-ui-dock__toggle{min-height:38px;padding:0 16px}",
      '@media (max-width: 768px){#" + DOCK_ID + ".tm-ui-dock{top:8px;right:8px}#" + GUI_ID + "{width:min(100vw - 16px,520px)}}',
    ].join("");
    doc.head.appendChild(style);
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/stm\/stm106edit4\.jsp/i.test(String((win && win.location && win.location.href) || ""));
  }

  function getTargetRows($) {
    return $("table.tb > tbody > tr").filter((index, row) => {
      const cells = $(row).find("td");
      return cells.length > 5 && /^\d+$/.test(safeTrim(cells.first().text())) && cells.find("input").length > 0;
    });
  }

  function getPaginationInfo($) {
    return extractPaginationInfoFromText($("body").text());
  }

  function syncTogglePosition($) {
    const isVisible = $("#" + GUI_ID).is(":visible");
    $("#" + DOCK_ID).toggleClass("is-open", isVisible);
    $("#" + GUI_ID).toggleClass("is-open", isVisible);
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

  function clearLegacyKeys(win) {
    LEGACY_KEYS.forEach((key) => win.localStorage.removeItem(key));
  }

  function readRunState(win) {
    const raw = win.localStorage.getItem(KEY_RUN_STATE);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeRunState(win, runState) {
    if (!runState) {
      win.localStorage.removeItem(KEY_RUN_STATE);
      return;
    }
    win.localStorage.setItem(KEY_RUN_STATE, JSON.stringify(runState));
  }

  function clearRunState(win) {
    win.localStorage.removeItem(KEY_RUN_STATE);
    win.localStorage.setItem(KEY_RUNNING, "false");
    clearLegacyKeys(win);
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

  function formatRunCompletionMessage(runState) {
    const issues = groupRunIssues(runState.issues || []);
    const errorCount = issues.filter((item) => item.severity === "error").reduce((sum, item) => sum + item.count, 0);
    const warnCount = issues.filter((item) => item.severity === "warn").reduce((sum, item) => sum + item.count, 0);
    if (!errorCount && !warnCount) {
      return "모든 작업이 완료되었습니다.";
    }
    const parts = ["작업이 완료되었습니다."];
    if (errorCount) parts.push("오류 " + errorCount + "건");
    if (warnCount) parts.push("경고 " + warnCount + "건");
    return parts.join(" / ");
  }

  function finishRun(state, runState) {
    const summaryHtml = buildIssueSummaryHtml(runState.issues || []);
    const summaryText = buildIssueSummaryText(runState.issues || []);
    replaceLog(state, '<div style="padding:6px 0;font-weight:700">최종 리포트</div>' + summaryHtml);
    clearRunState(state.win);
    restoreNativePopups(state);
    showIdleState(state);
    setMode(state, runState && runState.mode === "batch" ? "batch" : "seq");
    (state.unsafeWindow || state.win).alert(formatRunCompletionMessage(runState) + "\n\n" + summaryText);
  }

  function stopProcessing(state, message) {
    clearRunState(state.win);
    restoreNativePopups(state);
    (state.unsafeWindow || state.win).alert(message);
    state.win.location.reload();
  }

  function createRunState(mode, tasks, options) {
    return {
      version: 1,
      mode: mode,
      cycle: 0,
      autoSaveEffective: !!(options && options.autoSaveEffective),
      issues: [],
      tasks: (tasks || []).map((task) => Object.assign({}, task)),
      pending: null,
    };
  }

  function addRunIssues(runState, issues) {
    (Array.isArray(issues) ? issues : []).forEach((issue) => {
      runState.issues.push(buildIssue(issue.type, issue));
    });
  }

  function getActiveTasks(runState) {
    return (runState.tasks || []).filter((task) => Math.max(0, toSafeInteger(task.remainingQty)) > 0);
  }

  function extractLocationOptionsFromDomRow(row) {
    const select = row.querySelector("select[name='INOUTSTOCK_LOCA']");
    if (!select) return [];
    return Array.from(select.options || []).map((option) => ({
      value: safeTrim(option.value),
      text: safeTrim(option.textContent),
      normalizedText: normalizeLooseText(option.textContent),
    }));
  }

  function extractRowSearchTextFromDomRow(row) {
    const parts = [];
    Array.from(row.querySelectorAll("td")).forEach((cell) => {
      if (cell.querySelector("select")) return;
      parts.push(cell.textContent || "");
    });
    return safeTrim(parts.join(" ").replace(/\u00a0/g, " ").replace(/\u200b/g, " ")).toUpperCase();
  }

  function isEditableInboundRow(row) {
    const cells = row ? Array.from(row.querySelectorAll("td")) : [];
    if (cells.length <= 5) return false;
    if (!/^\d+$/.test(safeTrim(cells[0].textContent || ""))) return false;
    return !!row.querySelector("input[name='PREINSTOCK_SEQ']");
  }

  function extractRowSnapshotsFromDocument(doc, pageNumber) {
    return Array.from(doc.querySelectorAll("table.tb > tbody > tr"))
      .filter(isEditableInboundRow)
      .map((row, rowIndex) => {
        const expectedQty = safeTrim((row.querySelector("input[name='PREINSTOCK_INQTY']") || {}).value);
        const receivedQty = safeTrim((row.querySelector("input[name='PREINSTOCK_CQTY_ED']") || {}).value);
        const rowSeq = safeTrim((row.querySelector("input[name='PREINSTOCK_SEQ']") || {}).value);
        return {
          rowSeq,
          pageNumber: Math.max(1, toSafeInteger(pageNumber)),
          rowOrder: rowIndex,
          expectedQty: toSafeInteger(expectedQty),
          receivedQty: toSafeInteger(receivedQty),
          remainingQty: calculateRemainingInboundQty(expectedQty, receivedQty),
          codeTokens: extractCodeTokensFromText(extractRowSearchTextFromDomRow(row)),
          locationOptions: extractLocationOptionsFromDomRow(row),
        };
      })
      .filter((row) => row.rowSeq);
  }

  function rowSupportsLocation(row, loc) {
    const location = safeTrim(loc);
    if (!location) return true;
    const target = normalizeLooseText(location);
    return (row.locationOptions || []).some((option) => {
      if (option.value && (option.value === location || option.value.endsWith("," + location))) return true;
      return option.normalizedText.indexOf(target) !== -1;
    });
  }

  function indexRowsByCode(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      (row.codeTokens || []).forEach((code) => {
        if (!map.has(code)) map.set(code, []);
        map.get(code).push(row);
      });
    });
    map.forEach((items) => {
      items.sort((left, right) => {
        if (left.remainingQty !== right.remainingQty) return left.remainingQty - right.remainingQty;
        if (left.pageNumber !== right.pageNumber) return left.pageNumber - right.pageNumber;
        return left.rowOrder - right.rowOrder;
      });
    });
    return map;
  }

  function buildCycleAssignments(tasks, rows) {
    const activeTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => Math.max(0, toSafeInteger(task.remainingQty)) > 0);
    const rowsByCode = indexRowsByCode(rows);
    const usedRows = new Set();
    const assignments = [];
    const stalled = [];

    activeTasks.forEach((task) => {
      const allCandidates = rowsByCode.get(task.code) || [];
      if (!allCandidates.length) {
        stalled.push(buildIssue("후보 행 없음", {
          code: task.code,
          loc: task.loc,
          qty: task.remainingQty,
          originalLine: task.originalLine,
        }));
        return;
      }
      const locationCandidates = task.loc ? allCandidates.filter((row) => rowSupportsLocation(row, task.loc)) : allCandidates.slice();
      if (!locationCandidates.length) {
        stalled.push(buildIssue("로케이션 없음", {
          code: task.code,
          loc: task.loc,
          qty: task.remainingQty,
          originalLine: task.originalLine,
        }));
        return;
      }
      const usableRows = locationCandidates.filter((row) => !usedRows.has(row.rowSeq));
      if (!usableRows.length) return;

      let remainingQty = Math.max(0, toSafeInteger(task.remainingQty));
      for (let index = 0; index < usableRows.length && remainingQty > 0; index += 1) {
        const row = usableRows[index];
        const isLastRow = index === usableRows.length - 1;
        let appliedQty = remainingQty;
        if (!isLastRow && remainingQty > row.remainingQty) {
          appliedQty = row.remainingQty;
        }
        const overflowQty = Math.max(0, appliedQty - row.remainingQty);
        assignments.push({
          taskId: task.id,
          taskMode: task.mode,
          code: task.code,
          loc: task.loc,
          qty: appliedQty,
          overflowQty: overflowQty,
          pageNumber: row.pageNumber,
          rowOrder: row.rowOrder,
          rowSeq: row.rowSeq,
          beforeRemainingQty: row.remainingQty,
          beforeReceivedQty: row.receivedQty,
          originalLine: task.originalLine,
        });
        usedRows.add(row.rowSeq);
        remainingQty -= appliedQty;
      }
    });

    assignments.sort((left, right) => {
      if (left.pageNumber !== right.pageNumber) return left.pageNumber - right.pageNumber;
      if (left.rowOrder !== right.rowOrder) return left.rowOrder - right.rowOrder;
      return left.taskId.localeCompare(right.taskId, "en");
    });

    return { assignments, stalled };
  }

  function verifyPendingAssignments(assignments, currentRows) {
    const rowsBySeq = new Map();
    (Array.isArray(currentRows) ? currentRows : []).forEach((row) => rowsBySeq.set(row.rowSeq, row));
    const succeeded = [];
    const failed = [];
    (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
      const currentRow = rowsBySeq.get(assignment.rowSeq);
      const expectedReceivedQty = assignment.beforeReceivedQty + assignment.qty;
      const expectedRemainingQty = Math.max(0, assignment.beforeRemainingQty - assignment.qty);
      const success = !currentRow
        || currentRow.receivedQty >= expectedReceivedQty
        || currentRow.remainingQty <= expectedRemainingQty;
      if (success) {
        succeeded.push(assignment);
      } else {
        failed.push(assignment);
      }
    });
    return { succeeded, failed };
  }

  function applyAssignmentsToTasks(runState, assignments) {
    const tasksById = new Map((runState.tasks || []).map((task) => [task.id, task]));
    (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
      const task = tasksById.get(assignment.taskId);
      if (!task) return;
      task.remainingQty = Math.max(0, toSafeInteger(task.remainingQty) - toSafeInteger(assignment.qty));
      if (assignment.overflowQty > 0) {
        runState.issues.push(buildIssue("초과분 마지막 행 반영", {
          code: assignment.code,
          loc: assignment.loc,
          qty: assignment.overflowQty,
          pageNumber: assignment.pageNumber,
          rowSeq: assignment.rowSeq,
          originalLine: assignment.originalLine,
          note: "마지막 행에 초과분을 반영했습니다.",
        }));
      }
    });
  }

  function serializeTopLevelForm(doc) {
    const params = new URLSearchParams();
    const form = doc && doc.forms ? doc.forms.form1 : null;
    if (!form || !form.elements) return params;
    Array.from(form.elements).forEach((element) => {
      if (!element || !element.name || element.disabled) return;
      if (typeof element.closest === "function" && element.closest("table.tb")) return;
      const tagName = String(element.tagName || "").toLowerCase();
      const type = String(element.type || "").toLowerCase();
      if ((type === "checkbox" || type === "radio") && !element.checked) return;
      if (tagName === "select" && element.multiple) return;
      params.set(element.name, safeTrim(element.value));
    });
    return params;
  }

  function getEditPageUrl(win) {
    const form = win.document && win.document.forms ? win.document.forms.form1 : null;
    const action = form && form.getAttribute("action");
    if (action) {
      return new win.URL(action, win.location.href).toString();
    }
    return win.location.href;
  }

  function parseHtmlDocument(win, html) {
    const Parser = win.DOMParser || root.DOMParser;
    if (!Parser) throw new Error("DOMParser를 사용할 수 없습니다.");
    return new Parser().parseFromString(html, "text/html");
  }

  async function fetchPageDocument(state, requestParams, pageNumber) {
    const pager = toPagerTarget(pageNumber);
    const params = new URLSearchParams(requestParams.toString());
    params.set("nowBlock", pager.nowBlock);
    params.set("page", pager.pageValue);
    const fetchFn = state.win.fetch || root.fetch;
    if (typeof fetchFn !== "function") throw new Error("fetch를 사용할 수 없습니다.");
    const response = await fetchFn(getEditPageUrl(state.win), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: params.toString(),
    });
    if (!response || !response.ok) {
      throw new Error("페이지 스캔 실패 (" + pageNumber + "페이지)");
    }
    const html = await response.text();
    return parseHtmlDocument(state.win, html);
  }

  async function scanAllPages(state) {
    const currentInfo = getPaginationInfo(state.$);
    const requestParams = serializeTopLevelForm(state.win.document);
    const currentHtml = state.win.document.documentElement.outerHTML;
    const pages = [];
    const parsedCurrentDoc = parseHtmlDocument(state.win, currentHtml);
    const totalPages = Math.max(1, currentInfo.totalPages);
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const doc = pageNumber === currentInfo.currentPage
        ? parsedCurrentDoc
        : await fetchPageDocument(state, requestParams, pageNumber);
      pages.push({
        pageNumber: pageNumber,
        rows: extractRowSnapshotsFromDocument(doc, pageNumber),
      });
    }
    return {
      currentPage: currentInfo.currentPage,
      totalPages: totalPages,
      rows: pages.reduce((allRows, page) => allRows.concat(page.rows), []),
    };
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

  function applyAssignmentsOnCurrentPage(state, assignments) {
    const $ = state.$;
    const rowMap = new Map();
    getTargetRows($).each(function eachRow() {
      const $row = $(this);
      const rowSeq = safeTrim($row.find("input[name='PREINSTOCK_SEQ']").first().val());
      if (rowSeq) rowMap.set(rowSeq, $row);
    });
    const applied = [];
    const issues = [];

    (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
      const $row = rowMap.get(assignment.rowSeq);
      if (!$row || !$row.length) {
        issues.push(buildIssue("페이지 순회 후 미처리", {
          code: assignment.code,
          loc: assignment.loc,
          qty: assignment.qty,
          pageNumber: assignment.pageNumber,
          rowSeq: assignment.rowSeq,
          originalLine: assignment.originalLine,
          note: "대상 행을 현재 페이지에서 찾지 못했습니다.",
        }));
        return;
      }
      if (assignment.loc) {
        const ok = setLocation($, $row.find("select[name='INOUTSTOCK_LOCA']"), assignment.loc);
        if (!ok) {
          issues.push(buildIssue("로케이션 없음", {
            code: assignment.code,
            loc: assignment.loc,
            qty: assignment.qty,
            pageNumber: assignment.pageNumber,
            rowSeq: assignment.rowSeq,
            originalLine: assignment.originalLine,
          }));
          return;
        }
      }
      $row.find("input[name='PREINSTOCK_CQTY']").val(String(assignment.qty));
      $row.find("input[name='ckbox']").prop("checked", true);
      $row.attr("data-auto-filled", "true").css("background", "#e7f5ea");
      applied.push(assignment);
    });

    return { applied, issues };
  }

  function executeGoSave(win, unsafeWin) {
    const pageWindow = unsafeWin || win;
    try {
      if (pageWindow && typeof pageWindow.go_save === "function") {
        pageWindow.go_save();
        return true;
      }
      if (win && typeof win.go_save === "function") {
        win.go_save();
        return true;
      }
      win.location.href = "javascript:go_save()";
      return true;
    } catch (error) {
      if (win.console && typeof win.console.error === "function") win.console.error("[입고도우미] 저장 실행 실패", error);
      return false;
    }
  }

  function goToPage(state, pageNumber) {
    const pager = toPagerTarget(pageNumber);
    const pageWindow = state.unsafeWindow || state.win;
    if (pageWindow && typeof pageWindow.go_page === "function") {
      pageWindow.go_page(pager.nowBlock, pager.pageValue);
      return true;
    }
    if (state.win && typeof state.win.go_page === "function") {
      state.win.go_page(pager.nowBlock, pager.pageValue);
      return true;
    }
    return false;
  }

  function beginPageNavigation(state, runState, pageNumber, assignments) {
    runState.pending = {
      phase: "navigating",
      targetPage: pageNumber,
      navAttempts: 0,
      assignments: assignments,
    };
    writeRunState(state.win, runState);
    setProgress(state, runState.cycle + "회차 · " + pageNumber + "페이지로 이동 중");
    appendLog(state, pageNumber + "페이지로 이동합니다.", false);
    if (!goToPage(state, pageNumber)) {
      addRunIssues(runState, [buildIssue("저장/페이지 이동 실패", {
        pageNumber: pageNumber,
        note: "go_page를 실행하지 못했습니다.",
      })]);
      finishRun(state, runState);
    }
  }

  function beginSavePhase(state, runState, assignments) {
    runState.pending = {
      phase: "saving",
      targetPage: assignments.length ? assignments[0].pageNumber : 1,
      assignments: assignments,
    };
    writeRunState(state.win, runState);
    setProgress(state, runState.cycle + "회차 · 저장 중");
    appendLog(state, assignments.length + "개 행을 저장합니다.", false);
    if (!executeGoSave(state.win, state.unsafeWindow)) {
      addRunIssues(runState, [buildIssue("저장/페이지 이동 실패", {
        pageNumber: assignments.length ? assignments[0].pageNumber : 0,
        note: "go_save를 실행하지 못했습니다.",
      })]);
      finishRun(state, runState);
    }
  }

  function handlePendingNavigation(state, runState) {
    const currentPage = getPaginationInfo(state.$).currentPage;
    if (currentPage !== runState.pending.targetPage) {
      runState.pending.navAttempts = Math.max(0, toSafeInteger(runState.pending.navAttempts)) + 1;
      if (runState.pending.navAttempts > 3) {
        addRunIssues(runState, [buildIssue("저장/페이지 이동 실패", {
          pageNumber: runState.pending.targetPage,
          note: "목표 페이지로 이동하지 못했습니다.",
        })]);
        finishRun(state, runState);
        return false;
      }
      writeRunState(state.win, runState);
      setProgress(state, runState.pending.targetPage + "페이지 이동 재시도 " + runState.pending.navAttempts + "/3");
      goToPage(state, runState.pending.targetPage);
      return false;
    }
    const appliedResult = applyAssignmentsOnCurrentPage(state, runState.pending.assignments);
    addRunIssues(runState, appliedResult.issues);
    if (!appliedResult.applied.length) {
      addRunIssues(runState, [buildIssue("페이지 순회 후 미처리", {
        pageNumber: runState.pending.targetPage,
        note: "입력 가능한 행을 찾지 못해 작업을 중단합니다.",
      })]);
      finishRun(state, runState);
      return false;
    }
    beginSavePhase(state, runState, appliedResult.applied);
    return false;
  }

  async function handlePendingSave(state, runState) {
    const scanResult = await scanAllPages(state);
    const verification = verifyPendingAssignments(runState.pending.assignments, scanResult.rows);
    applyAssignmentsToTasks(runState, verification.succeeded);
    if (verification.failed.length) {
      addRunIssues(runState, verification.failed.map((assignment) => buildIssue("저장/페이지 이동 실패", {
        code: assignment.code,
        loc: assignment.loc,
        qty: assignment.qty,
        pageNumber: assignment.pageNumber,
        rowSeq: assignment.rowSeq,
        originalLine: assignment.originalLine,
        note: "저장 후 반영 여부를 확인하지 못했습니다.",
      })));
    }
    runState.pending = null;
    writeRunState(state.win, runState);
    return scanResult;
  }

  function resolveRemainingTaskIssues(runState, stalledItems) {
    const issueKeys = new Set((stalledItems || []).map((item) => item.code + "|" + item.loc + "|" + item.originalLine));
    addRunIssues(runState, stalledItems);
    getActiveTasks(runState).forEach((task) => {
      const type = "페이지 순회 후 미처리";
      const key = task.code + "|" + task.loc + "|" + task.originalLine;
      if (issueKeys.has(key)) return;
      runState.issues.push(buildIssue(type, {
        code: task.code,
        loc: task.loc,
        qty: task.remainingQty,
        originalLine: task.originalLine,
      }));
    });
  }

  async function continueRun(state, preScanned) {
    if (state.processing) return;
    state.processing = true;
    try {
      let runState = readRunState(state.win);
      if (!runState || state.win.localStorage.getItem(KEY_RUNNING) !== "true") {
        clearRunState(state.win);
        restoreNativePopups(state);
        showIdleState(state);
        return;
      }

      overrideNativePopups(state);
      showRunningState(state);

      if (runState.pending && runState.pending.phase === "navigating") {
        handlePendingNavigation(state, runState);
        return;
      }

      let scanResult = preScanned || null;
      if (runState.pending && runState.pending.phase === "saving") {
        scanResult = await handlePendingSave(state, runState);
        runState = readRunState(state.win) || runState;
      }

      if (!scanResult) {
        scanResult = await scanAllPages(state);
      }

      const activeTasks = getActiveTasks(runState);
      if (!activeTasks.length) {
        finishRun(state, runState);
        return;
      }

      runState.cycle = Math.max(0, toSafeInteger(runState.cycle)) + 1;
      writeRunState(state.win, runState);
      setProgress(state, runState.cycle + "회차 · 전체 " + scanResult.totalPages + "페이지 스캔 완료 · 남은 작업 " + activeTasks.length + "건");
      appendLog(state, runState.cycle + "회차 계획을 계산합니다. (" + scanResult.totalPages + "페이지)", false);

      const plan = buildCycleAssignments(activeTasks, scanResult.rows);
      if (!plan.assignments.length) {
        resolveRemainingTaskIssues(runState, plan.stalled);
        finishRun(state, runState);
        return;
      }

      const targetPage = plan.assignments[0].pageNumber;
      const pageAssignments = plan.assignments.filter((assignment) => assignment.pageNumber === targetPage);
      if (scanResult.currentPage !== targetPage) {
        beginPageNavigation(state, runState, targetPage, pageAssignments);
        return;
      }

      const appliedResult = applyAssignmentsOnCurrentPage(state, pageAssignments);
      addRunIssues(runState, appliedResult.issues);
      if (!appliedResult.applied.length) {
        resolveRemainingTaskIssues(runState, plan.stalled);
        finishRun(state, runState);
        return;
      }
      beginSavePhase(state, runState, appliedResult.applied);
    } catch (error) {
      const runState = readRunState(state.win) || createRunState(state.mode || "seq", [], { autoSaveEffective: false });
      addRunIssues(runState, [buildIssue("저장/페이지 이동 실패", {
        note: error && error.message ? error.message : "알 수 없는 오류",
      })]);
      finishRun(state, runState);
    } finally {
      state.processing = false;
    }
  }

  async function applyImmediateBatch(state, tasks, scanResult) {
    replaceLog(state, "");
    const plan = buildCycleAssignments(tasks, scanResult.rows);
    const currentPage = getPaginationInfo(state.$).currentPage;
    const currentAssignments = plan.assignments.filter((assignment) => assignment.pageNumber === currentPage);
    const appliedResult = applyAssignmentsOnCurrentPage(state, currentAssignments);
    const runState = createRunState("batch", tasks, { autoSaveEffective: false });
    addRunIssues(runState, plan.stalled);
    addRunIssues(runState, appliedResult.issues);
    if (!appliedResult.applied.length) {
      addRunIssues(runState, [buildIssue("페이지 순회 후 미처리", {
        note: "현재 페이지에서 적용 가능한 행을 찾지 못했습니다.",
      })]);
    } else {
      applyAssignmentsToTasks(runState, appliedResult.applied);
      appendLog(state, appliedResult.applied.length + "개 행에 입력했습니다. 저장은 직접 진행해주세요.", false);
    }
    finishRun(state, runState);
  }

  async function runBatchMode(state) {
    replaceLog(state, "");
    const raw = state.$("#" + INPUT_ID).val().trim();
    if (!raw) {
      (state.unsafeWindow || state.win).alert("데이터가 없습니다.");
      return;
    }

    const merge = state.$("#tmInboundHelperMerge").is(":checked");
    const tasks = buildBatchTasks(raw, merge);
    if (!tasks.length) {
      (state.unsafeWindow || state.win).alert("유효한 데이터가 없습니다.");
      return;
    }

    const scanResult = await scanAllPages(state);
    const autoSaveChecked = state.$("#tmInboundHelperAutoSave").is(":checked");
    let autoSaveEffective = autoSaveChecked;
    if (scanResult.totalPages > 1 && !autoSaveChecked) {
      const confirmed = (state.unsafeWindow || state.win).confirm("2페이지 이상이 감지되었습니다. 이번 실행에 한해 자동 저장으로 전환해 전체 페이지를 순회할까요?");
      if (!confirmed) return;
      autoSaveEffective = true;
    }

    if (!autoSaveEffective) {
      await applyImmediateBatch(state, tasks, scanResult);
      return;
    }

    clearLegacyKeys(state.win);
    state.win.localStorage.setItem(KEY_RUNNING, "true");
    writeRunState(state.win, createRunState("batch", tasks, { autoSaveEffective: true }));
    replaceLog(state, "");
    appendLog(state, "단순 입력 자동 실행을 시작합니다.", false);
    continueRun(state, scanResult);
  }

  function runSequentialMode(state) {
    replaceLog(state, "");
    const raw = state.$("#" + INPUT_ID).val().trim();
    if (!raw) {
      (state.unsafeWindow || state.win).alert("데이터가 없습니다.");
      return;
    }
    const tasks = buildSequentialTasks(raw);
    if (!tasks.length) {
      (state.unsafeWindow || state.win).alert("데이터 형식 오류");
      return;
    }
    const confirmed = (state.unsafeWindow || state.win).confirm("총 " + tasks.length + "건의 로케이션 라인을 시작합니다.\n여러 페이지가 있으면 자동으로 순회하며, 같은 상품 여러 행은 작은 예정수량 행부터 처리합니다.");
    if (!confirmed) return;
    clearLegacyKeys(state.win);
    state.win.localStorage.setItem(KEY_RUNNING, "true");
    writeRunState(state.win, createRunState("seq", tasks, { autoSaveEffective: true }));
    replaceLog(state, "");
    appendLog(state, "병렬 순차 반복을 시작합니다.", false);
    continueRun(state, null);
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
    $("#tmInboundHelperRunBatch").on("click", () => { runBatchMode(state); });
    $("#tmInboundHelperRunSeq").on("click", () => { runSequentialMode(state); });
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
      const runState = readRunState(win);
      if (win.localStorage.getItem(KEY_RUNNING) === "true" && runState) {
        continueRun(state, null);
      } else {
        clearRunState(win);
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
    buildBatchTasks,
    buildSequentialTasks,
    extractCodeTokensFromText,
    toSafeInteger,
    calculateRemainingInboundQty,
    extractPaginationInfoFromText,
    toPagerTarget,
    rowSupportsLocation,
    buildCycleAssignments,
    verifyPendingAssignments,
    groupRunIssues,
    buildIssueSummaryText,
    buildGuiHtml,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

