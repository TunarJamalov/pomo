const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_pro_profile_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateProProfileSettings,
    updateProProfileSettings,
} = require('../utils/database');
const {
    ProProfileAccents,
    ProProfileBadges,
} = require('../utils/constants');
const { getContrastColor } = require('../commands/profile');
const proProfileCommand = require('../commands/proprofile');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM pro_profile_settings; DELETE FROM users;');
});

describe('Pomo Pro profile customization', () => {
    test('creates default profile settings and persists updates', () => {
        const initial = getOrCreateProProfileSettings('profile_user');
        const updated = updateProProfileSettings('profile_user', {
            accentKey: 'coral',
            badgeKey: 'deep_work',
        });

        expect(initial.accent_key).toBe('gold');
        expect(initial.badge_key).toBe('pomo_pro');
        expect(updated.accent_key).toBe('coral');
        expect(updated.badge_key).toBe('deep_work');
    });

    test('publishes only valid Discord choice counts', () => {
        const json = proProfileCommand.data.toJSON();
        const accent = json.options.find(option => option.name === 'accent');
        const badge = json.options.find(option => option.name === 'badge');

        expect(accent.options[0].choices).toHaveLength(Object.keys(ProProfileAccents).length);
        expect(badge.options[0].choices).toHaveLength(Object.keys(ProProfileBadges).length);
    });

    test('chooses readable text for light and dark accents', () => {
        expect(getContrastColor('#F1C40F')).toBe('#1A1A1A');
        expect(getContrastColor('#5865F2')).toBe('#FFFFFF');
    });

    test('rejects profile values outside the allowlist', () => {
        expect(() => updateProProfileSettings('profile_user', {
            accentKey: 'not-a-color',
        })).toThrow('Invalid Pro profile accent');
    });
});
