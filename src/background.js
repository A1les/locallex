importScripts("normalize.js", "db.js", "lookup.js");

(function () {
  "use strict";

  const CONTENT_SCRIPT_FILES = [
    "src/normalize.js",
    "src/popup-ui.js",
    "src/lookup-client.js",
    "src/content.js"
  ];
  const CONTENT_SCRIPT_VERSION = "locallex-content-0.5.1";

  chrome.runtime.onInstalled.addListener(function () {
    createContextMenu();
  });

  chrome.runtime.onStartup.addListener(function () {
    createContextMenu();
  });

  chrome.contextMenus.onClicked.addListener(async function (info, tab) {
    if (info.menuItemId !== "locallex-lookup-selection" || !tab || typeof tab.id !== "number") {
      return;
    }

    try {
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: "LOOKUP_CONTEXT_SELECTION",
        selectionText: info.selectionText || "",
        source: "contextMenu"
      });
    } catch (error) {
      console.warn("[LocalLex] Failed to lookup context selection.", error);
    }
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    handleRuntimeMessage(message, sender)
      .then(function (response) {
        sendResponse({
          ok: true,
          data: response
        });
      })
      .catch(function (error) {
        console.warn("[LocalLex] Runtime message failed.", error);
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : String(error)
        });
      });

    return true;
  });

  async function ensureContentScript(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response && response.version === CONTENT_SCRIPT_VERSION) {
        return true;
      }
    } catch (error) {
      // Fall through and inject the current content script bundle.
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
    return true;
  }

  function createContextMenu() {
    chrome.contextMenus.removeAll(function () {
      chrome.contextMenus.create({
        id: "locallex-lookup-selection",
        title: "LocalLex 查词：%s",
        contexts: ["selection"]
      });
    });
  }

  createContextMenu();

  async function handleRuntimeMessage(message) {
    if (!message || !message.type) {
      return null;
    }

    const root = globalThis.__offlineEcDict;

    if (message.type === "LOOKUP_WORD") {
      await root.db.ensureDictionaryImported();
      return root.lookup.lookupWord(message.word, message.source || "unknown");
    }

    if (message.type === "ENSURE_IMPORTED") {
      return root.db.ensureDictionaryImported();
    }

    if (message.type === "GET_DICTIONARY_STATUS") {
      return root.db.getDictionaryStatus();
    }

    if (message.type === "TOGGLE_FAVORITE") {
      return root.db.toggleFavorite(message.word, message.sourceEntry || null);
    }

    if (message.type === "GET_SETTINGS") {
      return root.db.getSettings();
    }

    if (message.type === "SET_SETTING") {
      await root.db.setSetting(message.key, message.value);
      return root.db.getSettings();
    }

    if (message.type === "CLEAR_LOOKUP_CACHE") {
      root.lookup.clearLookupCache();
      return true;
    }

    if (message.type === "GET_STATS_SUMMARY") {
      return {
        top: await root.db.getTopStats(message.limit || 20),
        recent: await root.db.getRecentStats(message.limit || 20),
        favorites: await root.db.getAllFavorites()
      };
    }

    return null;
  }
})();
