#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const VENDOR_DIR = path.join(ROOT_DIR, "vendor");
const TATOEBA_DIR = path.join(VENDOR_DIR, "tatoeba");
const META_PATH = path.join(DATA_DIR, "meta.json");
const TARGET_COUNT = Number(process.env.EXAMPLE_TARGET || 5000);
const SOURCE_LABEL = "Tatoeba CC BY 2.0 FR";
const WORD_PATTERN = "[a-zA-Z][a-zA-Z'-]{0,40}";
const TERM_RE = new RegExp("^" + WORD_PATTERN + "( " + WORD_PATTERN + "){0,4}$");

const FILES = {
  eng: "eng_sentences.tsv",
  cmn: "cmn_sentences.tsv",
  links: "eng-cmn_links.tsv"
};

function normalizeTerm(input) {
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

function isValidTerm(value) {
  const term = normalizeTerm(value);
  return Boolean(term) && term.length <= 96 && TERM_RE.test(term);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value) + "\n", "utf8");
}

function cleanExamples() {
  if (!fs.existsSync(DATA_DIR)) {
    return;
  }

  for (const name of fs.readdirSync(DATA_DIR)) {
    if (/^examples_\d+\.json$/.test(name)) {
      fs.rmSync(path.join(DATA_DIR, name));
    }
  }
}

function scoreEntry(entry) {
  const collins = Number(entry.collins || 0);
  const oxford = Number(entry.oxford || 0);
  const bnc = Number(entry.bnc || 0);
  const frq = Number(entry.frq || 0);
  const bncScore = bnc > 0 ? Math.max(0, 100000 - bnc) : 0;
  const frqScore = frq > 0 ? Math.max(0, 100000 - frq) : 0;
  const phraseBonus = String(entry.word || "").includes(" ") ? 25000 : 0;

  return (collins * 1000000)
    + (oxford * 500000)
    + (bncScore * 4)
    + (frqScore * 3)
    + phraseBonus
    - String(entry.word || "").length;
}

function loadEntries(meta) {
  const entries = [];

  for (const chunkName of meta.entryChunks || []) {
    const chunkPath = path.join(DATA_DIR, chunkName);
    if (!fs.existsSync(chunkPath)) {
      continue;
    }

    for (const entry of readJson(chunkPath)) {
      if (!entry || !isValidTerm(entry.word) || !entry.translation) {
        continue;
      }

      entries.push(entry);
    }
  }

  return entries;
}

function getInputPath(baseName) {
  const plain = path.join(TATOEBA_DIR, baseName);
  const compressed = plain + ".bz2";

  if (fs.existsSync(plain)) {
    return plain;
  }

  if (fs.existsSync(compressed)) {
    return compressed;
  }

  return "";
}

function createReadStream(filePath) {
  if (!filePath.endsWith(".bz2")) {
    return fs.createReadStream(filePath, { encoding: "utf8" });
  }

  let bunzip;
  try {
    bunzip = require("unbzip2-stream");
  } catch (error) {
    throw new Error("Reading .bz2 files requires dev dependency unbzip2-stream. Run npm install first.");
  }

  return fs.createReadStream(filePath).pipe(bunzip());
}

async function readLines(filePath, onLine) {
  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    await onLine(line);
  }
}

function parseSentenceLine(line) {
  const columns = String(line || "").split("\t");
  if (columns.length < 2) {
    return null;
  }

  return {
    id: columns[0],
    text: columns[columns.length - 1]
  };
}

function parseLinkLine(line) {
  const columns = String(line || "").split("\t");
  if (columns.length < 2) {
    return null;
  }

  return {
    engId: columns[0],
    cmnId: columns[1]
  };
}

