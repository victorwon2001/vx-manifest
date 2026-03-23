module.exports = (function () {
  "use strict";

  const MODULE_ID = "order-import-sync";
  const MODULE_NAME = "연동데이터 불러오기";
  const MODULE_VERSION = "0.1.0";
  const MATCHES = ["https://www.ebut3pl.co.kr/jsp/site/site230main.jsp*"];

  function safeTrim(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function stripTags(value) {
    return String(value == null ? "" : value).replace(/<[^>]+>/g, "");
  }

  function buildPreviewQueue(rowInfos) {
    return (Array.isArray(rowInfos) ? rowInfos : [])
      .filter((item) => Number(item && item.count) > 0 && !!(item && item.hasGetButton))
      .sort((left, right) => {
        if (Number(right.count) !== Number(left.count)) {
          return Number(right.count) - Number(left.count);
        }
        return safeTrim(left.name).localeCompare(safeTrim(right.name), "ko");
      })
      .map((item) => ({
        siteCode: String(item.siteCode || ""),
        name: safeTrim(item.name),
        count: Number(item.count) || 0,
        hasGetButton: !!item.hasGetButton,
      }));
  }

  function parseResultRowHtml(html) {
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let match;
    while ((match = cellPattern.exec(html))) {
      cells.push(safeTrim(stripTags(match[1])));
    }
    return cells;
  }

  function parseResultTableHtml(html) {
    const text = safeTrim(stripTags(html));
    const completionMatch = text.match(/(\d+)\s*건?\s*주문등록이\s*완료/);
    if (completionMatch) {
      const total = parseInt(completionMatch[1], 10) || 0;
      return {
        total,
        success: total,
        fail: 0,
        completed: true,
        details: [],
      };
    }

    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const details = [];
    let rowMatch;
    while ((rowMatch = rowPattern.exec(String(html || "")))) {
      const cells = parseResultRowHtml(rowMatch[1]);
      if (cells.length < 4) continue;
      if (cells[0].indexOf("수령자") !== -1 || cells[3] === "결과") continue;
      details.push({
        receiver: cells[0],
        product: cells[1],
        option: cells[2],
        result: cells[3],
      });
    }

    if (!details.length) return null;
    const success = details.filter((item) => /등록성공|성공|완료/.test(item.result)).length;
    return {
      total: details.length,
      success,
      fail: details.length - success,
      completed: true,
      details,
    };
  }

  function isResultTextCandidate(text) {
    const normalized = safeTrim(text);
    return normalized.indexOf("주문수집결과") !== -1 ||
      normalized.indexOf("주문등록이 완료") !== -1 ||
      normalized.indexOf("등록성공") !== -1 ||
      normalized.indexOf("등록실패") !== -1 ||
      (normalized.indexOf("수령자") !== -1 && normalized.indexOf("상품명") !== -1 && normalized.indexOf("결과") !== -1);
  }

  function hasOrderCountDecreased(originalCount, currentCount) {
    return Number(currentCount) < Number(originalCount);
  }

  function reduceImportState(state, action) {
    const current = state || {
      active: false,
      processing: false,
      index: 0,
      current: "",
      queue: [],
      results: {},
    };
    const next = {
      active: current.active,
      processing: current.processing,
      index: current.index,
      current: current.current,
      queue: Array.isArray(current.queue) ? current.queue.slice() : [],
      results: Object.assign({}, current.results || {}),
    };
    const payload = action || {};

    if (payload.type === "start") {
      next.active = true;
      next.processing = true;
      next.index = 0;
      next.current = "";
      next.queue = Array.isArray(payload.queue) ? payload.queue.slice() : [];
      next.results = {};
      return next;
    }
    if (payload.type === "complete-site" || payload.type === "timeout-site") {
      next.results[payload.siteCode] = payload.result;
      next.index += 1;
      next.current = "";
      return next;
    }
    if (payload.type === "stop") {
      next.active = false;
      next.processing = false;
      next.current = "";
      return next;
    }
    return next;
  }

  function summarizeImportResults(resultsMap, queue) {
    const resultEntries = resultsMap || {};
    const queueItems = Array.isArray(queue) ? queue : [];
    const nameMap = {};
    queueItems.forEach((item) => {
      nameMap[item.siteCode] = item.name || item.siteCode;
    });

    let anyFail = false;
    let totalSuccess = 0;
    let totalFail = 0;
    const lines = [];

    Object.keys(resultEntries).forEach((siteCode) => {
      const result = resultEntries[siteCode] || {};
      const total = Number(result.total) || 0;
      const success = Number(result.success) || 0;
      const fail = Number(result.fail) || 0;
      totalSuccess += success;
      totalFail += fail;
      if (fail <= 0) return;
      anyFail = true;
      lines.push("[" + (nameMap[siteCode] || siteCode) + "] 성공 " + success + "/" + total + ", 실패 " + fail);
      (Array.isArray(result.details) ? result.details : [])
        .filter((item) => !/등록성공|성공/.test(item.result || ""))
        .slice(0, 5)
        .forEach((item) => {
          lines.push("  - 수령자:" + safeTrim(item.receiver) + " | 상품:" + safeTrim(item.product) + " | 결과:" + safeTrim(item.result));
        });
    });

    return {
      anyFail,
      totalSuccess,
      totalFail,
      lines,
    };
  }

  function run(context) {
    return {
      id: MODULE_ID,
      active: true,
      context: context || null,
    };
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: MODULE_VERSION,
    matches: MATCHES,
    run,
    buildPreviewQueue,
    parseResultTableHtml,
    isResultTextCandidate,
    hasOrderCountDecreased,
    reduceImportState,
    summarizeImportResults,
  };
})();
