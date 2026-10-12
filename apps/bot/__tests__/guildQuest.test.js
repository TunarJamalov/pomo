const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_guild_quest_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getCurrentGuildQuests,
    recordGuildQuestProgress,
    claimGuildQuestReward,
    getOrCreateUser,
} = require('../utils/database');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
        if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
        if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM guild_quest_claims;
        DELETE FROM guild_quest_contributions;
        DELETE FROM guild_quests;
        DELETE FROM guild_settings;
        DELETE FROM users;
    `);
});

describe('weekly guild quests', () => {
    test('creates the weekly quest set and records progress idempotently', () => {
        const quests = getCurrentGuildQuests('guild_quests_1');
        expect(quests.map(quest => quest.quest_key)).toEqual([
            'focus_minutes',
            'sessions',
            'contributors',
        ]);

        const first = recordGuildQuestProgress({
            guildId: 'guild_quests_1',
            userId: 'user_1',
            minutes: 25,
            sourceType: 'solo',
            sourceId: 'session_1',
        });
        const duplicate = recordGuildQuestProgress({
            guildId: 'guild_quests_1',
            userId: 'user_1',
            minutes: 25,
            sourceType: 'solo',
            sourceId: 'session_1',
        });

        expect(first.recorded).toBe(true);
        expect(duplicate.recorded).toBe(false);
        expect(getCurrentGuildQuests('guild_quests_1').map(quest => ({
            key: quest.quest_key,
            progress: quest.progress,
        }))).toEqual([
            { key: 'focus_minutes', progress: 25 },
            { key: 'sessions', progress: 1 },
            { key: 'contributors', progress: 1 },
        ]);
    });

    test('completes contributors quest and prevents duplicate claims', () => {
        for (let index = 1; index <= 5; index += 1) {
            recordGuildQuestProgress({
                guildId: 'guild_quests_2',
                userId: `user_${index}`,
                minutes: 25,
                sourceType: 'solo',
                sourceId: `session_${index}`,
            });
        }

        const quests = getCurrentGuildQuests('guild_quests_2');
        const contributorsQuest = quests.find(quest => quest.quest_key === 'contributors');
        expect(contributorsQuest.status).toBe('completed');
        expect(contributorsQuest.progress).toBe(5);

        const claim = claimGuildQuestReward('guild_quests_2', 'user_1', 'contributors');
        expect(claim.success).toBe(true);
        expect(claim.water).toBe(10);
        expect(claim.xp).toBe(50);
        expect(getOrCreateUser('user_1').water).toBe(10);

        const duplicate = claimGuildQuestReward('guild_quests_2', 'user_1', 'contributors');
        expect(duplicate).toEqual({ success: false, reason: 'claimed' });
    });
});
