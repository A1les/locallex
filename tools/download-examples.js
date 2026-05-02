#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const ROOT_DIR = path.resolve(__dirname, "..");
const TATOEBA_DIR = path.join(ROOT_DIR, "vendor", "tatoeba");
const BASE_URL = process.env.TATOEBA_BASE_URL || "https://downloads.tatoeba.org/exports/per_language";
const FILES = [
  {
    url: process.env.TATOEBA_ENG_URL || BASE_URL + "/eng/eng_sentences.tsv.bz2",
    name: "eng_sentences.tsv.bz2"
  },
  {
    url: process.env.TATOEBA_CMN_URL || BASE_URL + "/cmn/cmn_sentences.tsv.bz2",
    name: "cmn_sentences.tsv.bz2"
  },
  {
    url: process.env.TATOEBA_LINKS_URL || BASE_URL + "/eng/eng-cmn_links.tsv.bz2",
    name: "eng-cmn_links.tsv.bz2"
  }
];

async function downloadFile(item) {
  const targetPath = path.join(TATOEBA_DIR, item.name);
  const tempPath = targetPath + ".tmp";

  console.log("[download-examples] source:", item.url);
  console.log("[download-examples] target:", targetPath);

  const response = await fetch(item.url, {
    headers: {
      "user-agent": "locallex-example-builder"
    }
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to download " + item.name + ": HTTP " + response.status);
  }

  await pipeline(response.body, fs.createWriteStream(tempPath));

  const stat = fs.statSync(tempPath);
  if (stat.size < 128) {
    fs.rmSync(tempPath, { force: true });
    throw new Error("Downloaded file is unexpectedly small: " + item.name + " (" + stat.size + " bytes)");
  }

  fs.renameSync(tempPath, targetPath);
  console.log("[download-examples] downloaded bytes:", stat.size);
}

async function download() {
  fs.mkdirSync(TATOEBA_DIR, { recursive: true });

  for (const item of FILES) {
    await downloadFile(item);
  }
}

download().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
