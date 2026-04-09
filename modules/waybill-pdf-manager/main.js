module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "waybill-pdf-manager";
  const MODULE_NAME = "송장 PDF 매니저";
  const MODULE_VERSION = "0.1.1";
  const MATCHES = ["https://oms.bstage.systems/stan/main.do*"];
  const PDF_URL_BASE = "https://oms.bstage.systems/stan/order/orderWaybillPdfPrint.do";
  const STYLE_ID = "tm-waybill-pdf-manager-style";
  const ROOT_ID = "tm-waybill-pdf-manager-root";
  const STATE_KEY = "tmWaybillPdfManagerStateV1";
  const RUNTIME_KEY = "__tmWaybillPdfManagerRuntime";
  const MINIMIZED_SIZE = 54;
  const DEFAULT_WIDTH = 340;
  const DEFAULT_HEIGHT = 480;
  const DEFAULT_DELAY_MS = 200;

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\r/g, "").trim();
  }

  function shouldRun(win) {
    return /^https:\/\/oms\.bstage\.systems\/stan\/main\.do/i.test(String(win && win.location && win.location.href || ""));
  }

  function parseWaybillCodes(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => safeTrim(line))
      .filter(Boolean);
  }

  function buildWaybillFetchUrl(code) {
    return PDF_URL_BASE + "?scanText=" + encodeURIComponent(safeTrim(code));
  }

  function getPdfLib(scope) {
    if (scope && scope.PDFLib) return scope.PDFLib;
    if (typeof globalThis !== "undefined" && globalThis && globalThis.PDFLib) return globalThis.PDFLib;
    return null;
  }

  function getClipboardSetter(scope) {
    if (scope && typeof scope.GM_setClipboard === "function") return scope.GM_setClipboard.bind(scope);
    if (typeof GM_setClipboard === "function") return GM_setClipboard;
    return null;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function clampPosition(value, minValue, maxValue) {
    return Math.min(Math.max(Number(value) || 0, minValue), maxValue);
  }

  function mergeUiState(savedState, viewport) {
    const width = Math.max(320, Number(savedState && savedState.width) || DEFAULT_WIDTH);
    const height = Math.max(220, Number(savedState && savedState.height) || DEFAULT_HEIGHT);
    const viewportWidth = Math.max(Number(viewport && viewport.width) || 0, width + 24);
    const viewportHeight = Math.max(Number(viewport && viewport.height) || 0, height + 24);
    return {
      x: clampPosition(savedState && savedState.x, 8, Math.max(8, viewportWidth - MINIMIZED_SIZE - 8)),
      y: clampPosition(savedState && savedState.y, 8, Math.max(8, viewportHeight - MINIMIZED_SIZE - 8)),
      width,
      height,
      isOpen: Boolean(savedState && savedState.isOpen),
      fallbackX: viewportWidth - MINIMIZED_SIZE - 24,
      fallbackY: viewportHeight - MINIMIZED_SIZE - 24,
    };
  }

  function buildDownloadName(nowValue) {
    const date = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return "waybills_" + hh + mm + ss + ".pdf";
  }

  function buildUiHtml() {
    return [
      '<div class="tm-waybill-pdf-manager__header" data-role="header">',
      '  <span class="tm-waybill-pdf-manager__title">송장 PDF 매니저</span>',
      '  <button type="button" class="tm-waybill-pdf-manager__icon-btn" data-action="minimize" aria-label="최소화">_</button>',
      "</div>",
      '<div class="tm-waybill-pdf-manager__body">',
      '  <textarea class="tm-waybill-pdf-manager__input" data-role="input" placeholder="송장 번호 입력 (줄바꿈)"></textarea>',
      '  <div class="tm-waybill-pdf-manager__progress" data-role="progress" data-hidden="true">',
      '    <div class="tm-waybill-pdf-manager__bar-bg"><div class="tm-waybill-pdf-manager__bar-fill" data-role="progress-bar"></div></div>',
      '    <div class="tm-waybill-pdf-manager__status" data-role="status">대기 중</div>',
      "  </div>",
      '  <div class="tm-waybill-pdf-manager__error-box" data-role="error-box" data-hidden="true">',
      '    <textarea class="tm-waybill-pdf-manager__error-text" data-role="error-text" readonly></textarea>',
      '    <button type="button" class="tm-waybill-pdf-manager__button tm-waybill-pdf-manager__button--danger" data-action="copy-errors">오류 번호 복사</button>',
      "  </div>",
      '  <div class="tm-waybill-pdf-manager__controls">',
      '    <button type="button" class="tm-waybill-pdf-manager__button tm-waybill-pdf-manager__button--primary" data-action="start">변환 및 병합 시작</button>',
      "  </div>",
      "</div>",
    ].join("");
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + ROOT_ID + "{font-family:'Pretendard','Segoe UI','Malgun Gothic',sans-serif;position:fixed;z-index:2147483647;box-shadow:0 18px 36px rgba(15,23,32,.22);background:#fff;border:1px solid rgba(18,23,28,.08);overflow:hidden}",
      "#" + ROOT_ID + "[data-mode='minimized']{width:" + MINIMIZED_SIZE + "px !important;height:" + MINIMIZED_SIZE + "px !important;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;cursor:pointer}",
      "#" + ROOT_ID + "[data-mode='minimized'] .tm-waybill-pdf-manager__body,#" + ROOT_ID + "[data-mode='minimized'] .tm-waybill-pdf-manager__header{display:none}",
      "#" + ROOT_ID + "[data-mode='minimized']::after{content:'🖨️';font-size:24px}",
      "#" + ROOT_ID + "[data-mode='expanded']{display:flex;flex-direction:column;min-width:320px;min-height:220px;border-radius:16px;resize:both;overflow:auto}",
      ".tm-waybill-pdf-manager__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:#111;color:#fff;cursor:move;user-select:none}",
      ".tm-waybill-pdf-manager__title{font-size:14px;font-weight:700;letter-spacing:-.02em}",
      ".tm-waybill-pdf-manager__icon-btn{border:none;background:transparent;color:#fff;font:inherit;font-size:18px;cursor:pointer;padding:0 6px}",
      ".tm-waybill-pdf-manager__icon-btn:hover{color:#ff7b7b}",
      ".tm-waybill-pdf-manager__body{display:flex;flex-direction:column;gap:10px;padding:14px;background:#f6f7f8;height:100%}",
      ".tm-waybill-pdf-manager__input,.tm-waybill-pdf-manager__error-text{width:100%;box-sizing:border-box;border:1px solid #d6dade;border-radius:10px;background:#fff;padding:10px 12px;font:13px/1.55 'Pretendard','Segoe UI','Malgun Gothic',sans-serif;resize:none}",
      ".tm-waybill-pdf-manager__input{flex:1 1 auto;min-height:140px}",
      ".tm-waybill-pdf-manager__progress[data-hidden='true'],.tm-waybill-pdf-manager__error-box[data-hidden='true']{display:none}",
      ".tm-waybill-pdf-manager__progress,.tm-waybill-pdf-manager__error-box{display:grid;gap:8px;padding:10px;border:1px solid #e1e5e9;border-radius:12px;background:#fff}",
      ".tm-waybill-pdf-manager__bar-bg{height:8px;border-radius:999px;background:#e9edf0;overflow:hidden}",
      ".tm-waybill-pdf-manager__bar-fill{height:100%;width:0;background:linear-gradient(90deg,#245ad4,#4b7ff0);transition:width .18s ease}",
      ".tm-waybill-pdf-manager__status{text-align:center;font-size:12px;color:#56606a}",
      ".tm-waybill-pdf-manager__controls{display:flex;gap:8px}",
      ".tm-waybill-pdf-manager__button{width:100%;min-height:40px;border:none;border-radius:10px;font:700 13px/1 'Pretendard','Segoe UI','Malgun Gothic',sans-serif;cursor:pointer}",
      ".tm-waybill-pdf-manager__button--primary{background:#245ad4;color:#fff}",
      ".tm-waybill-pdf-manager__button--primary:hover{background:#1f4db4}",
      ".tm-waybill-pdf-manager__button--danger{background:#d94242;color:#fff;font-size:12px}",
    ].join("");
    doc.head.appendChild(style);
  }

  function loadUiState(win) {
    let saved = {};
    try {
      saved = JSON.parse(String(win.localStorage.getItem(STATE_KEY) || "{}"));
    } catch (error) {
      saved = {};
    }
    return mergeUiState(saved, {
      width: Number(win.innerWidth) || 1280,
      height: Number(win.innerHeight) || 720,
    });
  }

  function saveUiState(state) {
    const win = state && state.win;
    if (!win || !win.localStorage) return;
    win.localStorage.setItem(STATE_KEY, JSON.stringify({
      x: state.ui.x,
      y: state.ui.y,
      width: state.ui.width,
      height: state.ui.height,
      isOpen: state.ui.isOpen,
    }));
  }

  function getRuntimeState(win) {
    if (!win[RUNTIME_KEY]) {
      win[RUNTIME_KEY] = {
        started: false,
        win,
        root: null,
        ui: loadUiState(win),
      };
    }
    return win[RUNTIME_KEY];
  }

  function applyUiState(state) {
    const rootEl = state.root;
    if (!rootEl) return;
    rootEl.setAttribute("data-mode", state.ui.isOpen ? "expanded" : "minimized");
    rootEl.style.left = (state.ui.isOpen ? state.ui.x : state.ui.fallbackX) + "px";
    rootEl.style.top = (state.ui.isOpen ? state.ui.y : state.ui.fallbackY) + "px";
    rootEl.style.width = state.ui.isOpen ? state.ui.width + "px" : "";
    rootEl.style.height = state.ui.isOpen ? state.ui.height + "px" : "";
  }

  function updateProgress(state, current, total, success) {
    const progress = state.root.querySelector("[data-role='progress']");
    const bar = state.root.querySelector("[data-role='progress-bar']");
    const status = state.root.querySelector("[data-role='status']");
    progress.setAttribute("data-hidden", "false");
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    bar.style.width = percent + "%";
    status.textContent = current < total
      ? current + "/" + total + " 처리 중... (성공: " + success + ")"
      : (success > 0 ? "PDF 생성 중..." : "완료");
  }

  function showErrors(state, failedCodes) {
    const errorBox = state.root.querySelector("[data-role='error-box']");
    const errorText = state.root.querySelector("[data-role='error-text']");
    if (!failedCodes.length) {
      errorBox.setAttribute("data-hidden", "true");
      errorText.value = "";
      return;
    }
    errorBox.setAttribute("data-hidden", "false");
    errorText.value = failedCodes.join("\n");
  }

  async function copyErrors(state) {
    const errorText = state.root.querySelector("[data-role='error-text']");
    const value = String(errorText && errorText.value || "");
    if (!value) return;
    const clipboard = getClipboardSetter(state.win);
    if (clipboard) {
      clipboard(value);
      return;
    }
    if (state.win.navigator && state.win.navigator.clipboard && typeof state.win.navigator.clipboard.writeText === "function") {
      await state.win.navigator.clipboard.writeText(value);
      return;
    }
    errorText.focus();
    errorText.select();
    state.win.document.execCommand("copy");
  }

  function downloadPdf(win, bytes, fileName) {
    const blob = new win.Blob([bytes], { type: "application/pdf" });
    const url = win.URL.createObjectURL(blob);
    const anchor = win.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    win.document.body.appendChild(anchor);
    anchor.click();
    win.document.body.removeChild(anchor);
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  async function runMerge(state) {
    const PDFLib = getPdfLib(state.win);
    if (!PDFLib || !PDFLib.PDFDocument) throw new Error("PDF 라이브러리를 불러오지 못했습니다.");
    const input = state.root.querySelector("[data-role='input']");
    const button = state.root.querySelector("[data-action='start']");
    const progress = state.root.querySelector("[data-role='progress']");
    const status = state.root.querySelector("[data-role='status']");
    const codes = parseWaybillCodes(input.value);
    if (!codes.length) throw new Error("송장 번호를 입력하세요.");

    button.disabled = true;
    input.disabled = true;
    progress.setAttribute("data-hidden", "false");
    showErrors(state, []);

    const merged = await PDFLib.PDFDocument.create();
    const failed = [];
    let success = 0;

    try {
      for (let index = 0; index < codes.length; index += 1) {
        const code = codes[index];
        updateProgress(state, index + 1, codes.length, success);
        try {
          const response = await state.win.fetch(buildWaybillFetchUrl(code), { credentials: "include" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          const bytes = await response.arrayBuffer();
          const sourcePdf = await PDFLib.PDFDocument.load(bytes);
          const pages = await merged.copyPages(sourcePdf, sourcePdf.getPageIndices());
          pages.forEach((page) => merged.addPage(page));
          success += 1;
        } catch (error) {
          failed.push(code);
        }
        await delay(DEFAULT_DELAY_MS);
      }

      if (success > 0) {
        status.textContent = "페이지 번호 생성 중...";
        const font = await merged.embedFont(PDFLib.StandardFonts.Helvetica);
        const pages = merged.getPages();
        pages.forEach((page, pageIndex) => {
          const width = page.getWidth();
          const text = (pageIndex + 1) + " / " + pages.length;
          const textWidth = font.widthOfTextAtSize(text, 10);
          page.drawText(text, { x: width - textWidth - 20, y: 10, size: 10, font, color: PDFLib.rgb(0, 0, 0) });
        });
        const resultBytes = await merged.save();
        downloadPdf(state.win, resultBytes, buildDownloadName(new Date()));
      }

      status.innerHTML = failed.length
        ? '<span style="color:#d94242">완료 · 실패 ' + failed.length + '건</span>'
        : '<span style="color:#245ad4">완료 · 모두 성공</span>';
      showErrors(state, failed);
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  }

  function setupDragging(state) {
    const header = state.root.querySelector("[data-role='header']");
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener("mousedown", (event) => {
      if (!state.ui.isOpen) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      initialLeft = state.root.offsetLeft;
      initialTop = state.root.offsetTop;
      event.preventDefault();
    });

    state.win.document.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      state.root.style.left = initialLeft + (event.clientX - startX) + "px";
      state.root.style.top = initialTop + (event.clientY - startY) + "px";
    });

    state.win.document.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        state.ui.x = state.root.offsetLeft;
        state.ui.y = state.root.offsetTop;
      }
      if (state.ui.isOpen) {
        state.ui.width = state.root.offsetWidth;
        state.ui.height = state.root.offsetHeight;
      }
      saveUiState(state);
    });
  }

  function bindEvents(state) {
    state.root.addEventListener("click", async (event) => {
      const actionNode = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
      if (state.root.getAttribute("data-mode") === "minimized" && !actionNode) {
        state.ui.isOpen = true;
        applyUiState(state);
        saveUiState(state);
        return;
      }
      if (!actionNode) return;
      const action = actionNode.getAttribute("data-action");
      if (action === "minimize") {
        event.stopPropagation();
        state.ui.width = state.root.offsetWidth;
        state.ui.height = state.root.offsetHeight;
        state.ui.x = state.root.offsetLeft;
        state.ui.y = state.root.offsetTop;
        state.ui.isOpen = false;
        applyUiState(state);
        saveUiState(state);
        return;
      }
      if (action === "copy-errors") {
        event.stopPropagation();
        await copyErrors(state);
        return;
      }
      if (action === "start") {
        event.stopPropagation();
        try {
          await runMerge(state);
        } catch (error) {
          state.win.alert(error && error.message ? error.message : "처리 중 오류가 발생했습니다.");
        }
      }
    });
  }

  function createUi(win) {
    const state = getRuntimeState(win);
    if (state.root) return state;
    ensureStyles(win.document);
    const rootEl = win.document.createElement("div");
    rootEl.id = ROOT_ID;
    rootEl.innerHTML = buildUiHtml();
    state.root = rootEl;
    win.document.body.appendChild(rootEl);
    applyUiState(state);
    setupDragging(state);
    bindEvents(state);
    return state;
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;
    const state = getRuntimeState(win);
    if (state.started) return;
    state.started = true;
    const init = () => createUi(win);
    if (win.document.body) {
      win.setTimeout(init, 500);
      return;
    }
    win.addEventListener("DOMContentLoaded", () => win.setTimeout(init, 500), { once: true });
  }

  function run(context) {
    start(context);
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    buildDownloadName,
    buildWaybillFetchUrl,
    mergeUiState,
    parseWaybillCodes,
    shouldRun,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

