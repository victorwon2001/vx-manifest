const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function resolveRepoPath(candidates) {
  for (const candidate of candidates) {
    const fullPath = path.resolve(__dirname, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  throw new Error("path not found: " + candidates.join(", "));
}

const stockMoveAutomation = require(resolveRepoPath([
  "../modules/stock-move-automation/main.js",
]));
const source = fs.readFileSync(resolveRepoPath([
  "../modules/stock-move-automation/main.js",
]), "utf8");

test("parseMoveInput merges identical from/product/to rows", () => {
  const result = stockMoveAutomation.parseMoveInput([
    "S35-02-2-A\tO8800244293273\t216\ts35-17-1-b",
    "S35-02-2-A\tO8800244293273\t174\tS35-17-1-B",
    "S35-04-3-B\tO8800244293273\t10\t미지정",
  ].join("\n"));

  assert.deepEqual(result, [
    {
      fromLoc: "S35-02-2-A",
      productCode: "O8800244293273",
      qty: 390,
      toLoc: "S35-17-1-B",
    },
    {
      fromLoc: "S35-04-3-B",
      productCode: "O8800244293273",
      qty: 10,
      toLoc: "미지정",
    },
  ]);
});

test("buildValidationBuckets separates valid and problem items from cached search results", () => {
  const moveItems = [
    { fromLoc: "A-01", productCode: "P-1", qty: 5, toLoc: "B-01" },
    { fromLoc: "A-02", productCode: "P-2", qty: 7, toLoc: "B-02" },
    { fromLoc: "A-03", productCode: "P-3", qty: 2, toLoc: "B-03" },
  ];
  const searchCache = {
    "A-01": {
      rows: [
        {
          basic_nicn: "P-1",
          basic_name: "사과 5kg",
          loca_name: "A-01",
          locastock_qty: "8",
          locastock_loca_boptcode_edate: "SEQ-1",
        },
      ],
    },
    "A-02": {
      rows: [
        {
          basic_nicn: "P-2",
          basic_name: "배 5kg",
          loca_name: "A-02",
          locastock_qty: "3",
          locastock_loca_boptcode_edate: "SEQ-2",
        },
      ],
    },
    "A-03": { rows: [] },
  };

  const result = stockMoveAutomation.buildValidationBuckets(moveItems, searchCache);

  assert.equal(result.validItems.length, 1);
  assert.equal(result.validItems[0].seq, "SEQ-1");
  assert.equal(result.problemItems.length, 2);
  assert.equal(result.problemItems[0].errorType, "재고부족");
  assert.equal(result.problemItems[1].errorType, "검색실패");
});

test("groupItemsByTarget builds queue shape with destination grouping", () => {
  const result = stockMoveAutomation.groupItemsByTarget([
    { seq: "SEQ-1", qty: 5, toLoc: "B-01", fromLoc: "A-01", productCode: "P-1" },
    { seq: "SEQ-2", qty: 7, toLoc: "B-01", fromLoc: "A-02", productCode: "P-2" },
    { seq: "SEQ-3", qty: 3, toLoc: "B-02", fromLoc: "A-01", productCode: "P-3" },
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(result[0].seqs, ["SEQ-1", "SEQ-2"]);
  assert.equal(result[0].qtyMap["SEQ-2"], 7);
  assert.equal(result[1].toLoc, "B-02");
});

test("groupTaskItemsBySource keeps batch save units by origin location", () => {
  const task = {
    toLoc: "B-01",
    seqs: ["SEQ-1", "SEQ-2", "SEQ-3"],
    qtyMap: { "SEQ-1": 5, "SEQ-2": 7, "SEQ-3": 3 },
    infoMap: {
      "SEQ-1": { fromLoc: "A-01", productCode: "P-1" },
      "SEQ-2": { fromLoc: "A-01", productCode: "P-2" },
      "SEQ-3": { fromLoc: "A-02", productCode: "P-3" },
    },
  };

  const result = stockMoveAutomation.groupTaskItemsBySource(task);

  assert.equal(Object.keys(result).length, 2);
  assert.equal(result["A-01"].length, 2);
  assert.equal(result["A-02"][0].qty, 3);
});

test("matchTargetLocation matches regular and unspecified destinations", () => {
  const result1 = stockMoveAutomation.matchTargetLocation("S35-17-1-B", [
    { value: "1,2,3", text: "S35-17-1-B" },
  ]);
  const result2 = stockMoveAutomation.matchTargetLocation("미지정", [
    { value: "1,2,3", text: "무시" },
  ]);

  assert.deepEqual(result1, { value: "1,2,3", text: "S35-17-1-B" });
  assert.deepEqual(result2, { value: "1059,2244,210221", text: "미지정 (미지정-미지정)" });
});

test("buildBatchSavePayload serializes row and trailing blank fields", () => {
  const payload = stockMoveAutomation.buildBatchSavePayload({
    INOUTSTOCK_LOCA: "1,2,3",
    INOUTSTOCK_EDATE: "",
    seqs: "SEQ-1,SEQ-2,",
    rows: [
      {
        INOUTSTOCK_QTY: "5",
        INOUTSTOCK_FQTY: "0",
        INOUTSTOCK_BIGO: "",
        INOUTSTOCK_WAH_OLD: "W1",
        INOUTSTOCK_ZONE_OLD: "Z1",
        INOUTSTOCK_LOCA_OLD: "L1",
        INOUTSTOCK_EDATE_OLD: "",
        INOUTSTOCK_OPTCODE: "OPT1",
        INOUTSTOCK_BASIC: "BASIC1",
        INOUTSTOCK_PROV: "null",
        INOUTSTOCK_COST: "0",
        LOCASTOCK_QTY: "8",
      },
    ],
  });

  assert.match(payload, /INOUTSTOCK_LOCA=1%2C2%2C3/);
  assert.match(payload, /INOUTSTOCK_QTY=5/);
  assert.match(payload, /INOUTSTOCK_QTY=/);
  assert.match(payload, /seqs=SEQ-1%2CSEQ-2%2C/);
});

test("parseBatchFormDataFromHtml extracts destination and row fields", () => {
  const html = [
    "<html><body>",
    "<select name='INOUTSTOCK_LOCA'>",
    "<option value='1,2,3'>S35-17-1-B</option>",
    "</select>",
    "<input name='INOUTSTOCK_WAH_OLD' value='W1'>",
    "<input name='INOUTSTOCK_ZONE_OLD' value='Z1'>",
    "<input name='INOUTSTOCK_LOCA_OLD' value='L1'>",
    "<input name='INOUTSTOCK_EDATE_OLD' value=''>",
    "<input name='INOUTSTOCK_OPTCODE' value='OPT1'>",
    "<input name='INOUTSTOCK_BASIC' value='BASIC1'>",
    "<input name='INOUTSTOCK_PROV' value='null'>",
    "<input name='INOUTSTOCK_COST' value='0'>",
    "<input name='LOCASTOCK_QTY' value='8'>",
    "<input name='seqs' value='SEQ-1,'>",
    "</body></html>",
  ].join("");

  const result = stockMoveAutomation.parseBatchFormDataFromHtml(html, "S35-17-1-B", [
    { qty: 5, seq: "SEQ-1" },
  ]);

  assert.equal(result.INOUTSTOCK_LOCA, "1,2,3");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].INOUTSTOCK_QTY, "5");
  assert.equal(result.rows[0].INOUTSTOCK_WAH_OLD, "W1");
  assert.equal(result.seqs, "SEQ-1,");
});

test("evaluateSaveResponse handles JSON and HTML success fallbacks", () => {
  assert.deepEqual(
    stockMoveAutomation.evaluateSaveResponse('{"success":"true","msg":"완료"}', 200),
    { success: true, message: "완료" }
  );
  assert.deepEqual(
    stockMoveAutomation.evaluateSaveResponse("<html>정상 처리</html>", 200),
    { success: true, message: "완료" }
  );
  assert.deepEqual(
    stockMoveAutomation.evaluateSaveResponse('{"success":"false","msg":"오류"}', 200),
    { success: false, message: "오류" }
  );
});

test("detectPageMode distinguishes main, edit and home contexts", () => {
  assert.equal(
    stockMoveAutomation.detectPageMode("https://www.ebut3pl.co.kr/html/stm300main4.html", {}),
    "main"
  );
  assert.equal(
    stockMoveAutomation.detectPageMode("https://www.ebut3pl.co.kr/jsp/stm/stm300edit4.jsp", {}),
    "edit"
  );
  assert.equal(
    stockMoveAutomation.detectPageMode("https://www.ebut3pl.co.kr/home", {}),
    "home"
  );
});

test("reduceRunStats accumulates success and skip counts", () => {
  let state = stockMoveAutomation.reduceRunStats(undefined, { type: "start", total: 5, skip: 1 });
  state = stockMoveAutomation.reduceRunStats(state, { type: "success", count: 2 });
  state = stockMoveAutomation.reduceRunStats(state, { type: "skip", count: 1 });

  assert.deepEqual(state, {
    total: 5,
    success: 2,
    skip: 2,
  });
});

test("remote module exports loader contract and stock move helpers", () => {
  assert.equal(stockMoveAutomation.id, "stock-move-automation");
  assert.equal(Array.isArray(stockMoveAutomation.matches), true);
  assert.equal(typeof stockMoveAutomation.run, "function");
  assert.equal(typeof stockMoveAutomation.parseMoveInput, "function");
  assert.equal(typeof stockMoveAutomation.buildValidationBuckets, "function");
  assert.equal(typeof stockMoveAutomation.groupItemsByTarget, "function");
  assert.equal(typeof stockMoveAutomation.groupTaskItemsBySource, "function");
  assert.equal(typeof stockMoveAutomation.buildBatchSavePayload, "function");
  assert.equal(typeof stockMoveAutomation.parseBatchFormDataFromHtml, "function");
  assert.equal(typeof stockMoveAutomation.evaluateSaveResponse, "function");
  assert.equal(typeof stockMoveAutomation.detectPageMode, "function");
});

test("main gui html uses the shared panel and card classes", () => {
  const html = stockMoveAutomation.buildMainGuiHtml();

  assert.match(html, /id='stockMoveGuiDock'/);
  assert.match(html, /class='tm-ui-dock tm-stock-dock'/);
  assert.match(html, /id='toggleStockMoveGuiBtn'[\s\S]*id='stockMoveGuiContainer'/);
  assert.match(html, /class='tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary'/);
  assert.match(html, /class='tm-ui-dock__panel tm-ui-root tm-ui-panel/);
  assert.match(html, /data-tm-density='compact'/);
  assert.match(html, /tm-ui-card/);
  assert.match(html, /tm-stock-shell/);
  assert.match(html, /tm-ui-panel-head/);
  assert.match(html, /tm-ui-section-head/);
  assert.match(html, /tm-ui-textarea/);
  assert.match(html, /tm-ui-btn tm-ui-btn--success/);
  assert.match(html, /tm-ui-log/);
  assert.match(html, /tm-ui-dock__toggle-label tm-stock-toggle__label/);
  assert.match(html, /aria-pressed='false'/);
  assert.match(html, /aria-expanded='false'/);
});

test("edit gui html uses the shared panel and action classes", () => {
  const html = stockMoveAutomation.buildEditGuiHtml();

  assert.match(html, /id='stockMoveGuiDock'/);
  assert.match(html, /class='tm-ui-dock tm-stock-dock'/);
  assert.match(html, /id='toggleStockMoveGuiBtn'[\s\S]*id='stockMoveGuiContainer'/);
  assert.match(html, /class='tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary'/);
  assert.match(html, /class='tm-ui-dock__panel tm-ui-root tm-ui-panel/);
  assert.match(html, /data-tm-density='compact'/);
  assert.match(html, /tm-stock-shell/);
  assert.match(html, /tm-ui-panel-head/);
  assert.match(html, /tm-ui-section-head/);
  assert.match(html, /tm-ui-btn tm-ui-btn--danger/);
  assert.match(html, /tm-ui-log/);
  assert.match(html, /tm-stock-toggle__dot/);
});

test("stock move toggle stays inside shared dock instead of separate fixed offset", () => {
  assert.match(source, /const MODULE_DOCK_ID = "stockMoveGuiDock"/);
  assert.match(source, /button\.setAttribute\("aria-expanded", isOpen \? "true" : "false"\)/);
  assert.match(source, /#stockMoveGuiDock\{position:fixed;top:14px;right:14px;z-index:9999;display:grid;justify-items:end;gap:10px;pointer-events:none\}/);
  assert.match(source, /#toggleStockMoveGuiBtn\{display:inline-flex;align-items:center;gap:8px;min-height:38px/);
  assert.doesNotMatch(source, /#stockMoveGuiContainer\{position:fixed/);
});
