/**
 * Runs once before all test files: builds an empty database with the bot's
 * real schema. Each test file then gets its own copy (see isolateDb.js), so no
 * test ever opens the developer's apps/bot/data/pomodoro.db.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomobot-test-'));
    const template = path.join(dir, 'template.db');

    const previous = process.env.POMODORO_DB_PATH;
    process.env.POMODORO_DB_PATH = template;
    const { initDatabase, db } = require('../utils/database');
    initDatabase();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    if (previous === undefined) delete process.env.POMODORO_DB_PATH;
    else process.env.POMODORO_DB_PATH = previous;

    process.env.POMOBOT_TEST_DB_TEMPLATE = template;
    process.env.POMOBOT_TEST_DB_DIR = dir;
};
