(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const CONTENT_SCRIPT_VERSION = "locallex-content-0.5.1";
  const INSTANCE_ID = CONTENT_SCRIPT_VERSION + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);

  if (typeof root.contentScriptCleanup === "function") {
    root.contentScriptCleanup();
  }

  root.contentScriptLoaded = true;
  root.contentScriptVersion = CONTENT_SCRIPT_VERSION;
  root.activeContentScriptInstanceId = INSTANCE_ID;

  const normalize = root.normalize;
  const lookup = root.lookup;
  const ui = root.ui;

  resetExistingUi();

  let lastQuery = {
    word: "",
    time: 0
  };
  let selectionButtonTimer = 0;
  let dblClickTimer = 0;
  let lookupToken = 0;
  let cleanedUp = false;

  const handlers = {
    mouseup: onMouseUp,
    dblclick: onDoubleClick,
    message: onMessage
  };

  document.addEventListener("mouseup", handlers.mouseup, true);
  document.addEventListener("dblclick", handlers.dblclick, true);
  chrome.runtime.onMessage.addListener(handlers.message);

  root.contentScriptCleanup = cleanup;

  lookup.ensureDictionaryImported()
    .then(function (status) {
      console.debug("[LocalLex] Dictionary ready.", status);
    })
    .catch(function (error) {
      console.warn("[LocalLex] Dictionary import failed.", error);
    });

  function cleanup() {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    window.clearTimeout(selectionButtonTimer);
    window.clearTimeout(dblClickTimer);
    lookupToken += 1;

    document.removeEventListener("mouseup", handlers.mouseup, true);
    document.removeEventListener("dblclick", handlers.dblclick, true);
    chrome.runtime.onMessage.removeListener(handlers.message);

    if (ui) {
      ui.closeSelectionButton();
      ui.closeDictPopup();
    }
  }

  function isCurrentInstance() {
    return !cleanedUp && root.activeContentScriptInstanceId === INSTANCE_ID;
  }

  function resetExistingUi() {
    if (!ui || typeof ui.getHost !== "function") {
      return;
    }

    if (typeof ui.destroyStaleHosts === "function") {
      ui.destroyStaleHosts();
    }

    ui.closeSelectionButton();
    ui.closeDictPopup();
  }

  function shouldSkipDuplicate(word) {
    const now = Date.now();

    if (lastQuery.word === word && now - lastQuery.time < 300) {
      return true;
    }

    lastQuery = {
      word,
      time: now
    };
    return false;
  }

  function isFromExtensionHost(eventTarget) {
    if (!ui || typeof ui.getHost !== "function") {
      return false;
    }

    const host = ui.getHost(false);
    return Boolean(host && eventTarget && (eventTarget === host || host.contains(eventTarget)));
  }

  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const text = selection.toString();
    const range = selection.getRangeAt(0);
    const rect = getUsableRect(range);

    return {
      text,
      rect
    };
  }

  function getWordInfoFromPoint(clientX, clientY) {
    const range = getCaretRangeFromPoint(clientX, clientY);
    if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const textNode = range.startContainer;
    const text = textNode.nodeValue || "";
    let start = Math.min(range.startOffset, text.length);
    let end = start;

    while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) {
      start -= 1;
    }

    while (end < text.length && /[A-Za-z'-]/.test(text[end])) {
      end += 1;
    }

    if (start === end) {
      return null;
    }

    const wordRange = document.createRange();
    wordRange.setStart(textNode, start);
    wordRange.setEnd(textNode, end);

    return {
      text: wordRange.toString(),
      rect: getUsableRect(wordRange)
    };
  }

  function getCaretRangeFromPoint(clientX, clientY) {
    if (typeof document.caretRangeFromPoint === "function") {
      return document.caretRangeFromPoint(clientX, clientY);
    }

    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(clientX, clientY);
      if (!position) {
        return null;
      }

      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }

    return null;
  }

  function getUsableRect(range) {
    const rangeRect = range.getBoundingClientRect();

    if (rangeRect && rangeRect.width > 0 && rangeRect.height > 0) {
      return rangeRect;
    }

    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }

    return {
      left: window.innerWidth / 2,
      right: window.innerWidth / 2,
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
      width: 0,
      height: 0
    };
  }

  function toValidQuery(text) {
    const word = normalize.normalizeQuery(text);

    if (!word || !normalize.isValidEnglishQuery(word)) {
      return "";
    }

    return word;
  }

  function toValidSingleWord(text) {
    const word = normalize.normalizeQuery(text);

    if (!word || !normalize.isValidSingleEnglishWord(word)) {
      return "";
    }

    return word;
  }

  async function lookupAndShow(word, rect, source) {
    if (!isCurrentInstance()) {
      return;
    }

    if (shouldSkipDuplicate(word)) {
      return;
    }

    const token = lookupToken + 1;
    lookupToken = token;
    ui.closeSelectionButton();

    if (typeof ui.destroyStaleHosts === "function") {
      ui.destroyStaleHosts();
    }

    try {
      const result = await lookup.lookupWord(word, source || "page");
      if (token !== lookupToken || !isCurrentInstance()) {
        return;
      }

      if (typeof ui.destroyStaleHosts === "function") {
        ui.destroyStaleHosts();
      }

      ui.showDictPopupAtRect(result, word, rect);
    } catch (error) {
      if (token !== lookupToken || !isCurrentInstance()) {
        return;
      }

      console.warn("[LocalLex] Lookup failed.", error);
      ui.showStatusPopupAtRect("查询失败，请稍后重试", word, rect);
    }
  }

  async function handleDoubleClickLookup(event) {
    if (!isCurrentInstance()) {
      return;
    }

    const eventTarget = event.target;
    if (isFromExtensionHost(eventTarget)) {
      return;
    }

    ui.closeSelectionButton();

    const wordInfo = getWordInfoFromPoint(event.clientX, event.clientY) || getSelectionInfo();
    if (!wordInfo || !wordInfo.text.trim()) {
      return;
    }

    const word = toValidSingleWord(wordInfo.text);
    if (!word) {
      return;
    }

    await lookupAndShow(word, wordInfo.rect, "page");
  }

  function handleMouseSelection(eventTarget) {
    if (!isCurrentInstance()) {
      return;
    }

    if (isFromExtensionHost(eventTarget)) {
      return;
    }

    const selectionInfo = getSelectionInfo();
    if (!selectionInfo || !selectionInfo.text.trim()) {
      return;
    }

    const word = toValidQuery(selectionInfo.text);
    if (!word) {
      return;
    }

    ui.showSelectionButton(word, selectionInfo.rect, function (query, rect) {
      lookupAndShow(query, rect, "page");
    });
  }

  function onMouseUp(event) {
    if (!isCurrentInstance()) {
      return;
    }

    if (event.detail > 1) {
      return;
    }

    const eventTarget = event.target;

    window.clearTimeout(selectionButtonTimer);
    selectionButtonTimer = window.setTimeout(function () {
      handleMouseSelection(eventTarget);
    }, 180);
  }

  function onDoubleClick(event) {
    if (!isCurrentInstance()) {
      return;
    }

    window.clearTimeout(selectionButtonTimer);
    window.clearTimeout(dblClickTimer);
    dblClickTimer = window.setTimeout(function () {
      handleDoubleClickLookup(event);
    }, 60);
  }

  function onMessage(message, sender, sendResponse) {
    if (!isCurrentInstance()) {
      return;
    }

    if (!message || !message.type) {
      return;
    }

    if (message.type === "PING") {
      sendResponse({
        ok: true,
        version: CONTENT_SCRIPT_VERSION
      });
      return;
    }

    if (message.type === "LOOKUP_CONTEXT_SELECTION") {
      lookupContextSelection(message.selectionText || "")
        .then(function () {
          sendResponse({ ok: true });
        })
        .catch(function (error) {
          console.warn("[LocalLex] Context lookup failed.", error);
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : String(error)
          });
        });

      return true;
    }
  }

  async function lookupContextSelection(rawText) {
    const selectionInfo = getSelectionInfo();
    const word = toValidQuery(selectionInfo && selectionInfo.text ? selectionInfo.text : rawText);

    if (!word) {
      return;
    }

    const rect = selectionInfo ? selectionInfo.rect : null;
    await lookupAndShow(word, rect, "contextMenu");
  }

  console.debug("[LocalLex] Content script loaded.", CONTENT_SCRIPT_VERSION);
})();
