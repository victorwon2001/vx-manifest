// ==UserScript==
// @name         tamp스크립트 GitHub 로더
// @namespace    github.victor.tamp.loader
// @version      0.1.0
// @description  GitHub 레지스트리에서 현재 페이지용 스크립트를 동기화하고 실행합니다.
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
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

  const STORAGE_PREFIX = "tm-loader:v1";
  const REPO_OWNER = "victorwon2001";
  const REPO_NAME = "tamp-scripts";
  const REPO_BRANCH = "main";
  const RAW_BASE_URL = "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/" + REPO_BRANCH + "/";
  const REGISTRY_URL = RAW_BASE_URL + "registry/registry.json";

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function matchUrlPattern(url, pattern) {
    const regex = new RegExp("^" + String(pattern).split("*").map(escapeRegExp).join(".*") + "$");
    return regex.test(String(url || ""));
  }

  function findMatchingScripts(registry, url) {
    const scripts = Array.isArray(registry && registry.scripts) ? registry.scripts : [];
    return scripts.filter((script) => Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern)));
  }

  function buildScriptStorageKeys(scriptId) {
    return {
      enabled: STORAGE_PREFIX + ":script:" + scriptId + ":enabled",
      meta: STORAGE_PREFIX + ":script:" + scriptId + ":meta",
      code: STORAGE_PREFIX + ":script:" + scriptId + ":code",
      registry: STORAGE_PREFIX + ":script:" + scriptId + ":registry",
    };
  }

  function parseVersion(version) {
    return String(version || "0.0.0").split(".").map((value) => Number(value || 0)).concat([0, 0, 0]).slice(0, 3);
  }

  function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let i = 0; i < 3; i += 1) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
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

  async function loadRegistry() {
    const text = await fetchText(REGISTRY_URL);
    setValue(STORAGE_PREFIX + ":registry:raw", text);
    return JSON.parse(text);
  }

  async function loadScriptMeta(script) {
    const meta = await fetchJson(resolvePath(script.metaPath));
    meta.id = meta.id || script.id;
    return meta;
  }

  async function loadCachedOrRemoteAsset(scriptId, suffix, remoteVersion, url, evaluator, context) {
    const key = STORAGE_PREFIX + ":asset:" + scriptId + ":" + suffix;
    const cached = getValue(key, null);
    const cachedPayload = cached ? JSON.parse(cached) : null;
    let code = cachedPayload && cachedPayload.code;

    if (!cachedPayload || cachedPayload.version !== remoteVersion) {
      code = await fetchText(resolvePath(url));
      setValue(key, JSON.stringify({ version: remoteVersion, code }));
    }

    return evaluator(code, context);
  }

  async function loadScriptCode(script, meta) {
    const keys = buildScriptStorageKeys(script.id);
    const cachedMetaRaw = getValue(keys.meta, null);
    const cachedCode = getValue(keys.code, null);
    const cachedMeta = cachedMetaRaw ? JSON.parse(cachedMetaRaw) : null;

    if (!shouldRefreshCache(cachedMeta, meta) && cachedCode) {
      return cachedCode;
    }

    const codeText = await fetchText(resolvePath(meta.entry));
    setValue(keys.meta, JSON.stringify({ version: meta.version, checksum: meta.checksum || "" }));
    setValue(keys.code, codeText);
    setValue(keys.registry, JSON.stringify(script));
    return codeText;
  }

  async function runScript(script, meta, context) {
    const deps = Array.isArray(meta.dependencies) ? meta.dependencies : [];
    for (const dependency of deps) {
      await loadCachedOrRemoteAsset(
        script.id,
        dependency.id,
        dependency.version || meta.version,
        dependency.path,
        evaluateLooseScript,
        context
      );
    }

    const code = await loadScriptCode(script, meta);
    const remoteModule = evaluateModule(code, context);
    if (!remoteModule || typeof remoteModule.run !== "function") {
      throw new Error(script.id + " module does not export run(context)");
    }
    remoteModule.run(context);
  }

  function notify(text) {
    if (typeof GM_notification === "function") {
      GM_notification({ text, title: "tamp스크립트 로더", timeout: 3000 });
    } else {
      console.log("[tamp-loader]", text);
    }
  }

  function registerMenus(win, scripts) {
    if (typeof GM_registerMenuCommand !== "function") return;

    GM_registerMenuCommand("현재 페이지 스크립트 동기화", () => {
      scripts.forEach((script) => {
        const keys = buildScriptStorageKeys(script.id);
        deleteValue(keys.meta);
        deleteValue(keys.code);
      });
      notify("캐시를 지웠습니다. 페이지를 새로고침하세요.");
    });

    GM_registerMenuCommand("전체 캐시 비우기", () => {
      scripts.forEach((script) => {
        const keys = buildScriptStorageKeys(script.id);
        deleteValue(keys.meta);
        deleteValue(keys.code);
        deleteValue(keys.registry);
      });
      notify("현재 페이지 관련 캐시를 비웠습니다. 페이지를 새로고침하세요.");
    });

    scripts.forEach((script) => {
      const keys = buildScriptStorageKeys(script.id);
      const current = getValue(keys.enabled, undefined);
      const enabled = isScriptEnabled(script, current);
      GM_registerMenuCommand(
        (enabled ? "끄기" : "켜기") + ": " + (script.name || script.id),
        () => {
          setValue(keys.enabled, !enabled);
          notify((script.name || script.id) + " " + (!enabled ? "활성화" : "비활성화") + " 후 새로고침하세요.");
        }
      );
    });
  }

  async function bootstrap(win) {
    const url = String(win.location.href || "");
    let registry;
    try {
      registry = await loadRegistry();
    } catch (error) {
      const cachedRegistry = getValue(STORAGE_PREFIX + ":registry:raw", "");
      if (!cachedRegistry) {
        console.error("[tamp-loader] registry load failed", error);
        return;
      }
      registry = JSON.parse(cachedRegistry);
    }

    const matchingScripts = findMatchingScripts(registry, url);
    if (!matchingScripts.length) return;

    registerMenus(win, matchingScripts);

    for (const script of matchingScripts) {
      const keys = buildScriptStorageKeys(script.id);
      const enabled = isScriptEnabled(script, getValue(keys.enabled, undefined));
      if (!enabled) continue;

      let meta;
      try {
        meta = await loadScriptMeta(script);
      } catch (error) {
        const cachedMeta = getValue(keys.meta, null);
        const cachedCode = getValue(keys.code, null);
        if (!cachedMeta || !cachedCode) {
          console.error("[tamp-loader] meta load failed", script.id, error);
          continue;
        }
        meta = JSON.parse(cachedMeta);
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
          },
        });
      } catch (error) {
        console.error("[tamp-loader] script run failed", script.id, error);
      }
    }
  }

  return {
    REGISTRY_URL,
    RAW_BASE_URL,
    bootstrap,
    buildScriptStorageKeys,
    compareVersions,
    findMatchingScripts,
    isScriptEnabled,
    matchUrlPattern,
    shouldRefreshCache,
  };
});

