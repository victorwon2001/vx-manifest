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

const loader = require(resolveRepoPath(["../loader/loader.user.js", "../client/loader.user.js"]));
const releaseLib = require("../tools/release-lib.js");
const remoteModule = require(resolveRepoPath(["../scripts/site3217/main.js", "../modules/module-a/main.js"]));
const patternAnalyzerModule = require(resolveRepoPath(["../modules/pattern-analyzer/main.js"]));
const stockMoveAutomationModule = require(resolveRepoPath(["../modules/stock-move-automation/main.js"]));
const orderImportSyncModule = require(resolveRepoPath(["../modules/order-import-sync/main.js"]));
const moduleUi = require(resolveRepoPath(["../shared/module-ui.js"]));
const registry = require(resolveRepoPath(["../registry/registry.json", "../config/registry.json"]));
const remoteMeta = require(resolveRepoPath(["../scripts/site3217/meta.json", "../modules/module-a/meta.json"]));
const patternAnalyzerMeta = require(resolveRepoPath(["../modules/pattern-analyzer/meta.json"]));
const stockMoveAutomationMeta = require(resolveRepoPath(["../modules/stock-move-automation/meta.json"]));
const orderImportSyncMeta = require(resolveRepoPath(["../modules/order-import-sync/meta.json"]));

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
  const sampleRegistry = {
    scripts: [
      { id: "module-a", matches: ["https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"] },
      { id: "module-b", matches: ["https://www.ebut3pl.co.kr/jsp/site/site320main.jsp*"] }
    ]
  };

  const result = loader.findMatchingScripts(
    sampleRegistry,
    "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp?"
  );

  assert.deepEqual(result.map((item) => item.id), ["module-a"]);
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
  const keys = loader.buildScriptStorageKeys("module-a");

  assert.equal(keys.enabled, "tm-loader:v1:script:module-a:enabled");
  assert.equal(keys.meta, "tm-loader:v1:script:module-a:meta");
  assert.equal(keys.code, "tm-loader:v1:script:module-a:code");
});

test("formatSyncTime returns compact timestamp for valid iso values", () => {
  assert.equal(loader.formatSyncTime("2026-03-23T08:11:12.000Z"), "2026-03-23 08:11");
  assert.equal(loader.formatSyncTime(""), "-");
});

test("buildManagerRows merges registry, page match, cache and remote meta", () => {
  const sampleRegistry = {
    scripts: [
      {
        id: "module-a",
        name: "workspace-a",
        enabledByDefault: true,
        matches: ["https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp*"],
      },
      {
        id: "module-z",
        name: "workspace-z",
        enabledByDefault: false,
        matches: ["https://example.com/*"],
      },
    ],
  };

  const rows = loader.buildManagerRows({
    registry: sampleRegistry,
    url: "https://www.ebut3pl.co.kr/jsp/site/site3217main.jsp?",
    localStateById: {
      "module-a": {
        enabledOverride: true,
        meta: { version: "0.2.0", lastSyncedAt: "2026-03-23T08:11:12.000Z" },
      },
      "module-z": {
        enabledOverride: undefined,
        meta: null,
      },
    },
    remoteMetaById: {
      "module-a": { version: "0.2.1" },
      "module-z": { version: "1.0.0" },
    },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "module-a");
  assert.equal(rows[0].appliesHere, true);
  assert.equal(rows[0].enabled, true);
  assert.equal(rows[0].cachedVersion, "0.2.0");
  assert.equal(rows[0].remoteVersion, "0.2.1");
  assert.equal(rows[0].lastSyncedAtLabel, "2026-03-23 08:11");
  assert.equal(rows[1].enabled, false);
  assert.equal(rows[1].appliesHere, false);
});

test("getManagerWindowFeatures builds popup sizing string", () => {
  const features = loader.getManagerWindowFeatures();

  assert.match(features, /width=1160/);
  assert.match(features, /height=860/);
  assert.match(features, /resizable=yes/);
  assert.match(features, /scrollbars=yes/);
});

test("buildManagerDocumentHtml returns standalone popup shell", () => {
  const html = loader.buildManagerDocumentHtml();

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /tm-loader-popup-root/);
  assert.match(html, /vx console/i);
});

test("public loader labels are neutralized", () => {
  const html = loader.buildManagerDocumentHtml();

  assert.match(html, /vx console/i);
  assert.doesNotMatch(html, /tamp-scripts|tamp.?스크립트|site3217|ebut/i);
});

test("loader points to neutral public repo paths", () => {
  assert.match(loader.REGISTRY_URL, /vx-manifest/);
  assert.match(loader.REGISTRY_URL, /config\/registry\.json/);
  assert.doesNotMatch(loader.REGISTRY_URL, /tamp-scripts|registry\/registry/);
});

test("registry and remote meta avoid obvious public labels", () => {
  const combined = [
    registry.scripts[0].id,
    registry.scripts[0].name,
    registry.scripts[0].metaPath,
    remoteMeta.id,
    remoteMeta.name,
    remoteMeta.description,
    remoteMeta.entry,
  ].join(" ");

  assert.doesNotMatch(combined, /site3217|ebut/i);
});

