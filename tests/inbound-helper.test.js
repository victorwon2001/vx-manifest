const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/inbound-helper/main.js");
const meta = require("../modules/inbound-helper/meta.json");
const registry = require("../config/registry.json");

function makeRow(rowSeq, code, remainingQty, pageNumber, rowOrder, locations) {
  return {
    rowSeq: String(rowSeq),
    codeTokens: [code],
    remainingQty,
    receivedQty: 0,
    pageNumber,
    rowOrder,
    locationOptions: (locations || []).map((value) => ({
      value,
      text: value,
      normalizedText: String(value).toLowerCase(),
    })),
  };
}

test("inbound helper exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "inbound-helper");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(Array.isArray(moduleUnderTest.matches), true);
  assert.equal(typeof moduleUnderTest.run, "function");
  assert.equal(typeof moduleUnderTest.start, "function");
});

test("parseLine supports tabs and optional location", () => {
  assert.deepEqual(moduleUnderTest.parseLine("ABC-123\t10\tS35-01"), {
    code: "ABC-123",
    qty: 10,
    loc: "S35-01",
  });
  assert.deepEqual(moduleUnderTest.parseLine("abc-123  5"), {
    code: "ABC-123",
    qty: 5,
    loc: "",
  });
  assert.equal(moduleUnderTest.parseLine(""), null);
});

test("buildBatchTasks merges duplicate codes when requested", () => {
  const tasks = moduleUnderTest.buildBatchTasks([
    "ABC-123\t10\tS35-01",
    "abc-123\t5\tS35-01",
    "XYZ-999\t3",
  ].join("\n"), true);

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], {
    id: "batch-1",
    mode: "batch",
    order: 0,
    code: "ABC-123",
    loc: "S35-01",
    qty: 15,
    remainingQty: 15,
    originalLine: "ABC-123\t10\tS35-01",
  });
});

test("buildSequentialTasks keeps each line independent", () => {
  const tasks = moduleUnderTest.buildSequentialTasks([
    "APPLE\t2\tA",
    "APPLE\t4\tB",
    "APPLE\t6\tC",
  ].join("\n"));

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].remainingQty, 2);
  assert.equal(tasks[1].loc, "B");
  assert.equal(tasks[2].qty, 6);
});

test("cycle planner fills smaller remaining rows first in batch mode", () => {
  const tasks = [{
    id: "batch-1",
    mode: "batch",
    order: 0,
    code: "APPLE",
    loc: "",
    qty: 7,
    remainingQty: 7,
    originalLine: "APPLE 7",
  }];
  const plan = moduleUnderTest.buildCycleAssignments(tasks, [
    makeRow("r1", "APPLE", 10, 1, 1),
    makeRow("r2", "APPLE", 5, 1, 0),
  ]);

  assert.deepEqual(plan.assignments.map((item) => [item.rowSeq, item.qty, item.overflowQty]), [
    ["r2", 5, 0],
    ["r1", 2, 0],
  ]);
});

test("cycle planner sends overflow to the last candidate row", () => {
  const tasks = [{
    id: "batch-1",
    mode: "batch",
    order: 0,
    code: "APPLE",
    loc: "",
    qty: 17,
    remainingQty: 17,
    originalLine: "APPLE 17",
  }];
  const plan = moduleUnderTest.buildCycleAssignments(tasks, [
    makeRow("r1", "APPLE", 5, 1, 0),
    makeRow("r2", "APPLE", 10, 1, 1),
  ]);

  assert.deepEqual(plan.assignments.map((item) => [item.rowSeq, item.qty, item.overflowQty]), [
    ["r1", 5, 0],
    ["r2", 12, 2],
  ]);
});

test("sequential planner splits one location line across row boundaries", () => {
  const tasks = [{
    id: "seq-1",
    mode: "seq",
    order: 0,
    code: "APPLE",
    loc: "A",
    qty: 8,
    remainingQty: 8,
    originalLine: "APPLE 8 A",
  }];
  const plan = moduleUnderTest.buildCycleAssignments(tasks, [
    makeRow("r1", "APPLE", 5, 1, 0, ["A"]),
    makeRow("r2", "APPLE", 10, 2, 0, ["A"]),
  ]);

  assert.deepEqual(plan.assignments.map((item) => [item.rowSeq, item.qty]), [
    ["r1", 5],
    ["r2", 3],
  ]);
});

