import Database from 'better-sqlite3';
import { SqlitePomoMatchRepository } from '../repositories/sqlite-pomomatch-repository';
import { SqliteTransactionManager } from '../transaction/sqlite-transaction-manager';

describe('PomoMatchRepository', () => {
    let db: any;
    let repo: SqlitePomoMatchRepository;
    let tm: SqliteTransactionManager;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE guild_settings (
                guild_id TEXT PRIMARY KEY,
                global_buddy_matching_enabled INTEGER DEFAULT 0,
                study_hub_enabled INTEGER DEFAULT 0,
                study_hub_accepts_guests INTEGER DEFAULT 0
            );
            CREATE TABLE buddy_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                subject TEXT,
                duration INTEGER,
                mode TEXT DEFAULT 'silent',
                created_at TEXT DEFAULT (datetime('now')),
                status TEXT NOT NULL DEFAULT 'waiting',
                matched_user_id TEXT,
                match_score INTEGER DEFAULT 0,
                session_channel_id TEXT,
                destination TEXT DEFAULT 'pending',
                ended_at TEXT
            );
            CREATE UNIQUE INDEX idx_buddy_one_waiting ON buddy_requests(user_id) WHERE status = 'waiting';
            
            CREATE TABLE buddy_blocks (
                blocker_id TEXT NOT NULL,
                blocked_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(blocker_id, blocked_id)
            );
            
            CREATE TABLE buddy_unmatches (
                unmatcher_id TEXT NOT NULL,
                unmatched_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(unmatcher_id, unmatched_id)
            );
            
            CREATE TABLE buddy_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_user_id TEXT NOT NULL,
                reported_user_id TEXT NOT NULL,
                request_id INTEGER DEFAULT NULL,
                reason TEXT NOT NULL,
                description TEXT DEFAULT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT DEFAULT (datetime('now'))
            );
            
            CREATE TABLE buddy_swipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                swiper_id TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                target_request_id INTEGER NOT NULL,
                action TEXT NOT NULL DEFAULT 'like',
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(swiper_id, target_request_id)
            );
            
            CREATE TABLE buddy_hub_consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_key TEXT NOT NULL,
                request_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                decision TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(match_key, user_id)
            );
            
            CREATE TABLE buddy_hub_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_key TEXT NOT NULL UNIQUE,
                hub_guild_id TEXT NOT NULL,
                invite_url TEXT DEFAULT NULL,
                invite_code TEXT DEFAULT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')),
                sent_at TEXT DEFAULT NULL
            );
            
            CREATE TABLE buddy_analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                user_id TEXT DEFAULT NULL,
                guild_id TEXT DEFAULT NULL,
                request_id INTEGER DEFAULT NULL,
                match_key TEXT DEFAULT NULL,
                scope TEXT DEFAULT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
        `);
        repo = new SqlitePomoMatchRepository(db);
        tm = new SqliteTransactionManager(db);
    });

    afterEach(() => {
        db.close();
    });

    it('1. should create buddy request', () => {
        const reqId = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid);
        expect(reqId).toBeGreaterThan(0);
    });

    it('2. should retrieve waiting requests', () => {
        Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid);
        const reqs = repo.getWaitingBuddyRequests('g1');
        expect(reqs.length).toBe(1);
        expect(reqs[0].user_id).toBe('u1');
    });

    it('3. should expire stale requests', () => {
        Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid);
        // Manually backdate the request
        db.prepare("UPDATE buddy_requests SET created_at = datetime('now', '-35 minutes')").run();
        const { changes } = repo.expireStaleBuddyRequests();
        expect(changes).toBe(1);
        const reqs = repo.getWaitingBuddyRequests('g1');
        expect(reqs.length).toBe(0);
    });

    it('4. should match buddy pair successfully', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const changes = repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        expect(changes).toBe(2);
    });

    it('5. should fail to match buddy pair if one is not waiting', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        db.prepare("UPDATE buddy_requests SET status = 'cancelled' WHERE id = ?").run(id2);
        
        const changes = repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        expect(changes).toBe(0);
        
        // Ensure u1 is still waiting (rollback happened)
        const reqs = repo.getWaitingBuddyRequests('g1');
        expect(reqs.length).toBe(1);
        expect(reqs[0].user_id).toBe('u1');
    });

    it('6. should unmatch buddy pair successfully', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        
        const res = repo.unmatchBuddyPair('u1', id1);
        expect(res.ok).toBe(true);
        expect(res.partnerId).toBe('u2');
        expect(repo.isBuddyUnmatched('u1', 'u2')).toBe(true);
    });

    it('7. should INSERT OR IGNORE in buddy_unmatches', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        // Pre-insert to test IGNORE
        db.prepare("INSERT INTO buddy_unmatches (unmatcher_id, unmatched_id) VALUES ('u1', 'u2')").run();
        const res = repo.unmatchBuddyPair('u1', id1);
        expect(res.ok).toBe(true);
    });

    it('8. should handle destination selection', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        
        const setRes = repo.setBuddyDestination(id1, 'u1', 'study_hub');
        expect(setRes.ok).toBe(true);
        expect(setRes.choice).toBe('study_hub');
        
        const state = repo.getMatchDestinationState(id1, 'u1');
        expect(state.myChoice).toBe('study_hub');
        expect(state.partnerChoice).toBe('pending');
        expect(state.confirmed).toBe(false);
    });

    it('9. should handle hub consent UPSERT', () => {
        const res = repo.recordHubConsent('1:2', 1, 'u1', 'accept');
        expect(res.ok).toBe(true);
        // UPSERT
        const res2 = repo.recordHubConsent('1:2', 1, 'u1', 'decline');
        expect(res2.ok).toBe(true);
        const consents = repo.getHubConsents('1:2');
        expect(consents.length).toBe(1);
        expect(consents[0].decision).toBe('declined');
    });

    it('10. should handle hub invite claim behavior', () => {
        // First claim
        const claim1 = repo.claimHubInvite('1:2', 'g1');
        expect(claim1.claimed).toBe(true);
        expect(claim1.isNew).toBe(true);
        
        // Second claim (simulating race/overwrite)
        const claim2 = repo.claimHubInvite('1:2', 'g2');
        expect(claim2.claimed).toBe(true);
        expect(claim2.isNew).toBe(false);
        expect(claim2.row?.hub_guild_id).toBe('g2');
        
        // After sending, cannot claim
        repo.markHubInviteSent('1:2', 'http://invite', 'CODE');
        const claim3 = repo.claimHubInvite('1:2', 'g3');
        expect(claim3.claimed).toBe(false);
        expect(claim3.reason).toBe('already_sent');
    });

    it('11. should check block/unblock', () => {
        repo.blockBuddyUser('u1', 'u2');
        expect(repo.isBuddyBlocked('u1', 'u2')).toBe(true);
        expect(repo.isBuddyBlocked('u2', 'u1')).toBe(true);
        expect(repo.isBuddyBlocked('u1', 'u3')).toBe(false);
    });

    it('12. should handle swipe INSERT OR IGNORE', () => {
        const { created: c1 } = repo.recordBuddySwipe('u1', 'u2', 1, 'like');
        expect(c1).toBe(true);
        expect(repo.hasBuddyLiked('u1', 'u2')).toBe(true);
        const { created: c2 } = repo.recordBuddySwipe('u1', 'u2', 1, 'like');
        expect(c2).toBe(false); // Ignored due to unique constraint
    });

    it('13. should handle report creation and duplicate protection', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u1', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        const id2 = Number(repo.createBuddyRequest({ userId: 'u2', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid)
        repo.matchBuddyPair(id1, 'u2', id2, 'u1', 80);
        
        const res1 = repo.createBuddyReport({ reporterId: 'u1', reportedId: 'u2', reason: 'spam' });
        expect(res1.ok).toBe(true);
        expect(res1.reason).toBe('spam');
        
        const res2 = repo.createBuddyReport({ reporterId: 'u1', reportedId: 'u2', reason: 'spam' });
        expect(res2.ok).toBe(false);
        expect(res2.reason).toBe('duplicate_open');
    });

    it('14. should validate buddy_match_key', () => {
        // Analytics
        const success = repo.recordBuddyEvent('buddy_like', { matchKey: '1:2' });
        expect(success).toBe(true);
        const fail = repo.recordBuddyEvent('buddy_like', { matchKey: '2-1' }); // Regex mismatch in internal analytics parsing will yield null but save successfully.
        expect(fail).toBe(true); 

        // Hub Consent validates strictly
        const consentRes = repo.recordHubConsent('2-1', 1, 'u1', 'accept');
        expect(consentRes.ok).toBe(false);
        expect(consentRes.reason).toBe('invalid_match');
    });

    it('15. should handle recordBuddyEvent best-effort', () => {
        expect(repo.recordBuddyEvent('invalid_event')).toBe(false);
        expect(repo.recordBuddyEvent('buddy_request_created', { userId: 'u1' })).toBe(true);
    });

    it('16. should getBuddyFunnelStats', () => {
        repo.recordBuddyEvent('buddy_request_created', { userId: 'u1', guildId: 'g1' });
        repo.recordBuddyEvent('buddy_request_created', { userId: 'u2', guildId: 'g1' });
        repo.recordBuddyEvent('buddy_like', { userId: 'u1', guildId: 'g1' });
        
        const stats = repo.getBuddyFunnelStats({ days: 7, guildId: 'g1' });
        expect(stats.requests).toBe(2);
        expect(stats.likes).toBe(1);
    });

    it('17. should select latest waiting buddy request for user', () => {
        const latestId = Number(repo.createBuddyRequest({ userId: 'u_latest', guildId: 'g1', subject: 'physics', duration: 45, mode: 'voice' }).lastInsertRowid);
        const req = repo.getLatestWaitingBuddyRequestForUser('u_latest');
        expect(req).not.toBeNull();
        expect(req!.id).toBe(latestId);
        expect(req!.subject).toBe('physics');
    });

    it('18. should cancel waiting buddy request securely', () => {
        const id1 = Number(repo.createBuddyRequest({ userId: 'u_cancel', guildId: 'g1', subject: 'math', duration: 25, mode: 'silent' }).lastInsertRowid);
        
        // wrong user
        const res1 = repo.cancelWaitingBuddyRequest(id1, 'u_wrong');
        expect(res1.changes).toBe(0);
        
        // correct user
        const res2 = repo.cancelWaitingBuddyRequest(id1, 'u_cancel');
        expect(res2.changes).toBe(1);
        
        // already cancelled
        const res3 = repo.cancelWaitingBuddyRequest(id1, 'u_cancel');
        expect(res3.changes).toBe(0);
    });

});
