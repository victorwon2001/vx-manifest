module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "header-copy-helper";
  const MODULE_NAME = "헤더 복사 도우미";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const STATE_KEY = "__tmHeaderCopyHelperState";
  const STYLE_ID = "tm-header-copy-helper-style";
  const MODAL_ID = "tm-header-copy-helper-modal";
  const BODY_ID = "tmHeaderCopyHelperBody";
  const FEEDBACK_ID = "tmHeaderCopyHelperFeedback";
  const TOGGLE_ID = "tmHeaderCopyHelperDedupe";
  const BLANK_VALUE = "\u00A0";

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
    return /^https:\/\/www\.ebut3pl\.co\.kr\//i.test(String(win && win.location && win.location.href || ""));
  }

  function isElementVisible(node) {
    let current = node;
    while (current && current.nodeType !== 9) {
      if (current.hidden) return false;
      if (current.getAttribute && current.getAttribute("aria-hidden") === "true") return false;
      if (current.style) {
        if (current.style.display === "none") return false;
        if (current.style.visibility === "hidden") return false;
      }
      current = current.parentElement || current.parentNode || null;
    }
    return true;
  }

  function getNodeText(node) {
    if (!node) return "";
    return safeTrim(node.title || node.textContent || node.innerText || "");
  }

  function normalizeCellValue(value) {
    const text = safeTrim(value);
    return text ? text : BLANK_VALUE;
  }

  function dedupeValues(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      const key = String(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildValueList(values, dedupeEnabled) {
    const source = Array.isArray(values) ? values.slice() : [];
    return dedupeEnabled ? dedupeValues(source) : source;
  }

  function getClosest(node, selector) {
    let current = node;
    while (current && current.nodeType === 1) {
      if (typeof current.matches === "function" && current.matches(selector)) return current;
      current = current.parentElement || null;
    }
    return null;
  }

  function getHeaderLabel(headerCell) {
    if (!headerCell) return "선택 컬럼";
    const candidate = headerCell.querySelector
      ? headerCell.querySelector(".ui-jqgrid-sortable, div, span")
      : null;
    const label = getNodeText(candidate) || getNodeText(headerCell);
    return label || "선택 컬럼";
  }

  function getRowCellByIndex(row, index) {
    if (!row || index < 0) return null;
    if (row.cells && row.cells.length > index) return row.cells[index];
    const children = row.children ? Array.prototype.slice.call(row.children) : [];
    return children[index] || null;
  }

  function extractJqGridColumnValuesFromRows(rows, columnId) {
    return (Array.isArray(rows) ? rows : []).filter(isElementVisible).map((row) => {
      const cell = row && typeof row.querySelector === "function"
        ? row.querySelector('td[aria-describedby="' + columnId + '"]')
        : null;
      return normalizeCellValue(getNodeText(cell));
    });
  }

  function extractStandardColumnValuesFromRows(rows, columnIndex) {
    return (Array.isArray(rows) ? rows : []).filter(isElementVisible).map((row) => {
      return normalizeCellValue(getNodeText(getRowCellByIndex(row, columnIndex)));
    });
  }

  function resolveJqGridContext(headerCell) {
    const headerId = headerCell && headerCell.id ? headerCell.id : "";
    if (!headerId) return null;
    const view = getClosest(headerCell, ".ui-jqgrid-view");
    if (!view || typeof view.querySelector !== "function") return null;
    const bodyTable = view.querySelector(".ui-jqgrid-btable");
    if (!bodyTable) return null;
    const rows = Array.prototype.slice.call(bodyTable.querySelectorAll("tbody tr.jqgrow"));
    return {
      label: getHeaderLabel(headerCell),
      values: extractJqGridColumnValuesFromRows(rows, headerId),
      source: "jqgrid",
    };
  }

  function resolveStandardTableContext(headerCell) {
    const table = getClosest(headerCell, "table");
    if (!table) return null;
    const headerRow = getClosest(headerCell, "tr");
    if (!headerRow) return null;
    const headerCells = headerRow.cells
      ? Array.prototype.slice.call(headerRow.cells)
      : Array.prototype.slice.call(headerRow.children || []);
    const columnIndex = headerCells.indexOf(headerCell);
    if (columnIndex === -1) return null;

    let rows = [];
    if (table.tBodies && table.tBodies.length) {
      Array.prototype.forEach.call(table.tBodies, (tbody) => {
        rows = rows.concat(Array.prototype.slice.call(tbody.rows || tbody.querySelectorAll("tr")));
      });
    } else if (typeof table.querySelectorAll === "function") {
      rows = Array.prototype.slice.call(table.querySelectorAll("tr")).filter((row) => row !== headerRow);
    }

    return {
      label: getHeaderLabel(headerCell),
      values: extractStandardColumnValuesFromRows(rows, columnIndex),
      source: "table",
    };
  }

  function resolveHeaderContext(headerCell) {
    if (!headerCell || !isElementVisible(headerCell)) return null;
    const jqGridHeader = getClosest(headerCell, ".ui-jqgrid-htable");
    if (jqGridHeader) return resolveJqGridContext(headerCell);
    return resolveStandardTableContext(headerCell);
  }

  function getState(win, loader) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        win: scope,
        loader: loader || null,
        installed: false,
        currentLabel: "",
        rawValues: [],
        dedupeEnabled: false,
      };
    }
    if (loader) scope[STATE_KEY].loader = loader;
    return scope[STATE_KEY];
  }

  function getDisplayedValues(state) {
    return buildValueList(state && state.rawValues, !!(state && state.dedupeEnabled));
  }

  function buildRowsHtml(values) {
    const items = Array.isArray(values) ? values : [];
    if (!items.length) {
      return '<tr><td colspan="1" class="tm-ui-empty">현재 보이는 행에서 추출할 값이 없습니다.</td></tr>';
    }
    return items.map((value) => {
      const displayValue = value === BLANK_VALUE ? "&nbsp;" : escapeHtml(value);
      return [
        "<tr>",
        '<td data-tm-align="center">' + displayValue + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildClipboardText(values) {
    return (Array.isArray(values) ? values : []).map((value) => String(value == null ? BLANK_VALUE : value)).join("\n");
  }

  function buildModalHtml(state) {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "embedded", className: "tm-header-copy-helper", density: "compact" })
      : 'class="tm-header-copy-helper"';
    const rawValues = Array.isArray(state && state.rawValues) ? state.rawValues : [];
    const displayedValues = getDisplayedValues(state);
    const uniqueCount = dedupeValues(rawValues).length;
    const label = escapeHtml(state && state.currentLabel ? state.currentLabel : "선택 컬럼");

    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-overlay tm-header-copy-helper__overlay" style="display:flex;">',
      '    <div class="tm-ui-modal tm-header-copy-helper__modal">',
      '      <div class="tm-ui-modal__head">',
      "        <div>",
      '          <p class="tm-ui-kicker">Header Copy</p>',
      '          <h3 class="tm-ui-section-title">' + label + ' 컬럼 복사</h3>',
      '          <p class="tm-ui-section-subtitle">현재 화면에 보이는 행만 기준으로 같은 컬럼 값을 모아 복사합니다.</p>',
      "        </div>",
      '        <div class="tm-header-copy-helper__head-meta">',
      '          <span class="tm-ui-badge">원본 ' + rawValues.length + '행</span>',
      '          <span class="tm-ui-badge tm-ui-badge--info">표시 ' + displayedValues.length + '행</span>',
      '          <span class="tm-ui-badge">고유 ' + uniqueCount + '행</span>',
      "        </div>",
      "      </div>",
      '      <div class="tm-ui-modal__body tm-ui-stack">',
      '        <label class="tm-ui-label tm-header-copy-helper__toggle-row">',
      '          <span>중복 제거</span>',
      '          <span class="tm-header-copy-helper__toggle-control"><input type="checkbox" id="' + TOGGLE_ID + '"' + (state && state.dedupeEnabled ? " checked" : "") + "> <span>고유 값만 복사</span></span>",
      "        </label>",
      '        <div class="tm-ui-scroll tm-header-copy-helper__scroll">',
      '          <table class="tm-ui-table">',
      "            <thead>",
      "              <tr>",
      '                <th data-tm-align="center">' + label + "</th>",
      "              </tr>",
      "            </thead>",
      '            <tbody id="' + BODY_ID + '">' + buildRowsHtml(displayedValues) + "</tbody>",
      "          </table>",
      "        </div>",
      '        <div id="' + FEEDBACK_ID + '" class="tm-ui-inline-note">공백 값은 복사 시 빈 셀이 사라지지 않도록 공백 문자로 보존합니다.</div>',
      "      </div>",
      '      <div class="tm-ui-modal__foot">',
      '        <button type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="close">닫기</button>',
      '        <button type="button" class="tm-ui-btn tm-ui-btn--primary" data-action="copy">컬럼 복사</button>',
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
      "#" + MODAL_ID + "{position:fixed;inset:0;z-index:2147483647}",
      "#" + MODAL_ID + " .tm-header-copy-helper__overlay{padding:20px;background:rgba(18,27,31,.34);backdrop-filter:blur(8px)}",
      "#" + MODAL_ID + " .tm-header-copy-helper__modal{width:min(880px,92vw)}",
      "#" + MODAL_ID + " .tm-header-copy-helper__head-meta{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}",
      "#" + MODAL_ID + " .tm-header-copy-helper__scroll{max-height:min(64vh,640px)}",
      "#" + MODAL_ID + " .tm-header-copy-helper__toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      "#" + MODAL_ID + " .tm-header-copy-helper__toggle-control{display:inline-flex;align-items:center;gap:8px;color:var(--tm-text)}",
      "#" + MODAL_ID + " .tm-ui-table th,#" + MODAL_ID + " .tm-ui-table td{text-align:center}",
      "#" + MODAL_ID + " .tm-ui-table tbody tr:nth-child(even) td{background:rgba(84,96,103,.03)}",
    ].join("");
    doc.head.appendChild(style);
  }

  function closeModal(win) {
    const doc = win && win.document;
    const modal = doc && doc.getElementById ? doc.getElementById(MODAL_ID) : null;
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  function setFeedback(win, text, isError) {
    const doc = win && win.document;
    const feedback = doc && doc.getElementById ? doc.getElementById(FEEDBACK_ID) : null;
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = isError
      ? "tm-ui-message tm-ui-message--danger"
      : "tm-ui-inline-note";
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
    const copied = typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
    doc.body.removeChild(textarea);
    return copied ? Promise.resolve() : Promise.reject(new Error("복사 명령을 수행하지 못했습니다."));
  }

  function copyCurrentValues(win, state) {
    const text = buildClipboardText(getDisplayedValues(state));
    const loader = state && state.loader;
    if (loader && typeof loader.copyText === "function") return loader.copyText(text);
    if (win && win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === "function") {
      return win.navigator.clipboard.writeText(text);
    }
    return fallbackCopy(win, text);
  }

  function renderModal(win, state) {
    const doc = win && win.document;
    const container = doc && doc.getElementById ? doc.getElementById(MODAL_ID) : null;
    if (!container) return;
    container.innerHTML = buildModalHtml(state);
  }

  function openModal(win, state, context) {
    const doc = win && win.document;
    if (!doc || !doc.body) return;
    ensureStyles(doc);
    let container = doc.getElementById(MODAL_ID);
    if (!container) {
      container = doc.createElement("div");
      container.id = MODAL_ID;
      container.addEventListener("click", function (event) {
        const actionButton = event.target && event.target.closest ? event.target.closest("button[data-action]") : null;
        if (actionButton) {
          const action = actionButton.getAttribute("data-action");
          if (action === "close") {
            closeModal(win);
            return;
          }
          if (action === "copy") {
            copyCurrentValues(win, state)
              .then(() => setFeedback(win, "현재 컬럼 값이 클립보드에 복사되었습니다.", false))
              .catch((error) => setFeedback(win, error && error.message ? error.message : "클립보드 복사에 실패했습니다.", true));
            return;
          }
        }
        if (event.target === container) closeModal(win);
      });
      container.addEventListener("change", function (event) {
        const target = event.target;
        if (target && target.id === TOGGLE_ID) {
          state.dedupeEnabled = !!target.checked;
          renderModal(win, state);
        }
      });
      doc.body.appendChild(container);
    }
    state.currentLabel = context && context.label ? context.label : "선택 컬럼";
    state.rawValues = Array.isArray(context && context.values) ? context.values.slice() : [];
    state.dedupeEnabled = false;
    renderModal(win, state);
  }

  function installHeaderHandler(state) {
    if (state.installed) return;
    const doc = state.win && state.win.document;
    if (!doc || typeof doc.addEventListener !== "function") return;
    doc.addEventListener("dblclick", function (event) {
      if (!event || !event.target) return;
      if (event.target.closest && event.target.closest("#" + MODAL_ID)) return;
      const headerCell = event.target.closest ? event.target.closest("th") : null;
      if (!headerCell) return;
      const context = resolveHeaderContext(headerCell);
      if (!context || !Array.isArray(context.values) || !context.values.length) return;
      event.preventDefault();
      event.stopPropagation();
      openModal(state.win, state, context);
    }, true);
    state.installed = true;
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!shouldRun(win)) return null;
    const state = getState(win, context && context.loader ? context.loader : null);
    installHeaderHandler(state);
    return {
      dispose() {
        closeModal(win);
      },
    };
  }

  function run(context) {
    return start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES.slice(),
    shouldRun,
    run,
    start,
    normalizeCellValue,
    dedupeValues,
    buildValueList,
    extractJqGridColumnValuesFromRows,
    extractStandardColumnValuesFromRows,
    resolveHeaderContext,
    buildRowsHtml,
    buildClipboardText,
    BLANK_VALUE,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);



