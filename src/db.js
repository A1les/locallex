(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const DB_NAME = "offline_ec_dict";
  const DB_VERSION = 2;
  const STORES = {
    entries: "entries",
    forms: "forms",
    meta: "meta",
    examples: "examples",
    favorites: "favorites",
    lookupStats: "lookupStats",
    settings: "settings"
  };

  let dbPromise = null;
  let importPromise = null;

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        const db = request.result;

        createStoreIfMissing(db, STORES.entries, { keyPath: "word" });
        createStoreIfMissing(db, STORES.forms, { keyPath: "form" });
        createStoreIfMissing(db, STORES.meta, { keyPath: "key" });
        createStoreIfMissing(db, STORES.examples, { keyPath: "key" });
        createStoreIfMissing(db, STORES.favorites, { keyPath: "word" });
        createStoreIfMissing(db, STORES.lookupStats, { keyPath: "word" });
        createStoreIfMissing(db, STORES.settings, { keyPath: "key" });
      };

      request.onsuccess = function () {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = function () {
        reject(request.error);
      };

      request.onblocked = function () {
        reject(new Error("IndexedDB open request was blocked."));
      };
    });

    return dbPromise;
  }

  function createStoreIfMissing(db, storeName, options) {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, options);
    }
  }

  async function getFromStore(storeName, key) {
    const db = await openDB();

    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);

      request.onsuccess = function () {
        resolve(request.result || null);
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function getAllFromStore(storeName) {
    const db = await openDB();

    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();

      request.onsuccess = function () {
        resolve(request.result || []);
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function bulkPut(storeName, items) {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const db = await openDB();

    await new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = function () {
        resolve();
      };

      transaction.onerror = function () {
        reject(transaction.error);
      };

      transaction.onabort = function () {
        reject(transaction.error || new Error("IndexedDB transaction aborted."));
      };

      for (const item of items) {
        store.put(item);
      }
    });
  }

  async function putStore(storeName, item) {
    await bulkPut(storeName, [item]);
  }

  async function deleteFromStore(storeName, key) {
    const db = await openDB();

    await new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).delete(key);

      request.onsuccess = function () {
        resolve();
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function clearStore(storeName) {
    const db = await openDB();

    await new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = function () {
        resolve();
      };

      transaction.onerror = function () {
        reject(transaction.error);
      };

      transaction.onabort = function () {
        reject(transaction.error || new Error("IndexedDB transaction aborted."));
      };

      store.clear();
    });
  }

  async function countStore(storeName) {
    const db = await openDB();

    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).count();

      request.onsuccess = function () {
        resolve(request.result || 0);
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function getMeta(key) {
    const row = await getFromStore(STORES.meta, key);
    return row ? row.value : undefined;
  }

  async function setMeta(key, value) {
    await putStore(STORES.meta, { key, value });
  }

  async function getSetting(key, fallbackValue) {
    const row = await getFromStore(STORES.settings, key);
    return row ? row.value : fallbackValue;
  }

  async function setSetting(key, value) {
    const normalizedValue = normalizeSettingValue(key, value);
    await putStore(STORES.settings, { key, value: normalizedValue });
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ ["localLexSetting_" + key]: normalizedValue });
    }
  }

  async function getSettings() {
    return {
      theme: await getSetting("theme", "system"),
      exampleCount: normalizeExampleCount(await getSetting("exampleCount", 1)),
      exampleEnabled: normalizeExampleEnabled(await getSetting("exampleEnabled", true))
    };
  }

  function normalizeSettingValue(key, value) {
    if (key === "exampleCount") {
      return normalizeExampleCount(value);
    }

    if (key === "exampleEnabled") {
      return normalizeExampleEnabled(value);
    }

    return value;
  }

  function normalizeExampleEnabled(value) {
    return value !== false && value !== "false";
  }

  function normalizeExampleCount(value) {
    const number = Number(value || 1);
    if (!Number.isFinite(number)) {
      return 1;
    }

    return Math.max(1, Math.min(3, Math.round(number)));
  }

  function setStorageStatus(imported, dictVersion, source) {
    if (!chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      chrome.storage.local.set({
        offlineEcDictImported: imported,
        offlineEcDictVersion: dictVersion || "",
        offlineEcDictSource: source || "",
        offlineEcDictUpdatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("[LocalLex] Failed to mirror dictionary status.", error);
    }
  }

  async function fetchJson(path) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch " + path + ": " + response.status);
    }

    return response.json();
  }

  async function importDictionary() {
    const dictMeta = await fetchJson("data/meta.json");
    const disabled = await getMeta("disabled");
    const imported = await getMeta("imported");
    const dictVersion = await getMeta("dictVersion");
    const source = await getMeta("dictSource");

    if (disabled === true) {
      setStorageStatus(false, dictVersion, source);
      return getDictionaryStatus();
    }

    if (imported === true && (source === "custom" || dictVersion === dictMeta.version)) {
      setStorageStatus(true, dictVersion, source || "packaged");
      return getDictionaryStatus();
    }

    await setMeta("imported", false);
    setStorageStatus(false, dictMeta.version, "packaged");
    await clearDictionaryStores();
    await clearStore(STORES.meta);

    for (const chunkName of dictMeta.entryChunks) {
      const entries = await fetchJson("data/" + chunkName);
      await bulkPut(STORES.entries, entries);
    }

    const forms = await fetchJson("data/" + dictMeta.forms);
    await bulkPut(STORES.forms, forms);

    if (Array.isArray(dictMeta.exampleChunks)) {
      for (const chunkName of dictMeta.exampleChunks) {
        const examples = await fetchJson("data/" + chunkName);
        await bulkPut(STORES.examples, examples);
      }
    }

    await setMeta("dictVersion", dictMeta.version);
    await setMeta("dictSource", "packaged");
    await setMeta("dictName", "ECDICT");
    await setMeta("entryCount", await countStore(STORES.entries));
    await setMeta("formCount", await countStore(STORES.forms));
    await setMeta("exampleCount", await countStore(STORES.examples));
    await setMeta("importedAt", new Date().toISOString());
    await setMeta("disabled", false);
    await setMeta("imported", true);
    setStorageStatus(true, dictMeta.version, "packaged");

    return getDictionaryStatus();
  }

  function ensureDictionaryImported() {
    if (!importPromise) {
      importPromise = importDictionary().catch(function (error) {
        importPromise = null;
        throw error;
      });
    }

    return importPromise;
  }

  async function importPackagedDictionary() {
    importPromise = null;
    await setMeta("disabled", false);
    await setMeta("imported", false);
    return ensureDictionaryImported();
  }

  async function clearDictionaryStores() {
    await clearStore(STORES.entries);
    await clearStore(STORES.forms);
    await clearStore(STORES.examples);
  }

  async function clearDictionary() {
    importPromise = null;
    await clearDictionaryStores();
    await clearStore(STORES.meta);
    await setMeta("disabled", true);
    await setMeta("imported", false);
    setStorageStatus(false, "", "");

    return getDictionaryStatus();
  }

  async function importCustomDictionary(payload, filename) {
    const normalized = normalizeCustomDictionary(payload, filename);

    importPromise = null;
    await clearDictionaryStores();
    await bulkPut(STORES.entries, normalized.entries);
    await bulkPut(STORES.forms, normalized.forms);
    await bulkPut(STORES.examples, normalized.examples);
    await clearStore(STORES.meta);
    await setMeta("disabled", false);
    await setMeta("imported", true);
    await setMeta("dictVersion", normalized.version);
    await setMeta("dictSource", "custom");
    await setMeta("dictName", normalized.name);
    await setMeta("entryCount", normalized.entries.length);
    await setMeta("formCount", normalized.forms.length);
    await setMeta("exampleCount", normalized.examples.length);
    await setMeta("importedAt", new Date().toISOString());
    setStorageStatus(true, normalized.version, "custom");

    return getDictionaryStatus();
  }

  function normalizeCustomDictionary(payload, filename) {
    const normalize = root.normalize;
    const entriesInput = Array.isArray(payload) ? payload : payload && payload.entries;
    const formsInput = payload && Array.isArray(payload.forms) ? payload.forms : [];
    const examplesInput = payload && Array.isArray(payload.examples) ? payload.examples : [];

    if (!Array.isArray(entriesInput)) {
      throw new Error("词库文件必须是词条数组，或包含 entries 数组的对象。");
    }

    const entriesByWord = new Map();
    const formsByForm = new Map();
    const examplesByKey = new Map();

    for (const item of entriesInput) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const word = normalize.normalizeQuery(item.word);
      if (!normalize.isValidEnglishQuery(word) || entriesByWord.has(word)) {
        continue;
      }

      const translation = normalizeTextValue(item.translation);
      const definition = normalizeTextValue(item.definition);
      entriesByWord.set(word, {
        word,
        phonetic: String(item.phonetic || "").trim(),
        translation,
        definition,
        senses: Array.isArray(item.senses) ? item.senses : buildSenses(translation, definition),
        pos: String(item.pos || "").trim(),
        tag: String(item.tag || "").trim(),
        collins: Number(item.collins) || 0,
        oxford: Number(item.oxford) || 0,
        bnc: Number(item.bnc) || 0,
        frq: Number(item.frq) || 0,
        exchange: String(item.exchange || "").trim()
      });
    }

    for (const item of formsInput) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const form = normalize.normalizeQuery(item.form);
      const base = normalize.normalizeQuery(item.base);

      if (!normalize.isValidSingleEnglishWord(form) || !normalize.isValidSingleEnglishWord(base) || form === base) {
        continue;
      }

      if (!entriesByWord.has(base) || formsByForm.has(form)) {
        continue;
      }

      formsByForm.set(form, { form, base });
    }

    for (const item of examplesInput) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const key = normalize.normalizeQuery(item.key);
      if (!normalize.isValidEnglishQuery(key) || !Array.isArray(item.examples)) {
        continue;
      }

      examplesByKey.set(key, {
        key,
        examples: item.examples.slice(0, 1).map(normalizeExample).filter(Boolean)
      });
    }

    const entries = Array.from(entriesByWord.values());
    if (entries.length === 0) {
      throw new Error("词库文件没有可导入的有效英文词条。");
    }

    return {
      entries,
      forms: Array.from(formsByForm.values()),
      examples: Array.from(examplesByKey.values()).filter(function (item) {
        return item.examples.length > 0;
      }),
      version: String(payload && payload.version || "custom-" + Date.now()),
      name: String(payload && payload.name || filename || "Custom dictionary")
    };
  }

  function normalizeExample(item) {
    if (!item || typeof item !== "object" || !item.en) {
      return null;
    }

    return {
      en: String(item.en || "").trim(),
      zh: String(item.zh || "").trim(),
      source: String(item.source || "custom").trim()
    };
  }

  function buildSenses(translation, definition) {
    const lines = parseSenseLines(translation, false);
    const definitions = parseSenseLines(definition, true);

    if (lines.length === 0 && definition) {
      return [{ pos: "", translation: "", definition: String(definition).trim() }];
    }

    return lines.map(function (line) {
      const matchedDefinition = definitions.find(function (item) {
        return item.pos && item.pos === line.pos;
      });

      return {
        pos: line.pos,
        translation: line.text,
        definition: matchedDefinition ? matchedDefinition.text : ""
      };
    });
  }

  function splitSenseLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(/^([a-zA-Z]+)\.\s*(.+)$/);
    if (!match) {
      return { pos: "", text: trimmed };
    }

    return {
      pos: match[1].toLowerCase() + ".",
      text: match[2].trim()
    };
  }

  function parseSenseLines(value, mergeContinuations) {
    const lines = normalizeTextValue(value).split(/\n+/).map(splitSenseLine).filter(Boolean);

    if (!mergeContinuations) {
      return lines;
    }

    const merged = [];
    for (const line of lines) {
      if (!line.pos && merged.length > 0) {
        const previous = merged[merged.length - 1];
        previous.text = (previous.text + " " + line.text).trim();
      } else {
        merged.push(line);
      }
    }

    return merged;
  }

  function normalizeTextValue(value) {
    return String(value || "")
      .replace(/\\n/g, "\n")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  async function getExamples(key) {
    const normalized = root.normalize.normalizeQuery(key);
    const row = await getFromStore(STORES.examples, normalized);
    return row && Array.isArray(row.examples) ? row.examples : [];
  }

  async function getFavorite(word) {
    const normalized = root.normalize.normalizeQuery(word);
    return getFromStore(STORES.favorites, normalized);
  }

  async function toggleFavorite(word, sourceEntry) {
    const normalized = root.normalize.normalizeQuery(word);
    if (!root.normalize.isValidEnglishQuery(normalized)) {
      throw new Error("Invalid favorite word.");
    }

    const existing = await getFavorite(normalized);
    if (existing) {
      await deleteFromStore(STORES.favorites, normalized);
      return { word: normalized, favorite: false };
    }

    const now = new Date().toISOString();
    const favorite = {
      word: normalized,
      createdAt: now,
      lastReviewedAt: "",
      note: "",
      sourceEntry: sourceEntry || null
    };
    await putStore(STORES.favorites, favorite);
    return { word: normalized, favorite: true, item: favorite };
  }

  async function recordLookup(word, source) {
    const normalized = root.normalize.normalizeQuery(word);
    if (!root.normalize.isValidEnglishQuery(normalized)) {
      return null;
    }

    const now = new Date().toISOString();
    const existing = await getFromStore(STORES.lookupStats, normalized);
    const sources = Object.assign({}, existing && existing.sources);
    const safeSource = source || "unknown";
    sources[safeSource] = (sources[safeSource] || 0) + 1;

    const stats = {
      word: normalized,
      count: existing ? (existing.count || 0) + 1 : 1,
      firstLookupAt: existing && existing.firstLookupAt ? existing.firstLookupAt : now,
      lastLookupAt: now,
      sources
    };

    await putStore(STORES.lookupStats, stats);
    return stats;
  }

  async function getLookupStats(word) {
    return getFromStore(STORES.lookupStats, root.normalize.normalizeQuery(word));
  }

  async function getTopStats(limit) {
    const all = await getAllFromStore(STORES.lookupStats);
    return all.sort(function (left, right) {
      return (right.count || 0) - (left.count || 0);
    }).slice(0, limit || 20);
  }

  async function getRecentStats(limit) {
    const all = await getAllFromStore(STORES.lookupStats);
    return all.sort(function (left, right) {
      return String(right.lastLookupAt || "").localeCompare(String(left.lastLookupAt || ""));
    }).slice(0, limit || 20);
  }

  async function getAllFavorites() {
    const all = await getAllFromStore(STORES.favorites);
    return all.sort(function (left, right) {
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
  }

  async function clearLookupStats() {
    await clearStore(STORES.lookupStats);
  }

  async function getDictionaryStatus() {
    return {
      imported: await getMeta("imported") === true,
      disabled: await getMeta("disabled") === true,
      version: await getMeta("dictVersion") || "",
      source: await getMeta("dictSource") || "",
      name: await getMeta("dictName") || "",
      importedAt: await getMeta("importedAt") || "",
      entryCount: await getMeta("entryCount") || await countStore(STORES.entries),
      formCount: await getMeta("formCount") || await countStore(STORES.forms),
      exampleCount: await getMeta("exampleCount") || await countStore(STORES.examples),
      favoriteCount: await countStore(STORES.favorites),
      statsCount: await countStore(STORES.lookupStats)
    };
  }

  root.db = {
    STORES,
    openDB,
    getFromStore,
    getAllFromStore,
    bulkPut,
    getMeta,
    setMeta,
    getSetting,
    setSetting,
    getSettings,
    ensureDictionaryImported,
    importPackagedDictionary,
    importCustomDictionary,
    clearDictionary,
    getDictionaryStatus,
    getExamples,
    getFavorite,
    toggleFavorite,
    recordLookup,
    getLookupStats,
    getTopStats,
    getRecentStats,
    getAllFavorites,
    clearLookupStats
  };
})();
