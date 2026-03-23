// ==UserScript==
// @name         tamp스크립트 GitHub 로더
// @namespace    github.victor.tamp.loader
// @version      0.2.0
// @description  GitHub 레지스트리에서 현재 페이지용 스크립트를 동기화하고 실행합니다.
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/victorwon2001/tamp-scripts/main/loader/loader.user.js
// @downloadURL  https://raw.githubusercontent.com/victorwon2001/tamp-scripts/main/loader/loader.user.js
// @supportURL   https://github.com/victorwon2001/tamp-scripts
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
  const MANAGER_STYLE_ID = "tm-loader-manager-style";
  const MANAGER_BACKDROP_ID = "tm-loader-manager-backdrop";
  const MANAGER_MODAL_ID = "tm-loader-manager-modal";

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

  function buildScriptStorageKeys(scriptId) {
    return {
      enabled: STORAGE_PREFIX + ":script:" + scriptId + ":enabled",
      meta: STORAGE_PREFIX + ":script:" + scriptId + ":meta",
      code: STORAGE_PREFIX + ":script:" + scriptId + ":code",
      registry: STORAGE_PREFIX + ":script:" + scriptId + ":registry",
    };
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

  function formatSyncTime(value) {
    const text = String(value || "");
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
    return match ? (match[1] + " " + match[2]) : "-";
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
      meta: safeJsonParse(getValue(keys.meta, null), null),
      hasCode: !!getValue(keys.code, ""),
      registry: safeJsonParse(getValue(keys.registry, null), null),
    };
  }

  function buildManagerRows(options) {
    const registry = options.registry || { scripts: [] };
    const url = options.url || "";
    const localStateById = options.localStateById || {};
    const remoteMetaById = options.remoteMetaById || {};
    const rows = (registry.scripts || []).map((script) => {
      const localState = localStateById[script.id] || {};
      const localMeta = localState.meta || null;
      const remoteMeta = remoteMetaById[script.id] || null;
      const appliesHere = Array.isArray(script.matches) && script.matches.some((pattern) => matchUrlPattern(url, pattern));

      return {
        id: script.id,
        name: script.name || script.id,
        appliesHere,
        enabled: isScriptEnabled(script, localState.enabledOverride),
        cachedVersion: localMeta && localMeta.version ? localMeta.version : "-",
        remoteVersion: remoteMeta && remoteMeta.version ? remoteMeta.version : "-",
        hasRemoteError: !!(remoteMeta && remoteMeta.error),
        lastSyncedAtLabel: formatSyncTime(localMeta && localMeta.lastSyncedAt),
      };
    });

    return rows.sort((left, right) => {
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
    const nextMeta = {
      version: meta.version,
      checksum: meta.checksum || "",
      lastSyncedAt: new Date().toISOString(),
    };

    if (!shouldRefreshCache(cachedMeta, meta) && cachedCode) {
      setValue(keys.meta, JSON.stringify(nextMeta));
      return cachedCode;
    }

    const codeText = await fetchText(resolvePath(meta.entry));
    setValue(keys.meta, JSON.stringify(nextMeta));
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

  function applyManagerStyles(doc) {
    if (doc.getElementById(MANAGER_STYLE_ID)) return;

    const css = [
      "#" + MANAGER_BACKDROP_ID + "{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,0.38);z-index:2147483647}",
      "#" + MANAGER_BACKDROP_ID + ".tm-open{display:flex}",
      "#" + MANAGER_MODAL_ID + "{width:min(1100px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto auto auto minmax(0,1fr);border:1px solid #cfd6de;background:#ffffff;color:#1f2933;box-shadow:0 18px 50px rgba(15,23,42,0.18);overflow:hidden}",
      "#" + MANAGER_MODAL_ID + " .tm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid #e5e9ef;background:#f7f9fb}",
      "#" + MANAGER_MODAL_ID + " .tm-head h2{margin:0;font-size:18px;line-height:1.2;color:#17212b}",
      "#" + MANAGER_MODAL_ID + " .tm-head p{margin:4px 0 0;color:#667281;font-size:12px;line-height:1.5}",
      "#" + MANAGER_MODAL_ID + " .tm-head-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}",
      "#" + MANAGER_MODAL_ID + " button{height:30px;padding:0 10px;border:1px solid #c4ccd5;background:linear-gradient(#ffffff,#eef2f5);color:#24313d;cursor:pointer;font-size:12px}",
      "#" + MANAGER_MODAL_ID + " button:hover{border-color:#aab4bf;background:linear-gradient(#ffffff,#e8edf2)}",
      "#" + MANAGER_MODAL_ID + " button:disabled{background:#f3f5f7;color:#95a0ad;cursor:default}",
      "#" + MANAGER_MODAL_ID + " .tm-primary{background:linear-gradient(#fdfefe,#e3eefb);border-color:#aac1de;color:#1f4f84;font-weight:700}",
      "#" + MANAGER_MODAL_ID + " .tm-toggle-on{background:linear-gradient(#f8fff9,#deefd9);border-color:#9bc08f;color:#285933;font-weight:700}",
      "#" + MANAGER_MODAL_ID + " .tm-toggle-off{background:linear-gradient(#fffdfa,#efe7dc);border-color:#cdb79d;color:#7a5831}",
      "#" + MANAGER_MODAL_ID + " .tm-filter-on{background:linear-gradient(#f8fbff,#e0eaf7);border-color:#aac1de;color:#25507f}",
      "#" + MANAGER_MODAL_ID + " .tm-summary{display:flex;gap:10px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid #e8edf2;background:#fcfdfe;color:#51606f;font-size:12px}",
      "#" + MANAGER_MODAL_ID + " .tm-summary strong{color:#17212b}",
      "#" + MANAGER_MODAL_ID + " .tm-status{padding:8px 18px;border-bottom:1px solid #e8edf2;background:#f9fbfc;color:#566576;font-size:12px;min-height:18px}",
      "#" + MANAGER_MODAL_ID + " .tm-table-wrap{overflow:auto;background:#fff}",
      "#" + MANAGER_MODAL_ID + " table{width:100%;border-collapse:collapse;table-layout:fixed}",
      "#" + MANAGER_MODAL_ID + " th,#" + MANAGER_MODAL_ID + " td{padding:9px 10px;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:middle;word-break:break-word;font-size:12px}",
      "#" + MANAGER_MODAL_ID + " th{position:sticky;top:0;background:#f4f7fa;color:#4a5868;z-index:1}",
      "#" + MANAGER_MODAL_ID + " tr.tm-applies-row{background:#fbfdff}",
      "#" + MANAGER_MODAL_ID + " .tm-script-name{font-weight:700;color:#17212b}",
      "#" + MANAGER_MODAL_ID + " .tm-script-id{display:block;margin-top:3px;color:#728092;font-size:11px}",
      "#" + MANAGER_MODAL_ID + " .tm-badge{display:inline-flex;align-items:center;padding:2px 6px;border:1px solid #cad3dc;background:#f5f7f9;color:#51606f;font-size:11px;font-weight:700}",
      "#" + MANAGER_MODAL_ID + " .tm-badge.tm-badge-match{background:#eef5ff;border-color:#bfd0e6;color:#2e557f}",
      "#" + MANAGER_MODAL_ID + " .tm-badge.tm-badge-miss{background:#fafbfc;border-color:#d8dee5;color:#788494}",
      "#" + MANAGER_MODAL_ID + " .tm-badge.tm-badge-error{background:#fff3f1;border-color:#e3bcb6;color:#9a4c43}",
      "#" + MANAGER_MODAL_ID + " .tm-actions{display:flex;gap:6px;flex-wrap:wrap}",
      "#" + MANAGER_MODAL_ID + " .tm-empty{padding:40px 16px;text-align:center;color:#718093}",
      "@media (max-width: 980px){#" + MANAGER_MODAL_ID + "{width:min(100vw,calc(100vw - 12px));max-height:calc(100vh - 12px)}#" + MANAGER_MODAL_ID + " .tm-head{padding:14px}#" + MANAGER_MODAL_ID + " .tm-summary{padding:10px 14px}#" + MANAGER_MODAL_ID + " .tm-status{padding:8px 14px}}",
    ].join("\n");

    if (typeof GM_addStyle === "function") GM_addStyle(css);
    const styleMarker = doc.createElement("meta");
    styleMarker.id = MANAGER_STYLE_ID;
    doc.head.appendChild(styleMarker);
  }

  function ensureManagerUi(state) {
    if (state.managerElements) return state.managerElements;

    const doc = state.doc;
    applyManagerStyles(doc);

    let backdrop = doc.getElementById(MANAGER_BACKDROP_ID);
    if (!backdrop) {
      backdrop = doc.createElement("div");
      backdrop.id = MANAGER_BACKDROP_ID;
      backdrop.innerHTML = [
        "<div id='" + MANAGER_MODAL_ID + "' role='dialog' aria-modal='true'>",
        "<div class='tm-head'>",
        "<div><h2>tamp스크립트 로더</h2><p id='tm-loader-manager-subtitle'></p></div>",
        "<div class='tm-head-actions'>",
        "<button type='button' id='tm-loader-filter-current'>현재 페이지만</button>",
        "<button type='button' id='tm-loader-sync-all' class='tm-primary'>전체 동기화</button>",
        "<button type='button' id='tm-loader-clear-all'>전체 캐시 삭제</button>",
        "<button type='button' id='tm-loader-close'>닫기</button>",
        "</div>",
        "</div>",
        "<div class='tm-summary' id='tm-loader-summary'></div>",
        "<div class='tm-status' id='tm-loader-status'></div>",
        "<div class='tm-table-wrap'>",
        "<table>",
        "<thead><tr>",
        "<th style='width:220px'>스크립트</th>",
        "<th style='width:88px'>현재 페이지</th>",
        "<th style='width:88px'>상태</th>",
        "<th style='width:90px'>캐시 버전</th>",
        "<th style='width:90px'>원격 버전</th>",
        "<th style='width:120px'>최종 동기화</th>",
        "<th style='width:210px'>액션</th>",
        "</tr></thead>",
        "<tbody id='tm-loader-rows'></tbody>",
        "</table>",
        "</div>",
        "</div>",
      ].join("");
      doc.body.appendChild(backdrop);
    }

    const elements = {
      backdrop,
      subtitle: doc.getElementById("tm-loader-manager-subtitle"),
      summary: doc.getElementById("tm-loader-summary"),
      status: doc.getElementById("tm-loader-status"),
      rows: doc.getElementById("tm-loader-rows"),
      close: doc.getElementById("tm-loader-close"),
      filterCurrent: doc.getElementById("tm-loader-filter-current"),
      syncAll: doc.getElementById("tm-loader-sync-all"),
      clearAll: doc.getElementById("tm-loader-clear-all"),
    };

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) closeManager(state);
    });
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
    backdrop.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.getAttribute("data-action");
      const scriptId = button.getAttribute("data-script-id");
      if (action === "toggle") toggleScriptEnabled(state, scriptId);
      if (action === "sync") syncScripts(state, [scriptId]);
      if (action === "clear") clearScriptCaches(state, [scriptId]);
    });
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.managerOpen) closeManager(state);
    });

    state.managerElements = elements;
    return elements;
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
    const elements = ensureManagerUi(state);
    const registry = state.registry || { scripts: [] };
    const localStateById = readLocalStateMap(registry);
    const rows = buildManagerRows({
      registry,
      url: state.url,
      localStateById,
      remoteMetaById: state.remoteMetaById,
    }).filter((row) => !state.managerFilterCurrentOnly || row.appliesHere);

    const totalCount = (registry.scripts || []).length;
    const appliesCount = buildManagerRows({
      registry,
      url: state.url,
      localStateById,
      remoteMetaById: state.remoteMetaById,
    }).filter((row) => row.appliesHere).length;
    const enabledCount = buildManagerRows({
      registry,
      url: state.url,
      localStateById,
      remoteMetaById: state.remoteMetaById,
    }).filter((row) => row.enabled).length;

    elements.subtitle.textContent = state.url;
    elements.filterCurrent.className = state.managerFilterCurrentOnly ? "tm-filter-on" : "";
    elements.filterCurrent.textContent = state.managerFilterCurrentOnly ? "전체 보기" : "현재 페이지만";
    elements.syncAll.disabled = !!state.managerBusy;
    elements.clearAll.disabled = !!state.managerBusy;
    elements.summary.innerHTML = [
      "<span>전체 <strong>" + totalCount + "</strong></span>",
      "<span>현재 페이지 적용 <strong>" + appliesCount + "</strong></span>",
      "<span>활성화 <strong>" + enabledCount + "</strong></span>",
      "<span>로더 버전 <strong>0.2.0</strong></span>",
    ].join("");
    elements.status.textContent = state.managerStatusText || (state.registryError || "로더 상태를 불러왔습니다.");

    if (!rows.length) {
      elements.rows.innerHTML = "<tr><td colspan='7' class='tm-empty'>표시할 스크립트가 없습니다.</td></tr>";
      return;
    }

    elements.rows.innerHTML = rows.map((row) => [
      "<tr class='" + (row.appliesHere ? "tm-applies-row" : "") + "'>",
      "<td><span class='tm-script-name'>" + escapeHtml(row.name) + "</span><span class='tm-script-id'>" + escapeHtml(row.id) + "</span></td>",
      "<td>" + (row.appliesHere
        ? "<span class='tm-badge tm-badge-match'>적용됨</span>"
        : "<span class='tm-badge tm-badge-miss'>아님</span>") + "</td>",
      "<td><button type='button' class='" + (row.enabled ? "tm-toggle-on" : "tm-toggle-off") + "' data-action='toggle' data-script-id='" + escapeHtml(row.id) + "'>" + (row.enabled ? "ON" : "OFF") + "</button></td>",
      "<td>" + escapeHtml(row.cachedVersion) + "</td>",
      "<td>" + (row.hasRemoteError
        ? "<span class='tm-badge tm-badge-error'>오류</span>"
        : escapeHtml(row.remoteVersion)) + "</td>",
      "<td>" + escapeHtml(row.lastSyncedAtLabel) + "</td>",
      "<td><div class='tm-actions'><button type='button' data-action='sync' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">동기화</button><button type='button' data-action='clear' data-script-id='" + escapeHtml(row.id) + "' " + (state.managerBusy ? "disabled" : "") + ">캐시삭제</button></div></td>",
      "</tr>",
    ].join("")).join("");
  }

  function openManager(state) {
    const elements = ensureManagerUi(state);
    state.managerOpen = true;
    elements.backdrop.className = "tm-open";
    renderManager(state);
    refreshRegistry(state, { refreshRemote: true });
  }

  function closeManager(state) {
    if (!state.managerElements) return;
    state.managerOpen = false;
    state.managerElements.backdrop.className = "";
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
    if (state.managerOpen) renderManager(state);
    try {
      state.registry = await loadRegistry();
      state.registryError = "";
      if (opts.refreshRemote) {
        state.managerStatusText = "원격 메타 정보를 불러오는 중입니다.";
        if (state.managerOpen) renderManager(state);
        await refreshRemoteMeta(state);
      }
      state.managerStatusText = "로더 상태를 최신 정보로 갱신했습니다.";
    } catch (error) {
      const cachedRegistry = safeJsonParse(getValue(STORAGE_PREFIX + ":registry:raw", ""), null);
      if (cachedRegistry) {
        state.registry = cachedRegistry;
        state.registryError = "원격 레지스트리 조회 실패, 캐시를 사용합니다.";
      } else {
        state.registryError = "레지스트리를 불러오지 못했습니다.";
      }
      state.managerStatusText = state.registryError;
    } finally {
      state.managerBusy = false;
      if (state.managerOpen) renderManager(state);
    }
  }

  async function syncScripts(state, scriptIds) {
    if (!state.registry) await refreshRegistry(state);
    if (!state.registry) return;

    const scripts = (state.registry.scripts || []).filter((script) => !scriptIds || scriptIds.indexOf(script.id) !== -1);
    state.managerBusy = true;
    state.managerStatusText = scripts.length === 1
      ? (scripts[0].name + " 동기화 중입니다.")
      : "전체 스크립트를 동기화하는 중입니다.";
    if (state.managerOpen) renderManager(state);

    try {
      for (const script of scripts) {
        const meta = await loadScriptMeta(script);
        state.remoteMetaById[script.id] = meta;
        await loadScriptCode(script, meta);
      }
      state.managerStatusText = scripts.length === 1
        ? (scripts[0].name + " 동기화가 완료되었습니다.")
        : "전체 스크립트 동기화가 완료되었습니다.";
    } catch (error) {
      state.managerStatusText = "동기화 실패: " + error.message;
    } finally {
      state.managerBusy = false;
      if (state.managerOpen) renderManager(state);
    }
  }

  function clearScriptCaches(state, scriptIds) {
    const scripts = (state.registry && state.registry.scripts || []).filter((script) => !scriptIds || scriptIds.indexOf(script.id) !== -1);
    scripts.forEach((script) => {
      const keys = buildScriptStorageKeys(script.id);
      deleteValue(keys.meta);
      deleteValue(keys.code);
      deleteValue(keys.registry);
      delete state.remoteMetaById[script.id];
    });
    state.managerStatusText = scripts.length === 1
      ? (scripts[0].name + " 캐시를 삭제했습니다.")
      : "선택한 스크립트 캐시를 삭제했습니다.";
    if (state.managerOpen) renderManager(state);
  }

  function clearAllCaches(state) {
    clearScriptCaches(state, (state.registry && state.registry.scripts || []).map((script) => script.id));
  }

  function toggleScriptEnabled(state, scriptId) {
    const script = (state.registry && state.registry.scripts || []).find((item) => item.id === scriptId);
    if (!script) return;
    const keys = buildScriptStorageKeys(scriptId);
    const current = getValue(keys.enabled, undefined);
    const enabled = isScriptEnabled(script, current);
    setValue(keys.enabled, !enabled);
    state.managerStatusText = (script.name || script.id) + " " + (!enabled ? "활성화" : "비활성화") + " 후 새로고침하면 적용됩니다.";
    if (state.managerOpen) renderManager(state);
  }

  function registerMenus(state) {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("tamp스크립트 로더 열기", function () {
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
    buildManagerRows,
    buildScriptStorageKeys,
    compareVersions,
    findMatchingScripts,
    formatSyncTime,
    isScriptEnabled,
    matchUrlPattern,
    shouldRefreshCache,
  };
});
