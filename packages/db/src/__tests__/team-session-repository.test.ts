import Database from 'better-sqlite3';
import { SqliteTeamSessionRepository } from '../repositories/sqlite-team-session-repository';
import { SqliteTransactionManager } from '../transaction/sqlite-transaction-manager';

describe('TeamSessionRepository', () => {
    let db: any;
    let repo: SqliteTeamSessionRepository;
    let tm: SqliteTransactionManager;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE team_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                channel_id TEXT,
                host_id TEXT,
                message_id TEXT,
                duration INTEGER NOT NULL,
                started_at DATETIME,
                ends_at DATETIME,
                status TEXT NOT NULL,
                paused BOOLEAN DEFAULT 0,
                paused_at DATETIME,
                paused_total_seconds INTEGER DEFAULT 0,
                pause_count INTEGER DEFAULT 0,
                pomodoro_data TEXT
            );
            CREATE TABLE team_members (
                session_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                PRIMARY KEY (session_id, user_id)
            );
        `);
        repo = new SqliteTeamSessionRepository(db);
        tm = new SqliteTransactionManager(db);
    });

    afterEach(() => {
        db.close();
    });

    it('should create and retrieve a team session', async () => {
        const session = await tm.execute(async ctx => {
            return repo.createSession(ctx, {
                hostId: 'user1',
                duration: 25
            });
        });

        expect(session.id).toBeDefined();
        expect(session.hostId).toBe('user1');
        expect(session.duration).toBe(25);
        expect(session.status).toBe('waiting');

        const active = await tm.execute(async ctx => repo.getActiveOrWaitingSessionByHost(ctx, 'user1'));
        expect(active).not.toBeNull();
        expect(active?.id).toBe(session.id);
    });

    it('should manage team members correctly', async () => {
        const session = await tm.execute(async ctx => repo.createSession(ctx, { hostId: 'user1', duration: 25 }));
        
        await tm.execute(async ctx => repo.addMember(ctx, session.id as number, 'user1'));
        await tm.execute(async ctx => repo.addMember(ctx, session.id as number, 'user2'));

        let members = await tm.execute(async ctx => repo.getMembers(ctx, session.id as number));
        expect(members.length).toBe(2);
        
        await tm.execute(async ctx => repo.removeMember(ctx, session.id as number, 'user1'));
        members = await tm.execute(async ctx => repo.getMembers(ctx, session.id as number));
        expect(members.length).toBe(1);
        expect(members[0].userId).toBe('user2');
    });

    it('should transition status correctly', async () => {
        const session = await tm.execute(async ctx => repo.createSession(ctx, { hostId: 'user1', duration: 25 }));
        
        await tm.execute(async ctx => repo.startSession(ctx, session.id as number));
        let updated = await tm.execute(async ctx => repo.getSessionById(ctx, session.id as number));
        expect(updated?.status).toBe('active');
        
        await tm.execute(async ctx => repo.completeSession(ctx, session.id as number));
        updated = await tm.execute(async ctx => repo.getSessionById(ctx, session.id as number));
        expect(updated?.status).toBe('completed');
    });
});
