// ==UserScript==
// @name         VX Console
// @namespace    github.victor.vx.console
// @version      0.4.0
// @description  원격 구성 기반 모듈 동기화 도구
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/client/loader.user.js
// @downloadURL  https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/client/loader.user.js
// @supportURL   https://github.com/victorwon2001/vx-manifest
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_addElement
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        unsafeWindow
// @grant        window.focus
// @connect      *
// @connect      raw.githubusercontent.com
// @connect      ebutexcel.co.kr
// @connect      www.ebut3pl.co.kr
// @run-at       document-end
// ==/UserScript==

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    api.bootstrap(window);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const LOADER_VERSION = "0.4.0";
  const LOADER_API_VERSION = 2;
  const STORAGE_PREFIX = "tm-loader:v1";
  const REPO_OWNER = "victorwon2001";
  const REPO_NAME = "vx-manifest";
  const REPO_BRANCH = "main";
  const RAW_BASE_URL = "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/" + REPO_BRANCH + "/";
  const REGISTRY_URL = RAW_BASE_URL + "config/registry.json";
  const MANAGER_WINDOW_NAME = "vx-console-window";
  const MANAGER_ROOT_ID = "tm-loader-popup-root";
  const MANAGER_STYLE_ID = "tm-loader-popup-style";
  const REGISTRY_RAW_KEY = STORAGE_PREFIX + ":registry:raw";
  const REGISTRY_CHECKED_AT_KEY = STORAGE_PREFIX + ":registry:checkedAt";
  const META_PREWARMED_AT_KEY = STORAGE_PREFIX + ":meta:prewarmedAt";
  const REMOTE_STATUS_KEY = STORAGE_PREFIX + ":remote:status";
  const REGISTRY_LOCK_KEY = STORAGE_PREFIX + ":registry:lock";
  const META_PREWARM_LOCK_KEY = STORAGE_PREFIX + ":meta:lock";
  const REGISTRY_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const META_PREWARM_INTERVAL_MS = 60 * 60 * 1000;
  const LOCK_TTL_MS = 90 * 1000;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function matchUrlPattern(url, pattern) {
    const regex = new RegExp("^" + String(pattern).split("*").map(escapeRegExp).join(".*") + "$");
    return regex.test(String(url || ""));
  }

  function findMatchingScripts(registry, url) {
    const scripts = Array.isArray(registry && registry.scripts) ? registry.scripts : [];
    return scripts.filter((script) => Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern)));
  }

  function safeJsonParse(value, fallbackValue) {
    if (!value) return fallbackValue;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallbackValue;
    }
  }

  function parseVersion(version) {
    return String(version || "0.0.0").split(".").map((value) => Number(value || 0)).concat([0, 0, 0]).slice(0, 3);
  }

  function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] > b[index]) return 1;
      if (a[index] < b[index]) return -1;
    }
    return 0;
  }

  function shouldRefreshCache(cachedMeta, remoteMeta) {
    if (!cachedMeta || !remoteMeta) return true;
    if (compareVersions(cachedMeta.version, remoteMeta.version) < 0) return true;
    if (String(cachedMeta.checksum || "") !== String(remoteMeta.checksum || "")) return true;
    return false;
  }

  function isScriptEnabled(script, overrideValue) {
    if (typeof overrideValue === "boolean") return overrideValue;
    return script.enabledByDefault !== false;
  }

  function formatSyncTime(value) {
    const text = String(value || "");
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
    return match ? (match[1] + " " + match[2]) : "-";
  }

  function formatManagerSubtitle(url) {
    try {
      const currentUrl = new URL(String(url || ""));
      return currentUrl.origin + currentUrl.pathname;
    } catch (error) {
      return String(url || "");
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toTimestamp(value) {
    const time = new Date(String(value || "")).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function shouldCheckAt(lastCheckedAt, intervalMs, nowValue) {
    const lastCheckedTime = toTimestamp(lastCheckedAt);
    const currentTime = typeof nowValue === "number" ? nowValue : Date.now();
    if (!lastCheckedTime) return true;
    return (currentTime - lastCheckedTime) >= Number(intervalMs || 0);
  }

  function buildAssetCacheKey(scriptId, suffix, stageName) {
    if (stageName === "next") return STORAGE_PREFIX + ":asset-next:" + scriptId + ":" + suffix;
    return STORAGE_PREFIX + ":asset:" + scriptId + ":" + suffix;
  }

  function buildScriptStorageKeys(scriptId) {
    return {
      enabled: STORAGE_PREFIX + ":script:" + scriptId + ":enabled",
      meta: STORAGE_PREFIX + ":script:" + scriptId + ":meta",
      code: STORAGE_PREFIX + ":script:" + scriptId + ":code",
      registry: STORAGE_PREFIX + ":script:" + scriptId + ":registry",
      assets: STORAGE_PREFIX + ":script:" + scriptId + ":assets",
      remoteStatus: STORAGE_PREFIX + ":script:" + scriptId + ":remoteStatus",
    };
  }

  function normalizeCapabilities(capabilities) {
    const source = capabilities && typeof capabilities === "object" ? capabilities : {};
    return {
      gm: Array.isArray(source.gm) ? source.gm.slice() : [],
      connect: Array.isArray(source.connect) ? source.connect.slice() : [],
    };
  }

  function normalizeMetaCacheEntry(scriptId, meta) {
    if (!meta || typeof meta !== "object") return null;
    if (!meta.version) return null;
    const normalized = Object.assign({}, meta);
    normalized.id = normalized.id || scriptId;
    normalized.entry = normalized.entry || "";
    normalized.checksum = normalized.checksum || "";
    normalized.dependencies = Array.isArray(normalized.dependencies) ? normalized.dependencies.slice() : [];
    normalized.capabilities = normalizeCapabilities(normalized.capabilities);
    normalized.loaderApiVersion = Number(normalized.loaderApiVersion || 1) || 1;
    normalized.checkedAt = normalized.checkedAt || "";
    normalized.lastSyncedAt = normalized.lastSyncedAt || "";
    return normalized;
  }

  function canUseCachedMeta(meta) {
    return !!(meta && meta.entry);
  }

  function getValueList() {
    if (typeof GM_listValues === "function") return GM_listValues();
    return [];
  }

  function readCachedRegistry() {
    return safeJsonParse(getValue(REGISTRY_RAW_KEY, ""), null);
  }

  function readRemoteStatusMap() {
    const value = safeJsonParse(getValue(REMOTE_STATUS_KEY, ""), {});
    return value && typeof value === "object" ? value : {};
  }

  function writeRemoteStatusMap(statusMap) {
    setValue(REMOTE_STATUS_KEY, JSON.stringify(statusMap || {}));
  }

  function acquireRefreshLock(key, ttlMs, nowValue) {
    const currentTime = typeof nowValue === "number" ? nowValue : Date.now();
    const expiresAt = Number(getValue(key, 0) || 0);
    if (expiresAt > currentTime) return false;
    setValue(key, currentTime + Number(ttlMs || 0));
    return true;
  }

  function releaseRefreshLock(key) {
    deleteValue(key);
  }

  function readAssetCacheKeys(scriptId) {
    const keys = buildScriptStorageKeys(scriptId);
    const value = safeJsonParse(getValue(keys.assets, null), []);
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function rememberAssetCacheKey(scriptId, assetKey) {
    const currentKeys = readAssetCacheKeys(scriptId);
    if (currentKeys.indexOf(assetKey) !== -1) return;
    currentKeys.push(assetKey);
    setValue(buildScriptStorageKeys(scriptId).assets, JSON.stringify(currentKeys));
  }

  function readCachedScriptMeta(scriptId) {
    return normalizeMetaCacheEntry(scriptId, safeJsonParse(getValue(buildScriptStorageKeys(scriptId).meta, null), null));
  }

  function buildSyncedMeta(script, meta, previousMeta, syncedAt) {
    return normalizeMetaCacheEntry(script.id, Object.assign({}, previousMeta || {}, meta || {}, {
      id: script.id,
      checkedAt: syncedAt || (previousMeta && previousMeta.checkedAt) || "",
      lastSyncedAt: syncedAt || (previousMeta && previousMeta.lastSyncedAt) || "",
    }));
  }

  function diffRegistryScripts(previousRegistry, nextRegistry) {
    const previousIds = new Set(((previousRegistry && previousRegistry.scripts) || []).map((script) => script.id));
    const nextIds = new Set(((nextRegistry && nextRegistry.scripts) || []).map((script) => script.id));
    const addedIds = [];
    const removedIds = [];

    nextIds.forEach((scriptId) => {
      if (!previousIds.has(scriptId)) addedIds.push(scriptId);
    });
    previousIds.forEach((scriptId) => {
      if (!nextIds.has(scriptId)) removedIds.push(scriptId);
    });

    return { addedIds, removedIds };
  }

  function updateRemoteStatusEntry(statusMap, script, nextEntry) {
    if (!nextEntry) {
      delete statusMap[script.id];
      return;
    }

    const previous = statusMap[script.id] || {};
    statusMap[script.id] = Object.assign({}, previous, nextEntry, {
      id: script.id,
      name: nextEntry.name || script.name || previous.name || script.id,
      detectedAt: nextEntry.detectedAt || previous.detectedAt || nowIso(),
    });
  }

  function clearRemoteStatusEntry(statusMap, scriptId) {
    delete statusMap[scriptId];
  }

  function notifyOnceForStatus(script, entry) {
    if (!entry || !entry.version || entry.notifiedVersion === entry.version) return entry;
    if (entry.kind === "update") {
      notify({ text: (script.name || script.id) + " 새 버전 " + entry.version + " 감지", timeout: 5000 });
    }
    if (entry.kind === "new") {
      notify({ text: (script.name || script.id) + " 모듈이 새로 추가되었습니다.", timeout: 5000 });
    }
    return Object.assign({}, entry, { notifiedVersion: entry.version });
  }

  function getManagerRowClassName(row) {
    return [
      row.appliesHere ? "tm-applies-row" : "",
      row.hasUpdate ? "tm-update-row" : "",
      row.isNew ? "tm-new-row" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function renderRemoteVersionCell(row) {
    if (row.hasRemoteError) {
      return "<span class='tm-badge tm-badge-error'>오류</span>";
    }
    if (row.isNew) {
      return "<div class='tm-version-stack'><span>"
        + escapeHtml(row.remoteVersion)
        + "</span><span class='tm-badge tm-badge-update'>신규</span></div>";
    }
    if (!row.hasUpdate) {
      return escapeHtml(row.remoteVersion);
    }
    return "<div class='tm-version-stack'><span>"
      + escapeHtml(row.remoteVersion)
      + "</span><span class='tm-badge tm-badge-update'>업데이트</span></div>";
  }

  function getManagerRowClassName(row) {
    return [row.appliesHere ? "tm-applies-row" : "", row.hasUpdate ? "tm-update-row" : ""]
      .filter(Boolean)
      .join(" ");
  }

  function renderRemoteVersionCell(row) {
    if (row.hasRemoteError) {
      return "<span class='tm-badge tm-badge-error'>?ㅻ쪟</span>";
    }
    if (!row.hasUpdate) {
      return escapeHtml(row.remoteVersion);
    }
    return "<div class='tm-version-stack'><span>"
      + escapeHtml(row.remoteVersion)
      + "</span><span class='tm-badge tm-badge-update'>?낅뜲?댄듃</span></div>";
  }

  function getValue(key, fallbackValue) {
    if (typeof GM_getValue === "function") return GM_getValue(key, fallbackValue);
    return fallbackValue;
  }

  function setValue(key, value) {
    if (typeof GM_setValue === "function") GM_setValue(key, value);
  }

  function deleteValue(key) {
    if (typeof GM_deleteValue === "function") GM_deleteValue(key);
  }

  function readScriptLocalState(scriptId) {
    const keys = buildScriptStorageKeys(scriptId);
    return {
      enabledOverride: getValue(keys.enabled, undefined),
      meta: readCachedScriptMeta(scriptId),
      hasCode: !!getValue(keys.code, ""),
      registry: safeJsonParse(getValue(keys.registry, null), null),
    };
  }

  function buildManagerRows(options) {
    const registry = options.registry || { scripts: [] };
    const url = options.url || "";
    const localStateById = options.localStateById || {};
    const remoteMetaById = options.remoteMetaById || {};
    const remoteStatusById = options.remoteStatusById || {};

    const rows = (registry.scripts || []).map((script) => {
      const localState = localStateById[script.id] || {};
      const localMeta = localState.meta || null;
      const remoteMeta = remoteMetaById[script.id] || null;
      const remoteStatus = remoteStatusById[script.id] || null;
      const appliesHere = Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern));
      const remoteVersion = remoteMeta && remoteMeta.version
        ? remoteMeta.version
        : (remoteStatus && remoteStatus.version ? remoteStatus.version : "-");
      const isNew = !!(remoteStatus && remoteStatus.kind === "new");
      const hasRemoteUpdate = !!(localMeta && localMeta.version && remoteMeta && remoteMeta.version && !remoteMeta.error
        && compareVersions(remoteMeta.version, localMeta.version) > 0);
      const hasUpdate = !!(remoteStatus && remoteStatus.kind === "update") || hasRemoteUpdate;

      return {
        id: script.id,
        name: script.name || script.id,
        description: script.description || "",
        appliesHere,
        enabled: isScriptEnabled(script, localState.enabledOverride),
        cachedVersion: localMeta && localMeta.version ? localMeta.version : "-",
        remoteVersion,
        hasUpdate,
        isNew,
        hasRemoteError: !!(remoteMeta && remoteMeta.error),
        lastSyncedAtLabel: formatSyncTime(localMeta && localMeta.lastSyncedAt),
        capabilitySummary: localMeta && localMeta.capabilities ? localMeta.capabilities : null,
      };
    });

    return rows.sort((left, right) => {
      if (left.isNew !== right.isNew) return left.isNew ? -1 : 1;
      if (left.appliesHere !== right.appliesHere) return left.appliesHere ? -1 : 1;
      return String(left.name).localeCompare(String(right.name));
    });
  }

  function gmRequest(details) {
    const request = root.GM_xmlhttpRequest || (typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : null);
    if (!request) return Promise.reject(new Error("GM_xmlhttpRequest unavailable"));
    return new Promise((resolve, reject) => {
      request(Object.assign({}, details, {
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
      }));
    });
  }

  async function fetchText(url) {
    const response = await gmRequest({
      method: "GET",
      url,
      headers: { "Cache-Control": "no-cache" },
    });
    if (Number(response.status) >= 400) throw new Error("HTTP " + response.status + " for " + url);
    return String(response.responseText || "");
  }

  async function fetchJson(url) {
    return JSON.parse(await fetchText(url));
  }

  function resolvePath(path) {
    return /^https?:\/\//i.test(String(path || "")) ? path : (RAW_BASE_URL + String(path || "").replace(/^\/+/, ""));
  }

  function evaluateModule(code, context) {
    const module = { exports: {} };
    const exports = module.exports;
    const fn = new Function("module", "exports", "context", code + "\n//# sourceURL=remote-userscript.js");
    fn(module, exports, context);
    return module.exports;
  }

  function evaluateLooseScript(code, context) {
    const fn = new Function("context", code + "\n//# sourceURL=remote-dependency.js");
    return fn(context);
  }

  function getManagerRowClassName(row) {
    return [
      row.appliesHere ? "tm-applies-row" : "",
      row.hasUpdate ? "tm-update-row" : "",
      row.isNew ? "tm-new-row" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function renderRemoteVersionCell(row) {
    if (row.hasRemoteError) {
      return "<span class='tm-badge tm-badge-error'>오류</span>";
    }
    if (row.isNew) {
      return "<div class='tm-version-stack'><span>"
        + escapeHtml(row.remoteVersion)
        + "</span><span class='tm-badge tm-badge-update'>신규</span></div>";
    }
    if (!row.hasUpdate) {
      return escapeHtml(row.remoteVersion);
    }
    return "<div class='tm-version-stack'><span>"
      + escapeHtml(row.remoteVersion)
      + "</span><span class='tm-badge tm-badge-update'>업데이트</span></div>";
  }

  async function loadRegistry() {
    const text = await fetchText(REGISTRY_URL);
    setValue(REGISTRY_RAW_KEY, text);
    setValue(REGISTRY_CHECKED_AT_KEY, nowIso());
    return JSON.parse(text);
  }

  async function loadScriptMeta(script) {
    const meta = await fetchJson(resolvePath(script.metaPath));
    meta.id = meta.id || script.id;
    return meta;
  }

  async function ensureAssetCode(scriptId, suffix, remoteVersion, url) {
    const key = buildAssetCacheKey(scriptId, suffix);
    const cachedPayload = safeJsonParse(getValue(key, null), null);
    let code = cachedPayload && cachedPayload.code;

    if (!cachedPayload || cachedPayload.version !== remoteVersion) {
      code = await fetchText(resolvePath(url));
      setValue(key, JSON.stringify({ version: remoteVersion, code }));
    }

    rememberAssetCacheKey(scriptId, key);
    return code;
  }

  async function loadCachedOrRemoteAsset(scriptId, suffix, remoteVersion, url, evaluator, context) {
    const code = await ensureAssetCode(scriptId, suffix, remoteVersion, url);
    return evaluator(code, context);
  }

  async function prewarmScriptAssets(script, meta) {
    const dependencies = Array.isArray(meta.dependencies) ? meta.dependencies : [];
    for (const dependency of dependencies) {
      await ensureAssetCode(
        script.id,
        dependency.id,
        dependency.version || meta.version,
        dependency.path
      );
    }
  }

  async function loadScriptCode(script, meta) {
    const keys = buildScriptStorageKeys(script.id);
    const cachedMeta = readCachedScriptMeta(script.id);
    const cachedCode = getValue(keys.code, null);

    if (!shouldRefreshCache(cachedMeta, meta) && cachedCode) {
      const mergedMeta = buildSyncedMeta(script, meta, cachedMeta, cachedMeta && cachedMeta.lastSyncedAt ? cachedMeta.lastSyncedAt : nowIso());
      setValue(keys.meta, JSON.stringify(mergedMeta));
      setValue(keys.registry, JSON.stringify(script));
      return cachedCode;
    }

    const codeText = await fetchText(resolvePath(meta.entry));
    const syncedAt = nowIso();
    const nextMeta = buildSyncedMeta(script, meta, cachedMeta, syncedAt);
    setValue(keys.meta, JSON.stringify(nextMeta));
    setValue(keys.code, codeText);
    setValue(keys.registry, JSON.stringify(script));
    return codeText;
  }

  async function prewarmScriptBundle(script, meta) {
    await prewarmScriptAssets(script, meta);
    await loadScriptCode(script, meta);
  }

  function downloadFile(details) {
    if (typeof GM_download !== "function") throw new Error("GM_download unavailable");
    return GM_download(details);
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(value);
      return;
    }
    if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === "function") {
      await root.navigator.clipboard.writeText(value);
      return;
    }
    throw new Error("clipboard unavailable");
  }

  function openExternalTab(url, options) {
    if (typeof GM_openInTab === "function") return GM_openInTab(url, options);
    return root.open(url, "_blank", "noopener");
  }

  function createLoaderApi(win, script, meta) {
    return {
      rawBaseUrl: RAW_BASE_URL,
      registryUrl: REGISTRY_URL,
      script,
      meta,
      loaderApiVersion: LOADER_API_VERSION,
      request: gmRequest,
      gmRequest,
      download: downloadFile,
      copyText: copyTextToClipboard,
      notify,
      openTab: openExternalTab,
      storage: {
        get: getValue,
        set: setValue,
        delete: deleteValue,
        list: getValueList,
      },
      capabilities: normalizeCapabilities(meta && meta.capabilities),
      focusWindow: function () {
        if (win && typeof win.focus === "function") win.focus();
      },
    };
  }

  async function runScript(script, meta, context) {
    const runContext = Object.assign({}, context, {
      loader: Object.assign({}, (context && context.loader) || {}, createLoaderApi(context && context.window, script, meta)),
    });
    const dependencies = Array.isArray(meta.dependencies) ? meta.dependencies : [];
    for (const dependency of dependencies) {
      await loadCachedOrRemoteAsset(
        script.id,
        dependency.id,
        dependency.version || meta.version,
        dependency.path,
        evaluateLooseScript,
        runContext
      );
    }

    const code = await loadScriptCode(script, meta);
    const remoteModule = evaluateModule(code, runContext);
    if (!remoteModule || typeof remoteModule.run !== "function") {
      throw new Error(script.id + " module does not export run(context)");
    }
    remoteModule.run(runContext);

    const statusMap = readRemoteStatusMap();
    const statusEntry = statusMap[script.id];
    const cachedMeta = readCachedScriptMeta(script.id);
    if (statusEntry && cachedMeta && (!statusEntry.version || compareVersions(cachedMeta.version, statusEntry.version) >= 0)) {
      clearRemoteStatusEntry(statusMap, script.id);
      writeRemoteStatusMap(statusMap);
      if (context && context.state) context.state.remoteStatusById = statusMap;
    }
  }

  function notify(input) {
    const payload = typeof input === "string" ? { text: input } : Object.assign({}, input || {});
    const text = String(payload.text || payload.message || "");
    if (!text) return;
    if (typeof GM_notification === "function") {
      GM_notification(Object.assign({ text, title: "VX Console", timeout: 3000 }, payload, { text, title: payload.title || "VX Console" }));
    } else {
      console.log("[tamp-loader]", text);
    }
  }

  function getManagerWindowFeatures() {
    return [
      "popup=yes",
      "width=1160",
      "height=860",
      "left=120",
      "top=80",
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");
  }

  function buildManagerDocumentHtml() {
    return [
      "<!doctype html>",
      "<html lang='ko'>",
      "<head>",
      "<meta charset='utf-8'>",
      "<meta name='viewport' content='width=device-width, initial-scale=1'>",
      "<title>VX Console</title>",
      "</head>",
      "<body>",
      "<div id='" + MANAGER_ROOT_ID + "'></div>",
      "</body>",
      "</html>",
    ].join("");
  }

  function buildManagerShellHtml() {
    return [
      "<div class='tm-manager'>",
      "<div class='tm-hero'>",
      "<div class='tm-head-text tm-hero-copy'>",
      "<span class='tm-eyebrow'>스크립트 관리</span>",
      "<h1>VX Console</h1>",
      "<p id='tm-loader-manager-subtitle'>현재 페이지 기준으로 로드 가능한 스크립트 상태를 확인합니다.</p>",
      "</div>",
      "<div class='tm-head-actions'>",
      "<button type='button' id='tm-loader-filter-current'>현재 페이지만</button>",
      "<button type='button' id='tm-loader-sync-all' class='tm-primary'>전체 동기화</button>",
      "<button type='button' id='tm-loader-clear-all'>전체 캐시 삭제</button>",
      "<button type='button' id='tm-loader-close'>닫기</button>",
      "</div>",
      "</div>",
      "<div class='tm-summary-grid' id='tm-loader-summary'></div>",
      "<div class='tm-status-card'>",
      "<div class='tm-status-label'>동기화 상태</div>",
      "<div class='tm-status' id='tm-loader-status'></div>",
      "</div>",
      "<div class='tm-table-card'>",
      "<div class='tm-table-head'>",
      "<div>",
      "<span class='tm-section-kicker'>로드 표면</span>",
      "<h2>스크립트 구성</h2>",
      "</div>",
      "<div class='tm-section-note'>현재 페이지 적용 여부, 캐시 버전, 원격 메타 상태를 한 번에 확인합니다.</div>",
      "</div>",
      "<div class='tm-table-wrap'>",
      "<table>",
      "<thead><tr>",
      "<th style='width:280px'>스크립트</th>",
      "<th style='width:96px'>현재 페이지</th>",
      "<th style='width:90px'>상태</th>",
      "<th style='width:104px'>캐시 버전</th>",
      "<th style='width:104px'>원격 버전</th>",
      "<th style='width:132px'>마지막 동기화</th>",
      "<th style='width:220px'>동작</th>",
      "</tr></thead>",
      "<tbody id='tm-loader-rows'></tbody>",
      "</table>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function applyManagerStyles(doc) {
    if (doc.getElementById(MANAGER_STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = MANAGER_STYLE_ID;
    style.textContent = [
      "html,body{margin:0;padding:0;background:#f9f9f9;color:#2d3435;font-family:'Segoe UI Variable Text','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      "#" + MANAGER_ROOT_ID + "{min-height:100vh;padding:20px;box-sizing:border-box}",
      ".tm-manager{max-width:1240px;margin:0 auto;display:grid;gap:14px}",
      ".tm-hero,.tm-status-card,.tm-table-card{background:#ffffff;border:1px solid #dde4e5;border-radius:16px;box-shadow:none}",
      ".tm-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:22px 24px}",
      ".tm-eyebrow{display:inline-flex;align-items:center;gap:6px;color:#455a64;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-head-text h1{margin:8px 0 0;font-size:28px;line-height:1.05;font-weight:800;letter-spacing:-.04em;color:#2d3435}",
      ".tm-head-text p{margin:8px 0 0;color:#5a6061;font-size:12px;line-height:1.6;word-break:break-all;max-width:none}",
      ".tm-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}",
      "button{height:34px;padding:0 14px;border:1px solid #dde4e5;background:#ffffff;color:#455a64;border-radius:10px;cursor:pointer;font-size:12px;line-height:1;font-family:inherit;font-weight:700;transition:transform .16s ease,border-color .16s ease,background-color .16s ease,color .16s ease}",
      "button:hover{transform:translateY(-1px);border-color:#c4cccd;background:#f7f9f9}",
      "button:focus{outline:2px solid rgba(84,96,103,.2);outline-offset:2px}",
      "button:disabled{background:#f3f5f5;color:#94a0a2;border-color:#dde4e5;cursor:default;transform:none}",
      ".tm-primary{background:linear-gradient(180deg,#5c6970 0%,#455a64 100%);border-color:#455a64;color:#fff}",
      ".tm-filter-on{background:#f2f4f4;border-color:#cfd7d8;color:#455a64}",
      ".tm-toggle-on{background:#edf5f1;border-color:#d1e2da;color:#2f6b57}",
      ".tm-toggle-off{background:#f7f0e8;border-color:#e3d4c0;color:#8b6b3f}",
      ".tm-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}",
      ".tm-summary-item{padding:16px 18px;border:1px solid #dde4e5;border-radius:14px;background:#f2f4f4}",
      ".tm-summary-label{display:block;color:#5a6061;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-summary-value{display:block;margin-top:8px;color:#2d3435;font-size:26px;line-height:1;font-weight:800;letter-spacing:-.04em}",
      ".tm-summary-meta{display:block;margin-top:6px;color:#5a6061;font-size:12px}",
      ".tm-status-card{padding:16px 18px}",
      ".tm-status-label{display:block;color:#5a6061;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-status{margin-top:8px;padding:12px 14px;border:1px solid #dde4e5;border-radius:12px;background:#f2f4f4;color:#455a64;font-size:13px;min-height:20px;line-height:1.6}",
      ".tm-table-card{overflow:hidden}",
      ".tm-table-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;padding:18px 20px 14px;border-bottom:1px solid #dde4e5;background:#ffffff}",
      ".tm-table-head h2{margin:8px 0 0;font-size:18px;line-height:1.1;color:#2d3435;letter-spacing:-.03em}",
      ".tm-section-kicker{display:inline-flex;align-items:center;gap:6px;color:#455a64;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-section-note{color:#5a6061;font-size:12px;line-height:1.5;max-width:320px;text-align:right}",
      ".tm-table-wrap{overflow:auto;max-height:calc(100vh - 320px)}",
      "table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}",
      "th,td{padding:12px 14px;border-bottom:1px solid #dde4e5;text-align:left;vertical-align:middle;word-break:break-word;font-size:12px}",
      "th{position:sticky;top:0;background:#f2f4f4;color:#5a6061;z-index:1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      "tr.tm-applies-row{background:#fbfcfc}",
      "tr:hover td{background:#f7f9f9}",
      ".tm-script-name{display:block;font-weight:800;color:#2d3435;font-size:14px;letter-spacing:-.02em}",
      ".tm-script-id{display:block;margin-top:4px;color:#5a6061;font-size:11px}",
      ".tm-script-desc{display:block;margin-top:6px;color:#5a6061;font-size:11px;line-height:1.55}",
      ".tm-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;border:1px solid #dde4e5;background:#f2f4f4;color:#5a6061;font-size:11px;font-weight:800}",
      ".tm-badge-match{background:#edf5f1;border-color:#d1e2da;color:#2f6b57}",
      ".tm-badge-miss{background:#f7f9f9;border-color:#dde4e5;color:#5a6061}",
      ".tm-badge-error{background:#fbefee;border-color:#e2c3c1;color:#9f403d}",
      ".tm-badge-update{background:#fff1dc;border-color:#ecd7b0;color:#946318}",
      ".tm-actions{display:flex;gap:6px;flex-wrap:wrap}",
      ".tm-version-stack{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".tm-update-row td{background:#fff9f0}",
      ".tm-update-row td:first-child{box-shadow:inset 3px 0 0 #d19a3a}",
      ".tm-update-row:hover td{background:#fff3e2}",
      ".tm-empty{padding:56px 16px;text-align:center;color:#5a6061}",
      "@media (max-width:980px){#" + MANAGER_ROOT_ID + "{padding:12px}.tm-hero{padding:18px;align-items:flex-start;flex-direction:column}.tm-section-note{text-align:left;max-width:none}.tm-table-head{padding:16px;align-items:flex-start;flex-direction:column}.tm-table-wrap{max-height:none}}",
    ].join("\n");
    doc.head.appendChild(style);
  }

  function isManagerOpen(state) {
    return !!(state.managerWindow && !state.managerWindow.closed);
  }

  function disposeManagerRefs(state) {
    state.managerOpen = false;
    state.managerWindow = null;
    state.managerDocument = null;
    state.managerElements = null;
  }

  function bootstrapManagerDocument(doc) {
    if (doc.getElementById(MANAGER_ROOT_ID)) return;
    doc.open();
    doc.write(buildManagerDocumentHtml());
    doc.close();
  }

  function bindManagerEvents(state, elements, popup) {
    if (elements.bound) return;

    elements.close.addEventListener("click", function () {
      closeManager(state);
    });

    elements.filterCurrent.addEventListener("click", function () {
      state.managerFilterCurrentOnly = !state.managerFilterCurrentOnly;
      renderManager(state);
    });

    elements.syncAll.addEventListener("click", function () {
      syncScripts(state);
    });

    elements.clearAll.addEventListener("click", function () {
      clearAllCaches(state);
    });

    elements.root.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.getAttribute("data-action");
      const scriptId = button.getAttribute("data-script-id");
      if (action === "toggle") toggleScriptEnabled(state, scriptId);
      if (action === "sync") syncScripts(state, [scriptId]);
      if (action === "clear") clearScriptCaches(state, [scriptId]);
    });

    popup.addEventListener("beforeunload", function () {
      disposeManagerRefs(state);
    });

    docAddKeyListener(elements.doc, state);
    elements.bound = true;
  }

  function docAddKeyListener(doc, state) {
    if (doc.__tmLoaderEscBound) return;
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeManager(state);
    });
    doc.__tmLoaderEscBound = true;
  }

  function openPopupWindow(state) {
    let popup = null;

    try {
      popup = state.win.open("about:blank", MANAGER_WINDOW_NAME, getManagerWindowFeatures());
    } catch (error) {
      popup = null;
    }

    if (!popup) {
      notify("관리 창이 차단되었습니다. 팝업 차단을 해제해 주세요.");
      return null;
    }

    try {
      bootstrapManagerDocument(popup.document);
    } catch (error) {
      const fallbackName = MANAGER_WINDOW_NAME + "-" + Date.now();
      popup = state.win.open("about:blank", fallbackName, getManagerWindowFeatures());
      if (!popup) {
        notify("관리 창을 열지 못했습니다.");
        return null;
      }
      bootstrapManagerDocument(popup.document);
    }

    state.managerWindow = popup;
    state.managerDocument = popup.document;
    state.managerOpen = true;
    popup.focus();
    return popup;
  }

  function ensureManagerUi(state) {
    const popup = isManagerOpen(state) ? state.managerWindow : openPopupWindow(state);
    if (!popup) return null;

    const doc = popup.document;
    bootstrapManagerDocument(doc);
    applyManagerStyles(doc);

    const root = doc.getElementById(MANAGER_ROOT_ID);
    if (!root) return null;

    if (!state.managerElements || state.managerElements.doc !== doc) {
      root.innerHTML = buildManagerShellHtml();
      const elements = {
        doc,
        root,
        subtitle: doc.getElementById("tm-loader-manager-subtitle"),
        summary: doc.getElementById("tm-loader-summary"),
        status: doc.getElementById("tm-loader-status"),
        rows: doc.getElementById("tm-loader-rows"),
        close: doc.getElementById("tm-loader-close"),
        filterCurrent: doc.getElementById("tm-loader-filter-current"),
        syncAll: doc.getElementById("tm-loader-sync-all"),
        clearAll: doc.getElementById("tm-loader-clear-all"),
        bound: false,
      };
      bindManagerEvents(state, elements, popup);
      state.managerElements = elements;
    }

    return state.managerElements;
  }

  function readLocalStateMap(registry) {
    const scripts = Array.isArray(registry && registry.scripts) ? registry.scripts : [];
    const result = {};
    scripts.forEach((script) => {
      result[script.id] = readScriptLocalState(script.id);
    });
    return result;
  }

  function renderManager(state) {
    if (!isManagerOpen(state)) return;

    const elements = ensureManagerUi(state);
    if (!elements) return;

    const registry = state.registry || { scripts: [] };
    const localStateById = readLocalStateMap(registry);
    const allRows = buildManagerRows({
      registry,
      url: state.url,
      localStateById,
      remoteMetaById: state.remoteMetaById,
    });
    const rows = allRows.filter((row) => !state.managerFilterCurrentOnly || row.appliesHere);
    const totalCount = allRows.length;
    const appliesCount = allRows.filter((row) => row.appliesHere).length;
    const enabledCount = allRows.filter((row) => row.enabled).length;

    elements.doc.title = "VX Console";
    elements.subtitle.textContent = formatManagerSubtitle(state.url);
    elements.filterCurrent.className = state.managerFilterCurrentOnly ? "tm-filter-on" : "";
    elements.filterCurrent.textContent = state.managerFilterCurrentOnly ? "전체 보기" : "현재 페이지만";
    elements.syncAll.disabled = !!state.managerBusy;
    elements.clearAll.disabled = !!state.managerBusy;
    elements.summary.innerHTML = [
      "<div class='tm-summary-item'><span class='tm-summary-label'>전체 스크립트</span><strong class='tm-summary-value'>" + totalCount + "</strong><span class='tm-summary-meta'>등록된 표면 수</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>현재 페이지 적용</span><strong class='tm-summary-value'>" + appliesCount + "</strong><span class='tm-summary-meta'>현재 URL 매칭 기준</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>활성화</span><strong class='tm-summary-value'>" + enabledCount + "</strong><span class='tm-summary-meta'>이 PC에서 ON 상태</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>로더 버전</span><strong class='tm-summary-value'>" + escapeHtml(LOADER_VERSION) + "</strong><span class='tm-summary-meta'>관리창과 로더 동기화 기준</span></div>",
    ].join("");
    elements.status.textContent = state.managerStatusText || state.registryError || "로더 상태를 불러왔습니다.";

    if (!rows.length) {
      elements.rows.innerHTML = "<tr><td colspan='7' class='tm-empty'>표시할 스크립트가 없습니다.</td></tr>";
      return;
    }

    elements.rows.innerHTML = rows.map((row) => [
      "<tr class='" + getManagerRowClassName(row) + "'>",
      "<td>",
      "<span class='tm-script-name'>" + escapeHtml(row.name) + "</span>",
      "<span class='tm-script-id'>" + escapeHtml(row.id) + "</span>",
      (row.description ? "<span class='tm-script-desc'>" + escapeHtml(row.description) + "</span>" : ""),
      "</td>",
      "<td>" + (row.appliesHere
        ? "<span class='tm-badge tm-badge-match'>적용중</span>"
        : "<span class='tm-badge tm-badge-miss'>대기</span>") + "</td>",
      "<td><button type='button' class='" + (row.enabled ? "tm-toggle-on" : "tm-toggle-off") + "' data-action='toggle' data-script-id='" + escapeHtml(row.id) + "'>" + (row.enabled ? "ON" : "OFF") + "</button></td>",
      "<td>" + escapeHtml(row.cachedVersion) + "</td>",
      "<td>" + (row.hasRemoteError
        ? "<span class='tm-badge tm-badge-error'>오류</span>"
        : escapeHtml(row.remoteVersion)) + "</td>",
      "<td>" + escapeHtml(row.lastSyncedAtLabel) + "</td>",
      "<td><div class='tm-actions'><button type='button' data-action='sync' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">다시 동기화</button><button type='button' data-action='clear' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">캐시 삭제</button></div></td>",
      "</tr>",
    ].join("")).join("");

    rows.forEach((row, index) => {
      const tableRow = elements.rows.children[index];
      if (!tableRow) return;
      const remoteVersionCell = tableRow.children[4];
      if (remoteVersionCell) remoteVersionCell.innerHTML = renderRemoteVersionCell(row);
    });
  }

  function openManager(state) {
    const elements = ensureManagerUi(state);
    if (!elements) return;
    state.managerOpen = true;
    renderManager(state);
    refreshRegistry(state, { refreshRemote: true });
  }

  function closeManager(state) {
    if (!isManagerOpen(state)) {
      disposeManagerRefs(state);
      return;
    }
    try {
      state.managerWindow.close();
    } finally {
      disposeManagerRefs(state);
    }
  }

  async function refreshRemoteMeta(state, scriptIds) {
    if (!state.registry) return;
    const scripts = (state.registry.scripts || []).filter((script) => !scriptIds || scriptIds.indexOf(script.id) !== -1);
    await Promise.all(scripts.map(async (script) => {
      try {
        state.remoteMetaById[script.id] = await loadScriptMeta(script);
      } catch (error) {
        state.remoteMetaById[script.id] = { error: error.message };
      }
    }));
  }

  async function refreshRegistry(state, options) {
    const opts = Object.assign({ refreshRemote: false }, options);
    state.managerBusy = true;
    state.managerStatusText = "레지스트리를 확인하는 중입니다.";
    renderManager(state);

    try {
      state.registry = await loadRegistry();
      state.registryError = "";

      if (opts.refreshRemote) {
        state.managerStatusText = "원격 메타 정보를 불러오는 중입니다.";
        renderManager(state);
        await refreshRemoteMeta(state);
      }

      state.managerStatusText = "로더 상태를 최신 정보로 갱신했습니다.";
    } catch (error) {
      const cachedRegistry = safeJsonParse(getValue(STORAGE_PREFIX + ":registry:raw", ""), null);
      if (cachedRegistry) {
        state.registry = cachedRegistry;
        state.registryError = "원격 레지스트리 조회에 실패해 캐시를 사용합니다.";
      } else {
        state.registryError = "레지스트리를 불러오지 못했습니다.";
      }
      state.managerStatusText = state.registryError;
    } finally {
      state.managerBusy = false;
      renderManager(state);
    }
  }

  async function syncScripts(state, scriptIds) {
    if (!state.registry) await refreshRegistry(state);
    if (!state.registry) return;

    const scripts = (state.registry.scripts || []).filter((script) => !scriptIds || scriptIds.indexOf(script.id) !== -1);
    state.managerBusy = true;
    state.managerStatusText = scripts.length === 1
      ? ((scripts[0].name || scripts[0].id) + " 동기화 중입니다.")
      : "전체 스크립트를 동기화하는 중입니다.";
    renderManager(state);

    try {
      for (const script of scripts) {
        const meta = await loadScriptMeta(script);
        state.remoteMetaById[script.id] = meta;
        await loadScriptCode(script, meta);
      }
      state.managerStatusText = scripts.length === 1
        ? ((scripts[0].name || scripts[0].id) + " 동기화를 완료했습니다.")
        : "전체 스크립트 동기화를 완료했습니다.";
    } catch (error) {
      state.managerStatusText = "동기화 실패: " + error.message;
    } finally {
      state.managerBusy = false;
      renderManager(state);
    }
  }

  function clearScriptCaches(state, scriptIds) {
    const scripts = ((state.registry && state.registry.scripts) || []).filter((script) => !scriptIds || scriptIds.indexOf(script.id) !== -1);
    scripts.forEach((script) => {
      const keys = buildScriptStorageKeys(script.id);
      deleteValue(keys.meta);
      deleteValue(keys.code);
      deleteValue(keys.registry);
      delete state.remoteMetaById[script.id];
    });
    state.managerStatusText = scripts.length === 1
      ? ((scripts[0].name || scripts[0].id) + " 캐시를 삭제했습니다.")
      : "선택한 스크립트 캐시를 삭제했습니다.";
    renderManager(state);
  }

  function clearAllCaches(state) {
    clearScriptCaches(state, ((state.registry && state.registry.scripts) || []).map((script) => script.id));
  }

  function toggleScriptEnabled(state, scriptId) {
    const script = ((state.registry && state.registry.scripts) || []).find((item) => item.id === scriptId);
    if (!script) return;
    const keys = buildScriptStorageKeys(scriptId);
    const current = getValue(keys.enabled, undefined);
    const enabled = isScriptEnabled(script, current);
    setValue(keys.enabled, !enabled);
    state.managerStatusText = (script.name || script.id) + " 상태를 " + (!enabled ? "활성화" : "비활성화") + "로 변경했습니다. 새로고침 후 적용됩니다.";
    renderManager(state);
  }

  function registerMenus(state) {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("VX Console 열기", function () {
      openManager(state);
    });
  }

  async function bootstrap(win) {
    const state = {
      win,
      doc: win.document,
      url: String(win.location.href || ""),
      registry: safeJsonParse(getValue(STORAGE_PREFIX + ":registry:raw", ""), null),
      registryError: "",
      remoteMetaById: {},
      managerBusy: false,
      managerOpen: false,
      managerFilterCurrentOnly: false,
      managerStatusText: "",
      managerWindow: null,
      managerDocument: null,
      managerElements: null,
    };

    registerMenus(state);

    if (!state.registry) {
      await refreshRegistry(state);
    } else {
      refreshRegistry(state);
    }

    const matchingScripts = findMatchingScripts(state.registry || { scripts: [] }, state.url);
    if (!matchingScripts.length) return;

    for (const script of matchingScripts) {
      const keys = buildScriptStorageKeys(script.id);
      const enabled = isScriptEnabled(script, getValue(keys.enabled, undefined));
      if (!enabled) continue;

      let meta;
      try {
        meta = await loadScriptMeta(script);
      } catch (error) {
        const cachedMeta = safeJsonParse(getValue(keys.meta, null), null);
        const cachedCode = getValue(keys.code, null);
        if (!cachedMeta || !cachedCode) {
          console.error("[tamp-loader] meta load failed", script.id, error);
          continue;
        }
        meta = cachedMeta;
      }

      try {
        await runScript(script, meta, {
          window: win,
          document: win.document,
          loader: {
            rawBaseUrl: RAW_BASE_URL,
            registryUrl: REGISTRY_URL,
            script,
            meta,
            gmRequest,
          },
        });
      } catch (error) {
        console.error("[tamp-loader] script run failed", script.id, error);
      }
    }
  }

  function notifyOnceForStatus(script, entry) {
    if (!entry) return entry;
    const notificationKey = entry.kind === "new"
      ? ("new:" + (entry.detectedAt || ""))
      : (String(entry.version || ""));
    if (!notificationKey || entry.notifiedVersion === notificationKey) return entry;
    if (entry.kind === "update") {
      notify({ text: (script.name || script.id) + " 새 버전 " + entry.version + "을 확인했습니다.", timeout: 5000 });
    }
    if (entry.kind === "new") {
      notify({ text: (script.name || script.id) + " 모듈이 새로 추가되었습니다.", timeout: 5000 });
    }
    return Object.assign({}, entry, { notifiedVersion: notificationKey });
  }

  function buildManagerShellHtml() {
    return [
      "<div class='tm-manager'>",
      "<div class='tm-hero'>",
      "<div class='tm-head-text tm-hero-copy'>",
      "<span class='tm-eyebrow'>스크립트 관리</span>",
      "<h1>VX Console</h1>",
      "<p id='tm-loader-manager-subtitle'>현재 페이지 기준으로 적용 가능한 스크립트 상태를 확인합니다.</p>",
      "</div>",
      "<div class='tm-head-actions'>",
      "<button type='button' id='tm-loader-filter-current'>현재 페이지만</button>",
      "<button type='button' id='tm-loader-sync-all' class='tm-primary'>전체 동기화</button>",
      "<button type='button' id='tm-loader-clear-all'>전체 캐시 삭제</button>",
      "<button type='button' id='tm-loader-close'>닫기</button>",
      "</div>",
      "</div>",
      "<div class='tm-summary-grid' id='tm-loader-summary'></div>",
      "<div class='tm-status-card'>",
      "<div class='tm-status-label'>로드 상태</div>",
      "<div class='tm-status' id='tm-loader-status'></div>",
      "</div>",
      "<div class='tm-table-card'>",
      "<div class='tm-table-head'>",
      "<div>",
      "<span class='tm-section-kicker'>로드 표면</span>",
      "<h2>스크립트 구성</h2>",
      "</div>",
      "<div class='tm-section-note'>현재 페이지 적용 여부와 캐시 버전, 원격 상태를 한 번에 확인합니다.</div>",
      "</div>",
      "<div class='tm-table-wrap'>",
      "<table>",
      "<thead><tr>",
      "<th style='width:280px'>스크립트</th>",
      "<th style='width:96px'>현재 페이지</th>",
      "<th style='width:90px'>상태</th>",
      "<th style='width:104px'>캐시 버전</th>",
      "<th style='width:132px'>원격 상태</th>",
      "<th style='width:132px'>마지막 동기화</th>",
      "<th style='width:220px'>동작</th>",
      "</tr></thead>",
      "<tbody id='tm-loader-rows'></tbody>",
      "</table>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  function applyManagerStyles(doc) {
    if (doc.getElementById(MANAGER_STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = MANAGER_STYLE_ID;
    style.textContent = [
      "html,body{margin:0;padding:0;background:#f9f9f9;color:#2d3435;font-family:'Segoe UI Variable Text','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      "#" + MANAGER_ROOT_ID + "{min-height:100vh;padding:20px;box-sizing:border-box}",
      ".tm-manager{max-width:1240px;margin:0 auto;display:grid;gap:14px}",
      ".tm-hero,.tm-status-card,.tm-table-card{background:#ffffff;border:1px solid #dde4e5;border-radius:16px;box-shadow:none}",
      ".tm-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:22px 24px}",
      ".tm-eyebrow{display:inline-flex;align-items:center;gap:6px;color:#455a64;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-head-text h1{margin:8px 0 0;font-size:28px;line-height:1.05;font-weight:800;letter-spacing:-.04em;color:#2d3435}",
      ".tm-head-text p{margin:8px 0 0;color:#5a6061;font-size:12px;line-height:1.6;word-break:break-all;max-width:none}",
      ".tm-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}",
      "button{height:34px;padding:0 14px;border:1px solid #dde4e5;background:#ffffff;color:#455a64;border-radius:10px;cursor:pointer;font-size:12px;line-height:1;font-family:inherit;font-weight:700;transition:transform .16s ease,border-color .16s ease,background-color .16s ease,color .16s ease}",
      "button:hover{transform:translateY(-1px);border-color:#c4cccd;background:#f7f9f9}",
      "button:focus{outline:2px solid rgba(84,96,103,.2);outline-offset:2px}",
      "button:disabled{background:#f3f5f5;color:#94a0a2;border-color:#dde4e5;cursor:default;transform:none}",
      ".tm-primary{background:linear-gradient(180deg,#5c6970 0%,#455a64 100%);border-color:#455a64;color:#fff}",
      ".tm-filter-on{background:#f2f4f4;border-color:#cfd7d8;color:#455a64}",
      ".tm-toggle-on{background:#edf5f1;border-color:#d1e2da;color:#2f6b57}",
      ".tm-toggle-off{background:#f7f0e8;border-color:#e3d4c0;color:#8b6b3f}",
      ".tm-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}",
      ".tm-summary-item{padding:16px 18px;border:1px solid #dde4e5;border-radius:14px;background:#f2f4f4}",
      ".tm-summary-label{display:block;color:#5a6061;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-summary-value{display:block;margin-top:8px;color:#2d3435;font-size:26px;line-height:1;font-weight:800;letter-spacing:-.04em}",
      ".tm-summary-meta{display:block;margin-top:6px;color:#5a6061;font-size:12px}",
      ".tm-status-card{padding:16px 18px}",
      ".tm-status-label{display:block;color:#5a6061;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-status{margin-top:8px;padding:12px 14px;border:1px solid #dde4e5;border-radius:12px;background:#f2f4f4;color:#455a64;font-size:13px;min-height:20px;line-height:1.6}",
      ".tm-table-card{overflow:hidden}",
      ".tm-table-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;padding:18px 20px 14px;border-bottom:1px solid #dde4e5;background:#ffffff}",
      ".tm-table-head h2{margin:8px 0 0;font-size:18px;line-height:1.1;color:#2d3435;letter-spacing:-.03em}",
      ".tm-section-kicker{display:inline-flex;align-items:center;gap:6px;color:#455a64;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-section-note{color:#5a6061;font-size:12px;line-height:1.5;max-width:320px;text-align:right}",
      ".tm-table-wrap{overflow:auto;max-height:calc(100vh - 320px)}",
      "table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}",
      "th,td{padding:12px 14px;border-bottom:1px solid #dde4e5;text-align:left;vertical-align:middle;word-break:break-word;font-size:12px}",
      "th{position:sticky;top:0;background:#f2f4f4;color:#5a6061;z-index:1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      "tr.tm-applies-row{background:#fbfcfc}",
      "tr.tm-new-row td{background:#eef5ff}",
      "tr.tm-new-row td:first-child{box-shadow:inset 3px 0 0 #4c79c2}",
      "tr.tm-new-row:hover td{background:#e7f1ff}",
      "tr:hover td{background:#f7f9f9}",
      ".tm-script-name{display:block;font-weight:800;color:#2d3435;font-size:14px;letter-spacing:-.02em}",
      ".tm-script-id{display:block;margin-top:4px;color:#5a6061;font-size:11px}",
      ".tm-script-desc{display:block;margin-top:6px;color:#5a6061;font-size:11px;line-height:1.55}",
      ".tm-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;border:1px solid #dde4e5;background:#f2f4f4;color:#5a6061;font-size:11px;font-weight:800}",
      ".tm-badge-match{background:#edf5f1;border-color:#d1e2da;color:#2f6b57}",
      ".tm-badge-miss{background:#f7f9f9;border-color:#dde4e5;color:#5a6061}",
      ".tm-badge-error{background:#fbefee;border-color:#e2c3c1;color:#9f403d}",
      ".tm-badge-update{background:#fff1dc;border-color:#ecd7b0;color:#946318}",
      ".tm-actions{display:flex;gap:6px;flex-wrap:wrap}",
      ".tm-version-stack{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".tm-update-row td{background:#fff9f0}",
      ".tm-update-row td:first-child{box-shadow:inset 3px 0 0 #d19a3a}",
      ".tm-update-row:hover td{background:#fff3e2}",
      ".tm-empty{padding:56px 16px;text-align:center;color:#5a6061}",
      "@media (max-width:980px){#" + MANAGER_ROOT_ID + "{padding:12px}.tm-hero{padding:18px;align-items:flex-start;flex-direction:column}.tm-section-note{text-align:left;max-width:none}.tm-table-head{padding:16px;align-items:flex-start;flex-direction:column}.tm-table-wrap{max-height:none}}",
    ].join("\n");
    doc.head.appendChild(style);
  }

  function getScriptsFromRegistry(state, scriptIds, onlyEnabled) {
    const scripts = (state.registry && state.registry.scripts) || [];
    return scripts.filter((script) => {
      if (scriptIds && scriptIds.indexOf(script.id) === -1) return false;
      if (!onlyEnabled) return true;
      return isScriptEnabled(script, getValue(buildScriptStorageKeys(script.id).enabled, undefined));
    });
  }

  function persistRemoteStatusMap(state, statusMap) {
    state.remoteStatusById = statusMap;
    writeRemoteStatusMap(statusMap);
  }

  function updateScriptRemoteStatus(state, script, remoteMeta, options) {
    const opts = Object.assign({ isNew: false, keepExisting: true, notifyChanges: true }, options);
    const statusMap = Object.assign({}, state.remoteStatusById || {});
    const localMeta = readCachedScriptMeta(script.id);
    const existingStatus = statusMap[script.id] || null;
    let nextEntry = null;

    if (opts.isNew) {
      nextEntry = {
        kind: "new",
        version: remoteMeta && remoteMeta.version ? remoteMeta.version : "",
        loaderApiVersion: Number((remoteMeta && remoteMeta.loaderApiVersion) || 1) || 1,
        capabilities: normalizeCapabilities(remoteMeta && remoteMeta.capabilities),
      };
    } else if (localMeta && remoteMeta && shouldRefreshCache(localMeta, remoteMeta)) {
      nextEntry = {
        kind: "update",
        version: remoteMeta.version,
        loaderApiVersion: Number(remoteMeta.loaderApiVersion || 1) || 1,
        capabilities: normalizeCapabilities(remoteMeta.capabilities),
      };
    } else if (opts.keepExisting && existingStatus && existingStatus.kind === "new") {
      nextEntry = existingStatus;
    } else if (opts.keepExisting && existingStatus && existingStatus.kind === "update" && remoteMeta && existingStatus.version === remoteMeta.version) {
      nextEntry = existingStatus;
    }

    if (nextEntry) {
      updateRemoteStatusEntry(statusMap, script, nextEntry);
      if (opts.notifyChanges) {
        statusMap[script.id] = notifyOnceForStatus(script, statusMap[script.id]);
      }
    } else {
      clearRemoteStatusEntry(statusMap, script.id);
    }

    persistRemoteStatusMap(state, statusMap);
  }

  function buildManagerStatusText(state, counts) {
    const parts = [];
    if (state.registryError) parts.push(state.registryError);
    if (state.lastRegistryCheckedAt) parts.push("registry 확인 " + formatSyncTime(state.lastRegistryCheckedAt));
    if (state.lastMetaPrewarmedAt) parts.push("meta 예열 " + formatSyncTime(state.lastMetaPrewarmedAt));
    if (counts.updateCount) parts.push("업데이트 대기 " + counts.updateCount + "건");
    if (counts.newCount) parts.push("신규 모듈 " + counts.newCount + "건");
    return parts.join(" · ") || "캐시 우선 부팅 상태입니다.";
  }

  function renderManager(state) {
    if (!isManagerOpen(state)) return;

    const elements = ensureManagerUi(state);
    if (!elements) return;

    const registry = state.registry || { scripts: [] };
    const localStateById = readLocalStateMap(registry);
    const allRows = buildManagerRows({
      registry,
      url: state.url,
      localStateById,
      remoteMetaById: state.remoteMetaById,
      remoteStatusById: state.remoteStatusById,
    });
    const rows = allRows.filter((row) => !state.managerFilterCurrentOnly || row.appliesHere);
    const counts = {
      totalCount: allRows.length,
      appliesCount: allRows.filter((row) => row.appliesHere).length,
      enabledCount: allRows.filter((row) => row.enabled).length,
      updateCount: allRows.filter((row) => row.hasUpdate).length,
      newCount: allRows.filter((row) => row.isNew).length,
    };

    elements.doc.title = "VX Console";
    elements.subtitle.textContent = formatManagerSubtitle(state.url);
    elements.filterCurrent.className = state.managerFilterCurrentOnly ? "tm-filter-on" : "";
    elements.filterCurrent.textContent = state.managerFilterCurrentOnly ? "전체 보기" : "현재 페이지만";
    elements.syncAll.disabled = !!state.managerBusy;
    elements.clearAll.disabled = !!state.managerBusy;
    elements.summary.innerHTML = [
      "<div class='tm-summary-item'><span class='tm-summary-label'>전체 스크립트</span><strong class='tm-summary-value'>" + counts.totalCount + "</strong><span class='tm-summary-meta'>등록된 모듈 수</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>현재 페이지 적용</span><strong class='tm-summary-value'>" + counts.appliesCount + "</strong><span class='tm-summary-meta'>현재 URL 기준</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>활성화</span><strong class='tm-summary-value'>" + counts.enabledCount + "</strong><span class='tm-summary-meta'>이 PC에서 ON 상태</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>업데이트 대기</span><strong class='tm-summary-value'>" + counts.updateCount + "</strong><span class='tm-summary-meta'>새 버전 감지</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>신규 모듈</span><strong class='tm-summary-value'>" + counts.newCount + "</strong><span class='tm-summary-meta'>최근 추가 모듈</span></div>",
      "<div class='tm-summary-item'><span class='tm-summary-label'>로더 버전</span><strong class='tm-summary-value'>" + escapeHtml(LOADER_VERSION) + "</strong><span class='tm-summary-meta'>API " + escapeHtml(String(LOADER_API_VERSION)) + "</span></div>",
    ].join("");
    elements.status.textContent = state.managerStatusText || buildManagerStatusText(state, counts);

    if (!rows.length) {
      elements.rows.innerHTML = "<tr><td colspan='7' class='tm-empty'>표시할 스크립트가 없습니다.</td></tr>";
      return;
    }

    elements.rows.innerHTML = rows.map((row) => [
      "<tr class='" + getManagerRowClassName(row) + "'>",
      "<td>",
      "<span class='tm-script-name'>" + escapeHtml(row.name) + "</span>",
      "<span class='tm-script-id'>" + escapeHtml(row.id) + "</span>",
      (row.description ? "<span class='tm-script-desc'>" + escapeHtml(row.description) + "</span>" : ""),
      "</td>",
      "<td>" + (row.appliesHere
        ? "<span class='tm-badge tm-badge-match'>적용중</span>"
        : "<span class='tm-badge tm-badge-miss'>대기</span>") + "</td>",
      "<td><button type='button' class='" + (row.enabled ? "tm-toggle-on" : "tm-toggle-off") + "' data-action='toggle' data-script-id='" + escapeHtml(row.id) + "'>" + (row.enabled ? "ON" : "OFF") + "</button></td>",
      "<td>" + escapeHtml(row.cachedVersion) + "</td>",
      "<td>" + renderRemoteVersionCell(row) + "</td>",
      "<td>" + escapeHtml(row.lastSyncedAtLabel) + "</td>",
      "<td><div class='tm-actions'><button type='button' data-action='sync' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">동기화</button><button type='button' data-action='clear' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">캐시 삭제</button></div></td>",
      "</tr>",
    ].join("")).join("");
  }

  function openManager(state) {
    const elements = ensureManagerUi(state);
    if (!elements) return;
    state.managerOpen = true;
    renderManager(state);
    refreshRegistry(state, { refreshRemote: true, force: true });
    prewarmEnabledScripts(state, { force: true, silent: true });
  }

  async function refreshRemoteMeta(state, scriptIds, options) {
    if (!state.registry) return;
    const opts = Object.assign({ newScriptIds: [], notifyChanges: true }, options);
    const newScriptIdSet = new Set(opts.newScriptIds || []);
    const scripts = getScriptsFromRegistry(state, scriptIds, false);
    await Promise.all(scripts.map(async (script) => {
      try {
        const remoteMeta = await loadScriptMeta(script);
        state.remoteMetaById[script.id] = remoteMeta;
        updateScriptRemoteStatus(state, script, remoteMeta, {
          isNew: newScriptIdSet.has(script.id),
          notifyChanges: opts.notifyChanges,
        });
      } catch (error) {
        state.remoteMetaById[script.id] = { error: error.message };
      }
    }));
  }

  function purgeScriptCaches(state, scriptIds, options) {
    const opts = Object.assign({ deleteEnabled: false, clearStatus: true }, options);
    const statusMap = Object.assign({}, state.remoteStatusById || {});
    scriptIds.forEach((scriptId) => {
      const keys = buildScriptStorageKeys(scriptId);
      readAssetCacheKeys(scriptId).forEach((assetKey) => deleteValue(assetKey));
      deleteValue(keys.assets);
      deleteValue(keys.meta);
      deleteValue(keys.code);
      deleteValue(keys.registry);
      if (opts.deleteEnabled) deleteValue(keys.enabled);
      delete state.remoteMetaById[scriptId];
      if (opts.clearStatus) clearRemoteStatusEntry(statusMap, scriptId);
    });
    if (opts.clearStatus) persistRemoteStatusMap(state, statusMap);
  }

  async function refreshRegistry(state, options) {
    const opts = Object.assign({ refreshRemote: false, force: false, silent: false, notifyChanges: true, trackNewScripts: true }, options);
    const shouldRefresh = opts.force || shouldCheckAt(state.lastRegistryCheckedAt, REGISTRY_CHECK_INTERVAL_MS);

    if (!shouldRefresh) {
      renderManager(state);
      return false;
    }

    const hasLock = opts.force || acquireRefreshLock(REGISTRY_LOCK_KEY, LOCK_TTL_MS);
    if (!hasLock) {
      renderManager(state);
      return false;
    }

    if (!opts.silent) {
      state.managerBusy = true;
      state.managerStatusText = "레지스트리를 확인하는 중입니다.";
      renderManager(state);
    }

    try {
      const previousRegistry = state.registry || readCachedRegistry() || { scripts: [] };
      const nextRegistry = await loadRegistry();
      const diff = diffRegistryScripts(previousRegistry, nextRegistry);
      state.registry = nextRegistry;
      state.registryError = "";
      state.lastRegistryCheckedAt = getValue(REGISTRY_CHECKED_AT_KEY, "");

      if (diff.removedIds.length) {
        purgeScriptCaches(state, diff.removedIds, { deleteEnabled: true, clearStatus: true });
      }

      const newScriptIds = opts.trackNewScripts === false ? [] : diff.addedIds;
      if (opts.refreshRemote || newScriptIds.length) {
        await refreshRemoteMeta(state, null, {
          newScriptIds,
          notifyChanges: opts.notifyChanges,
        });
      }

      state.managerStatusText = "registry를 최신 상태로 반영했습니다.";
      return true;
    } catch (error) {
      const cachedRegistry = readCachedRegistry();
      if (cachedRegistry) {
        state.registry = cachedRegistry;
        state.registryError = "원격 registry 확인에 실패해 캐시를 사용합니다.";
      } else {
        state.registryError = "registry를 불러오지 못했습니다.";
      }
      state.managerStatusText = state.registryError || ("registry 확인 실패: " + error.message);
      return false;
    } finally {
      if (!opts.force) releaseRefreshLock(REGISTRY_LOCK_KEY);
      if (!opts.silent) state.managerBusy = false;
      renderManager(state);
    }
  }

  async function prewarmEnabledScripts(state, options) {
    const opts = Object.assign({ force: false, silent: true, notifyChanges: true }, options);
    if (!state.registry) return false;
    if (!opts.force && !shouldCheckAt(state.lastMetaPrewarmedAt, META_PREWARM_INTERVAL_MS)) return false;
    if (!opts.force && !acquireRefreshLock(META_PREWARM_LOCK_KEY, LOCK_TTL_MS)) return false;

    try {
      const scripts = getScriptsFromRegistry(state, null, true);
      await Promise.all(scripts.map(async (script) => {
        try {
          const remoteMeta = await loadScriptMeta(script);
          state.remoteMetaById[script.id] = remoteMeta;
          updateScriptRemoteStatus(state, script, remoteMeta, { notifyChanges: opts.notifyChanges });
          const localState = readScriptLocalState(script.id);
          if (!localState.hasCode || shouldRefreshCache(localState.meta, remoteMeta)) {
            await prewarmScriptBundle(script, remoteMeta);
          }
        } catch (error) {
          state.remoteMetaById[script.id] = { error: error.message };
        }
      }));
      state.lastMetaPrewarmedAt = nowIso();
      setValue(META_PREWARMED_AT_KEY, state.lastMetaPrewarmedAt);
      if (!opts.silent) state.managerStatusText = "활성 모듈 예열을 완료했습니다.";
      return true;
    } finally {
      if (!opts.force) releaseRefreshLock(META_PREWARM_LOCK_KEY);
      renderManager(state);
    }
  }

  async function syncScripts(state, scriptIds) {
    if (!state.registry) await refreshRegistry(state, { force: true, refreshRemote: true });
    if (!state.registry) return;

    const scripts = getScriptsFromRegistry(state, scriptIds, false);
    const statusMap = Object.assign({}, state.remoteStatusById || {});
    state.managerBusy = true;
    state.managerStatusText = scripts.length === 1
      ? ((scripts[0].name || scripts[0].id) + " 동기화 중입니다.")
      : "선택한 스크립트를 동기화하는 중입니다.";
    renderManager(state);

    try {
      for (const script of scripts) {
        const meta = await loadScriptMeta(script);
        state.remoteMetaById[script.id] = meta;
        await prewarmScriptBundle(script, meta);
        clearRemoteStatusEntry(statusMap, script.id);
      }
      persistRemoteStatusMap(state, statusMap);
      state.lastMetaPrewarmedAt = nowIso();
      setValue(META_PREWARMED_AT_KEY, state.lastMetaPrewarmedAt);
      state.managerStatusText = scripts.length === 1
        ? ((scripts[0].name || scripts[0].id) + " 동기화를 완료했습니다.")
        : "선택한 스크립트 동기화를 완료했습니다.";
    } catch (error) {
      state.managerStatusText = "동기화 실패: " + error.message;
    } finally {
      state.managerBusy = false;
      renderManager(state);
    }
  }

  function clearScriptCaches(state, scriptIds) {
    const scripts = getScriptsFromRegistry(state, scriptIds, false);
    purgeScriptCaches(state, scripts.map((script) => script.id), { deleteEnabled: false, clearStatus: true });
    state.managerStatusText = scripts.length === 1
      ? ((scripts[0].name || scripts[0].id) + " 캐시를 삭제했습니다.")
      : "선택한 스크립트 캐시를 삭제했습니다.";
    renderManager(state);
  }

  function clearAllCaches(state) {
    clearScriptCaches(state, ((state.registry && state.registry.scripts) || []).map((script) => script.id));
  }

  function toggleScriptEnabled(state, scriptId) {
    const script = ((state.registry && state.registry.scripts) || []).find((item) => item.id === scriptId);
    if (!script) return;
    const keys = buildScriptStorageKeys(scriptId);
    const current = getValue(keys.enabled, undefined);
    const enabled = isScriptEnabled(script, current);
    setValue(keys.enabled, !enabled);
    state.managerStatusText = (script.name || script.id) + " 상태를 " + (!enabled ? "활성화" : "비활성화") + "로 변경했습니다.";
    renderManager(state);
  }

  function registerMenus(state) {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("VX Console 열기", function () {
      openManager(state);
    });
  }

  function scheduleBackgroundRefresh(state) {
    if (state.backgroundRefreshPending) return;
    state.backgroundRefreshPending = true;
    Promise.resolve().then(async function () {
      try {
        await refreshRegistry(state, { refreshRemote: true, silent: true });
        await prewarmEnabledScripts(state, { silent: true });
      } catch (error) {
        console.error("[tamp-loader] background refresh failed", error);
      } finally {
        state.backgroundRefreshPending = false;
        renderManager(state);
      }
    });
  }

  async function bootstrap(win) {
    const state = {
      win,
      doc: win.document,
      url: String(win.location.href || ""),
      registry: readCachedRegistry(),
      registryError: "",
      remoteMetaById: {},
      remoteStatusById: readRemoteStatusMap(),
      lastRegistryCheckedAt: getValue(REGISTRY_CHECKED_AT_KEY, ""),
      lastMetaPrewarmedAt: getValue(META_PREWARMED_AT_KEY, ""),
      managerBusy: false,
      managerOpen: false,
      managerFilterCurrentOnly: false,
      managerStatusText: "",
      managerWindow: null,
      managerDocument: null,
      managerElements: null,
      backgroundRefreshPending: false,
    };

    registerMenus(state);

    if (!state.registry) {
      await refreshRegistry(state, { force: true, silent: true, notifyChanges: false, trackNewScripts: false });
    }

    const matchingScripts = findMatchingScripts(state.registry || { scripts: [] }, state.url);
    for (const script of matchingScripts) {
      const keys = buildScriptStorageKeys(script.id);
      const enabled = isScriptEnabled(script, getValue(keys.enabled, undefined));
      if (!enabled) continue;

      let meta = readCachedScriptMeta(script.id);
      if (!canUseCachedMeta(meta)) {
        try {
          meta = await loadScriptMeta(script);
        } catch (error) {
          const cachedCode = getValue(keys.code, null);
          if (!canUseCachedMeta(meta) || !cachedCode) {
            console.error("[tamp-loader] meta load failed", script.id, error);
            continue;
          }
        }
      }

      if (!canUseCachedMeta(meta)) {
        console.error("[tamp-loader] cached meta unusable", script.id);
        continue;
      }

      try {
        await runScript(script, meta, {
          window: win,
          document: win.document,
          state,
        });
      } catch (error) {
        console.error("[tamp-loader] script run failed", script.id, error);
      }
    }

    scheduleBackgroundRefresh(state);
  }

  return {
    REGISTRY_URL,
    RAW_BASE_URL,
    bootstrap,
    buildManagerDocumentHtml,
    buildManagerShellHtml,
    buildManagerRows,
    buildScriptStorageKeys,
    canUseCachedMeta,
    compareVersions,
    createLoaderApi,
    diffRegistryScripts,
    findMatchingScripts,
    formatSyncTime,
    formatManagerSubtitle,
    getManagerWindowFeatures,
    isScriptEnabled,
    matchUrlPattern,
    normalizeMetaCacheEntry,
    shouldCheckAt,
    shouldRefreshCache,
  };
});
