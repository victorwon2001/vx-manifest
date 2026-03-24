// ==UserScript==
// @name         VX Console
// @namespace    github.victor.vx.console
// @version      0.4.7
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

  const LOADER_VERSION = "0.4.7";
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
  const REMOTE_META_KEY = STORAGE_PREFIX + ":remote:meta";
  const REGISTRY_LOCK_KEY = STORAGE_PREFIX + ":registry:lock";
  const META_PREWARM_LOCK_KEY = STORAGE_PREFIX + ":meta:lock";
  const REGISTRY_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const META_PREWARM_INTERVAL_MS = 60 * 60 * 1000;
  const LOCK_TTL_MS = 90 * 1000;
  const FALLBACK_MEMORY_KEY = "__tmLoaderMemoryStore";
  const managerState = {
    windowRef: null,
    popupReady: false,
    bootWindow: null,
    sourceWindow: null,
    busy: false,
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

  function canUseCachedMeta(meta) {
    return !!(meta && meta.entry);
  }

  function readCachedRegistry() {
    return safeJsonParse(getValue(REGISTRY_RAW_KEY, ""), null);
  }

  function readRemoteStatusMap() {
    const value = safeJsonParse(getValue(REMOTE_STATUS_KEY, ""), {});
    return value && typeof value === "object" ? value : {};
  }

  function readRemoteMetaMap() {
    const value = safeJsonParse(getValue(REMOTE_META_KEY, ""), {});
    return value && typeof value === "object" ? value : {};
  }

  function writeRemoteStatusMap(statusMap) {
    setValue(REMOTE_STATUS_KEY, JSON.stringify(statusMap || {}));
  }

  function writeRemoteMetaMap(metaMap) {
    setValue(REMOTE_META_KEY, JSON.stringify(metaMap || {}));
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

  function updateRemoteStatusEntry(statusMap, scriptId, kind, version) {
    statusMap[scriptId] = {
      kind,
      version: String(version || ""),
      detectedAt: nowIso(),
    };
    return statusMap[scriptId];
  }

  function clearRemoteStatusEntry(statusMap, scriptId) {
    delete statusMap[scriptId];
  }

  function resolvePath(relativePath) {
    return new URL(String(relativePath || ""), RAW_BASE_URL).toString();
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
    const assetCode = await fetchText(resolvePath(dependency.path));
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
    const code = await fetchText(resolvePath(meta.entry));
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
    const remoteMeta = await fetchJson(resolvePath(script.metaPath));
    const syncedMeta = buildSyncedMeta(script.id, remoteMeta, {
      existing: cachedMeta,
      checkedAt: nowIso(),
    });
    setValue(buildScriptStorageKeys(script.id).meta, JSON.stringify(syncedMeta));
    setValue(buildScriptStorageKeys(script.id).registry, JSON.stringify(script));
    return syncedMeta;
  }

  async function prewarmScriptBundle(script) {
    const remoteMeta = await loadScriptMeta(script, { preferCache: false });
    await prewarmScriptAssets(script, remoteMeta);
    await loadScriptCode(script, remoteMeta, { preferCache: false });
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
    return classes.join(" ");
  }

  function renderRemoteVersionCell(row) {
    const version = escapeHtml(row.remoteVersion || "-");
    if (row.isNew) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-new">신규</span></div>';
    }
    if (row.hasUpdate) {
      return '<div class="tm-version-cell"><strong>' + version + '</strong><span class="tm-badge tm-badge-update">업데이트</span></div>';
    }
    return '<div class="tm-version-cell"><strong>' + version + "</strong></div>";
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
      const hasUpdate = !!(remoteMeta && cachedMeta && compareVersions(cachedVersion, remoteVersion) < 0);
      const isNew = !!(remoteStatus && remoteStatus.kind === "new");
      return {
        id: script.id,
        name: script.name || script.id,
        appliesHere,
        enabled,
        enabledOverride: localState.enabledOverride,
        cachedVersion,
        remoteVersion,
        lastSyncedAtLabel: formatSyncTime(cachedMeta && cachedMeta.lastSyncedAt),
        hasUpdate,
        isNew,
      };
    }).sort((left, right) => {
      const leftPriority = (left.isNew || left.hasUpdate ? 4 : 0) + (left.appliesHere ? 2 : 0) + (left.enabled ? 1 : 0);
      const rightPriority = (right.isNew || right.hasUpdate ? 4 : 0) + (right.appliesHere ? 2 : 0) + (right.enabled ? 1 : 0);
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
      ":root{color-scheme:light;font-family:'Segoe UI Variable Text','Segoe UI','Noto Sans KR',sans-serif}",
      "body{margin:0;background:#f5f6f7;color:#1f2427}",
      "#" + MANAGER_ROOT_ID + "{padding:20px}",
      ".tm-shell{display:grid;gap:16px}",
      ".tm-hero,.tm-status-card,.tm-table-card,.tm-summary-card{background:#fff;border:1px solid #d8dee2;border-radius:16px;box-shadow:0 16px 32px rgba(31,36,39,.06)}",
      ".tm-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px 22px}",
      ".tm-kicker{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#55626a}",
      ".tm-hero h1{margin:0;font-size:30px;line-height:1.1}",
      ".tm-subtitle{margin:8px 0 0;color:#5d666b;font-size:13px}",
      ".tm-toolbar-actions,.tm-table-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}",
      ".tm-summary-card{padding:14px 16px;display:grid;gap:6px}",
      ".tm-summary-card span{font-size:12px;color:#5d666b}",
      ".tm-summary-card strong{font-size:24px;line-height:1.1}",
      ".tm-status-card{padding:14px 16px;display:grid;gap:8px}",
      ".tm-status-line{display:flex;justify-content:space-between;gap:16px;font-size:13px}",
      ".tm-table-card{padding:14px 16px;display:grid;gap:12px}",
      ".tm-table{width:100%;border-collapse:collapse;font-size:13px}",
      ".tm-table th,.tm-table td{padding:11px 12px;border-bottom:1px solid #e7ecef;text-align:left;vertical-align:middle}",
      ".tm-table th{font-size:12px;color:#5d666b;font-weight:700}",
      ".tm-table tr.is-current{background:#f8fafb}",
      ".tm-table tr.is-disabled{opacity:.58}",
      ".tm-table tr.is-update{box-shadow:inset 3px 0 0 #2f6f59}",
      ".tm-table tr.is-new{box-shadow:inset 3px 0 0 #51666f}",
      ".tm-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}",
      ".tm-badge-update{background:#ecf6f1;color:#2f6f59}",
      ".tm-badge-new{background:#eef1f3;color:#51666f}",
      ".tm-version-cell{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".tm-button{height:34px;padding:0 14px;border-radius:999px;border:1px solid #51666f;background:#51666f;color:#fff;font-weight:600;cursor:pointer}",
      ".tm-button:hover{filter:brightness(.96)}",
      ".tm-button:disabled{opacity:.55;cursor:not-allowed;filter:none}",
      ".tm-button-secondary{background:#fff;color:#334047;border-color:#c8d0d5}",
      ".tm-button-ghost{background:#f5f6f7;color:#334047;border-color:#e1e7ea}",
      ".tm-button-toggle{min-width:84px}",
      "@media (max-width: 900px){.tm-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tm-hero{flex-direction:column}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function buildManagerStatusText(rows) {
    if (managerState.statusText) return managerState.statusText;
    const total = rows.length;
    const updateCount = rows.filter((row) => row.hasUpdate).length;
    const newCount = rows.filter((row) => row.isNew).length;
    if (!total) return "불러온 스크립트가 없습니다.";
    if (!updateCount && !newCount) return "최신 상태입니다.";
    return "업데이트 " + updateCount + "건, 신규 " + newCount + "건";
  }

  function setManagerStatus(text, busy) {
    managerState.statusText = String(text || "");
    managerState.busy = !!busy;
    if (!isManagerOpen()) return;
    const doc = managerState.windowRef.document;
    const statusNode = doc.getElementById("tm-manager-status-text");
    if (statusNode) statusNode.textContent = managerState.statusText || "준비됨";
    doc.querySelectorAll("[data-action]").forEach((node) => {
      node.disabled = managerState.busy;
    });
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

  function bindManagerEvents(doc) {
    if (!doc) return;
    if (typeof doc.__tmManagerClickHandler === "function" && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("click", doc.__tmManagerClickHandler);
    }
    const clickHandler = async (event) => {
      const actionNode = getActionNode(event.target);
      if (!actionNode) return;
      if (managerState.busy) return;
      const action = actionNode.getAttribute("data-action");
      const scriptId = actionNode.getAttribute("data-script-id");
      const sourceWindow = getPageWindow();
      try {
        if (action === "sync-current") {
          setManagerStatus("현재 페이지 동기화 중...", true);
          await syncScripts("current-page", { window: sourceWindow, forceRegistry: true });
          setManagerStatus("현재 페이지 동기화 완료", false);
        } else if (action === "sync-all") {
          setManagerStatus("전체 동기화 중...", true);
          await syncScripts("all", { window: sourceWindow, forceRegistry: true });
          setManagerStatus("전체 동기화 완료", false);
        } else if (action === "clear-cache") {
          setManagerStatus("전체 캐시 삭제 중...", true);
          await clearAllCaches();
          setManagerStatus("전체 캐시 삭제 완료", false);
        } else if (action === "refresh") {
          setManagerStatus("관리창 새로고침 중...", true);
          await refreshRegistry({ force: true });
          await renderManager(sourceWindow);
          setManagerStatus("관리창 새로고침 완료", false);
        } else if (action === "toggle-script" && scriptId) {
          const enabled = actionNode.getAttribute("data-enabled") !== "true";
          setManagerStatus(enabled ? "스크립트 활성화 중..." : "스크립트 비활성화 중...", true);
          await toggleScriptEnabled(scriptId, enabled);
          setManagerStatus(enabled ? "스크립트 활성화 완료" : "스크립트 비활성화 완료", false);
        } else if (action === "sync-script" && scriptId) {
          setManagerStatus("스크립트 동기화 중...", true);
          await syncScripts(scriptId, { window: sourceWindow, forceRegistry: true });
          setManagerStatus("스크립트 동기화 완료", false);
        } else if (action === "clear-script" && scriptId) {
          setManagerStatus("스크립트 캐시 삭제 중...", true);
          await clearScriptCaches(scriptId);
          setManagerStatus("스크립트 캐시 삭제 완료", false);
        }
      } catch (error) {
        setManagerStatus("실패: " + (error && error.message ? error.message : "알 수 없는 오류"), false);
        if (root && root.console && typeof root.console.error === "function") {
          root.console.error("[VX Console] manager action failed", error);
        }
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
      const disabledAttr = managerState.busy ? " disabled" : "";
      return [
        '<tr class="' + getManagerRowClassName(row) + '">',
        "  <td><strong>" + escapeHtml(row.name) + "</strong><div>" + escapeHtml(row.id) + "</div></td>",
        "  <td>" + stateLabel + " " + appliesLabel + "</td>",
        "  <td>" + escapeHtml(row.cachedVersion || "-") + "</td>",
        "  <td>" + renderRemoteVersionCell(row) + "</td>",
        "  <td>" + escapeHtml(row.lastSyncedAtLabel) + "</td>",
        '  <td><div class="tm-actions">',
        '    <button type="button" class="tm-button tm-button-secondary tm-button-toggle" data-action="toggle-script" data-script-id="' + escapeHtml(row.id) + '" data-enabled="' + String(row.enabled) + '"' + disabledAttr + '>' + (row.enabled ? "끄기" : "켜기") + "</button>",
        '    <button type="button" class="tm-button tm-button-ghost" data-action="sync-script" data-script-id="' + escapeHtml(row.id) + '"' + disabledAttr + '>동기화</button>',
        '    <button type="button" class="tm-button tm-button-ghost" data-action="clear-script" data-script-id="' + escapeHtml(row.id) + '"' + disabledAttr + '>캐시삭제</button>',
        "  </div></td>",
        "</tr>",
      ].join("");
    }).join("");

    doc.getElementById("tm-manager-subtitle").textContent = formatManagerSubtitle(sourceWindow.location && sourceWindow.location.href ? sourceWindow.location.href : "");
    doc.getElementById("tm-summary-total").textContent = String(rows.length);
    doc.getElementById("tm-summary-current").textContent = String(rows.filter((row) => row.appliesHere).length);
    doc.getElementById("tm-summary-updates").textContent = String(rows.filter((row) => row.hasUpdate).length);
    doc.getElementById("tm-summary-new").textContent = String(rows.filter((row) => row.isNew).length);
    doc.getElementById("tm-status-registry-check").textContent = formatSyncTime(getValue(REGISTRY_CHECKED_AT_KEY, ""));
    doc.getElementById("tm-status-meta-check").textContent = formatSyncTime(getValue(META_PREWARMED_AT_KEY, ""));
    doc.getElementById("tm-manager-status-text").textContent = buildManagerStatusText(rows);
    doc.getElementById("tm-manager-rows").innerHTML = rowsHtml || '<tr><td colspan="6">표시할 스크립트가 없습니다.</td></tr>';
    return popup;
  }

  function notifyOnceForStatus(script, status) {
    if (!status || !status.kind || !status.version) return;
    const keys = buildScriptStorageKeys(script.id);
    const notifiedVersion = String(getValue(keys.notifiedVersion, ""));
    if (notifiedVersion === String(status.kind + ":" + status.version)) return;
    setValue(keys.notifiedVersion, String(status.kind + ":" + status.version));
    const title = status.kind === "new" ? "신규 모듈 감지" : "업데이트 감지";
    notify({
      title: "VX Console",
      text: script.name + " " + status.version + " " + (status.kind === "new" ? "모듈이 추가되었습니다." : "업데이트가 준비되었습니다."),
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

  async function updateScriptRemoteStatus(script, remoteMeta, statusMap) {
    const cachedMeta = readCachedScriptMeta(script.id);
    if (!remoteMeta) {
      clearRemoteStatusEntry(statusMap, script.id);
      return null;
    }
    if (!cachedMeta) {
      const status = updateRemoteStatusEntry(statusMap, script.id, "new", remoteMeta.version);
      notifyOnceForStatus(script, status);
      return status;
    }
    if (compareVersions(cachedMeta.version, remoteMeta.version) < 0) {
      const status = updateRemoteStatusEntry(statusMap, script.id, "update", remoteMeta.version);
      notifyOnceForStatus(script, status);
      return status;
    }
    clearRemoteStatusEntry(statusMap, script.id);
    return null;
  }

  async function refreshRemoteMeta(script, options) {
    const remoteMeta = await fetchJson(resolvePath(script.metaPath));
    const normalizedRemoteMeta = normalizeMetaCacheEntry(script.id, remoteMeta);
    const remoteMetaMap = readRemoteMetaMap();
    remoteMetaMap[script.id] = normalizedRemoteMeta;
    writeRemoteMetaMap(remoteMetaMap);
    const statusMap = readRemoteStatusMap();
    await updateScriptRemoteStatus(script, normalizedRemoteMeta, statusMap);
    persistRemoteStatusMap(statusMap);
    if (options && options.prewarm) {
      const shouldSync = shouldRefreshCache(readCachedScriptMeta(script.id), normalizedRemoteMeta) || !getValue(buildScriptStorageKeys(script.id).code, "");
      if (shouldSync) await prewarmScriptBundle(script);
    }
    return normalizedRemoteMeta;
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
    const remoteMetaMap = readRemoteMetaMap();
    delete remoteMetaMap[scriptId];
    writeRemoteMetaMap(remoteMetaMap);
    if (managerState.sourceWindow) {
      delete getRuntimeState(managerState.sourceWindow).executedVersions[scriptId];
    }
  }

  async function refreshRegistry(options) {
    const currentRegistry = readCachedRegistry();
    const force = !!(options && options.force);
    const nowValue = Date.now();
    if (!force && !shouldCheckAt(getValue(REGISTRY_CHECKED_AT_KEY, ""), REGISTRY_CHECK_INTERVAL_MS, nowValue)) {
      return currentRegistry;
    }
    if (!acquireRefreshLock(REGISTRY_LOCK_KEY, LOCK_TTL_MS, nowValue)) return currentRegistry;

    try {
      const nextRegistry = await fetchJson(REGISTRY_URL);
      const diff = diffRegistryScripts(currentRegistry, nextRegistry);
      setValue(REGISTRY_RAW_KEY, JSON.stringify(nextRegistry));
      setValue(REGISTRY_CHECKED_AT_KEY, nowIso());

      diff.removedIds.forEach((scriptId) => {
        purgeScriptCaches(scriptId);
      });

      const nextStatusMap = readRemoteStatusMap();
      const nextRemoteMetaMap = readRemoteMetaMap();
      diff.removedIds.forEach((scriptId) => clearRemoteStatusEntry(nextStatusMap, scriptId));
      diff.removedIds.forEach((scriptId) => delete nextRemoteMetaMap[scriptId]);

      for (const addedId of diff.addedIds) {
        const addedScript = getScriptsFromRegistry(nextRegistry).find((script) => script.id === addedId);
        if (!addedScript) continue;
        const remoteMeta = normalizeMetaCacheEntry(addedScript.id, await fetchJson(resolvePath(addedScript.metaPath)));
        nextRemoteMetaMap[addedId] = remoteMeta;
        const status = updateRemoteStatusEntry(nextStatusMap, addedId, "new", remoteMeta.version);
        notifyOnceForStatus(addedScript, status);
      }

      persistRemoteStatusMap(nextStatusMap);
      writeRemoteMetaMap(nextRemoteMetaMap);
      return nextRegistry;
    } finally {
      releaseRefreshLock(REGISTRY_LOCK_KEY);
    }
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
        results.push(await refreshRemoteMeta(script, { prewarm: true }));
      }
      setValue(META_PREWARMED_AT_KEY, nowIso());
      return results;
    } finally {
      releaseRefreshLock(META_PREWARM_LOCK_KEY);
    }
  }

  async function syncScripts(scope, options) {
    const forceRegistry = !options || options.forceRegistry !== false;
    const registry = forceRegistry
      ? await refreshRegistry({ force: true })
      : (readCachedRegistry() || await refreshRegistry({ force: true }));
    const actionWindow = getPageWindow(options && options.window);
    const currentUrl = actionWindow && actionWindow.location ? actionWindow.location.href : (root.location && root.location.href ? root.location.href : "");
    const scripts = getScriptsFromRegistry(registry);
    const targets = scope === "all"
      ? scripts
      : (scope === "current-page"
        ? findMatchingScripts(registry, currentUrl)
        : scripts.filter((script) => script.id === scope));
    for (const script of targets) {
      await refreshRemoteMeta(script, { prewarm: true });
      if (findMatchingScripts({ scripts: [script] }, currentUrl).length) {
        await runScript(script, actionWindow, {
          preferCache: true,
          allowRepeat: false,
        });
      }
    }
    const statusMap = readRemoteStatusMap();
    targets.forEach((script) => clearRemoteStatusEntry(statusMap, script.id));
    persistRemoteStatusMap(statusMap);
    await renderManager(actionWindow);
    return targets.length;
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
    const statusMap = readRemoteStatusMap();
    clearRemoteStatusEntry(statusMap, scriptId);
    persistRemoteStatusMap(statusMap);
    await renderManager(getPageWindow());
  }

  async function clearAllCaches() {
    getValueList().forEach((key) => {
      if (key.indexOf(STORAGE_PREFIX + ":") === 0) deleteValue(key);
    });
    if (managerState.sourceWindow) {
      getRuntimeState(managerState.sourceWindow).executedVersions = {};
    }
    await renderManager(getPageWindow());
  }

  async function toggleScriptEnabled(scriptId, enabled) {
    const keys = buildScriptStorageKeys(scriptId);
    setValue(keys.enabled, !!enabled);
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
    await renderManager(getPageWindow());
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
    buildManagerRows,
    buildManagerShellHtml,
    buildScriptStorageKeys,
    canUseCachedMeta,
    compareVersions,
    createLoaderApi,
    diffRegistryScripts,
    findMatchingScripts,
    formatManagerSubtitle,
    formatSyncTime,
    getManagerWindowFeatures,
    isScriptEnabled,
    matchUrlPattern,
    normalizeMetaCacheEntry,
    shouldCheckAt,
    shouldRefreshCache,
  };
});
