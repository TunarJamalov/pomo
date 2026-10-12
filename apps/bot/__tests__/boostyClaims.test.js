jest.mock('../index', () => ({ client: { isReady: () => false } }));

const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { _test } = require('../services/boostyPoller');

beforeAll(() => initDatabase());
beforeEach(() => db.exec('DELETE FROM pro_verification_queue'));

function claim(discordId, identifier) {
    getOrCreateUser(discordId);
    db.prepare(`INSERT INTO pro_verification_queue (discord_id, discord_username, boosty_identifier) VALUES (?, ?, ?)`)
        .run(discordId, discordId, identifier);
}
const statusOf = id => db.prepare('SELECT status FROM pro_verification_queue WHERE discord_id = ?').get(id).status;

const subscriber = { id: 777, email: 'paid@example.com', price: 5 };
const subscribers = new Map([['paid@example.com', subscriber], ['777', subscriber]]);

describe('Boosty auto-grant', () => {
    test('a matching email is granted automatically', async () => {
        claim('boosty_email_user', 'Paid@Example.com');
        await _test.ReconciliationEngine.runGrantPass(subscribers);
        expect(statusOf('boosty_email_user')).toBe('AUTO_VERIFIED');
    });

    test('a public Boosty ID waits for the owner', async () => {
        claim('boosty_id_user', '777');
        await _test.ReconciliationEngine.runGrantPass(subscribers);
        expect(statusOf('boosty_id_user')).toBe('PENDING');
    });

    test('two accounts claiming the same email get nothing', async () => {
        claim('boosty_claim_a', 'paid@example.com');
        claim('boosty_claim_b', 'paid@example.com');
        await _test.ReconciliationEngine.runGrantPass(subscribers);
        expect(statusOf('boosty_claim_a')).toBe('CONFLICT');
        expect(statusOf('boosty_claim_b')).toBe('CONFLICT');
    });
});
