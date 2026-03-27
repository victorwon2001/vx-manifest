const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/unshipped-checker/main.js");
const meta = require("../modules/unshipped-checker/meta.json");
const registry = require("../config/registry.json");

test("unshipped checker exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "unshipped-checker");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("unshipped checker date range covers the latest three months", () => {
  const range = moduleUnderTest.createDateRange(new Date("2026-03-24T09:00:00+09:00"));
  assert.deepEqual(range, {
    from: "2025-12-24",
    to: "2026-03-24",
  });
});

test("unshipped checker clamps month-end ranges without skipping trailing days", () => {
  assert.equal(
    moduleUnderTest.shiftMonthsClamped(new Date("2026-05-31T09:00:00+09:00"), -3).toISOString().slice(0, 10),
    "2026-02-28"
  );
  assert.equal(
    moduleUnderTest.shiftMonthsClamped(new Date("2026-12-31T09:00:00+09:00"), -3).toISOString().slice(0, 10),
    "2026-09-30"
  );
});

test("unshipped checker data url keeps expected query shape", () => {
  const url = moduleUnderTest.buildDataUrl("2025-12-24", "2026-03-24", 3, 123456);

  assert.match(url, /site210main_jdata/);
  assert.match(url, /DATE1=2025-12-24/);
  assert.match(url, /DATE2=2026-03-24/);
  assert.match(url, /rows=500/);
  assert.match(url, /page=3/);
  assert.match(url, /nd=123456/);
});

test("unshipped checker groups rows by site and courier", () => {
  const groups = moduleUnderTest.groupBySite([
    { site_name: "스마트스토어", ordlist_dofc: "CJ", ordlist_no1: "1001", ordlist_dno: "INV-1" },
    { site_name: "스마트스토어", ordlist_dofc: "CJ", ordlist_no1: "1002", ordlist_dno: "INV-2" },
    { site_name: "쿠팡", ordlist_dofc: "한진", ordlist_no1: "1003", ordlist_dno: "INV-3" },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].site, "스마트스토어");
  assert.equal(groups[0].courier, "CJ");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].orders.map((item) => item.orderNo), ["1001", "1002"]);
});

test("unshipped checker groups rows by courier with nested sites", () => {
  const groups = moduleUnderTest.groupByCourier([
    { site_name: "스마트스토어", ordlist_dofc: "CJ", ordlist_no1: "1001", ordlist_dno: "INV-1" },
    { site_name: "쿠팡", ordlist_dofc: "CJ", ordlist_no1: "1002", ordlist_dno: "INV-2" },
    { site_name: "쿠팡", ordlist_dofc: "한진", ordlist_no1: "1003", ordlist_dno: "INV-3" },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].courier, "CJ");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].sites.map((item) => item.site), ["스마트스토어", "쿠팡"]);
  assert.equal(groups[1].courier, "한진");
});

test("unshipped checker summary reflects grouped counts", () => {
  const rows = [
    { site_name: "A", ordlist_dofc: "CJ" },
    { site_name: "A", ordlist_dofc: "CJ" },
    { site_name: "B", ordlist_dofc: "한진" },
  ];
  const siteGroups = moduleUnderTest.groupBySite(rows);
  const courierGroups = moduleUnderTest.groupByCourier(rows);
  const summary = moduleUnderTest.summarizeGroups(rows, siteGroups, courierGroups);

  assert.deepEqual(summary, {
    totalCount: 3,
    siteGroupCount: 2,
    courierGroupCount: 2,
  });
});

test("unshipped checker site table html keeps compact toggle and fixed count column", () => {
  const html = moduleUnderTest.buildSiteTableHtml([
    { site: "STORE", courier: "CJ", count: 12, orders: [{ orderNo: "1001", invoiceNo: "INV-1" }] },
  ]);

  assert.match(html, /tm-unshipped-checker__table-wrap/);
  assert.match(html, /data-action="open-detail"/);
  assert.match(html, /tm-unshipped-checker__detail-link/);
  assert.match(html, /tm-unshipped-checker__count-cell/);
});

test("unshipped checker courier table html uses the same compact table wrapper", () => {
  const html = moduleUnderTest.buildCourierTableHtml([
    { courier: "CJ", count: 12, sites: [{ site: "STORE", count: 12, orders: [{ orderNo: "1001", invoiceNo: "INV-1" }] }] },
  ]);

  assert.match(html, /tm-unshipped-checker__table-wrap/);
  assert.match(html, /data-group-type="courier"/);
  assert.match(html, /tm-unshipped-checker__count-cell/);
});

test("unshipped checker detail window html renders order tables for site and courier views", () => {
  const siteHtml = moduleUnderTest.buildDetailWindowHtml({
    title: "STORE - CJ",
    subtitle: "판매처와 택배사 기준 상세 주문 목록",
    summaryLabel: "2건",
    showSite: false,
    orders: [{ orderNo: "1001", invoiceNo: "INV-1" }],
  });
  const courierHtml = moduleUnderTest.buildDetailWindowHtml({
    title: "CJ",
    subtitle: "택배사 기준 판매처별 상세 주문 목록",
    summaryLabel: "2건",
    showSite: true,
    orders: [{ site: "STORE", orderNo: "1001", invoiceNo: "INV-1" }],
  });

  assert.match(siteHtml, /STORE - CJ/);
  assert.doesNotMatch(siteHtml, /<th[^>]*>판매처<\/th>/);
  assert.match(courierHtml, /<th[^>]*>판매처<\/th>/);
  assert.match(courierHtml, /INV-1/);
});

test("unshipped checker registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "unshipped-checker");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/unshipped-checker/meta.json");
  assert.equal(meta.entry, "modules/unshipped-checker/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id).sort();
  assert.deepEqual(dependencyIds, ["module-ui", "nav-menu"]);
});
