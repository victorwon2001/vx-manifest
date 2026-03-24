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

const loaderPath = resolveRepoPath(["../client/loader.user.js"]);
const loader = require(loaderPath);
const releaseLib = require("../tools/release-lib.js");
const remoteModule = require(resolveRepoPath(["../modules/module-a/main.js"]));
const patternAnalyzerModule = require(resolveRepoPath(["../modules/pattern-analyzer/main.js"]));
const stockMoveAutomationModule = require(resolveRepoPath(["../modules/stock-move-automation/main.js"]));
const orderImportSyncModule = require(resolveRepoPath(["../modules/order-import-sync/main.js"]));
const moduleUi = require(resolveRepoPath(["../shared/module-ui.js"]));
const registry = require(resolveRepoPath(["../config/registry.json"]));
const remoteMeta = require(resolveRepoPath(["../modules/module-a/meta.json"]));
const patternAnalyzerMeta = require(resolveRepoPath(["../modules/pattern-analyzer/meta.json"]));
const stockMoveAutomationMeta = require(resolveRepoPath(["../modules/stock-move-automation/meta.json"]));
const orderImportSyncMeta = require(resolveRepoPath(["../modules/order-import-sync/meta.json"]));
const loaderSource = fs.readFileSync(loaderPath, "utf8");

function createGmEnvironment(overrides) {
  const original = {};
  const names = [
    "GM_getValue",
    "GM_setValue",
    "GM_deleteValue",
    "GM_listValues",
    "GM_xmlhttpRequest",
    "GM_notification",
    "GM_download",
    "GM_setClipboard",
    "GM_openInTab",
    "GM_registerMenuCommand",
  ];
  names.forEach((name) => {
    original[name] = global[name];
  });

  const store = new Map();
  global.GM_getValue = (key, fallbackValue) => (store.has(key) ? store.get(key) : fallbackValue);
  global.GM_setValue = (key, value) => {
    store.set(key, value);
  };
  global.GM_deleteValue = (key) => {
    store.delete(key);
  };
  global.GM_listValues = () => Array.from(store.keys());
  global.GM_notification = () => {};
  global.GM_download = () => {};
  global.GM_setClipboard = () => {};
  global.GM_openInTab = () => {};
  global.GM_registerMenuCommand = () => {};
  if (overrides && overrides.GM_xmlhttpRequest) {
    global.GM_xmlhttpRequest = overrides.GM_xmlhttpRequest;
  } else {
    delete global.GM_xmlhttpRequest;
  }

  return {
    store,
    restore() {
      names.forEach((name) => {
        if (typeof original[name] === "undefined") {
          delete global[name];
        } else {
          global[name] = original[name];
        }
      });
    },
  };
}

function createFakeWindow(url) {
  return {
    location: { href: url },
    document: {},
    navigator: {},
    console,
    unsafeWindow: null,
    focus() {},
    open() {
      return null;
    },
    setTimeout() {
      return 0;
    },
  };
}

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
      { id: "module-b", matches: ["https://www.ebut3pl.co.kr/jsp/site/site320main.jsp*"] },
    ],
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
  assert.equal(loader.shouldRefreshCache({ version: "0.1.0", checksum: "a" }, { version: "0.1.1", checksum: "a" }), true);
  assert.equal(loader.shouldRefreshCache({ version: "0.1.1", checksum: "a" }, { version: "0.1.1", checksum: "b" }), true);
  assert.equal(loader.shouldRefreshCache({ version: "0.1.1", checksum: "a" }, { version: "0.1.1", checksum: "a" }), false);
});

test("shouldCheckAt respects ttl windows", () => {
  const now = Date.UTC(2026, 2, 24, 3, 0, 0);
  assert.equal(loader.shouldCheckAt("", 15 * 60 * 1000, now), true);
  assert.equal(loader.shouldCheckAt("2026-03-24T02:50:00.000Z", 15 * 60 * 1000, now), false);
  assert.equal(loader.shouldCheckAt("2026-03-24T02:40:00.000Z", 15 * 60 * 1000, now), true);
});

