module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "unshipped-checker";
  const MODULE_NAME = "미출고 건수 체커";
  const MODULE_VERSION = "0.1.3";
  const MATCHES = ["https://www.ebut3pl.co.kr/*"];
  const DATA_ENDPOINT = "/site/site210main_jdata";
  const NAV_BUTTON_ID = "tm-unshipped-checker-nav-button";
  const NAV_BUTTON_LABEL = "미출고체크";
  const NAV_INSERT_BEFORE_LABEL = "상담전용창";
  const POPUP_NAME = "tm-unshipped-checker-window";
  const POPUP_FEATURES = "width=1180,height=860,resizable=yes,scrollbars=yes";
  const STYLE_ID = "tm-unshipped-checker-style";
  const STATE_KEY = "__tmUnshippedCheckerState";
  const PAGE_SIZE = 500;
  const INTER_PAGE_DELAY_MS = 200;

  function getModuleUi(scope) {
    if (scope && scope.__tmModuleUi) return scope.__tmModuleUi;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmModuleUi) return globalThis.__tmModuleUi;
    return null;
  }

  function getNavMenu(scope) {
    if (scope && scope.__tmNavMenu) return scope.__tmNavMenu;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.__tmNavMenu) return globalThis.__tmNavMenu;
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

  function formatDateLabel(dateLike) {
    const date = dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function shiftMonthsClamped(baseDate, diffMonths) {
    const source = new Date(baseDate.getTime());
    const sourceDay = source.getDate();
    const targetMonthIndex = source.getMonth() + diffMonths;
    const targetYear = source.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    return new Date(
      targetYear,
      normalizedMonth,
      Math.min(sourceDay, lastDayOfTargetMonth),
      source.getHours(),
      source.getMinutes(),
      source.getSeconds(),
      source.getMilliseconds()
    );
  }

  function createDateRange(now) {
    const baseDate = now instanceof Date ? new Date(now.getTime()) : new Date();
    return {
      from: formatDateLabel(shiftMonthsClamped(baseDate, -3)),
      to: formatDateLabel(baseDate),
    };
  }

  function buildDataUrl(dateFrom, dateTo, page, stamp) {
    const params = new URLSearchParams({
      site_code: "",
      basic_prov: "",
      basic_prov_name: "",
      VIEW_TYPE: "3",
      ORDLIST_CUST: "",
      ORDLIST_BRAND: "",
      ORDLIST_IVLEVEL: "",
      ORDLIST_NO1: "",
      ORDLIST_OMAN: "",
      ORDLIST_RMAN: "",
      ORDLIST_TEL: "",
      ORDLIST_FNSH: "0",
      ORDLIST_IVTRUE: "Y",
      ORDLIST_GBN: "",
      ORDLIST_MIYN: "",
      DATE_GBN: "ord_ivdate",
      DATE1: safeTrim(dateFrom),
      DATE2: safeTrim(dateTo),
      ORDLIST_UPTYPE: "",
      ORDLIST_NAME: "",
      ORDLIST_MAT: "",
      ORDLIST_DNO: "",
      ORDLIST_SEQ: "",
      ORDLIST_DOFC: "",
      GROUP_VIEW_TYPE: "2",
      ORDLIST_IVAFYN: "",
      BASIC_NAME_GBN: "",
      BASIC_NAME_VAL: "",
      BASIC_BRAND: "",
      ORDADD_REYN: "",
      ORDLIST_NAME_NOT: "",
      ORDLIST_OPT1_NOT: "",
      gridReload: "true",
      _search: "false",
      nd: String(stamp || Date.now()),
      rows: String(PAGE_SIZE),
      page: String(page),
      sidx: "ordlist_code",
      sord: "asc",
    });
    return "https://www.ebut3pl.co.kr" + DATA_ENDPOINT + "?" + params.toString();
  }

  function sleep(win, ms) {
    const scope = win || root;
    return new Promise((resolve) => scope.setTimeout(resolve, ms));
  }

  function normalizeOrder(row) {
    return {
      site: safeTrim(row && row.site_name) || "미지정",
      courier: safeTrim(row && row.ordlist_dofc) || "미지정",
      orderNo: safeTrim(row && row.ordlist_no1) || "-",
      invoiceNo: safeTrim(row && row.ordlist_dno) || "-",
    };
  }

  function groupBySite(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const order = normalizeOrder(row);
      const key = order.site + "||" + order.courier;
      if (!map.has(key)) {
        map.set(key, {
          key,
          site: order.site,
          courier: order.courier,
          count: 0,
          orders: [],
        });
      }
      const target = map.get(key);
      target.count += 1;
      target.orders.push({
        orderNo: order.orderNo,
        invoiceNo: order.invoiceNo,
      });
    });
    return Array.from(map.values()).sort((left, right) => right.count - left.count || left.site.localeCompare(right.site));
  }

  function groupByCourier(rows) {
    const courierMap = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const order = normalizeOrder(row);
      if (!courierMap.has(order.courier)) {
        courierMap.set(order.courier, {
          courier: order.courier,
          count: 0,
          sites: new Map(),
        });
      }
      const courierGroup = courierMap.get(order.courier);
      courierGroup.count += 1;
      if (!courierGroup.sites.has(order.site)) {
        courierGroup.sites.set(order.site, {
          site: order.site,
          count: 0,
          orders: [],
        });
      }
      const siteGroup = courierGroup.sites.get(order.site);
      siteGroup.count += 1;
      siteGroup.orders.push({
        orderNo: order.orderNo,
        invoiceNo: order.invoiceNo,
      });
    });
    return Array.from(courierMap.values())
      .map((group) => ({
        courier: group.courier,
        count: group.count,
        sites: Array.from(group.sites.values()).sort((left, right) => right.count - left.count || left.site.localeCompare(right.site)),
      }))
      .sort((left, right) => right.count - left.count || left.courier.localeCompare(right.courier));
  }

  function summarizeGroups(rows, siteGroups, courierGroups) {
    return {
      totalCount: Array.isArray(rows) ? rows.length : 0,
      siteGroupCount: Array.isArray(siteGroups) ? siteGroups.length : 0,
      courierGroupCount: Array.isArray(courierGroups) ? courierGroups.length : 0,
    };
  }

  function buildSummaryHtml(summary) {
    return [
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">총 미출고</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.totalCount) + '</span><span class="tm-ui-kpi__meta">조회된 전체 주문</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">판매처 묶음</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.siteGroupCount) + '</span><span class="tm-ui-kpi__meta">판매처 + 택배사 기준</span></div>',
      '<div class="tm-ui-kpi"><span class="tm-ui-kpi__label">택배사 수</span><span class="tm-ui-kpi__value">' + escapeHtml(summary.courierGroupCount) + '</span><span class="tm-ui-kpi__meta">택배사 기준 집계</span></div>',
    ].join("");
  }

  function buildOrdersTableHtml(orders) {
    const rows = (Array.isArray(orders) ? orders : []).map((order, index) => {
      return [
        "<tr>",
        '<td data-tm-align="center">' + escapeHtml(index + 1) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(order.orderNo) + "</td>",
        '<td data-tm-align="center">' + escapeHtml(order.invoiceNo) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
    return [
      '<div class="tm-unshipped-checker__nested">',
      '  <table class="tm-ui-table">',
      "    <thead><tr><th data-tm-align=\"center\">No.</th><th data-tm-align=\"center\">주문번호</th><th data-tm-align=\"center\">송장번호</th></tr></thead>",
      "    <tbody>",
      rows || '<tr><td colspan="3" class="tm-ui-empty">표시할 주문이 없습니다.</td></tr>',
      "    </tbody>",
      "  </table>",
      "</div>",
    ].join("");
  }

  function buildSiteTableHtml(groups) {
    const rows = (Array.isArray(groups) ? groups : []).map((group, index) => {
      const detailId = "tm-unshipped-site-detail-" + index;
      return [
        '<tr class="tm-unshipped-checker__row" data-group="site">',
        '  <td data-tm-align="left">',
        '    <button type="button" class="tm-unshipped-checker__toggle" data-action="toggle-detail" data-detail-id="' + detailId + '" aria-expanded="false"><span class="tm-unshipped-checker__chevron" aria-hidden="true"></span><span class="tm-unshipped-checker__toggle-label">' + escapeHtml(group.site) + " - " + escapeHtml(group.courier) + "</span></button>",
        "  </td>",
        '  <td data-tm-align="center" class="tm-unshipped-checker__count-cell"><span class="tm-ui-badge">' + escapeHtml(group.count) + "건</span></td>",
        "</tr>",
        '<tr id="' + detailId + '" class="tm-unshipped-checker__detail" hidden><td colspan="2">' + buildOrdersTableHtml(group.orders) + "</td></tr>",
      ].join("");
    }).join("");
    return [
      '<div class="tm-ui-scroll tm-unshipped-checker__table-wrap">',
      '  <table class="tm-ui-table">',
      "    <thead><tr><th data-tm-align=\"left\">판매처 - 택배사</th><th data-tm-align=\"center\">미출고 건수</th></tr></thead>",
      "    <tbody>",
      rows || '<tr><td colspan="2" class="tm-ui-empty">조회된 미출고 데이터가 없습니다.</td></tr>',
      "    </tbody>",
      "  </table>",
      "</div>",
    ].join("");
  }

  function buildNestedSiteTableHtml(sites, prefix) {
    const rows = (Array.isArray(sites) ? sites : []).map((siteGroup, index) => {
      const detailId = prefix + "-site-detail-" + index;
      return [
        '<tr class="tm-unshipped-checker__row tm-unshipped-checker__row--nested" data-group="site-detail">',
        '  <td data-tm-align="left"><button type="button" class="tm-unshipped-checker__toggle" data-action="toggle-detail" data-detail-id="' + detailId + '" aria-expanded="false"><span class="tm-unshipped-checker__chevron" aria-hidden="true"></span><span class="tm-unshipped-checker__toggle-label">' + escapeHtml(siteGroup.site) + "</span></button></td>",
        '  <td data-tm-align="center" class="tm-unshipped-checker__count-cell"><span class="tm-ui-badge">' + escapeHtml(siteGroup.count) + "건</span></td>",
        "</tr>",
        '<tr id="' + detailId + '" class="tm-unshipped-checker__detail" hidden><td colspan="2">' + buildOrdersTableHtml(siteGroup.orders) + "</td></tr>",
      ].join("");
    }).join("");
    return [
      '<div class="tm-unshipped-checker__nested">',
      '  <table class="tm-ui-table">',
      "    <thead><tr><th data-tm-align=\"left\">판매처</th><th data-tm-align=\"center\">수량</th></tr></thead>",
      "    <tbody>",
      rows || '<tr><td colspan="2" class="tm-ui-empty">표시할 판매처가 없습니다.</td></tr>',
      "    </tbody>",
      "  </table>",
      "</div>",
    ].join("");
  }

  function buildCourierTableHtml(groups) {
    const rows = (Array.isArray(groups) ? groups : []).map((group, index) => {
      const detailId = "tm-unshipped-courier-detail-" + index;
      return [
        '<tr class="tm-unshipped-checker__row" data-group="courier">',
        '  <td data-tm-align="left"><button type="button" class="tm-unshipped-checker__toggle" data-action="toggle-detail" data-detail-id="' + detailId + '" aria-expanded="false"><span class="tm-unshipped-checker__chevron" aria-hidden="true"></span><span class="tm-unshipped-checker__toggle-label">' + escapeHtml(group.courier) + "</span></button></td>",
        '  <td data-tm-align="center" class="tm-unshipped-checker__count-cell"><span class="tm-ui-badge">' + escapeHtml(group.count) + "건</span></td>",
        "</tr>",
        '<tr id="' + detailId + '" class="tm-unshipped-checker__detail" hidden><td colspan="2">' + buildNestedSiteTableHtml(group.sites, "tm-unshipped-courier-" + index) + "</td></tr>",
      ].join("");
    }).join("");
    return [
      '<div class="tm-ui-scroll tm-unshipped-checker__table-wrap">',
      '  <table class="tm-ui-table">',
      "    <thead><tr><th data-tm-align=\"left\">택배사</th><th data-tm-align=\"center\">총 미출고 건수</th></tr></thead>",
      "    <tbody>",
      rows || '<tr><td colspan="2" class="tm-ui-empty">조회된 미출고 데이터가 없습니다.</td></tr>',
      "    </tbody>",
      "  </table>",
      "</div>",
    ].join("");
  }

  function buildPopupShellHtml(dateRange) {
    const moduleUi = getModuleUi(root);
    const rootAttrs = moduleUi
      ? moduleUi.buildRootAttributes({ kind: "popup", className: "tm-unshipped-checker", density: "compact" })
      : 'class="tm-unshipped-checker"';
    const summary = buildSummaryHtml({ totalCount: 0, siteGroupCount: 0, courierGroupCount: 0 });
    return [
      '<div ' + rootAttrs + '>',
      '  <div class="tm-ui-shell tm-unshipped-checker__shell">',
      '    <section class="tm-ui-card tm-unshipped-checker__card">',
      '      <div class="tm-ui-panel-head">',
      '        <div class="tm-ui-head-meta">',
      "          <div>",
      '            <p class="tm-ui-kicker">Operations</p>',
      '            <h1 class="tm-ui-title">미출고 현황</h1>',
      '            <p class="tm-ui-subtitle">최근 3개월 미출고 주문을 판매처와 택배사 기준으로 묶어서 확인합니다.</p>',
      "          </div>",
      '          <div class="tm-unshipped-checker__head-actions">',
      '            <span class="tm-ui-badge tm-unshipped-checker__range" id="tm-unshipped-range">' + escapeHtml(dateRange.from) + " ~ " + escapeHtml(dateRange.to) + "</span>",
      '            <button type="button" class="tm-ui-btn tm-ui-btn--primary" id="tm-unshipped-refresh">새로 고침</button>',
      "          </div>",
      "        </div>",
      "      </div>",
      '      <div class="tm-unshipped-checker__content tm-ui-stack">',
      '        <div id="tm-unshipped-status" class="tm-ui-statusbar"><span class="tm-ui-inline-note">조회 상태</span><span class="tm-ui-badge">준비됨</span></div>',
      '        <div id="tm-unshipped-summary" class="tm-ui-kpis">' + summary + "</div>",
      '        <div id="tm-unshipped-tabs" class="tm-unshipped-checker__tabs">',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--secondary tm-unshipped-checker__tab is-active" data-tab="site">판매처별</button>',
      '          <button type="button" class="tm-ui-btn tm-ui-btn--secondary tm-unshipped-checker__tab" data-tab="courier">택배사별</button>',
      "        </div>",
      '        <div id="tm-unshipped-panel-site" class="tm-unshipped-checker__panel"></div>',
      '        <div id="tm-unshipped-panel-courier" class="tm-unshipped-checker__panel" hidden></div>',
      "      </div>",
      "    </section>",
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
      ".tm-unshipped-checker{background:#f4f6f6;min-height:100vh}",
      ".tm-unshipped-checker__shell{padding:18px;max-width:1120px;margin:0 auto}",
      ".tm-unshipped-checker__card{overflow:hidden}",
      ".tm-unshipped-checker__content{padding:14px 16px 16px}",
      ".tm-unshipped-checker__head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      "#tm-unshipped-status,#tm-unshipped-summary,#tm-unshipped-tabs,.tm-unshipped-checker__panel{max-width:980px}",
      "#tm-unshipped-summary{grid-template-columns:repeat(auto-fit,minmax(220px,280px));justify-content:start}",
      ".tm-unshipped-checker__tabs{display:flex;gap:8px;flex-wrap:wrap}",
      ".tm-unshipped-checker__tab{background:#fff;color:var(--tm-primary-strong);border-color:var(--tm-border)}",
      ".tm-unshipped-checker__tab.is-active{background:var(--tm-accent-wash);color:#fff;border-color:var(--tm-primary-strong)}",
      ".tm-unshipped-checker__panel{display:grid;gap:12px}",
      ".tm-unshipped-checker__table-wrap{max-width:980px;width:100%;justify-self:start}",
      ".tm-unshipped-checker__table-wrap .tm-ui-table{table-layout:fixed}",
      ".tm-unshipped-checker__table-wrap .tm-ui-table th:last-child,.tm-unshipped-checker__table-wrap .tm-ui-table td:last-child{width:120px}",
      ".tm-unshipped-checker__row td{vertical-align:middle;padding:10px 12px}",
      ".tm-unshipped-checker__toggle{display:inline-flex;align-items:center;gap:10px;max-width:min(100%,720px);padding:10px 14px;background:var(--tm-surface-alt);border:1px solid var(--tm-border);border-radius:14px;box-shadow:none;color:var(--tm-text);text-align:left;font-weight:700;min-height:0}",
      ".tm-unshipped-checker__toggle:hover{transform:none;color:var(--tm-primary-strong);background:#fff}",
      ".tm-unshipped-checker__toggle-label{display:block;min-width:0;white-space:normal;word-break:break-word;line-height:1.35}",
      ".tm-unshipped-checker__chevron{display:inline-flex;width:16px;justify-content:center;transition:transform .16s ease}",
      ".tm-unshipped-checker__toggle[aria-expanded='true'] .tm-unshipped-checker__chevron{transform:rotate(90deg)}",
      ".tm-unshipped-checker__chevron::before{content:'▸';font-size:11px}",
      ".tm-unshipped-checker__count-cell{width:120px}",
      ".tm-unshipped-checker__detail td{padding:0;border-bottom:1px solid var(--tm-border);background:rgba(84,96,103,.02)}",
      ".tm-unshipped-checker__nested{padding:10px 12px 12px 22px}",
      ".tm-unshipped-checker__nested .tm-ui-table{width:auto;min-width:420px;max-width:760px;border:1px solid var(--tm-border);border-radius:10px;overflow:hidden}",
      ".tm-unshipped-checker__nested .tm-ui-table th,.tm-unshipped-checker__nested .tm-ui-table td{padding:7px 8px}",
      ".tm-unshipped-checker__row--nested td:first-child{padding-left:12px}",
      "@media (max-width: 768px){.tm-unshipped-checker__shell{padding:10px}.tm-unshipped-checker__content{padding:12px}.tm-unshipped-checker__head-actions{width:100%}.tm-unshipped-checker__head-actions > *{width:100%}.tm-unshipped-checker__tabs{display:grid;grid-template-columns:1fr 1fr}.tm-unshipped-checker__table-wrap,.tm-unshipped-checker__panel,#tm-unshipped-summary,#tm-unshipped-status,#tm-unshipped-tabs{max-width:none}.tm-unshipped-checker__toggle{max-width:100%}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function setStatus(popupState, text, kind) {
    const doc = popupState && popupState.popupWin && popupState.popupWin.document;
    const status = doc && doc.getElementById("tm-unshipped-status");
    if (!status) return;
    const badgeClass = kind === "error"
      ? "tm-ui-badge tm-ui-badge--danger"
      : kind === "success"
        ? "tm-ui-badge tm-ui-badge--success"
        : "tm-ui-badge";
    status.innerHTML = '<span class="tm-ui-inline-note">조회 상태</span><span class="' + badgeClass + '">' + escapeHtml(text) + "</span>";
  }

  function setRefreshing(popupState, refreshing) {
    const doc = popupState && popupState.popupWin && popupState.popupWin.document;
    const button = doc && doc.getElementById("tm-unshipped-refresh");
    if (!button) return;
    button.disabled = !!refreshing;
    button.textContent = refreshing ? "조회 중..." : "새로 고침";
  }

  function renderDashboard(popupState) {
    const doc = popupState.popupWin.document;
    const siteGroups = groupBySite(popupState.rows);
    const courierGroups = groupByCourier(popupState.rows);
    const summary = summarizeGroups(popupState.rows, siteGroups, courierGroups);
    doc.getElementById("tm-unshipped-summary").innerHTML = buildSummaryHtml(summary);
    doc.getElementById("tm-unshipped-panel-site").innerHTML = buildSiteTableHtml(siteGroups);
    doc.getElementById("tm-unshipped-panel-courier").innerHTML = buildCourierTableHtml(courierGroups);
  }

  async function fetchUnshippedRows(win, popupState) {
    const scope = win || root;
    const dateRange = popupState.dateRange;
    let allRows = [];
    let page = 1;
    let totalPages = 1;
    do {
      setStatus(popupState, "데이터 조회 중... " + page + " / " + totalPages + "페이지", "neutral");
      const response = await scope.fetch(buildDataUrl(dateRange.from, dateRange.to, page, Date.now()), {
        credentials: "include",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      const rows = Array.isArray(json && json.rows) ? json.rows : [];
      if (page === 1) totalPages = Math.max(1, Number(json && json.totalpages) || 1);
      allRows = allRows.concat(rows);
      page += 1;
      if (page <= totalPages) await sleep(scope, INTER_PAGE_DELAY_MS);
    } while (page <= totalPages);
    return allRows;
  }

  async function refreshDashboard(popupState) {
    if (!popupState || popupState.refreshing) return;
    popupState.refreshing = true;
    setRefreshing(popupState, true);
    try {
      const rows = await fetchUnshippedRows(popupState.pageWin, popupState);
      popupState.rows = rows;
      renderDashboard(popupState);
      setStatus(popupState, "조회 완료 · 총 " + rows.length + "건", "success");
    } catch (error) {
      setStatus(popupState, "조회 실패 · " + (error && error.message ? error.message : "알 수 없는 오류"), "error");
      if (popupState.pageWin.console && typeof popupState.pageWin.console.error === "function") {
        popupState.pageWin.console.error("[미출고 건수 체커] 데이터 조회 실패", error);
      }
    } finally {
      popupState.refreshing = false;
      setRefreshing(popupState, false);
    }
  }

  function openTab(popupState, tab) {
    const doc = popupState.popupWin.document;
    Array.prototype.forEach.call(doc.querySelectorAll("#tm-unshipped-tabs [data-tab]"), (button) => {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === tab);
    });
    const sitePanel = doc.getElementById("tm-unshipped-panel-site");
    const courierPanel = doc.getElementById("tm-unshipped-panel-courier");
    sitePanel.hidden = tab !== "site";
    courierPanel.hidden = tab !== "courier";
  }

  function toggleDetail(doc, button) {
    const detailId = button && button.getAttribute("data-detail-id");
    if (!detailId) return;
    const detailRow = doc.getElementById(detailId);
    if (!detailRow) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", expanded ? "false" : "true");
    detailRow.hidden = expanded;
  }

  function bindPopupEvents(popupState) {
    const popupWin = popupState.popupWin;
    const doc = popupWin.document;
    doc.getElementById("tm-unshipped-refresh").addEventListener("click", () => {
      void refreshDashboard(popupState);
    });
    doc.getElementById("tm-unshipped-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tab]");
      if (!button) return;
      openTab(popupState, button.getAttribute("data-tab"));
    });
    doc.body.addEventListener("click", (event) => {
      const toggle = event.target.closest("button[data-action='toggle-detail']");
      if (!toggle) return;
      toggleDetail(doc, toggle);
    });
    popupWin.addEventListener("beforeunload", () => {
      popupState.pageState.popupWin = null;
      popupState.pageState.popupState = null;
    });
  }

  function createPopupState(pageWin, popupWin, pageState) {
    return {
      pageWin,
      popupWin,
      pageState,
      rows: [],
      dateRange: createDateRange(),
      refreshing: false,
    };
  }

  function renderPopupShell(popupState) {
    const popupWin = popupState.popupWin;
    const doc = popupWin.document;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>미출고 현황</title></head><body></body></html>");
    doc.close();
    ensureStyles(doc);
    doc.body.innerHTML = buildPopupShellHtml(popupState.dateRange);
    openTab(popupState, "site");
  }

  function openDashboard(pageWin, pageState) {
    if (pageState.popupWin && !pageState.popupWin.closed) {
      pageState.popupWin.focus();
      return;
    }
    const popupWin = pageWin.open("", POPUP_NAME, POPUP_FEATURES);
    if (!popupWin) return;
    const popupState = createPopupState(pageWin, popupWin, pageState);
    pageState.popupWin = popupWin;
    pageState.popupState = popupState;
    renderPopupShell(popupState);
    bindPopupEvents(popupState);
    popupWin.focus();
    void refreshDashboard(popupState);
  }

  function getPageState(win) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        popupWin: null,
        popupState: null,
        navInstall: null,
      };
    }
    return scope[STATE_KEY];
  }

  function shouldRun(win) {
    return /^https:\/\/www\.ebut3pl\.co\.kr\//i.test(String(win && win.location && win.location.href || ""));
  }

  function start(win) {
    const scope = win || root;
    if (!shouldRun(scope)) return;
    const pageState = getPageState(scope);
    if (pageState.navInstall) return;
    const navMenu = getNavMenu(scope);
    if (!navMenu || typeof navMenu.installNavButton !== "function") return;
    pageState.navInstall = navMenu.installNavButton(scope, {
      buttonId: NAV_BUTTON_ID,
      label: NAV_BUTTON_LABEL,
      insertBeforeLabel: NAV_INSERT_BEFORE_LABEL,
      onClick() {
        openDashboard(scope, pageState);
      },
    });
  }

  function run(context) {
    const win = context && context.window ? context.window : root;
    start(win);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    shiftMonthsClamped,
    createDateRange,
    buildDataUrl,
    groupBySite,
    groupByCourier,
    summarizeGroups,
    buildSiteTableHtml,
    buildCourierTableHtml,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);



