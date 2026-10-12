const path = require('path');
const os = require('os');
const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_debug_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    initDatabase,
    getOrCreateUser,
    sendFriendRequest,
} = require('./utils/database');

const db = require('better-sqlite3')(TEST_DB_PATH);

initDatabase();

console.log('Inserting user_a and user_b...');
getOrCreateUser('user_a');
getOrCreateUser('user_b');
console.log('Users:', db.prepare('SELECT * FROM users').all());

console.log('Sending friend request...');
const res = sendFriendRequest('user_a', 'user_b');
console.log('Result:', res);

console.log('Inserting user_a...');
getOrCreateUser('user_a');
console.log('Users:', db.prepare('SELECT * FROM users').all());
