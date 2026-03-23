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

const moduleA = require(resolveRepoPath(["../modules/module-a/main.js"]));

test("module-a toolbar html uses compact embedded shared ui classes", () => {
  const html = moduleA.buildToolbarHtml();

  assert.match(html, /tm-ui-root tm-ui-embedded/);
  assert.match(html, /data-tm-density=['"]compact['"]/);
  assert.match(html, /tm-ui-toolbar/);
  assert.match(html, /tm-ui-btn/);
  assert.match(html, /tm-ui-input/);
  assert.match(html, /송장출력\(스캔\) 필터링/);
});

test("module-a modal html uses the shared overlay and modal contract", () => {
  const html = moduleA.buildModalShellHtml();

  assert.match(html, /tm-ui-overlay/);
  assert.match(html, /tm-ui-modal/);
  assert.match(html, /tm-ui-modal__head/);
  assert.match(html, /tm-ui-modal__body/);
});
