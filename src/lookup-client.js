(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const REQUEST_TIMEOUT_MS = 180000;

  function sendMessage(type, payload) {
    return new Promise(function (resolve, reject) {
      const timeout = window.setTimeout(function () {
        reject(new Error("Dictionary request timed out."));
      }, REQUEST_TIMEOUT_MS);

      chrome.runtime.sendMessage(Object.assign({ type }, payload || {}), function (response) {
        window.clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response || response.ok !== true) {
          reject(new Error(response && response.error ? response.error : "Dictionary request failed."));
          return;
        }

        resolve(response.data);
      });
    });
  }

  function lookupWord(rawWord, source) {
    return sendMessage("LOOKUP_WORD", {
      word: rawWord,
      source: source || "page"
    });
  }

  function ensureDictionaryImported() {
    return sendMessage("ENSURE_IMPORTED");
  }

  function getStatus() {
    return sendMessage("GET_DICTIONARY_STATUS");
  }

  function toggleFavorite(word, sourceEntry) {
    return sendMessage("TOGGLE_FAVORITE", {
      word,
      sourceEntry: sourceEntry || null
    });
  }

  function getSettings() {
    return sendMessage("GET_SETTINGS");
  }

  root.lookup = {
    lookupWord,
    ensureDictionaryImported,
    getStatus,
    toggleFavorite,
    getSettings
  };
})();
