const { PermissionFlagsBits } = require('discord.js');
const { isLongBreakAfter, breakMinutesAfter, LONG_BREAK_EVERY } = require('../utils/pomodoroCycles');

jest.mock('../utils/audioPlayer', () => ({
    playChime: jest.fn(() => Promise.resolve('played')),
}));

const { playChime } = require('../utils/audioPlayer');
const { findChimeChannel, ringPhaseChime, CHIME_FILE } = require('../utils/phaseChime');

describe('pomodoro long break', () => {
    test('the break after every 4th cycle is the long one', () => {
        expect(LONG_BREAK_EVERY).toBe(4);
        const pom = { break: 5, longBreak: 15 };
        expect([1, 2, 3, 4, 5, 8].map(cycle => breakMinutesAfter({ ...pom, cycle }))).toEqual([5, 5, 5, 15, 5, 15]);
    });

    test('without long_break every break stays short', () => {
        expect(isLongBreakAfter({ cycle: 4, break: 5, longBreak: null })).toBe(false);
        expect(breakMinutesAfter({ cycle: 4, break: 5 })).toBe(5);
    });
});

describe('phase chime', () => {
    const SPEAK = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];

    function channel(id, canSpeak) {
        return { id, permissionsFor: () => ({ has: perms => canSpeak && SPEAK.every(p => perms.includes(p)) }) };
    }

    function guild(voice) {
        return {
            members: { me: { id: 'bot' } },
            voiceStates: { cache: new Map(Object.entries(voice).map(([userId, ch]) => [userId, { channel: ch }])) },
        };
    }

    beforeEach(() => jest.clearAllMocks());

    test('rings in the first listed user\'s voice channel where Pomo can speak', () => {
        const g = guild({ host: channel('muted', false), member: channel('room', true) });
        expect(findChimeChannel(g, ['nobody', 'host', 'member']).id).toBe('room');
    });

    test('nobody in voice → no channel', () => {
        expect(findChimeChannel(guild({}), ['host'])).toBeNull();
    });

    test('ringPhaseChime plays the chime file in that channel', () => {
        const g = guild({ host: channel('room', true) });
        const client = { guilds: { cache: new Map([['g1', g]]) } };
        expect(ringPhaseChime(client, 'g1', ['host'])).toBe(true);
        expect(playChime).toHaveBeenCalledWith(g, 'room', CHIME_FILE);
    });

    test('DM timers and unknown guilds never ring', () => {
        const client = { guilds: { cache: new Map() } };
        expect(ringPhaseChime(client, null, ['host'])).toBe(false);
        expect(ringPhaseChime(client, 'g1', ['host'])).toBe(false);
        expect(playChime).not.toHaveBeenCalled();
    });
});
