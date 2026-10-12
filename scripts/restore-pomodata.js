#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const repoRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(process.env.POMODORO_DB_PATH || path.join(repoRoot, 'apps', 'bot', 'data', 'pomodoro.db'));
const backupFile = process.argv[2] ? path.resolve(process.argv[2]) : null;

async function main() {
  if (!backupFile) {
    throw new Error('Usage: node scripts/restore-pomodata.js <backup.db.gz>');
  }
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`);
  }

  if (!fs.existsSync(dbPath) && !process.argv.includes('--force')) {
    throw new Error(`Target database not found: ${dbPath}\n`
      + 'Set POMODORO_DB_PATH to the live database, or pass --force to restore into a new location.');
  }

  const dataDir = path.dirname(dbPath);
  fs.mkdirSync(dataDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyCopy = path.join(dataDir, `pomodoro.before-restore-${stamp}.db`);
  const tempRestore = path.join(dataDir, `pomodoro.restore-${stamp}.db`);

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, safetyCopy);
    console.log(`Current database copied to: ${safetyCopy}`);
  }

  await gunzipFile(backupFile, tempRestore);

  fs.renameSync(tempRestore, dbPath);
  removeWalFiles(dbPath);

  console.log(`Database restored to: ${dbPath}`);
  console.log('Important: restart pomobot and pomofocus-web after restore.');
}

function gunzipFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    input.pipe(zlib.createGunzip()).pipe(output);
  });
}

function removeWalFiles(databasePath) {
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch(error => {
  console.error(`[restore] ${error.message}`);
  process.exitCode = 1;
});
