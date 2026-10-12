/** Removes the temporary test databases created by globalSetup.js. */
const fs = require('fs');

module.exports = async () => {
    const dir = process.env.POMOBOT_TEST_DB_DIR;
    if (dir && dir.includes('pomobot-test-')) fs.rmSync(dir, { recursive: true, force: true });
};
