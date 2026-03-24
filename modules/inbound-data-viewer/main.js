module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "inbound-data-viewer";
  const MODULE_NAME = "입고 데이터 뷰어";
  const MODULE_VERSION = "0.1.2";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const DATA_ENDPOINT = "/stm/stm100main4_jdata";
  const STATE_KEY = "__tmInboundDataViewerState";
  const STYLE_ID = "tm-inbound-data-viewer-style";
  const MODAL_ID = "tm-inbound-data-viewer-modal";

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
    return null;
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

  function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((item) => ({
      date: formatDate(item && item.inoutstock_sysdate),
      nicn: item && item.basic_nicn ? String(item.basic_nicn) : "-",
      name: item && item.basic_name ? String(item.basic_name) : "-",
      quantity: item && item.inoutstock_inqty != null && item.inoutstock_inqty !== ""
        ? String(item.inoutstock_inqty)
        : "0",
    }));
  }

  function buildClipboardText(rows) {
    const header = "입고일\t관리명\t상품명\t입고수량";
    const body = normalizeRows(rows).map((row) => {
      return [row.date, row.nicn, row.name, row.quantity].join("\t");
    }).join("\n");
    return body ? header + "\n" + body : header;
  }

  function buildTableBodyHtml(rows) {
    const normalizedRows = normalizeRows(rows);
    if (!normalizedRows.length) {
      return '<tr><td colspan="4" class="tm-ui-empty">표시할 입고 데이터가 없습니다.</td></tr>';
    }
    return normalizedRows.map((row) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(row.date) + "</td>",
        '<td data-tm-align="left">' + escapeHtml(row.nicn) + "</td>",
        '<td data-tm-align="left">' + escapeHtml(row.name) + "</td>",
        '<td data-tm-align="right">' + escapeHtml(row.quantity) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildModalHtml(rows) {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "embedded", className: "tm-inbound-viewer", density: "compact" })
      : 'class="tm-inbound-viewer"';
    const normalizedRows = normalizeRows(rows);
    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-overlay tm-inbound-viewer__overlay" style="display:flex;">',
      '    <div class="tm-ui-modal tm-inbound-viewer__modal">',
      '      <div class="tm-ui-modal__head">',
      "        <div>",
      '          <p class="tm-ui-kicker">Inbound Data</p>',
      '          <h3 class="tm-ui-section-title">입고 데이터 확인</h3>',
      '          <p class="tm-ui-section-subtitle">최근 조회 결과를 표로 확인하고 그대로 복사할 수 있습니다.</p>',
      "        </div>",
      '        <span class="tm-ui-badge">' + normalizedRows.length + "건</span>",
      "      </div>",
      '      <div class="tm-ui-modal__body tm-ui-stack">',
      '        <div class="tm-ui-scroll">',
      '          <table class="tm-ui-table">',
      "            <thead>",
      "              <tr>",
      '                <th data-tm-align="center">입고일</th>',
      '                <th data-tm-align="left">관리명</th>',
      '                <th data-tm-align="left">상품명</th>',
      '                <th data-tm-align="right">입고수량</th>',
      "              </tr>",
      "            </thead>",
      '            <tbody>' + buildTableBodyHtml(rows) + "</tbody>",
      "          </table>",
      "        </div>",
      '        <div id="tm-inbound-viewer-feedback" class="tm-ui-inline-note">표 형식으로 클립보드 복사를 지원합니다.</div>',
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
      "#" + MODAL_ID + " .tm-inbound-viewer__modal{width:min(1040px,94vw)}",
      "#" + MODAL_ID + " .tm-ui-modal__head{align-items:flex-start}",
      "#" + MODAL_ID + " .tm-ui-scroll{max-height:min(66vh,720px)}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(1),#" + MODAL_ID + " .tm-ui-table td:nth-child(1){width:110px}",
      "#" + MODAL_ID + " .tm-ui-table th:nth-child(4),#" + MODAL_ID + " .tm-ui-table td:nth-child(4){width:100px}",
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
    container.innerHTML = buildModalHtml(state.rows);
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

  function handleResponseRows(win, state, rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    state.rows = rows.slice();
    openModal(win, state);
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
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


