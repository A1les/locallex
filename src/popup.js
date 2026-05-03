(function () {
  "use strict";

  const root = globalThis.__offlineEcDict;
  const normalize = root.normalize;
  const db = root.db;
  const lookup = root.lookup;
  const input = document.getElementById("lookup-input");
  const resultNode = document.getElementById("result");
  const optionsButton = document.getElementById("options-button");
  const themeButton = document.getElementById("theme-button");
  const DEBOUNCE_MS = 120;
  const CONTENT_SCRIPT_FILES = [
    "src/normalize.js",
    "src/popup-ui.js",
    "src/lookup-client.js",
    "src/content.js"
  ];
  const CONTENT_SCRIPT_VERSION = "locallex-content-0.5.2";

  let debounceTimer = 0;
  let queryToken = 0;
  let currentResult = null;
  let currentTheme = "system";
  let exampleEnabled = true;

  init();

  async function init() {
    await initSettings();

    try {
      await db.ensureDictionaryImported();
    } catch (error) {
      console.warn("[LocalLex] Failed to prepare dictionary.", error);
      renderStatus("词库读取失败");
    }

    ensureActiveTabContentScript();

    input.addEventListener("input", function () {
      scheduleLookup(input.value);
    });

    optionsButton.addEventListener("click", function () {
      chrome.runtime.openOptionsPage();
    });

    themeButton.addEventListener("click", toggleTheme);

    renderEmptyState();
    window.setTimeout(function () {
      input.focus();
    }, 0);
  }

  async function initSettings() {
    const settings = await db.getSettings();
    currentTheme = settings.theme || "system";
    exampleEnabled = settings.exampleEnabled !== false;
    setTheme(currentTheme);
  }

  function setTheme(theme) {
    currentTheme = theme || "system";
    document.documentElement.setAttribute("data-theme", currentTheme);
    renderThemeIcon();
  }

  async function toggleTheme() {
    const nextTheme = getResolvedTheme() === "dark" ? "light" : "dark";
    await db.setSetting("theme", nextTheme);
    setTheme(nextTheme);
  }

  function getResolvedTheme() {
    if (currentTheme === "dark" || currentTheme === "light") {
      return currentTheme;
    }

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function renderThemeIcon() {
    const dark = getResolvedTheme() === "dark";
    themeButton.title = dark ? "切换到浅色模式" : "切换到暗黑模式";
    themeButton.setAttribute("aria-label", themeButton.title);
    themeButton.textContent = "";
    themeButton.appendChild(dark ? createSunIcon() : createMoonIcon());
  }

  async function ensureActiveTabContentScript() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];

      if (!tab || typeof tab.id !== "number" || !isInjectableUrl(tab.url)) {
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        if (response && response.version === CONTENT_SCRIPT_VERSION) {
          return;
        }
      } catch (error) {
        // Fall through and inject the current content script bundle.
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: CONTENT_SCRIPT_FILES
      });
    } catch (error) {
      console.warn("[LocalLex] Failed to prepare active page.", error);
    }
  }

  function isInjectableUrl(url) {
    return /^(https?:|file:)/i.test(url || "");
  }

  function scheduleLookup(rawValue) {
    const word = normalize.normalizeQuery(rawValue);
    window.clearTimeout(debounceTimer);
    queryToken += 1;

    if (!word) {
      currentResult = null;
      renderEmptyState();
      return;
    }

    if (!normalize.isValidEnglishQuery(word)) {
      currentResult = null;
      renderStatus("请输入英文单词或短语");
      return;
    }

    const token = queryToken;
    debounceTimer = window.setTimeout(async function () {
      try {
        renderStatus("查询中...");
        const result = await lookup.lookupWord(word, "popup");

        if (token !== queryToken) {
          return;
        }

        currentResult = result;
        renderResult(result, word);
      } catch (error) {
        console.warn("[LocalLex] Lookup failed.", error);
        currentResult = null;
        renderStatus("查询失败，请稍后重试");
      }
    }, DEBOUNCE_MS);
  }

  function renderEmptyState() {
    renderStatus("输入单词或短语后显示释义。");
  }

  function renderStatus(text) {
    resultNode.textContent = "";
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = text;
    resultNode.appendChild(status);
  }

  function renderResult(result, query) {
    resultNode.textContent = "";
    renderHeader(result, query);

    if (!result || !result.entry) {
      const notFound = document.createElement("div");
      notFound.className = "not-found";
      notFound.textContent = "未找到释义";
      resultNode.appendChild(notFound);
      return;
    }

    renderSenses(result.senses);
    renderExamples(result.examples);
    renderMeta(result);
  }

  function renderHeader(result, query) {
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
      favoriteButton.addEventListener("click", toggleFavorite);
      head.appendChild(favoriteButton);
    }

    resultNode.appendChild(head);
  }

  async function toggleFavorite(event) {
    if (!currentResult || !currentResult.entry) {
      return;
    }

    const button = event.currentTarget;
    const previous = Boolean(currentResult.favorite);
    const next = !previous;
    currentResult.favorite = next;
    setFavoriteButtonState(button, next);

    try {
      const response = await db.toggleFavorite(currentResult.word, currentResult.entry);
      currentResult.favorite = Boolean(response.favorite);
      setFavoriteButtonState(button, currentResult.favorite);
    } catch (error) {
      currentResult.favorite = previous;
      setFavoriteButtonState(button, previous);
      console.warn("[LocalLex] Toggle favorite failed.", error);
    }
  }

  function setFavoriteButtonState(button, active) {
    button.className = active ? "favorite-button active" : "favorite-button";
    button.title = active ? "已加入生词本" : "加入生词本";
    button.setAttribute("aria-label", button.title);
    button.textContent = "";
    button.appendChild(createBookmarkIcon(active));
  }

  function renderSenses(senses) {
    const safeSenses = Array.isArray(senses) ? senses : [];

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

      resultNode.appendChild(row);
    }
  }

  function renderExamples(examples) {
    if (!exampleEnabled || !Array.isArray(examples) || examples.length === 0) {
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

      resultNode.appendChild(example);
    }
  }

  function renderMeta(result) {
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
    resultNode.appendChild(meta);
  }

  function createBookmarkIcon(active) {
    const svg = createIcon();
    svg.setAttribute("fill", active ? "currentColor" : "none");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z");
    svg.appendChild(path);
    return svg;
  }

  function createMoonIcon() {
    const svg = createIcon();
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z");
    svg.appendChild(path);
    return svg;
  }

  function createSunIcon() {
    const svg = createIcon();
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "4");
    svg.appendChild(circle);

    for (const d of ["M12 2v2", "M12 20v2", "M4.93 4.93l1.41 1.41", "M4.93 19.07l1.41-1.41", "M2 12h2", "M20 12h2", "M19.07 4.93l-1.41 1.41", "M19.07 19.07l-1.41-1.41"]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }

    return svg;
  }

  function createIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }
})();
