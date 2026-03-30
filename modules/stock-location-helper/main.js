module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "stock-location-helper";
  const MODULE_NAME = "로케이션별 재고도우미";
  const MODULE_VERSION = "0.1.15";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp*"];
  const STYLE_ID = "tm-stock-location-helper-style";
  const STATE_KEY = "__tmStockLocationHelperState";
  const GRID_VIEW_ID = "gview_gridList";
  const GRID_TABLE_ID = "gridList";
  const GRID_HOOK_FLAG = "__tmStockLocationHelperWrapped";
  const PREVIEW_BUTTON_ID = "tm-stock-location-helper-preview-button";
  const PREVIEW_MODAL_ID = "tm-stock-location-helper-preview-modal";
  const PREVIEW_BUTTON_LABEL = "재고프리뷰";
  const AVAILABLE_COLUMN_ID = "gridList_locastock_qty";
  const ALLOCATED_COLUMN_ID = "gridList_locastock_aqty";
  const SAFE_STOCK_COLUMN_ID = "gridList_locastock_bqty";
  const ZONE_COLUMN_ID = "gridList_zone_name";
  const LOCATION_COLUMN_ID = "gridList_loca_name";
  const PRODUCT_NAME_COLUMN_ID = "gridList_basic_name";
  const NICN_COLUMN_ID = "gridList_basic_nicn";
  const OPTION_NAME_COLUMN_ID = "gridList_boptcode_name";
  const BARCODE_COLUMN_ID = "gridList_boptcode_barcode";
  const DELTA_COLUMN_LABEL = "가용-할당수량";
  const BUTTON_RETRY_MS = 250;
  const BUTTON_RETRY_LIMIT = 24;
  const HOOK_RETRY_MS = 250;
  const HOOK_RETRY_LIMIT = 24;

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/stm\/stm410main4\.jsp/i.test(String(win && win.location && win.location.href || ""));
  }

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

  function parseNumericText(value) {
    const normalized = safeTrim(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value) {
    const parsed = Number(value);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString("ko-KR");
  }

  function computeDelta(availableQty, allocatedQty) {
    return (Number(availableQty) || 0) - (Number(allocatedQty) || 0);
  }

  function computeInventorySummary(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
      const availableQty = Number(row && row.availableQty) || 0;
      const allocatedQty = Number(row && row.allocatedQty) || 0;
      summary.availableQty += availableQty;
      summary.allocatedQty += allocatedQty;
      summary.deltaQty += computeDelta(availableQty, allocatedQty);
      return summary;
    }, {
      availableQty: 0,
      allocatedQty: 0,
      deltaQty: 0,
    });
  }

  function getState(win, loader) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        win: scope,
        loader: loader || null,
        refreshTimer: null,
        hookRetryTimer: null,
        hookRetryCount: 0,
        buttonRetryTimer: null,
        buttonRetryCount: 0,
        resizeBound: false,
        boundGridState: null,
        previewRows: [],
      };
    }
    if (loader) scope[STATE_KEY].loader = loader;
    return scope[STATE_KEY];
  }

  function getGridParts(doc) {
    const view = doc && doc.getElementById ? doc.getElementById(GRID_VIEW_ID) : null;
    const table = doc && doc.getElementById ? doc.getElementById(GRID_TABLE_ID) : null;
    if (!view || !table) return null;
    return {
      view,
      table,
      headerTable: view.querySelector(".ui-jqgrid-htable"),
      bodyTable: view.querySelector(".ui-jqgrid-btable"),
      footTable: view.querySelector(".ui-jqgrid-ftable"),
    };
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const moduleUi = getModuleUi(doc.defaultView || root);
    if (moduleUi && typeof moduleUi.ensureStyles === "function") moduleUi.ensureStyles(doc);

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tm-stock-location-helper__delta-head{font-weight:700}",
      ".tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{color:#29424b;font-weight:700}",
      "#" + PREVIEW_MODAL_ID + "{position:fixed;inset:0;z-index:2147483647}",
      "#" + PREVIEW_MODAL_ID + " .tm-stock-location-helper__overlay{padding:20px;background:rgba(18,27,31,.34);backdrop-filter:blur(8px)}",
      "#" + PREVIEW_MODAL_ID + " .tm-stock-location-helper__modal{width:min(1320px,94vw)}",
      "#" + PREVIEW_MODAL_ID + " .tm-stock-location-helper__scroll{max-height:min(70vh,760px)}",
      "#" + PREVIEW_MODAL_ID + " .tm-ui-table th,#" + PREVIEW_MODAL_ID + " .tm-ui-table td{text-align:center}",
      "#" + PREVIEW_MODAL_ID + " .tm-ui-table tbody tr:nth-child(even) td{background:rgba(84,96,103,.03)}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getHeaderLabelNode(headerCell) {
    if (!headerCell) return null;
    return headerCell.querySelector("div[id], div, span") || headerCell;
  }

  function setCellFormattedValue(cell, value) {
    if (!cell) return;
    const formatted = formatNumber(value);
    cell.textContent = formatted;
    cell.title = formatted;
  }

  function getVisibleBodyRows(parts) {
    const rows = parts && parts.bodyTable
      ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll("tbody tr.jqgrow"))
      : [];

    return rows.filter((row) => {
      if (!row) return false;
      if (row.style && row.style.display === "none") return false;
      if (row.hidden) return false;
      return true;
    });
  }

  function getCellDisplayText(row, columnId) {
    if (!row || !columnId) return "";
    const cell = row.querySelector('td[aria-describedby="' + columnId + '"]');
    return safeTrim(cell && (cell.title || cell.textContent));
  }

  function collectVisibleRowMetrics(parts) {
    return getVisibleBodyRows(parts).map((row) => {
      return {
        availableQty: parseNumericText(getCellDisplayText(row, AVAILABLE_COLUMN_ID)),
        allocatedQty: parseNumericText(getCellDisplayText(row, ALLOCATED_COLUMN_ID)),
      };
    });
  }

  function buildPreviewRows(parts) {
    return getVisibleBodyRows(parts).map((row) => {
      const availableQty = parseNumericText(getCellDisplayText(row, AVAILABLE_COLUMN_ID));
      const allocatedQty = parseNumericText(getCellDisplayText(row, ALLOCATED_COLUMN_ID));
      const deltaQty = computeDelta(availableQty, allocatedQty);
      return {
        zoneName: getCellDisplayText(row, ZONE_COLUMN_ID) || "-",
        locationName: getCellDisplayText(row, LOCATION_COLUMN_ID) || "-",
        productName: getCellDisplayText(row, PRODUCT_NAME_COLUMN_ID) || "-",
        nicn: getCellDisplayText(row, NICN_COLUMN_ID) || "-",
        optionName: getCellDisplayText(row, OPTION_NAME_COLUMN_ID) || "-",
        barcode: getCellDisplayText(row, BARCODE_COLUMN_ID) || "-",
        availableQty: formatNumber(availableQty),
        allocatedQty: formatNumber(allocatedQty),
        deltaQty: formatNumber(deltaQty),
      };
    });
  }

  function buildPreviewClipboardText(rows) {
    const header = ["존명", "로케이션", "상품명", "관리명", "옵션", "바코드번호", "가용수량", "할당수량(가용)", "가용-할당수량"].join("\t");
    const body = (Array.isArray(rows) ? rows : []).map((row) => ([
      row.zoneName,
      row.locationName,
      row.productName,
      row.nicn,
      row.optionName,
      row.barcode,
      row.availableQty,
      row.allocatedQty,
      row.deltaQty,
    ].join("\t"))).join("\n");
    return body ? header + "\n" + body : header;
  }

  function buildPreviewTableBodyHtml(rows) {
    const previewRows = Array.isArray(rows) ? rows : [];
    if (!previewRows.length) {
      return '<tr><td colspan="9" class="tm-ui-empty">현재 보이는 재고 행이 없습니다.</td></tr>';
    }

    return previewRows.map((row) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(row.zoneName) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.locationName) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.productName) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.nicn) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.optionName) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.barcode) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.availableQty) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.allocatedQty) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(row.deltaQty) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function buildPreviewModalHtml(rows) {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "embedded", className: "tm-stock-location-helper-preview", density: "compact" })
      : 'class="tm-stock-location-helper-preview"';
    const previewRows = Array.isArray(rows) ? rows : [];

    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-overlay tm-stock-location-helper__overlay" style="display:flex;">',
      '    <div class="tm-ui-modal tm-stock-location-helper__modal">',
      '      <div class="tm-ui-modal__head">',
      "        <div>",
      '          <p class="tm-ui-kicker">Location Inventory</p>',
      '          <h3 class="tm-ui-section-title">재고 프리뷰 복사</h3>',
      '          <p class="tm-ui-section-subtitle">현재 화면에 보이는 재고 행만 빠르게 표로 확인하고 복사합니다.</p>',
      "        </div>",
      '        <span class="tm-ui-badge">' + previewRows.length + "행</span>",
      "      </div>",
      '      <div class="tm-ui-modal__body tm-ui-stack">',
      '        <div class="tm-ui-scroll tm-stock-location-helper__scroll">',
      '          <table class="tm-ui-table">',
      "            <thead>",
      "              <tr>",
      '                <th data-tm-align="center">존명</th>',
      '                <th data-tm-align="center">로케이션</th>',
      '                <th data-tm-align="center">상품명</th>',
      '                <th data-tm-align="center">관리명</th>',
      '                <th data-tm-align="center">옵션</th>',
      '                <th data-tm-align="center">바코드번호</th>',
      '                <th data-tm-align="center">가용수량</th>',
      '                <th data-tm-align="center">할당수량(가용)</th>',
      '                <th data-tm-align="center">가용-할당수량</th>',
      "              </tr>",
      "            </thead>",
      '            <tbody>' + buildPreviewTableBodyHtml(previewRows) + "</tbody>",
      "          </table>",
      "        </div>",
      '        <div id="tm-stock-location-helper-feedback" class="tm-ui-inline-note">현재 보이는 행 기준으로 표 복사를 지원합니다.</div>',
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

  function applyDeltaSlotToParts(parts) {
    if (!parts || !parts.headerTable || !parts.bodyTable || !parts.footTable) return false;

    const headerCell = parts.headerTable.querySelector("#" + SAFE_STOCK_COLUMN_ID);
    if (!headerCell) return false;
    const labelNode = getHeaderLabelNode(headerCell);
    if (labelNode) labelNode.textContent = DELTA_COLUMN_LABEL;
    headerCell.classList.add("tm-stock-location-helper__delta-head");

    getVisibleBodyRows(parts).forEach((row) => {
      const deltaCell = row.querySelector('td[aria-describedby="' + SAFE_STOCK_COLUMN_ID + '"]');
      if (!deltaCell) return;
      const availableQty = parseNumericText(getCellDisplayText(row, AVAILABLE_COLUMN_ID));
      const allocatedQty = parseNumericText(getCellDisplayText(row, ALLOCATED_COLUMN_ID));
      deltaCell.classList.add("tm-stock-location-helper__delta-cell");
      setCellFormattedValue(deltaCell, computeDelta(availableQty, allocatedQty));
    });

    const summary = computeInventorySummary(collectVisibleRowMetrics(parts));
    const availableFoot = parts.footTable.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
    const allocatedFoot = parts.footTable.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
    const deltaFoot = parts.footTable.querySelector('td[aria-describedby="' + SAFE_STOCK_COLUMN_ID + '"]');
    if (availableFoot) setCellFormattedValue(availableFoot, summary.availableQty);
    if (allocatedFoot) setCellFormattedValue(allocatedFoot, summary.allocatedQty);
    if (deltaFoot) {
      deltaFoot.classList.add("tm-stock-location-helper__delta-foot");
      setCellFormattedValue(deltaFoot, summary.deltaQty);
    }

    return true;
  }

  function refreshGrid(state) {
    const parts = getGridParts(state.win.document);
    if (!parts) return false;
    ensureStyles(state.win.document);
    return applyDeltaSlotToParts(parts);
  }

  function scheduleRefresh(state, delayMs) {
    state.win.clearTimeout(state.refreshTimer);
    state.refreshTimer = state.win.setTimeout(() => {
      refreshGrid(state);
    }, typeof delayMs === "number" ? delayMs : 60);
  }

  function wrapGridCallback(gridState, callbackName, scheduleWork) {
    const original = typeof gridState[callbackName] === "function" ? gridState[callbackName] : null;
    if (original && original[GRID_HOOK_FLAG]) return;

    const wrapped = function () {
      const result = original ? original.apply(this, arguments) : undefined;
      scheduleWork();
      return result;
    };

    wrapped[GRID_HOOK_FLAG] = true;
    gridState[callbackName] = wrapped;
  }

  function resolveGridState(win) {
    const table = win.document.getElementById(GRID_TABLE_ID);
    if (!table) return null;
    if (table.p && typeof table.p === "object") return table.p;

    const $ = win.jQuery || win.$;
    if (!$ || !$.fn || !$.fn.jqGrid) return null;
    try {
      return $(table).jqGrid("getGridParam");
    } catch (error) {
      return null;
    }
  }

  function installGridHooks(state) {
    const gridState = resolveGridState(state.win);
    if (!gridState) return false;

    if (state.boundGridState !== gridState) {
      wrapGridCallback(gridState, "gridComplete", () => scheduleRefresh(state, 0));
      wrapGridCallback(gridState, "loadComplete", () => scheduleRefresh(state, 0));
      state.boundGridState = gridState;
    }

    return true;
  }

  function ensureGridHooks(state) {
    if (installGridHooks(state)) return;
    if (state.hookRetryCount >= HOOK_RETRY_LIMIT) return;

    state.win.clearTimeout(state.hookRetryTimer);
    state.hookRetryTimer = state.win.setTimeout(() => {
      state.hookRetryCount += 1;
      ensureGridHooks(state);
      scheduleRefresh(state, 0);
    }, HOOK_RETRY_MS);
  }

  function setPreviewFeedback(win, text, kind) {
    const feedback = win.document.getElementById("tm-stock-location-helper-feedback");
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = kind === "error"
      ? "tm-ui-badge tm-ui-badge--danger"
      : "tm-ui-badge tm-ui-badge--success";
  }

  function closePreviewModal(win) {
    const modal = win.document.getElementById(PREVIEW_MODAL_ID);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
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

  function copyPreviewRows(state) {
    const text = buildPreviewClipboardText(state.previewRows);
    if (state.loader && typeof state.loader.copyText === "function") return state.loader.copyText(text);
    if (state.win && state.win.navigator && state.win.navigator.clipboard && typeof state.win.navigator.clipboard.writeText === "function") {
      return state.win.navigator.clipboard.writeText(text);
    }
    return fallbackCopy(state.win, text);
  }

  function openPreviewModal(state) {
    const parts = getGridParts(state.win.document);
    state.previewRows = parts ? buildPreviewRows(parts) : [];

    const doc = state.win.document;
    ensureStyles(doc);
    closePreviewModal(state.win);

    const container = doc.createElement("div");
    container.id = PREVIEW_MODAL_ID;
    container.innerHTML = buildPreviewModalHtml(state.previewRows);
    doc.body.appendChild(container);

    container.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("button[data-action]") : null;
      if (button) {
        const action = button.getAttribute("data-action");
        if (action === "close") return void closePreviewModal(state.win);
        if (action === "copy") {
          copyPreviewRows(state)
            .then(() => setPreviewFeedback(state.win, "현재 보이는 재고 표가 클립보드에 복사되었습니다.", "success"))
            .catch((error) => setPreviewFeedback(state.win, error && error.message ? error.message : "복사에 실패했습니다.", "error"));
          return;
        }
      }
      if (event.target === container) closePreviewModal(state.win);
    });
  }

  function createPreviewActionLink(doc, targetLink, onClick) {
    if (!doc || !targetLink) return null;

    const button = targetLink.cloneNode(true);
    button.id = PREVIEW_BUTTON_ID;
    button.textContent = PREVIEW_BUTTON_LABEL;
    button.setAttribute("href", "javascript:void(0)");
    button.setAttribute("title", PREVIEW_BUTTON_LABEL);
    button.removeAttribute("onclick");
    button.removeAttribute("target");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof onClick === "function") onClick(event);
    });
    return button;
  }

  function ensurePreviewButton(state) {
    const doc = state.win.document;
    if (doc.getElementById(PREVIEW_BUTTON_ID)) return true;

    const anchorList = Array.prototype.slice.call(doc.querySelectorAll("a"));
    const targetLink = anchorList.find((node) => safeTrim(node.textContent) === "일별재고마감현황");
    if (!targetLink || !targetLink.parentNode) return false;

    const button = createPreviewActionLink(doc, targetLink, () => {
      openPreviewModal(state);
    });
    if (!button) return false;

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(doc.createTextNode(" "));
    fragment.appendChild(button);
    targetLink.parentNode.insertBefore(fragment, targetLink.nextSibling);
    return true;
  }

  function ensurePreviewButtonInstalled(state) {
    if (ensurePreviewButton(state)) return;
    if (state.buttonRetryCount >= BUTTON_RETRY_LIMIT) return;

    state.win.clearTimeout(state.buttonRetryTimer);
    state.buttonRetryTimer = state.win.setTimeout(() => {
      state.buttonRetryCount += 1;
      ensurePreviewButtonInstalled(state);
    }, BUTTON_RETRY_MS);
  }

  function bindEvents(state) {
    if (!state.resizeBound) {
      state.resizeBound = true;
      state.win.addEventListener("resize", () => scheduleRefresh(state, 0));
    }
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    const loader = context && context.loader ? context.loader : null;
    if (!win || !win.document || !shouldRun(win)) return;

    const state = getState(win, loader);
    ensureStyles(win.document);
    bindEvents(state);
    ensurePreviewButtonInstalled(state);
    ensureGridHooks(state);
    scheduleRefresh(state, 0);
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    shouldRun,
    parseNumericText,
    formatNumber,
    computeDelta,
    computeInventorySummary,
    collectVisibleRowMetrics,
    buildPreviewRows,
    buildPreviewClipboardText,
    buildPreviewTableBodyHtml,
    createPreviewActionLink,
    applyDeltaSlotToParts,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


