import Database from 'better-sqlite3';
import { SqliteSessionRepository } from '../repositories/sqlite-session-repository';
import { SqliteTransactionManager } from '../transaction/sqlite-transaction-manager';

describe('SessionRepository', () => {
    let db: any;
    let repo: SqliteSessionRepository;
    let tm: SqliteTransactionManager;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE users (
                discord_id TEXT PRIMARY KEY
            );
            CREATE TABLE study_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT,
                channel_id TEXT,
                message_id TEXT,
                duration INTEGER NOT NULL,
                title TEXT,
                started_at DATETIME,
                ends_at DATETIME,
                completed BOOLEAN DEFAULT 0,
                reminder_sent BOOLEAN DEFAULT 0,
                paused BOOLEAN DEFAULT 0,
                paused_at DATETIME,
                paused_total_seconds INTEGER DEFAULT 0,
                pause_count INTEGER DEFAULT 0,
                todo_id INTEGER,
                subject TEXT,
                pomodoro_data TEXT,
                goal_text TEXT,
                outcome TEXT,
                buddy_match_key TEXT
            );
            INSERT INTO users (discord_id) VALUES ('user1');
        `);
        // identityRepo is unused by the SQLite implementation (the bot passes only db)
        repo = new SqliteSessionRepository(db, undefined as any);
        tm = new SqliteTransactionManager(db);
    });

    afterEach(() => {
        db.close();
    });

    it('should create and retrieve a session', async () => {
        const session = await tm.execute(async ctx => {
            return repo.createSession(ctx, {
                userId: 'user1',
                duration: 25,
                title: 'Test Session',
                subject: 'general'
            });
        });

        expect(session.id).toBeDefined();
        expect(session.duration).toBe(25);
        expect(session.title).toBe('Test Session');
        expect(session.completed).toBe(false);

        const active = await tm.execute(async ctx => repo.getActiveSession(ctx, 'user1'));
        expect(active).not.toBeNull();
        expect(active?.id).toBe(session.id);
    });

    it('should pause and resume a session correctly', async () => {
        const session = await tm.execute(async ctx => repo.createSession(ctx, { userId: 'user1', duration: 25, title: 'Test Session' }));

        await tm.execute(async ctx => repo.pauseSession(ctx, session.id as number));
        const pausedSession = await tm.execute(async ctx => repo.getSessionById(ctx, session.id as number));
        expect(pausedSession?.paused).toBe(true);
        expect(pausedSession?.paused_at).not.toBeNull();
        expect(pausedSession?.pause_count).toBe(1);

        await tm.execute(async ctx => repo.resumeSession(ctx, session.id as number));
        const resumedSession = await tm.execute(async ctx => repo.getSessionById(ctx, session.id as number));
        expect(resumedSession?.paused).toBe(false);
        expect(resumedSession?.paused_at).toBeNull();
    });

    it('should complete and cancel a session', async () => {
        const session1 = await tm.execute(async ctx => repo.createSession(ctx, { userId: 'user1', duration: 25, title: 'Session 1' }));
        await tm.execute(async ctx => repo.completeSession(ctx, session1.id as number));
        const activeAfterComplete = await tm.execute(async ctx => repo.getActiveSession(ctx, 'user1'));
        expect(activeAfterComplete).toBeNull();

        const session2 = await tm.execute(async ctx => repo.createSession(ctx, { userId: 'user1', duration: 25, title: 'Session 2' }));
        await tm.execute(async ctx => repo.cancelSession(ctx, session2.id as number));
        const activeAfterCancel = await tm.execute(async ctx => repo.getActiveSession(ctx, 'user1'));
        expect(activeAfterCancel).toBeNull();
    });
});
