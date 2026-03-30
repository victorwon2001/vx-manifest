module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "stock-location-helper";
  const MODULE_NAME = "로케이션별 재고도우미";
  const MODULE_VERSION = "0.1.13";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp*"];
  const STYLE_ID = "tm-stock-location-helper-style";
  const STATE_KEY = "__tmStockLocationHelperState";
  const GRID_VIEW_ID = "gview_gridList";
  const GRID_TABLE_ID = "gridList";
  const GRID_HOOK_FLAG = "__tmStockLocationHelperWrapped";
  const AVAILABLE_COLUMN_ID = "gridList_locastock_qty";
  const ALLOCATED_COLUMN_ID = "gridList_locastock_aqty";
  const SAFE_STOCK_COLUMN_ID = "gridList_locastock_bqty";
  const DELTA_COLUMN_LABEL = "가용-할당수량";
  const HOOK_RETRY_MS = 250;
  const HOOK_RETRY_LIMIT = 24;

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\/jsp\/stm\/stm410main4\.jsp/i.test(String(win && win.location && win.location.href || ""));
  }

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
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

  function getState(win) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        win: scope,
        refreshTimer: null,
        hookRetryTimer: null,
        hookRetryCount: 0,
        resizeBound: false,
        boundGridState: null,
      };
    }
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
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tm-stock-location-helper__delta-head{font-weight:700}",
      ".tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{color:#29424b;font-weight:700}",
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

  function collectVisibleRowMetrics(parts) {
    return getVisibleBodyRows(parts).map((row) => {
      const availableCell = row.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
      const allocatedCell = row.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
      return {
        availableQty: parseNumericText(availableCell && (availableCell.title || availableCell.textContent)),
        allocatedQty: parseNumericText(allocatedCell && (allocatedCell.title || allocatedCell.textContent)),
      };
    });
  }

  function applyDeltaSlotToParts(parts) {
    if (!parts || !parts.headerTable || !parts.bodyTable || !parts.footTable) return false;

    const headerCell = parts.headerTable.querySelector("#" + SAFE_STOCK_COLUMN_ID);
    if (!headerCell) return false;
    const labelNode = getHeaderLabelNode(headerCell);
    if (labelNode) labelNode.textContent = DELTA_COLUMN_LABEL;
    headerCell.classList.add("tm-stock-location-helper__delta-head");

    getVisibleBodyRows(parts).forEach((row) => {
      const availableCell = row.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
      const allocatedCell = row.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
      const deltaCell = row.querySelector('td[aria-describedby="' + SAFE_STOCK_COLUMN_ID + '"]');
      if (!availableCell || !allocatedCell || !deltaCell) return;
      const availableQty = parseNumericText(availableCell.title || availableCell.textContent);
      const allocatedQty = parseNumericText(allocatedCell.title || allocatedCell.textContent);
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

  function bindEvents(state) {
    if (!state.resizeBound) {
      state.resizeBound = true;
      state.win.addEventListener("resize", () => scheduleRefresh(state, 0));
    }
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;

    const state = getState(win);
    ensureStyles(win.document);
    bindEvents(state);
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
    applyDeltaSlotToParts,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

