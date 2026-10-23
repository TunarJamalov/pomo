const { initDatabase, db, getRetentionAnalytics } = require('../utils/database');

beforeAll(() => {
    initDatabase();
    db.pragma('foreign_keys = OFF');
    db.exec('DELETE FROM command_usage; DELETE FROM activity_rewards; DELETE FROM users;');

    const user = db.prepare("INSERT INTO users (discord_id, created_at) VALUES (?, datetime('now', '-40 days'))");
    const command = db.prepare("INSERT INTO command_usage (user_id, command_name, used_at) VALUES (?, 'study', datetime('now', ?))");
    const reward = db.prepare("INSERT INTO activity_rewards (user_id, source_type, minutes, created_at) VALUES (?, 'voice', 30, datetime('now', ?))");

    // Active on day 1, back after 1, 7 and 30 days
    user.run('ret_active_stays');
    command.run('ret_active_stays', '-40 days');
    command.run('ret_active_stays', '-9 days');
    // Did nothing on day 1 (e.g. an Activity visit), one command two days later
    user.run('ret_passive');
    command.run('ret_passive', '-38 days');
    // Active on day 1 (a voice session), never came back
    user.run('ret_active_leaves');
    reward.run('ret_active_leaves', '-40 days');
    db.pragma('foreign_keys = ON');
});

describe('/botstats retention', () => {
    test('counts every new user row, as before', () => {
        const r = getRetentionAnalytics();
        expect([r.d1_returned, r.d1_cohort]).toEqual([2, 3]);
        expect([r.d30_returned, r.d30_cohort]).toEqual([1, 3]);
    });

    test('also counts only the people who did something on day 1', () => {
        const r = getRetentionAnalytics();
        expect([r.active_d1_returned, r.active_d1_cohort]).toEqual([1, 2]);
        expect([r.active_d7_returned, r.active_d7_cohort]).toEqual([1, 2]);
        expect([r.active_d30_returned, r.active_d30_cohort]).toEqual([1, 2]);
    });
});