test("buildScriptStorageKeys keeps script cache names isolated", () => {
  const keys = loader.buildScriptStorageKeys("module-a");
  assert.equal(keys.enabled, "tm-loader:v1:script:module-a:enabled");
  assert.equal(keys.meta, "tm-loader:v1:script:module-a:meta");
  assert.equal(keys.code, "tm-loader:v1:script:module-a:code");
  assert.equal(keys.assets, "tm-loader:v1:script:module-a:assets");
});

test("normalizeMetaCacheEntry keeps full runnable cache metadata", () => {
  const meta = loader.normalizeMetaCacheEntry("module-a", {
    version: "0.2.0",
    checksum: "abc",
    entry: "modules/module-a/main.js",
    dependencies: [{ id: "module-ui", path: "shared/module-ui.js" }],
    capabilities: { gm: ["GM_xmlhttpRequest"], connect: ["raw.githubusercontent.com"] },
    loaderApiVersion: 2,
    checkedAt: "2026-03-24T01:00:00.000Z",
    lastSyncedAt: "2026-03-24T01:05:00.000Z",
  });

  assert.equal(meta.id, "module-a");
  assert.equal(loader.canUseCachedMeta(meta), true);
  assert.deepEqual(meta.capabilities.gm, ["GM_xmlhttpRequest"]);
  assert.equal(meta.loaderApiVersion, 2);
});

test("diffRegistryScripts detects added and removed modules", () => {
  const diff = loader.diffRegistryScripts(
    { scripts: [{ id: "module-a" }, { id: "module-b" }] },
    { scripts: [{ id: "module-b" }, { id: "module-c" }] }
  );
  assert.deepEqual(diff, { addedIds: ["module-c"], removedIds: ["module-a"] });
});

test("formatSyncTime returns compact timestamp for valid iso values", () => {
  assert.equal(loader.formatSyncTime("2026-03-23T08:11:12.000Z"), "2026-03-23 08:11");
  assert.equal(loader.formatSyncTime(""), "-");
});

test("formatManagerSubtitle strips noisy query strings from the current page label", () => {
  assert.equal(
    loader.formatManagerSubtitle("https://www.ebut3pl.co.kr/site/site320save_new?ORDLIST_IVDATE=20260324&ORDLIST_IVNO=17"),
    "https://www.ebut3pl.co.kr/site/site320save_new"
  );
  assert.equal(loader.formatManagerSubtitle("not-a-url"), "not-a-url");
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
  assert.equal(rows[0].hasUpdate, true);
  assert.equal(rows[0].lastSyncedAtLabel, "2026-03-23 08:11");
  assert.equal(rows[1].enabled, false);
  assert.equal(rows[1].appliesHere, false);
  assert.equal(rows[1].hasUpdate, false);
});

