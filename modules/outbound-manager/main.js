module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "outbound-manager";
  const MODULE_NAME = "출고매니저";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = [
    "https://www.ebut3pl.co.kr/jsp/site/site413edit.jsp*",
    "https://www.ebut3pl.co.kr/jsp/com/ScanWindow.jsp*"
  ];
  const EDIT_PAGE_PATTERN = /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/site\/site413edit\.jsp/i;
  const WRAPPER_PAGE_PATTERN = /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/com\/ScanWindow\.jsp/i;
  const BASE_ORIGIN = "https://www.ebut3pl.co.kr";
  const PAGE_REFERER = "/jsp/site/site413edit.jsp";
  const SHIP_ENDPOINT = "/site/site413save";
  const CANCEL_ENDPOINT = "/site/site410save";
  const ACTION_BUTTON_ID = "tm-outbound-manager-button";
  const POPUP_NAME = "tm-outbound-manager-window";
  const POPUP_FEATURES = "width=1200,height=880,resizable=yes,scrollbars=yes";
  const STATE_KEY = "__tmOutboundManagerState";
  const POPUP_READY_ATTR = "data-tm-outbound-manager-ready";
  const SESSION_EXPIRED_MARKERS = ["자동 로그아웃 되었습니다", "/home/docs/login.html", "세션종료", "로그인"];
  const MIN_DELAY_MS = 200;
  const SUMMARY_EMPTY = "-";
  const FN_STATUS_MAP = {
    "0": { kind: "success", label: "완료", group: "성공" },
    "10": { kind: "success", label: "정상", group: "성공" },
    "1": { kind: "error", label: "기처리", group: "기처리" },
    "2": { kind: "warning", label: "취소", group: "부분처리/경고" },
    "3": { kind: "warning", label: "배송보류", group: "부분처리/경고" },
    "4": { kind: "warning", label: "중복송장", group: "부분처리/경고" },
    "5": { kind: "error", label: "송장미등록", group: "미존재/대상없음" },
    "6": { kind: "error", label: "스캔오류", group: "미존재/대상없음" },
    "7": { kind: "warning", label: "부분취소", group: "부분처리/경고" },
    "8": { kind: "warning", label: "상품오류", group: "부분처리/경고" },
    "11": { kind: "warning", label: "중복스캔", group: "부분처리/경고" },
    "12": { kind: "success", label: "출고취소", group: "성공" },
    "13": { kind: "error", label: "취소대상없음", group: "취소대상없음" },
    "19": { kind: "error", label: "실패", group: "기타 오류" }
  };

  function getModuleUi(scope) {
    const target = scope || root;
    if (target && target.__tmModuleUi) return target.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
    return null;
  }

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
      [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(":")
    ].join(" ");
  }

  function toQueryString(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      if (params[key] != null) search.set(key, String(params[key]));
    });
    return search.toString();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function isSessionExpiredText(text) {
    const body = String(text || "");
    return SESSION_EXPIRED_MARKERS.some((marker) => body.indexOf(marker) !== -1);
  }

  function shouldRun(win) {
    const href = String(win && win.location && win.location.href || "");
    return EDIT_PAGE_PATTERN.test(href) || WRAPPER_PAGE_PATTERN.test(href);
  }

  function isEditPageWindow(win) {
    return EDIT_PAGE_PATTERN.test(String(win && win.location && win.location.href || ""));
  }

  function isWrapperPageWindow(win) {
    return WRAPPER_PAGE_PATTERN.test(String(win && win.location && win.location.href || ""));
  }

  function resolveActionPageWindow(win) {
    if (!win || !win.document) return null;
    if (isEditPageWindow(win)) return win;
    if (!isWrapperPageWindow(win)) return null;
    try {
      const frame = win.document.getElementById("site413edit");
      if (frame && frame.contentWindow && isEditPageWindow(frame.contentWindow)) {
        return frame.contentWindow;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function createRunState() {
    return {
      running: false,
      stopRequested: false,
      queue: [],
      results: [],
      totalUnique: 0,
      duplicatesRemoved: 0,
      duplicateEntries: [],
      currentInvoice: "",
      currentMode: "출고",
      lastMessage: "준비됨",
      startedAt: 0,
      finishedAt: 0,
      unprocessed: []
    };
  }

  function getPageState(win, loader) {
    if (!win[STATE_KEY]) {
      win[STATE_KEY] = {
        pageWin: win,
        loader: loader || null,
        popupWin: null,
        buttonInstalled: false,
        installAttempts: 0,
        inputText: "",
        searchQuery: "",
        cancelMode: false,
        run: createRunState()
      };
    }
    return win[STATE_KEY];
  }

  function parseInvoiceInput(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => safeTrim(line))
      .filter(Boolean);
    const seen = new Set();
    const uniqueLines = [];
    const duplicateMap = {};
    let duplicatesRemoved = 0;

    lines.forEach((line) => {
      if (!seen.has(line)) {
        seen.add(line);
        uniqueLines.push(line);
        return;
      }
      duplicatesRemoved += 1;
      if (!duplicateMap[line]) {
        duplicateMap[line] = { value: line, total: 2, removed: 1 };
      } else {
        duplicateMap[line].total += 1;
        duplicateMap[line].removed += 1;
      }
    });

    return {
      rawCount: lines.length,
      uniqueLines,
      duplicatesRemoved,
      duplicateEntries: Object.values(duplicateMap).sort((left, right) => left.value.localeCompare(right.value))
    };
  }

  function getFnStatusMeta(fnsh) {
    return FN_STATUS_MAP[String(fnsh)] || { kind: "error", label: "기타 오류", group: "기타 오류" };
  }

  function buildSuccessMessage(ordCount, outCount) {
    return String(ordCount || 0) + "건 발송처리(" + String(outCount || 0) + "건 재고출고처리)";
  }

  function classifyOutboundResponse(invoiceNumber, data) {
    const ordCount = Number(data && data.ord_cnt) || 0;
    const outCount = Number(data && data.out_cnt) || 0;
    const fnsh = safeTrim(data && data.fnsh);
    const meta = getFnStatusMeta(fnsh);
    const fallbackMessage = safeTrim(data && data.msg);
    const successLike = meta.kind === "success" || (ordCount > 0 || outCount > 0);

    return {
      invoiceNumber,
      modeLabel: "출고",
      resultKind: successLike ? meta.kind : meta.kind,
      resultLabel: meta.label,
      errorGroup: successLike ? "" : meta.group,
      message: successLike ? buildSuccessMessage(ordCount, outCount) : (fallbackMessage || meta.label),
      processedAt: Date.now(),
      fnsh,
      ordCount,
      outCount
    };
  }

  function classifyCancelResponse(invoiceNumber, data) {
    const count = Number(data && data.cnt) || 0;
    const success = count > 0;
    return {
      invoiceNumber,
      modeLabel: "출고취소",
      resultKind: success ? "success" : "error",
      resultLabel: success ? "취소완료" : "취소대상없음",
      errorGroup: success ? "" : "취소대상없음",
      message: success
        ? (String(count) + "건의 주문이 출고취소되었습니다.")
        : "출고취소할 주문이 없습니다.",
      processedAt: Date.now(),
      count
    };
  }

  function buildExceptionResult(invoiceNumber, cancelMode, error) {
    return {
      invoiceNumber,
      modeLabel: cancelMode ? "출고취소" : "출고",
      resultKind: "error",
      resultLabel: "네트워크/예외",
      errorGroup: "네트워크/예외",
      message: safeTrim(error && error.message) || "요청 중 오류가 발생했습니다.",
      processedAt: Date.now()
    };
  }

  function filterResults(results, query) {
    const keyword = safeTrim(query).toLowerCase();
    if (!keyword) return (results || []).slice();
    return (results || []).filter((row) => {
      const haystack = [
        row.invoiceNumber,
        row.modeLabel,
        row.resultLabel,
        row.message,
        formatDateTime(row.processedAt)
      ].join(" ").toLowerCase();
      return haystack.indexOf(keyword) !== -1;
    });
  }

  function getResultTone(kind) {
    if (kind === "success") return "primary";
    return "danger";
  }

  function buildResultRowsHtml(results) {
    if (!results || !results.length) {
      return '<tr><td colspan="5" class="tm-ui-empty">처리 결과가 없습니다.</td></tr>';
    }
    return results.map((row) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(row.invoiceNumber || SUMMARY_EMPTY) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.modeLabel || SUMMARY_EMPTY) + "</td>",
        '<td data-tm-align="center" data-tm-tone="' + escapeHtml(getResultTone(row.resultKind)) + '"><strong>' + escapeHtml(row.resultLabel || SUMMARY_EMPTY) + "</strong></td>",
        '<td data-tm-align="center">' + escapeHtml(row.message || SUMMARY_EMPTY) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(formatDateTime(row.processedAt)) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function buildErrorSummary(results, unprocessed) {
    const groups = {};
    (results || []).forEach((row) => {
      if (!row || row.resultKind === "success") return;
      const key = row.errorGroup || row.resultLabel || "기타 오류";
      if (!groups[key]) groups[key] = { label: key, count: 0, invoiceNumbers: [] };
      groups[key].count += 1;
      groups[key].invoiceNumbers.push(row.invoiceNumber);
    });
    if (Array.isArray(unprocessed) && unprocessed.length) {
      groups["중지로 미처리"] = {
        label: "중지로 미처리",
        count: unprocessed.length,
        invoiceNumbers: unprocessed.slice()
      };
    }
    return Object.values(groups).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label);
    });
  }

  function buildSummary(runState) {
    const results = runState && Array.isArray(runState.results) ? runState.results : [];
    let successCount = 0;
    let errorCount = 0;
    results.forEach((row) => {
      if (row && row.resultKind === "success") successCount += 1;
      else errorCount += 1;
    });
    return {
      totalUnique: Number(runState && runState.totalUnique) || 0,
      duplicatesRemoved: Number(runState && runState.duplicatesRemoved) || 0,
      successCount,
      errorCount,
      remainingCount: Math.max((runState && runState.queue ? runState.queue.length : 0) + ((runState && runState.currentInvoice) ? 1 : 0), 0),
      unprocessedCount: Array.isArray(runState && runState.unprocessed) ? runState.unprocessed.length : 0
    };
  }

  function getActionHost(doc) {
    return doc.querySelector("table td.txtbutton strong");
  }

  function ensureActionButton(state) {
    const doc = state.pageWin.document;
    if (!doc) return false;
    if (doc.getElementById(ACTION_BUTTON_ID)) return true;
    const host = getActionHost(doc);
    if (!host) return false;

    const button = doc.createElement("span");
    button.className = "button medium icon";
    button.id = ACTION_BUTTON_ID;

    const icon = doc.createElement("span");
    icon.className = "check";

    const anchor = doc.createElement("a");
    anchor.href = "javascript:void(0);";
    anchor.textContent = MODULE_NAME;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      openPopup(state);
    });

    button.appendChild(icon);
    button.appendChild(anchor);
    host.appendChild(doc.createTextNode(" "));
    host.appendChild(button);
    state.buttonInstalled = true;
    return true;
  }

  function installActionButton(state) {
    if (ensureActionButton(state)) return;
    const retry = function retryInstall() {
      state.installAttempts += 1;
      if (ensureActionButton(state)) return;
      if (state.installAttempts >= 20) return;
      state.pageWin.setTimeout(retry, 500);
    };
    if (state.pageWin.document.readyState === "loading") {
      state.pageWin.document.addEventListener("DOMContentLoaded", retry, { once: true });
    } else {
      retry();
    }
  }

  function getPopupStyle(pageWin) {
    const moduleUi = getModuleUi(pageWin);
    const sharedCss = moduleUi && typeof moduleUi.buildModuleUiCss === "function"
      ? moduleUi.buildModuleUiCss()
      : "";
    return [
      sharedCss,
      "html,body{margin:0;padding:0;background:#f3f4f5}",
      ".tm-outbound-manager-shell{padding:16px}",
      ".tm-outbound-manager-shell .tm-ui-section{padding:14px 16px}",
      ".tm-outbound-manager-shell .tm-ui-field-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(220px,1fr) auto auto;gap:10px;align-items:end}",
      ".tm-outbound-manager-shell .tm-ui-label{min-width:0}",
      ".tm-outbound-manager-shell .tm-ui-textarea{width:100%;min-height:180px}",
      ".tm-outbound-manager-shell .tm-ui-table td,.tm-outbound-manager-shell .tm-ui-table th{white-space:nowrap}",
      ".tm-outbound-manager-shell .tm-ui-table td:nth-child(4){white-space:normal}",
      ".tm-outbound-manager-shell .tm-ui-error-list{display:grid;gap:10px}",
      ".tm-outbound-manager-shell .tm-ui-error-card{padding:12px 14px;border:1px solid var(--tm-border);border-radius:12px;background:var(--tm-surface-alt)}",
      ".tm-outbound-manager-shell .tm-ui-error-card h4{margin:0 0 6px 0;font-size:13px;font-weight:800}",
      ".tm-outbound-manager-shell .tm-ui-error-card p{margin:0;color:var(--tm-muted);font-size:12px;line-height:1.55}",
      "@media (max-width:1024px){.tm-outbound-manager-shell .tm-ui-field-grid{grid-template-columns:1fr 1fr}}"
    ].join("");
  }

  function getRootAttributes(pageWin) {
    const moduleUi = getModuleUi(pageWin);
    if (moduleUi && typeof moduleUi.buildRootAttributes === "function") {
      return moduleUi.buildRootAttributes({ kind: "popup", density: "compact", className: "tm-outbound-manager-shell" });
    }
    return 'class="tm-ui-root tm-ui-popup tm-outbound-manager-shell" data-tm-density="compact"';
  }

  function ensurePopupShell(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return null;
    const doc = popup.document;
    if (!doc) return null;
    if (doc.body && doc.body.getAttribute(POPUP_READY_ATTR) === "Y") return doc;

    doc.open();
    doc.write([
      "<!DOCTYPE html>",
      "<html lang=\"ko\">",
      "<head>",
      '<meta charset="utf-8" />',
      "<title>" + escapeHtml(MODULE_NAME) + "</title>",
      "<style>" + getPopupStyle(state.pageWin) + "</style>",
      "</head>",
      "<body " + getRootAttributes(state.pageWin) + " " + POPUP_READY_ATTR + '="Y">',
      '<div class="tm-ui-shell tm-outbound-manager-shell" style="padding:16px">',
      '<section class="tm-ui-panel-head tm-ui-card">',
      '<div class="tm-ui-head-meta">',
      '<div class="tm-ui-stack">',
      '<span class="tm-ui-kicker">Outbound Manager</span>',
      "<h1 class=\"tm-ui-title\">" + escapeHtml(MODULE_NAME) + "</h1>",
      '<p class="tm-ui-subtitle">송장번호 여러 건을 줄바꿈으로 붙여넣어 출고 또는 출고취소를 순차 처리합니다.</p>',
      "</div>",
      '<div class="tm-ui-toolbar__group">',
      '<button type="button" class="tm-ui-btn tm-ui-btn--secondary" id="tmOutboundManagerClearButton">초기화</button>',
      '<button type="button" class="tm-ui-btn tm-ui-btn--warning" id="tmOutboundManagerStopButton">중지</button>',
      '<button type="button" class="tm-ui-btn tm-ui-btn--primary" id="tmOutboundManagerRunButton">실행</button>',
      "</div>",
      "</div>",
      "</section>",
      '<section class="tm-ui-card tm-ui-section">',
      '<div class="tm-ui-field-grid">',
      '<label class="tm-ui-label">송장번호 목록<textarea class="tm-ui-textarea" id="tmOutboundManagerInput" placeholder="송장번호를 줄바꿈으로 붙여넣으세요."></textarea></label>',
      '<label class="tm-ui-label">결과 검색<input type="text" class="tm-ui-input" id="tmOutboundManagerSearch" placeholder="송장번호, 메시지, 결과 검색" /></label>',
      '<label class="tm-ui-label"><span>모드</span><span class="tm-ui-row" style="align-items:center"><input type="checkbox" id="tmOutboundManagerCancelMode" /> <span>출고취소 모드</span></span></label>',
      '<div class="tm-ui-label" id="tmOutboundManagerCurrentMeta"></div>',
      "</div>",
      "</section>",
      '<section class="tm-ui-kpis" id="tmOutboundManagerSummary"></section>',
      '<section class="tm-ui-message" id="tmOutboundManagerStatus"></section>',
      '<section class="tm-ui-card tm-ui-section">',
      '<div class="tm-ui-section-head"><div><h2 class="tm-ui-section-title">처리 결과</h2><p class="tm-ui-section-subtitle">현재 실행 세션 결과만 표시합니다.</p></div></div>',
      '<div class="tm-ui-scroll"><table class="tm-ui-table"><thead><tr><th>송장번호</th><th>모드</th><th>결과</th><th>메시지</th><th>처리시각</th></tr></thead><tbody id="tmOutboundManagerTableBody"></tbody></table></div>',
      "</section>",
      '<section class="tm-ui-card tm-ui-section">',
      '<div class="tm-ui-section-head"><div><h2 class="tm-ui-section-title">오류 요약</h2><p class="tm-ui-section-subtitle">오류와 미처리 송장번호를 유형별로 묶어 표시합니다.</p></div></div>',
      '<div id="tmOutboundManagerErrorSummary" class="tm-ui-error-list"></div>',
      "</section>",
      "</div>",
      "</body>",
      "</html>"
    ].join(""));
    doc.close();

    popup.addEventListener("beforeunload", () => {
      state.popupWin = null;
    }, { once: true });

    bindPopupEvents(state);
    return doc;
  }

  function bindPopupEvents(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const doc = popup.document;
    if (!doc || doc.body.getAttribute("data-tm-outbound-manager-bound") === "Y") return;
    doc.body.setAttribute("data-tm-outbound-manager-bound", "Y");

    const input = doc.getElementById("tmOutboundManagerInput");
    const search = doc.getElementById("tmOutboundManagerSearch");
    const cancelMode = doc.getElementById("tmOutboundManagerCancelMode");
    const runButton = doc.getElementById("tmOutboundManagerRunButton");
    const stopButton = doc.getElementById("tmOutboundManagerStopButton");
    const clearButton = doc.getElementById("tmOutboundManagerClearButton");

    if (input) {
      input.addEventListener("input", () => {
        state.inputText = input.value;
      });
    }
    if (search) {
      search.addEventListener("input", () => {
        state.searchQuery = search.value;
        renderResults(state);
        renderErrorSummary(state);
      });
    }
    if (cancelMode) {
      cancelMode.addEventListener("change", () => {
        state.cancelMode = !!cancelMode.checked;
        renderHeader(state);
        renderStatus(state);
      });
    }
    if (runButton) {
      runButton.addEventListener("click", () => {
        void runBatch(state);
      });
    }
    if (stopButton) {
      stopButton.addEventListener("click", () => {
        if (!state.run.running) return;
        state.run.stopRequested = true;
        state.run.lastMessage = "중지 요청을 받았습니다. 현재 송장번호 처리 후 멈춥니다.";
        renderStatus(state);
      });
    }
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        if (state.run.running) return;
        state.inputText = "";
        state.searchQuery = "";
        state.cancelMode = false;
        state.run = createRunState();
        renderPopup(state);
      });
    }
  }

  function renderHeader(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const doc = popup.document;
    const input = doc.getElementById("tmOutboundManagerInput");
    const search = doc.getElementById("tmOutboundManagerSearch");
    const cancelMode = doc.getElementById("tmOutboundManagerCancelMode");
    const runButton = doc.getElementById("tmOutboundManagerRunButton");
    const stopButton = doc.getElementById("tmOutboundManagerStopButton");
    const currentMeta = doc.getElementById("tmOutboundManagerCurrentMeta");

    if (input && input.value !== state.inputText) input.value = state.inputText;
    if (search && search.value !== state.searchQuery) search.value = state.searchQuery;
    if (cancelMode) cancelMode.checked = !!state.cancelMode;
    if (runButton) {
      runButton.disabled = !!state.run.running;
      runButton.textContent = state.run.running ? "실행 중..." : "실행";
    }
    if (stopButton) {
      stopButton.disabled = !state.run.running;
      stopButton.textContent = state.run.stopRequested ? "중지 요청됨" : "중지";
    }
    if (currentMeta) {
      const parts = [
        '<span class="tm-ui-inline-note">현재 모드</span><strong>' + escapeHtml(state.cancelMode ? "출고취소" : "출고") + "</strong>"
      ];
      if (state.run.running && state.run.currentInvoice) {
        parts.push('<span class="tm-ui-badge tm-ui-badge--info">처리 중 · ' + escapeHtml(state.run.currentInvoice) + "</span>");
      } else if (state.run.finishedAt) {
        parts.push('<span class="tm-ui-badge">마지막 완료 · ' + escapeHtml(formatDateTime(state.run.finishedAt)) + "</span>");
      }
      currentMeta.innerHTML = parts.join(" ");
    }
  }

  function renderSummary(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const container = popup.document.getElementById("tmOutboundManagerSummary");
    if (!container) return;
    const summary = buildSummary(state.run);
    container.innerHTML = [
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">전체 건수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.totalUnique || 0) + '</span><span class="tm-ui-kpi__meta">중복 제거 후 실행 대상</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">중복 제거</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.duplicatesRemoved || 0) + '</span><span class="tm-ui-kpi__meta">입력 단계에서 제외</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">성공</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.successCount || 0) + '</span><span class="tm-ui-kpi__meta">정상 처리</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">오류</span><span class="tm-ui-kpi__value" data-tm-tone="danger">' + escapeHtml(summary.errorCount || 0) + '</span><span class="tm-ui-kpi__meta">경고 포함</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">남은 수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.remainingCount || 0) + '</span><span class="tm-ui-kpi__meta">현재 실행 중 포함</span></div>'
    ].join("");
  }

  function renderStatus(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const container = popup.document.getElementById("tmOutboundManagerStatus");
    if (!container) return;
    const summary = buildSummary(state.run);
    let className = "tm-ui-message";
    let text = state.run.lastMessage || "준비됨";
    if (state.run.running) {
      className += " tm-ui-message--success";
      text = "진행 중 · " + text + " · 남은 " + summary.remainingCount + "건";
    } else if (summary.errorCount > 0 || summary.unprocessedCount > 0) {
      className += " tm-ui-message--warning";
      text = (state.run.finishedAt ? "작업 완료" : "대기") + " · " + text;
    } else {
      className += " tm-ui-message--success";
    }
    container.className = className;
    container.textContent = text;
  }

  function renderResults(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const container = popup.document.getElementById("tmOutboundManagerTableBody");
    if (!container) return;
    container.innerHTML = buildResultRowsHtml(filterResults(state.run.results, state.searchQuery));
  }

  function renderErrorSummary(state) {
    const popup = state.popupWin;
    if (!popup || popup.closed) return;
    const container = popup.document.getElementById("tmOutboundManagerErrorSummary");
    if (!container) return;
    const summary = buildErrorSummary(filterResults(state.run.results, state.searchQuery), state.run.unprocessed);
    if (!summary.length) {
      container.innerHTML = '<div class="tm-ui-empty">오류 또는 미처리 내역이 없습니다.</div>';
      return;
    }
    container.innerHTML = summary.map((group) => {
      return [
        '<div class="tm-ui-error-card">',
        "<h4>" + escapeHtml(group.label) + " · " + escapeHtml(group.count) + "건</h4>",
        "<p>" + escapeHtml(group.invoiceNumbers.join(", ")) + "</p>",
        "</div>"
      ].join("");
    }).join("");
  }

  function renderPopup(state) {
    if (!ensurePopupShell(state)) return;
    renderHeader(state);
    renderSummary(state);
    renderStatus(state);
    renderResults(state);
    renderErrorSummary(state);
  }

  function openPopup(state) {
    if (state.popupWin && !state.popupWin.closed) {
      state.popupWin.focus();
      renderPopup(state);
      return;
    }
    const popup = state.pageWin.open("", POPUP_NAME, POPUP_FEATURES);
    if (!popup) return;
    state.popupWin = popup;
    renderPopup(state);
    popup.focus();
  }

  function getFormValue(doc, name) {
    const field = doc.querySelector('[name="' + name + '"]');
    if (!field) return "";
    if (field.type === "checkbox") return field.checked ? (field.value || "Y") : "N";
    return safeTrim(field.value);
  }

  function getFormSnapshot(pageWin, cancelMode) {
    const doc = pageWin.document;
    const snapshot = {
      rdnoDate: getFormValue(doc, "RDNO_DATE"),
      inoutstockGbn1: getFormValue(doc, "INOUTSTOCK_GBN1"),
      inoutstockWah: getFormValue(doc, "INOUTSTOCK_WAH"),
      locaWahNone: getFormValue(doc, "LOCA_WAH_NONE"),
      locaZoneNone: getFormValue(doc, "LOCA_ZONE_NONE"),
      locaSeqNone: getFormValue(doc, "LOCA_SEQ_NONE"),
      sOfcDbtype: getFormValue(doc, "SOfc_dbtype"),
      sUserOfc: getFormValue(doc, "SUser_ofc"),
      sUserId: getFormValue(doc, "SUser_id"),
      sOfcJaego: getFormValue(doc, "SOfc_jaego"),
      sOfcMatyn: getFormValue(doc, "SOfc_matyn"),
      sOfcDnoayn: getFormValue(doc, "SOfc_dnoayn"),
      sUserGbn: getFormValue(doc, "SUser_gbn"),
      sUserCust: getFormValue(doc, "SUser_cust"),
      sOfcJgtyp: getFormValue(doc, "SOfc_jgtyp"),
      ebutcamStart: getFormValue(doc, "ebutcam_start"),
      ebutcamOfcCode: getFormValue(doc, "ebutcam_ofc_code"),
      ebutcamWuser: getFormValue(doc, "ebutcam_wuser")
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.rdnoDate)) {
      throw new Error("출고일 형식이 올바르지 않습니다.");
    }
    if (!cancelMode && (snapshot.sOfcJgtyp === "3" || snapshot.sOfcJgtyp === "4") && !snapshot.inoutstockWah) {
      throw new Error("출고창고를 먼저 선택하세요.");
    }
    return snapshot;
  }

  async function fetchJson(pageWin, endpoint, params) {
    const fetcher = pageWin && typeof pageWin.fetch === "function"
      ? pageWin.fetch.bind(pageWin)
      : (typeof fetch === "function" ? fetch.bind(root) : null);
    if (!fetcher) throw new Error("fetch를 사용할 수 없습니다.");

    const response = await fetcher(BASE_ORIGIN + endpoint + "?" + toQueryString(params), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: BASE_ORIGIN + PAGE_REFERER
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error("요청 실패 (" + response.status + ")");
    if (isSessionExpiredText(text)) throw new Error("세션이 종료되었습니다. 다시 로그인하세요.");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error("응답을 JSON으로 해석하지 못했습니다.");
    }
  }

  async function executeOutbound(pageWin, formSnapshot, invoiceNumber, cancelMode) {
    if (cancelMode) {
      return fetchJson(pageWin, CANCEL_ENDPOINT, {
        CANCEL_TYPE: "2",
        RDNO_DATE: formSnapshot.rdnoDate,
        RDNO_NUM: invoiceNumber
      });
    }
    return fetchJson(pageWin, SHIP_ENDPOINT, {
      rdno_date: formSnapshot.rdnoDate,
      rdno_num: invoiceNumber,
      inoutstock_gbn1: formSnapshot.inoutstockGbn1,
      inoutstock_wah: formSnapshot.inoutstockWah,
      loca_wah_none: formSnapshot.locaWahNone,
      loca_zone_none: formSnapshot.locaZoneNone,
      loca_seq_none: formSnapshot.locaSeqNone,
      ebutcam_start: formSnapshot.ebutcamStart,
      ebutcam_ofc_code: formSnapshot.ebutcamOfcCode,
      ebutcam_wuser: formSnapshot.ebutcamWuser,
      SOfc_dbtype: formSnapshot.sOfcDbtype,
      SUser_ofc: formSnapshot.sUserOfc,
      SUser_id: formSnapshot.sUserId,
      SOfc_jaego: formSnapshot.sOfcJaego,
      SOfc_matyn: formSnapshot.sOfcMatyn,
      SOfc_dnoayn: formSnapshot.sOfcDnoayn,
      SUser_gbn: formSnapshot.sUserGbn,
      SUser_cust: formSnapshot.sUserCust,
      SOfc_jgtyp: formSnapshot.sOfcJgtyp
    });
  }

  async function runBatch(state) {
    if (state.run.running) return;

    const parsed = parseInvoiceInput(state.inputText);
    if (!parsed.uniqueLines.length) {
      state.run.lastMessage = "송장번호를 한 줄에 하나씩 입력하세요.";
      renderPopup(state);
      return;
    }

    let formSnapshot = null;
    try {
      formSnapshot = getFormSnapshot(state.pageWin, state.cancelMode);
    } catch (error) {
      state.run.lastMessage = safeTrim(error && error.message) || "실행 조건을 확인하지 못했습니다.";
      renderPopup(state);
      return;
    }

    state.run = createRunState();
    state.run.running = true;
    state.run.currentMode = state.cancelMode ? "출고취소" : "출고";
    state.run.lastMessage = "작업을 시작합니다.";
    state.run.totalUnique = parsed.uniqueLines.length;
    state.run.duplicatesRemoved = parsed.duplicatesRemoved;
    state.run.duplicateEntries = parsed.duplicateEntries.slice();
    state.run.queue = parsed.uniqueLines.slice();
    state.run.startedAt = Date.now();
    renderPopup(state);

    while (state.run.queue.length) {
      if (state.run.stopRequested) break;
      const invoiceNumber = state.run.queue.shift();
      state.run.currentInvoice = invoiceNumber;
      state.run.lastMessage = invoiceNumber + " 처리 중";
      renderPopup(state);

      let result = null;
      try {
        const response = await executeOutbound(state.pageWin, formSnapshot, invoiceNumber, state.cancelMode);
        result = state.cancelMode
          ? classifyCancelResponse(invoiceNumber, response)
          : classifyOutboundResponse(invoiceNumber, response);
      } catch (error) {
        result = buildExceptionResult(invoiceNumber, state.cancelMode, error);
      }

      state.run.results.unshift(result);
      state.run.lastMessage = invoiceNumber + " · " + result.resultLabel + " · " + result.message;
      renderPopup(state);
      await sleep(MIN_DELAY_MS);
    }

    state.run.running = false;
    state.run.finishedAt = Date.now();
    state.run.unprocessed = state.run.queue.slice();
    state.run.queue = [];
    state.run.currentInvoice = "";

    if (state.run.stopRequested) {
      state.run.lastMessage = "사용자 요청으로 중지했습니다.";
    } else {
      const summary = buildSummary(state.run);
      state.run.lastMessage = "작업 완료 · 성공 " + summary.successCount + "건 / 오류 " + summary.errorCount + "건";
    }
    renderPopup(state);
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    const loader = context && context.loader ? context.loader : null;
    if (!win || !win.document || !shouldRun(win)) return;

    const startResolvedWindow = function startResolvedWindow(targetWin) {
      if (!targetWin || !targetWin.document) return false;
      if (targetWin.__tmOutboundManagerStarted) return true;
      targetWin.__tmOutboundManagerStarted = true;
      installActionButton(getPageState(targetWin, loader));
      return true;
    };

    if (startResolvedWindow(resolveActionPageWindow(win))) return;

    if (isWrapperPageWindow(win)) {
      if (win.__tmOutboundManagerWrapperStarted) return;
      win.__tmOutboundManagerWrapperStarted = true;
      const retryStart = function retryStart() {
        if (startResolvedWindow(resolveActionPageWindow(win))) return;
        win.setTimeout(retryStart, 500);
      };
      const wireFrameLoad = function wireFrameLoad() {
        const frame = win.document.getElementById("site413edit");
        if (frame && !frame.__tmOutboundManagerLoadBound) {
          frame.__tmOutboundManagerLoadBound = true;
          frame.addEventListener("load", retryStart);
        }
      };
      if (win.document.readyState === "loading") {
        win.document.addEventListener("DOMContentLoaded", () => {
          wireFrameLoad();
          retryStart();
        }, { once: true });
      } else {
        wireFrameLoad();
        retryStart();
      }
    }
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    parseInvoiceInput,
    classifyOutboundResponse,
    classifyCancelResponse,
    buildExceptionResult,
    buildResultRowsHtml,
    buildErrorSummary,
    buildSummary,
    filterResults,
    shouldRun,
    run,
    start
  };
})(typeof globalThis !== "undefined" ? globalThis : this);



