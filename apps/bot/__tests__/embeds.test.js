/**
 * Tests for utils/embeds.js — formatTime and progressBar helper functions.
 *
 * EmbedBuilder requires discord.js internals; we mock it so tests
 * run without a Discord connection.
 */
jest.mock('discord.js', () => {
    const mockEmbed = {
        setColor: jest.fn().mockReturnThis(),
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
    };
    return {
        EmbedBuilder: jest.fn(() => mockEmbed),
    };
});

const { formatTime, progressBar } = require('../utils/embeds');

// ── formatTime ─────────────────────────────────────────────────

describe('formatTime(minutes)', () => {
    test('returns "0m" for 0 minutes', () => {
        expect(formatTime(0)).toBe('0m');
    });

    test('returns "Xm" for values under 60', () => {
        expect(formatTime(5)).toBe('5m');
        expect(formatTime(25)).toBe('25m');
        expect(formatTime(59)).toBe('59m');
    });

    test('returns "1h" for exactly 60 minutes', () => {
        expect(formatTime(60)).toBe('1h');
    });

    test('returns "1h 30m" for 90 minutes', () => {
        expect(formatTime(90)).toBe('1h 30m');
    });

    test('returns "2h" for 120 minutes', () => {
        expect(formatTime(120)).toBe('2h');
    });

    test('returns "1h 1m" for 61 minutes', () => {
        expect(formatTime(61)).toBe('1h 1m');
    });
});

// ── progressBar ───────────────────────────────────────────────

describe('progressBar(current, max, length)', () => {
    test('returns a string', () => {
        expect(typeof progressBar(0, 10, 10)).toBe('string');
    });

    test('0% — shows "0%"', () => {
        const bar = progressBar(0, 100, 10);
        expect(bar).toContain('0%');
    });

    test('100% — shows "100%"', () => {
        const bar = progressBar(100, 100, 10);
        expect(bar).toContain('100%');
    });

    test('50% — shows "50%"', () => {
        const bar = progressBar(5, 10, 10);
        expect(bar).toContain('50%');
    });

    test('overflow protection: current > max shows 100%', () => {
        const bar = progressBar(200, 100, 10);
        expect(bar).toContain('100%');
    });

    test('works with default length (10)', () => {
        const bar = progressBar(5, 10);
        expect(typeof bar).toBe('string');
        expect(bar.length).toBeGreaterThan(0);
    });

    test('percentage rounds correctly', () => {
        // 1/3 of 10 ≈ 33%
        const bar = progressBar(1, 3, 10);
        expect(bar).toContain('33%');
    });
});
