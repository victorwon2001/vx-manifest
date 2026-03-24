(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.__tmNavMenu = api;
  }
  if (typeof globalThis !== "undefined" && globalThis && typeof globalThis === "object") {
    globalThis.__tmNavMenu = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DEFAULT_SELECTOR = ".nav.navbar-nav.navbar-right";
  const DEFAULT_RETRY_LIMIT = 30;
  const DEFAULT_RETRY_DELAY_MS = 500;
  const STATE_KEY = "__tmNavMenuState";

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function getState(win) {
    const scope = win || root;
    if (!scope[STATE_KEY]) {
      scope[STATE_KEY] = {
        installs: {},
      };
    }
    return scope[STATE_KEY];
  }

  function findTargetItem(items, label) {
    const target = safeTrim(label);
    if (!target) return null;
    return Array.prototype.find.call(items || [], (item) => safeTrim(item && item.textContent).indexOf(target) !== -1) || null;
  }

  function removeMatchingItems(navMenu, label, buttonLabel) {
    if (!navMenu || !label) return;
    Array.prototype.forEach.call(navMenu.querySelectorAll("li"), (item) => {
      const text = safeTrim(item.textContent);
      if (!text) return;
      if (buttonLabel && text.indexOf(buttonLabel) !== -1) return;
      if (text.indexOf(label) !== -1) item.remove();
    });
  }

  function removeMatchingMenuItems(navMenu, labels, buttonLabel) {
    (Array.isArray(labels) ? labels : []).forEach((label) => removeMatchingItems(navMenu, label, buttonLabel));
  }

  function findNavMenu(doc, selector) {
    if (!doc || typeof doc.querySelector !== "function") return null;
    return doc.querySelector(selector || DEFAULT_SELECTOR);
  }

  function createButtonElement(doc, options) {
    const item = doc.createElement("li");
    const anchor = doc.createElement("a");
    anchor.href = "javascript:void(0);";
    anchor.id = options.buttonId;
    anchor.innerHTML = options.html || ("<strong>" + safeTrim(options.label) + "</strong>");
    item.appendChild(anchor);
    return { item, anchor };
  }

  function insertButton(navMenu, item, options) {
    const items = navMenu.querySelectorAll("li");
    const beforeItem = findTargetItem(items, options.insertBeforeLabel);
    if (beforeItem) {
      navMenu.insertBefore(item, beforeItem);
      return;
    }
    const afterItem = findTargetItem(items, options.insertAfterLabel);
    if (afterItem && afterItem.parentNode === navMenu) {
      afterItem.insertAdjacentElement("afterend", item);
      return;
    }
    navMenu.appendChild(item);
  }

  function ensureNavButton(win, options) {
    const doc = win && win.document;
    if (!doc) return false;
    const navMenu = findNavMenu(doc, options.navSelector);
    if (!navMenu) return false;
    if (doc.getElementById(options.buttonId)) return true;
    removeMatchingMenuItems(navMenu, options.removeLabels, options.label);
    const created = createButtonElement(doc, options);
    insertButton(navMenu, created.item, options);
    created.anchor.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof options.onClick === "function") options.onClick(event);
    });
    return true;
  }

  function installNavButton(win, rawOptions) {
    const scope = win || root;
    const doc = scope && scope.document;
    if (!doc) return null;
    const options = Object.assign({
      navSelector: DEFAULT_SELECTOR,
      retryLimit: DEFAULT_RETRY_LIMIT,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      removeLabels: [],
      insertBeforeLabel: "",
      insertAfterLabel: "",
      html: "",
    }, rawOptions || {});
    if (!options.buttonId || typeof options.onClick !== "function") return null;

    const state = getState(scope);
    const existing = state.installs[options.buttonId];
    if (existing) {
      if (typeof existing.ensure === "function") existing.ensure();
      return existing;
    }

    let attempts = 0;
    let observer = null;
    let pending = false;

    const scheduleEnsure = function scheduleEnsure(delayMs) {
      if (pending) return;
      pending = true;
      scope.setTimeout(() => {
        pending = false;
        ensure();
      }, Math.max(0, Number(delayMs) || 0));
    };

    const ensure = function ensureInstalled() {
      if (ensureNavButton(scope, options)) {
        attempts = 0;
        return true;
      }
      attempts += 1;
      if (attempts < options.retryLimit) scheduleEnsure(options.retryDelayMs);
      return false;
    };

    if (typeof scope.MutationObserver === "function" && doc.body) {
      observer = new scope.MutationObserver(() => {
        if (doc.getElementById(options.buttonId)) return;
        scheduleEnsure(Math.max(options.retryDelayMs, 1500));
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }

    const api = {
      ensure,
      destroy() {
        if (observer) observer.disconnect();
        const button = doc.getElementById(options.buttonId);
        const item = button && button.closest ? button.closest("li") : null;
        if (item && item.parentNode) item.parentNode.removeChild(item);
        delete state.installs[options.buttonId];
      },
    };

    state.installs[options.buttonId] = api;
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => scheduleEnsure(0), { once: true });
    else scheduleEnsure(0);
    return api;
  }

  return {
    DEFAULT_SELECTOR,
    DEFAULT_RETRY_LIMIT,
    DEFAULT_RETRY_DELAY_MS,
    safeTrim,
    findTargetItem,
    removeMatchingMenuItems,
    ensureNavButton,
    installNavButton,
  };
});
