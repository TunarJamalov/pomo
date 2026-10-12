/**
 * Tests for utils/constants.js — pure math functions.
 */
const {
    SUPPORT_SERVER_URL,
    xpForLevel,
    waterForMinutes,
    xpForMinutes,
    petBuffMultiplier,
} = require('../utils/constants');

describe('SUPPORT_SERVER_URL', () => {
    test('can be overridden for self-hosted deployments', () => {
        const original = process.env.SUPPORT_SERVER_URL;
        process.env.SUPPORT_SERVER_URL = 'https://discord.gg/custom-support';

        try {
            jest.isolateModules(() => {
                const { SUPPORT_SERVER_URL: configuredUrl } = require('../utils/constants');
                expect(configuredUrl).toBe('https://discord.gg/custom-support');
            });
        } finally {
            if (original === undefined) delete process.env.SUPPORT_SERVER_URL;
            else process.env.SUPPORT_SERVER_URL = original;
        }
    });
});

describe('xpForLevel(level)', () => {
    test('formula: 5*n^2 + 50*n + 100', () => {
        // level 1 => 5*1 + 50*1 + 100 = 155
        expect(xpForLevel(1)).toBe(155);
        // level 2 => 5*4 + 50*2 + 100 = 220
        expect(xpForLevel(2)).toBe(220);
        // level 5 => 5*25 + 50*5 + 100 = 475
        expect(xpForLevel(5)).toBe(475);
        // level 10 => 5*100 + 50*10 + 100 = 1100
        expect(xpForLevel(10)).toBe(1100);
    });

    test('level 0 edge case', () => {
        // level 0 => 5*0 + 50*0 + 100 = 100
        expect(xpForLevel(0)).toBe(100);
    });

    test('returns a number', () => {
        expect(typeof xpForLevel(3)).toBe('number');
    });
});

describe('waterForMinutes(minutes)', () => {
    test('returns 0 for less than 25 minutes', () => {
        expect(waterForMinutes(0)).toBe(0);
        expect(waterForMinutes(24)).toBe(0);
    });

    test('returns 1 for exactly 25 minutes', () => {
        expect(waterForMinutes(25)).toBe(1);
    });

    test('returns 1 for 25-49 minutes', () => {
        expect(waterForMinutes(30)).toBe(1);
        expect(waterForMinutes(49)).toBe(1);
    });

    test('returns 2 for 50-74 minutes', () => {
        expect(waterForMinutes(50)).toBe(2);
        expect(waterForMinutes(74)).toBe(2);
    });

    test('returns 4 for 120 minutes (max session)', () => {
        expect(waterForMinutes(120)).toBe(4);
    });
});

describe('xpForMinutes(minutes)', () => {
    test('returns 0 for less than 25 minutes', () => {
        expect(xpForMinutes(0)).toBe(0);
        expect(xpForMinutes(24)).toBe(0);
    });

    test('returns 10 for 25 minutes', () => {
        expect(xpForMinutes(25)).toBe(10);
    });

    test('returns 10 for 25-49 minutes', () => {
        expect(xpForMinutes(30)).toBe(10);
        expect(xpForMinutes(49)).toBe(10);
    });

    test('returns 20 for 50 minutes', () => {
        expect(xpForMinutes(50)).toBe(20);
    });

    test('returns 40 for 120 minutes (max session)', () => {
        expect(xpForMinutes(120)).toBe(40);
    });

    test('xpForMinutes is always waterForMinutes * 10', () => {
        [0, 10, 25, 50, 75, 100, 120].forEach(m => {
            expect(xpForMinutes(m)).toBe(waterForMinutes(m) * 10);
        });
    });
});

describe('petBuffMultiplier(pet)', () => {
    test('scales with level and rarity', () => {
        expect(petBuffMultiplier({ pet_key: 'study_ant', level: 10, evolved: 0 })).toBeCloseTo(0.5);
        expect(petBuffMultiplier({ pet_key: 'wise_owl', level: 3 })).toBeCloseTo(0.24);
    });

    test('evolving never makes a pet weaker than its Lv10 buff', () => {
        const before = petBuffMultiplier({ pet_key: 'study_ant', level: 10, evolved: 0 });
        expect(petBuffMultiplier({ pet_key: 'study_ant', level: 1, evolved: 1 })).toBeCloseTo(before);
        expect(petBuffMultiplier({ pet_key: 'study_ant', level: 10, evolved: 1 })).toBeCloseTo(before * 1.5);
    });

    test('unknown or missing pet gives no buff', () => {
        expect(petBuffMultiplier(null)).toBe(0);
        expect(petBuffMultiplier({ pet_key: 'nope', level: 5 })).toBe(0);
    });
});
