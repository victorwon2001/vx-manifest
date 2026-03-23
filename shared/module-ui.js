(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.__tmModuleUi = api;
  }
  if (typeof globalThis !== "undefined" && globalThis && typeof globalThis === "object") {
    globalThis.__tmModuleUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STYLE_ID = "tm-shared-module-ui-style";
  const TOKENS = {
    bg: "#f4f7fb",
    surface: "#ffffff",
    surfaceAlt: "#f8fafc",
    primary: "#2563eb",
    primaryStrong: "#1d4ed8",
    success: "#15803d",
    warning: "#d97706",
    danger: "#dc2626",
    text: "#0f172a",
    muted: "#64748b",
    border: "#dbe3ef",
    shadow: "0 12px 32px rgba(15,23,42,.12)",
  };

  function joinClasses(values) {
    return (Array.isArray(values) ? values : [values])
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeAttribute(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
  }

  function getKindClass(kind) {
    if (kind === "embedded") return "tm-ui-embedded";
    if (kind === "popup") return "tm-ui-popup";
    return "tm-ui-panel";
  }

  function buildRootClassName(kind, className) {
    return joinClasses(["tm-ui-root", getKindClass(kind), className || ""]);
  }

  function buildRootAttributes(options) {
    const settings = options || {};
    const className = buildRootClassName(settings.kind, settings.className);
    const density = settings.density === "compact" ? "compact" : "normal";
    return 'class="' + escapeAttribute(className) + '" data-tm-density="' + density + '"';
  }

  function buildModuleUiCss() {
    return [
      ".tm-ui-root{--tm-bg:" + TOKENS.bg + ";--tm-surface:" + TOKENS.surface + ";--tm-surface-alt:" + TOKENS.surfaceAlt + ";--tm-primary:" + TOKENS.primary + ";--tm-primary-strong:" + TOKENS.primaryStrong + ";--tm-success:" + TOKENS.success + ";--tm-warning:" + TOKENS.warning + ";--tm-danger:" + TOKENS.danger + ";--tm-text:" + TOKENS.text + ";--tm-muted:" + TOKENS.muted + ";--tm-border:" + TOKENS.border + ";--tm-shadow:" + TOKENS.shadow + ";--tm-radius:10px;--tm-radius-sm:8px;--tm-control-height:36px;--tm-space-1:4px;--tm-space-2:8px;--tm-space-3:12px;--tm-space-4:16px;color:var(--tm-text);font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;box-sizing:border-box}",
      ".tm-ui-root *,.tm-ui-root *::before,.tm-ui-root *::after{box-sizing:border-box}",
      ".tm-ui-root.tm-ui-panel,.tm-ui-root.tm-ui-popup{background:var(--tm-bg)}",
      ".tm-ui-root.tm-ui-embedded{background:transparent}",
      ".tm-ui-root .tm-ui-card,.tm-ui-root .tm-ui-section,.tm-ui-root .tm-ui-summary{background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:var(--tm-radius);box-shadow:var(--tm-shadow)}",
      ".tm-ui-root .tm-ui-toolbar{display:flex;gap:var(--tm-space-3);align-items:center;flex-wrap:wrap;background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:var(--tm-radius);box-shadow:var(--tm-shadow)}",
      ".tm-ui-root .tm-ui-label{display:grid;gap:6px;color:var(--tm-muted);font-weight:700}",
      ".tm-ui-root .tm-ui-input,.tm-ui-root .tm-ui-select,.tm-ui-root .tm-ui-textarea,.tm-ui-root input[type='date'],.tm-ui-root input[type='number'],.tm-ui-root input[type='text'],.tm-ui-root select,.tm-ui-root textarea{width:auto;min-height:var(--tm-control-height);padding:0 10px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface);color:var(--tm-text);font:inherit;transition:border-color .2s ease, box-shadow .2s ease}",
      ".tm-ui-root .tm-ui-textarea,.tm-ui-root textarea{padding:10px;min-height:110px;resize:vertical}",
      ".tm-ui-root .tm-ui-input:focus,.tm-ui-root .tm-ui-select:focus,.tm-ui-root .tm-ui-textarea:focus,.tm-ui-root input[type='date']:focus,.tm-ui-root input[type='number']:focus,.tm-ui-root input[type='text']:focus,.tm-ui-root select:focus,.tm-ui-root textarea:focus{outline:none;border-color:var(--tm-primary);box-shadow:0 0 0 3px rgba(37,99,235,.14)}",
      ".tm-ui-root .tm-ui-btn,.tm-ui-root button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--tm-control-height);padding:0 14px;border:1px solid var(--tm-primary);border-radius:var(--tm-radius-sm);background:var(--tm-primary);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;transition:transform .16s ease, filter .16s ease, background-color .16s ease, border-color .16s ease}",
      ".tm-ui-root .tm-ui-btn--primary,.tm-ui-root .tm-ui-btn.tm-ui-btn--primary{background:var(--tm-primary);border-color:var(--tm-primary);color:#fff}",
      ".tm-ui-root .tm-ui-btn:hover,.tm-ui-root button:hover{filter:brightness(.98)}",
      ".tm-ui-root .tm-ui-btn:active,.tm-ui-root button:active{transform:translateY(1px)}",
      ".tm-ui-root .tm-ui-btn:disabled,.tm-ui-root button:disabled{opacity:.56;cursor:not-allowed;transform:none}",
      ".tm-ui-root .tm-ui-btn--secondary,.tm-ui-root .tm-ui-btn.tm-ui-btn--secondary{background:var(--tm-surface);color:var(--tm-primary);border-color:var(--tm-border)}",
      ".tm-ui-root .tm-ui-btn--success,.tm-ui-root .tm-ui-btn.tm-ui-btn--success{background:var(--tm-success);border-color:var(--tm-success)}",
      ".tm-ui-root .tm-ui-btn--warning,.tm-ui-root .tm-ui-btn.tm-ui-btn--warning{background:var(--tm-warning);border-color:var(--tm-warning)}",
      ".tm-ui-root .tm-ui-btn--danger,.tm-ui-root .tm-ui-btn.tm-ui-btn--danger{background:var(--tm-danger);border-color:var(--tm-danger)}",
      ".tm-ui-root .tm-ui-table,.tm-ui-root table{width:100%;border-collapse:collapse;background:var(--tm-surface)}",
      ".tm-ui-root .tm-ui-table th,.tm-ui-root .tm-ui-table td,.tm-ui-root table th,.tm-ui-root table td{border:1px solid var(--tm-border);padding:9px 10px;font-size:13px;vertical-align:middle}",
      ".tm-ui-root .tm-ui-table th,.tm-ui-root table th{background:var(--tm-surface-alt);color:var(--tm-muted);font-weight:700}",
      ".tm-ui-root .tm-ui-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;border:1px solid transparent;background:var(--tm-surface-alt);color:var(--tm-text);font-size:12px;font-weight:700}",
      ".tm-ui-root .tm-ui-badge--success{background:#edf9f0;color:var(--tm-success);border-color:#cde7d4}",
      ".tm-ui-root .tm-ui-badge--warning{background:#fff7ed;color:var(--tm-warning);border-color:#f2dcc1}",
      ".tm-ui-root .tm-ui-badge--danger{background:#fef2f2;color:var(--tm-danger);border-color:#f2cccc}",
      ".tm-ui-root .tm-ui-message{padding:12px 14px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface-alt);color:var(--tm-text)}",
      ".tm-ui-root .tm-ui-empty{padding:20px 12px;text-align:center;color:var(--tm-muted)}",
      ".tm-ui-root .tm-ui-log{background:#0f172a;color:#e2e8f0;border-radius:var(--tm-radius-sm);padding:10px;font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.5}",
      ".tm-ui-root .tm-ui-log a{color:#93c5fd}",
      ".tm-ui-root .tm-ui-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.32)}",
      ".tm-ui-root .tm-ui-modal{width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.18)}",
      ".tm-ui-root .tm-ui-modal__head,.tm-ui-root .tm-ui-modal__foot{display:flex;align-items:center;justify-content:space-between;gap:var(--tm-space-2);padding:14px 18px;background:var(--tm-surface);border-bottom:1px solid var(--tm-border)}",
      ".tm-ui-root .tm-ui-modal__foot{border-bottom:none;border-top:1px solid var(--tm-border);justify-content:flex-end}",
      ".tm-ui-root .tm-ui-modal__body{padding:18px;overflow:auto;background:var(--tm-surface)}",
      ".tm-ui-root [data-tm-align='left']{text-align:left}",
      ".tm-ui-root [data-tm-align='right']{text-align:right}",
      ".tm-ui-root [data-tm-hidden='true']{display:none !important}",
      ".tm-ui-root[data-tm-density='compact']{--tm-control-height:30px;--tm-radius:8px;--tm-radius-sm:8px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-table th,.tm-ui-root[data-tm-density='compact'] .tm-ui-table td,.tm-ui-root[data-tm-density='compact'] table th,.tm-ui-root[data-tm-density='compact'] table td{padding:7px 8px;font-size:12px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-btn,.tm-ui-root[data-tm-density='compact'] button{padding:0 10px;font-size:12px}",
      ".tm-ui-root[data-tm-density='normal'] .tm-ui-btn,.tm-ui-root[data-tm-density='normal'] button{font-size:13px}",
    ].join("");
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head) return null;
    let style = doc.getElementById(STYLE_ID);
    if (style) return style;
    style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildModuleUiCss();
    doc.head.appendChild(style);
    return style;
  }

  return {
    TOKENS,
    STYLE_ID,
    buildModuleUiCss,
    buildRootAttributes,
    buildRootClassName,
    ensureStyles,
  };
});