test("buildManagerRows surfaces remote status badges for new modules", () => {
  const rows = loader.buildManagerRows({
    registry: {
      scripts: [
        { id: "module-a", name: "workspace-a", enabledByDefault: true, matches: ["https://example.com/a*"] },
        { id: "module-b", name: "workspace-b", enabledByDefault: true, matches: ["https://example.com/*"] },
      ],
    },
    url: "https://example.com/a",
    localStateById: {
      "module-a": { enabledOverride: true, meta: { version: "0.1.0", lastSyncedAt: "2026-03-24T03:00:00.000Z" } },
      "module-b": { enabledOverride: true, meta: null },
    },
    remoteMetaById: {
      "module-a": { version: "0.1.0" },
      "module-b": { version: "1.0.0" },
    },
    remoteStatusById: {
      "module-b": { kind: "new", version: "1.0.0" },
    },
  });

  assert.equal(rows[0].id, "module-b");
  assert.equal(rows[0].isNew, true);
  assert.equal(rows[0].remoteVersion, "1.0.0");
  assert.equal(rows[1].hasUpdate, false);
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

test("buildManagerShellHtml uses the refreshed hero and summary layout", () => {
  const html = loader.buildManagerShellHtml();
  assert.match(html, /tm-hero/);
  assert.match(html, /tm-summary-grid/);
  assert.match(html, /tm-status-card/);
  assert.match(html, /tm-table-card/);
  assert.match(html, /로드 화면/);
});

test("public loader labels are neutralized", () => {
  const html = loader.buildManagerDocumentHtml();
  assert.match(html, /vx console/i);
  assert.doesNotMatch(html, /site3217|ebut/i);
});

test("loader points to neutral public repo paths", () => {
  assert.match(loader.REGISTRY_URL, /vx-manifest/);
  assert.match(loader.REGISTRY_URL, /config\/registry\.json/);
  assert.doesNotMatch(loader.REGISTRY_URL, /registry\/registry/);
});

test("loader source declares future-proof grants and connect rules", () => {
  assert.match(loaderSource, /@connect\s+ebutexcel\.co\.kr/);
  assert.match(loaderSource, /@connect\s+\*/);
  assert.match(loaderSource, /@grant\s+GM_download/);
  assert.match(loaderSource, /@grant\s+GM_setClipboard/);
  assert.match(loaderSource, /@grant\s+GM_openInTab/);
});

test("critical loader functions have a single canonical definition", () => {
  [
    "notifyOnceForStatus",
    "getManagerRowClassName",
    "renderRemoteVersionCell",
    "buildManagerShellHtml",
    "applyManagerStyles",
    "renderManager",
    "openManager",
    "refreshRemoteMeta",
    "refreshRegistry",
    "syncScripts",
    "clearScriptCaches",
    "clearAllCaches",
    "toggleScriptEnabled",
    "registerMenus",
    "bootstrap",
  ].forEach((name) => {
    const matches = loaderSource.match(new RegExp("\\bfunction\\s+" + name + "\\s*\\(", "g")) || [];
    assert.equal(matches.length, 1, name + " should be defined once");
  });
});

test("loader source wires sync execution and busy status messaging", () => {
  assert.match(loaderSource, /현재 페이지 동기화 중/);
  assert.match(loaderSource, /전체 동기화 중/);
  assert.match(loaderSource, /await runScript\(script,\s*actionWindow/);
  assert.match(loaderSource, /function getActionNode\(target\)/);
  assert.match(loaderSource, /function getDirectGrantFunction\(name\)/);
  assert.match(loaderSource, /function getPageWindow\(candidate\)/);
  assert.match(loaderSource, /ensureCurrentPageScriptsRunning\(managerState\.sourceWindow\)/);
  assert.match(loaderSource, /function registerMenus\(win\)/);
  assert.match(loaderSource, /openManager\(sourceWindow\)/);
  assert.match(loaderSource, /registerMenus\(scope\)/);
  assert.match(loaderSource, /managerState\.bootWindow = scope/);
  assert.match(loaderSource, /typeof GM_xmlhttpRequest === "function"/);
  assert.match(loaderSource, /typeof GM_getValue === "function"/);
  assert.doesNotMatch(loaderSource, /openManager\(root\)/);
});

test("createLoaderApi exposes storage and convenience helpers", () => {
  const api = loader.createLoaderApi(
    { focus() {} },
    { id: "module-a", name: "workspace-a" },
    { version: "0.2.0", entry: "modules/module-a/main.js", capabilities: { gm: ["GM_xmlhttpRequest"] } }
  );

  assert.equal(api.loaderApiVersion, 2);
  assert.equal(api.request, api.gmRequest);
  assert.equal(typeof api.download, "function");
  assert.equal(typeof api.copyText, "function");
  assert.equal(typeof api.openTab, "function");
  assert.equal(typeof api.storage.get, "function");
  assert.deepEqual(api.capabilities.gm, ["GM_xmlhttpRequest"]);
});

test("bootstrap runs cached module without waiting for remote registry", async () => {
  const env = createGmEnvironment();
  try {
    const registryCache = {
      version: 1,
      scripts: [
        {
          id: "bootstrap-cache",
          name: "bootstrap-cache",
          enabledByDefault: true,
          matches: ["https://example.com/*"],
          metaPath: "modules/bootstrap-cache/meta.json",
        },
      ],
    };
    const keys = loader.buildScriptStorageKeys("bootstrap-cache");
    env.store.set("tm-loader:v1:registry:raw", JSON.stringify(registryCache));
    env.store.set(keys.meta, JSON.stringify({
      id: "bootstrap-cache",
      name: "bootstrap-cache",
      version: "1.0.0",
      entry: "modules/bootstrap-cache/main.js",
      checksum: "",
      dependencies: [],
      capabilities: { gm: [] },
      loaderApiVersion: 2,
      checkedAt: "2026-03-24T00:00:00.000Z",
      lastSyncedAt: "2026-03-24T00:00:00.000Z",
    }));
    env.store.set(keys.code, 'module.exports={id:"bootstrap-cache",run(context){context.window.__loaderRuns=(context.window.__loaderRuns||[]).concat("cache");}};');

    const fakeWindow = createFakeWindow("https://example.com/dashboard");
    await loader.bootstrap(fakeWindow);
    assert.deepEqual(fakeWindow.__loaderRuns, ["cache"]);
  } finally {
    env.restore();
  }
});

test("bootstrap skips rerunning the same script version on the same window", async () => {
  const env = createGmEnvironment();
  try {
    const registryCache = {
      version: 1,
      scripts: [
        {
          id: "bootstrap-cache-once",
          name: "bootstrap-cache-once",
          enabledByDefault: true,
          matches: ["https://example.com/*"],
          metaPath: "modules/bootstrap-cache-once/meta.json",
        },
      ],
    };
    const keys = loader.buildScriptStorageKeys("bootstrap-cache-once");
    env.store.set("tm-loader:v1:registry:raw", JSON.stringify(registryCache));
    env.store.set(keys.meta, JSON.stringify({
      id: "bootstrap-cache-once",
      name: "bootstrap-cache-once",
      version: "1.0.0",
      entry: "modules/bootstrap-cache-once/main.js",
      checksum: "",
      dependencies: [],
      capabilities: { gm: [] },
      loaderApiVersion: 2,
      checkedAt: "2026-03-24T00:00:00.000Z",
      lastSyncedAt: "2026-03-24T00:00:00.000Z",
    }));
    env.store.set(keys.code, 'module.exports={id:"bootstrap-cache-once",run(context){context.window.__loaderRuns=(context.window.__loaderRuns||0)+1;}};');

    const fakeWindow = createFakeWindow("https://example.com/dashboard");
    await loader.bootstrap(fakeWindow);
    await loader.bootstrap(fakeWindow);
    assert.equal(fakeWindow.__loaderRuns, 1);
  } finally {
    env.restore();
  }
});

test("bootstrap cold start fetches registry, meta and code remotely", async () => {
  const responses = new Map([
    [
      loader.REGISTRY_URL,
      JSON.stringify({
        version: 1,
        scripts: [
          {
            id: "bootstrap-remote",
            name: "bootstrap-remote",
            enabledByDefault: true,
            matches: ["https://example.com/*"],
            metaPath: "modules/bootstrap-remote/meta.json",
          },
        ],
      }),
    ],
    [
      loader.RAW_BASE_URL + "modules/bootstrap-remote/meta.json",
      JSON.stringify({
        id: "bootstrap-remote",
        name: "bootstrap-remote",
        version: "1.0.0",
        entry: "modules/bootstrap-remote/main.js",
        checksum: "",
        dependencies: [],
        capabilities: { gm: [] },
        loaderApiVersion: 2,
      }),
    ],
    [
      loader.RAW_BASE_URL + "modules/bootstrap-remote/main.js",
      'module.exports={id:"bootstrap-remote",run(context){context.window.__loaderRuns=(context.window.__loaderRuns||[]).concat("remote");}};',
    ],
  ]);
  const env = createGmEnvironment({
    GM_xmlhttpRequest(details) {
      const body = responses.get(details.url);
      if (!body) throw new Error("unexpected URL: " + details.url);
      details.onload({
        status: 200,
        responseText: body,
        response: body,
        responseHeaders: "content-type: application/json",
      });
    },
  });

  try {
    const fakeWindow = createFakeWindow("https://example.com/dashboard");
    await loader.bootstrap(fakeWindow);
    assert.deepEqual(fakeWindow.__loaderRuns, ["remote"]);
    assert.ok(env.store.get("tm-loader:v1:registry:raw"));
  } finally {
    env.restore();
  }
});

test("registry and remote meta expose the requested display names", () => {
  assert.equal(registry.scripts[0].name, "송장출력(스캔) 필터링");
  assert.equal(remoteMeta.name, "송장출력(스캔) 필터링");
  assert.equal(patternAnalyzerMeta.name, "패턴분석기");
  assert.equal(stockMoveAutomationMeta.name, "재고이동 자동화");
  assert.equal(orderImportSyncMeta.name, "연동데이터 불러오기");
});

test("pattern analyzer meta and registry stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "pattern-analyzer");
  assert.ok(script);
  assert.equal(script.metaPath, "modules/pattern-analyzer/meta.json");
  assert.equal(patternAnalyzerMeta.entry, "modules/pattern-analyzer/main.js");
});

test("stock move automation meta and registry stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "stock-move-automation");
  assert.ok(script);
  assert.equal(script.metaPath, "modules/stock-move-automation/meta.json");
  assert.equal(stockMoveAutomationMeta.entry, "modules/stock-move-automation/main.js");
});

test("order import sync meta and registry stay aligned", () => {
  const script = registry.scripts.find((item) => item.id === "order-import-sync");
  assert.ok(script);
  assert.equal(script.metaPath, "modules/order-import-sync/meta.json");
  assert.equal(orderImportSyncMeta.entry, "modules/order-import-sync/main.js");
});

test("bumpVersion increments semantic versions", () => {
  assert.equal(releaseLib.bumpVersion("0.1.0"), "0.1.1");
  assert.equal(releaseLib.bumpVersion("0.1.0", "minor"), "0.2.0");
  assert.equal(releaseLib.bumpVersion("0.1.0", "major"), "1.0.0");
});

test("buildChangelogEntry writes Korean entry with date and version", () => {
  const entry = releaseLib.buildChangelogEntry({
    date: "2026-03-21",
    version: "0.1.1",
    message: "모듈 정리",
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
  assert.equal(patternAnalyzerModule.version, patternAnalyzerMeta.version);
});

test("stock move automation module exports run contract", () => {
  assert.equal(stockMoveAutomationModule.id, "stock-move-automation");
  assert.equal(Array.isArray(stockMoveAutomationModule.matches), true);
  assert.equal(typeof stockMoveAutomationModule.run, "function");
  assert.equal(stockMoveAutomationModule.version, stockMoveAutomationMeta.version);
});

test("order import sync module exports run contract", () => {
  assert.equal(orderImportSyncModule.id, "order-import-sync");
  assert.equal(Array.isArray(orderImportSyncModule.matches), true);
  assert.equal(typeof orderImportSyncModule.run, "function");
  assert.equal(orderImportSyncModule.version, orderImportSyncMeta.version);
});

test("shared module ui exports theme helpers", () => {
  assert.equal(typeof moduleUi.TOKENS, "object");
  assert.equal(moduleUi.TOKENS.bg, "#f9f9f9");
  assert.equal(moduleUi.TOKENS.primary, "#546067");
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
