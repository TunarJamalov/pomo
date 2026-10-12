#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const repoRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(process.env.POMODORO_DB_PATH || path.join(repoRoot, 'apps', 'bot', 'data', 'pomodoro.db'));
const backupDir = path.resolve(process.env.POMO_BACKUP_DIR || path.join(repoRoot, 'backups', 'pomodoro'));
const retentionDays = readPositiveInt(process.env.POMO_BACKUP_RETENTION_DAYS, 30);

async function main() {
  const Database = loadBetterSqlite();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `pomodoro-${stamp}`;
  const snapshotPath = path.join(backupDir, `${baseName}.db`);
  const gzPath = `${snapshotPath}.gz`;
  const manifestPath = path.join(backupDir, `${baseName}.json`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(snapshotPath);
  } finally {
    db.close();
  }

  await gzipFile(snapshotPath, gzPath);
  fs.rmSync(snapshotPath, { force: true });

  const sha256 = sha256File(gzPath);
  const manifest = {
    createdAt: new Date().toISOString(),
    source: dbPath,
    backup: gzPath,
    bytes: fs.statSync(gzPath).size,
    sha256,
    retentionDays
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(`${gzPath}.sha256`, `${sha256}  ${path.basename(gzPath)}\n`);

  pruneOldBackups();

  console.log(`Backup created: ${gzPath}`);
  console.log(`SHA256: ${sha256}`);
}

function loadBetterSqlite() {
  const localModule = path.join(repoRoot, 'apps', 'bot', 'node_modules', 'better-sqlite3');
  try {
    return require(localModule);
  } catch (_) {
    return require('better-sqlite3');
  }
}

function gzipFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    input.pipe(zlib.createGzip({ level: 9 })).pipe(output);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function pruneOldBackups() {
  if (retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(backupDir)) {
    const fullPath = path.join(backupDir, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;
    if (/\.(db\.gz|db\.gz\.sha256|json)$/.test(entry)) {
      fs.rmSync(fullPath, { force: true });
    }
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

main().catch(error => {
  console.error(`[backup] ${error.message}`);
  process.exitCode = 1;
});
