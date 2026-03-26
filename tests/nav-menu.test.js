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
  assert.equal(typeof navMenu.resolveNavTargetWindow, "function");
  assert.equal(typeof navMenu.ensureNavButton, "function");
  assert.equal(typeof navMenu.installNavButton, "function");
});

test("nav menu resolves the window that actually owns the navigation container", () => {
  const navMenuElement = { querySelectorAll() { return []; } };
  const frameDoc = {
    querySelector(selector) {
      return selector === ".nav.navbar-nav.navbar-right" ? navMenuElement : null;
    },
  };
  const otherDoc = {
    querySelector() { return null; },
  };
  const childWithNav = { document: frameDoc, frames: [], location: { href: "https://www.ebut3pl.co.kr/jsp/header.jsp" } };
  const childWithoutNav = { document: otherDoc, frames: [], location: { href: "https://www.ebut3pl.co.kr/jsp/body.jsp" } };
  const topWin = {
    document: otherDoc,
    frames: [childWithoutNav, childWithNav],
    location: { href: "https://www.ebut3pl.co.kr/home" },
  };
  const scope = {
    document: otherDoc,
    frames: [],
    top: topWin,
    location: { href: "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp" },
  };

  const resolved = navMenu.resolveNavTargetWindow(scope, { navSelector: ".nav.navbar-nav.navbar-right" });

  assert.equal(resolved.win, childWithNav);
  assert.equal(resolved.navMenu, navMenuElement);
});
