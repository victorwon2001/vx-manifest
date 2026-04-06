// ==UserScript==
// @name         VX Console
// @namespace    github.victor.vx.console
// @version      0.6.2
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
  const LEGACY_REMOTE_STATUS_KEY = STORAGE_PREFIX + ":remote:status";
  const LEGACY_REMOTE_META_KEY = STORAGE_PREFIX + ":remote:meta";
  const REMOTE_STATUS_PREFIX = STORAGE_PREFIX + ":remote:status:";
  const REMOTE_META_PREFIX = STORAGE_PREFIX + ":remote:meta:";
  const REGISTRY_LOCK_KEY = STORAGE_PREFIX + ":registry:lock";
  const META_PREWARM_LOCK_KEY = STORAGE_PREFIX + ":meta:lock";
  const REGISTRY_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const META_PREWARM_INTERVAL_MS = 60 * 60 * 1000;
  const LOCK_TTL_MS = 90 * 1000;
  const MANUAL_ACTION_WAIT_TIMEOUT_MS = 8 * 1000;
  const MANUAL_ACTION_POLL_INTERVAL_MS = 200;
  const FALLBACK_MEMORY_KEY = "__tmLoaderMemoryStore";
  const managerState = {
    windowRef: null,
    popupReady: false,
    bootWindow: null,
    sourceWindow: null,
    busy: false,
    busyAction: null,
    statusText: "",
  };

  function getGlobalScope() {
    if (typeof globalThis !== "undefined" && globalThis) return globalThis;
    return root;
  }

  function getMemoryStore() {
    const scope = getGlobalScope();
    if (!scope[FALLBACK_MEMORY_KEY]) scope[FALLBACK_MEMORY_KEY] = {};
    return scope[FALLBACK_MEMORY_KEY];
  }

  function getRuntimeState(win) {
    const scope = win || root || getGlobalScope();
    if (!scope.__tmLoaderRuntimeState) {
      scope.__tmLoaderRuntimeState = {
        executedVersions: {},
      };
    }
    return scope.__tmLoaderRuntimeState;
  }

  function getDirectGrantFunction(name) {
    switch (name) {
      case "GM_xmlhttpRequest":
        return typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      case "GM_getValue":
        return typeof GM_getValue === "function" ? GM_getValue : null;
      case "GM_setValue":
        return typeof GM_setValue === "function" ? GM_setValue : null;
      case "GM_deleteValue":
        return typeof GM_deleteValue === "function" ? GM_deleteValue : null;
      case "GM_listValues":
        return typeof GM_listValues === "function" ? GM_listValues : null;
      case "GM_registerMenuCommand":
        return typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null;
      case "GM_notification":
        return typeof GM_notification === "function" ? GM_notification : null;
      case "GM_addStyle":
        return typeof GM_addStyle === "function" ? GM_addStyle : null;
      case "GM_addElement":
        return typeof GM_addElement === "function" ? GM_addElement : null;
      case "GM_download":
        return typeof GM_download === "function" ? GM_download : null;
      case "GM_setClipboard":
        return typeof GM_setClipboard === "function" ? GM_setClipboard : null;
      case "GM_openInTab":
        return typeof GM_openInTab === "function" ? GM_openInTab : null;
      case "GM_getTab":
        return typeof GM_getTab === "function" ? GM_getTab : null;
      case "GM_saveTab":
        return typeof GM_saveTab === "function" ? GM_saveTab : null;
      case "GM_getTabs":
        return typeof GM_getTabs === "function" ? GM_getTabs : null;
      default:
        return null;
    }
  }

  function getFunction(name) {
    const directFn = getDirectGrantFunction(name);
    if (typeof directFn === "function") return directFn;
    if (root && typeof root[name] === "function") return root[name];
    const scope = getGlobalScope();
    if (scope && typeof scope[name] === "function") return scope[name];
    return null;
  }

  function getPageWindow(candidate) {
    return candidate || managerState.sourceWindow || managerState.bootWindow || root;
  }

  function getValue(key, fallbackValue) {
    const fn = getFunction("GM_getValue");
    if (fn) {
      try {
        return fn(key, fallbackValue);
      } catch (error) {
        return fallbackValue;
      }
    }
    const store = getMemoryStore();
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallbackValue;
  }

  function setValue(key, value) {
    const fn = getFunction("GM_setValue");
    if (fn) {
      fn(key, value);
      return;
    }
    getMemoryStore()[key] = value;
  }

  function deleteValue(key) {
    const fn = getFunction("GM_deleteValue");
    if (fn) {
      fn(key);
      return;
    }
    delete getMemoryStore()[key];
  }

  function getValueList() {
    const fn = getFunction("GM_listValues");
    if (fn) return fn();
    return Object.keys(getMemoryStore());
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getLoaderVersion() {
    const info = (typeof GM_info !== "undefined" && GM_info) || (root && root.GM_info);
    if (info && info.script && info.script.version) return String(info.script.version);
    return "unknown";
  }

  function toTimestamp(value) {
    const time = new Date(String(value || "")).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function shouldCheckAt(lastCheckedAt, intervalMs, nowValue) {
    const lastCheckedTime = toTimestamp(lastCheckedAt);
    const currentTime = typeof nowValue === "number" ? nowValue : Date.now();
    if (!lastCheckedTime) return true;
    return currentTime - lastCheckedTime >= Number(intervalMs || 0);
  }

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

  function safeJsonParse(value, fallbackValue) {
    if (!value) return fallbackValue;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallbackValue;
    }
  }

  function parseVersion(version) {
    return String(version || "0.0.0")
      .split(".")
      .map((value) => Number(value || 0))
      .concat([0, 0, 0])
      .slice(0, 3);
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
    if (hasMetaStructuralChange(cachedMeta, remoteMeta)) return true;
    return false;
  }

  function matchUrlPattern(url, pattern) {
    const regex = new RegExp("^" + String(pattern).split("*").map(escapeRegExp).join(".*") + "$");
    return regex.test(String(url || ""));
  }

  function findMatchingScripts(registry, url) {
    const scripts = Array.isArray(registry && registry.scripts) ? registry.scripts : [];
    return scripts.filter((script) => {
      return Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern));
    });
  }

  function isScriptEnabled(script, overrideValue) {
    if (typeof overrideValue === "boolean") return overrideValue;
    return script.enabledByDefault !== false;
  }

  function formatSyncTime(value) {
    const text = String(value || "");
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
    return match ? match[1] + " " + match[2] : "-";
  }

  function formatManagerSubtitle(url) {
    try {
      const currentUrl = new URL(String(url || ""));
      return currentUrl.origin + currentUrl.pathname;
    } catch (error) {
      return String(url || "");
    }
  }

  function buildAssetCacheKey(scriptId, suffix) {
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
      notifiedVersion: STORAGE_PREFIX + ":script:" + scriptId + ":notifiedVersion",
      storagePrefix: STORAGE_PREFIX + ":module:" + scriptId + ":",
    };
  }

  function buildRemoteStatusKey(scriptId) {
    return REMOTE_STATUS_PREFIX + scriptId;
  }

  function buildRemoteMetaKey(scriptId) {
    return REMOTE_META_PREFIX + scriptId;
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
    return {
      id: meta.id || scriptId,
      displayId: meta.displayId || "",
      name: meta.name || "",
      version: String(meta.version),
      description: meta.description || "",
      entry: meta.entry || "",
      checksum: meta.checksum || "",
      dependencies: Array.isArray(meta.dependencies) ? meta.dependencies.slice() : [],
      capabilities: normalizeCapabilities(meta.capabilities),
      loaderApiVersion: Number(meta.loaderApiVersion || 1) || 1,
      checkedAt: meta.checkedAt || "",
      lastSyncedAt: meta.lastSyncedAt || "",
      updatedAt: meta.updatedAt || "",
    };
  }

  function normalizeDependencySignature(dependency) {
    const source = dependency && typeof dependency === "object" ? dependency : {};
    return {
      id: String(source.id || ""),
      version: String(source.version || ""),
      path: String(source.path || ""),
    };
  }

  function buildMetaFingerprint(meta) {
    const normalized = normalizeMetaCacheEntry(meta && meta.id ? meta.id : "", meta);
    if (!normalized) return "";
    return JSON.stringify({
      displayId: String(normalized.displayId || ""),
      name: String(normalized.name || ""),
      description: String(normalized.description || ""),
      entry: String(normalized.entry || ""),
      checksum: String(normalized.checksum || ""),
      dependencies: (Array.isArray(normalized.dependencies) ? normalized.dependencies : []).map(normalizeDependencySignature),
      capabilities: normalizeCapabilities(normalized.capabilities),
      loaderApiVersion: Number(normalized.loaderApiVersion || 1) || 1,
    });
  }

  function hasMetaStructuralChange(cachedMeta, remoteMeta) {
    return buildMetaFingerprint(cachedMeta) !== buildMetaFingerprint(remoteMeta);
  }

  function canUseCachedMeta(meta) {
    return !!(meta && meta.entry);
  }

  function readCachedRegistry() {
    return safeJsonParse(getValue(REGISTRY_RAW_KEY, ""), null);
  }

  function normalizeRemoteStatusEntry(status) {
    if (!status || typeof status !== "object" || !status.kind) return null;
    return {
      kind: String(status.kind || ""),
      version: String(status.version || ""),
      checksum: String(status.checksum || ""),
      detectedAt: String(status.detectedAt || ""),
      message: String(status.message || ""),
    };
  }

  function migrateLegacyRemoteState() {
    const legacyStatusMap = safeJsonParse(getValue(LEGACY_REMOTE_STATUS_KEY, ""), null);
    const legacyMetaMap = safeJsonParse(getValue(LEGACY_REMOTE_META_KEY, ""), null);
    const hasLegacyStatus = legacyStatusMap && typeof legacyStatusMap === "object";
    const hasLegacyMeta = legacyMetaMap && typeof legacyMetaMap === "object";
    if (!hasLegacyStatus && !hasLegacyMeta) return false;

    if (hasLegacyStatus) {
      Object.keys(legacyStatusMap).forEach((scriptId) => {
        const status = normalizeRemoteStatusEntry(legacyStatusMap[scriptId]);
        if (status) setValue(buildRemoteStatusKey(scriptId), JSON.stringify(status));
      });
    }

    if (hasLegacyMeta) {
      Object.keys(legacyMetaMap).forEach((scriptId) => {
        const meta = normalizeMetaCacheEntry(scriptId, legacyMetaMap[scriptId]);
        if (meta) setValue(buildRemoteMetaKey(scriptId), JSON.stringify(meta));
      });
    }

    deleteValue(LEGACY_REMOTE_STATUS_KEY);
    deleteValue(LEGACY_REMOTE_META_KEY);
    return true;
  }

  function listRemoteEntryIds(prefix) {
    migrateLegacyRemoteState();
    return getValueList()
      .filter((key) => key.indexOf(prefix) === 0)
      .map((key) => key.slice(prefix.length))
      .filter(Boolean)
      .sort();
  }

  function readRemoteStatusEntry(scriptId) {
    migrateLegacyRemoteState();
    return normalizeRemoteStatusEntry(safeJsonParse(getValue(buildRemoteStatusKey(scriptId), ""), null));
  }

  function readRemoteMetaEntry(scriptId) {
    migrateLegacyRemoteState();
    return normalizeMetaCacheEntry(scriptId, safeJsonParse(getValue(buildRemoteMetaKey(scriptId), ""), null));
  }

  function readRemoteStatusMap() {
    return listRemoteEntryIds(REMOTE_STATUS_PREFIX).reduce((result, scriptId) => {
      const status = readRemoteStatusEntry(scriptId);
      if (status) result[scriptId] = status;
      return result;
    }, {});
  }

  function readRemoteMetaMap() {
    return listRemoteEntryIds(REMOTE_META_PREFIX).reduce((result, scriptId) => {
      const meta = readRemoteMetaEntry(scriptId);
      if (meta) result[scriptId] = meta;
      return result;
    }, {});
  }

  function writeRemoteStatusEntry(scriptId, status) {
    const normalizedStatus = normalizeRemoteStatusEntry(status);
    const key = buildRemoteStatusKey(scriptId);
    if (!normalizedStatus) {
      deleteValue(key);
      return null;
    }
    setValue(key, JSON.stringify(normalizedStatus));
    return normalizedStatus;
  }

  function writeRemoteMetaEntry(scriptId, meta) {
    const normalizedMeta = normalizeMetaCacheEntry(scriptId, meta);
    const key = buildRemoteMetaKey(scriptId);
    if (!normalizedMeta) {
      deleteValue(key);
      return null;
    }
    setValue(key, JSON.stringify(normalizedMeta));
    return normalizedMeta;
  }

  function writeRemoteStatusMap(statusMap) {
    const nextMap = statusMap && typeof statusMap === "object" ? statusMap : {};
    listRemoteEntryIds(REMOTE_STATUS_PREFIX).forEach((scriptId) => {
      if (!Object.prototype.hasOwnProperty.call(nextMap, scriptId)) {
        deleteValue(buildRemoteStatusKey(scriptId));
      }
    });
    Object.keys(nextMap).forEach((scriptId) => {
      writeRemoteStatusEntry(scriptId, nextMap[scriptId]);
    });
  }

  function writeRemoteMetaMap(metaMap) {
    const nextMap = metaMap && typeof metaMap === "object" ? metaMap : {};
    listRemoteEntryIds(REMOTE_META_PREFIX).forEach((scriptId) => {
      if (!Object.prototype.hasOwnProperty.call(nextMap, scriptId)) {
        deleteValue(buildRemoteMetaKey(scriptId));
      }
    });
    Object.keys(nextMap).forEach((scriptId) => {
      writeRemoteMetaEntry(scriptId, nextMap[scriptId]);
    });
  }

  function sleep(ms) {
    const timerFn = typeof setTimeout === "function"
      ? setTimeout
      : ((root && typeof root.setTimeout === "function") ? root.setTimeout.bind(root) : null);
    if (typeof timerFn !== "function") {
      return Promise.resolve();
    }
    return new Promise((resolve) => timerFn(resolve, Number(ms || 0)));
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

  async function waitForRefreshLock(key, options) {
    const currentTime = Date.now();
    if (acquireRefreshLock(key, LOCK_TTL_MS, currentTime)) {
      return { acquired: true, waited: false };
    }
    if (!options || !options.waitForLock) {
      return { acquired: false, waited: false };
    }

    const timeoutMs = Number(options.timeoutMs || MANUAL_ACTION_WAIT_TIMEOUT_MS);
    const pollIntervalMs = Number(options.pollIntervalMs || MANUAL_ACTION_POLL_INTERVAL_MS);
    const timeoutAt = Date.now() + timeoutMs;
    while (Date.now() < timeoutAt) {
      await sleep(pollIntervalMs);
      if (acquireRefreshLock(key, LOCK_TTL_MS)) {
        return { acquired: true, waited: true };
      }
    }

    throw new Error(options.timeoutMessage || "다른 탭에서 작업 중입니다. 잠시 후 다시 시도하세요.");
  }

  function readAssetCacheKeys(scriptId) {
    const keys = buildScriptStorageKeys(scriptId);
    const value = safeJsonParse(getValue(keys.assets, ""), []);
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function rememberAssetCacheKey(scriptId, assetKey) {
    const current = readAssetCacheKeys(scriptId);
    if (current.indexOf(assetKey) !== -1) return;
    current.push(assetKey);
    setValue(buildScriptStorageKeys(scriptId).assets, JSON.stringify(current));
  }

  function readCachedScriptMeta(scriptId) {
    return normalizeMetaCacheEntry(scriptId, safeJsonParse(getValue(buildScriptStorageKeys(scriptId).meta, ""), null));
  }

  function buildSyncedMeta(scriptId, meta, options) {
    const existing = normalizeMetaCacheEntry(scriptId, options && options.existing);
    const normalized = normalizeMetaCacheEntry(scriptId, meta);
    if (!normalized) return null;
    normalized.checkedAt = options && options.checkedAt ? options.checkedAt : nowIso();
    normalized.lastSyncedAt = options && options.lastSyncedAt
      ? options.lastSyncedAt
      : (existing && existing.lastSyncedAt ? existing.lastSyncedAt : "");
    return normalized;
  }

  function readScriptLocalState(script) {
    const keys = buildScriptStorageKeys(script.id);
    const enabledValue = getValue(keys.enabled, null);
    return {
      enabledOverride: typeof enabledValue === "boolean" ? enabledValue : undefined,
      meta: readCachedScriptMeta(script.id),
      registry: safeJsonParse(getValue(keys.registry, ""), null),
    };
  }

  function readLocalStateMap(registry) {
    const scripts = Array.isArray(registry && registry.scripts) ? registry.scripts : [];
    return scripts.reduce((result, script) => {
      result[script.id] = readScriptLocalState(script);
      return result;
    }, {});
  }

  function diffRegistryScripts(previousRegistry, nextRegistry) {
    const previousIds = new Set((previousRegistry && previousRegistry.scripts || []).map((script) => script.id));
    const nextIds = new Set((nextRegistry && nextRegistry.scripts || []).map((script) => script.id));
    const addedIds = [];
    const removedIds = [];
    nextIds.forEach((id) => {
      if (!previousIds.has(id)) addedIds.push(id);
    });
    previousIds.forEach((id) => {
      if (!nextIds.has(id)) removedIds.push(id);
    });
    return { addedIds: addedIds.sort(), removedIds: removedIds.sort() };
  }

  function buildRemoteStatus(scriptId, kind, remoteMeta, options) {
    return normalizeRemoteStatusEntry({
      scriptId,
      kind,
      version: remoteMeta && remoteMeta.version ? remoteMeta.version : "",
      checksum: remoteMeta && remoteMeta.checksum ? remoteMeta.checksum : "",
      detectedAt: nowIso(),
      message: options && options.message ? options.message : "",
    });
  }

  function resolveRemoteStatusKind(cachedMeta, remoteMeta) {
    if (!remoteMeta) return "error";
    if (!cachedMeta) return "new";
    const versionDiff = compareVersions(cachedMeta.version, remoteMeta.version);
    if (versionDiff < 0) return "update";
    if (versionDiff === 0 && (
      String(cachedMeta.checksum || "") !== String(remoteMeta.checksum || "") ||
      hasMetaStructuralChange(cachedMeta, remoteMeta)
    )) return "redeploy";
    return "clean";
  }

  function updateRemoteStatusEntry(statusMap, scriptId, status) {
    const normalizedStatus = normalizeRemoteStatusEntry(status);
    if (!normalizedStatus) {
      delete statusMap[scriptId];
      return null;
    }
    statusMap[scriptId] = normalizedStatus;
    return normalizedStatus;
  }

  function clearRemoteStatusEntry(statusMap, scriptId) {
    delete statusMap[scriptId];
  }

  function withCacheBust(url, cacheBustToken) {
    if (!cacheBustToken) return String(url || "");
    const target = new URL(String(url || ""), RAW_BASE_URL);
    target.searchParams.set("_tm", String(cacheBustToken));
    return target.toString();
  }

  function resolvePath(relativePath, options) {
    const resolvedUrl = new URL(String(relativePath || ""), RAW_BASE_URL).toString();
    return withCacheBust(resolvedUrl, options && options.cacheBustToken);
  }

  function buildResponseHeadersText(headers) {
    if (!headers || typeof headers.forEach !== "function") return "";
    const lines = [];
    headers.forEach((value, key) => {
      lines.push(String(key) + ": " + String(value));
    });
    return lines.join("\r\n");
  }

  function gmRequest(details) {
    const request = getFunction("GM_xmlhttpRequest");
    if (typeof request === "function") {
      return new Promise((resolve, reject) => {
        request(Object.assign({}, details, {
          onload: resolve,
          onerror: (response) => reject(new Error(response && response.error ? response.error : "요청이 실패했습니다.")),
          ontimeout: () => reject(new Error("요청 시간이 초과되었습니다.")),
        }));
      });
    }

    const fetchFn = (root && typeof root.fetch === "function")
      ? root.fetch.bind(root)
      : (typeof fetch === "function" ? fetch.bind(getGlobalScope()) : null);
    if (typeof fetchFn !== "function") {
      return Promise.reject(new Error("네트워크 전송 수단을 찾지 못했습니다."));
    }

    const requestUrl = String(details && details.url ? details.url : "");
    const method = String(details && details.method ? details.method : "GET");
    const headers = Object.assign({}, details && details.headers ? details.headers : {});
    const body = details && Object.prototype.hasOwnProperty.call(details, "data") ? details.data : undefined;

    return fetchFn(requestUrl, {
      method,
      headers,
      body,
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
    }).then(async (response) => {
      const responseType = String(details && details.responseType ? details.responseType : "").toLowerCase();
      const payload = responseType === "arraybuffer" ? await response.arrayBuffer() : await response.text();
      return {
        status: response.status,
        finalUrl: response.url || requestUrl,
        responseHeaders: buildResponseHeadersText(response.headers),
        responseText: typeof payload === "string" ? payload : "",
        response: payload,
      };
    });
  }

  function fetchText(url) {
    return gmRequest({ method: "GET", url }).then((response) => {
      const status = Number(response && response.status);
      if (Number.isFinite(status) && status >= 400) {
        throw new Error("HTTP " + status + " for " + url);
      }
      return String(response && response.responseText ? response.responseText : "");
    });
  }

  function fetchJson(url) {
    return fetchText(url).then((text) => JSON.parse(text));
  }

  function createRequire() {
    return function unsupportedRequire(requestedPath) {
      throw new Error("require is not supported in loader runtime: " + requestedPath);
    };
  }

  function evaluateLooseScript(code, scope, filename) {
    const win = scope || root;
    const fn = new Function(
      "window",
      "self",
      "globalThis",
      "document",
      "location",
      "navigator",
      "unsafeWindow",
      code + "\n//# sourceURL=" + filename
    );
    return fn(
      win,
      win,
      win,
      win && win.document,
      win && win.location,
      win && win.navigator,
      (win && win.unsafeWindow) || win
    );
  }

  function evaluateModule(code, scope, filename) {
    const win = scope || root;
    const moduleObject = { exports: {} };
    const fn = new Function(
      "module",
      "exports",
      "require",
      "window",
      "self",
      "globalThis",
      "document",
      "location",
      "navigator",
      "unsafeWindow",
      code + "\n//# sourceURL=" + filename + "\nreturn module.exports;"
    );
    return fn(
      moduleObject,
      moduleObject.exports,
      createRequire(),
      win,
      win,
      win,
      win && win.document,
      win && win.location,
      win && win.navigator,
      (win && win.unsafeWindow) || win
    );
  }

  async function ensureAssetCode(scriptId, dependency, options) {
    const assetKey = buildAssetCacheKey(scriptId, dependency.id || dependency.path);
    const preferCache = !options || options.preferCache !== false;
    const cachedCode = getValue(assetKey, "");
    if (preferCache && cachedCode) return String(cachedCode);
    const assetCode = await fetchText(resolvePath(dependency.path, {
      cacheBustToken: options && options.cacheBustToken,
    }));
    setValue(assetKey, assetCode);
    rememberAssetCacheKey(scriptId, assetKey);
    return assetCode;
  }

  function clearAssetCode(scriptId, dependency) {
    const assetKey = buildAssetCacheKey(scriptId, dependency.id || dependency.path);
    deleteValue(assetKey);
    return assetKey;
  }

  async function loadCachedOrRemoteAsset(scriptId, dependency, options) {
    const scope = options && options.window ? options.window : root;
    const filename = dependency.path || dependency.id || "asset.js";
    const preferCache = !options || options.preferCache !== false;
    let code = await ensureAssetCode(scriptId, dependency, options);
    try {
      evaluateLooseScript(code, scope, filename);
      return code;
    } catch (error) {
      if (!preferCache) throw error;
      clearAssetCode(scriptId, dependency);
      code = await ensureAssetCode(scriptId, dependency, { preferCache: false });
      evaluateLooseScript(code, scope, filename);
      return code;
    }
  }

  async function prewarmScriptAssets(script, meta, options) {
    const dependencies = Array.isArray(meta && meta.dependencies) ? meta.dependencies : [];
    for (const dependency of dependencies) {
      await ensureAssetCode(script.id, dependency, { preferCache: false });
      if (options && options.window) {
        await loadCachedOrRemoteAsset(script.id, dependency, options);
      }
    }
  }

  async function loadScriptCode(script, meta, options) {
    const keys = buildScriptStorageKeys(script.id);
    const preferCache = !options || options.preferCache !== false;
    const cachedCode = getValue(keys.code, "");
    if (preferCache && cachedCode) return String(cachedCode);
    const code = await fetchText(resolvePath(meta.entry, {
      cacheBustToken: options && options.cacheBustToken,
    }));
    setValue(keys.code, code);
    const syncedMeta = buildSyncedMeta(script.id, meta, {
      existing: readCachedScriptMeta(script.id),
      lastSyncedAt: nowIso(),
    });
    if (syncedMeta) setValue(keys.meta, JSON.stringify(syncedMeta));
    return code;
  }

  function clearScriptCode(scriptId) {
    deleteValue(buildScriptStorageKeys(scriptId).code);
  }

  async function loadScriptMeta(script, options) {
    const cachedMeta = readCachedScriptMeta(script.id);
    if ((!options || options.preferCache !== false) && canUseCachedMeta(cachedMeta)) return cachedMeta;
    const remoteMeta = await fetchJson(resolvePath(script.metaPath, {
      cacheBustToken: options && options.cacheBustToken,
    }));
    const syncedMeta = buildSyncedMeta(script.id, remoteMeta, {
      existing: cachedMeta,
      checkedAt: nowIso(),
    });
    setValue(buildScriptStorageKeys(script.id).meta, JSON.stringify(syncedMeta));
    setValue(buildScriptStorageKeys(script.id).registry, JSON.stringify(script));
    return syncedMeta;
  }

  async function prewarmScriptBundle(script, options) {
    const remoteMeta = await loadScriptMeta(script, {
      preferCache: false,
      cacheBustToken: options && options.cacheBustToken,
    });
    await prewarmScriptAssets(script, remoteMeta, {
      cacheBustToken: options && options.cacheBustToken,
    });
    await loadScriptCode(script, remoteMeta, {
      preferCache: false,
      cacheBustToken: options && options.cacheBustToken,
    });
    return remoteMeta;
  }

  function copyTextToClipboard(text) {
    const setClipboard = getFunction("GM_setClipboard");
    if (typeof setClipboard === "function") {
      setClipboard(String(text || ""));
      return Promise.resolve();
    }
    const clipboard = root && root.navigator && root.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      return clipboard.writeText(String(text || ""));
    }
    return Promise.reject(new Error("클립보드 API를 사용할 수 없습니다."));
  }

  function downloadFile(options) {
    const download = getFunction("GM_download");
    if (typeof download === "function") {
      return new Promise((resolve, reject) => {
        download(Object.assign({}, options, {
          onload: resolve,
          onerror: (error) => reject(new Error(error && error.error ? error.error : "다운로드에 실패했습니다.")),
          ontimeout: () => reject(new Error("다운로드 시간이 초과되었습니다.")),
        }));
      });
    }
    return Promise.reject(new Error("다운로드 API를 사용할 수 없습니다."));
  }

  function openExternalTab(url, options) {
    const openTab = getFunction("GM_openInTab");
    if (typeof openTab === "function") return openTab(url, options || {});
    if (root && typeof root.open === "function") return root.open(url, "_blank");
    return null;
  }

  function notify(options) {
    const notifyFn = getFunction("GM_notification");
    if (typeof notifyFn === "function") {
      notifyFn(options);
      return;
    }
    if (root && root.console && typeof root.console.log === "function") {
      root.console.log("[VX Console]", options && options.text ? options.text : options);
    }
  }

  function createLoaderApi(win, script, meta) {
    const keys = buildScriptStorageKeys(script.id);
    return {
      loaderApiVersion: LOADER_API_VERSION,
      request: gmRequest,
      gmRequest,
      download: downloadFile,
      copyText: copyTextToClipboard,
      notify,
      openTab: openExternalTab,
      capabilities: normalizeCapabilities(meta && meta.capabilities),
      script,
      meta,
      focusWindow() {
        if (win && typeof win.focus === "function") win.focus();
      },
      storage: {
        get(key, fallbackValue) {
          return getValue(keys.storagePrefix + key, fallbackValue);
        },
        set(key, value) {
          setValue(keys.storagePrefix + key, value);
        },
        delete(key) {
          deleteValue(keys.storagePrefix + key);
        },
        list() {
          return getValueList().filter((key) => key.indexOf(keys.storagePrefix) === 0);
        },
      },
    };
  }

  async function runScript(script, win, options) {
    const localState = readScriptLocalState(script);
    if (!isScriptEnabled(script, localState.enabledOverride)) return null;

    const meta = await loadScriptMeta(script, {
      preferCache: !options || options.preferCache !== false,
    });
    if (!canUseCachedMeta(meta)) return null;
    const runtimeState = getRuntimeState(win);
    if (!options || options.allowRepeat !== true) {
      if (runtimeState.executedVersions[script.id] === meta.version) return null;
    }

    const dependencies = Array.isArray(meta.dependencies) ? meta.dependencies : [];
    for (const dependency of dependencies) {
      await loadCachedOrRemoteAsset(script.id, dependency, {
        preferCache: !options || options.preferCache !== false,
        window: win,
      });
    }

    const preferCache = !options || options.preferCache !== false;
    let code = await loadScriptCode(script, meta, { preferCache });
    let moduleApi;
    try {
      moduleApi = evaluateModule(code, win, meta.entry || script.id + ".js");
    } catch (error) {
      if (!preferCache) throw error;
      clearScriptCode(script.id);
      code = await loadScriptCode(script, meta, { preferCache: false });
      moduleApi = evaluateModule(code, win, meta.entry || script.id + ".js");
    }
    if (!moduleApi || typeof moduleApi.run !== "function") return null;

    const context = {
      window: win,
      unsafeWindow: (win && win.unsafeWindow) || win,
      document: win && win.document,
      location: win && win.location,
      script,
      meta,
      loader: createLoaderApi(win, script, meta),
    };
    const result = await moduleApi.run(context);
    runtimeState.executedVersions[script.id] = meta.version;
    return result;
  }

  function getManagerRowClassName(row) {
    const classes = ["tm-row"];
    if (row.appliesHere) classes.push("is-current");
    if (row.enabled === false) classes.push("is-disabled");
    if (row.isNew) classes.push("is-new");
    if (row.hasUpdate) classes.push("is-update");
    if (row.isRedeploy) classes.push("is-redeploy");
    if (row.hasError) classes.push("is-error");
    if (row.isNew || row.hasUpdate || row.isRedeploy || row.hasError) classes.push("is-attention");
    return classes.join(" ");
  }

  function getRowAttentionKind(row) {
    if (row && row.isNew) return "new";
    if (row && row.hasUpdate) return "update";
    if (row && row.isRedeploy) return "redeploy";
    if (row && row.hasError) return "error";
    return "";
  }

  function getRowAttentionLabel(row) {
    const kind = getRowAttentionKind(row);
    if (kind === "new") return "신규";
    if (kind === "update") return "업데이트 필요";
    if (kind === "redeploy") return "재배포";
    if (kind === "error") return "확인 필요";
    return "";
  }

  function renderScriptNameCell(row) {
    const attentionKind = getRowAttentionKind(row);
    const attentionLabel = getRowAttentionLabel(row);
    const note = row && row.statusMessage ? '<p class="tm-script-note">' + escapeHtml(row.statusMessage) + "</p>" : "";
    const subtitle = row && row.displayId && row.displayId !== row.name ? '<div>' + escapeHtml(row.displayId) + "</div>" : "";
    const badge = attentionKind
      ? '<span class="tm-badge tm-badge-' + attentionKind + '">' + attentionLabel + "</span>"
      : "";
    return [
      '<div class="tm-script-cell">',
      '  <div class="tm-script-meta"><strong>' + escapeHtml(row.name) + "</strong>" + badge + "</div>",
      subtitle,
      note,
      "</div>",
    ].join("");
  }

  function renderRemoteVersionCell(row) {
    const version = escapeHtml(row.remoteVersion || "-");
    const attentionKind = getRowAttentionKind(row);
    if (attentionKind === "new") {
      return '<div class="tm-version-cell tm-version-cell--new"><strong>' + version + '</strong><span class="tm-badge tm-badge-new">신규</span></div>';
    }
    if (attentionKind === "update") {
      return '<div class="tm-version-cell tm-version-cell--update"><strong>' + version + '</strong><span class="tm-badge tm-badge-update">업데이트</span></div>';
    }
    if (attentionKind === "redeploy") {
      return '<div class="tm-version-cell tm-version-cell--redeploy"><strong>' + version + '</strong><span class="tm-badge tm-badge-redeploy">재배포</span></div>';
    }
    if (attentionKind === "error") {
      return '<div class="tm-version-cell tm-version-cell--error"><strong>' + version + '</strong><span class="tm-badge tm-badge-error">오류</span></div>';
    }
    if (row.isNew) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-new">신규</span></div>';
    }
    if (row.hasUpdate) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-update">업데이트</span></div>';
    }
    if (row.isRedeploy) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-redeploy">재배포</span></div>';
    }
    if (row.hasError) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-error">오류</span></div>';
    }
    return '<div class="tm-version-cell"><strong>' + version + "</strong></div>";
  }

  function buildAttentionListHtml(rows) {
    const attentionRows = Array.isArray(rows)
      ? rows.filter((row) => row && (row.isNew || row.hasUpdate || row.isRedeploy || row.hasError))
      : [];
    if (!attentionRows.length) return "";
    return attentionRows.map((row) => {
      const attentionKind = getRowAttentionKind(row);
      const label = getRowAttentionLabel(row);
      const detail = row.isNew
        ? "원격 버전 " + escapeHtml(row.remoteVersion || "-") + " 추가"
        : row.hasUpdate
          ? "캐시 " + escapeHtml(row.cachedVersion || "-") + " → 원격 " + escapeHtml(row.remoteVersion || "-")
          : row.isRedeploy
            ? "버전 동일, 코드 재배포 감지"
            : (row.statusMessage ? escapeHtml(row.statusMessage) : "상태 확인이 필요합니다");
      return [
        '<div class="tm-attention-item tm-attention-item--' + attentionKind + '">',
        '  <span class="tm-badge tm-badge-' + attentionKind + '">' + label + "</span>",
        '  <div class="tm-attention-copy"><strong>' + escapeHtml(row.name) + "</strong><p>" + detail + "</p></div>",
        row.appliesHere ? '<span class="tm-badge tm-badge-new">현재 페이지</span>' : "",
        "</div>",
      ].join("");
    }).join("");
  }

  function buildManagerRows(options) {
    const registry = options && options.registry ? options.registry : { scripts: [] };
    const url = options && options.url ? options.url : "";
    const localStateById = options && options.localStateById ? options.localStateById : {};
    const remoteMetaById = options && options.remoteMetaById ? options.remoteMetaById : {};
    const remoteStatusById = options && options.remoteStatusById ? options.remoteStatusById : {};
    const scripts = Array.isArray(registry.scripts) ? registry.scripts : [];

    return scripts.map((script) => {
      const localState = localStateById[script.id] || {};
      const cachedMeta = normalizeMetaCacheEntry(script.id, localState.meta);
      const remoteMeta = normalizeMetaCacheEntry(script.id, remoteMetaById[script.id]);
      const remoteStatus = remoteStatusById[script.id] || null;
      const enabled = isScriptEnabled(script, localState.enabledOverride);
      const appliesHere = Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern));
      const remoteVersion = remoteMeta ? remoteMeta.version : (remoteStatus && remoteStatus.version ? remoteStatus.version : "");
      const cachedVersion = cachedMeta ? cachedMeta.version : "";
      const statusKind = remoteStatus && remoteStatus.kind
        ? remoteStatus.kind
        : resolveRemoteStatusKind(cachedMeta, remoteMeta);
      const hasUpdate = statusKind === "update";
      const isNew = statusKind === "new";
      const isRedeploy = statusKind === "redeploy";
      const hasError = statusKind === "error";
      return {
        id: script.id,
        displayId: script.displayId || (cachedMeta && cachedMeta.displayId) || (remoteMeta && remoteMeta.displayId) || script.id,
        name: script.name || script.id,
        appliesHere,
        enabled,
        enabledOverride: localState.enabledOverride,
        cachedVersion,
        remoteVersion,
        remoteChecksum: remoteMeta && remoteMeta.checksum ? String(remoteMeta.checksum) : (remoteStatus && remoteStatus.checksum ? String(remoteStatus.checksum) : ""),
        lastSyncedAtLabel: formatSyncTime(cachedMeta && cachedMeta.lastSyncedAt),
        statusKind,
        hasUpdate,
        isNew,
        isRedeploy,
        hasError,
        statusMessage: remoteStatus && remoteStatus.message ? remoteStatus.message : "",
      };
    }).sort((left, right) => {
      const leftPriority = ((left.isNew || left.hasUpdate || left.isRedeploy || left.hasError) ? 4 : 0) + (left.appliesHere ? 2 : 0) + (left.enabled ? 1 : 0);
      const rightPriority = ((right.isNew || right.hasUpdate || right.isRedeploy || right.hasError) ? 4 : 0) + (right.appliesHere ? 2 : 0) + (right.enabled ? 1 : 0);
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      return left.name.localeCompare(right.name, "ko");
    });
  }

  function getManagerWindowFeatures() {
    return "width=1160,height=860,resizable=yes,scrollbars=yes";
  }

  function buildManagerShellHtml() {
    return [
      '<div class="tm-shell">',
      '  <section class="tm-hero">',
      '    <div>',
      '      <p class="tm-kicker">VX Console</p>',
      '      <h1>로드 화면</h1>',
      '      <p id="tm-manager-subtitle" class="tm-subtitle"></p>',
      "    </div>",
      '    <div class="tm-toolbar-actions">',
      '      <button type="button" class="tm-button tm-button-secondary" data-action="sync-current">현재 페이지만</button>',
      '      <button type="button" class="tm-button" data-action="sync-all">전체 동기화</button>',
      "    </div>",
      "  </section>",
      '  <section class="tm-summary-grid">',
      '    <article class="tm-summary-card"><span>전체</span><strong id="tm-summary-total">0</strong></article>',
      '    <article class="tm-summary-card"><span>현재 페이지</span><strong id="tm-summary-current">0</strong></article>',
      '    <article class="tm-summary-card"><span>업데이트 대기</span><strong id="tm-summary-updates">0</strong></article>',
      '    <article class="tm-summary-card"><span>신규 모듈</span><strong id="tm-summary-new">0</strong></article>',
      "  </section>",
      '  <section id="tm-attention-card" class="tm-attention-card" hidden>',
      '    <div class="tm-attention-head">',
      "      <div>",
      '        <p class="tm-kicker">Update Queue</p>',
      '        <h2>반영이 필요한 항목</h2>',
      '        <p class="tm-subtitle">업데이트, 재배포, 신규 모듈을 먼저 확인할 수 있습니다.</p>',
      "      </div>",
      '      <span id="tm-attention-count" class="tm-badge tm-badge-update">0건</span>',
      "    </div>",
      '    <div id="tm-attention-list" class="tm-attention-list"></div>',
      "  </section>",
      '  <section class="tm-status-card">',
      '    <div class="tm-status-line"><span>Registry 확인</span><strong id="tm-status-registry-check">-</strong></div>',
      '    <div class="tm-status-line"><span>Meta 예열</span><strong id="tm-status-meta-check">-</strong></div>',
      '    <div class="tm-status-line"><span>상태</span><strong id="tm-manager-status-text">준비됨</strong></div>',
      "  </section>",
      '  <section class="tm-table-card">',
      '    <div class="tm-table-actions">',
      '      <button type="button" class="tm-button tm-button-secondary" data-action="clear-cache">전체 캐시 삭제</button>',
      '      <button type="button" class="tm-button tm-button-ghost" data-action="refresh">새로고침</button>',
      "    </div>",
      '    <table class="tm-table">',
      "      <thead><tr><th>스크립트</th><th>상태</th><th>캐시 버전</th><th>원격 버전</th><th>최근 동기화</th><th>동작</th></tr></thead>",
      '      <tbody id="tm-manager-rows"></tbody>',
      "    </table>",
      "  </section>",
      "</div>",
    ].join("");
  }

  function buildManagerDocumentHtml() {
    return [
      "<!doctype html>",
      '<html lang="ko">',
      "<head>",
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      "  <title>VX Console</title>",
      "</head>",
      "<body>",
      '  <div id="' + MANAGER_ROOT_ID + '">' + buildManagerShellHtml() + "</div>",
      "</body>",
      "</html>",
    ].join("");
  }

  function applyManagerStyles(doc) {
    if (!doc || doc.getElementById(MANAGER_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = MANAGER_STYLE_ID;
    style.textContent = [
      "@font-face{font-family:'Pretendard';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}",
      "@font-face{font-family:'Pretendard';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-Medium.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap}",
      "@font-face{font-family:'Pretendard';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-SemiBold.woff2') format('woff2');font-weight:600;font-style:normal;font-display:swap}",
      "@font-face{font-family:'Pretendard';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-Bold.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap}",
      ":root{color-scheme:light;font-family:'Pretendard','Segoe UI Variable Text','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      "body,button,input,select,textarea{font-family:'Pretendard','Segoe UI Variable Text','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
      "body{margin:0;background:#f5f6f7;color:#1f2427}",
      "#" + MANAGER_ROOT_ID + "{padding:20px}",
      ".tm-shell{display:grid;gap:16px}",
      ".tm-hero,.tm-status-card,.tm-table-card,.tm-summary-card,.tm-attention-card{background:#fff;border:1px solid #d8dee2;border-radius:16px;box-shadow:0 16px 32px rgba(31,36,39,.06)}",
      ".tm-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px 22px}",
      ".tm-kicker{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#55626a}",
      ".tm-hero h1{margin:0;font-size:30px;line-height:1.1}",
      ".tm-subtitle{margin:8px 0 0;color:#5d666b;font-size:13px}",
      ".tm-toolbar-actions,.tm-table-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}",
      ".tm-summary-card{padding:14px 16px;display:grid;gap:6px}",
      ".tm-summary-card span{font-size:12px;color:#5d666b}",
      ".tm-summary-card strong{font-size:24px;line-height:1.1}",
      ".tm-summary-card.is-hot{border-color:#d8c27d;background:#fff9ea}",
      ".tm-summary-card.is-hot strong{color:#8a5a00}",
      ".tm-attention-card{padding:16px 18px;display:grid;gap:12px;background:#fff9ea;border-color:#e6d3a0}",
      ".tm-attention-card[hidden]{display:none}",
      ".tm-attention-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}",
      ".tm-attention-head h2{margin:0;font-size:22px;line-height:1.15}",
      ".tm-attention-list{display:grid;gap:10px}",
      ".tm-attention-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;border:1px solid #e6dfe6;background:#fff}",
      ".tm-attention-item strong{display:block;font-size:14px;margin-bottom:2px}",
      ".tm-attention-item p{margin:0;font-size:12px;color:#5d666b}",
      ".tm-attention-item--update{border-color:#cfe5db;background:#f6fbf8}",
      ".tm-attention-item--new{border-color:#d5dde2;background:#f8fafb}",
      ".tm-attention-item--redeploy{border-color:#ecd8a8;background:#fff9ec}",
      ".tm-attention-item--error{border-color:#edc3bf;background:#fff5f4}",
      ".tm-status-card{padding:14px 16px;display:grid;gap:8px}",
      ".tm-status-line{display:flex;justify-content:space-between;gap:16px;font-size:13px}",
      ".tm-table-card{padding:14px 16px;display:grid;gap:12px}",
      ".tm-table{width:100%;border-collapse:collapse;font-size:13px}",
      ".tm-table th,.tm-table td{padding:11px 12px;border-bottom:1px solid #e7ecef;text-align:left;vertical-align:middle}",
      ".tm-table th{font-size:12px;color:#5d666b;font-weight:700}",
      ".tm-table tr.is-current{background:#f8fafb}",
      ".tm-table tr.is-disabled{opacity:.58}",
      ".tm-table tr.is-attention td{background:#fcfcfb}",
      ".tm-table tr.is-update{box-shadow:inset 4px 0 0 #2f6f59}",
      ".tm-table tr.is-update td{background:#f7fcf9}",
      ".tm-table tr.is-redeploy{box-shadow:inset 4px 0 0 #9a6700}",
      ".tm-table tr.is-redeploy td{background:#fffaf0}",
      ".tm-table tr.is-new{box-shadow:inset 4px 0 0 #51666f}",
      ".tm-table tr.is-new td{background:#f8fafb}",
      ".tm-table tr.is-error{box-shadow:inset 4px 0 0 #b42318}",
      ".tm-table tr.is-error td{background:#fff5f4}",
      ".tm-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}",
      ".tm-badge-update{background:#ecf6f1;color:#2f6f59}",
      ".tm-badge-new{background:#eef1f3;color:#51666f}",
      ".tm-badge-redeploy{background:#fff7e6;color:#9a6700}",
      ".tm-badge-error{background:#fef3f2;color:#b42318}",
      ".tm-version-cell{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-version-cell--update strong,.tm-version-cell--redeploy strong,.tm-version-cell--new strong{font-size:14px}",
      ".tm-script-cell{display:grid;gap:6px}",
      ".tm-script-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-script-note{margin:0;font-size:12px;color:#5d666b}",
      ".tm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-button{height:34px;padding:0 14px;border-radius:999px;border:1px solid #51666f;background:#51666f;color:#fff;font-weight:600;cursor:pointer}",
      ".tm-button:hover{filter:brightness(.96)}",
      ".tm-button:disabled{opacity:.55;cursor:not-allowed;filter:none}",
      ".tm-button-secondary{background:#fff;color:#334047;border-color:#c8d0d5}",
      ".tm-button-ghost{background:#f5f6f7;color:#334047;border-color:#e1e7ea}",
      ".tm-button-emphasis{background:#1f6f54;border-color:#1f6f54;color:#fff}",
      ".tm-button-toggle{min-width:84px}",
      "@media (max-width: 900px){.tm-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tm-hero,.tm-attention-head{flex-direction:column}.tm-attention-item{grid-template-columns:1fr}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function buildManagerStatusText(rows) {
    if (managerState.statusText) return managerState.statusText;
    const total = rows.length;
    const updateCount = rows.filter((row) => row.hasUpdate).length;
    const redeployCount = rows.filter((row) => row.isRedeploy).length;
    const newCount = rows.filter((row) => row.isNew).length;
    const errorCount = rows.filter((row) => row.hasError).length;
    if (!total) return "불러온 스크립트가 없습니다.";
    if (!updateCount && !redeployCount && !newCount && !errorCount) return "최신 상태입니다.";
    const parts = [];
    if (updateCount) parts.push("업데이트 " + updateCount + "건");
    if (redeployCount) parts.push("재배포 " + redeployCount + "건");
    if (newCount) parts.push("신규 " + newCount + "건");
    if (errorCount) parts.push("오류 " + errorCount + "건");
    return parts.join(" / ");
  }

  function isGlobalManagerAction(action) {
    return action === "sync-current"
      || action === "sync-all"
      || action === "clear-cache"
      || action === "refresh";
  }

  function isManagerActionDisabled(action, scriptId) {
    const busyAction = managerState.busyAction;
    if (!busyAction) return false;
    if (busyAction.scope === "global") return true;
    return !!scriptId && busyAction.scriptId === scriptId;
  }

  function updateManagerActionState(doc) {
    if (!doc) return;
    doc.querySelectorAll("[data-action]").forEach((node) => {
      const action = node.getAttribute("data-action");
      const scriptId = node.getAttribute("data-script-id");
      node.disabled = isManagerActionDisabled(action, scriptId);
    });
  }

  function setManagerStatus(text, options) {
    managerState.statusText = String(text || "");
    managerState.busyAction = options && options.busyAction ? options.busyAction : null;
    managerState.busy = !!managerState.busyAction;
    if (!isManagerOpen()) return;
    const doc = managerState.windowRef.document;
    const statusNode = doc.getElementById("tm-manager-status-text");
    if (statusNode) statusNode.textContent = managerState.statusText || "준비됨";
    updateManagerActionState(doc);
  }

  function getActionNode(target) {
    const node = target && target.nodeType === 1
      ? target
      : (target && target.parentElement ? target.parentElement : null);
    if (!node || typeof node.closest !== "function") return null;
    return node.closest("[data-action]");
  }

  function isManagerOpen() {
    return !!(managerState.windowRef && !managerState.windowRef.closed);
  }

  function disposeManagerRefs() {
    managerState.windowRef = null;
    managerState.popupReady = false;
  }

  function bootstrapManagerDocument(doc) {
    if (!doc) return;
    doc.open();
    doc.write(buildManagerDocumentHtml());
    doc.close();
    applyManagerStyles(doc);
  }

  function closeManager() {
    if (isManagerOpen()) managerState.windowRef.close();
    disposeManagerRefs();
  }

  function appendRemovedSummary(baseText, removedCount) {
    if (!removedCount) return baseText;
    return baseText + " (제거 " + removedCount + "개 정리)";
  }

  function buildRefreshSuccessText(result) {
    const scriptCount = result && typeof result.scriptCount === "number" ? result.scriptCount : 0;
    const removedCount = result && typeof result.removedCount === "number" ? result.removedCount : 0;
    return appendRemovedSummary("관리창 새로고침 완료 (원격 확인 " + scriptCount + "개)", removedCount);
  }

  function buildSyncSuccessText(scope, result) {
    const targetCount = result && typeof result.targetCount === "number" ? result.targetCount : 0;
    const runCount = result && typeof result.runCount === "number" ? result.runCount : 0;
    const removedCount = result && typeof result.removedCount === "number" ? result.removedCount : 0;
    if (scope === "current-page" && targetCount === 0) {
      return appendRemovedSummary("현재 페이지 대상 0개", removedCount);
    }
    const label = scope === "all"
      ? "전체 동기화 완료"
      : (scope === "current-page" ? "현재 페이지 동기화 완료" : "스크립트 동기화 완료");
    return appendRemovedSummary(label + " (대상 " + targetCount + "개, 실행 " + runCount + "개)", removedCount);
  }

  async function runManagerAction(config, handler) {
    const sourceWindow = getPageWindow(config && config.window);
    setManagerStatus(config && config.startText ? config.startText : "작업 중...", {
      busyAction: config && config.busyAction ? config.busyAction : { scope: "global" },
    });
    try {
      const result = await handler();
      const successText = typeof (config && config.getSuccessText) === "function"
        ? config.getSuccessText(result)
        : (config && config.successText ? config.successText : "완료");
      setManagerStatus(successText, { busyAction: null });
      await renderManager(sourceWindow);
      return result;
    } catch (error) {
      setManagerStatus("실패: " + (error && error.message ? error.message : "알 수 없는 오류"), { busyAction: null });
      await renderManager(sourceWindow);
      if (root && root.console && typeof root.console.error === "function") {
        root.console.error("[VX Console] manager action failed", error);
      }
      throw error;
    }
  }

  function bindManagerEvents(doc) {
    if (!doc) return;
    if (typeof doc.__tmManagerClickHandler === "function" && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("click", doc.__tmManagerClickHandler);
    }
    const clickHandler = async (event) => {
      const actionNode = getActionNode(event.target);
      if (!actionNode) return;
      const action = actionNode.getAttribute("data-action");
      const scriptId = actionNode.getAttribute("data-script-id");
      const sourceWindow = getPageWindow();
      if (isManagerActionDisabled(action, scriptId)) return;

      if (action === "sync-current") {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "global" },
          startText: "현재 페이지 동기화 중...",
          getSuccessText: (result) => buildSyncSuccessText("current-page", result),
        }, () => syncScripts("current-page", { window: sourceWindow, forceRegistry: true, waitForLock: true }));
      } else if (action === "sync-all") {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "global" },
          startText: "전체 동기화 중...",
          getSuccessText: (result) => buildSyncSuccessText("all", result),
        }, () => syncScripts("all", { window: sourceWindow, forceRegistry: true, waitForLock: true }));
      } else if (action === "clear-cache") {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "global" },
          startText: "전체 캐시 삭제 중...",
          getSuccessText: (result) => "전체 캐시 삭제 완료 (" + (result && result.clearedCount ? result.clearedCount : 0) + "개)",
        }, () => clearAllCaches());
      } else if (action === "refresh") {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "global" },
          startText: "관리창 새로고침 중...",
          getSuccessText: (result) => buildRefreshSuccessText(result),
        }, () => refreshRegistryState({ force: true, waitForLock: true, refreshAllMeta: true, window: sourceWindow }));
      } else if (action === "toggle-script" && scriptId) {
        const enabled = actionNode.getAttribute("data-enabled") !== "true";
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "script", scriptId },
          startText: enabled ? "스크립트 활성화 중..." : "스크립트 비활성화 중...",
          successText: enabled ? "스크립트 활성화 완료" : "스크립트 비활성화 완료",
        }, () => toggleScriptEnabled(scriptId, enabled));
      } else if (action === "sync-script" && scriptId) {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "script", scriptId },
          startText: "스크립트 동기화 중...",
          getSuccessText: (result) => buildSyncSuccessText(scriptId, result),
        }, () => syncScripts(scriptId, { window: sourceWindow, forceRegistry: true, waitForLock: true }));
      } else if (action === "clear-script" && scriptId) {
        await runManagerAction({
          window: sourceWindow,
          busyAction: { scope: "script", scriptId },
          startText: "스크립트 캐시 삭제 중...",
          successText: "스크립트 캐시 삭제 완료",
        }, () => clearScriptCaches(scriptId));
      }
    };
    doc.__tmManagerClickHandler = clickHandler;
    doc.addEventListener("click", clickHandler);
  }

  function openPopupWindow(win) {
    if (!win || typeof win.open !== "function") return null;
    return win.open("", MANAGER_WINDOW_NAME, getManagerWindowFeatures());
  }

  function ensureManagerUi(win) {
    const opener = getPageWindow(win);
    const popup = isManagerOpen() ? managerState.windowRef : openPopupWindow(opener);
    if (!popup) return null;
    if (!managerState.popupReady || !popup.document.getElementById(MANAGER_ROOT_ID)) {
      bootstrapManagerDocument(popup.document);
      bindManagerEvents(popup.document);
      managerState.popupReady = true;
    }
    managerState.windowRef = popup;
    return popup;
  }

  async function renderManager(win) {
    const sourceWindow = getPageWindow(win);
    managerState.sourceWindow = sourceWindow;
    const popup = ensureManagerUi(sourceWindow);
    if (!popup) return null;
    const registry = readCachedRegistry() || { scripts: [] };
    const remoteStatusById = readRemoteStatusMap();
    const remoteMetaById = readRemoteMetaMap();

    const rows = buildManagerRows({
      registry,
      url: sourceWindow.location && sourceWindow.location.href ? sourceWindow.location.href : (root.location && root.location.href ? root.location.href : ""),
      localStateById: readLocalStateMap(registry),
      remoteMetaById,
      remoteStatusById,
    });

    const doc = popup.document;
    const rowsHtml = rows.map((row) => {
      const stateLabel = row.enabled ? "사용" : "중지";
      const appliesLabel = row.appliesHere ? '<span class="tm-badge tm-badge-new">현재 페이지</span>' : "";
      const toggleDisabledAttr = isManagerActionDisabled("toggle-script", row.id) ? " disabled" : "";
      const syncDisabledAttr = isManagerActionDisabled("sync-script", row.id) ? " disabled" : "";
      const clearDisabledAttr = isManagerActionDisabled("clear-script", row.id) ? " disabled" : "";
      const syncLabel = row.isNew ? "\uAC00\uC838\uC624\uAE30" : ((row.hasUpdate || row.isRedeploy) ? "\uC5C5\uB370\uC774\uD2B8" : "\uB3D9\uAE30\uD654");
      const syncClass = (row.isNew || row.hasUpdate || row.isRedeploy) ? "tm-button tm-button-emphasis" : "tm-button tm-button-ghost";
      return [
        '<tr class="' + getManagerRowClassName(row) + '">',
        "  <td>" + renderScriptNameCell(row) + "</td>",
        "  <td>" + stateLabel + " " + appliesLabel + "</td>",
        "  <td>" + escapeHtml(row.cachedVersion || "-") + "</td>",
        "  <td>" + renderRemoteVersionCell(row) + "</td>",
        "  <td>" + escapeHtml(row.lastSyncedAtLabel) + "</td>",
        '  <td><div class="tm-actions">',
        '    <button type="button" class="tm-button tm-button-secondary tm-button-toggle" data-action="toggle-script" data-script-id="' + escapeHtml(row.id) + '" data-enabled="' + String(row.enabled) + '"' + toggleDisabledAttr + '>' + (row.enabled ? "끄기" : "켜기") + "</button>",
        '    <button type="button" class="' + syncClass + '" data-action="sync-script" data-script-id="' + escapeHtml(row.id) + '"' + syncDisabledAttr + '>' + syncLabel + "</button>",
        '    <button type="button" class="tm-button tm-button-ghost" data-action="clear-script" data-script-id="' + escapeHtml(row.id) + '"' + clearDisabledAttr + '>캐시삭제</button>',
        "  </div></td>",
        "</tr>",
      ].join("");
    }).join("");
    const attentionRows = rows.filter((row) => row.isNew || row.hasUpdate || row.isRedeploy || row.hasError);
    const pendingCount = rows.filter((row) => row.hasUpdate || row.isRedeploy).length;
    const newCount = rows.filter((row) => row.isNew).length;
    const rowsHtmlWithAttention = rowsHtml.replace(/class="tm-button tm-button-ghost" data-action="sync-script" data-script-id="([^"]+)"([^>]*)>[^<]*<\/button>/g, (buttonMatch, scriptId, attrs) => {
      const targetRow = rows.find((row) => row.id === scriptId) || {};
      const syncLabel = targetRow.isNew ? "\uAC00\uC838\uC624\uAE30" : ((targetRow.hasUpdate || targetRow.isRedeploy) ? "\uC5C5\uB370\uC774\uD2B8" : "\uB3D9\uAE30\uD654");
      const syncClass = (targetRow.isNew || targetRow.hasUpdate || targetRow.isRedeploy) ? "tm-button tm-button-emphasis" : "tm-button tm-button-ghost";
      return 'class="' + syncClass + '" data-action="sync-script" data-script-id="' + escapeHtml(scriptId) + '"' + attrs + '>' + syncLabel + "</button>";
    });

    doc.getElementById("tm-manager-subtitle").textContent = formatManagerSubtitle(sourceWindow.location && sourceWindow.location.href ? sourceWindow.location.href : "");
    doc.getElementById("tm-summary-total").textContent = String(rows.length);
    doc.getElementById("tm-summary-current").textContent = String(rows.filter((row) => row.appliesHere).length);
    doc.getElementById("tm-summary-updates").textContent = String(pendingCount);
    doc.getElementById("tm-summary-new").textContent = String(newCount);
    doc.getElementById("tm-status-registry-check").textContent = formatSyncTime(getValue(REGISTRY_CHECKED_AT_KEY, ""));
    doc.getElementById("tm-status-meta-check").textContent = formatSyncTime(getValue(META_PREWARMED_AT_KEY, ""));
    doc.getElementById("tm-manager-status-text").textContent = buildManagerStatusText(rows);
    doc.getElementById("tm-summary-updates").parentElement.classList.toggle("is-hot", pendingCount > 0);
    doc.getElementById("tm-summary-new").parentElement.classList.toggle("is-hot", newCount > 0);
    doc.getElementById("tm-attention-card").hidden = attentionRows.length === 0;
    doc.getElementById("tm-attention-count").textContent = String(attentionRows.length) + "\uAC74";
    doc.getElementById("tm-attention-list").innerHTML = buildAttentionListHtml(attentionRows);
    doc.getElementById("tm-manager-rows").innerHTML = rowsHtmlWithAttention || '<tr><td colspan="6">표시할 스크립트가 없습니다.</td></tr>';
    updateManagerActionState(doc);
    return popup;
  }

  function notifyOnceForStatus(script, status) {
    if (!status || !status.kind || !status.version) return;
    if (status.kind !== "new" && status.kind !== "update" && status.kind !== "redeploy") return;
    const keys = buildScriptStorageKeys(script.id);
    const notifiedVersion = String(getValue(keys.notifiedVersion, ""));
    const notificationSignature = [status.kind, status.version, status.checksum || ""].join(":");
    if (notifiedVersion === notificationSignature) return;
    setValue(keys.notifiedVersion, notificationSignature);
    const title = status.kind === "new"
      ? "신규 모듈 감지"
      : (status.kind === "redeploy" ? "재배포 감지" : "업데이트 감지");
    const detailText = status.kind === "new"
      ? "모듈이 추가되었습니다."
      : (status.kind === "redeploy" ? "같은 버전 재배포가 준비되었습니다." : "업데이트가 준비되었습니다.");
    notify({
      title: "VX Console",
      text: script.name + " " + status.version + " " + detailText,
      timeout: 5000,
      onclick() {
        openManager(getPageWindow());
      },
    });
  }

  function getScriptsFromRegistry(registry) {
    return Array.isArray(registry && registry.scripts) ? registry.scripts : [];
  }

  function persistRemoteStatusMap(statusMap) {
    writeRemoteStatusMap(statusMap);
    return statusMap;
  }

  function persistScriptRemoteStatus(script, remoteMeta, options) {
    const cachedMeta = Object.prototype.hasOwnProperty.call(options || {}, "cachedMeta")
      ? normalizeMetaCacheEntry(script.id, options && options.cachedMeta)
      : readCachedScriptMeta(script.id);
    const kind = options && options.kind
      ? options.kind
      : resolveRemoteStatusKind(cachedMeta, remoteMeta);
    const finalKind = options && options.expectClean && kind !== "clean" ? "error" : kind;
    const status = buildRemoteStatus(script.id, finalKind, remoteMeta, {
      message: options && options.message
        ? options.message
        : (finalKind === "error" ? "동기화 후 상태를 확인하지 못했습니다." : ""),
    });
    const statusMap = options && options.statusMap ? options.statusMap : readRemoteStatusMap();
    updateRemoteStatusEntry(statusMap, script.id, status);
    if (!options || options.persist !== false) persistRemoteStatusMap(statusMap);
    if ((!options || options.notify !== false) && (finalKind === "new" || finalKind === "update" || finalKind === "redeploy")) {
      notifyOnceForStatus(script, status);
    }
    return status;
  }

  async function refreshRemoteMeta(script, options) {
    const remoteMeta = await fetchJson(resolvePath(script.metaPath, {
      cacheBustToken: options && options.cacheBustToken,
    }));
    const normalizedRemoteMeta = normalizeMetaCacheEntry(script.id, remoteMeta);
    writeRemoteMetaEntry(script.id, normalizedRemoteMeta);
    let status = persistScriptRemoteStatus(script, normalizedRemoteMeta, {
      notify: !options || options.notify !== false,
    });
    let didPrewarm = false;
    if (options && options.prewarm) {
      const shouldSync = shouldRefreshCache(readCachedScriptMeta(script.id), normalizedRemoteMeta) || !getValue(buildScriptStorageKeys(script.id).code, "");
      if (shouldSync) {
        await prewarmScriptBundle(script, {
          cacheBustToken: options && options.cacheBustToken,
        });
        didPrewarm = true;
      }
    }
    if (options && options.reconcileAfterSync) {
      status = persistScriptRemoteStatus(script, normalizedRemoteMeta, {
        cachedMeta: readCachedScriptMeta(script.id),
        expectClean: true,
        notify: false,
        message: didPrewarm ? "" : "",
      });
    }
    return {
      meta: normalizedRemoteMeta,
      status,
      didPrewarm,
    };
  }

  function purgeScriptCaches(scriptId) {
    const keys = buildScriptStorageKeys(scriptId);
    deleteValue(keys.enabled);
    deleteValue(keys.meta);
    deleteValue(keys.code);
    deleteValue(keys.registry);
    deleteValue(keys.assets);
    deleteValue(keys.remoteStatus);
    deleteValue(keys.notifiedVersion);
    readAssetCacheKeys(scriptId).forEach((assetKey) => deleteValue(assetKey));
    writeRemoteMetaEntry(scriptId, null);
    writeRemoteStatusEntry(scriptId, null);
    if (managerState.sourceWindow) {
      delete getRuntimeState(managerState.sourceWindow).executedVersions[scriptId];
    }
  }

  async function refreshRegistryState(options) {
    const currentRegistry = readCachedRegistry();
    const force = !!(options && options.force);
    const nowValue = Date.now();
    const cacheBustToken = options && options.cacheBustToken
      ? options.cacheBustToken
      : (force && options && options.waitForLock ? "manual-" + nowValue : "");
    if (!force && !shouldCheckAt(getValue(REGISTRY_CHECKED_AT_KEY, ""), REGISTRY_CHECK_INTERVAL_MS, nowValue)) {
      return {
        registry: currentRegistry,
        diff: { addedIds: [], removedIds: [] },
        scriptCount: 0,
        removedCount: 0,
        waited: false,
        skipped: false,
      };
    }

    const lockResult = await waitForRefreshLock(REGISTRY_LOCK_KEY, {
      waitForLock: !!(options && options.waitForLock),
      window: options && options.window,
      timeoutMessage: "다른 탭에서 registry를 갱신 중입니다. 잠시 후 다시 시도하세요.",
    });
    if (!lockResult.acquired) {
      return {
        registry: currentRegistry,
        diff: { addedIds: [], removedIds: [] },
        scriptCount: 0,
        removedCount: 0,
        waited: false,
        skipped: true,
      };
    }

    try {
      const nextRegistry = await fetchJson(withCacheBust(REGISTRY_URL, cacheBustToken));
      const diff = diffRegistryScripts(currentRegistry, nextRegistry);
      setValue(REGISTRY_RAW_KEY, JSON.stringify(nextRegistry));
      setValue(REGISTRY_CHECKED_AT_KEY, nowIso());

      diff.removedIds.forEach((scriptId) => {
        purgeScriptCaches(scriptId);
      });

      const scripts = getScriptsFromRegistry(nextRegistry);
        const addedIdSet = new Set(diff.addedIds);
        for (const addedId of diff.addedIds) {
          const addedScript = scripts.find((script) => script.id === addedId);
          if (!addedScript) continue;
          const remoteMeta = normalizeMetaCacheEntry(addedScript.id, await fetchJson(resolvePath(addedScript.metaPath, {
            cacheBustToken,
          })));
          writeRemoteMetaEntry(addedId, remoteMeta);
          persistScriptRemoteStatus(addedScript, remoteMeta, {
            kind: "new",
          notify: true,
        });
      }

        if (options && options.refreshAllMeta) {
          for (const script of scripts) {
            if (addedIdSet.has(script.id)) continue;
            await refreshRemoteMeta(script, { prewarm: false, notify: true, cacheBustToken });
          }
        }

      return {
        registry: nextRegistry,
        diff,
        scriptCount: options && options.refreshAllMeta ? scripts.length : diff.addedIds.length,
        removedCount: diff.removedIds.length,
        waited: !!lockResult.waited,
        skipped: false,
      };
    } finally {
      releaseRefreshLock(REGISTRY_LOCK_KEY);
    }
  }

  async function refreshRegistry(options) {
    const result = await refreshRegistryState(options);
    return result.registry;
  }

  async function prewarmEnabledScripts(registry, options) {
    const sourceRegistry = registry || readCachedRegistry();
    if (!sourceRegistry) return [];
    const force = !!(options && options.force);
    const nowValue = Date.now();
    if (!force && !shouldCheckAt(getValue(META_PREWARMED_AT_KEY, ""), META_PREWARM_INTERVAL_MS, nowValue)) {
      return [];
    }
    if (!acquireRefreshLock(META_PREWARM_LOCK_KEY, LOCK_TTL_MS, nowValue)) return [];

    try {
      const targets = getScriptsFromRegistry(sourceRegistry).filter((script) => {
        const state = readScriptLocalState(script);
        return isScriptEnabled(script, state.enabledOverride);
      });
      const results = [];
      for (const script of targets) {
        results.push(await refreshRemoteMeta(script, { prewarm: true, notify: true }));
      }
      setValue(META_PREWARMED_AT_KEY, nowIso());
      return results;
    } finally {
      releaseRefreshLock(META_PREWARM_LOCK_KEY);
    }
  }

  async function syncScripts(scope, options) {
    const forceRegistry = !options || options.forceRegistry !== false;
    const cacheBustToken = options && options.cacheBustToken
      ? options.cacheBustToken
      : (forceRegistry && options && options.waitForLock ? "manual-sync-" + Date.now() : "");
    const registryResult = forceRegistry
      ? await refreshRegistryState({
        force: true,
        waitForLock: !!(options && options.waitForLock),
        window: options && options.window,
        cacheBustToken,
      })
      : {
        registry: readCachedRegistry() || await refreshRegistry({ force: true }),
        diff: { addedIds: [], removedIds: [] },
        removedCount: 0,
      };
    const registry = registryResult.registry;
    if (!registry) {
      return {
        targetCount: 0,
        runCount: 0,
        removedCount: registryResult.removedCount || 0,
      };
    }
    const actionWindow = getPageWindow(options && options.window);
    const currentUrl = actionWindow && actionWindow.location ? actionWindow.location.href : (root.location && root.location.href ? root.location.href : "");
    const scripts = getScriptsFromRegistry(registry);
    const targets = scope === "all"
      ? scripts
      : (scope === "current-page"
        ? findMatchingScripts(registry, currentUrl)
        : scripts.filter((script) => script.id === scope));
    let runCount = 0;
      for (const script of targets) {
        const refreshResult = await refreshRemoteMeta(script, {
          prewarm: true,
          reconcileAfterSync: true,
          notify: false,
          cacheBustToken,
        });
      if (findMatchingScripts({ scripts: [script] }, currentUrl).length) {
        await runScript(script, actionWindow, {
          preferCache: true,
          allowRepeat: false,
        });
        runCount += 1;
        persistScriptRemoteStatus(script, refreshResult.meta, {
          cachedMeta: readCachedScriptMeta(script.id),
          expectClean: true,
          notify: false,
        });
      }
    }
    return {
      targetCount: targets.length,
      runCount,
      removedCount: registryResult.removedCount || 0,
      waited: !!registryResult.waited,
    };
  }

  async function ensureCurrentPageScriptsRunning(win) {
    const actionWindow = getPageWindow(win);
    const registry = readCachedRegistry();
    if (!registry) return 0;
    const currentUrl = actionWindow && actionWindow.location ? actionWindow.location.href : "";
    const targets = findMatchingScripts(registry, currentUrl);
    for (const script of targets) {
      try {
        await runScript(script, actionWindow, {
          preferCache: true,
          allowRepeat: false,
        });
      } catch (error) {
        if (root && root.console && typeof root.console.error === "function") {
          root.console.error("[VX Console] current-page run failed:", script.id, error);
        }
      }
    }
    return targets.length;
  }

  async function clearScriptCaches(scriptId) {
    purgeScriptCaches(scriptId);
    return { scriptId };
  }

  async function clearAllCaches() {
    const cacheKeys = getValueList().filter((key) => key.indexOf(STORAGE_PREFIX + ":") === 0);
    cacheKeys.forEach((key) => {
      if (key.indexOf(STORAGE_PREFIX + ":") === 0) deleteValue(key);
    });
    if (managerState.sourceWindow) {
      getRuntimeState(managerState.sourceWindow).executedVersions = {};
    }
    return { clearedCount: cacheKeys.length };
  }

  async function toggleScriptEnabled(scriptId, enabled) {
    const keys = buildScriptStorageKeys(scriptId);
    setValue(keys.enabled, !!enabled);
    if (managerState.sourceWindow) {
      delete getRuntimeState(managerState.sourceWindow).executedVersions[scriptId];
    }
    if (enabled && managerState.sourceWindow) {
      const registry = readCachedRegistry() || { scripts: [] };
      const script = getScriptsFromRegistry(registry).find((item) => item.id === scriptId);
      const currentUrl = managerState.sourceWindow.location && managerState.sourceWindow.location.href ? managerState.sourceWindow.location.href : "";
      if (script && findMatchingScripts({ scripts: [script] }, currentUrl).length) {
        await runScript(script, managerState.sourceWindow, {
          preferCache: true,
          allowRepeat: false,
        });
      }
    }
    return { scriptId, enabled };
  }

  function openManager(win) {
    managerState.sourceWindow = getPageWindow(win);
    const popup = ensureManagerUi(managerState.sourceWindow);
    if (popup && typeof popup.focus === "function") popup.focus();
    renderManager(managerState.sourceWindow);
    ensureCurrentPageScriptsRunning(managerState.sourceWindow);
    return popup;
  }

  function registerMenus(win) {
    const registerMenu = getFunction("GM_registerMenuCommand");
    if (typeof registerMenu !== "function") return;
    const sourceWindow = getPageWindow(win);
    registerMenu("VX Console 열기", function onOpenManager() {
      openManager(sourceWindow);
    });
  }

  function scheduleBackgroundRefresh(win, registry) {
    const timerFn = win && typeof win.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;
    timerFn(async () => {
      try {
        const nextRegistry = await refreshRegistry();
        await prewarmEnabledScripts(nextRegistry || registry);
        if (isManagerOpen()) await renderManager(getPageWindow(win));
      } catch (error) {
        if (root && root.console && typeof root.console.error === "function") {
          root.console.error("[VX Console] background refresh failed", error);
        }
      }
    }, 0);
  }

  async function bootstrap(win) {
    const scope = getPageWindow(win);
    managerState.bootWindow = scope;
    registerMenus(scope);

    let registry = readCachedRegistry();
    if (!registry) {
      registry = await refreshRegistry({ force: true });
    }
    if (!registry) return null;

    const currentUrl = scope.location && scope.location.href ? scope.location.href : "";
    const matchingScripts = findMatchingScripts(registry, currentUrl);
    for (const script of matchingScripts) {
      try {
        await runScript(script, scope, { preferCache: true });
      } catch (error) {
        if (root && root.console && typeof root.console.error === "function") {
          root.console.error("[VX Console] script failed:", script.id, error);
        }
      }
    }

    scheduleBackgroundRefresh(scope, registry);
    return registry;
  }

  return {
    REGISTRY_URL,
    RAW_BASE_URL,
    bootstrap,
    buildManagerDocumentHtml,
    buildAttentionListHtml,
    buildManagerRows,
    buildManagerShellHtml,
    buildRemoteStatus,
    buildScriptStorageKeys,
    renderScriptNameCell,
    canUseCachedMeta,
    compareVersions,
    createLoaderApi,
    diffRegistryScripts,
    findMatchingScripts,
    formatManagerSubtitle,
    formatSyncTime,
    getLoaderVersion,
    getManagerWindowFeatures,
    isScriptEnabled,
    matchUrlPattern,
    buildMetaFingerprint,
      normalizeMetaCacheEntry,
      readRemoteMetaMap,
      readRemoteStatusMap,
      refreshRemoteMeta,
      refreshRegistry,
      refreshRegistryState,
      resolvePath,
      resolveRemoteStatusKind,
      shouldCheckAt,
      shouldRefreshCache,
      syncScripts,
      withCacheBust,
    };
  });
