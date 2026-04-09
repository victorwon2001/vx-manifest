const test = require("node:test");
const assert = require("node:assert/strict");

const moduleUnderTest = require("../modules/oms-otp-receiver/main.js");
const meta = require("../modules/oms-otp-receiver/meta.json");
const registry = require("../config/registry.json");

test("oms otp receiver exports loader contract", () => {
  assert.equal(moduleUnderTest.id, "oms-otp-receiver");
  assert.equal(moduleUnderTest.name, meta.name);
  assert.equal(moduleUnderTest.version, meta.version);
  assert.equal(typeof moduleUnderTest.run, "function");
});

test("oms otp receiver shouldRun matches oms login pages", () => {
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/login.do" } }), true);
  assert.equal(moduleUnderTest.shouldRun({ location: { href: "https://oms.bstage.systems/stan/main.do" } }), false);
});

test("oms otp receiver extracts only exact six-digit otp codes", () => {
  assert.equal(moduleUnderTest.extractOtpCode("인증번호는 123456 입니다."), "123456");
  assert.equal(moduleUnderTest.extractOtpCode("코드 없음"), "");
  assert.equal(moduleUnderTest.extractOtpCode("12345 1234567"), "");
});

test("oms otp receiver websocket url stays pinned to the configured topic", () => {
  assert.equal(moduleUnderTest.WS_URL, "wss://ntfy.sh/otp-secret-victor-2026-factory/ws");
});

test("oms otp receiver registry and meta stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "oms-otp-receiver");
  assert.ok(script);
  assert.equal(script.name, meta.name);
  assert.equal(script.metaPath, "modules/oms-otp-receiver/meta.json");
  assert.equal(meta.entry, "modules/oms-otp-receiver/main.js");
  assert.deepEqual(meta.dependencies || [], []);
});
