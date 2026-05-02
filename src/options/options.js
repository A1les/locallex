(function () {
  "use strict";

  const root = globalThis.__offlineEcDict;
  const normalize = root.normalize;
  const db = root.db;
  const lookup = root.lookup;

  const nodes = {
    extensionVersion: document.getElementById("extension-version"),
    dictionaryStatus: document.getElementById("dictionary-status"),
    dictionaryVersion: document.getElementById("dictionary-version"),
    dictionarySource: document.getElementById("dictionary-source"),
    importedAt: document.getElementById("imported-at"),
    entryCount: document.getElementById("entry-count"),
    formCount: document.getElementById("form-count"),
    exampleCount: document.getElementById("example-count"),
    file: document.getElementById("dictionary-file"),
    importButton: document.getElementById("import-button"),
    restoreButton: document.getElementById("restore-button"),
    clearButton: document.getElementById("clear-button"),
    shortcutButton: document.getElementById("shortcut-button"),
    operationStatus: document.getElementById("operation-status"),
    testInput: document.getElementById("test-input"),
    testButton: document.getElementById("test-button"),
    testResult: document.getElementById("test-result"),
    themeButtons: Array.from(document.querySelectorAll(".theme-option")),
    exampleEnabledCheckbox: document.getElementById("example-enabled-checkbox"),
    favoritesSummary: document.getElementById("favorites-summary"),
    favoritesList: document.getElementById("favorites-list"),
    exportFavoritesButton: document.getElementById("export-favorites-button"),
    statsSummary: document.getElementById("stats-summary"),
    recentList: document.getElementById("recent-list"),
    topList: document.getElementById("top-list"),
    exportStatsButton: document.getElementById("export-stats-button"),
    clearStatsButton: document.getElementById("clear-stats-button")
  };

  nodes.extensionVersion.textContent = chrome.runtime.getManifest().version;

  nodes.importButton.addEventListener("click", importSelectedDictionary);
  nodes.restoreButton.addEventListener("click", restorePackagedDictionary);
  nodes.clearButton.addEventListener("click", clearDictionary);
  nodes.shortcutButton.addEventListener("click", openShortcutSettings);
  nodes.testButton.addEventListener("click", runTestLookup);
  nodes.exportFavoritesButton.addEventListener("click", exportFavoritesCsv);
  nodes.exportStatsButton.addEventListener("click", exportStatsCsv);
  nodes.clearStatsButton.addEventListener("click", clearStats);
  nodes.exampleEnabledCheckbox.addEventListener("change", updateExampleEnabled);
  nodes.testInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      runTestLookup();
    }
  });

  init();

  async function init() {
    await initSettings();
    await refreshAll();
  }

  async function initSettings() {
    const settings = await db.getSettings();
    setTheme(settings.theme || "system");
    nodes.exampleEnabledCheckbox.checked = settings.exampleEnabled !== false;

    for (const button of nodes.themeButtons) {
      button.addEventListener("click", async function () {
        const theme = button.dataset.theme || "system";
        await db.setSetting("theme", theme);
        setTheme(theme);
      });
    }
  }

  async function updateExampleEnabled() {
    await db.setSetting("exampleEnabled", nodes.exampleEnabledCheckbox.checked);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    for (const button of nodes.themeButtons) {
      button.classList.toggle("active", button.dataset.theme === theme);
    }
  }

  async function refreshAll() {
    await refreshStatus();
    await refreshFavoritesAndStats();
  }

  async function refreshStatus() {
    try {
      setOperationStatus("读取词库状态...");
      const status = await db.ensureDictionaryImported();
      renderStatus(status);
      setOperationStatus("");
    } catch (error) {
      console.warn("[LocalLex] Failed to read dictionary status.", error);
      nodes.dictionaryStatus.textContent = "读取失败";
      setOperationStatus("读取失败：" + toErrorMessage(error), true);
    }
  }

  function renderStatus(status) {
    if (status && status.disabled) {
      nodes.dictionaryStatus.textContent = "词库未导入";
    } else {
      nodes.dictionaryStatus.textContent = status && status.imported ? "词库已导入" : "词库未导入";
    }

    nodes.dictionaryVersion.textContent = status && status.version ? status.version : "-";
    nodes.entryCount.textContent = formatNumber(status && status.entryCount);
    nodes.formCount.textContent = formatNumber(status && status.formCount);
    nodes.exampleCount.textContent = formatNumber(status && status.exampleCount);
    nodes.dictionarySource.textContent = formatSource(status);
    nodes.importedAt.textContent = formatDate(status && status.importedAt);
    nodes.favoritesSummary.textContent = "共 " + formatNumber(status && status.favoriteCount) + " 个收藏";
    nodes.statsSummary.textContent = "共 " + formatNumber(status && status.statsCount) + " 个查询记录";
  }

  async function refreshFavoritesAndStats() {
    const favorites = await db.getAllFavorites();
    const recent = await db.getRecentStats(8);
    const top = await db.getTopStats(8);

    renderFavorites(favorites);
    renderStatsList(nodes.recentList, recent, "lastLookupAt");
    renderStatsList(nodes.topList, top, "count");
    nodes.favoritesSummary.textContent = "共 " + formatNumber(favorites.length) + " 个收藏";
    nodes.statsSummary.textContent = "最近 " + formatNumber(recent.length) + " 条，排行 " + formatNumber(top.length) + " 条";
  }

  function renderFavorites(favorites) {
    nodes.favoritesList.textContent = "";

    if (!favorites.length) {
      appendEmpty(nodes.favoritesList, "暂无收藏。可在查词结果中点击右上角收藏图标加入生词本。");
      return;
    }

    for (const item of favorites.slice(0, 20)) {
      const row = document.createElement("div");
      row.className = "list-item";

      const body = document.createElement("div");
      const word = document.createElement("strong");
      word.textContent = item.word;
      body.appendChild(word);

      const meta = document.createElement("span");
      meta.textContent = "收藏于 " + formatDate(item.createdAt);
      body.appendChild(meta);
      row.appendChild(body);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "移除";
      remove.addEventListener("click", async function () {
        await db.toggleFavorite(item.word, null);
        await refreshFavoritesAndStats();
      });
      row.appendChild(remove);

      nodes.favoritesList.appendChild(row);
    }
  }

  function renderStatsList(container, items, mode) {
    container.textContent = "";

    if (!items.length) {
      appendEmpty(container, "暂无记录。");
      return;
    }

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "list-item";

      const body = document.createElement("div");
      const word = document.createElement("strong");
      word.textContent = item.word;
      body.appendChild(word);

      const meta = document.createElement("span");
      if (mode === "count") {
        meta.textContent = "查询 " + (item.count || 0) + " 次 · 最近 " + formatDate(item.lastLookupAt);
      } else {
        meta.textContent = formatDate(item.lastLookupAt) + " · 查询 " + (item.count || 0) + " 次";
      }
      body.appendChild(meta);
      row.appendChild(body);

      container.appendChild(row);
    }
  }

  async function importSelectedDictionary() {
    const file = nodes.file.files && nodes.file.files[0];

    if (!file) {
      setOperationStatus("请先选择 JSON 词库文件。", true);
      return;
    }

    try {
      setOperationStatus("正在导入...");
      const text = await file.text();
      const payload = JSON.parse(text);
      const status = await db.importCustomDictionary(payload, file.name);
      await clearSharedLookupCache();
      renderStatus(status);
      await refreshFavoritesAndStats();
      setOperationStatus("导入完成。");
    } catch (error) {
      console.warn("[LocalLex] Import failed.", error);
      setOperationStatus("导入失败：" + toErrorMessage(error), true);
    }
  }

  async function restorePackagedDictionary() {
    if (!confirm("恢复内置词库会替换当前词库，是否继续？")) {
      return;
    }

    try {
      setOperationStatus("正在恢复内置词库...");
      const status = await db.importPackagedDictionary();
      await clearSharedLookupCache();
      renderStatus(status);
      await refreshFavoritesAndStats();
      setOperationStatus("内置词库已恢复。");
    } catch (error) {
      console.warn("[LocalLex] Restore failed.", error);
      setOperationStatus("恢复失败：" + toErrorMessage(error), true);
    }
  }

  async function clearDictionary() {
    if (!confirm("删除当前 IndexedDB 词库后，查词将不可用；生词本和统计不会被删除。是否继续？")) {
      return;
    }

    try {
      setOperationStatus("正在删除词库...");
      const status = await db.clearDictionary();
      await clearSharedLookupCache();
      renderStatus(status);
      await refreshFavoritesAndStats();
      setOperationStatus("当前词库已删除。");
    } catch (error) {
      console.warn("[LocalLex] Clear failed.", error);
      setOperationStatus("删除失败：" + toErrorMessage(error), true);
    }
  }

  async function runTestLookup() {
    const query = normalize.normalizeQuery(nodes.testInput.value);

    nodes.testResult.textContent = "";
    if (!query || !normalize.isValidEnglishQuery(query)) {
      appendEmpty(nodes.testResult, "请输入英文单词，或 1-5 个英文 token 的短语。");
      return;
    }

    try {
      appendEmpty(nodes.testResult, "查询中...");
      const result = await lookup.lookupWord(query, "options");
      renderLookupResult(result, query);
      await refreshFavoritesAndStats();
    } catch (error) {
      console.warn("[LocalLex] Test lookup failed.", error);
      nodes.testResult.textContent = "";
      appendEmpty(nodes.testResult, "查询失败：" + toErrorMessage(error));
    }
  }

  function renderLookupResult(result, query) {
    nodes.testResult.textContent = "";
    renderResultHeader(nodes.testResult, result, query);

    if (!result || !result.entry) {
      appendEmpty(nodes.testResult, "未找到释义：" + (query || ""));
      return;
    }

    renderSenses(nodes.testResult, result.senses);
    renderExamples(nodes.testResult, result.examples);
    renderResultMeta(nodes.testResult, result);
  }

  function renderResultHeader(container, result, query) {
    const head = document.createElement("div");
    head.className = "entry-head";

    const left = document.createElement("div");
    const wordRow = document.createElement("div");
    wordRow.className = "word-row";

    const word = document.createElement("div");
    word.className = "word";
    word.textContent = result && result.word ? result.word : query;
    wordRow.appendChild(word);

    if (result && result.word && result.word.includes(" ")) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "短语";
      wordRow.appendChild(tag);
    }

    left.appendChild(wordRow);

    if (result && result.entry && result.entry.phonetic) {
      const phonetic = document.createElement("div");
      phonetic.className = "phonetic";
      phonetic.textContent = "/" + result.entry.phonetic + "/";
      left.appendChild(phonetic);
    }

    head.appendChild(left);

    if (result && result.entry) {
      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      setFavoriteButtonState(favoriteButton, result.favorite);
      favoriteButton.addEventListener("click", async function () {
        const previous = Boolean(result.favorite);
        const next = !previous;
        result.favorite = next;
        setFavoriteButtonState(favoriteButton, next);

        try {
          const response = await db.toggleFavorite(result.word, result.entry);
          result.favorite = Boolean(response.favorite);
          setFavoriteButtonState(favoriteButton, result.favorite);
          await refreshFavoritesAndStats();
        } catch (error) {
          result.favorite = previous;
          setFavoriteButtonState(favoriteButton, previous);
          console.warn("[LocalLex] Toggle favorite failed.", error);
        }
      });
      head.appendChild(favoriteButton);
    }

    container.appendChild(head);
  }

  function renderSenses(container, senses) {
    const safeSenses = Array.isArray(senses) ? senses : [];

    if (!safeSenses.length) {
      return;
    }

    for (const sense of safeSenses.slice(0, 10)) {
      const row = document.createElement("div");
      row.className = "sense";

      if (sense.translation) {
        const line = document.createElement("div");
        line.className = "translation";

        if (sense.pos) {
          const pos = document.createElement("span");
          pos.className = "pos";
          pos.textContent = sense.pos;
          line.appendChild(pos);
        }

        const translation = document.createElement("span");
        translation.textContent = sense.translation;
        line.appendChild(translation);
        row.appendChild(line);
      }

      if (sense.definition) {
        const definition = document.createElement("div");
        definition.className = "definition";
        definition.textContent = sense.definition;
        row.appendChild(definition);
      }

      container.appendChild(row);
    }
  }

  function setFavoriteButtonState(button, active) {
    button.className = active ? "favorite-button active" : "favorite-button";
    button.title = active ? "已加入生词本" : "加入生词本";
    button.setAttribute("aria-label", button.title);
    button.textContent = "";
    button.appendChild(createBookmarkIcon(active));
  }

  function createBookmarkIcon(active) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", active ? "currentColor" : "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z");
    svg.appendChild(path);
    return svg;
  }

  function renderExamples(container, examples) {
    if (!Array.isArray(examples) || examples.length === 0) {
      return;
    }

    if (!nodes.exampleEnabledCheckbox.checked) {
      return;
    }

    for (const item of examples.slice(0, 1)) {
      const example = document.createElement("div");
      example.className = "example";

      const en = document.createElement("div");
      en.className = "example-en";
      en.textContent = item.en || "";
      example.appendChild(en);

      if (item.zh) {
        const zh = document.createElement("div");
        zh.className = "example-zh";
        zh.textContent = item.zh;
        example.appendChild(zh);
      }

      container.appendChild(example);
    }
  }

  function renderResultMeta(container, result) {
    const parts = [];

    if (result.stats && result.stats.count) {
      parts.push("查询 " + result.stats.count + " 次");
    }

    if (result.matchedBy === "form") {
      parts.push("词形匹配");
    } else if (result.matchedBy === "lemma") {
      parts.push("规则还原");
    }

    if (!parts.length) {
      return;
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = parts.join(" · ");
    container.appendChild(meta);
  }

  async function clearStats() {
    if (!confirm("清空查询统计不会删除词库和生词本，是否继续？")) {
      return;
    }

    await db.clearLookupStats();
    await refreshFavoritesAndStats();
  }

  async function exportStatsCsv() {
    const rows = await db.getAllFromStore(db.STORES.lookupStats);
    const header = ["word", "count", "firstLookupAt", "lastLookupAt", "sources"];
    const lines = [header.join(",")];

    for (const item of rows) {
      lines.push([
        csvCell(item.word),
        csvCell(item.count || 0),
        csvCell(item.firstLookupAt || ""),
        csvCell(item.lastLookupAt || ""),
        csvCell(JSON.stringify(item.sources || {}))
      ].join(","));
    }

    downloadText("locallex-lookup-stats.csv", lines.join("\n"));
  }

  async function exportFavoritesCsv() {
    const rows = await db.getAllFavorites();
    const header = ["word", "createdAt", "lastReviewedAt", "note", "phonetic", "translation", "definition"];
    const lines = [header.join(",")];

    for (const item of rows) {
      const entry = item.sourceEntry || {};
      lines.push([
        csvCell(item.word),
        csvCell(item.createdAt || ""),
        csvCell(item.lastReviewedAt || ""),
        csvCell(item.note || ""),
        csvCell(entry.phonetic || ""),
        csvCell(entry.translation || ""),
        csvCell(entry.definition || "")
      ].join(","));
    }

    downloadText("locallex-favorites.csv", lines.join("\n"));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function clearSharedLookupCache() {
    lookup.clearLookupCache();

    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_LOOKUP_CACHE" });
    } catch (error) {
      console.warn("[LocalLex] Failed to clear background lookup cache.", error);
    }
  }

  function csvCell(value) {
    return "\"" + String(value).replace(/"/g, "\"\"") + "\"";
  }

  function createSection(titleText) {
    const section = document.createElement("section");
    section.className = "section";
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = titleText;
    section.appendChild(title);
    return section;
  }

  function appendEmpty(container, text) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    container.appendChild(empty);
  }

  function openShortcutSettings() {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  }

  function setOperationStatus(text, isError) {
    nodes.operationStatus.textContent = text || "";
    nodes.operationStatus.className = isError ? "operation-status error" : "operation-status";
  }

  function formatSource(status) {
    if (!status || !status.source) {
      return "-";
    }

    if (status.source === "custom") {
      return status.name ? "自定义：" + status.name : "自定义词库";
    }

    if (status.source === "packaged") {
      return "ECDICT 内置词库";
    }

    return status.source;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return number.toLocaleString("zh-CN");
  }

  function toErrorMessage(error) {
    return error && error.message ? error.message : String(error || "Unknown error");
  }
})();
