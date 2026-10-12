const crypto = require('crypto');
const { _test } = require('../../commands/vote');

describe('vote webhook helpers', () => {
    test('recognizes current and legacy vote events', () => {
        expect(_test.isVoteEvent('vote.create')).toBe(true);
        expect(_test.isVoteEvent('upvote')).toBe(true);
        expect(_test.isVoteEvent('vote')).toBe(true);
        expect(_test.isVoteEvent(undefined)).toBe(true);
        expect(_test.isVoteEvent('webhook.test')).toBe(false);
    });

    test('recognizes current and legacy test events', () => {
        expect(_test.isTestEvent('webhook.test')).toBe(true);
        expect(_test.isTestEvent('test')).toBe(true);
        expect(_test.isTestEvent('vote.create')).toBe(false);
    });

    test('extracts voter ID from current and legacy payloads', () => {
        expect(_test.getVoterId({ data: { user: { platform_id: '123' } } })).toBe('123');
        expect(_test.getVoterId({ user: '456' })).toBe('456');
        expect(_test.getVoterId({})).toBeUndefined();
    });

    test('verifies Top.gg HMAC signature', () => {
        const secret = 'whs_secret';
        const timestamp = '1700000000';
        const rawBody = JSON.stringify({ type: 'vote.create' });
        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${timestamp}.${rawBody}`)
            .digest('hex');

        const now = { nowMs: 1700000000 * 1000 };
        expect(_test.verifyTopggSignature(rawBody, `t=${timestamp},v1=${signature}`, secret, now)).toBe(true);
        expect(_test.verifyTopggSignature(rawBody, `t=${timestamp},v1=bad`, secret, now)).toBe(false);
    });

    test('rejects replayed (old) signed webhooks', () => {
        const secret = 'whs_secret';
        const timestamp = '1700000000';
        const rawBody = JSON.stringify({ type: 'vote.create' });
        const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        const oneHourLater = { nowMs: (1700000000 + 3600) * 1000 };
        expect(_test.verifyTopggSignature(rawBody, `t=${timestamp},v1=${signature}`, secret, oneHourLater)).toBe(false);
        expect(_test.isFreshTimestamp('1700000000', 1700000100 * 1000)).toBe(true);
        expect(_test.isFreshTimestamp('1700000000000', 1700000100 * 1000)).toBe(true);
        expect(_test.isFreshTimestamp('abc')).toBe(false);
    });

    test('the same vote is only rewarded once per 11 hours', () => {
        const start = 1_000_000_000_000;
        expect(_test.isDuplicateVote('123456789012345678', start)).toBe(false);
        expect(_test.isDuplicateVote('123456789012345678', start + 60_000)).toBe(true);
        expect(_test.isDuplicateVote('123456789012345678', start + 12 * 3600_000)).toBe(false);
    });
});
