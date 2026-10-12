const fs   = require('fs');
const path = require('path');

const TOKEN_FILE_PATH = path.resolve(__dirname, '../data/boosty_tokens.json');

if (!fs.existsSync(path.dirname(TOKEN_FILE_PATH))) {
  fs.mkdirSync(path.dirname(TOKEN_FILE_PATH), { recursive: true });
}

function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_FILE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[BoostyTokens] Failed to read token file:', err.message);
    return null;
  }
}

function saveTokens(tokenData) {
  const tempPath = TOKEN_FILE_PATH + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(tokenData, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, TOKEN_FILE_PATH);
  } catch (err) {
    console.error('[BoostyTokens] Failed to save token file:', err.message);
    throw err;
  }
}

function isAccessTokenExpired(tokens) {
  if (!tokens?.expires_at) return true;
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  return Date.now() >= (tokens.expires_at - FIVE_MINUTES_MS);
}

module.exports = { loadTokens, saveTokens, isAccessTokenExpired };
