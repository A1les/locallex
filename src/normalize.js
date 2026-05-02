(function () {
  "use strict";

  const root = globalThis.__offlineEcDict = globalThis.__offlineEcDict || {};
  const WORD_PATTERN = "[a-zA-Z][a-zA-Z'-]{0,40}";
  const SINGLE_WORD_RE = new RegExp("^" + WORD_PATTERN + "$");
  const QUERY_RE = new RegExp("^" + WORD_PATTERN + "( " + WORD_PATTERN + "){0,4}$");
  const IRREGULAR_LEMMAS = new Map([
    ["am", "be"],
    ["are", "be"],
    ["is", "be"],
    ["was", "be"],
    ["were", "be"],
    ["been", "be"],
    ["being", "be"],
    ["has", "have"],
    ["had", "have"],
    ["does", "do"],
    ["did", "do"],
    ["done", "do"],
    ["went", "go"],
    ["gone", "go"],
    ["better", "good"],
    ["best", "good"],
    ["worse", "bad"],
    ["worst", "bad"],
    ["came", "come"],
    ["taken", "take"],
    ["took", "take"],
    ["given", "give"],
    ["gave", "give"],
    ["seen", "see"],
    ["saw", "see"],
    ["made", "make"],
    ["ran", "run"],
    ["bought", "buy"],
    ["brought", "bring"],
    ["thought", "think"],
    ["taught", "teach"],
    ["found", "find"],
    ["left", "leave"],
    ["felt", "feel"],
    ["kept", "keep"],
    ["told", "tell"],
    ["said", "say"],
    ["paid", "pay"],
    ["children", "child"],
    ["men", "man"],
    ["women", "woman"],
    ["people", "person"],
    ["mice", "mouse"],
    ["geese", "goose"],
    ["feet", "foot"],
    ["teeth", "tooth"]
  ]);

  function normalizeWord(input) {
    return normalizeQuery(input);
  }

  function normalizeQuery(input) {
    if (typeof input !== "string") {
      return "";
    }

    return input
      .trim()
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
  }

  function isValidEnglishWord(text) {
    return isValidEnglishQuery(text);
  }

  function isValidSingleEnglishWord(text) {
    if (typeof text !== "string") {
      return false;
    }

    const word = normalizeQuery(text);
    return Boolean(word) && word.length <= 48 && SINGLE_WORD_RE.test(word);
  }

  function isValidEnglishQuery(text) {
    if (typeof text !== "string") {
      return false;
    }

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 96) {
      return false;
    }

    if (/^(https?:\/\/|www\.)/i.test(trimmed)) {
      return false;
    }

    const query = normalizeQuery(trimmed);
    return QUERY_RE.test(query);
  }

  function isPhraseQuery(text) {
    const query = normalizeQuery(text);
    return isValidEnglishQuery(query) && query.includes(" ");
  }

  function getQueryTokenCount(text) {
    const query = normalizeQuery(text);
    if (!query) {
      return 0;
    }

    return query.split(" ").filter(Boolean).length;
  }

  function simpleLemmatize(input) {
    const word = normalizeQuery(input);
    const candidates = new Set();

    if (!word || word.includes(" ")) {
      return [];
    }

    addCandidate(candidates, IRREGULAR_LEMMAS.get(word));

    if (word.endsWith("ies") && word.length > 4) {
      candidates.add(word.slice(0, -3) + "y");
      candidates.add(word.slice(0, -1));
    }

    if (word.endsWith("ied") && word.length > 4) {
      candidates.add(word.slice(0, -3) + "y");
      candidates.add(word.slice(0, -1));
    }

    if (word.endsWith("ing") && word.length > 5) {
      const stem = word.slice(0, -3);
      candidates.add(stem);

      if (word.endsWith("ying") && word.length > 5) {
        candidates.add(word.slice(0, -4) + "ie");
      }

      if (stem.endsWith("y")) {
        candidates.add(stem.slice(0, -1) + "ie");
      } else if (hasDoubleEnding(stem)) {
        const dropped = stem.slice(0, -1);
        candidates.add(dropped);
        candidates.add(dropped + "e");
      } else {
        candidates.add(stem + "e");
      }
    }

    if (word.endsWith("ed") && word.length > 4) {
      const stem = word.slice(0, -2);
      candidates.add(stem);

      if (hasDoubleEnding(stem)) {
        candidates.add(stem.slice(0, -1));
      }

      if (stem.endsWith("i")) {
        candidates.add(stem.slice(0, -1) + "y");
      }

      candidates.add(stem + "e");
    }

    if (word.endsWith("iest") && word.length > 5) {
      candidates.add(word.slice(0, -4) + "y");
    } else if (word.endsWith("ier") && word.length > 4) {
      candidates.add(word.slice(0, -3) + "y");
    }

    if (word.endsWith("est") && word.length > 5) {
      addSuffixStemCandidates(candidates, word.slice(0, -3));
    } else if (word.endsWith("er") && word.length > 4) {
      addSuffixStemCandidates(candidates, word.slice(0, -2));
    }

    if (word.endsWith("ves") && word.length > 4) {
      const stem = word.slice(0, -3);
      candidates.add(stem + "f");
      candidates.add(stem + "fe");
    }

    if (word.endsWith("es") && word.length > 3) {
      candidates.add(word.slice(0, -2));
      candidates.add(word.slice(0, -1));
    } else if (word.endsWith("s") && word.length > 2 && !word.endsWith("ss")) {
      candidates.add(word.slice(0, -1));
    }

    candidates.delete(word);
    return Array.from(candidates).filter(isValidSingleEnglishWord);
  }

  function addCandidate(candidates, value) {
    if (value) {
      candidates.add(value);
    }
  }

  function addSuffixStemCandidates(candidates, stem) {
    if (!stem) {
      return;
    }

    candidates.add(stem);

    if (hasDoubleEnding(stem)) {
      candidates.add(stem.slice(0, -1));
      return;
    }

    if (!stem.endsWith("e")) {
      candidates.add(stem + "e");
    }
  }

  function hasDoubleEnding(word) {
    if (word.length < 2) {
      return false;
    }

    return word[word.length - 1] === word[word.length - 2];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  root.normalize = {
    normalizeWord,
    normalizeQuery,
    isValidEnglishWord,
    isValidSingleEnglishWord,
    isValidEnglishQuery,
    isPhraseQuery,
    getQueryTokenCount,
    simpleLemmatize,
    escapeHtml
  };
})();