test("sequential planner uses one row per cycle across multiple location lines", () => {
  const tasks = moduleUnderTest.buildSequentialTasks([
    "APPLE\t2\tA",
    "APPLE\t4\tB",
    "APPLE\t6\tC",
  ].join("\n"));
  const plan = moduleUnderTest.buildCycleAssignments(tasks, [
    makeRow("r1", "APPLE", 5, 1, 0, ["A", "B", "C"]),
    makeRow("r2", "APPLE", 10, 1, 1, ["A", "B", "C"]),
  ]);

  assert.deepEqual(plan.assignments.map((item) => [item.taskId, item.rowSeq, item.qty]), [
    ["seq-1", "r1", 2],
    ["seq-2", "r2", 4],
  ]);
});

test("planner reports missing location separately from missing candidate rows", () => {
  const tasks = [{
    id: "seq-1",
    mode: "seq",
    order: 0,
    code: "APPLE",
    loc: "Z-01",
    qty: 2,
    remainingQty: 2,
    originalLine: "APPLE 2 Z-01",
  }, {
    id: "seq-2",
    mode: "seq",
    order: 1,
    code: "PEAR",
    loc: "",
    qty: 1,
    remainingQty: 1,
    originalLine: "PEAR 1",
  }];
  const plan = moduleUnderTest.buildCycleAssignments(tasks, [
    makeRow("r1", "APPLE", 5, 1, 0, ["A-01"]),
  ]);

  assert.equal(plan.assignments.length, 0);
  assert.deepEqual(plan.stalled.map((item) => item.type), ["로케이션 없음", "후보 행 없음"]);
});

test("verifyPendingAssignments recognizes row disappearance as success", () => {
  const verification = moduleUnderTest.verifyPendingAssignments([{
    rowSeq: "r1",
    beforeRemainingQty: 5,
    beforeReceivedQty: 0,
    qty: 5,
  }], []);

  assert.equal(verification.succeeded.length, 1);
  assert.equal(verification.failed.length, 0);
});

test("verifyPendingAssignments detects missing save progress", () => {
  const verification = moduleUnderTest.verifyPendingAssignments([{
    rowSeq: "r1",
    beforeRemainingQty: 5,
    beforeReceivedQty: 0,
    qty: 5,
  }], [makeRow("r1", "APPLE", 5, 1, 0)]);

  assert.equal(verification.succeeded.length, 0);
  assert.equal(verification.failed.length, 1);
});

test("issue grouping builds readable final summary", () => {
  const summary = moduleUnderTest.buildIssueSummaryText([
    { type: "후보 행 없음", code: "APPLE", qty: 7, pageNumber: 0 },
    { type: "후보 행 없음", code: "APPLE", qty: 3, pageNumber: 0 },
    { type: "초과분 마지막 행 반영", code: "PEAR", qty: 2, pageNumber: 2 },
  ]);

  assert.match(summary, /후보 행 없음 \/ APPLE \/ 수량 10 \/ 2건/);
  assert.match(summary, /초과분 마지막 행 반영 \/ PEAR \/ 수량 2 \/ 페이지 2 \/ 1건/);
});

test("pager target uses zero-based page and block", () => {
  assert.deepEqual(moduleUnderTest.toPagerTarget(1), {
    pageNumber: 1,
    pageValue: "0",
    nowBlock: "0",
  });
  assert.deepEqual(moduleUnderTest.toPagerTarget(12), {
    pageNumber: 12,
    pageValue: "11",
    nowBlock: "1",
  });
});

test("inbound helper gui html uses shared panel contract", () => {
  const html = moduleUnderTest.buildGuiHtml({
    buildRootAttributes() {
      return 'class="tm-ui-root tm-ui-panel tm-inbound-helper" data-tm-density="compact"';
    },
  });

  assert.match(html, /id="tmInboundHelperDock"/);
  assert.match(html, /class="tm-ui-dock tm-inbound-helper__dock"/);
  assert.match(html, /id="tmInboundHelperToggle"[\s\S]*id="tmInboundHelperGui"/);
  assert.match(html, /class="tm-ui-dock__toggle tm-ui-btn tm-ui-btn--secondary"/);
  assert.match(html, /tm-ui-dock__panel tm-ui-root tm-ui-panel tm-inbound-helper/);
});

test("inbound helper registry and dependencies stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "inbound-helper");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/inbound-helper/meta.json");
  assert.equal(meta.entry, "modules/inbound-helper/main.js");
  const dependencyIds = (meta.dependencies || []).map((item) => item.id).sort();
  assert.deepEqual(dependencyIds, ["jquery", "module-ui"]);
});
