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
      ".tm-ui-root{--tm-bg:" + TOKENS.bg + ";--tm-surface:" + TOKENS.surface + ";--tm-surface-alt:" + TOKENS.surfaceAlt + ";--tm-primary:" + TOKENS.primary + ";--tm-primary-strong:" + TOKENS.primaryStrong + ";--tm-success:" + TOKENS.success + ";--tm-warning:" + TOKENS.warning + ";--tm-danger:" + TOKENS.danger + ";--tm-text:" + TOKENS.text + ";--tm-muted:" + TOKENS.muted + ";--tm-border:" + TOKENS.border + ";--tm-shadow:" + TOKENS.shadow + ";--tm-panel-wash:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(247,250,252,.96) 100%);--tm-card-wash:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(248,250,252,.96) 100%);--tm-glow:radial-gradient(circle at top left,rgba(37,99,235,.16),transparent 34%);--tm-radius:14px;--tm-radius-sm:10px;--tm-control-height:36px;--tm-space-1:4px;--tm-space-2:8px;--tm-space-3:12px;--tm-space-4:16px;--tm-space-5:20px;color:var(--tm-text);font-family:'Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.5;letter-spacing:-.01em;box-sizing:border-box}",
      ".tm-ui-root *,.tm-ui-root *::before,.tm-ui-root *::after{box-sizing:border-box}",
      ".tm-ui-root.tm-ui-panel,.tm-ui-root.tm-ui-popup{background:var(--tm-glow),linear-gradient(180deg,#fcfdff 0%,var(--tm-bg) 42%,#edf3f8 100%)}",
      ".tm-ui-root.tm-ui-embedded{background:transparent}",
      ".tm-ui-root .tm-ui-card,.tm-ui-root .tm-ui-section,.tm-ui-root .tm-ui-summary{background:var(--tm-card-wash);border:1px solid rgba(219,227,239,.92);border-radius:var(--tm-radius);box-shadow:var(--tm-shadow)}",
      ".tm-ui-root .tm-ui-shell{position:relative;overflow:hidden}",
      ".tm-ui-root .tm-ui-toolbar{display:flex;gap:var(--tm-space-3);align-items:center;flex-wrap:wrap;padding:14px 16px;background:var(--tm-panel-wash);border:1px solid rgba(219,227,239,.92);border-radius:var(--tm-radius);box-shadow:var(--tm-shadow)}",
      ".tm-ui-root .tm-ui-panel-head{display:grid;gap:8px;width:100%;padding:18px 20px;border-bottom:1px solid rgba(219,227,239,.82);background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(244,247,251,.92) 100%)}",
      ".tm-ui-root .tm-ui-panel-head--compact{padding:14px 16px}",
      ".tm-ui-root .tm-ui-kicker{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:4px 10px;border-radius:999px;background:rgba(37,99,235,.08);color:var(--tm-primary-strong);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
      ".tm-ui-root .tm-ui-title{margin:0;font-size:clamp(18px,2vw,24px);line-height:1.15;font-weight:800;letter-spacing:-.03em;color:var(--tm-text)}",
      ".tm-ui-root .tm-ui-subtitle{margin:0;color:var(--tm-muted);font-size:13px;line-height:1.55}",
      ".tm-ui-root .tm-ui-head-meta{display:flex;align-items:center;justify-content:space-between;gap:var(--tm-space-2);flex-wrap:wrap}",
      ".tm-ui-root .tm-ui-stack{display:grid;gap:var(--tm-space-3)}",
      ".tm-ui-root .tm-ui-row{display:flex;gap:var(--tm-space-3);align-items:flex-start;flex-wrap:wrap}",
      ".tm-ui-root .tm-ui-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--tm-space-3);flex-wrap:wrap;margin-bottom:12px}",
      ".tm-ui-root .tm-ui-section-title{margin:0;font-size:14px;font-weight:800;color:var(--tm-text);letter-spacing:-.02em}",
      ".tm-ui-root .tm-ui-section-subtitle{margin:0;color:var(--tm-muted);font-size:12px;line-height:1.5}",
      ".tm-ui-root .tm-ui-statusbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(219,227,239,.88);border-radius:var(--tm-radius-sm);background:rgba(248,250,252,.84)}",
      ".tm-ui-root .tm-ui-inline-note{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(15,23,42,.04);color:var(--tm-muted);font-size:12px;font-weight:700}",
      ".tm-ui-root .tm-ui-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--tm-space-3)}",
      ".tm-ui-root .tm-ui-kpi{padding:14px 16px;border:1px solid rgba(219,227,239,.88);border-radius:var(--tm-radius);background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(244,247,251,.94) 100%)}",
      ".tm-ui-root .tm-ui-kpi__label{display:block;color:var(--tm-muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}",
      ".tm-ui-root .tm-ui-kpi__value{display:block;margin-top:6px;color:var(--tm-text);font-size:22px;line-height:1;font-weight:800;letter-spacing:-.04em}",
      ".tm-ui-root .tm-ui-kpi__meta{display:block;margin-top:6px;color:var(--tm-muted);font-size:12px}",
      ".tm-ui-root .tm-ui-scroll{overflow:auto;border:1px solid rgba(219,227,239,.88);border-radius:var(--tm-radius-sm);background:var(--tm-surface)}",
      ".tm-ui-root .tm-ui-divider{height:1px;background:linear-gradient(90deg,transparent 0%,rgba(219,227,239,.92) 20%,rgba(219,227,239,.92) 80%,transparent 100%)}",
      ".tm-ui-root .tm-ui-label{display:grid;gap:6px;color:var(--tm-muted);font-weight:700}",
      ".tm-ui-root .tm-ui-input,.tm-ui-root .tm-ui-select,.tm-ui-root .tm-ui-textarea,.tm-ui-root input[type='date'],.tm-ui-root input[type='number'],.tm-ui-root input[type='text'],.tm-ui-root select,.tm-ui-root textarea{width:auto;min-height:var(--tm-control-height);padding:0 10px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface);color:var(--tm-text);font:inherit;transition:border-color .2s ease, box-shadow .2s ease}",
      ".tm-ui-root .tm-ui-textarea,.tm-ui-root textarea{padding:10px;min-height:110px;resize:vertical}",
      ".tm-ui-root .tm-ui-input:focus,.tm-ui-root .tm-ui-select:focus,.tm-ui-root .tm-ui-textarea:focus,.tm-ui-root input[type='date']:focus,.tm-ui-root input[type='number']:focus,.tm-ui-root input[type='text']:focus,.tm-ui-root select:focus,.tm-ui-root textarea:focus{outline:none;border-color:var(--tm-primary);box-shadow:0 0 0 3px rgba(37,99,235,.14)}",
      ".tm-ui-root .tm-ui-btn,.tm-ui-root button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--tm-control-height);padding:0 14px;border:1px solid var(--tm-primary);border-radius:var(--tm-radius-sm);background:var(--tm-primary);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 8px 18px rgba(37,99,235,.18);transition:transform .16s ease, filter .16s ease, background-color .16s ease, border-color .16s ease, box-shadow .16s ease}",
      ".tm-ui-root .tm-ui-btn--primary,.tm-ui-root .tm-ui-btn.tm-ui-btn--primary{background:var(--tm-primary);border-color:var(--tm-primary);color:#fff}",
      ".tm-ui-root .tm-ui-btn:hover,.tm-ui-root button:hover{filter:brightness(.98);box-shadow:0 12px 24px rgba(37,99,235,.2)}",
      ".tm-ui-root .tm-ui-btn:active,.tm-ui-root button:active{transform:translateY(1px)}",
      ".tm-ui-root .tm-ui-btn:disabled,.tm-ui-root button:disabled{opacity:.56;cursor:not-allowed;transform:none}",
      ".tm-ui-root .tm-ui-btn--secondary,.tm-ui-root .tm-ui-btn.tm-ui-btn--secondary{background:var(--tm-surface);color:var(--tm-primary);border-color:var(--tm-border);box-shadow:none}",
      ".tm-ui-root .tm-ui-btn--ghost,.tm-ui-root .tm-ui-btn.tm-ui-btn--ghost{background:transparent;color:var(--tm-muted);border-color:transparent;box-shadow:none}",
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
      ".tm-ui-root .tm-ui-modal{width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.99) 0%,rgba(248,250,252,.98) 100%);border:1px solid rgba(219,227,239,.92);border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.18)}",
      ".tm-ui-root .tm-ui-modal__head,.tm-ui-root .tm-ui-modal__foot{display:flex;align-items:center;justify-content:space-between;gap:var(--tm-space-2);padding:14px 18px;background:rgba(255,255,255,.92);border-bottom:1px solid var(--tm-border)}",
      ".tm-ui-root .tm-ui-modal__foot{border-bottom:none;border-top:1px solid var(--tm-border);justify-content:flex-end}",
      ".tm-ui-root .tm-ui-modal__body{padding:18px;overflow:auto;background:var(--tm-surface)}",
      ".tm-ui-root [data-tm-align='left']{text-align:left}",
      ".tm-ui-root [data-tm-align='right']{text-align:right}",
      ".tm-ui-root [data-tm-hidden='true']{display:none !important}",
      ".tm-ui-root .tm-ui-animate-in{animation:tm-ui-fade-in .28s ease both}",
      ".tm-ui-root .tm-ui-reveal{animation:tm-ui-rise .24s ease both}",
      "@keyframes tm-ui-fade-in{from{opacity:0}to{opacity:1}}",
      "@keyframes tm-ui-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      ".tm-ui-root[data-tm-density='compact']{--tm-control-height:30px;--tm-radius:8px;--tm-radius-sm:8px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-table th,.tm-ui-root[data-tm-density='compact'] .tm-ui-table td,.tm-ui-root[data-tm-density='compact'] table th,.tm-ui-root[data-tm-density='compact'] table td{padding:7px 8px;font-size:12px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-btn,.tm-ui-root[data-tm-density='compact'] button{padding:0 10px;font-size:12px}",
      ".tm-ui-root[data-tm-density='normal'] .tm-ui-btn,.tm-ui-root[data-tm-density='normal'] button{font-size:13px}",
      "@media (max-width:768px){.tm-ui-root .tm-ui-panel-head{padding:16px}.tm-ui-root .tm-ui-toolbar{padding:12px}.tm-ui-root .tm-ui-kpi__value{font-size:18px}.tm-ui-root .tm-ui-section-head{align-items:flex-start}}",
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
