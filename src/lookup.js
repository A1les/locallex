(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const MAX_CACHE_SIZE = 800;
  const entryCache = new Map();
  let activeCacheVersion = "";

  function setCache(key, value) {
    if (entryCache.has(key)) {
      entryCache.delete(key);
    }

    if (entryCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = entryCache.keys().next().value;
      entryCache.delete(oldestKey);
    }

    entryCache.set(key, value);
  }

  async function lookupWord(rawQuery, source) {
    const normalize = root.normalize;
    const db = root.db;
    const normalized = normalize.normalizeQuery(rawQuery);

    if (!normalize.isValidEnglishQuery(normalized)) {
      return buildResult(rawQuery, normalized, null, "invalid", null, [], null);
    }

    const dictionaryStatus = await db.ensureDictionaryImported();
    const cacheVersion = getCacheVersion(dictionaryStatus);
    if (cacheVersion !== activeCacheVersion) {
      entryCache.clear();
      activeCacheVersion = cacheVersion;
    }

    const lookupMatch = await findEntry(normalized, cacheVersion);
    const displayKey = lookupMatch.entry ? lookupMatch.entry.word : normalized;
    const settings = await db.getSettings();
    const examples = lookupMatch.entry && settings.exampleEnabled ? await db.getExamples(displayKey) : [];
    const favorite = lookupMatch.entry ? await db.getFavorite(displayKey) : null;
    const stats = await db.recordLookup(normalized, source || "unknown");

    return buildResult(rawQuery, normalized, lookupMatch.entry, lookupMatch.matchedBy, stats, examples, favorite);
  }

  function getCacheVersion(status) {
    if (!status) {
      return "unknown";
    }

    return [status.source || "packaged", status.version || "", status.imported ? "imported" : "pending"].join(":");
  }

  async function findEntry(normalized, cacheVersion) {
    const db = root.db;
    const cacheKey = cacheVersion + "\n" + normalized;

    if (entryCache.has(cacheKey)) {
      return entryCache.get(cacheKey);
    }

    const directEntry = await db.getFromStore("entries", normalized);
    if (directEntry) {
      const match = {
        entry: directEntry,
        matchedBy: normalized.includes(" ") ? "phrase" : "exact"
      };
      setCache(cacheKey, match);
      return match;
    }

    if (!normalized.includes(" ")) {
      const form = await db.getFromStore("forms", normalized);
      if (form && form.base) {
        const baseEntry = await db.getFromStore("entries", form.base);
        if (baseEntry) {
          const match = { entry: baseEntry, matchedBy: "form" };
          setCache(cacheKey, match);
          return match;
        }
      }

      const candidates = root.normalize.simpleLemmatize(normalized);
      for (const candidate of candidates) {
        const candidateEntry = await db.getFromStore("entries", candidate);
        if (candidateEntry) {
          const match = { entry: candidateEntry, matchedBy: "lemma" };
          setCache(cacheKey, match);
          return match;
        }
      }
    }

    const match = { entry: null, matchedBy: "not_found" };
    setCache(cacheKey, match);
    return match;
  }

  function buildResult(rawQuery, normalized, entry, matchedBy, stats, examples, favorite) {
    return {
      query: rawQuery,
      normalized,
      word: entry ? entry.word : normalized,
      entry,
      senses: entry ? normalizeSenses(entry) : [],
      examples: Array.isArray(examples) ? examples : [],
      favorite: Boolean(favorite),
      stats: stats || null,
      matchedBy
    };
  }

  function normalizeSenses(entry) {
    if (Array.isArray(entry.senses) && entry.senses.length > 0) {
      return entry.senses.filter(function (sense) {
        return sense && (sense.translation || sense.definition);
      });
    }

    const lines = parseSenseLines(entry.translation, false);
    const definitions = parseSenseLines(entry.definition, true);

    if (lines.length === 0 && entry.definition) {
      return [{ pos: "", translation: "", definition: String(entry.definition).trim() }];
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

  function clearLookupCache() {
    entryCache.clear();
    activeCacheVersion = "";
  }

  root.lookup = {
    lookupWord,
    clearLookupCache,
    memoryCache: entryCache
  };
})();
