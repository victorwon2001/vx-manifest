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
const moduleSource = fs.readFileSync(resolveRepoPath(["../modules/module-a/main.js"]), "utf8");

test("module-a toolbar html uses compact embedded shared ui classes", () => {
  const html = moduleA.buildToolbarHtml();

  assert.match(html, /tm-ui-root tm-ui-embedded/);
  assert.match(html, /data-tm-density=['"]compact['"]/);
  assert.match(html, /tm-ui-panel-head/);
  assert.match(html, /tm-ui-kicker/);
  assert.match(html, /tm-ui-btn/);
  assert.match(html, /tm-ui-input/);
  assert.match(html, /송장출력\(스캔\) 필터링/);
  assert.match(html, /tm-module-a-batch-panel/);
  assert.match(html, /차수 표/);
});

test("module-a modal html uses the shared overlay and modal contract", () => {
  const html = moduleA.buildModalShellHtml();

  assert.match(html, /tm-ui-root tm-ui-panel tm-ui-overlay/);
  assert.match(html, /data-tm-density=['"]compact['"]/);
  assert.match(html, /tm-ui-overlay/);
  assert.match(html, /tm-ui-modal/);
  assert.match(html, /tm-ui-modal__head/);
  assert.match(html, /tm-ui-modal__body/);
});

test("module-a modal open state keeps shared modal classes intact", () => {
  assert.match(moduleSource, /modalBackdrop\.classList\.toggle\("tm-open", open\)/);
  assert.doesNotMatch(moduleSource, /modalBackdrop\.className\s*=\s*open\s*\?\s*"tm-open"\s*:\s*""/);
});

test("resolveBinaryRequestTransport prefers fetch when GM_xmlhttpRequest is unavailable", () => {
  const scope = {
    fetch() {},
  };

  const transport = moduleA.resolveBinaryRequestTransport(scope);

  assert.deepEqual(transport && transport.kind, "fetch");
  assert.equal(typeof transport.request, "function");
});

test("gmRequest falls back to fetch and returns binary-compatible response shape", async () => {
  const buffer = new TextEncoder().encode("ok").buffer;
  const calledUrls = [];
  const scope = {
    fetch: async (url) => {
      calledUrls.push(url);
      return ({
      status: 200,
      headers: {
        forEach(callback) {
          callback("application/octet-stream", "content-type");
          callback("attachment; filename=test.xls", "content-disposition");
        },
      },
      arrayBuffer: async () => buffer,
      });
    },
  };

  const response = await moduleA.gmRequest({
    method: "GET",
    url: "https://example.com/file.xls",
    fetchUrl: "/util/ExlForm_DB3?ORDLIST_IVNO=12",
    headers: { Accept: "application/octet-stream" },
  }, scope);

  assert.deepEqual(calledUrls, ["/util/ExlForm_DB3?ORDLIST_IVNO=12"]);
  assert.equal(response.status, 200);
  assert.match(response.responseHeaders, /content-type: application\/octet-stream/i);
  assert.equal(response.response.byteLength, 2);
});
