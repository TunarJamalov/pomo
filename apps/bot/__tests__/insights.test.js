const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { getInsights, buildInsightsEmbed } = require('../utils/insights');

const USER = '310000000000000001';
// A fixed "now": Wednesday 2026-10-14
const NOW = new Date(Date.UTC(2026, 9, 14, 12));

function session(startedAt, minutes = 25) {
    db.prepare("INSERT INTO study_sessions (user_id, guild_id, duration, title, started_at, completed) VALUES (?, 'g', ?, 'Focus', ?, 1)")
        .run(USER, minutes, startedAt);
}

beforeAll(() => initDatabase());
beforeEach(() => {
    db.prepare("DELETE FROM study_sessions WHERE user_id = ?").run(USER);
    getOrCreateUser(USER);
});

test('best hour, weekdays, consistency and trend over the last 7 days', () => {
    // This week (Thu 10-08 .. Wed 10-14): Mon, Tue and Wed, mostly at 19:00 UTC
    session('2026-10-12 19:00:00', 50);
    session('2026-10-13 19:00:00', 50);
    session('2026-10-14 19:00:00', 50);
    session('2026-10-14 08:00:00', 25);
    session('2026-10-09 08:00:00', 25);
    // The week before: 60 minutes
    session('2026-10-03 10:00:00', 60);

    const insights = getInsights(USER, 7, NOW);
    expect(insights).toMatchObject({
        sessions: 5,
        totalMinutes: 200,
        previousMinutes: 60,
        avgSession: 40,
        bestHour: { hour: 19, share: 75 },
        activeDays: 4,
        longestRun: 3,
        longestGap: 2,
    });
    // Monday = 0
    expect(insights.weekdays[2].avgMinutes).toBe(75);
    expect(insights.weekdays[5].avgMinutes).toBe(0);

    const text = buildInsightsEmbed('en', insights, NOW).toJSON().description;
    expect(text).toContain(`<t:${Date.UTC(2026, 9, 14, 19) / 1000}:t>`);
    expect(text).toContain('+233%');
    expect(text).toContain('Strongest: **Wednesday**');
});

test('no best hour under 5 sessions, and a friendly message with no sessions', () => {
    session('2026-10-13 19:00:00');
    expect(getInsights(USER, 7, NOW).bestHour).toBeNull();

    db.prepare("DELETE FROM study_sessions WHERE user_id = ?").run(USER);
    const embed = buildInsightsEmbed('az', getInsights(USER, 30, NOW), NOW).toJSON();
    expect(embed.description).toContain('/pomodoro');
});
