const test = require("node:test");
const assert = require("node:assert/strict");

const loader = require("../loader/loader.user.js");
const releaseLib = require("../tools/release-lib.js");
const site3217 = require("../scripts/site3217/main.js");

test("matchUrlPattern handles trailing wildcard", () => {
  assert.equal(
    loader.matchUrlPattern(
      "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp?foo=1",
      "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"
    ),
    true
  );
  assert.equal(
    loader.matchUrlPattern(
      "https://www.ebut3pl.co.kr/jsp/site/site320main.jsp",
      "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"
    ),
    false
  );
});

test("findMatchingScripts returns only current-page candidates", () => {
  const registry = {
    scripts: [
      { id: "site3217", matches: ["https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"] },
      { id: "site320", matches: ["https://www.ebut3pl.co.kr/jsp/site/site320main.jsp*"] }
    ]
  };

  const result = loader.findMatchingScripts(
    registry,
    "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp?"
  );

  assert.deepEqual(result.map((item) => item.id), ["site3217"]);
});

test("isScriptEnabled prefers per-PC override over default", () => {
  assert.equal(loader.isScriptEnabled({ enabledByDefault: true }, undefined), true);
  assert.equal(loader.isScriptEnabled({ enabledByDefault: true }, false), false);
  assert.equal(loader.isScriptEnabled({ enabledByDefault: false }, true), true);
});

test("shouldRefreshCache compares semantic versions and checksum", () => {
  assert.equal(loader.shouldRefreshCache(null, { version: "0.1.0", checksum: "a" }), true);
  assert.equal(
    loader.shouldRefreshCache(
      { version: "0.1.0", checksum: "a" },
      { version: "0.1.1", checksum: "a" }
    ),
    true
  );
  assert.equal(
    loader.shouldRefreshCache(
      { version: "0.1.1", checksum: "a" },
      { version: "0.1.1", checksum: "b" }
    ),
    true
  );
  assert.equal(
    loader.shouldRefreshCache(
      { version: "0.1.1", checksum: "a" },
      { version: "0.1.1", checksum: "a" }
    ),
    false
  );
});

test("buildScriptStorageKeys keeps script cache names isolated", () => {
  const keys = loader.buildScriptStorageKeys("site3217");

  assert.equal(keys.enabled, "tm-loader:v1:script:site3217:enabled");
  assert.equal(keys.meta, "tm-loader:v1:script:site3217:meta");
  assert.equal(keys.code, "tm-loader:v1:script:site3217:code");
});

test("bumpVersion increments patch by default", () => {
  assert.equal(releaseLib.bumpVersion("0.1.0"), "0.1.1");
  assert.equal(releaseLib.bumpVersion("0.1.0", "minor"), "0.2.0");
  assert.equal(releaseLib.bumpVersion("0.1.0", "major"), "1.0.0");
});

test("buildChangelogEntry writes Korean entry with date and version", () => {
  const entry = releaseLib.buildChangelogEntry({
    date: "2026-03-21",
    version: "0.1.1",
    message: "site3217 로더 구조 이관"
  });

  assert.match(entry, /## 2026-03-21/);
  assert.match(entry, /- `0.1.1` site3217 로더 구조 이관/);
});

test("site3217 remote module exports run contract", () => {
  assert.equal(site3217.id, "site3217");
  assert.equal(site3217.version, "0.1.0");
  assert.equal(Array.isArray(site3217.matches), true);
  assert.equal(typeof site3217.run, "function");
});
