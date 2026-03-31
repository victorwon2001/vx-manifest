const test = require("node:test");
const assert = require("node:assert/strict");
const moduleUnderTest = require("../modules/inbound-data-viewer/main.js");
const meta = require("../modules/inbound-data-viewer/meta.json");
const registry = require("../config/registry.json");

test("inbound data viewer exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "inbound-data-viewer");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("inbound data viewer formatDate compacts yyyy-mm-dd text", () => {
  assert.equal(moduleUnderTest.formatDate("2026-03-24 10:15:00"), "20260324");
  assert.equal(moduleUnderTest.formatDate(""), "-");
});

test("inbound data viewer table rows keep only product name left-aligned", () => {
  const html = moduleUnderTest.buildTableBodyHtml([{
    date: "20260324",
    site: "브랜드코리아",
    nicn: "테스트관리명",
    name: "테스트상품명",
    quantity: "12",
  }]);

  assert.match(html, /data-tm-align="center">20260324/);
  assert.match(html, /data-tm-align="center">브랜드코리아/);
  assert.match(html, /data-tm-align="center">테스트관리명/);
  assert.match(html, /data-tm-align="left">테스트상품명/);
  assert.match(html, /data-tm-align="center">12/);
  assert.doesNotMatch(html, /data-tm-align="right"/);
});

test("inbound data viewer clipboard text includes site column before nicn", () => {
  const text = moduleUnderTest.buildClipboardText([{
    date: "20260324",
    site: "브랜드코리아",
    nicn: "테스트관리명",
    name: "테스트상품명",
    quantity: "12",
  }]);

  assert.match(text, /^입고일\t판매처\t관리명\t상품명\t입고수량/);
  assert.match(text, /20260324\t브랜드코리아\t테스트관리명\t테스트상품명\t12/);
});

test("inbound data viewer catalog query keeps the expected export parameters", () => {
  const query = moduleUnderTest.buildCatalogRequestQuery();
  assert.match(query, /BASIC_CUST=4603/);
  assert.match(query, /BASIC_NICN_YN=undefined/);
  assert.match(query, /BASIC_GBN=S/);
  assert.match(query, /formType=base100main_3/);
});

test("inbound data viewer catalog map matches nicn to the first remark value", () => {
  const siteMap = moduleUnderTest.buildCatalogSiteMap([
    ["상품코드", "관리명", "비고"],
    ["A-1", "테스트 관리명", "브랜드코리아"],
    ["A-2", "테스트 관리명", "중복판매처"],
    ["A-3", "다른 관리명", "공식몰"],
  ]);

  assert.deepEqual(siteMap, {
    "테스트 관리명": "브랜드코리아",
    "다른 관리명": "공식몰",
  });
});

test("inbound data viewer applies valid site cache by exact nicn match", () => {
  const rows = moduleUnderTest.applySiteCache([{
    inoutstock_sysdate: "2026-03-24 10:15:00",
    basic_nicn: "테스트 관리명",
    basic_name: "테스트상품",
    inoutstock_inqty: 12,
  }], {
    "테스트 관리명": "브랜드코리아",
  });

  assert.equal(rows[0].site, "브랜드코리아");
  assert.equal(rows[0].nicn, "테스트 관리명");
});

test("inbound data viewer treats empty and null-like cache entries as misses", () => {
  const rows = [
    { nicn: "A", site: "-", date: "20260324", name: "상품A", quantity: "1" },
    { nicn: "B", site: "-", date: "20260324", name: "상품B", quantity: "1" },
    { nicn: "C", site: "-", date: "20260324", name: "상품C", quantity: "1" },
  ];
  const missing = moduleUnderTest.findMissingCatalogKeys(rows, {
    A: "",
    B: null,
    C: "브랜드코리아",
  });

  assert.deepEqual(missing, ["A", "B"]);
  assert.equal(moduleUnderTest.isValidSiteValue(""), false);
  assert.equal(moduleUnderTest.isValidSiteValue(null), false);
  assert.equal(moduleUnderTest.isValidSiteValue("undefined"), false);
  assert.equal(moduleUnderTest.isValidSiteValue("브랜드코리아"), true);
});

test("inbound data viewer mergeSiteCache keeps only valid values", () => {
  const merged = moduleUnderTest.mergeSiteCache({
    A: "브랜드코리아",
    B: "",
  }, {
    B: "공식몰",
    C: null,
  });

  assert.deepEqual(merged, {
    A: "브랜드코리아",
    B: "공식몰",
  });
});

test("inbound data viewer meta and registry stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "inbound-data-viewer");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/inbound-data-viewer/meta.json");
  assert.equal(meta.entry, "modules/inbound-data-viewer/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id);
  assert.deepEqual(dependencyIds, ["module-ui", "xlsx"]);
});
