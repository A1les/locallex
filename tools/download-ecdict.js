#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const ROOT_DIR = path.resolve(__dirname, "..");
const VENDOR_DIR = path.join(ROOT_DIR, "vendor");
const CSV_PATH = path.join(VENDOR_DIR, "ecdict.csv");
const DEFAULT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const SOURCE_URL = process.env.ECDICT_URL || DEFAULT_URL;

async function download() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  console.log("[download-ecdict] source:", SOURCE_URL);
  console.log("[download-ecdict] target:", CSV_PATH);

  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "offline-ec-dict-builder"
    }
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to download ECDICT CSV: HTTP " + response.status);
  }

  const tempPath = CSV_PATH + ".tmp";
  await pipeline(response.body, fs.createWriteStream(tempPath));

  const stat = fs.statSync(tempPath);
  if (stat.size < 1024 * 1024) {
    fs.rmSync(tempPath, { force: true });
    throw new Error("Downloaded file is unexpectedly small: " + stat.size + " bytes");
  }

  fs.renameSync(tempPath, CSV_PATH);
  console.log("[download-ecdict] downloaded bytes:", stat.size);
}

download().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
