#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CSV_PATH = path.join(ROOT_DIR, "vendor", "ecdict.csv");
const CHUNK_SIZE = 10000;
const EXCHANGE_CODES = new Set(["p", "d", "i", "3", "r", "t", "s"]);
const WORD_PATTERN = "[a-zA-Z][a-zA-Z'-]{0,40}";
const SINGLE_WORD_RE = new RegExp("^" + WORD_PATTERN + "$");
const TERM_RE = new RegExp("^" + WORD_PATTERN + "( " + WORD_PATTERN + "){0,4}$");
const POS_ALIASES = new Map([
  ["a", "adj."],
  ["adj", "adj."],
  ["adjective", "adj."],
  ["ad", "adv."],
  ["adv", "adv."],
  ["adverb", "adv."],
  ["n", "n."],
  ["noun", "n."],
  ["v", "v."],
  ["vi", "vi."],
  ["vt", "vt."],
  ["verb", "v."],
  ["prep", "prep."],
  ["pron", "pron."],
  ["conj", "conj."],
  ["interj", "interj."],
  ["num", "num."],
  ["art", "art."],
  ["modal", "modal."],
  ["suf", "suf."],
  ["pref", "pref."],
  ["abbr", "abbr."]
]);

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

function isValidTerm(text) {
  const term = normalizeTerm(text);
  return Boolean(term) && term.length <= 96 && TERM_RE.test(term);
}

function isValidSingleWord(text) {
  const word = normalizeTerm(text);
  return Boolean(word) && word.length <= 48 && SINGLE_WORD_RE.test(word);
}

function readCsvRows(csvText) {
  try {
    const parse = require("csv-parse/sync").parse;
    return parse(csvText, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true
    });
  } catch (error) {
    console.warn("[build-dict] csv-parse is not installed; using the built-in CSV parser.");
    return parseCsvFallback(csvText);
  }
}

function parseCsvFallback(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  function endField() {
    row.push(field);
    field = "";
  }

  function endRow() {
    endField();
    if (row.some(function (value) { return value !== ""; })) {
      rows.push(row);
    }
    row = [];
  }

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    endRow();
  }

  const headers = rows.shift();
  if (!headers) {
    return [];
  }

  return rows.map(function (values) {
    const item = {};

    headers.forEach(function (header, index) {
      item[header.trim()] = values[index] || "";
    });

    return item;
  });
}

function parseExchange(exchange, baseWord) {
  if (!exchange || typeof exchange !== "string" || baseWord.includes(" ")) {
    return [];
  }

  const forms = [];
  const segments = exchange.split("/");

  for (const segment of segments) {
    const separatorIndex = segment.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const code = segment.slice(0, separatorIndex).trim();
    const values = segment.slice(separatorIndex + 1).trim();

    if (!EXCHANGE_CODES.has(code) || !values) {
      continue;
    }

    for (const rawForm of values.split(/[,\s]+/)) {
      const form = normalizeTerm(rawForm);

      if (!form || form === baseWord || !isValidSingleWord(form)) {
        continue;
      }

      forms.push({
        form,
        base: baseWord
      });
    }
  }

  return forms;
}

function cleanGeneratedData(includeExamples) {
  if (!fs.existsSync(DATA_DIR)) {
    return;
  }

  for (const name of fs.readdirSync(DATA_DIR)) {
    if (/^entries_\d+\.json$/.test(name) || name === "forms.json" || name === "meta.json" || (includeExamples && /^examples_\d+\.json$/.test(name))) {
      fs.rmSync(path.join(DATA_DIR, name));
    }
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value) + "\n", "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTextValue(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function normalizePos(rawPos) {
  const clean = String(rawPos || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();

  return POS_ALIASES.get(clean) || (clean ? clean + "." : "");
}

function splitSenseLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([a-zA-Z]+)\.\s*(.+)$/);
  if (!match) {
    return {
      pos: "",
      text: trimmed
    };
  }

  return {
    pos: normalizePos(match[1]),
    text: match[2].trim()
  };
}

