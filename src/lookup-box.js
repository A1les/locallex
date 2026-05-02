(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const BOX_ID = "locallex-lookup-box";
  const DEBOUNCE_MS = 120;

  let cleanupHandlers = null;
  let debounceTimer = 0;
  let queryToken = 0;

  function openLookupBox() {
    const ui = root.ui;
    const shadow = ui.getShadowRoot(true);

    ui.closeDictPopup();
    ui.closeSelectionButton();
    closeLookupBox();

    const box = document.createElement("section");
    box.id = BOX_ID;
    box.className = "lookup-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "LocalLex 查词");

    const input = document.createElement("input");
    input.className = "lookup-input";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "输入英文单词或短语";

    const result = document.createElement("div");
    result.className = "lookup-result";

    box.appendChild(input);
    box.appendChild(result);
    shadow.appendChild(box);

    input.addEventListener("input", function () {
      scheduleLookup(input.value, result);
    });

    bindDismissHandlers();
    window.setTimeout(function () {
      input.focus();
      input.select();
    }, 0);
  }

  function scheduleLookup(rawValue, resultNode) {
    const normalize = root.normalize;
    const word = normalize.normalizeQuery(rawValue);

    window.clearTimeout(debounceTimer);
    queryToken += 1;
    resultNode.textContent = "";

    if (!word || !normalize.isValidEnglishQuery(word)) {
      return;
    }

    const token = queryToken;
    debounceTimer = window.setTimeout(async function () {
      try {
        resultNode.textContent = "查询中...";
        resultNode.className = "lookup-result lookup-status";
        const result = await root.lookup.lookupWord(word, "shortcut");

        if (token !== queryToken) {
          return;
        }

        resultNode.className = "lookup-result";
        root.ui.renderResultCard(resultNode, result, word);
      } catch (error) {
        console.warn("[LocalLex] Lookup failed.", error);
        resultNode.className = "lookup-result lookup-status";
        resultNode.textContent = "查询失败";
      }
    }, DEBOUNCE_MS);
  }

  function bindDismissHandlers() {
    cleanupDismissHandlers();

    const onKeyDown = function (event) {
      if (event.key === "Escape") {
        closeLookupBox();
      }
    };

    const onPointerDown = function (event) {
      const host = root.ui.getHost(false);
      if (host && host.contains(event.target)) {
        return;
      }

      closeLookupBox();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    cleanupHandlers = {
      onKeyDown,
      onPointerDown
    };
  }

  function cleanupDismissHandlers() {
    if (!cleanupHandlers) {
      return;
    }

    document.removeEventListener("keydown", cleanupHandlers.onKeyDown, true);
    document.removeEventListener("pointerdown", cleanupHandlers.onPointerDown, true);
    cleanupHandlers = null;
  }

  function closeLookupBox() {
    window.clearTimeout(debounceTimer);
    queryToken += 1;

    const shadow = root.ui ? root.ui.getShadowRoot(false) : null;
    const box = shadow ? shadow.getElementById(BOX_ID) : null;

    if (box) {
      box.remove();
    }

    cleanupDismissHandlers();
  }

  root.lookupBox = {
    openLookupBox,
    closeLookupBox
  };
})();
