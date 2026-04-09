module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "oms-otp-receiver";
  const MODULE_NAME = "OMS 인증번호 수신기";
  const MODULE_VERSION = "0.1.0";
  const MATCHES = ["https://oms.bstage.systems/stan/login.do*"];
  const TOPIC = "otp-secret-victor-2026-factory";
  const WS_URL = "wss://ntfy.sh/" + TOPIC + "/ws";
  const ROOT_ID = "tm-oms-otp-receiver-root";
  const STYLE_ID = "tm-oms-otp-receiver-style";
  const STATE_KEY = "__tmOmsOtpReceiverState";
  const MAX_CARDS = 4;
  const CARD_TTL_MS = 60000;
  const RECONNECT_DELAY_MS = 3000;

  function shouldRun(win) {
    return /^https:\/\/oms\.bstage\.systems\/stan\/login\.do/i.test(String(win && win.location && win.location.href || ""));
  }

  function extractOtpCode(message) {
    const match = String(message || "").match(/\b\d{6}\b/);
    return match ? match[0] : "";
  }

  function getClipboardSetter(scope) {
    if (scope && typeof scope.GM_setClipboard === "function") return scope.GM_setClipboard.bind(scope);
    if (typeof GM_setClipboard === "function") return GM_setClipboard;
    return null;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + ROOT_ID + "{position:fixed;top:15px;left:15px;width:320px;display:flex;flex-direction:column;gap:10px;z-index:2147483646;pointer-events:none;font-family:'Pretendard','Segoe UI','Malgun Gothic',sans-serif}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__badge{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:8px 15px;border-radius:999px;background:rgba(0,0,0,.74);color:#fff;font-size:12px;backdrop-filter:blur(6px);box-shadow:0 8px 20px rgba(0,0,0,.18);pointer-events:auto;border:1px solid rgba(255,255,255,.12)}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__card{background:linear-gradient(135deg,#ff416c,#ff4b2b);color:#fff;padding:18px 20px;border-radius:14px;box-shadow:0 14px 28px rgba(0,0,0,.26);pointer-events:auto;border:2px solid rgba(255,255,255,.95);cursor:pointer;transition:opacity .28s ease,transform .28s ease,filter .28s ease;animation:tm-oms-otp-slide-in .36s cubic-bezier(.175,.885,.32,1.275)}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__card.is-old{opacity:.52;transform:scale(.96);filter:grayscale(100%)}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:6px}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__code{font-size:32px;font-weight:800;letter-spacing:.04em}",
      "#" + ROOT_ID + " .tm-oms-otp-receiver__hint{margin-top:6px;font-size:11px;opacity:.86}",
      "@keyframes tm-oms-otp-slide-in{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}",
    ].join("");
    doc.head.appendChild(style);
  }

  function getState(win) {
    if (!win[STATE_KEY]) {
      win[STATE_KEY] = {
        started: false,
        socket: null,
        reconnectTimer: 0,
        root: null,
      };
    }
    return win[STATE_KEY];
  }

  function updateStatus(win, status) {
    const root = getState(win).root;
    if (!root) return;
    const dot = root.querySelector("[data-role='status-dot']");
    const text = root.querySelector("[data-role='status-text']");
    const badge = root.querySelector("[data-role='status-badge']");
    if (!dot || !text || !badge) return;
    if (status === "connected") {
      dot.textContent = "🟢";
      text.textContent = "실시간 수신 대기 중...";
      badge.style.borderColor = "#4CD964";
      return;
    }
    dot.textContent = "🔴";
    text.textContent = "연결 끊김 (재접속 중)";
    badge.style.borderColor = "#FF3B30";
  }

  async function copyCode(win, code, card) {
    const clipboard = getClipboardSetter(win);
    if (clipboard) {
      clipboard(code);
    } else if (win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === "function") {
      await win.navigator.clipboard.writeText(code);
    }
    card.style.background = "#28A745";
    card.innerHTML = '<div style="font-size:18px;line-height:60px;font-weight:700;text-align:center;">✅ 복사 완료!</div>';
    win.setTimeout(() => {
      card.style.opacity = "0";
      card.style.transform = "translateY(-20px)";
      win.setTimeout(() => card.remove(), 300);
    }, 1000);
  }

  function addNewOtpCard(win, code) {
    const state = getState(win);
    if (!state.root) return;
    const cards = state.root.querySelectorAll(".tm-oms-otp-receiver__card");
    cards.forEach((card) => card.classList.add("is-old"));

    const card = win.document.createElement("div");
    card.className = "tm-oms-otp-receiver__card";
    card.innerHTML = [
      '<div class="tm-oms-otp-receiver__meta">',
      "  <span>🚀 실시간 인증번호</span>",
      "  <span>" + new Date().toLocaleTimeString("ko-KR", { hour12: false }) + "</span>",
      "</div>",
      '<div class="tm-oms-otp-receiver__code">' + code + "</div>",
      '<div class="tm-oms-otp-receiver__hint">클릭하여 자동 복사</div>',
    ].join("");
    card.addEventListener("click", () => {
      void copyCode(win, code, card);
    });

    if (state.root.children.length > 1) {
      state.root.insertBefore(card, state.root.children[1]);
    } else {
      state.root.appendChild(card);
    }

    while (state.root.children.length > MAX_CARDS + 1) {
      state.root.lastElementChild.remove();
    }

    win.setTimeout(() => {
      if (card.parentNode) card.remove();
    }, CARD_TTL_MS);
  }

  function connect(win) {
    const state = getState(win);
    if (state.socket) {
      try {
        state.socket.close();
      } catch (error) {
        // Ignore close errors.
      }
    }
    state.socket = new win.WebSocket(WS_URL);
    state.socket.onopen = function () {
      updateStatus(win, "connected");
    };
    state.socket.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        if (data && data.event === "message") {
          const code = extractOtpCode(data.message);
          if (code) addNewOtpCard(win, code);
        }
      } catch (error) {
        // Ignore malformed messages.
      }
    };
    state.socket.onclose = function () {
      updateStatus(win, "disconnected");
      if (state.reconnectTimer) win.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = win.setTimeout(() => connect(win), RECONNECT_DELAY_MS);
    };
  }

  function buildRoot(win) {
    const state = getState(win);
    if (state.root) return state.root;
    ensureStyles(win.document);
    const root = win.document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = [
      '<div class="tm-oms-otp-receiver__badge" data-role="status-badge">',
      '  <span data-role="status-dot">🟡</span>',
      '  <span data-role="status-text">실시간 연결 시도 중...</span>',
      "</div>",
    ].join("");
    win.document.body.appendChild(root);
    state.root = root;
    return root;
  }

  function start(context) {
    const win = context && context.window ? context.window : root;
    if (!win || !win.document || !shouldRun(win)) return;
    const state = getState(win);
    if (state.started) return;
    state.started = true;
    const init = () => {
      buildRoot(win);
      connect(win);
    };
    if (win.document.body) {
      init();
      return;
    }
    win.addEventListener("DOMContentLoaded", init, { once: true });
  }

  function run(context) {
    start(context);
  }

  return {
    WS_URL,
    extractOtpCode,
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    shouldRun,
    run,
    start,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