function isGoodEnglishSentence(text) {
  const value = String(text || "").trim();
  if (value.length < 12 || value.length > 180) {
    return false;
  }

  if (/https?:\/\/|www\./i.test(value)) {
    return false;
  }

  if (!/[a-zA-Z]/.test(value) || /[\u4e00-\u9fff]/.test(value)) {
    return false;
  }

  const symbols = value.replace(/[a-zA-Z0-9\s'",.?!:;()\-]/g, "");
  return symbols.length / value.length < 0.08;
}

function isGoodChineseSentence(text) {
  const value = String(text || "").trim();
  if (value.length < 4 || value.length > 120) {
    return false;
  }

  if (/https?:\/\/|www\./i.test(value)) {
    return false;
  }

  return /[\u4e00-\u9fff]/.test(value);
}

function tokenize(text) {
  return (String(text || "").match(/[a-zA-Z][a-zA-Z'-]{0,40}/g) || [])
    .map(normalizeTerm)
    .filter(Boolean);
}

function getMatchedTerms(text, targetTerms, maxTermTokens) {
  const tokens = tokenize(text);
  const matches = new Set();

  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = 1; length <= maxTermTokens && start + length <= tokens.length; length += 1) {
      const term = tokens.slice(start, start + length).join(" ");
      if (targetTerms.has(term)) {
        matches.add(term);
      }
    }
  }

  return matches;
}

function sentenceScore(en, term) {
  const length = String(en || "").length;
  const idealLengthPenalty = Math.abs(length - 72);
  const termBonus = term.includes(" ") ? -20 : 0;
  const punctuationPenalty = /[?!]$/.test(en.trim()) ? 5 : 0;

  return idealLengthPenalty + punctuationPenalty + termBonus;
}

function nextVersion(currentVersion) {
  const date = new Date().toISOString().slice(0, 10);
  if (process.env.DICT_VERSION) {
    return process.env.DICT_VERSION;
  }

  const clean = String(currentVersion || "locallex-ecdict").replace(/-examples-\d{4}-\d{2}-\d{2}.*$/, "");
  return clean + "-examples-" + date;
}

async function loadLinks(linkPath) {
  const engToCmn = new Map();
  const cmnIds = new Set();

  await readLines(linkPath, function (line) {
    const link = parseLinkLine(line);
    if (!link || engToCmn.has(link.engId)) {
      return;
    }

    engToCmn.set(link.engId, link.cmnId);
    cmnIds.add(link.cmnId);
  });

  return { engToCmn, cmnIds };
}

async function loadChineseSentences(cmnPath, cmnIds) {
  const cmnById = new Map();

  await readLines(cmnPath, function (line) {
    const sentence = parseSentenceLine(line);
    if (!sentence || !cmnIds.has(sentence.id) || !isGoodChineseSentence(sentence.text)) {
      return;
    }

    cmnById.set(sentence.id, sentence.text.trim());
  });

  return cmnById;
}

async function collectExamples(engPath, engToCmn, cmnById, targetEntries) {
  const targetTerms = new Set(targetEntries.map(function (entry) {
    return entry.word;
  }));
  const rankByTerm = new Map(targetEntries.map(function (entry, index) {
    return [entry.word, index];
  }));
  const maxTermTokens = Math.max.apply(null, targetEntries.map(function (entry) {
    return entry.word.split(" ").length;
  }));
  const examplesByTerm = new Map();

  await readLines(engPath, function (line) {
    const sentence = parseSentenceLine(line);
    if (!sentence || !engToCmn.has(sentence.id) || !isGoodEnglishSentence(sentence.text)) {
      return;
    }

    const zh = cmnById.get(engToCmn.get(sentence.id));
    if (!zh) {
      return;
    }

    const matches = getMatchedTerms(sentence.text, targetTerms, maxTermTokens);
    for (const term of matches) {
      const candidate = {
        key: term,
        score: sentenceScore(sentence.text, term) + (rankByTerm.get(term) || 0) / 100000,
        examples: [{
          en: sentence.text.trim(),
          zh,
          source: SOURCE_LABEL
        }]
      };
      const previous = examplesByTerm.get(term);
      if (!previous || candidate.score < previous.score) {
        examplesByTerm.set(term, candidate);
      }
    }
  });

  return examplesByTerm;
}

async function buildExamples() {
  if (!fs.existsSync(META_PATH)) {
    throw new Error("Missing data/meta.json. Run npm run build:dict first.");
  }

  const meta = readJson(META_PATH);
  const entries = loadEntries(meta)
    .sort(function (left, right) {
      return scoreEntry(right) - scoreEntry(left) || left.word.localeCompare(right.word);
    })
    .slice(0, TARGET_COUNT);

  const paths = {
    eng: getInputPath(FILES.eng),
    cmn: getInputPath(FILES.cmn),
    links: getInputPath(FILES.links)
  };

  let examples = [];
  let source = "Tatoeba CC BY 2.0 FR";

  if (paths.eng && paths.cmn && paths.links) {
    console.log("[build-examples] reading links:", paths.links);
    const links = await loadLinks(paths.links);
    console.log("[build-examples] linked English sentences:", links.engToCmn.size);

    console.log("[build-examples] reading Chinese sentences:", paths.cmn);
    const cmnById = await loadChineseSentences(paths.cmn, links.cmnIds);
    console.log("[build-examples] usable Chinese sentences:", cmnById.size);

    console.log("[build-examples] reading English sentences:", paths.eng);
    const examplesByTerm = await collectExamples(paths.eng, links.engToCmn, cmnById, entries);
    examples = entries.map(function (entry) {
      return examplesByTerm.get(entry.word);
    }).filter(Boolean).map(function (item) {
      return {
        key: item.key,
        examples: item.examples
      };
    });
  } else {
    source = "No Tatoeba source files found";
    console.warn("[build-examples] Tatoeba files are missing; generating an empty examples file.");
    console.warn("[build-examples] Run npm run download:examples, then npm run build:examples.");
  }

  cleanExamples();
  writeJson(path.join(DATA_DIR, "examples_0.json"), examples);

  meta.version = nextVersion(meta.version);
  meta.exampleChunks = ["examples_0.json"];
  meta.exampleCount = examples.length;
  meta.exampleSource = source;
  meta.examplesGeneratedAt = new Date().toISOString();
  writeJson(META_PATH, meta);

  console.log("[build-examples] examples:", examples.length);
  console.log("[build-examples] chunks: 1");
}

if (process.argv.includes("--clean")) {
  cleanExamples();
  console.log("[build-examples] cleaned generated examples.");
} else {
  buildExamples().catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
