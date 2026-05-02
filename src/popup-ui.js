(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const HOST_ID = "__locallex_host__";
  const LEGACY_HOST_ID = "__offline_ec_dict_host__";
  const UI_VERSION = "locallex-ui-0.5.0";
  const POPUP_ID = "locallex-dict-popup";
  const SELECTION_BUTTON_ID = "locallex-selection-button";
  const MAX_Z_INDEX = "2147483647";

  let popupDismissHandlers = null;
  let selectionButtonDismissHandlers = null;
  let currentTheme = "system";
  let exampleEnabled = true;
  let staleHostObserverStarted = false;

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local") {
        return;
      }

      if (changes.localLexSetting_theme) {
        currentTheme = changes.localLexSetting_theme.newValue || "system";
        const host = getHost(false);
        if (host) {
          host.setAttribute("data-theme", currentTheme);
        }
      }

      if (changes.localLexSetting_exampleEnabled) {
        exampleEnabled = normalizeExampleEnabled(changes.localLexSetting_exampleEnabled.newValue);
      }
    });
  }

  loadStoredSettings();
  startStaleHostObserver();

  function getHost(createIfMissing) {
    destroyStaleHosts();

    let host = document.getElementById(HOST_ID);
    if (!host && createIfMissing !== false) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.dataset.localLexHost = "true";
      host.dataset.localLexUiVersion = UI_VERSION;
      host.style.all = "initial";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = MAX_Z_INDEX;
      host.style.pointerEvents = "none";
      host.setAttribute("data-theme", currentTheme);
      document.documentElement.appendChild(host);
      applyStoredTheme(host);
    } else if (host) {
      applyStoredTheme(host);
    }

    return host;
  }

  function destroyStaleHosts() {
    for (const legacyHost of Array.from(document.querySelectorAll('[id="' + LEGACY_HOST_ID + '"]'))) {
      legacyHost.remove();
    }

    for (const host of Array.from(document.querySelectorAll('[id="' + HOST_ID + '"]'))) {
      if (host.dataset.localLexUiVersion !== UI_VERSION) {
        host.remove();
      }
    }
  }

  function startStaleHostObserver() {
    if (staleHostObserverStarted || typeof MutationObserver !== "function") {
      return;
    }

    staleHostObserverStarted = true;
    const observer = new MutationObserver(function () {
      destroyStaleHosts();
    });
    observer.observe(document.documentElement, {
      childList: true
    });
  }

  function applyStoredTheme(host) {
    loadSettings(function (settings) {
      currentTheme = settings.theme || "system";
      host.setAttribute("data-theme", currentTheme);
    });
  }

  function loadStoredSettings() {
    loadSettings(function (settings) {
      currentTheme = settings.theme || "system";
      exampleEnabled = normalizeExampleEnabled(settings.exampleEnabled);
    });
  }

  function loadSettings(callback) {
    let completed = false;

    function finish(settings) {
      if (completed) {
        return;
      }

      completed = true;
      callback(Object.assign({
        theme: "system",
        exampleEnabled: true
      }, settings || {}));
    }

    try {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, function (response) {
        if (!chrome.runtime.lastError && response && response.ok === true && response.data) {
          finish(response.data);
          return;
        }

        loadSettingsFromStorage(finish);
      });
    } catch (error) {
      loadSettingsFromStorage(finish);
    }
  }

  function loadSettingsFromStorage(callback) {
    if (!chrome.storage || !chrome.storage.local) {
      callback(null);
      return;
    }

    chrome.storage.local.get(["localLexSetting_theme", "localLexSetting_exampleEnabled"], function (items) {
      callback({
        theme: items.localLexSetting_theme || "system",
        exampleEnabled: normalizeExampleEnabled(items.localLexSetting_exampleEnabled)
      });
    });
  }

  function normalizeExampleEnabled(value) {
    return value !== false && value !== "false";
  }

  function getShadowRoot(createIfMissing) {
    const host = getHost(createIfMissing);

    if (!host) {
      return null;
    }

    if (!host.shadowRoot) {
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = getStyles();
      shadow.appendChild(style);
    }

    return host.shadowRoot;
  }

  function getStyles() {
    return `
      :host {
        all: initial;
        --ll-bg: #ffffff;
        --ll-bg-soft: #f6f8fb;
        --ll-fg: #111827;
        --ll-muted: #64748b;
        --ll-border: #dbe4ee;
        --ll-primary: #2563eb;
        --ll-primary-strong: #1d4ed8;
        --ll-accent: #0f766e;
        --ll-warn: #92400e;
        --ll-shadow: 0 18px 44px rgba(15, 23, 42, 0.20);
      }

      :host([data-theme="dark"]) {
        --ll-bg: #171528;
        --ll-bg-soft: #211d35;
        --ll-fg: #f7f2ff;
        --ll-muted: #a99fc0;
        --ll-border: #3a3355;
        --ll-primary: #a78bfa;
        --ll-primary-strong: #c4b5fd;
        --ll-accent: #2dd4bf;
        --ll-warn: #fbbf24;
        --ll-shadow: 0 22px 50px rgba(0, 0, 0, 0.42);
      }

      @media (prefers-color-scheme: dark) {
        :host([data-theme="system"]) {
          --ll-bg: #171528;
          --ll-bg-soft: #211d35;
          --ll-fg: #f7f2ff;
          --ll-muted: #a99fc0;
          --ll-border: #3a3355;
          --ll-primary: #a78bfa;
          --ll-primary-strong: #c4b5fd;
          --ll-accent: #2dd4bf;
          --ll-warn: #fbbf24;
          --ll-shadow: 0 22px 50px rgba(0, 0, 0, 0.42);
        }
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      .dict-popup,
      .selection-button,
      .lookup-box {
        color: var(--ll-fg);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        font-size: 14px;
        letter-spacing: 0;
        line-height: 1.45;
      }

      .dict-popup {
        position: fixed;
        z-index: ${MAX_Z_INDEX};
        width: min(360px, calc(100vw - 16px));
        max-height: min(480px, calc(100vh - 16px));
        overflow: auto;
        padding: 16px;
        border: 1px solid var(--ll-border);
        border-radius: 12px;
        background: var(--ll-bg);
        box-shadow: var(--ll-shadow);
        pointer-events: auto;
        scrollbar-width: thin;
      }

      .entry-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .word-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .dict-word {
        margin: 0;
        color: var(--ll-fg);
        font-size: 21px;
        font-weight: 760;
        overflow-wrap: anywhere;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 7px;
        border: 1px solid color-mix(in srgb, var(--ll-primary) 34%, transparent);
        border-radius: 999px;
        color: var(--ll-primary);
        font-size: 11px;
        font-weight: 650;
      }

      .favorite-button {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--ll-muted);
        cursor: pointer;
        font: inherit;
        pointer-events: auto;
      }

      .favorite-button:hover {
        background: var(--ll-bg-soft);
        color: var(--ll-primary);
      }

      .favorite-button.active {
        color: #f59e0b;
      }

      .favorite-button.active svg {
        fill: currentColor;
      }

      .favorite-button svg {
        width: 19px;
        height: 19px;
        display: block;
      }

      .dict-phonetic {
        margin-top: 2px;
        color: var(--ll-muted);
        font-size: 13px;
      }

      .sense {
        margin-top: 12px;
      }

      .pos {
        margin-right: 6px;
        color: var(--ll-accent);
        font-weight: 760;
      }

      .translation {
        color: var(--ll-fg);
        font-size: 15px;
        overflow-wrap: anywhere;
      }

      .definition {
        margin-top: 5px;
        color: var(--ll-muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }

      .example {
        margin-top: 14px;
        padding: 10px 11px;
        border-radius: 8px;
        background: var(--ll-bg-soft);
      }

      .example-en {
        color: var(--ll-fg);
      }

      .example-zh,
      .meta-line {
        margin-top: 4px;
        color: var(--ll-muted);
        font-size: 12px;
      }

      .empty {
        margin-top: 10px;
        color: var(--ll-warn);
      }

      .status-message {
        margin-top: 10px;
        color: var(--ll-muted);
      }

      .selection-button {
        position: fixed;
        z-index: ${MAX_Z_INDEX};
        display: inline-grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--ll-primary) 42%, transparent);
        border-radius: 999px;
        background: var(--ll-primary);
        color: #ffffff;
        box-shadow: var(--ll-shadow);
        cursor: pointer;
        pointer-events: auto;
      }

      .selection-button:hover {
        background: var(--ll-primary-strong);
      }

      .selection-button svg {
        display: block;
        width: 19px;
        height: 19px;
      }

      .lookup-box {
        position: fixed;
        top: 24vh;
        left: 50%;
        z-index: ${MAX_Z_INDEX};
        width: min(460px, calc(100vw - 32px));
        transform: translateX(-50%);
        padding: 14px;
        border: 1px solid var(--ll-border);
        border-radius: 10px;
        background: var(--ll-bg);
        box-shadow: var(--ll-shadow);
        pointer-events: auto;
      }

      .lookup-input {
        display: block;
        width: 100%;
        height: 42px;
        margin: 0;
        padding: 0 12px;
        border: 1px solid var(--ll-border);
        border-radius: 8px;
        outline: none;
        background: var(--ll-bg-soft);
        color: var(--ll-fg);
        font: inherit;
        font-size: 16px;
      }

      .lookup-input:focus {
        border-color: var(--ll-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ll-primary) 18%, transparent);
      }

      .lookup-result {
        margin-top: 10px;
      }

      .lookup-result:empty {
        display: none;
      }

      .lookup-status {
        color: var(--ll-muted);
      }
    `;
  }

  function renderResultCard(container, result, query) {
    container.textContent = "";

    const enhanced = normalizeResult(result, query);
    renderHeader(container, enhanced);

    if (enhanced.statusMessage) {
      renderStatusMessage(container, enhanced.statusMessage);
      return;
    }

    if (!enhanced.entry) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = enhanced.matchedBy === "invalid" ? "请输入英文单词或短语" : "未找到释义";
      container.appendChild(empty);
      return;
    }

    renderSenses(container, enhanced.senses);
    renderExamples(container, enhanced.examples);
    renderMeta(container, enhanced);
  }

  function normalizeResult(result, query) {
    if (result && Object.prototype.hasOwnProperty.call(result, "entry")) {
      return result;
    }

    return {
      query,
      normalized: query,
      word: result && result.word ? result.word : query,
      entry: result || null,
      senses: result && Array.isArray(result.senses) ? result.senses : [],
      examples: [],
      favorite: false,
      stats: null,
      matchedBy: result ? "exact" : "not_found",
      statusMessage: result && result.statusMessage ? result.statusMessage : ""
    };
  }

  function renderStatusMessage(container, message) {
    const status = document.createElement("div");
    status.className = "status-message";
    status.textContent = message;
    container.appendChild(status);
  }

  function renderHeader(container, result) {
    const head = document.createElement("div");
    head.className = "entry-head";

    const left = document.createElement("div");
    const wordRow = document.createElement("div");
    wordRow.className = "word-row";

    const word = document.createElement("h2");
    word.className = "dict-word";
    word.textContent = result.word || result.normalized || result.query || "";
    wordRow.appendChild(word);

    if ((result.word || "").includes(" ")) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "短语";
      wordRow.appendChild(tag);
    }

    left.appendChild(wordRow);

    const phonetic = result.entry && result.entry.phonetic;
    if (phonetic) {
      const phoneticNode = document.createElement("div");
      phoneticNode.className = "dict-phonetic";
      phoneticNode.textContent = "/" + phonetic + "/";
      left.appendChild(phoneticNode);
    }

    head.appendChild(left);

    if (result.entry) {
      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      setFavoriteButtonState(favoriteButton, result.favorite);
      favoriteButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(result, favoriteButton);
      });
      head.appendChild(favoriteButton);
    }

    container.appendChild(head);
  }

  async function toggleFavorite(result, button) {
    if (!root.lookup || typeof root.lookup.toggleFavorite !== "function") {
      return;
    }

    const previous = Boolean(result.favorite);
    const next = !previous;
    result.favorite = next;
    setFavoriteButtonState(button, next);

    try {
      const response = await root.lookup.toggleFavorite(result.word, result.entry);
      const active = Boolean(response && response.favorite);
      result.favorite = active;
      setFavoriteButtonState(button, active);
    } catch (error) {
      result.favorite = previous;
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

  function renderSenses(container, senses) {
    const safeSenses = Array.isArray(senses) ? senses : [];

    for (const sense of safeSenses.slice(0, 8)) {
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

  function renderExamples(container, examples) {
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

      container.appendChild(example);
    }
  }

  function renderMeta(container, result) {
    const stats = result.stats;
    const text = [];

    if (stats && stats.count) {
      text.push("查询 " + stats.count + " 次");
    }

    if (result.matchedBy === "form") {
      text.push("词形匹配");
    } else if (result.matchedBy === "lemma") {
      text.push("规则还原");
    }

    if (text.length === 0) {
      return;
    }

    const meta = document.createElement("div");
    meta.className = "meta-line";
    meta.textContent = text.join(" · ");
    container.appendChild(meta);
  }

  function showDictPopup(result, query, clientX, clientY) {
    const shadow = getShadowRoot(true);
    closeDictPopup();
    closeSelectionButton();

    const popup = document.createElement("section");
    popup.id = POPUP_ID;
    popup.className = "dict-popup";
    popup.setAttribute("role", "status");
    popup.style.visibility = "hidden";
    popup.style.left = "0px";
    popup.style.top = "0px";

    renderResultCard(popup, result, query);
    shadow.appendChild(popup);
    positionPopup(popup, clientX, clientY);
    bindPopupDismissHandlers();
  }

  function showDictPopupAtRect(result, query, anchorRect) {
    const shadow = getShadowRoot(true);
    closeDictPopup();
    closeSelectionButton();

    const popup = document.createElement("section");
    popup.id = POPUP_ID;
    popup.className = "dict-popup";
    popup.setAttribute("role", "status");
    popup.style.visibility = "hidden";
    popup.style.left = "0px";
    popup.style.top = "0px";

    renderResultCard(popup, result, query);
    shadow.appendChild(popup);
    positionPopupAtRect(popup, anchorRect);
    bindPopupDismissHandlers();
  }

  function showStatusPopupAtRect(message, query, anchorRect) {
    showDictPopupAtRect({
      query,
      normalized: query,
      word: query,
      entry: null,
      senses: [],
      examples: [],
      favorite: false,
      stats: null,
      matchedBy: "status",
      statusMessage: message
    }, query, anchorRect);
  }

  function positionPopup(popup, clientX, clientY) {
    const margin = 8;
    const offset = 14;
    const x = Number.isFinite(clientX) ? clientX : window.innerWidth / 2;
    const y = Number.isFinite(clientY) ? clientY : window.innerHeight / 2;
    const rect = popup.getBoundingClientRect();

    let left = x + offset;
    let top = y + offset;

    if (left + rect.width + margin > window.innerWidth) {
      left = x - rect.width - offset;
    }

    if (top + rect.height + margin > window.innerHeight) {
      top = y - rect.height - offset;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    popup.style.left = left + "px";
    popup.style.top = top + "px";
    popup.style.visibility = "visible";
  }

  function positionPopupAtRect(popup, anchorRect) {
    const margin = 8;
    const gap = 10;
    const rect = popup.getBoundingClientRect();
    const anchor = normalizeRect(anchorRect);
    const anchorCenter = anchor.left + (anchor.width / 2);

    let left = anchorCenter - (rect.width / 2);
    let top = anchor.top - rect.height - gap;

    if (top < margin) {
      top = anchor.bottom + gap;
    }

    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

    popup.style.left = left + "px";
    popup.style.top = top + "px";
    popup.style.visibility = "visible";
  }

  function showSelectionButton(query, anchorRect, onClick) {
    const shadow = getShadowRoot(true);
    closeDictPopup();
    closeSelectionButton();

    const button = document.createElement("button");
    button.id = SELECTION_BUTTON_ID;
    button.className = "selection-button";
    button.type = "button";
    button.title = "LocalLex 查词";
    button.setAttribute("aria-label", "LocalLex 查词");
    button.appendChild(createSelectionButtonIcon());
    button.style.visibility = "hidden";
    button.style.left = "0px";
    button.style.top = "0px";

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      closeSelectionButton();
      onClick(query, normalizeRect(anchorRect));
    });

    shadow.appendChild(button);
    positionSelectionButton(button, anchorRect);
    bindSelectionButtonDismissHandlers();
  }

  function createSelectionButtonIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const book = document.createElementNS("http://www.w3.org/2000/svg", "path");
    book.setAttribute("d", "M5 4h8a3 3 0 0 1 3 3v10H7a2 2 0 0 1-2-2V4z");
    svg.appendChild(book);

    for (const d of ["M8 8h5", "M8 11h4"]) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", d);
      svg.appendChild(line);
    }

    const lens = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    lens.setAttribute("cx", "16");
    lens.setAttribute("cy", "16");
    lens.setAttribute("r", "3.5");
    svg.appendChild(lens);

    const handle = document.createElementNS("http://www.w3.org/2000/svg", "path");
    handle.setAttribute("d", "m18.5 18.5 2.5 2.5");
    svg.appendChild(handle);

    return svg;
  }

  function positionSelectionButton(button, anchorRect) {
    const margin = 8;
    const gap = 8;
    const anchor = normalizeRect(anchorRect);
    const rect = button.getBoundingClientRect();

    let left = anchor.left + (anchor.width / 2) - (rect.width / 2);
    let top = anchor.top - rect.height - gap;

    if (top < margin) {
      top = anchor.bottom + gap;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    button.style.left = left + "px";
    button.style.top = top + "px";
    button.style.visibility = "visible";
  }

  function normalizeRect(rect) {
    if (!rect) {
      return {
        left: window.innerWidth / 2,
        right: window.innerWidth / 2,
        top: window.innerHeight / 2,
        bottom: window.innerHeight / 2,
        width: 0,
        height: 0
      };
    }

    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const width = Number.isFinite(rect.width) ? rect.width : Math.max(0, (rect.right || left) - left);
    const height = Number.isFinite(rect.height) ? rect.height : Math.max(0, (rect.bottom || top) - top);

    return {
      left,
      top,
      width,
      height,
      right: Number.isFinite(rect.right) ? rect.right : left + width,
      bottom: Number.isFinite(rect.bottom) ? rect.bottom : top + height
    };
  }

  function bindPopupDismissHandlers() {
    cleanupPopupDismissHandlers();

    const onKeyDown = function (event) {
      if (event.key === "Escape") {
        closeDictPopup();
      }
    };

    const onPointerDown = function (event) {
      const host = getHost(false);
      if (host && host.contains(event.target)) {
        return;
      }

      closeDictPopup();
    };

    const onScrollOrResize = function () {
      closeDictPopup();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    popupDismissHandlers = { onKeyDown, onPointerDown, onScrollOrResize };
  }

  function cleanupPopupDismissHandlers() {
    if (!popupDismissHandlers) {
      return;
    }

    document.removeEventListener("keydown", popupDismissHandlers.onKeyDown, true);
    document.removeEventListener("pointerdown", popupDismissHandlers.onPointerDown, true);
    window.removeEventListener("scroll", popupDismissHandlers.onScrollOrResize, true);
    window.removeEventListener("resize", popupDismissHandlers.onScrollOrResize, true);
    popupDismissHandlers = null;
  }

  function bindSelectionButtonDismissHandlers() {
    cleanupSelectionButtonDismissHandlers();

    const onKeyDown = function (event) {
      if (event.key === "Escape") {
        closeSelectionButton();
      }
    };

    const onPointerDown = function (event) {
      const host = getHost(false);
      if (host && host.contains(event.target)) {
        return;
      }

      closeSelectionButton();
    };

    const onScrollOrResize = function () {
      closeSelectionButton();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    selectionButtonDismissHandlers = { onKeyDown, onPointerDown, onScrollOrResize };
  }

  function cleanupSelectionButtonDismissHandlers() {
    if (!selectionButtonDismissHandlers) {
      return;
    }

    document.removeEventListener("keydown", selectionButtonDismissHandlers.onKeyDown, true);
    document.removeEventListener("pointerdown", selectionButtonDismissHandlers.onPointerDown, true);
    window.removeEventListener("scroll", selectionButtonDismissHandlers.onScrollOrResize, true);
    window.removeEventListener("resize", selectionButtonDismissHandlers.onScrollOrResize, true);
    selectionButtonDismissHandlers = null;
  }

  function closeSelectionButton() {
    const shadow = getShadowRoot(false);
    const button = shadow ? shadow.getElementById(SELECTION_BUTTON_ID) : null;

    if (button) {
      button.remove();
    }

    cleanupSelectionButtonDismissHandlers();
  }

  function closeDictPopup() {
    const shadow = getShadowRoot(false);
    const popup = shadow ? shadow.getElementById(POPUP_ID) : null;

    if (popup) {
      popup.remove();
    }

    cleanupPopupDismissHandlers();
  }

  root.ui = {
    HOST_ID,
    UI_VERSION,
    getHost,
    getShadowRoot,
    destroyStaleHosts,
    renderResultCard,
    showDictPopup,
    showDictPopupAtRect,
    showStatusPopupAtRect,
    showSelectionButton,
    closeSelectionButton,
    closeDictPopup
  };
})();
