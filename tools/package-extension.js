const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const ROOT_DIR = path.resolve(__dirname, "..");
const manifest = readJson(path.join(ROOT_DIR, "manifest.json"));
const version = manifest.version;
const distDir = path.join(ROOT_DIR, "dist");
const zipPath = path.join(distDir, `locallex-${version}.zip`);

const includePaths = [
  "manifest.json",
  "README.md",
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md",
  "assets",
  "data",
  "src"
];

async function main() {
  await fs.promises.mkdir(distDir, { recursive: true });

  if (fs.existsSync(zipPath)) {
    await fs.promises.unlink(zipPath);
  }

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }
  });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  for (const relativePath of includePaths) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing package input: ${relativePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      archive.directory(absolutePath, relativePath);
    } else {
      archive.file(absolutePath, { name: relativePath });
    }
  }

  await archive.finalize();
  await done;

  const sizeMb = fs.statSync(zipPath).size / 1024 / 1024;
  console.log(`Created ${path.relative(ROOT_DIR, zipPath)} (${sizeMb.toFixed(2)} MB)`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

