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

test("formatSyncTime returns compact timestamp for valid iso values", () => {
  assert.equal(loader.formatSyncTime("2026-03-23T08:11:12.000Z"), "2026-03-23 08:11");
  assert.equal(loader.formatSyncTime(""), "-");
});

test("buildManagerRows merges registry, page match, cache and remote meta", () => {
  const registry = {
    scripts: [
      {
        id: "site3217",
        name: "site3217",
        enabledByDefault: true,
        matches: ["https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"],
      },
      {
        id: "site9999",
        name: "site9999",
        enabledByDefault: false,
        matches: ["https://example.com/*"],
      },
    ],
  };

  const rows = loader.buildManagerRows({
    registry,
    url: "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp?",
    localStateById: {
      site3217: {
        enabledOverride: true,
        meta: { version: "0.2.0", lastSyncedAt: "2026-03-23T08:11:12.000Z" },
      },
      site9999: {
        enabledOverride: undefined,
        meta: null,
      },
    },
    remoteMetaById: {
      site3217: { version: "0.2.1" },
      site9999: { version: "1.0.0" },
    },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "site3217");
  assert.equal(rows[0].appliesHere, true);
  assert.equal(rows[0].enabled, true);
  assert.equal(rows[0].cachedVersion, "0.2.0");
  assert.equal(rows[0].remoteVersion, "0.2.1");
  assert.equal(rows[0].lastSyncedAtLabel, "2026-03-23 08:11");
  assert.equal(rows[1].enabled, false);
  assert.equal(rows[1].appliesHere, false);
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
