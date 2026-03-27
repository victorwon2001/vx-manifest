module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "stock-location-helper";
  const MODULE_NAME = "로케이션별 재고도우미";
  const MODULE_VERSION = "0.1.11";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp*"];
  const STYLE_ID = "tm-stock-location-helper-style";
  const STATE_KEY = "__tmStockLocationHelperState";
  const GRID_VIEW_ID = "gview_gridList";
  const AVAILABLE_COLUMN_ID = "gridList_locastock_qty";
  const ALLOCATED_COLUMN_ID = "gridList_locastock_aqty";
  const DELTA_COLUMN_ID = "gridList_available_minus_allocated";
  const DELTA_COLUMN_LABEL = "가용-할당수량";
  const HIDDEN_COLUMN_IDS = ["gridList_locastock_bqty"];

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

  function getHiddenColumnIds() {
    return HIDDEN_COLUMN_IDS.slice();
  }

  function isColumnVisibleByDefault(columnId) {
    return HIDDEN_COLUMN_IDS.indexOf(columnId) === -1;
  }

  function buildColumnDefinitions(headerCells) {
    const columns = [];
    const source = Array.isArray(headerCells) ? headerCells : [];
    const sourceHasDelta = source.some((cell) => safeTrim(cell && cell.id) === DELTA_COLUMN_ID);
    let insertedDelta = false;

    source.forEach((cell) => {
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

      columns.push({
        id: id || "gridList_cb",
        label: label || "선택",
        synthetic: false,
        hiddenByDefault: id ? !isColumnVisibleByDefault(id) : false,
      });

      if (id === ALLOCATED_COLUMN_ID && !sourceHasDelta && !insertedDelta) {
        columns.push({
          id: DELTA_COLUMN_ID,
          label: DELTA_COLUMN_LABEL,
          synthetic: true,
          hiddenByDefault: false,
        });
        insertedDelta = true;
      }
    });

    return columns;
  }

  function normalizeColumnVisibility(columnDefs) {
    return (Array.isArray(columnDefs) ? columnDefs : []).reduce((result, column) => {
      result[column.id] = !column.hiddenByDefault;
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

  function getState(win) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        win: scope,
        observer: null,
        refreshTimer: null,
        alignFrame: null,
        ignoreMutations: false,
        gridBound: false,
        columnDefs: [],
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
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".tm-stock-location-helper__delta-head,.tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{text-align:center!important}",
      ".tm-stock-location-helper__delta-head{font-weight:700}",
      ".tm-stock-location-helper__delta-cell,.tm-stock-location-helper__delta-foot{font-weight:700;color:#29424b;background:rgba(106,146,157,.06)}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getColumnNodes(parts, columnId) {
    const headerCell = parts.headerTable ? parts.headerTable.querySelector("#" + columnId) : null;
    const bodyCells = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll('td[aria-describedby="' + columnId + '"]')) : [];
    const footCell = parts.footTable ? parts.footTable.querySelector('td[aria-describedby="' + columnId + '"]') : null;
    return { headerCell, bodyCells, footCell };
  }

  function setCollapsedCellStyle(node, visible) {
    if (!node || !node.style) return;
    if (visible) {
      node.style.display = "";
      node.style.width = "";
      node.style.minWidth = "";
      node.style.maxWidth = "";
      node.style.padding = "";
      node.style.border = "";
      node.style.overflow = "";
      node.style.visibility = "";
      node.style.boxSizing = "";
    } else {
      node.style.display = "none";
      node.style.width = "0px";
      node.style.minWidth = "0px";
      node.style.maxWidth = "0px";
      node.style.padding = "0";
      node.style.border = "0";
      node.style.overflow = "hidden";
      node.style.visibility = "hidden";
      node.style.boxSizing = "border-box";
    }

    Array.prototype.forEach.call(node.children || [], (child) => {
      if (!child || !child.style) return;
      child.style.display = visible ? "" : "none";
    });
  }

  function setColumnDisplay(parts, columnId, visible) {
    const nodes = getColumnNodes(parts, columnId);
    setCollapsedCellStyle(nodes.headerCell, visible);
    nodes.bodyCells.forEach((cell) => {
      setCollapsedCellStyle(cell, visible);
    });
    setCollapsedCellStyle(nodes.footCell, visible);
  }

  function mirrorCellPresentation(sourceCell, targetCell, roleClassName) {
    if (!sourceCell || !targetCell) return;
    targetCell.className = (sourceCell.className || "") + (roleClassName ? " " + roleClassName : "");
    targetCell.style.cssText = sourceCell.style && sourceCell.style.cssText ? sourceCell.style.cssText : "";
    const width = sourceCell.getAttribute("width");
    if (width) targetCell.setAttribute("width", width);
    else targetCell.removeAttribute("width");
    if (sourceCell.colSpan) targetCell.colSpan = sourceCell.colSpan;
    targetCell.setAttribute("role", sourceCell.getAttribute("role") || "gridcell");
  }

  function buildDeltaHeaderCell(allocatedHead) {
    const headerCell = allocatedHead.cloneNode(true);
    headerCell.id = DELTA_COLUMN_ID;
    headerCell.setAttribute("aria-describedby", DELTA_COLUMN_ID);

    const labelNode = headerCell.querySelector("[id]");
    if (labelNode) {
      labelNode.id = "jqgh_" + DELTA_COLUMN_ID;
      labelNode.textContent = DELTA_COLUMN_LABEL;
    } else {
      headerCell.textContent = DELTA_COLUMN_LABEL;
    }

    return headerCell;
  }

  function ensureComputedColumn(parts) {
    const headerRow = getHeaderRow(parts);
    const allocatedHead = parts.headerTable && parts.headerTable.querySelector("#" + ALLOCATED_COLUMN_ID);
    if (!headerRow || !allocatedHead) return;

    let headerCell = parts.headerTable.querySelector("#" + DELTA_COLUMN_ID);
    const nextCell = allocatedHead.nextElementSibling;
    const rebuiltHeaderCell = buildDeltaHeaderCell(allocatedHead);
    if (!headerCell) {
      allocatedHead.insertAdjacentElement("afterend", rebuiltHeaderCell);
      headerCell = rebuiltHeaderCell;
    } else {
      headerCell.replaceWith(rebuiltHeaderCell);
      headerCell = rebuiltHeaderCell;
      if (nextCell && nextCell !== headerCell && nextCell !== rebuiltHeaderCell) {
        allocatedHead.insertAdjacentElement("afterend", headerCell);
      }
    }
    mirrorCellPresentation(allocatedHead, headerCell, "tm-stock-location-helper__delta-head");

    const bodyRows = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll("tbody tr.jqgrow")) : [];
    bodyRows.forEach((row) => {
      const availableCell = row.querySelector('td[aria-describedby="' + AVAILABLE_COLUMN_ID + '"]');
      const allocatedCell = row.querySelector('td[aria-describedby="' + ALLOCATED_COLUMN_ID + '"]');
      if (!availableCell || !allocatedCell) return;

      let deltaCell = row.querySelector('td[aria-describedby="' + DELTA_COLUMN_ID + '"]');
      if (!deltaCell) {
        deltaCell = allocatedCell.cloneNode(false);
        deltaCell.setAttribute("aria-describedby", DELTA_COLUMN_ID);
        allocatedCell.insertAdjacentElement("afterend", deltaCell);
      }
      mirrorCellPresentation(allocatedCell, deltaCell, "tm-stock-location-helper__delta-cell");
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
      allocatedFoot.insertAdjacentElement("afterend", deltaFoot);
    }
    mirrorCellPresentation(allocatedFoot, deltaFoot, "tm-stock-location-helper__delta-foot");
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

  function statefulHeaderWidth(headerCell) {
    if (!headerCell) return "";
    const inlineWidth = safeTrim(headerCell.style && headerCell.style.width);
    if (inlineWidth) return inlineWidth;
    const widthAttr = safeTrim(headerCell.getAttribute && headerCell.getAttribute("width"));
    if (widthAttr) return widthAttr;
    if (headerCell.ownerDocument && headerCell.ownerDocument.defaultView) {
      const width = headerCell.ownerDocument.defaultView.getComputedStyle(headerCell).width;
      if (safeTrim(width) && width !== "auto") return width;
    }
    const rectWidth = Math.round(headerCell.getBoundingClientRect().width);
    return rectWidth > 0 ? rectWidth + "px" : "";
  }

  function resolveColumnWidth(parts, columnId) {
    const bodyCells = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll('td[aria-describedby="' + columnId + '"]')) : [];
    const visibleBodyCell = bodyCells.find((cell) => {
      return cell && cell.style && cell.style.display !== "none";
    });
    if (visibleBodyCell) {
      const width = visibleBodyCell.ownerDocument && visibleBodyCell.ownerDocument.defaultView
        ? visibleBodyCell.ownerDocument.defaultView.getComputedStyle(visibleBodyCell).width
        : "";
      if (safeTrim(width) && width !== "auto") return width;
      const rectWidth = Math.round(visibleBodyCell.getBoundingClientRect().width * 1000) / 1000;
      if (rectWidth > 0) return rectWidth + "px";
    }

    const headerCell = parts.headerTable ? parts.headerTable.querySelector("#" + columnId) : null;
    return statefulHeaderWidth(headerCell);
  }

  function applyVisibleCellWidth(cell, width) {
    if (!cell || !cell.style) return;
    if (!safeTrim(width)) {
      cell.style.width = "";
      cell.style.minWidth = "";
      cell.style.maxWidth = "";
      cell.style.boxSizing = "";
      cell.removeAttribute("width");
      return;
    }

    cell.style.width = width;
    cell.style.minWidth = width;
    cell.style.maxWidth = width;
    cell.style.boxSizing = "border-box";
    cell.setAttribute("width", width);
  }

  function syncFooterLayout(parts, columnDefs) {
    if (!parts.footTable || !parts.headerTable || !parts.bodyTable) return;

    (Array.isArray(columnDefs) ? columnDefs : []).forEach((column) => {
      const columnId = column.id;
      if (!columnId || columnId === "gridList_cb") return;

      const headerCell = parts.headerTable.querySelector("#" + columnId);
      const bodyCells = parts.bodyTable ? Array.prototype.slice.call(parts.bodyTable.querySelectorAll('td[aria-describedby="' + columnId + '"]')) : [];
      const footCell = parts.footTable.querySelector('td[aria-describedby="' + columnId + '"]');
      if (!headerCell || !footCell) return;

      if (column.hiddenByDefault) {
        setCollapsedCellStyle(headerCell, false);
        bodyCells.forEach((cell) => setCollapsedCellStyle(cell, false));
        setCollapsedCellStyle(footCell, false);
        headerCell.removeAttribute("width");
        bodyCells.forEach((cell) => cell.removeAttribute("width"));
        footCell.removeAttribute("width");
        return;
      }

      setCollapsedCellStyle(headerCell, true);
      bodyCells.forEach((cell) => setCollapsedCellStyle(cell, true));
      setCollapsedCellStyle(footCell, true);
      const computedWidth = resolveColumnWidth(parts, columnId);
      applyVisibleCellWidth(headerCell, computedWidth);
      bodyCells.forEach((cell) => applyVisibleCellWidth(cell, computedWidth));
      applyVisibleCellWidth(footCell, computedWidth);
    });

    const synchronizedWidth = Math.max(
      Math.round(parts.headerTable.scrollWidth || 0),
      Math.round(parts.bodyTable.scrollWidth || 0),
      Math.round(parts.footTable.scrollWidth || 0),
      Math.round(parts.headerTable.getBoundingClientRect().width || 0),
      Math.round(parts.bodyTable.getBoundingClientRect().width || 0),
      Math.round(parts.footTable.getBoundingClientRect().width || 0)
    );
    if (synchronizedWidth > 0) {
      parts.headerTable.style.width = synchronizedWidth + "px";
      parts.bodyTable.style.width = synchronizedWidth + "px";
      parts.footTable.style.width = synchronizedWidth + "px";
    }
    parts.headerTable.style.tableLayout = "fixed";
    parts.bodyTable.style.tableLayout = "fixed";
    parts.footTable.style.tableLayout = "fixed";
    alignFooterTable(parts, columnDefs);
  }

  function alignFooterTable(parts, columnDefs) {
    if (!parts.footTable || !parts.headerTable) return;
    const firstVisibleColumn = (Array.isArray(columnDefs) ? columnDefs : []).find((column) => {
      return column.id && column.id !== "gridList_cb" && !column.hiddenByDefault;
    });
    if (!firstVisibleColumn) {
      parts.footTable.style.marginLeft = "";
      return;
    }

    const headerCell = parts.headerTable.querySelector("#" + firstVisibleColumn.id);
    const footCell = parts.footTable.querySelector('td[aria-describedby="' + firstVisibleColumn.id + '"]');
    if (!headerCell || !footCell) {
      parts.footTable.style.marginLeft = "";
      return;
    }

    const offset = Math.round(headerCell.getBoundingClientRect().left - footCell.getBoundingClientRect().left);
    parts.footTable.style.marginLeft = offset ? offset + "px" : "";
  }

  function scheduleFooterAlignment(state, parts) {
    alignFooterTable(parts, state.columnDefs);
    if (typeof state.win.cancelAnimationFrame === "function" && state.alignFrame != null) {
      state.win.cancelAnimationFrame(state.alignFrame);
    }
    if (typeof state.win.requestAnimationFrame !== "function") return;
    state.alignFrame = state.win.requestAnimationFrame(() => {
      alignFooterTable(parts, state.columnDefs);
      state.alignFrame = null;
    });
  }

  function applyHiddenColumns(parts, columnDefs) {
    (Array.isArray(columnDefs) ? columnDefs : []).forEach((column) => {
      if (column.id === "gridList_cb") return;
      setColumnDisplay(parts, column.id, !column.hiddenByDefault);
    });
  }

  function withMutationGuard(state, callback) {
    state.ignoreMutations = true;
    try {
      callback();
    } finally {
      state.win.setTimeout(() => {
        state.ignoreMutations = false;
      }, 0);
    }
  }

  function applyGridState(state, parts) {
    const nextParts = parts || getGridParts(state.win.document);
    if (!nextParts || !nextParts.headerTable || !nextParts.bodyTable || !nextParts.footTable) return;

    withMutationGuard(state, () => {
      ensureComputedColumn(nextParts);
      applyHiddenColumns(nextParts, state.columnDefs);
      syncFooterLayout(nextParts, state.columnDefs);
      updateFooterSummary(nextParts);
      scheduleFooterAlignment(state, nextParts);
    });
  }

  function refreshGrid(state) {
    const parts = getGridParts(state.win.document);
    if (!parts || !parts.headerTable || !parts.bodyTable || !parts.footTable) return;
    ensureStyles(state.win.document);
    state.columnDefs = buildColumnDefinitions(getHeaderCells(parts));
    applyGridState(state, parts);
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
        if (state.ignoreMutations) return;
        scheduleRefresh(state);
      });
      state.observer.observe(state.win.document.body, { childList: true, subtree: true });
    }

    state.win.addEventListener("resize", () => scheduleRefresh(state));
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;

    const state = getState(win);
    ensureStyles(win.document);
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
    getHiddenColumnIds,
    buildColumnDefinitions,
    normalizeColumnVisibility,
    computeInventorySummary,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);






