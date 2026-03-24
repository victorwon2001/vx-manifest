const test = require("node:test");
const assert = require("node:assert/strict");

const navMenu = require("../shared/nav-menu.js");

test("nav menu safeTrim collapses whitespace", () => {
  assert.equal(navMenu.safeTrim("  상담   전용창 "), "상담 전용창");
});

test("nav menu findTargetItem matches by contained text", () => {
  const items = [
    { textContent: "알림" },
    { textContent: "상담전용창" },
    { textContent: "메모" },
  ];

  assert.equal(navMenu.findTargetItem(items, "상담전용창"), items[1]);
  assert.equal(navMenu.findTargetItem(items, "없는메뉴"), null);
});

test("nav menu exports shared installer helpers", () => {
  assert.equal(typeof navMenu.ensureNavButton, "function");
  assert.equal(typeof navMenu.installNavButton, "function");
});
