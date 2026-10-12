/**
 * Runs before each test file: unless the file picks its own database, point
 * the bot at a private copy of the schema-only template from globalSetup.js.
 */
const fs = require('fs');
const path = require('path');

const template = process.env.POMOBOT_TEST_DB_TEMPLATE;
if (!process.env.POMODORO_DB_PATH && template && fs.existsSync(template)) {
    const file = path.join(
        process.env.POMOBOT_TEST_DB_DIR || path.dirname(template),
        `worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
    );
    fs.copyFileSync(template, file);
    process.env.POMODORO_DB_PATH = file;
}
