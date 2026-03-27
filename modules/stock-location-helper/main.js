module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "stock-location-helper";
  const MODULE_NAME = "로케이션별 재고도우미";
  const MODULE_VERSION = "0.1.1";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp*"];
  const STYLE_ID = "tm-stock-location-helper-style";
  const ROOT_ID = "tmStockLocationHelperRoot";
  const MODAL_ID = "tmStockLocationHelperModal";
  const SETTINGS_BUTTON_ID = "tmStockLocationHelperSettingsButton";
  const STORAGE_KEY = "tmStockLocationHelper:columnVisibility";
  const STATE_KEY = "__tmStockLocationHelperState";
  const GRID_VIEW_ID = "gview_gridList";
  const ORDLOOKUP_HREF = "javascript:go_ordloct()";
  const AVAILABLE_COLUMN_ID = "gridList_locastock_qty";
  const ALLOCATED_COLUMN_ID = "gridList_locastock_aqty";
  const SAFE_STOCK_COLUMN_ID = "gridList_locastock_bqty";
  const DELTA_COLUMN_ID = "gridList_available_minus_allocated";
  const DELTA_COLUMN_LABEL = "가용-할당수량";
  const DEFAULT_HIDDEN_COLUMN_IDS = [SAFE_STOCK_COLUMN_ID];

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
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/stm\/stm410main4\.jsp/i.test(String(win && win.location && win.location.href || ""));
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

  function buildColumnDefinitions(headerCells) {
    const columns = [];
    const sourceHasDelta = (Array.isArray(headerCells) ? headerCells : []).some((cell) => safeTrim(cell && cell.id) === DELTA_COLUMN_ID);
    let insertedDelta = false;
    (Array.isArray(headerCells) ? headerCells : []).forEach((cell) => {
      const id = safeTrim(cell && cell.id);
      const label = safeTrim(cell && cell.text);
      if (id === DELTA_COLUMN_ID) {
        if (!insertedDelta) {
          columns.push({
            id,
            label: label || DELTA_COLUMN_LABEL,
            synthetic: true,
            hiddenByDefault: false,
          });
          insertedDelta = true;
        }
        return;
      }
      if (id === ALLOCATED_COLUMN_ID) {
        columns.push({
          id,
          label: label || id,
          synthetic: false,
          hiddenByDefault: DEFAULT_HIDDEN_COLUMN_IDS.indexOf(id) !== -1,
        });
        if (!sourceHasDelta && !insertedDelta) {
          columns.push({
            id: DELTA_COLUMN_ID,
            label: DELTA_COLUMN_LABEL,
            synthetic: true,
            hiddenByDefault: false,
          });
          insertedDelta = true;
        }
        return;
      }
      columns.push({
        id: id || "gridList_cb",
        label: label || "선택",
        synthetic: false,
        hiddenByDefault: DEFAULT_HIDDEN_COLUMN_IDS.indexOf(id) !== -1,
      });
    });
    return columns;
  }

  function normalizeColumnVisibility(columnDefs, stored) {
    const source = stored && typeof stored === "object" ? stored : {};
    return (Array.isArray(columnDefs) ? columnDefs : []).reduce((result, column) => {
      result[column.id] = Object.prototype.hasOwnProperty.call(source, column.id)
        ? !!source[column.id]
        : !column.hiddenByDefault;
      return result;
    }, {});
  }

  function computeInventorySummary(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
      const availableQty = Number(row && row.availableQty) || 0;
      const allocatedQty = Number(row && row.allocatedQty) || 0;
      summary.availableQty += availableQty;
      summary.allocatedQty += allocatedQty;
      summary.deltaQty += availableQty - allocatedQty;
      return summary;
    }, {
      availableQty: 0,
      allocatedQty: 0,
      deltaQty: 0,
    });
  }

  function buildSettingsModalHtml(columnDefs, visibility) {
    const rows = (Array.isArray(columnDefs) ? columnDefs : [])
      .filter((column) => column.id !== "gridList_cb")
      .map((column) => [
        '<label class="tm-stock-location-helper__option">',
        '  <input type="checkbox" data-column-id="' + escapeHtml(column.id) + '"' + (visibility && visibility[column.id] !== false ? " checked" : "") + ">",
        '  <span>' + escapeHtml(column.label) + "</span>",
        "</label>",
      ].join(""))
      .join("");

    return [
      '<div id="' + MODAL_ID + '" class="tm-ui-overlay" style="display:none">',
      '  <div class="tm-ui-modal tm-stock-location-helper__modal">',
      '    <div class="tm-ui-modal__head">',
      '      <div><strong>테이블설정</strong><p class="tm-stock-location-helper__modal-copy">표시할 열을 선택하면 현재 PC에 저장됩니다.</p></div>',
      '      <button type="button" class="tm-ui-btn tm-ui-btn--ghost" data-action="close-settings">닫기</button>',
      "    </div>",
      '    <div class="tm-ui-modal__body"><div class="tm-stock-location-helper__options">' + rows + "</div></div>",
      '    <div class="tm-ui-modal__foot"><button type="button" class="tm-ui-btn tm-ui-btn--secondary" data-action="reset-columns">기본값 복원</button><button type="button" class="tm-ui-btn tm-ui-btn--primary" data-action="close-settings">확인</button></div>',
      "  </div>",
      "</div>",
    ].join("");
  }

  function getState(win) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        win: scope,
        observer: null,
        refreshTimer: null,
        columnDefs: [],
        visibility: {},
        gridBound: false,
      };
    }
    return scope[STATE_KEY];
  }

  function getGridParts(doc) {
    const view = doc && doc.getElementById ? doc.getElementById(GRID_VIEW_ID) : null;
    if (!view) return null;
    return {
      view,
      headerTable: view.querySelector(".ui-jqgrid-htable"),
      bodyTable: view.querySelector(".ui-jqgrid-btable"),
      footTable: view.querySelector(".ui-jqgrid-ftable"),
    };
  }

  function getHeaderRow(parts) {
    return parts && parts.headerTable ? parts.headerTable.querySelector("thead tr.ui-jqgrid-labels, thead tr:last-child") : null;
  }

  function getHeaderCells(parts) {
    const row = getHeaderRow(parts);
    return row ? Array.prototype.map.call(row.children, (cell) => ({
      id: cell.id || "",
      text: cell.textContent || "",
    })) : [];
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head) return;
    const moduleUi = getModuleUi(root);
    if (moduleUi && typeof moduleUi.ensureStyles === "function") moduleUi.ensureStyles(doc);
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tm-stock-location-helper__settings-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;padding:0 10px;margin-left:6px;border:1px solid #c8d0d2;border-radius:10px;background:#fff;color:#334346;font:600 12px 'Public Sans','Noto Sans KR','Malgun Gothic',sans-serif;cursor:pointer;vertical-align:middle}",
      ".tm-stock-location-helper__settings-button:hover{background:#f4f6f6}",
      ".tm-stock-location-helper{position:relative;z-index:9999}",
      ".tm-stock-location-helper__modal{width:min(520px,92vw)}",
      ".tm-stock-location-helper__modal-copy{margin:6px 0 0;color:var(--tm-muted);font-size:12px}",
      ".tm-stock-location-helper__options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px}",
      ".tm-stock-location-helper__option{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--tm-border);border-radius:12px;background:var(--tm-surface-alt);font-size:12px;color:var(--tm-text)}",
      ".tm-stock-location-helper__option input{margin:0}",
      ".tm-stock-location-helper__delta-head,.tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{text-align:center!important}",
      ".tm-stock-location-helper__delta-head{font-weight:700}",
      ".tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{font-weight:700;color:#29424b;background:rgba(106,146,157,.06)}",
      "@media (max-width: 860px){.tm-stock-location-helper__options{grid-template-columns:1fr}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function ensureRoot(doc) {
    let rootNode = doc.getElementById(ROOT_ID);
    if (rootNode) return rootNode;
    rootNode = doc.createElement("div");
    rootNode.id = ROOT_ID;
    rootNode.className = "tm-ui-root tm-stock-location-helper";
    rootNode.setAttribute("data-tm-density", "compact");
    rootNode.innerHTML = buildSettingsModalHtml([], {});
    doc.body.appendChild(rootNode);
    return rootNode;
  }

  function loadVisibility(win, columnDefs) {
    let stored = {};
    try {
      stored = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      stored = {};
    }
    return normalizeColumnVisibility(columnDefs, stored);
  }

  function saveVisibility(win, visibility) {
    try {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility || {}));
    } catch (error) {
      // Ignore storage failures in restricted contexts.
    }
  }

  function ensureSettingsButton(state) {
    const doc = state.win.document;
    const actionAnchor = doc.querySelector('a[href="' + ORDLOOKUP_HREF + '"]');
    if (!actionAnchor) return;
    if (doc.getElementById(SETTINGS_BUTTON_ID)) return;
    const button = doc.createElement("button");
    button.type = "button";
    button.id = SETTINGS_BUTTON_ID;
    button.className = "tm-stock-location-helper__settings-button";
    button.textContent = "테이블설정";
    actionAnchor.insertAdjacentElement("afterend", button);
  }

  function getColumnNodes(parts, columnId) {
    const headerCell = parts.headerTable ? parts.headerTable.querySelector("#" + columnId) : null;
    const bodyCells = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll('td[aria-describedby="' + columnId + '"]')) : [];
    const footCell = parts.footTable ? parts.footTable.querySelector('td[aria-describedby="' + columnId + '"]') : null;
    return { headerCell, bodyCells, footCell };
  }

  function setColumnDisplay(parts, columnId, visible) {
    const nodes = getColumnNodes(parts, columnId);
    const display = visible ? "" : "none";
    if (nodes.headerCell) nodes.headerCell.style.display = display;
    nodes.bodyCells.forEach((cell) => { cell.style.display = display; });
    if (nodes.footCell) nodes.footCell.style.display = display;
  }

  function ensureComputedColumn(parts) {
    const headerRow = getHeaderRow(parts);
    const allocatedHead = parts.headerTable && parts.headerTable.querySelector("#" + ALLOCATED_COLUMN_ID);
    if (!headerRow || !allocatedHead) return;

    let headerCell = parts.headerTable.querySelector("#" + DELTA_COLUMN_ID);
    if (!headerCell) {
      headerCell = allocatedHead.cloneNode(false);
      headerCell.id = DELTA_COLUMN_ID;
      headerCell.setAttribute("aria-describedby", DELTA_COLUMN_ID);
      headerCell.className = (allocatedHead.className || "") + " tm-stock-location-helper__delta-head";
      headerCell.style.width = "86px";
      headerCell.textContent = DELTA_COLUMN_LABEL;
      allocatedHead.insertAdjacentElement("afterend", headerCell);
    }

    const bodyRows = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll("tbody tr.jqgrow")) : [];
    bodyRows.forEach((row) => {
      const availableCell = row.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
      const allocatedCell = row.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
      if (!availableCell || !allocatedCell) return;
      let deltaCell = row.querySelector('td[aria-describedby="' + DELTA_COLUMN_ID + '"]');
      if (!deltaCell) {
        deltaCell = allocatedCell.cloneNode(false);
        deltaCell.setAttribute("aria-describedby", DELTA_COLUMN_ID);
        deltaCell.className = (allocatedCell.className || "") + " tm-stock-location-helper__delta-cell";
        deltaCell.style.width = "86px";
        allocatedCell.insertAdjacentElement("afterend", deltaCell);
      }
      const deltaValue = parseNumericText(availableCell.title || availableCell.textContent) - parseNumericText(allocatedCell.title || allocatedCell.textContent);
      deltaCell.textContent = formatNumber(deltaValue);
      deltaCell.title = formatNumber(deltaValue);
    });

    const footRow = parts.footTable ? parts.footTable.querySelector("tbody tr") : null;
    if (!footRow) return;
    const allocatedFoot = footRow.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
    if (!allocatedFoot) return;
    let deltaFoot = footRow.querySelector('td[aria-describedby="' + DELTA_COLUMN_ID + '"]');
    if (!deltaFoot) {
      deltaFoot = allocatedFoot.cloneNode(false);
      deltaFoot.setAttribute("aria-describedby", DELTA_COLUMN_ID);
      deltaFoot.className = (allocatedFoot.className || "") + " tm-stock-location-helper__delta-foot";
      deltaFoot.style.width = "86px";
      allocatedFoot.insertAdjacentElement("afterend", deltaFoot);
    }
  }

  function collectVisibleRowMetrics(parts) {
    const rows = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll("tbody tr.jqgrow")) : [];
    return rows
      .filter((row) => row.style.display !== "none")
      .map((row) => {
        const availableCell = row.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
        const allocatedCell = row.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
        return {
          availableQty: parseNumericText(availableCell && (availableCell.title || availableCell.textContent)),
          allocatedQty: parseNumericText(allocatedCell && (allocatedCell.title || allocatedCell.textContent)),
        };
      });
  }

  function updateFooterSummary(parts) {
    const summary = computeInventorySummary(collectVisibleRowMetrics(parts));
    const availableFoot = parts.footTable && parts.footTable.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
    const allocatedFoot = parts.footTable && parts.footTable.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
    const deltaFoot = parts.footTable && parts.footTable.querySelector('td[aria-describedby="' + DELTA_COLUMN_ID + '"]');
    if (availableFoot) {
      availableFoot.textContent = formatNumber(summary.availableQty);
      availableFoot.title = formatNumber(summary.availableQty);
    }
    if (allocatedFoot) {
      allocatedFoot.textContent = formatNumber(summary.allocatedQty);
      allocatedFoot.title = formatNumber(summary.allocatedQty);
    }
    if (deltaFoot) {
      deltaFoot.textContent = formatNumber(summary.deltaQty);
      deltaFoot.title = formatNumber(summary.deltaQty);
    }
  }

  function renderSettingsModal(state) {
    const doc = state.win.document;
    const rootNode = ensureRoot(doc);
    const overlay = doc.getElementById(MODAL_ID);
    const isOpen = !!(overlay && overlay.style.display !== "none");
    if (!overlay) return;
    overlay.outerHTML = buildSettingsModalHtml(state.columnDefs, state.visibility);
    if (isOpen) {
      const nextOverlay = doc.getElementById(MODAL_ID);
      if (nextOverlay) nextOverlay.style.display = "flex";
    }
  }

  function openSettingsModal(state) {
    renderSettingsModal(state);
    const overlay = state.win.document.getElementById(MODAL_ID);
    if (overlay) overlay.style.display = "flex";
  }

  function closeSettingsModal(state) {
    const overlay = state.win.document.getElementById(MODAL_ID);
    if (overlay) overlay.style.display = "none";
  }

  function applyVisibility(parts, columnDefs, visibility) {
    (Array.isArray(columnDefs) ? columnDefs : []).forEach((column) => {
      if (column.id === "gridList_cb") return;
      setColumnDisplay(parts, column.id, visibility[column.id] !== false);
    });
  }

  function refreshGrid(state) {
    const parts = getGridParts(state.win.document);
    if (!parts || !parts.headerTable || !parts.bodyTable || !parts.footTable) return;
    ensureStyles(state.win.document);
    ensureRoot(state.win.document);
    ensureSettingsButton(state);
    ensureComputedColumn(parts);
    state.columnDefs = buildColumnDefinitions(getHeaderCells(parts));
    state.visibility = loadVisibility(state.win, state.columnDefs);
    applyVisibility(parts, state.columnDefs, state.visibility);
    updateFooterSummary(parts);
    if (state.win.document.getElementById(MODAL_ID)) renderSettingsModal(state);
  }

  function scheduleRefresh(state) {
    state.win.clearTimeout(state.refreshTimer);
    state.refreshTimer = state.win.setTimeout(() => refreshGrid(state), 80);
  }

  function bindEvents(state) {
    if (state.gridBound) return;
    state.gridBound = true;
    if (typeof state.win.MutationObserver === "function") {
      state.observer = new state.win.MutationObserver(() => {
        scheduleRefresh(state);
      });
      state.observer.observe(state.win.document.body, { childList: true, subtree: true });
    }
    state.win.document.body.addEventListener("click", (event) => {
      const settingsButton = event.target.closest("#" + SETTINGS_BUTTON_ID);
      if (settingsButton) {
        openSettingsModal(state);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (!action) return;
      const actionName = action.getAttribute("data-action");
      if (actionName === "close-settings") {
        closeSettingsModal(state);
        return;
      }
      if (actionName === "reset-columns") {
        state.visibility = normalizeColumnVisibility(state.columnDefs, {});
        saveVisibility(state.win, state.visibility);
        refreshGrid(state);
        return;
      }
    });
    state.win.document.body.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || target.tagName !== "INPUT" || !target.hasAttribute("data-column-id")) return;
      if (!target.closest("#" + MODAL_ID)) return;
      state.visibility[target.getAttribute("data-column-id")] = target.checked;
      saveVisibility(state.win, state.visibility);
      refreshGrid(state);
    });
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;
    const state = getState(win);
    ensureStyles(win.document);
    ensureRoot(win.document);
    bindEvents(state);
    scheduleRefresh(state);
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
    buildColumnDefinitions,
    normalizeColumnVisibility,
    computeInventorySummary,
    buildSettingsModalHtml,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