function parseSenseLines(value, mergeContinuations) {
  const lines = normalizeTextValue(value)
    .split(/\n+/)
    .map(splitSenseLine)
    .filter(Boolean);

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

function buildSenses(translation, definition) {
  const translationLines = parseSenseLines(translation, false);
  const definitionLines = parseSenseLines(definition, true);
  const senses = [];

  for (const line of translationLines) {
    const samePosDefinitionIndex = definitionLines.findIndex(function (item) {
      return item.pos && item.pos === line.pos;
    });
    const definitionItem = samePosDefinitionIndex >= 0
      ? definitionLines.splice(samePosDefinitionIndex, 1)[0]
      : null;

    senses.push({
      pos: line.pos,
      translation: line.text,
      definition: definitionItem ? definitionItem.text : ""
    });
  }

  for (const line of definitionLines.slice(0, 8)) {
    senses.push({
      pos: line.pos,
      translation: "",
      definition: line.text
    });
  }

  return senses.filter(function (sense) {
    return sense.translation || sense.definition;
  }).slice(0, 12);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildDictionary() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error("Missing ECDICT CSV file: " + CSV_PATH);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  cleanGeneratedData(false);

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = readCsvRows(csvText);
  const entriesByWord = new Map();
  const formsByForm = new Map();

  for (const row of rows) {
    const word = normalizeTerm(row.word);

    if (!isValidTerm(word) || entriesByWord.has(word)) {
      continue;
    }

    const translation = normalizeTextValue(row.translation);
    const definition = normalizeTextValue(row.definition);
    const entry = {
      word,
      phonetic: String(row.phonetic || "").trim(),
      translation,
      definition,
      senses: buildSenses(translation, definition),
      pos: String(row.pos || "").trim(),
      tag: String(row.tag || "").trim(),
      collins: toNumber(row.collins),
      oxford: toNumber(row.oxford),
      bnc: toNumber(row.bnc),
      frq: toNumber(row.frq),
      exchange: String(row.exchange || "").trim()
    };

    entriesByWord.set(word, entry);

    for (const form of parseExchange(row.exchange, word)) {
      if (!formsByForm.has(form.form)) {
        formsByForm.set(form.form, form);
      }
    }
  }

  const entries = Array.from(entriesByWord.values())
    .sort(function (left, right) {
      return left.word.localeCompare(right.word);
    });
  const forms = Array.from(formsByForm.values())
    .sort(function (left, right) {
      return left.form.localeCompare(right.form);
    });

  const entryChunks = [];
  for (let start = 0; start < entries.length; start += CHUNK_SIZE) {
    const chunk = entries.slice(start, start + CHUNK_SIZE);
    const filename = "entries_" + entryChunks.length + ".json";
    writeJson(path.join(DATA_DIR, filename), chunk);
    entryChunks.push(filename);
  }

  writeJson(path.join(DATA_DIR, "forms.json"), forms);

  const meta = {
    version: process.env.DICT_VERSION || "locallex-ecdict-v2-" + new Date().toISOString().slice(0, 10),
    entryChunks,
    forms: "forms.json",
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    formCount: forms.length
  };
  const examplePath = path.join(DATA_DIR, "examples_0.json");
  if (fs.existsSync(examplePath)) {
    meta.exampleChunks = ["examples_0.json"];
    meta.exampleCount = readJson(examplePath).length;
  }
  writeJson(path.join(DATA_DIR, "meta.json"), meta);

  console.log("[build-dict] entries:", entries.length);
  console.log("[build-dict] forms:", forms.length);
  console.log("[build-dict] chunks:", entryChunks.length);
}

if (process.argv.includes("--clean")) {
  cleanGeneratedData(true);
  console.log("[build-dict] cleaned generated data.");
} else {
  buildDictionary();
}
