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
  const FONT_IMPORT_URL = "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=Noto+Sans+KR:wght@400;500;700;800&display=swap";
  const FONT_IMPORT_RULE = "@import url('" + FONT_IMPORT_URL + "');";
  const FONT_STACK = "'Public Sans','Noto Sans KR','Segoe UI Variable Text','Segoe UI','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const TOKENS = {
    bg: "#f3f4f5",
    surface: "#ffffff",
    surfaceAlt: "#eef0f2",
    primary: "#245ad4",
    primaryStrong: "#1a44a8",
    success: "#245ad4",
    warning: "#c24d4d",
    danger: "#c24d4d",
    text: "#15181a",
    muted: "#5d656d",
    border: "#d7dbe0",
    shadow: "0 24px 56px rgba(15,23,32,.14)",
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
      FONT_IMPORT_RULE,
      ".tm-ui-root{--tm-bg:" + TOKENS.bg + ";--tm-surface:" + TOKENS.surface + ";--tm-surface-alt:" + TOKENS.surfaceAlt + ";--tm-primary:" + TOKENS.primary + ";--tm-primary-strong:" + TOKENS.primaryStrong + ";--tm-success:" + TOKENS.success + ";--tm-warning:" + TOKENS.warning + ";--tm-danger:" + TOKENS.danger + ";--tm-text:" + TOKENS.text + ";--tm-muted:" + TOKENS.muted + ";--tm-border:" + TOKENS.border + ";--tm-shadow:" + TOKENS.shadow + ";--tm-accent-wash:linear-gradient(180deg,rgba(36,90,212,.98) 0%,rgba(26,68,168,.98) 100%);--tm-danger-wash:linear-gradient(180deg,rgba(194,77,77,.98) 0%,rgba(171,57,57,.98) 100%);--tm-soft-accent:rgba(36,90,212,.08);--tm-soft-danger:rgba(194,77,77,.08);--tm-radius:16px;--tm-radius-sm:12px;--tm-control-height:34px;--tm-space-1:4px;--tm-space-2:8px;--tm-space-3:12px;--tm-space-4:16px;--tm-space-5:20px;color:var(--tm-text);font-family:" + FONT_STACK + ";font-size:13px;line-height:1.56;letter-spacing:-.01em;box-sizing:border-box}",
      ".tm-ui-root *,.tm-ui-root *::before,.tm-ui-root *::after{box-sizing:border-box}",
      ".tm-ui-root.tm-ui-panel,.tm-ui-root.tm-ui-popup{background:var(--tm-bg)}",
      ".tm-ui-root.tm-ui-popup{font-size:14px}",
      ".tm-ui-root.tm-ui-embedded{background:transparent}",
      ".tm-ui-root .tm-ui-card,.tm-ui-root .tm-ui-section,.tm-ui-root .tm-ui-summary{background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:var(--tm-radius);box-shadow:0 1px 0 rgba(15,23,32,.02)}",
      ".tm-ui-root .tm-ui-shell{display:grid;gap:10px}",
      ".tm-ui-root .tm-ui-toolbar{display:flex;gap:var(--tm-space-3);align-items:center;flex-wrap:wrap;padding:12px 14px;background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:var(--tm-radius);box-shadow:none}",
      ".tm-ui-root .tm-ui-toolbar__group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".tm-ui-root .tm-ui-toolbar__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}",
      ".tm-ui-root .tm-ui-toolbar__spacer{flex:1 1 auto}",
      ".tm-ui-root .tm-ui-panel-head{display:grid;gap:6px;width:100%;padding:14px 16px;border-bottom:1px solid var(--tm-border);background:var(--tm-surface)}",
      ".tm-ui-root .tm-ui-panel-head--compact{padding:12px 14px}",
      ".tm-ui-root .tm-ui-kicker{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:0;border-radius:0;background:transparent;color:var(--tm-primary-strong);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
      ".tm-ui-root .tm-ui-title{margin:0;font-size:clamp(20px,1.8vw,24px);line-height:1.12;font-weight:800;letter-spacing:-.03em;color:var(--tm-text)}",
      ".tm-ui-root .tm-ui-subtitle{margin:0;color:#4f5758;font-size:13px;line-height:1.55}",
      ".tm-ui-root .tm-ui-head-meta{display:flex;align-items:center;justify-content:space-between;gap:var(--tm-space-2);flex-wrap:wrap}",
      ".tm-ui-root .tm-ui-stack{display:grid;gap:var(--tm-space-3)}",
      ".tm-ui-root .tm-ui-row{display:flex;gap:var(--tm-space-3);align-items:flex-start;flex-wrap:wrap}",
      ".tm-ui-root .tm-ui-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--tm-space-3);flex-wrap:wrap;margin-bottom:12px}",
      ".tm-ui-root .tm-ui-section-title{margin:0;font-size:15px;font-weight:800;color:var(--tm-text);letter-spacing:-.02em}",
      ".tm-ui-root .tm-ui-section-subtitle{margin:0;color:#4f5758;font-size:12px;line-height:1.5}",
      ".tm-ui-root .tm-ui-statusbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface-alt)}",
      ".tm-ui-root .tm-ui-inline-note{display:inline-flex;align-items:center;gap:6px;padding:0;background:transparent;color:#4f5758;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}",
      ".tm-ui-root .tm-ui-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--tm-space-3)}",
      ".tm-ui-root .tm-ui-kpi{padding:12px 14px;border:1px solid var(--tm-border);border-radius:var(--tm-radius);background:var(--tm-surface-alt)}",
      ".tm-ui-root .tm-ui-kpi__label{display:block;color:#4f5758;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}",
      ".tm-ui-root .tm-ui-kpi__value{display:block;margin-top:6px;color:var(--tm-text);font-size:20px;line-height:1;font-weight:800;letter-spacing:-.04em}",
      ".tm-ui-root .tm-ui-kpi__meta{display:block;margin-top:6px;color:var(--tm-muted);font-size:12px}",
      ".tm-ui-root .tm-ui-scroll{overflow:auto;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface);scrollbar-gutter:stable}",
      ".tm-ui-root .tm-ui-scroll>.tm-ui-table,.tm-ui-root .tm-ui-scroll>table{min-width:100%}",
      ".tm-ui-root .tm-ui-divider{height:1px;background:var(--tm-border)}",
      ".tm-ui-root .tm-ui-label{display:grid;gap:6px;color:#4f5758;font-size:12px;font-weight:700}",
      ".tm-ui-root .tm-ui-input,.tm-ui-root .tm-ui-select,.tm-ui-root .tm-ui-textarea,.tm-ui-root input[type='date'],.tm-ui-root input[type='number'],.tm-ui-root input[type='text'],.tm-ui-root select,.tm-ui-root textarea{width:auto;min-height:var(--tm-control-height);padding:0 10px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface);color:var(--tm-text);font:inherit;font-size:13px;transition:border-color .2s ease, box-shadow .2s ease}",
      ".tm-ui-root .tm-ui-textarea,.tm-ui-root textarea{padding:10px;min-height:96px;resize:vertical}",
      ".tm-ui-root .tm-ui-input:focus,.tm-ui-root .tm-ui-select:focus,.tm-ui-root .tm-ui-textarea:focus,.tm-ui-root input[type='date']:focus,.tm-ui-root input[type='number']:focus,.tm-ui-root input[type='text']:focus,.tm-ui-root select:focus,.tm-ui-root textarea:focus{outline:none;border-color:var(--tm-primary);box-shadow:0 0 0 3px rgba(45,95,212,.14)}",
      ".tm-ui-root .tm-ui-btn,.tm-ui-root button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--tm-control-height);padding:0 12px;border:1px solid var(--tm-primary-strong);border-radius:var(--tm-radius-sm);background:var(--tm-accent-wash);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:none;transition:transform .16s ease, background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease}",
      ".tm-ui-root .tm-ui-btn--primary,.tm-ui-root .tm-ui-btn.tm-ui-btn--primary{background:var(--tm-accent-wash);border-color:var(--tm-primary-strong);color:#fff}",
      ".tm-ui-root .tm-ui-btn:hover,.tm-ui-root button:hover{transform:translateY(-1px);filter:none}",
      ".tm-ui-root .tm-ui-btn:active,.tm-ui-root button:active{transform:translateY(0)}",
      ".tm-ui-root .tm-ui-btn:disabled,.tm-ui-root button:disabled{opacity:.56;cursor:not-allowed;transform:none}",
      ".tm-ui-root .tm-ui-btn--secondary,.tm-ui-root .tm-ui-btn.tm-ui-btn--secondary{background:var(--tm-surface);color:var(--tm-text);border-color:var(--tm-border);box-shadow:none}",
      ".tm-ui-root .tm-ui-btn--ghost,.tm-ui-root .tm-ui-btn.tm-ui-btn--ghost{background:transparent;color:var(--tm-muted);border-color:transparent;box-shadow:none}",
      ".tm-ui-root .tm-ui-btn--success,.tm-ui-root .tm-ui-btn.tm-ui-btn--success{background:var(--tm-success);border-color:var(--tm-success)}",
      ".tm-ui-root .tm-ui-btn--warning,.tm-ui-root .tm-ui-btn.tm-ui-btn--warning{background:var(--tm-danger-wash);border-color:var(--tm-danger);color:#fff}",
      ".tm-ui-root .tm-ui-btn--danger,.tm-ui-root .tm-ui-btn.tm-ui-btn--danger{background:var(--tm-danger-wash);border-color:var(--tm-danger);color:#fff}",
      ".tm-ui-root .tm-ui-table,.tm-ui-root table{width:100%;border-collapse:collapse;background:var(--tm-surface)}",
      ".tm-ui-root .tm-ui-table th,.tm-ui-root .tm-ui-table td,.tm-ui-root table th,.tm-ui-root table td{border-bottom:1px solid var(--tm-border);padding:9px 10px;font-size:13px;vertical-align:middle;text-align:center}",
      ".tm-ui-root .tm-ui-table th,.tm-ui-root table th{background:#f0f2f4;color:#4f5758;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase}",
      ".tm-ui-root .tm-ui-scroll .tm-ui-table thead th,.tm-ui-root .tm-ui-scroll table thead th{position:sticky;top:0;z-index:3;background:rgba(240,242,244,.98)!important;box-shadow:inset 0 -1px 0 var(--tm-border);background-clip:padding-box}",
      ".tm-ui-root .tm-ui-table tbody tr:hover td,.tm-ui-root table tbody tr:hover td{background:rgba(17,25,32,.025)}",
      ".tm-ui-root .tm-ui-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;border:1px solid var(--tm-border);background:var(--tm-surface-alt);color:var(--tm-text);font-size:11px;font-weight:700}",
      ".tm-ui-root .tm-ui-badge--success,.tm-ui-root .tm-ui-badge--info{background:rgba(45,95,212,.1);color:var(--tm-primary-strong);border-color:rgba(45,95,212,.18)}",
      ".tm-ui-root .tm-ui-badge--warning,.tm-ui-root .tm-ui-badge--danger{background:rgba(201,81,81,.1);color:var(--tm-danger);border-color:rgba(201,81,81,.18)}",
      ".tm-ui-root .tm-ui-message{padding:12px 14px;border:1px solid var(--tm-border);border-radius:var(--tm-radius-sm);background:var(--tm-surface-alt);color:var(--tm-text);font-size:13px}",
      ".tm-ui-root .tm-ui-message--success{background:rgba(36,90,212,.08);border-color:rgba(36,90,212,.18);color:var(--tm-primary-strong)}",
      ".tm-ui-root .tm-ui-message--danger,.tm-ui-root .tm-ui-message--error,.tm-ui-root .tm-ui-message--warning{background:rgba(194,77,77,.08);border-color:rgba(194,77,77,.16);color:var(--tm-danger)}",
      ".tm-ui-root .tm-ui-empty{padding:18px 12px;text-align:center;color:var(--tm-muted);font-size:13px}",
      ".tm-ui-root .tm-ui-log{background:#17191b;color:#f5f7fa;border-radius:var(--tm-radius);padding:12px 14px;border:1px solid rgba(255,255,255,.06);font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.5}",
      ".tm-ui-root .tm-ui-log a{color:#d9e6ec}",
      ".tm-ui-root .tm-ui-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(45,52,53,.26);backdrop-filter:blur(6px)}",
      ".tm-ui-root .tm-ui-modal{width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;background:var(--tm-surface);border:1px solid var(--tm-border);border-radius:18px;box-shadow:var(--tm-shadow)}",
      ".tm-ui-root .tm-ui-modal__head,.tm-ui-root .tm-ui-modal__foot{display:flex;align-items:center;justify-content:space-between;gap:var(--tm-space-2);padding:14px 16px;background:var(--tm-surface);border-bottom:1px solid var(--tm-border)}",
      ".tm-ui-root .tm-ui-modal__foot{border-bottom:none;border-top:1px solid var(--tm-border);justify-content:flex-end}",
      ".tm-ui-root .tm-ui-modal__body{padding:16px;overflow:auto;background:var(--tm-surface)}",
      ".tm-ui-root [data-tm-align='left']{text-align:left}",
      ".tm-ui-root [data-tm-align='right']{text-align:right}",
      ".tm-ui-root [data-tm-tone='primary'],.tm-ui-root [data-tm-tone='positive'],.tm-ui-root .tm-ui-value--positive{color:var(--tm-primary-strong);font-weight:700}",
      ".tm-ui-root [data-tm-tone='danger'],.tm-ui-root [data-tm-tone='negative'],.tm-ui-root .tm-ui-value--negative{color:var(--tm-danger);font-weight:700}",
      ".tm-ui-root .tm-ui-table td.left,.tm-ui-root .tm-ui-table th.left,.tm-ui-root table td.left,.tm-ui-root table th.left{text-align:left}",
      ".tm-ui-root [data-tm-hidden='true']{display:none !important}",
      ".tm-ui-root .tm-ui-animate-in{animation:tm-ui-fade-in .28s ease both}",
      ".tm-ui-root .tm-ui-reveal{animation:tm-ui-rise .24s ease both}",
      ".tm-ui-dock{--tm-dock-surface:" + TOKENS.surface + ";--tm-dock-surface-alt:" + TOKENS.surfaceAlt + ";--tm-dock-primary:" + TOKENS.primary + ";--tm-dock-primary-strong:" + TOKENS.primaryStrong + ";--tm-dock-text:" + TOKENS.text + ";--tm-dock-muted:" + TOKENS.muted + ";--tm-dock-border:" + TOKENS.border + ";--tm-dock-shadow:" + TOKENS.shadow + ";position:fixed;inset:12px 12px auto auto;z-index:9999;display:grid;justify-items:end;gap:10px;pointer-events:none}",
      ".tm-ui-dock>*{pointer-events:auto}",
      ".tm-ui-dock.is-open{z-index:10000}",
      ".tm-ui-dock__toggle{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 14px;border:1px solid var(--tm-dock-border);border-radius:14px;background:rgba(255,255,255,.985);color:var(--tm-dock-text);box-shadow:0 14px 28px rgba(15,23,32,.12);transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease;text-decoration:none;white-space:nowrap}",
      ".tm-ui-dock__toggle:hover{background:var(--tm-dock-surface-alt);transform:translateY(-1px)}",
      ".tm-ui-dock__toggle.is-open{background:var(--tm-dock-surface);border-color:#c7d1dc;box-shadow:0 18px 34px rgba(15,23,32,.16)}",
      ".tm-ui-dock__toggle-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--tm-dock-primary-strong);flex:0 0 auto}",
      ".tm-ui-dock__toggle-label{display:inline-flex;align-items:center;font:600 13px/1 " + FONT_STACK + ";letter-spacing:-.01em}",
      ".tm-ui-dock__toggle.is-open .tm-ui-dock__toggle-dot{background:var(--tm-dock-primary)}",
      ".tm-ui-dock__panel{position:relative;display:none;max-height:calc(90vh - 46px);overflow:auto;resize:both;border:1px solid var(--tm-dock-border);border-radius:20px;background:rgba(255,255,255,.995);box-shadow:0 28px 56px rgba(15,23,32,.18),0 8px 20px rgba(15,23,32,.08);backdrop-filter:none}",
      ".tm-ui-dock__panel.is-open,.tm-ui-dock.is-open .tm-ui-dock__panel{display:block}",
      ".tm-ui-dock__panel.tm-ui-root.tm-ui-panel{background:rgba(255,255,255,.99)!important}",
      ".tm-ui-dock__panel > .tm-ui-card{border:none;box-shadow:none;background:transparent}",
      "@keyframes tm-ui-fade-in{from{opacity:0}to{opacity:1}}",
      "@keyframes tm-ui-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      ".tm-ui-root[data-tm-density='compact']{--tm-control-height:32px;--tm-radius:8px;--tm-radius-sm:8px;font-size:12px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-panel-head{padding:12px 14px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-subtitle{font-size:12px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-table th,.tm-ui-root[data-tm-density='compact'] .tm-ui-table td,.tm-ui-root[data-tm-density='compact'] table th,.tm-ui-root[data-tm-density='compact'] table td{padding:7px 8px;font-size:12px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-table th,.tm-ui-root[data-tm-density='compact'] table th{font-size:10px}",
      ".tm-ui-root[data-tm-density='compact'] .tm-ui-btn,.tm-ui-root[data-tm-density='compact'] button{padding:0 10px;font-size:12px}",
      ".tm-ui-root[data-tm-density='normal'] .tm-ui-btn,.tm-ui-root[data-tm-density='normal'] button{font-size:13px}",
      "@media (max-width:768px){.tm-ui-root .tm-ui-panel-head{padding:16px}.tm-ui-root .tm-ui-toolbar{padding:12px}.tm-ui-root .tm-ui-kpi__value{font-size:18px}.tm-ui-root .tm-ui-section-head{align-items:flex-start}.tm-ui-dock{inset:8px 8px auto auto}}",
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
    FONT_IMPORT_URL,
    TOKENS,
    STYLE_ID,
    buildModuleUiCss,
    buildRootAttributes,
    buildRootClassName,
    ensureStyles,
  };
});
