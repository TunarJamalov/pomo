const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_card_themes_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const { db, initDatabase, getOrCreateProProfileSettings, setCardTheme } = require('../utils/database');
const { SessionCardThemes } = require('../utils/constants');
const { generateSessionEndCard } = require('../utils/canvas');
const proProfileCommand = require('../commands/proprofile');

beforeAll(() => initDatabase());
afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

const card = theme => generateSessionEndCard({
    username: 'Pomo', avatar: null, duration: 25, waterAwarded: 2, xpAwarded: 30,
    streak: 3, title: 'Math', leveledUp: false, language: 'en', theme,
});

test('everyone starts on classic, and a saved theme sticks', () => {
    expect(getOrCreateProProfileSettings('theme_user').card_theme).toBe('classic');
    expect(setCardTheme('theme_user', 'ocean').card_theme).toBe('ocean');
    expect(() => setCardTheme('theme_user', 'neon')).toThrow(RangeError);
    expect(getOrCreateProProfileSettings('theme_user').card_theme).toBe('ocean');
});

test('each theme draws a different card, and an unknown theme falls back to classic', async () => {
    const classic = await card('classic');
    const images = await Promise.all(Object.keys(SessionCardThemes).map(card));
    expect(new Set(images.map(b => b.toString('base64'))).size).toBe(Object.keys(SessionCardThemes).length);
    expect((await card('neon')).equals(classic)).toBe(true);
    expect((await card(undefined)).equals(classic)).toBe(true);
});

test('/proprofile offers every theme as a choice', () => {
    const sub = proProfileCommand.data.toJSON().options.find(o => o.name === 'cardtheme');
    expect(sub.options[0].choices.map(c => c.value)).toEqual(Object.keys(SessionCardThemes));
});
