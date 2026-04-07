const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/header-copy-helper/main.js");
const meta = require("../modules/header-copy-helper/meta.json");
const registry = require("../config/registry.json");

function createStandardRow(values) {
  return {
    hidden: false,
    style: { display: "" },
    cells: values.map((value) => ({ textContent: value, title: value })),
  };
}

function createJqGridRow(map) {
  return {
    hidden: false,
    style: { display: "" },
    querySelector(selector) {
      const match = /aria-describedby="([^"]+)"/.exec(selector);
      if (!match) return null;
      const value = map[match[1]];
      return value == null ? null : { textContent: value, title: value };
    },
  };
}

test("header copy helper exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "header-copy-helper");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("header copy helper shouldRun matches all ebut pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/home" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://www.ebut3pl.co.kr/jsp/stm/stm410main4.jsp" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://example.com/" } }), false);
});

test("header copy helper normalizes blank values into non-breaking space", () => {
  assert.equal(moduleUnderTest.normalizeCellValue(""), moduleUnderTest.BLANK_VALUE);
  assert.equal(moduleUnderTest.normalizeCellValue("   "), moduleUnderTest.BLANK_VALUE);
  assert.equal(moduleUnderTest.normalizeCellValue("사과"), "사과");
});

test("header copy helper dedupe preserves order", () => {
  assert.deepEqual(
    moduleUnderTest.buildValueList(["A", "B", "A", "C", "B"], true),
    ["A", "B", "C"]
  );
});

test("header copy helper extracts jqGrid column values from visible rows", () => {
  const rows = [
    createJqGridRow({ gridList_basic_name: "사과" }),
    createJqGridRow({ gridList_basic_name: "" }),
    createJqGridRow({ gridList_basic_name: "배" }),
  ];

  assert.deepEqual(
    moduleUnderTest.extractJqGridColumnValuesFromRows(rows, "gridList_basic_name"),
    ["사과", moduleUnderTest.BLANK_VALUE, "배"]
  );
});

test("header copy helper extracts standard table column values by index", () => {
  const rows = [
    createStandardRow(["A-01", "사과", "10"]),
    createStandardRow(["A-02", "", "20"]),
  ];

  assert.deepEqual(
    moduleUnderTest.extractStandardColumnValuesFromRows(rows, 1),
    ["사과", moduleUnderTest.BLANK_VALUE]
  );
});

test("header copy helper builds preview rows with centered columns", () => {
  const html = moduleUnderTest.buildRowsHtml(["사과", "배"]);

  assert.match(html, /data-tm-align="center">사과/);
  assert.match(html, /data-tm-align="center">배/);
  assert.doesNotMatch(html, />1<\/td>/);
});

test("header copy helper clipboard text preserves blank rows for spreadsheet paste", () => {
  const text = moduleUnderTest.buildClipboardText(["사과", moduleUnderTest.BLANK_VALUE, "배"]);
  assert.equal(text, ["사과", moduleUnderTest.BLANK_VALUE, "배"].join("\n"));
});

test("header copy helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "header-copy-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/header-copy-helper/meta.json");
  assert.equal(meta.entry, "modules/header-copy-helper/main.js");
  assert.deepEqual((meta.dependencies || []).map((item) => item.id), ["module-ui"]);
});