test("registry and remote meta expose the requested display name", () => {
  assert.equal(registry.scripts[0].name, "송장출력(스캔) 필터링");
  assert.equal(remoteMeta.name, "송장출력(스캔) 필터링");
});

test("registry exposes the pattern analyzer module metadata", () => {
  const script = registry.scripts.find((item) => item.id === "pattern-analyzer");

  assert.ok(script);
  assert.equal(script.name, "패턴분석기");
  assert.deepEqual(script.matches, ["https://www.ebut3pl.co.kr/*"]);
  assert.equal(script.metaPath, "modules/pattern-analyzer/meta.json");
});

test("pattern analyzer meta exposes the requested display name", () => {
  assert.equal(patternAnalyzerMeta.id, "pattern-analyzer");
  assert.equal(patternAnalyzerMeta.name, "패턴분석기");
  assert.equal(patternAnalyzerMeta.entry, "modules/pattern-analyzer/main.js");
});

test("registry exposes the stock move automation module metadata", () => {
  const script = registry.scripts.find((item) => item.id === "stock-move-automation");

  assert.ok(script);
  assert.equal(script.name, "재고이동 자동화");
  assert.deepEqual(script.matches, ["https://www.ebut3pl.co.kr/*"]);
  assert.equal(script.metaPath, "modules/stock-move-automation/meta.json");
});

test("stock move automation meta exposes the requested display name", () => {
  assert.equal(stockMoveAutomationMeta.id, "stock-move-automation");
  assert.equal(stockMoveAutomationMeta.name, "재고이동 자동화");
  assert.equal(stockMoveAutomationMeta.entry, "modules/stock-move-automation/main.js");
});

test("registry exposes the order import sync module metadata", () => {
  const script = registry.scripts.find((item) => item.id === "order-import-sync");

  assert.ok(script);
  assert.equal(script.name, "연동데이터 불러오기");
  assert.deepEqual(script.matches, ["https://www.ebut3pl.co.kr/jsp/site/site230main.jsp*"]);
  assert.equal(script.metaPath, "modules/order-import-sync/meta.json");
});

test("order import sync meta exposes the requested display name", () => {
  assert.equal(orderImportSyncMeta.id, "order-import-sync");
  assert.equal(orderImportSyncMeta.name, "연동데이터 불러오기");
  assert.equal(orderImportSyncMeta.entry, "modules/order-import-sync/main.js");
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
    message: "모듈 정리"
  });

  assert.match(entry, /## 2026-03-21/);
  assert.match(entry, /- `0.1.1` 모듈 정리/);
});

test("remote module exports run contract", () => {
  assert.equal(typeof remoteModule.id, "string");
  assert.equal(remoteModule.version, remoteMeta.version);
  assert.equal(Array.isArray(remoteModule.matches), true);
  assert.equal(typeof remoteModule.run, "function");
});

test("pattern analyzer module exports run contract", () => {
  assert.equal(patternAnalyzerModule.id, "pattern-analyzer");
  assert.equal(Array.isArray(patternAnalyzerModule.matches), true);
  assert.equal(typeof patternAnalyzerModule.run, "function");
});

test("pattern analyzer runtime version stays aligned with meta version", () => {
  assert.equal(patternAnalyzerModule.version, patternAnalyzerMeta.version);
});

test("stock move automation module exports run contract", () => {
  assert.equal(stockMoveAutomationModule.id, "stock-move-automation");
  assert.equal(Array.isArray(stockMoveAutomationModule.matches), true);
  assert.equal(typeof stockMoveAutomationModule.run, "function");
});

test("stock move automation runtime version stays aligned with meta version", () => {
  assert.equal(stockMoveAutomationModule.version, stockMoveAutomationMeta.version);
});

test("order import sync module exports run contract", () => {
  assert.equal(orderImportSyncModule.id, "order-import-sync");
  assert.equal(Array.isArray(orderImportSyncModule.matches), true);
  assert.equal(typeof orderImportSyncModule.run, "function");
});

test("order import sync runtime version stays aligned with meta version", () => {
  assert.equal(orderImportSyncModule.version, orderImportSyncMeta.version);
});

test("shared module ui exports theme helpers", () => {
  assert.equal(typeof moduleUi.TOKENS, "object");
  assert.equal(moduleUi.TOKENS.bg, "#f4f7fb");
  assert.equal(moduleUi.TOKENS.primary, "#2563eb");
  assert.equal(typeof moduleUi.buildModuleUiCss, "function");
  assert.equal(typeof moduleUi.buildRootAttributes, "function");
  assert.equal(typeof moduleUi.ensureStyles, "function");
});

test("all module meta files depend on the shared module ui asset", () => {
  [remoteMeta, patternAnalyzerMeta, stockMoveAutomationMeta, orderImportSyncMeta].forEach((meta) => {
    const dependency = (meta.dependencies || []).find((item) => item.id === "module-ui");
    assert.ok(dependency, meta.id + " missing module-ui dependency");
    assert.equal(dependency.path, "shared/module-ui.js");
  });
});
