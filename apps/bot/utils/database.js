/**
 * SQLite database initialization and helper queries.
 * Uses better-sqlite3 for synchronous, fast database access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { ProProfileAccents, ProProfileBadges, Titles } = require('./constants');
const { getWeekStart: getTimeZoneWeekStart, normalizeTimeZone } = require('./timezone');

// Ensure /data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.POMODORO_DB_PATH || path.join(dataDir, 'pomodoro.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


// --- DEPENDENCY INJECTION (Phase 4/6) ---
const {
    SqliteIdentityRepository,
    SqliteUserRepository,
    SqliteInventoryRepository,
    SqliteSessionRepository,
    SqliteTeamSessionRepository,
    SqliteVoiceSessionRepository,
    SqlitePomoMatchRepository,
    SqliteGuildRepository,
    SqliteClanRepository,
    SqliteSeasonRepository,
    SqliteMarketRepository,
    SqliteChallengeRepository,
    SqliteGardenRepository,
    SqlitePetRepository,
    SqliteTransactionManager,
} = require('@pomo/db');

let identityRepository, userRepository, inventoryRepository;
let sessionRepository, teamSessionRepository, voiceSessionRepository;
let pomomatchRepository, guildRepository, clanRepository;
let seasonRepository, marketRepository, challengeRepository;
let gardenRepository, petRepository;
let transactionManager;

// The bot runs on SQLite only. The earlier Postgres "dual-write" swapped repositories
// instead of mirroring writes and would have split data across two databases, so it
// was removed. A future Postgres move should be a single planned cutover.
identityRepository = new SqliteIdentityRepository(db);
userRepository = new SqliteUserRepository(db, identityRepository);
inventoryRepository = new SqliteInventoryRepository(db, identityRepository);
sessionRepository = new SqliteSessionRepository(db);
teamSessionRepository = new SqliteTeamSessionRepository(db);
voiceSessionRepository = new SqliteVoiceSessionRepository(db);
pomomatchRepository = new SqlitePomoMatchRepository(db, identityRepository);
guildRepository = new SqliteGuildRepository(db);
clanRepository = new SqliteClanRepository(db, identityRepository);
seasonRepository = new SqliteSeasonRepository(db);
marketRepository = new SqliteMarketRepository(db);
challengeRepository = new SqliteChallengeRepository(db);
gardenRepository = new SqliteGardenRepository(db, identityRepository);
petRepository = new SqlitePetRepository(db, identityRepository);
transactionManager = new SqliteTransactionManager(db);
// ----------------------------------------


/**
 * Initialize all database tables.
 */
function initDatabase() {
    // 1. Create base tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            water INTEGER DEFAULT 0,
            total_focus_minutes INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            streak INTEGER DEFAULT 0,
            last_study_date TEXT,
            last_daily_date TEXT,
            premium INTEGER DEFAULT 0,
            bio TEXT DEFAULT '',
            theme TEXT DEFAULT 'basic',
            active_title_key TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    try { db.exec('ALTER TABLE users ADD COLUMN season_xp INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN season_focus_minutes INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN active_title_key TEXT DEFAULT NULL'); } catch(e) {}

    try { db.exec('ALTER TABLE users ADD COLUMN last_session_at TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN session_count INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN day1_retained INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN day7_retained INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN day30_retained INTEGER DEFAULT 0'); } catch(e) {}

    try { db.exec('ALTER TABLE users ADD COLUMN referred_by TEXT DEFAULT NULL'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN last_premium_daily_date TEXT DEFAULT NULL'); } catch(e) {}
    
    // Create seasons table
    db.exec(`
        CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            is_active INTEGER DEFAULT 0,
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT
        );

        -- Final standings, written just before a season's counters are reset
        CREATE TABLE IF NOT EXISTS season_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            season_name TEXT NOT NULL,
            scope TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            entity_name TEXT,
            season_xp INTEGER NOT NULL DEFAULT 0,
            season_focus_minutes INTEGER NOT NULL DEFAULT 0,
            rank INTEGER NOT NULL,
            reward_tier TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(season_id, scope, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_season_results_entity ON season_results(scope, entity_id, season_id);

        -- Habit tracker (/habit). day is YYYY-MM-DD in the user's habit time zone;
        -- target is per day (1 = yes/no), weekly_target = days per week or NULL for daily.
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '✅',
            color TEXT NOT NULL DEFAULT '#f0533f',
            target INTEGER NOT NULL DEFAULT 1,
            unit TEXT,
            weekly_target INTEGER,
            archived_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, archived_at);
        CREATE TABLE IF NOT EXISTS habit_logs (
            habit_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            day TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            rewarded INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (habit_id, day)
        );
        CREATE INDEX IF NOT EXISTS idx_habit_logs_user_day ON habit_logs(user_id, day);
        CREATE TABLE IF NOT EXISTS habit_settings (
            user_id TEXT PRIMARY KEY,
            timezone TEXT NOT NULL DEFAULT 'UTC'
        );
    `);

    // Ensure at least 1 season exists
    const seasonCheck = db.prepare('SELECT * FROM seasons').get();
    if (!seasonCheck) {
        db.prepare('INSERT INTO seasons (name, is_active) VALUES (?, 1)').run('Spring Season 1');
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT,
            channel_id TEXT,
            message_id TEXT,
            duration INTEGER NOT NULL,
            title TEXT DEFAULT 'Study Session',
            started_at TEXT DEFAULT (datetime('now')),
            ends_at TEXT,
            completed INTEGER DEFAULT 0,
            reminder_sent INTEGER DEFAULT 0,
            paused INTEGER DEFAULT 0,
            paused_at TEXT DEFAULT NULL,
            paused_total_seconds INTEGER DEFAULT 0,
            pause_count INTEGER DEFAULT 0,
            todo_id INTEGER DEFAULT NULL,
            subject TEXT DEFAULT 'general',
            pomodoro_data TEXT,
            buddy_match_key TEXT DEFAULT NULL,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS garden_plots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            plant_type TEXT,
            stage INTEGER DEFAULT 0,
            water_used INTEGER DEFAULT 0,
            planted_at TEXT DEFAULT (datetime('now')),
            last_watered TEXT,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS harvested_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            plant_type TEXT NOT NULL,
            harvested_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS team_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            host_id TEXT NOT NULL,
            message_id TEXT,
            duration INTEGER NOT NULL,
            started_at TEXT DEFAULT (datetime('now')),
            ends_at TEXT,
            status TEXT DEFAULT 'waiting',
            paused INTEGER DEFAULT 0,
            paused_at TEXT DEFAULT NULL,
            paused_total_seconds INTEGER DEFAULT 0,
            pause_count INTEGER DEFAULT 0,
            pomodoro_data TEXT
        );

        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            joined_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES team_sessions(id)
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            item_key TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            UNIQUE(user_id, item_key),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            notify_before_end INTEGER DEFAULT 1,
            notify_type TEXT DEFAULT 'dm',
            reminders_enabled INTEGER DEFAULT 1,
            notify_friends INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            achievement_key TEXT NOT NULL,
            unlocked_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, achievement_key),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS user_titles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title_key TEXT NOT NULL,
            unlocked_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, title_key),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS global_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            target_minutes INTEGER NOT NULL,
            progress_minutes INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            started_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS global_event_clues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            clue_key TEXT NOT NULL,
            threshold_minutes INTEGER NOT NULL,
            clue_text TEXT NOT NULL,
            UNIQUE(event_id, clue_key),
            FOREIGN KEY (event_id) REFERENCES global_events(id)
        );

        CREATE TABLE IF NOT EXISTS global_event_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            minutes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_id, user_id, source_type, source_id),
            FOREIGN KEY (event_id) REFERENCES global_events(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(sender_id, receiver_id),
            FOREIGN KEY (sender_id) REFERENCES users(discord_id),
            FOREIGN KEY (receiver_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS activity_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS activity_chat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            avatar TEXT,
            level INTEGER DEFAULT 1,
            message TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS activity_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id INTEGER,
            title TEXT DEFAULT 'Focus Session',
            minutes INTEGER DEFAULT 0,
            water INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            leveled_up INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            seen_at TEXT
        );

        CREATE TABLE IF NOT EXISTS user_pets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            pet_key TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 0,
            UNIQUE(user_id, pet_key),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            focus_minutes INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS user_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            exam_date TEXT NOT NULL,
            target_hours INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_requests (
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

        CREATE TABLE IF NOT EXISTS buddy_blocks (
            blocker_id TEXT NOT NULL,
            blocked_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(blocker_id, blocked_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_unmatches (
            unmatcher_id TEXT NOT NULL,
            unmatched_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(unmatcher_id, unmatched_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_user_id TEXT NOT NULL,
            reported_user_id TEXT NOT NULL,
            request_id INTEGER DEFAULT NULL,
            reason TEXT NOT NULL,
            description TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS buddy_swipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            swiper_id TEXT NOT NULL,
            target_user_id TEXT NOT NULL,
            target_request_id INTEGER NOT NULL,
            action TEXT NOT NULL DEFAULT 'like',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(swiper_id, target_request_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_hub_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_key TEXT NOT NULL,
            request_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            decision TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(match_key, user_id)
        );

        CREATE TABLE IF NOT EXISTS buddy_hub_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_key TEXT NOT NULL UNIQUE,
            hub_guild_id TEXT NOT NULL,
            invite_url TEXT DEFAULT NULL,
            invite_code TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            sent_at TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS buddy_analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            user_id TEXT DEFAULT NULL,
            guild_id TEXT DEFAULT NULL,
            request_id INTEGER DEFAULT NULL,
            match_key TEXT DEFAULT NULL,
            scope TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS study_session_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            goal_text TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES study_sessions(id)
        );

        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            title TEXT NOT NULL,
            challenge_type TEXT NOT NULL DEFAULT 'time',
            target_value INTEGER NOT NULL,
            start_date TEXT NOT NULL DEFAULT (datetime('now')),
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (creator_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS challenge_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            joined_at TEXT DEFAULT (datetime('now')),
            UNIQUE(challenge_id, user_id),
            FOREIGN KEY (challenge_id) REFERENCES challenges(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS study_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            title TEXT NOT NULL,
            scheduled_at TEXT NOT NULL,
            duration INTEGER NOT NULL,
            break_duration INTEGER DEFAULT NULL,
            cycles INTEGER DEFAULT 4,
            limit_count INTEGER DEFAULT 10,
            status TEXT DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (host_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS plan_signups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            signed_up_at TEXT DEFAULT (datetime('now')),
            UNIQUE(plan_id, user_id),
            FOREIGN KEY (plan_id) REFERENCES study_plans(id)
        );

        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            report_channel_id TEXT DEFAULT NULL,
            report_enabled INTEGER DEFAULT 0,
            voice_tracking_enabled INTEGER DEFAULT 0,
            voice_target_id TEXT DEFAULT NULL,
            voice_target_type TEXT DEFAULT NULL,
            voice_rewards_enabled INTEGER DEFAULT 1,
            voice_min_minutes INTEGER DEFAULT 10,
            voice_daily_reward_cap INTEGER DEFAULT 240,
            language TEXT DEFAULT 'en',
            timezone TEXT DEFAULT 'UTC',
            report_last_week_start TEXT DEFAULT NULL,
            setup_completed_at TEXT DEFAULT NULL,
            studyroom_category_id TEXT DEFAULT NULL,
            studyroom_trigger_id TEXT DEFAULT NULL,
            global_buddy_matching_enabled INTEGER DEFAULT 0,
            study_hub_enabled INTEGER DEFAULT 0,
            study_hub_accepts_guests INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS guild_progress (
            guild_id TEXT PRIMARY KEY,
            guild_name TEXT,
            level INTEGER NOT NULL DEFAULT 1,
            xp INTEGER NOT NULL DEFAULT 0,
            total_focus_minutes INTEGER NOT NULL DEFAULT 0,
            total_sessions INTEGER NOT NULL DEFAULT 0,
            season_xp INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS guild_xp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            minutes INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(guild_id, source_type, source_id)
        );

        CREATE TABLE IF NOT EXISTS guild_quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            week_start TEXT NOT NULL,
            quest_key TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            target INTEGER NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            reward_water INTEGER NOT NULL DEFAULT 0,
            reward_xp INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            UNIQUE(guild_id, week_start, quest_key)
        );

        CREATE TABLE IF NOT EXISTS guild_quest_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quest_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            minutes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(quest_id, user_id, source_type, source_id),
            FOREIGN KEY (quest_id) REFERENCES guild_quests(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS guild_quest_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quest_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            claimed_at TEXT DEFAULT (datetime('now')),
            UNIQUE(quest_id, user_id),
            FOREIGN KEY (quest_id) REFERENCES guild_quests(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS voice_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            started_at TEXT DEFAULT (datetime('now')),
            last_seen_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            total_minutes INTEGER DEFAULT 0,
            credited_minutes INTEGER DEFAULT 0,
            rewarded_minutes INTEGER DEFAULT 0,
            water_reward INTEGER DEFAULT 0,
            xp_reward INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            end_reason TEXT,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS guild_installations (
            guild_id TEXT PRIMARY KEY,
            guild_name TEXT,
            member_count INTEGER DEFAULT 0,
            owner_id TEXT,
            active INTEGER DEFAULT 1,
            is_baseline INTEGER DEFAULT 1,
            setup_reminder_sent_at TEXT,
            setup_reminder_attempted_at TEXT,
            setup_nudge_sent_at TEXT,
            joined_at TEXT DEFAULT (datetime('now')),
            left_at TEXT,
            last_seen_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS command_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT,
            user_id TEXT NOT NULL,
            command_name TEXT NOT NULL,
            subcommand_name TEXT,
            used_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS onboarding_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            topic TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_onboarding (
            user_id TEXT NOT NULL,
            tip_key TEXT NOT NULL,
            shown_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, tip_key),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS premium_entitlements (
            user_id TEXT PRIMARY KEY,
            plan_key TEXT NOT NULL DEFAULT 'pro_beta',
            status TEXT NOT NULL DEFAULT 'active',
            source TEXT NOT NULL DEFAULT 'manual_beta',
            starts_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT,
            granted_by TEXT,
            note TEXT,
            provider_ref TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            revoked_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS premium_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            plan_key TEXT NOT NULL,
            source TEXT NOT NULL,
            duration_days INTEGER,
            actor_id TEXT,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS pro_profile_settings (
            user_id TEXT PRIMARY KEY,
            accent_key TEXT NOT NULL DEFAULT 'gold',
            badge_key TEXT NOT NULL DEFAULT 'pomo_pro',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS streak_breaks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            previous_streak INTEGER NOT NULL,
            gap_days INTEGER NOT NULL,
            broken_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            recovered_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS runtime_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS guild_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            week_start TEXT NOT NULL,
            target_minutes INTEGER NOT NULL,
            reward_water INTEGER NOT NULL,
            reward_xp INTEGER NOT NULL,
            min_contribution INTEGER NOT NULL DEFAULT 25,
            channel_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            UNIQUE(guild_id, week_start)
        );

        CREATE TABLE IF NOT EXISTS guild_goal_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(goal_id, user_id, source_type, source_id),
            FOREIGN KEY (goal_id) REFERENCES guild_goals(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS guild_goal_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            claimed_at TEXT DEFAULT (datetime('now')),
            UNIQUE(goal_id, user_id),
            FOREIGN KEY (goal_id) REFERENCES guild_goals(id),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS personal_goal_settings (
            user_id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1,
            period_type TEXT NOT NULL DEFAULT 'weekly',
            target_minutes INTEGER NOT NULL DEFAULT 600,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS personal_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            period_type TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            target_minutes INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            UNIQUE(user_id, period_type, period_start),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS personal_goal_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            minutes INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(goal_id, source_type, source_id),
            FOREIGN KEY (goal_id) REFERENCES personal_goals(id)
        );

        CREATE TABLE IF NOT EXISTS clans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            owner_id TEXT NOT NULL,
            total_focus_minutes INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            season_xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            water INTEGER DEFAULT 0,
            tree_level INTEGER DEFAULT 1,
            tree_xp INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS clan_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clan_id INTEGER NOT NULL,
            item_key TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            UNIQUE(clan_id, item_key)
        );

        CREATE TABLE IF NOT EXISTS clan_members (
            clan_id INTEGER NOT NULL,
            discord_id TEXT PRIMARY KEY,
            role TEXT DEFAULT 'member', -- 'owner', 'co_owner', 'member'
            joined_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (clan_id) REFERENCES clans(id)
        );

        CREATE TABLE IF NOT EXISTS clan_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clan_id INTEGER NOT NULL,
            inviter_id TEXT NOT NULL,
            invitee_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT DEFAULT (datetime('now', '+7 days')),
            FOREIGN KEY (clan_id) REFERENCES clans(id)
        );

                CREATE TABLE IF NOT EXISTS clan_expeditions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clan_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            target_minutes INTEGER NOT NULL,
            current_minutes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ends_at DATETIME NOT NULL,
            FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS clan_expedition_members (
            expedition_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            contributed_minutes INTEGER DEFAULT 0,
            PRIMARY KEY (expedition_id, user_id),
            FOREIGN KEY (expedition_id) REFERENCES clan_expeditions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS pending_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
            log_message_id TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS quest_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            quest_key TEXT NOT NULL,
            quest_date TEXT NOT NULL,
            claimed_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, quest_key, quest_date),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS quest_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            quest_key TEXT NOT NULL,
            quest_date TEXT NOT NULL,
            notified_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, quest_key, quest_date),
            FOREIGN KEY (user_id) REFERENCES users(discord_id)
        );

        CREATE TABLE IF NOT EXISTS market_prices (
            item_key TEXT PRIMARY KEY,
            price INTEGER NOT NULL,
            updated_at TEXT DEFAULT (date('now'))
        );
    `);

    // 2. Perform table migrations (ignore errors if cols already exist)
    try {
        db.exec("ALTER TABLE study_sessions ADD COLUMN pomodoro_data TEXT;");
    } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN paused INTEGER DEFAULT 0;"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN paused_at TEXT DEFAULT NULL;"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN paused_total_seconds INTEGER DEFAULT 0;"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN pause_count INTEGER DEFAULT 0;"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN todo_id INTEGER DEFAULT NULL;"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN subject TEXT DEFAULT 'general';"); } catch (_) {}
    try { db.exec("ALTER TABLE todos ADD COLUMN focus_minutes INTEGER DEFAULT 0;"); } catch (_) {}

    try {
        db.exec("ALTER TABLE team_sessions ADD COLUMN pomodoro_data TEXT;");
    } catch (_) {}
    try { db.exec("ALTER TABLE team_sessions ADD COLUMN paused INTEGER DEFAULT 0;"); } catch (_) {}
    try { db.exec("ALTER TABLE team_sessions ADD COLUMN paused_at TEXT DEFAULT NULL;"); } catch (_) {}
    try { db.exec("ALTER TABLE team_sessions ADD COLUMN paused_total_seconds INTEGER DEFAULT 0;"); } catch (_) {}
    try { db.exec("ALTER TABLE team_sessions ADD COLUMN pause_count INTEGER DEFAULT 0;"); } catch (_) {}

    try {
        db.exec("ALTER TABLE clans ADD COLUMN last_dm_at TEXT;");
    } catch (_) {}

    try {
        db.exec("ALTER TABLE settings ADD COLUMN notify_friends INTEGER DEFAULT 0;");
    } catch (_) {}
    try { db.exec("ALTER TABLE settings ADD COLUMN session_card_style TEXT DEFAULT 'image'"); } catch(_) {}
    try { db.exec('ALTER TABLE settings ADD COLUMN morning_prompt INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE settings ADD COLUMN evening_alert INTEGER DEFAULT 1'); } catch(_) {}
    try { db.exec('ALTER TABLE settings ADD COLUMN evening_reflection INTEGER DEFAULT 0'); } catch(_) {}

    // Pomo Pro (Boosty) support. Pro status itself lives in premium_entitlements;
    // these columns only hold per-user Pro state that has no other home.
    try { db.exec('ALTER TABLE users ADD COLUMN streak_shields_remaining INTEGER DEFAULT 0'); } catch(_) {}
    // Month (YYYY-MM) the Pro streak shields were last refilled for
    try { db.exec('ALTER TABLE users ADD COLUMN pro_shields_month TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN lapse_check_count INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN lapse_detected_at TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN persona TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN persona_changed_at TEXT DEFAULT NULL'); } catch(_) {}
    db.exec(`
        CREATE TABLE IF NOT EXISTS pro_verification_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            discord_username TEXT,
            boosty_identifier TEXT NOT NULL,
            boosty_subscriber_id TEXT,
            submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'PENDING',
            verified_by TEXT,
            granted_days INTEGER,
            granted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pro_verification_status ON pro_verification_queue(status);

        CREATE TABLE IF NOT EXISTS pro_revocation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            revoked_at TEXT NOT NULL,
            reason TEXT NOT NULL,
            lapse_check_count INTEGER,
            reinstated_at TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS upsell_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            upsell_type TEXT NOT NULL,
            shown_at TEXT NOT NULL DEFAULT (datetime('now')),
            was_clicked INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_upsell_log_user ON upsell_log(user_id, shown_at);
    `);

    // Buff system columns
    try { db.exec('ALTER TABLE users ADD COLUMN active_buff_type TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN active_buff_value REAL DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN buff_expires_at TEXT DEFAULT NULL'); } catch(_) {}

    // Pet evolution column
    try { db.exec('ALTER TABLE user_pets ADD COLUMN evolved INTEGER DEFAULT 0'); } catch(_) {}

    // Clan treasury and tree columns
    try { db.exec('ALTER TABLE clans ADD COLUMN water INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE clans ADD COLUMN tree_level INTEGER DEFAULT 1'); } catch(_) {}
    try { db.exec('ALTER TABLE clans ADD COLUMN tree_xp INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE clans ADD COLUMN season_xp INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE seasons ADD COLUMN ended_at TEXT'); } catch(_) {}

    try { db.exec('ALTER TABLE users ADD COLUMN total_sessions INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN last_loyal_dog_date TEXT DEFAULT NULL'); } catch(_) {}
    
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN total_focus_minutes INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN guild_name TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN language TEXT DEFAULT 'en'"); } catch(_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN timezone TEXT DEFAULT 'UTC'"); } catch(_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN report_last_week_start TEXT DEFAULT NULL"); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_tracking_enabled INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_target_id TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_target_type TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_rewards_enabled INTEGER DEFAULT 1'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_min_minutes INTEGER DEFAULT 10'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN voice_daily_reward_cap INTEGER DEFAULT 240'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN goal_enabled INTEGER DEFAULT 0'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN goal_target_minutes INTEGER DEFAULT 2500'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN goal_channel_id TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_settings ADD COLUMN goal_min_contribution INTEGER DEFAULT 25'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_installations ADD COLUMN is_baseline INTEGER DEFAULT 1'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_installations ADD COLUMN setup_reminder_sent_at TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_installations ADD COLUMN setup_reminder_attempted_at TEXT DEFAULT NULL'); } catch(_) {}
    try { db.exec('ALTER TABLE guild_installations ADD COLUMN setup_nudge_sent_at TEXT DEFAULT NULL'); } catch(_) {}

    try { db.exec("ALTER TABLE activity_commands ADD COLUMN type TEXT DEFAULT 'study'"); } catch (_) {}
    try { db.exec("ALTER TABLE activity_commands ADD COLUMN extra_data TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN setup_completed_at TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN studyroom_category_id TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN studyroom_trigger_id TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN global_buddy_matching_enabled INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN study_hub_enabled INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE guild_settings ADD COLUMN study_hub_accepts_guests INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN goal_text TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("ALTER TABLE study_sessions ADD COLUMN outcome TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_blocks (
            blocker_id TEXT NOT NULL,
            blocked_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(blocker_id, blocked_id)
        )`); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_unmatches (
            unmatcher_id TEXT NOT NULL,
            unmatched_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(unmatcher_id, unmatched_id)
        )`); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_user_id TEXT NOT NULL,
            reported_user_id TEXT NOT NULL,
            request_id INTEGER DEFAULT NULL,
            reason TEXT NOT NULL,
            description TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now'))
        )`); } catch (_) {}
    try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_buddy_reports_open_pair ON buddy_reports(reporter_user_id, reported_user_id) WHERE status = 'open'"); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_swipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            swiper_id TEXT NOT NULL,
            target_user_id TEXT NOT NULL,
            target_request_id INTEGER NOT NULL,
            action TEXT NOT NULL DEFAULT 'like',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(swiper_id, target_request_id)
        )`); } catch (_) {}
    try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_buddy_one_waiting ON buddy_requests(user_id) WHERE status = 'waiting'"); } catch (_) {}
    try { db.exec("ALTER TABLE buddy_requests ADD COLUMN destination TEXT DEFAULT 'pending'"); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_hub_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_key TEXT NOT NULL,
            request_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            decision TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(match_key, user_id)
        )`); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_hub_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_key TEXT NOT NULL UNIQUE,
            hub_guild_id TEXT NOT NULL,
            invite_url TEXT DEFAULT NULL,
            invite_code TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            sent_at TEXT DEFAULT NULL
        )`); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS buddy_analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT NOT NULL,
            user_id TEXT DEFAULT NULL,
            guild_id TEXT DEFAULT NULL,
            request_id INTEGER DEFAULT NULL,
            match_key TEXT DEFAULT NULL,
            scope TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`); } catch (_) {}
    try { db.exec('ALTER TABLE study_sessions ADD COLUMN buddy_match_key TEXT DEFAULT NULL'); } catch (_) {}

    // 3. Create indexes
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_guild_id ON study_sessions(guild_id);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_completed ON study_sessions(completed);
        CREATE INDEX IF NOT EXISTS idx_garden_plots_user_id ON garden_plots(user_id);
        CREATE INDEX IF NOT EXISTS idx_team_sessions_status ON team_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
        CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
        CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON user_achievements(user_id);
        CREATE INDEX IF NOT EXISTS idx_friends_sender ON friends(sender_id);
        CREATE INDEX IF NOT EXISTS idx_friends_receiver ON friends(receiver_id);
        CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
        CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
        CREATE INDEX IF NOT EXISTS idx_plans_host ON study_plans(host_id);
        CREATE INDEX IF NOT EXISTS idx_plans_status ON study_plans(status);
        CREATE INDEX IF NOT EXISTS idx_plan_signups_plan ON plan_signups(plan_id);
        CREATE INDEX IF NOT EXISTS idx_quest_claims_user_date ON quest_claims(user_id, quest_date);
        CREATE INDEX IF NOT EXISTS idx_clan_invites_invitee ON clan_invites(invitee_id, status);
        CREATE INDEX IF NOT EXISTS idx_clan_invites_clan ON clan_invites(clan_id, status);
        CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions(user_id, ended_at);
        CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild ON voice_sessions(guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_guild_installations_active ON guild_installations(active);
        CREATE INDEX IF NOT EXISTS idx_command_usage_guild_date ON command_usage(guild_id, used_at);
        CREATE INDEX IF NOT EXISTS idx_command_usage_command_date ON command_usage(command_name, used_at);
        CREATE INDEX IF NOT EXISTS idx_command_usage_user_date ON command_usage(user_id, used_at);
        CREATE INDEX IF NOT EXISTS idx_onboarding_events_date ON onboarding_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_onboarding_events_type_topic ON onboarding_events(event_type, topic, created_at);
        CREATE INDEX IF NOT EXISTS idx_onboarding_events_guild_date ON onboarding_events(guild_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_user_onboarding_user ON user_onboarding(user_id, shown_at);
        CREATE INDEX IF NOT EXISTS idx_activity_rewards_user_seen ON activity_rewards(user_id, seen_at, id);
        CREATE INDEX IF NOT EXISTS idx_premium_entitlements_status_expiry ON premium_entitlements(status, expires_at);
        CREATE INDEX IF NOT EXISTS idx_premium_events_user_date ON premium_events(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_streak_breaks_user_expiry
            ON streak_breaks(user_id, expires_at, recovered_at);
        CREATE INDEX IF NOT EXISTS idx_guild_goals_guild_week ON guild_goals(guild_id, week_start);
        CREATE INDEX IF NOT EXISTS idx_buddy_events_name_date ON buddy_analytics_events(event_name, created_at);
        CREATE INDEX IF NOT EXISTS idx_buddy_events_match ON buddy_analytics_events(match_key);
        CREATE INDEX IF NOT EXISTS idx_buddy_events_user ON buddy_analytics_events(user_id);
        -- Hot paths (/stats, /recap, quests, reports, daily habits, activity poller)
        CREATE INDEX IF NOT EXISTS idx_study_sessions_user_done_start ON study_sessions(user_id, completed, started_at);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_guild_done_start ON study_sessions(guild_id, completed, started_at);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_done_start ON study_sessions(completed, started_at);
        CREATE INDEX IF NOT EXISTS idx_team_members_session ON team_members(session_id);
        CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_team_sessions_guild ON team_sessions(guild_id);
        CREATE INDEX IF NOT EXISTS idx_activity_commands_pending ON activity_commands(status) WHERE status = 'pending';
        CREATE INDEX IF NOT EXISTS idx_buddy_events_guild_date ON buddy_analytics_events(guild_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON guild_goal_contributions(goal_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_personal_goals_user_period ON personal_goals(user_id, period_type, period_start);
        CREATE INDEX IF NOT EXISTS idx_personal_goal_contributions_goal ON personal_goal_contributions(goal_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_sessions_active_user
            ON voice_sessions(user_id, guild_id)
            WHERE status = 'active';
        CREATE INDEX IF NOT EXISTS idx_challenges_guild ON challenges(guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_challenge_members_challenge ON challenge_members(challenge_id);
        CREATE INDEX IF NOT EXISTS idx_challenge_members_user ON challenge_members(user_id);
    `);

    db.prepare(`
        DELETE FROM command_usage
        WHERE used_at < datetime('now', '-90 days')
    `).run();
    db.prepare(`
        DELETE FROM onboarding_events
        WHERE created_at < datetime('now', '-90 days')
    `).run();

    // Refresh planner statistics so the composite indexes get picked
    db.pragma('optimize');

    console.log('[DB] ✅ Database initialized successfully.');
}

// ─── User Helpers ─────────────────────────────────────────────

/**
 * Get or create a user by their Discord ID.
 */
function getOrCreateUser(discordId) {
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (!user) {
        db.prepare('INSERT INTO users (discord_id) VALUES (?)').run(discordId);
        user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    }
    syncUserTitles(discordId);
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
}

function unlockTitle(userId, titleKey) {
    const title = Titles[titleKey];
    if (!title || !userId) return null;
    const result = db.prepare(`
        INSERT OR IGNORE INTO user_titles (user_id, title_key)
        VALUES (?, ?)
    `).run(userId, titleKey);
    return result.changes > 0 ? title : null;
}

function syncUserTitles(userId) {
    const user = db.prepare('SELECT season_xp FROM users WHERE discord_id = ?').get(userId);
    if (!user) return [];

    const unlocked = [];
    for (const [titleKey, title] of Object.entries(Titles)) {
        let eligible = false;
        if (title.achievementKey) {
            eligible = Boolean(db.prepare(`
                SELECT 1 FROM user_achievements
                WHERE user_id = ? AND achievement_key = ?
            `).get(userId, title.achievementKey));
        } else if (title.seasonXp) {
            eligible = Number(user.season_xp || 0) >= title.seasonXp;
        }
        if (eligible) {
            const unlockedTitle = unlockTitle(userId, titleKey);
            if (unlockedTitle) unlocked.push(unlockedTitle);
        }
    }
    return unlocked;
}

function getUserTitles(userId) {
    syncUserTitles(userId);
    return db.prepare(`
        SELECT ut.title_key, ut.unlocked_at, u.active_title_key
        FROM user_titles ut
        JOIN users u ON u.discord_id = ut.user_id
        WHERE ut.user_id = ?
        ORDER BY ut.unlocked_at ASC, ut.id ASC
    `).all(userId).map(row => ({
        ...row,
        ...(Titles[row.title_key] || {}),
        active: row.active_title_key === row.title_key,
    }));
}

function getActiveTitle(userId) {
    const row = db.prepare(`
        SELECT u.active_title_key
        FROM users u
        JOIN user_titles ut ON ut.user_id = u.discord_id AND ut.title_key = u.active_title_key
        WHERE u.discord_id = ?
    `).get(userId);
    return row?.active_title_key ? Titles[row.active_title_key] || null : null;
}

function setActiveTitle(userId, titleKey) {
    if (titleKey !== null && !db.prepare(`
        SELECT 1 FROM user_titles WHERE user_id = ? AND title_key = ?
    `).get(userId, titleKey)) {
        return { success: false, reason: 'locked' };
    }
    db.prepare('UPDATE users SET active_title_key = ? WHERE discord_id = ?').run(titleKey, userId);
    return { success: true, title: titleKey ? Titles[titleKey] : null };
}

function getPremiumEntitlement(userId) {
    const entitlement = db.prepare(
        'SELECT * FROM premium_entitlements WHERE user_id = ?'
    ).get(userId);

    if (
        entitlement
        && entitlement.status === 'active'
        && entitlement.expires_at
        && entitlement.expires_at <= sqliteNow()
    ) {
        db.prepare(`
            UPDATE premium_entitlements
            SET status = 'expired', updated_at = datetime('now')
            WHERE user_id = ? AND status = 'active'
        `).run(userId);
        return db.prepare(
            'SELECT * FROM premium_entitlements WHERE user_id = ?'
        ).get(userId);
    }

    return entitlement;
}

function getOrCreateProProfileSettings(userId) {
    getOrCreateUser(userId);
    db.prepare(`
        INSERT INTO pro_profile_settings (user_id)
        VALUES (?)
        ON CONFLICT(user_id) DO NOTHING
    `).run(userId);
    return db.prepare(
        'SELECT * FROM pro_profile_settings WHERE user_id = ?'
    ).get(userId);
}

function updateProProfileSettings(userId, { accentKey, badgeKey }) {
    const current = getOrCreateProProfileSettings(userId);
    const nextAccent = accentKey || current.accent_key;
    const nextBadge = badgeKey || current.badge_key;
    if (!ProProfileAccents[nextAccent]) throw new RangeError('Invalid Pro profile accent');
    if (!ProProfileBadges[nextBadge]) throw new RangeError('Invalid Pro profile badge');

    db.prepare(`
        UPDATE pro_profile_settings
        SET accent_key = ?, badge_key = ?, updated_at = datetime('now')
        WHERE user_id = ?
    `).run(
        nextAccent,
        nextBadge,
        userId
    );
    return getOrCreateProProfileSettings(userId);
}

function recordStreakBreak(userId, previousStreak, gapDays, now = new Date()) {
    const safeStreak = Number(previousStreak);
    const safeGap = Number(gapDays);
    if (!Number.isInteger(safeStreak) || safeStreak < 2) return null;
    if (!Number.isInteger(safeGap) || safeGap < 2 || safeGap > 3) return null;

    getOrCreateUser(userId);
    const brokenAt = toSqliteDate(now);
    const expiresAt = toSqliteDate(new Date(now.getTime() + 48 * 60 * 60 * 1000));
    const result = db.prepare(`
        INSERT INTO streak_breaks (
            user_id, previous_streak, gap_days, broken_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, safeStreak, safeGap, brokenAt, expiresAt);

    return db.prepare('SELECT * FROM streak_breaks WHERE id = ?').get(result.lastInsertRowid);
}

function getStreakRecoveryStatus(userId, now = new Date()) {
    getOrCreateUser(userId);
    const nowValue = toSqliteDate(now);
    const candidate = db.prepare(`
        SELECT *
        FROM streak_breaks
        WHERE user_id = ?
          AND recovered_at IS NULL
          AND datetime(expires_at) >= datetime(?)
        ORDER BY id DESC
        LIMIT 1
    `).get(userId, nowValue) || null;
    const lastRecovery = db.prepare(`
        SELECT recovered_at
        FROM streak_breaks
        WHERE user_id = ? AND recovered_at IS NOT NULL
        ORDER BY datetime(recovered_at) DESC
        LIMIT 1
    `).get(userId) || null;
    const cooldownEndsAt = lastRecovery
        ? toSqliteDate(new Date(parseSqliteDate(lastRecovery.recovered_at).getTime() + 30 * 86400000))
        : null;
    const cooldownActive = Boolean(cooldownEndsAt && cooldownEndsAt > nowValue);

    return {
        available: Boolean(candidate) && !cooldownActive,
        candidate,
        lastRecoveredAt: lastRecovery?.recovered_at || null,
        cooldownEndsAt,
        cooldownActive,
    };
}

function recoverStreak(userId, now = new Date()) {
    return db.transaction(() => {
        const status = getStreakRecoveryStatus(userId, now);
        if (!status.candidate) return { ok: false, reason: 'none', ...status };
        if (status.cooldownActive) return { ok: false, reason: 'cooldown', ...status };

        const user = getOrCreateUser(userId);
        const currentStreak = Math.max(1, Number(user.streak) || 1);
        const restoredStreak = status.candidate.previous_streak + currentStreak;
        const recoveredAt = toSqliteDate(now);
        const claimed = db.prepare(`
            UPDATE streak_breaks
            SET recovered_at = ?
            WHERE id = ?
              AND recovered_at IS NULL
              AND datetime(expires_at) >= datetime(?)
        `).run(recoveredAt, status.candidate.id, recoveredAt);

        if (claimed.changes !== 1) {
            return { ok: false, reason: 'none', ...getStreakRecoveryStatus(userId, now) };
        }

        updateUser(userId, { streak: restoredStreak });
        return {
            ok: true,
            previousStreak: status.candidate.previous_streak,
            currentStreak,
            restoredStreak,
            recoveredAt,
        };
    })();
}

function recoverStreakWithWater(userId, waterCost = 50, now = new Date()) {
    return db.transaction(() => {
        const user = getOrCreateUser(userId);
        if ((user.water || 0) < waterCost) {
            return { ok: false, reason: 'insufficient_water', waterNeeded: waterCost, userWater: user.water || 0 };
        }
        const status = getStreakRecoveryStatus(userId, now);
        if (!status.candidate) return { ok: false, reason: 'none', ...status };

        const currentStreak = Math.max(1, Number(user.streak) || 1);
        const restoredStreak = status.candidate.previous_streak + currentStreak;
        const recoveredAt = toSqliteDate(now);
        const claimed = db.prepare(`
            UPDATE streak_breaks
            SET recovered_at = ?
            WHERE id = ?
              AND recovered_at IS NULL
              AND datetime(expires_at) >= datetime(?)
        `).run(recoveredAt, status.candidate.id, recoveredAt);

        if (claimed.changes !== 1) {
            return { ok: false, reason: 'none', ...getStreakRecoveryStatus(userId, now) };
        }

        updateUser(userId, {
            streak: restoredStreak,
            water: (user.water || 0) - waterCost,
        });

        return {
            ok: true,
            previousStreak: status.candidate.previous_streak,
            currentStreak,
            restoredStreak,
            recoveredAt,
            waterSpent: waterCost,
        };
    })();
}

function getUserExams(userId) {
    return db.prepare(`
        SELECT * FROM user_exams
        WHERE user_id = ?
        ORDER BY exam_date ASC
    `).all(userId);
}

function addUserExam(userId, title, examDate, targetHours = 0) {
    const res = db.prepare(`
        INSERT INTO user_exams (user_id, title, exam_date, target_hours)
        VALUES (?, ?, ?, ?)
    `).run(userId, title, examDate, targetHours);
    return res.lastInsertRowid;
}

function deleteUserExam(userId, examId) {
    const res = db.prepare(`
        DELETE FROM user_exams
        WHERE id = ? AND user_id = ?
    `).run(examId, userId);
    return res.changes > 0;
}

function createBuddyRequest(userId, guildId, subject, duration, mode) {
    return db.prepare(`
        INSERT INTO buddy_requests (user_id, guild_id, subject, duration, mode) VALUES (?, ?, ?, ?, ?)
    `).run(userId, guildId, subject, duration, mode);
}

function getWaitingBuddyRequests(guildId) {
    return db.prepare(`
        SELECT * FROM buddy_requests
        WHERE guild_id = ? AND status = 'waiting' AND user_id IS NOT NULL
          AND created_at >= datetime('now', '-30 minutes')
        ORDER BY created_at ASC
    `).all(guildId);
}

function matchBuddyRequest(requestId, matchedUserId, matchScore) {
    return db.prepare(`
        UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ?
    `).run(matchedUserId, matchScore, requestId);
}

function matchBuddyPair(requestId1, matchedUser1Id, requestId2, matchedUser2Id, matchScore) {
    try {
        return db.transaction(() => {
            let changes = 0;
            changes += db.prepare(`UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ? AND status = 'waiting'`)
                .run(matchedUser1Id, matchScore, requestId1).changes;
            changes += db.prepare(`UPDATE buddy_requests SET status = 'matched', matched_user_id = ?, match_score = ? WHERE id = ? AND status = 'waiting'`)
                .run(matchedUser2Id, matchScore, requestId2).changes;
            if (changes !== 2) throw new Error('PARTIAL_MATCH');
            return changes;
        })();
    } catch (_) {
        return 0;
    }
}

function endBuddyRequest(requestId, status = 'completed') {
    return db.prepare(`
        UPDATE buddy_requests SET status = ?, ended_at = datetime('now') WHERE id = ?
    `).run(status, requestId);
}

const BUDDY_DESTINATIONS = ['pending', 'own_server', 'study_hub', 'independent'];

function normalizeBuddyDestination(input) {
    if (typeof input !== 'string') return null;
    const key = input.trim().toLowerCase();
    if (key === 'pending' || key === 'own_server' || key === 'study_hub' || key === 'independent') return key;
    return null;
}

// Each matched user stores their own destination preference on their own
// matched request row. Only callable on an active ('matched') row owned by
// the user; ended/unmatched matches reject. History rows stay intact.
function setBuddyDestination(requestId, userId, choice) {
    const normalized = normalizeBuddyDestination(choice);
    if (!normalized || normalized === 'pending') return { ok: false, reason: 'invalid_choice' };
    const res = db.prepare(`
        UPDATE buddy_requests SET destination = ?
        WHERE id = ? AND user_id = ? AND status = 'matched'
    `).run(normalized, requestId, userId);
    if (res.changes !== 1) return { ok: false, reason: 'no_active_match' };
    return { ok: true, choice: normalized };
}

// Reads the current destination state of an active match from the caller's
// own matched request row. Returns per-user choices plus whether both sides
// agree on the same non-pending destination. Legacy NULL reads as 'pending'.
function getMatchDestinationState(myRequestId, userId) {
    const mine = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(myRequestId);
    if (!mine || mine.user_id !== userId || mine.status !== 'matched' || !mine.matched_user_id) {
        return { ok: false, reason: 'no_active_match' };
    }
    const partner = db.prepare(
        "SELECT * FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1"
    ).get(mine.matched_user_id, userId);
    if (!partner) {
        return { ok: false, reason: 'no_active_match' };
    }
    const myChoice = mine.destination || 'pending';
    const partnerChoice = partner.destination || 'pending';
    const confirmed = myChoice !== 'pending' && myChoice === partnerChoice;
    return {
        ok: true,
        myChoice,
        partnerChoice,
        partnerId: mine.matched_user_id,
        partnerRequestId: partner.id,
        confirmed,
        confirmedChoice: confirmed ? myChoice : null,
    };
}

// Canonical key for the two matched request rows of one match.
// Computed server-side only; never accepted from user input as-is.
function buddyMatchKey(reqIdA, reqIdB) {
    const a = Number(reqIdA);
    const b = Number(reqIdB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) return null;
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function recordHubConsent(matchKey, requestId, userId, decision) {
    if (!matchKey || !/^\d+:\d+$/.test(matchKey)) return { ok: false, reason: 'invalid_match' };
    // Accept both button values ('accept'/'decline') and stored canonical
    // values ('accepted'/'declined'); always store the canonical form.
    let canonical = null;
    if (decision === 'accepted' || decision === 'accept') canonical = 'accepted';
    else if (decision === 'declined' || decision === 'decline') canonical = 'declined';
    if (!userId || !canonical) return { ok: false, reason: 'invalid_decision' };
    if (!Number.isInteger(Number(requestId))) return { ok: false, reason: 'invalid_match' };
    const res = db.prepare(`
        INSERT INTO buddy_hub_consents (match_key, request_id, user_id, decision, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(match_key, user_id) DO UPDATE SET
            decision = excluded.decision,
            request_id = excluded.request_id,
            updated_at = datetime('now')
    `).run(matchKey, Number(requestId), userId, canonical);
    return { ok: true, changed: res.changes === 1 };
}

function getHubConsents(matchKey) {
    if (!matchKey) return [];
    return db.prepare('SELECT * FROM buddy_hub_consents WHERE match_key = ?').all(matchKey);
}

function clearHubConsents(matchKey, userId = null) {
    if (!matchKey) return { changes: 0 };
    if (userId) {
        return db.prepare('DELETE FROM buddy_hub_consents WHERE match_key = ? AND user_id = ?').run(matchKey, userId);
    }
    return db.prepare('DELETE FROM buddy_hub_consents WHERE match_key = ?').run(matchKey);
}

// Atomic invite claim: exactly one caller wins per match. Returns the
// existing row when already claimed so replays stay idempotent.
function claimHubInvite(matchKey, hubGuildId) {
    if (!matchKey || !/^\d+:\d+$/.test(matchKey) || !hubGuildId) {
        return { claimed: false, reason: 'invalid_match' };
    }
    const res = db.prepare(`
        INSERT OR IGNORE INTO buddy_hub_invites (match_key, hub_guild_id, status)
        VALUES (?, ?, 'pending')
    `).run(matchKey, hubGuildId);
    if (res.changes === 1) {
        return { claimed: true, isNew: true, row: getHubInvite(matchKey) };
    }
    const existing = getHubInvite(matchKey);
    if (existing && existing.status === 'sent') {
        return { claimed: false, existing, reason: 'already_sent' };
    }
    if (existing) {
        db.prepare("UPDATE buddy_hub_invites SET hub_guild_id = ?, status = 'pending' WHERE match_key = ?")
            .run(hubGuildId, matchKey);
        return { claimed: true, isNew: false, row: getHubInvite(matchKey) };
    }
    return { claimed: false, reason: 'claim_failed' };
}

function getHubInvite(matchKey) {
    if (!matchKey) return null;
    return db.prepare('SELECT * FROM buddy_hub_invites WHERE match_key = ?').get(matchKey) || null;
}

function markHubInviteSent(matchKey, url, code) {
    return db.prepare(`
        UPDATE buddy_hub_invites
        SET status = 'sent', invite_url = ?, invite_code = ?, sent_at = datetime('now')
        WHERE match_key = ?
    `).run(url || null, code || null, matchKey);
}

function markHubInviteFailed(matchKey) {
    return db.prepare(`
        UPDATE buddy_hub_invites SET status = 'failed' WHERE match_key = ?
    `).run(matchKey);
}

function isGlobalBuddyMatchingEnabled(guildId) {
    if (!guildId) return false;
    const settings = db.prepare('SELECT global_buddy_matching_enabled FROM guild_settings WHERE guild_id = ?').get(guildId);
    return Number(settings?.global_buddy_matching_enabled) === 1;
}

function isStudyHubEnabled(guildId) {
    if (!guildId) return false;
    const settings = db.prepare('SELECT study_hub_enabled FROM guild_settings WHERE guild_id = ?').get(guildId);
    return Number(settings?.study_hub_enabled) === 1;
}

function isStudyHubAcceptingGuests(guildId) {
    if (!guildId) return false;
    const settings = db.prepare('SELECT study_hub_accepts_guests FROM guild_settings WHERE guild_id = ?').get(guildId);
    return Number(settings?.study_hub_accepts_guests) === 1;
}

// Destination abstraction for future PomoMatch flows.
// Returns the minimal identifier set of currently eligible Study Hubs:
// Study Hub enabled + accepting guests + Global PomoMatch enabled.
// Live checks (bot present, channel permissions) belong to the future
// invite/destination flow, not to this foundation query.
// Never expose member lists or private server data through this helper.
function getEligibleStudyHubs() {
    return db.prepare(`
        SELECT guild_id FROM guild_settings
        WHERE COALESCE(study_hub_enabled, 0) = 1
          AND COALESCE(study_hub_accepts_guests, 0) = 1
          AND COALESCE(global_buddy_matching_enabled, 0) = 1
        ORDER BY guild_id ASC
    `).all().map(r => r.guild_id);
}

function getGlobalWaitingBuddyRequests() {
    return db.prepare(`
        SELECT br.* FROM buddy_requests br
        JOIN guild_settings gs ON gs.guild_id = br.guild_id
        WHERE br.status = 'waiting' AND br.user_id IS NOT NULL
          AND br.created_at >= datetime('now', '-30 minutes')
          AND COALESCE(gs.global_buddy_matching_enabled, 0) = 1
        ORDER BY br.created_at ASC
    `).all();
}

function expireStaleBuddyRequests() {
    return db.prepare(`
        UPDATE buddy_requests
        SET status = 'expired', ended_at = datetime('now')
        WHERE status = 'waiting' AND created_at < datetime('now', '-30 minutes')
    `).run();
}

// ─── PomoMatch Analytics (Sprint 6H, privacy-safe) ─────────────
// Minimal event log: stable names + the minimum identifiers needed for
// aggregation (user/guild for unique counts + server stats, request/match
// refs for funnel joins, scope for local/global split). No names, messages,
// subjects, locations, or member lists are ever stored here.
const BUDDY_EVENT_NAMES = [
    'buddy_request_created',
    'buddy_candidate_shown',
    'buddy_like',
    'buddy_pass',
    'buddy_block',
    'buddy_match_created',
    'buddy_unmatch',
    'buddy_report',
    'buddy_destination_selected',
    'buddy_destination_confirmed',
    'buddy_hub_consent_accepted',
    'buddy_hub_consent_declined',
    'buddy_hub_invite_sent',
    'buddy_hub_invite_failed',
    'buddy_study_session_started',
    'buddy_study_session_completed',
];

const BUDDY_EVENT_SCOPES = ['local', 'global'];

// Never throws: analytics must never break the user flow. Returns true when
// the event was recorded, false when skipped (unknown name) or failed.
function recordBuddyEvent(eventName, fields = {}) {
    try {
        if (!BUDDY_EVENT_NAMES.includes(eventName)) return false;
        const userId = fields.userId || null;
        const guildId = fields.guildId || null;
        const requestId = Number.isInteger(fields.requestId) ? fields.requestId : null;
        const matchKey = (typeof fields.matchKey === 'string' && /^\d+:\d+$/.test(fields.matchKey))
            ? fields.matchKey
            : null;
        const scope = BUDDY_EVENT_SCOPES.includes(fields.scope) ? fields.scope : null;
        db.prepare(`
            INSERT INTO buddy_analytics_events (event_name, user_id, guild_id, request_id, match_key, scope)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(eventName, userId, guildId, requestId, matchKey, scope);
        return true;
    } catch (_) {
        return false;
    }
}

// Aggregate funnel over a UTC window. days: 1 (today-ish, last 24h), 7, 30,
// or 0/null for all time. guildId scopes to one server (admin stats);
// without it the numbers are global. All rates are zero-guarded.
function getBuddyFunnelStats({ days = 7, guildId = null } = {}) {
    const safeDays = [0, 1, 7, 30].includes(Number(days)) ? Number(days) : 7;
    const since = safeDays > 0 ? `datetime('now', '-${safeDays} days')` : null;
    const timeFilter = since ? `AND created_at >= ${since}` : '';
    const guildFilter = guildId ? 'AND guild_id = ?' : '';
    const params = guildId ? [guildId] : [];

    const count = (name, extra = '', extraParams = []) => db.prepare(`
        SELECT COUNT(*) AS c FROM buddy_analytics_events
        WHERE event_name = ? ${timeFilter} ${guildFilter} ${extra}
    `).get(name, ...params, ...extraParams).c;

    const distinctUsers = (name) => db.prepare(`
        SELECT COUNT(DISTINCT user_id) AS c FROM buddy_analytics_events
        WHERE event_name = ? AND user_id IS NOT NULL ${timeFilter} ${guildFilter}
    `).get(name, ...params).c;

    const scopeCount = (name, scope) => db.prepare(`
        SELECT COUNT(*) AS c FROM buddy_analytics_events
        WHERE event_name = ? AND scope = ? ${timeFilter} ${guildFilter}
    `).get(name, scope, ...params).c;

    const byName = {};
    for (const name of BUDDY_EVENT_NAMES) {
        byName[name] = count(name);
    }

    const requests = byName.buddy_request_created;
    const requestingUsers = distinctUsers('buddy_request_created');
    const candidatesShown = byName.buddy_candidate_shown;
    const likes = byName.buddy_like;
    const passes = byName.buddy_pass;
    const blocks = byName.buddy_block;
    const matches = byName.buddy_match_created;
    const matchedUsers = distinctUsers('buddy_match_created');
    const localMatches = scopeCount('buddy_match_created', 'local');
    const globalMatches = scopeCount('buddy_match_created', 'global');
    const destinationsSelected = byName.buddy_destination_selected;
    const destinationsConfirmed = byName.buddy_destination_confirmed;
    const consentsAccepted = byName.buddy_hub_consent_accepted;
    const consentsDeclined = byName.buddy_hub_consent_declined;
    const invitesSent = byName.buddy_hub_invite_sent;
    const invitesFailed = byName.buddy_hub_invite_failed;
    const sessionsStarted = byName.buddy_study_session_started;
    const sessionsCompleted = byName.buddy_study_session_completed;

    const repeatUsers = (() => {
        const row = db.prepare(`
            SELECT COUNT(*) AS c FROM (
                SELECT user_id FROM buddy_analytics_events
                WHERE event_name = 'buddy_request_created' AND user_id IS NOT NULL
                ${timeFilter} ${guildFilter}
                GROUP BY user_id HAVING COUNT(*) >= 2
            )
        `).get(...params);
        return row ? row.c : 0;
    })();

    const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    return {
        window: { days: safeDays, guildId: guildId || null },
        requests,
        requestingUsers,
        candidatesShown,
        likes,
        passes,
        blocks,
        matches,
        matchedUsers,
        localMatches,
        globalMatches,
        destinationsSelected,
        destinationsConfirmed,
        consentsAccepted,
        consentsDeclined,
        invitesSent,
        invitesFailed,
        sessionsStarted,
        sessionsCompleted,
        repeatUsers,
        rates: {
            likeRate: rate(likes, candidatesShown),
            passRate: rate(passes, candidatesShown),
            blockRate: rate(blocks, candidatesShown),
            matchRate: rate(matches, likes),
            destinationRate: rate(destinationsSelected, matches),
            confirmRate: rate(destinationsConfirmed, destinationsSelected),
            consentRate: rate(consentsAccepted, consentsAccepted + consentsDeclined),
            inviteSuccessRate: rate(invitesSent, invitesSent + invitesFailed),
            sessionConversion: rate(sessionsStarted, matches),
            completionRate: rate(sessionsCompleted, sessionsStarted),
            globalShare: rate(globalMatches, matches),
        },
    };
}

function isBuddyBlocked(userA, userB) {
    const row = db.prepare(`
        SELECT 1 FROM buddy_blocks
        WHERE (blocker_id = ? AND blocked_id = ?)
           OR (blocker_id = ? AND blocked_id = ?)
        LIMIT 1
    `).get(userA, userB, userB, userA);
    return Boolean(row);
}

function isBuddyUnmatched(userA, userB) {
    const row = db.prepare(`
        SELECT 1 FROM buddy_unmatches
        WHERE (unmatcher_id = ? AND unmatched_id = ?)
           OR (unmatcher_id = ? AND unmatched_id = ?)
        LIMIT 1
    `).get(userA, userB, userB, userA);
    return Boolean(row);
}

function hasBuddyMatchHistory(userA, userB) {
    const row = db.prepare(`
        SELECT 1 FROM buddy_requests
        WHERE ((user_id = ? AND matched_user_id = ?)
           OR (user_id = ? AND matched_user_id = ?))
          AND status IN ('matched', 'unmatched')
        LIMIT 1
    `).get(userA, userB, userB, userA);
    return Boolean(row);
}

function unmatchBuddyPair(userId, requestId = null) {
    let myReq;
    if (requestId != null) {
        myReq = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(requestId);
        if (!myReq || myReq.user_id !== userId || myReq.status !== 'matched' || !myReq.matched_user_id) {
            return { ok: false, reason: 'no_active_match' };
        }
    } else {
        myReq = db.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1").get(userId);
        if (!myReq || !myReq.matched_user_id) {
            return { ok: false, reason: 'no_active_match' };
        }
    }
    const partnerId = myReq.matched_user_id;
    const partnerReq = db.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1")
        .get(partnerId, userId);

    try {
        return db.transaction(() => {
            let changes = 0;
            changes += db.prepare("UPDATE buddy_requests SET status = 'unmatched', ended_at = datetime('now') WHERE id = ? AND status = 'matched'")
                .run(myReq.id).changes;
            if (partnerReq) {
                changes += db.prepare("UPDATE buddy_requests SET status = 'unmatched', ended_at = datetime('now') WHERE id = ? AND status = 'matched'")
                    .run(partnerReq.id).changes;
            }
            if (changes < 1) throw new Error('NO_MATCH');
            db.prepare('INSERT OR IGNORE INTO buddy_unmatches (unmatcher_id, unmatched_id) VALUES (?, ?)')
                .run(userId, partnerId);
            return { ok: true, partnerId, myRequestId: myReq.id, partnerRequestId: partnerReq ? partnerReq.id : null };
        })();
    } catch (_) {
        return { ok: false, reason: 'no_active_match' };
    }
}

const BUDDY_REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'fake', 'other'];

const BUDDY_REPORT_REASON_ALIASES = {
    'suspicious': 'fake',
    'fake profile': 'fake',
    'fake-profile': 'fake',
    'fakeprofile': 'fake',
    'abuse': 'harassment',
    'inappropriate behavior': 'inappropriate',
    'inappropriate behaviour': 'inappropriate',
};

function normalizeBuddyReportReason(input) {
    if (typeof input !== 'string') return null;
    const key = input.trim().toLowerCase();
    if (BUDDY_REPORT_REASONS.includes(key)) return key;
    if (Object.prototype.hasOwnProperty.call(BUDDY_REPORT_REASON_ALIASES, key)) {
        return BUDDY_REPORT_REASON_ALIASES[key];
    }
    return null;
}

function countBuddyReportsToday(reporterId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS c FROM buddy_reports
        WHERE reporter_user_id = ? AND created_at >= datetime('now', '-24 hours')
    `).get(reporterId);
    return row ? Number(row.c) : 0;
}

const BUDDY_REPORT_DAILY_LIMIT = 5;

function createBuddyReport({ reporterId, reportedId, requestId = null, reason, description = null }) {
    const normalized = normalizeBuddyReportReason(reason);
    if (!normalized) return { ok: false, reason: 'invalid_reason' };
    if (!reporterId || !reportedId || reporterId === reportedId) return { ok: false, reason: 'self_report' };
    if (!hasBuddyMatchHistory(reporterId, reportedId)) return { ok: false, reason: 'no_match_history' };

    const dup = db.prepare(`
        SELECT 1 FROM buddy_reports
        WHERE reporter_user_id = ? AND reported_user_id = ? AND status = 'open'
        LIMIT 1
    `).get(reporterId, reportedId);
    if (dup) return { ok: false, reason: 'duplicate_open' };

    if (countBuddyReportsToday(reporterId) >= BUDDY_REPORT_DAILY_LIMIT) {
        return { ok: false, reason: 'rate_limited' };
    }

    let storedRequestId = null;
    if (Number.isInteger(requestId)) {
        const req = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(requestId);
        if (req && (req.user_id === reporterId || req.user_id === reportedId)) {
            storedRequestId = requestId;
        }
    }

    const cleanDescription = typeof description === 'string' && description.trim()
        ? description.trim().slice(0, 500)
        : null;

    try {
        const res = db.prepare(`
            INSERT INTO buddy_reports (reporter_user_id, reported_user_id, request_id, reason, description)
            VALUES (?, ?, ?, ?, ?)
        `).run(reporterId, reportedId, storedRequestId, normalized, cleanDescription);
        return { ok: true, id: Number(res.lastInsertRowid), reason: normalized };
    } catch (_) {
        return { ok: false, reason: 'duplicate_open' };
    }
}

function countRecentBuddyRequests(userId, minutes) {
    const row = db.prepare(`
        SELECT COUNT(*) AS c FROM buddy_requests
        WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' minutes')
    `).get(userId, minutes);
    return row ? Number(row.c) : 0;
}

function recordBuddySwipe(swiperId, targetUserId, targetRequestId, action) {
    if (action !== 'like' && action !== 'pass') return { created: false };
    if (!swiperId || !targetUserId || swiperId === targetUserId) return { created: false };
    const res = db.prepare(`
        INSERT OR IGNORE INTO buddy_swipes (swiper_id, target_user_id, target_request_id, action)
        VALUES (?, ?, ?, ?)
    `).run(swiperId, targetUserId, targetRequestId, action);
    return { created: res.changes === 1 };
}

function hasBuddyLiked(likerId, likedUserId) {
    const row = db.prepare(`
        SELECT 1 FROM buddy_swipes
        WHERE swiper_id = ? AND target_user_id = ? AND action = 'like'
        LIMIT 1
    `).get(likerId, likedUserId);
    return Boolean(row);
}

function getBuddyActedUserIds(swiperId) {
    return db.prepare(`
        SELECT DISTINCT target_user_id AS user_id FROM buddy_swipes
        WHERE swiper_id = ?
    `).all(swiperId).map(r => r.user_id);
}

function blockBuddyUser(blockerId, blockedId) {
    if (!blockerId || !blockedId || blockerId === blockedId) return { created: false };
    const res = db.prepare(`
        INSERT OR IGNORE INTO buddy_blocks (blocker_id, blocked_id)
        VALUES (?, ?)
    `).run(blockerId, blockedId);
    return { created: res.changes === 1 };
}

function addGoalToSession(sessionId, goalText) {
    return db.prepare(`INSERT INTO study_session_goals (session_id, goal_text) VALUES (?, ?)`).run(sessionId, goalText);
}

function completeGoalForSession(sessionId, outcome) {
    return db.prepare(`UPDATE study_session_goals SET completed = 1 WHERE session_id = ?`).run(sessionId);
    // outcome is saved in study_sessions table
}

// ─── Challenge Helpers ──────────────────────────────────────────

function createChallenge(creatorId, guildId, title, challengeType, targetValue, endDate) {
    const res = db.prepare(`
        INSERT INTO challenges (creator_id, guild_id, title, challenge_type, target_value, end_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(creatorId, guildId, title, challengeType, targetValue, endDate);
    return res;
}

function getActiveChallengesForGuild(guildId) {
    return db.prepare(`
        SELECT c.*, cm.member_count FROM challenges c
        LEFT JOIN (SELECT challenge_id, COUNT(*) as member_count FROM challenge_members GROUP BY challenge_id) cm ON cm.challenge_id = c.id
        WHERE c.guild_id = ? AND c.status = 'active'
          AND datetime(c.end_date) >= datetime('now')
        ORDER BY c.created_at DESC
    `).all(guildId);
}

function getActiveChallengesForUser(userId, guildId) {
    return db.prepare(`
        SELECT c.id, c.challenge_type, c.target_value, c.end_date, cm.progress
        FROM challenges c
        JOIN challenge_members cm ON cm.challenge_id = c.id
        WHERE cm.user_id = ? AND c.guild_id = ? AND c.status = 'active'
          AND datetime(c.end_date) > datetime('now')
    `).all(userId, guildId);
}

function getChallengeById(challengeId) {
    return db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId);
}

function joinChallenge(challengeId, userId) {
    const res = db.prepare(`
        INSERT OR IGNORE INTO challenge_members (challenge_id, user_id) VALUES (?, ?)
    `).run(challengeId, userId);
    return res;
}

function getChallengeLeaderboard(challengeId) {
    return db.prepare(`
        SELECT cm.*, u.discord_id, u.level FROM challenge_members cm
        JOIN users u ON u.discord_id = cm.user_id
        WHERE cm.challenge_id = ?
        ORDER BY cm.progress DESC
    `).all(challengeId);
}

function updateChallengeProgress(challengeId, userId, minutes) {
    db.prepare(`
        UPDATE challenge_members SET progress = progress + ? WHERE challenge_id = ? AND user_id = ?
    `).run(minutes, challengeId, userId);
}


function grantPremium({
    userId,
    durationDays,
    grantedBy,
    note = null,
    planKey = 'pro_beta',
    source = 'manual_beta',
}) {
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        throw new RangeError('durationDays must be an integer between 1 and 3650');
    }

    getOrCreateUser(userId);

    return db.transaction(() => {
        const existing = getPremiumEntitlement(userId);
        const now = new Date();
        const existingExpiry = existing?.status === 'active' && existing.expires_at
            ? parseSqliteDate(existing.expires_at)
            : null;
        const base = existingExpiry && existingExpiry > now ? existingExpiry : now;
        const expiresAt = new Date(base.getTime() + durationDays * 86400000);

        db.prepare(`
            INSERT INTO premium_entitlements (
                user_id, plan_key, status, source, starts_at, expires_at,
                granted_by, note, provider_ref, created_at, updated_at, revoked_at
            )
            VALUES (?, ?, 'active', ?, datetime('now'), ?, ?, ?, NULL, datetime('now'), datetime('now'), NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                plan_key = excluded.plan_key,
                status = 'active',
                source = excluded.source,
                starts_at = CASE
                    WHEN premium_entitlements.status = 'active' THEN premium_entitlements.starts_at
                    ELSE excluded.starts_at
                END,
                expires_at = excluded.expires_at,
                granted_by = excluded.granted_by,
                note = excluded.note,
                provider_ref = NULL,
                updated_at = datetime('now'),
                revoked_at = NULL
        `).run(
            userId,
            planKey,
            source,
            toSqliteDate(expiresAt),
            grantedBy || null,
            note,
        );

        db.prepare(`
            INSERT INTO premium_events (
                user_id, action, plan_key, source, duration_days, actor_id, note
            )
            VALUES (?, 'grant', ?, ?, ?, ?, ?)
        `).run(userId, planKey, source, durationDays, grantedBy || null, note);

        return getPremiumEntitlement(userId);
    })();
}

function revokePremium(userId, revokedBy, note = null) {
    const user = getOrCreateUser(userId);

    return db.transaction(() => {
        const existing = getPremiumEntitlement(userId);
        const result = db.prepare(`
            UPDATE premium_entitlements
            SET status = 'revoked',
                revoked_at = datetime('now'),
                updated_at = datetime('now'),
                granted_by = COALESCE(granted_by, ?),
                note = COALESCE(?, note)
            WHERE user_id = ? AND status = 'active'
        `).run(revokedBy || null, note, userId);

        if (!existing) {
            db.prepare(`
                INSERT INTO premium_entitlements (
                    user_id, plan_key, status, source, starts_at, expires_at,
                    granted_by, note, created_at, updated_at, revoked_at
                )
                VALUES (?, 'pro_beta', 'revoked', 'manual_beta', datetime('now'), NULL,
                        ?, ?, datetime('now'), datetime('now'), datetime('now'))
            `).run(userId, revokedBy || null, note);
        }

        db.prepare('UPDATE users SET premium = 0 WHERE discord_id = ?').run(userId);
        db.prepare(`
            INSERT INTO premium_events (
                user_id, action, plan_key, source, actor_id, note
            )
            VALUES (?, 'revoke', ?, ?, ?, ?)
        `).run(
            userId,
            existing?.plan_key || 'pro_beta',
            existing?.source || 'manual_beta',
            revokedBy || null,
            note,
        );

        return result.changes > 0 || user.premium === 1;
    })();
}

function listActivePremiumEntitlements(limit = 25) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    return db.prepare(`
        SELECT *
        FROM premium_entitlements
        WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY
            CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
            expires_at ASC
        LIMIT ?
    `).all(safeLimit);
}

function expirePremiumEntitlements() {
    const expired = db.prepare(`
        SELECT user_id
        FROM premium_entitlements
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at <= datetime('now')
    `).all();

    if (expired.length > 0) {
        db.prepare(`
            UPDATE premium_entitlements
            SET status = 'expired', updated_at = datetime('now')
            WHERE status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at <= datetime('now')
        `).run();
    }

    return expired;
}

function getPremiumEvents(userId, limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    return db.prepare(`
        SELECT *
        FROM premium_events
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(userId, safeLimit);
}

function sqliteNow() {
    return db.prepare("SELECT datetime('now') as value").get().value;
}

function parseSqliteDate(value) {
    return new Date(`${value.replace(' ', 'T')}Z`);
}

function toSqliteDate(value) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Update specific fields on a user.
 */
function updateUser(discordId, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(discordId);
    db.prepare(`UPDATE users SET ${sets} WHERE discord_id = ?`).run(...values);
}

/**
 * Increment a numeric field on a user.
 */
function incrementUser(discordId, field, amount) {
    db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE discord_id = ?`).run(amount, discordId);
    
    // Also track seasonal counterparts if applicable
    if (field === 'xp') {
        db.prepare(`UPDATE users SET season_xp = season_xp + ? WHERE discord_id = ?`).run(amount, discordId);
    } else if (field === 'total_focus_minutes') {
        db.prepare(`UPDATE users SET season_focus_minutes = season_focus_minutes + ? WHERE discord_id = ?`).run(amount, discordId);
    }

    if (field === 'xp' || field === 'total_focus_minutes') syncUserTitles(discordId);

}

/**
 * Safely deduct water atomically to prevent race condition exploits.
 * Returns true if successful, false if insufficient balance.
 */
function deductWaterAtomic(discordId, amount) {
    const result = db.prepare('UPDATE users SET water = water - ? WHERE discord_id = ? AND water >= ?').run(amount, discordId, amount);
    return result.changes > 0;
}

// ─── Settings Helpers ─────────────────────────────────────────

/**
 * Get or create settings for a user.
 */
function getOrCreateSettings(discordId) {
    let settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(discordId);
    if (!settings) {
        db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(discordId);
        settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(discordId);
    }
    return settings;
}

// ─── Session Helpers ──────────────────────────────────────────

/**
 * Create a study session.
 */
function createSession(userId, guildId, channelId, messageId, duration, title, todoId = null, subject = 'general') {
    const stmt = db.prepare(
        `INSERT INTO study_sessions (user_id, guild_id, channel_id, message_id, duration, ends_at, title, todo_id, subject)
         VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'), ?, ?, ?)`
    );
    const result = stmt.run(userId, guildId, channelId, messageId, duration, duration, title, todoId, subject || 'general');
    // Minimal PomoMatch reference: tag real (non-break) sessions started while
    // the user has an active match. Wrapped so session creation never breaks.
    try {
        if (title !== '__break__') {
            const match = db.prepare(
                "SELECT id, matched_user_id FROM buddy_requests WHERE user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1"
            ).get(userId);
            if (match && match.matched_user_id) {
                const partnerReq = db.prepare(
                    "SELECT id FROM buddy_requests WHERE user_id = ? AND matched_user_id = ? AND status = 'matched' ORDER BY id DESC LIMIT 1"
                ).get(match.matched_user_id, userId);
                if (partnerReq) {
                    const key = buddyMatchKey(match.id, partnerReq.id);
                    if (key) {
                        db.prepare('UPDATE study_sessions SET buddy_match_key = ? WHERE id = ?').run(key, result.lastInsertRowid);
                        recordBuddyEvent('buddy_study_session_started', {
                            userId,
                            guildId,
                            requestId: match.id,
                            matchKey: key,
                            scope: buddyMatchScope(key),
                        });
                    }
                }
            }
        }
    } catch (_) {}
    return result.lastInsertRowid;
}

// Local/global classification of a match from its two request rows.
function buddyMatchScope(matchKey) {
    try {
        if (!matchKey || !/^\d+:\d+$/.test(matchKey)) return null;
        const [a, b] = matchKey.split(':').map(Number);
        const rows = db.prepare('SELECT id, guild_id FROM buddy_requests WHERE id IN (?, ?)').all(a, b);
        if (rows.length !== 2) return null;
        return rows[0].guild_id === rows[1].guild_id ? 'local' : 'global';
    } catch (_) {
        return null;
    }
}

/**
 * Update a session to attach pomodoro_data
 */
function updateSessionPomodoroData(sessionId, pomodoroData) {
    db.prepare('UPDATE study_sessions SET pomodoro_data = ? WHERE id = ?').run(JSON.stringify(pomodoroData), sessionId);
}

/**
 * Update a team session to attach pomodoro_data
 */
function updateTeamSessionPomodoroData(sessionId, pomodoroData) {
    db.prepare('UPDATE team_sessions SET pomodoro_data = ? WHERE id = ?').run(JSON.stringify(pomodoroData), sessionId);
}

/**
 * Get all active (uncompleted) sessions.
 */
function getActiveSessions() {
    return db.prepare('SELECT * FROM study_sessions WHERE completed = 0').all();
}

/**
 * Get the active session for a specific user.
 */
function getActiveSessionForUser(userId) {
    return db.prepare('SELECT * FROM study_sessions WHERE user_id = ? AND completed = 0').get(userId);
}

/**
 * Mark a session as completed.
 */
/**
 * Mark a session completed. Returns true only for the call that actually
 * flipped it, so callers can avoid granting rewards twice.
 */
function completeSession(sessionId) {
    let claimed = false;
    try {
        const row = db.prepare('SELECT user_id, guild_id, completed, buddy_match_key FROM study_sessions WHERE id = ?').get(sessionId);
        claimed = db.prepare('UPDATE study_sessions SET completed = 1 WHERE id = ? AND completed = 0').run(sessionId).changes > 0;
        if (claimed && row && row.buddy_match_key) {
            recordBuddyEvent('buddy_study_session_completed', {
                userId: row.user_id,
                guildId: row.guild_id,
                matchKey: row.buddy_match_key,
                scope: buddyMatchScope(row.buddy_match_key),
            });
        }
    } catch (_) {
        if (!claimed) {
            try {
                claimed = db.prepare('UPDATE study_sessions SET completed = 1 WHERE id = ? AND completed = 0').run(sessionId).changes > 0;
            } catch (_) {}
        }
    }
    return claimed;
}

/**
 * Delete a session (for cancellation).
 */
function deleteSession(sessionId) {
    db.prepare('DELETE FROM study_sessions WHERE id = ?').run(sessionId);
}

/**
 * Mark reminder as sent.
 */
function markReminderSent(sessionId) {
    db.prepare('UPDATE study_sessions SET reminder_sent = 1 WHERE id = ?').run(sessionId);
}

/**
 * Get the last 25 unique study session titles for a user (for autocomplete).
 * Excludes break sessions (title = '__break__') and null titles.
 */
function getPastSessionTitles(discordId) {
    return db.prepare(
        `SELECT DISTINCT title FROM study_sessions
         WHERE user_id = ? AND title IS NOT NULL AND title != '__break__' AND title != 'Study Session'
         ORDER BY id DESC
         LIMIT 25`
    ).all(discordId).map(row => row.title);
}

/** Check if user is in any active solo or team session */
function isUserInAnyActiveSession(userId) {
    const solo = db.prepare('SELECT 1 FROM study_sessions WHERE user_id = ? AND completed = 0').get(userId);
    if (solo) return true;
    
    const team = db.prepare(`
        SELECT 1 FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE tm.user_id = ? AND ts.status IN ('waiting', 'active', 'break')
    `).get(userId);
    
    return !!team;
}

// ─── Friends & Social ─────────────────────────────────────────────

function getFriends(userId) {
    const friendRows = db.prepare(`
        SELECT CASE
            WHEN sender_id = ? THEN receiver_id
            ELSE sender_id
        END as friend_id
        FROM friends
        WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
    `).all(userId, userId, userId);

    return friendRows.map(f => f.friend_id);
}

function getPendingRequests(userId) {
    // Return people who have sent the current user a request, and a status
    return db.prepare("SELECT sender_id, created_at FROM friends WHERE receiver_id = ? AND status = 'pending'").all(userId);
}

function sendFriendRequest(senderId, receiverId) {
    const existing = db.prepare(`
        SELECT * FROM friends
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).get(senderId, receiverId, receiverId, senderId);

    if (existing) {
        if (existing.status === 'accepted') return { success: false, reason: 'already_friends' };
        if (existing.sender_id === senderId) return { success: false, reason: 'already_sent' };
        if (existing.sender_id === receiverId) {
            // Auto accept if they already sent one to you
            acceptFriendRequest(receiverId, senderId);
            return { success: true, reason: 'auto_accepted' };
        }
    }

    db.prepare('INSERT INTO friends (sender_id, receiver_id) VALUES (?, ?)').run(senderId, receiverId);
    return { success: true, reason: 'sent' };
}

function acceptFriendRequest(senderId, receiverId) {
    const res = db.prepare(`
        UPDATE friends SET status = 'accepted'
        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `).run(senderId, receiverId);
    return res.changes > 0;
}

function removeFriend(userId1, userId2) {
    const res = db.prepare(`
        DELETE FROM friends
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).run(userId1, userId2, userId2, userId1);
    return res.changes > 0;
}

function canNotifyFriend(friendId) {
    const settings = getOrCreateSettings(friendId);
    return settings && settings.notify_friends === 1;
}

// ─── Pets ─────────────────────────────────────────────────────
function getUserPets(userId) {
    return db.prepare('SELECT * FROM user_pets WHERE user_id = ? ORDER BY level DESC, xp DESC').all(userId);
}

function getActivePet(userId) {
    return db.prepare('SELECT * FROM user_pets WHERE user_id = ? AND is_active = 1').get(userId);
}

function addPet(userId, petKey) {
    try {
        db.prepare('INSERT INTO user_pets (user_id, pet_key) VALUES (?, ?)').run(userId, petKey);
        // Automatically equip if it's their first pet
        const pets = getUserPets(userId);
        if (pets.length === 1) {
            db.prepare('UPDATE user_pets SET is_active = 1 WHERE user_id = ? AND pet_key = ?').run(userId, petKey);
        }
        return true;
    } catch {
        return false;
    }
}

function equipPet(userId, petKey) {
    db.prepare('UPDATE user_pets SET is_active = 0 WHERE user_id = ?').run(userId);
    const info = db.prepare('UPDATE user_pets SET is_active = 1 WHERE user_id = ? AND pet_key = ?').run(userId, petKey);
    return info.changes > 0;
}

function awardPetXP(userId, addedXP) {
    const pet = getActivePet(userId);
    if (!pet) return null;

    // Evolved pets gain 1.5× XP — reward the grind
    const effectiveXP = pet.evolved === 1 ? Math.round(addedXP * 1.5) : addedXP;

    db.prepare('UPDATE user_pets SET xp = xp + ? WHERE id = ?').run(effectiveXP, pet.id);
    
    // Check for level up: xpNeeded = currentLevel * 50
    const updatedPet = db.prepare('SELECT * FROM user_pets WHERE id = ?').get(pet.id);
    let currentLevel = updatedPet.level;
    let nextLevelXP = currentLevel * 50;

    let levelUp = false;
    while (updatedPet.xp >= nextLevelXP && currentLevel < 10) {
        updatedPet.xp -= nextLevelXP;
        currentLevel++;
        levelUp = true;
        nextLevelXP = currentLevel * 50;
    }

    if (levelUp || updatedPet.xp < 0) {
        db.prepare('UPDATE user_pets SET level = ?, xp = ? WHERE id = ?').run(currentLevel, updatedPet.xp, pet.id);
        updatedPet.level = currentLevel;
    }

    return { pet: updatedPet, leveledUp: levelUp, effectiveXP };
}

// ─── To-Do Helpers ────────────────────────────────────────────

/**
 * Add a new todo for a user. Max 10 active todos.
 * Returns { success, todo, reason }.
 */
function addTodo(userId, content) {
    const activeCount = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE user_id = ? AND completed = 0').get(userId).cnt;
    if (activeCount >= 10) return { success: false, reason: 'limit' };
    const result = db.prepare('INSERT INTO todos (user_id, content) VALUES (?, ?)').run(userId, content);
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
    return { success: true, todo };
}

/**
 * Get all active (incomplete) todos for a user.
 */
function getActiveTodos(userId) {
    return db.prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 0 ORDER BY id ASC').all(userId);
}

function getActiveTodoByPosition(userId, position) {
    const todos = getActiveTodos(userId);
    return todos[position - 1] || null;
}

function getTodoByIdForUser(userId, todoId) {
    return db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId) || null;
}

function addFocusMinutesToTodo(userId, todoId, minutes) {
    const todo = getTodoByIdForUser(userId, todoId);
    if (!todo) return null;
    db.prepare(`
        UPDATE todos
        SET focus_minutes = COALESCE(focus_minutes, 0) + ?
        WHERE id = ? AND user_id = ?
    `).run(minutes, todoId, userId);
    return getTodoByIdForUser(userId, todoId);
}

/**
 * Mark a todo as completed by its list position (1-indexed).
 * Returns { success, todo, reason }.
 */
function completeTodo(userId, position) {
    const todos = getActiveTodos(userId);
    const todo = todos[position - 1];
    if (!todo) return { success: false, reason: 'not_found' };
    db.prepare("UPDATE todos SET completed = 1, completed_at = datetime('now') WHERE id = ?").run(todo.id);
    return { success: true, todo };
}

/**
 * Delete a todo by its list position (1-indexed).
 * Returns { success, todo, reason }.
 */
function deleteTodo(userId, position) {
    const todos = getActiveTodos(userId);
    const todo = todos[position - 1];
    if (!todo) return { success: false, reason: 'not_found' };
    db.prepare('DELETE FROM todos WHERE id = ?').run(todo.id);
    return { success: true, todo };
}

/**
 * Get the last 5 completed todos for a user.
 */
function getCompletedTodos(userId) {
    return db.prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 1 ORDER BY completed_at DESC LIMIT 5').all(userId);
}

// ─── Study Plan Helpers ───────────────────────────────────────────

function createStudyPlan({ hostId, guildId, channelId, title, scheduledAt, duration, breakDuration, cycles, limitCount }) {
    const result = db.prepare(`
        INSERT INTO study_plans (host_id, guild_id, channel_id, title, scheduled_at, duration, break_duration, cycles, limit_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(hostId, guildId, channelId, title, scheduledAt, duration, breakDuration ?? null, cycles ?? 4, limitCount ?? 10);
    return db.prepare('SELECT * FROM study_plans WHERE id = ?').get(result.lastInsertRowid);
}

function getStudyPlan(planId) {
    return db.prepare('SELECT * FROM study_plans WHERE id = ?').get(planId);
}

function updatePlanMessageId(planId, messageId) {
    db.prepare('UPDATE study_plans SET message_id = ? WHERE id = ?').run(messageId, planId);
}

function updatePlanStatus(planId, status) {
    db.prepare('UPDATE study_plans SET status = ? WHERE id = ?').run(status, planId);
}

function getPlanSignups(planId) {
    return db.prepare('SELECT * FROM plan_signups WHERE plan_id = ? ORDER BY signed_up_at ASC').all(planId);
}

/** Returns true if newly added, false if already signed up. */
function signupForPlan(planId, userId) {
    try {
        db.prepare('INSERT INTO plan_signups (plan_id, user_id) VALUES (?, ?)').run(planId, userId);
        return true;
    } catch (_) {
        return false; // UNIQUE constraint — already signed up
    }
}

/** Returns true if removed, false if wasn't signed up. */
function leaveFromPlan(planId, userId) {
    const result = db.prepare('DELETE FROM plan_signups WHERE plan_id = ? AND user_id = ?').run(planId, userId);
    return result.changes > 0;
}

/** Get all open/pending plans for recovery on bot restart. */
function getActivePlans() {
    return db.prepare("SELECT * FROM study_plans WHERE status = 'open' ORDER BY scheduled_at ASC").all();
}

function getHostPlan(hostId) {
    return db.prepare("SELECT * FROM study_plans WHERE host_id = ? AND status = 'open'").get(hostId);
}

// ─── Guild Settings Helpers ──────────────────────────────────────────

function getOrCreateGuildSettings(guildId) {
    let settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (!settings) {
        db.prepare('INSERT INTO guild_settings (guild_id) VALUES (?)').run(guildId);
        settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    }
    return settings;
}

function updateGuildSettings(guildId, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(guildId);
    db.prepare(`UPDATE guild_settings SET ${sets} WHERE guild_id = ?`).run(...values);
}

function getAllEnabledGuildReports() {
    return db.prepare('SELECT * FROM guild_settings WHERE report_enabled = 1 AND report_channel_id IS NOT NULL').all();
}

function recordGuildJoin(guild) {
    db.prepare(`
        INSERT INTO guild_installations (
            guild_id, guild_name, member_count, owner_id, active, is_baseline, joined_at, left_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, 1, 0, datetime('now'), NULL, datetime('now'))
        ON CONFLICT(guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            member_count = excluded.member_count,
            owner_id = excluded.owner_id,
            active = 1,
            is_baseline = 0,
            joined_at = CASE
                WHEN guild_installations.active = 0 THEN datetime('now')
                ELSE guild_installations.joined_at
            END,
            left_at = NULL,
            last_seen_at = datetime('now')
    `).run(guild.id, guild.name || null, guild.memberCount || 0, guild.ownerId || null);

    getOrCreateGuildSettings(guild.id);
    updateGuildSettings(guild.id, { guild_name: guild.name || null });
}

function recordGuildSnapshot(guild) {
    db.prepare(`
        INSERT INTO guild_installations (
            guild_id, guild_name, member_count, owner_id, active, is_baseline, joined_at, left_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, 1, 1, datetime('now'), NULL, datetime('now'))
        ON CONFLICT(guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            member_count = excluded.member_count,
            owner_id = excluded.owner_id,
            active = 1,
            left_at = NULL,
            last_seen_at = datetime('now')
    `).run(guild.id, guild.name || null, guild.memberCount || 0, guild.ownerId || null);

    getOrCreateGuildSettings(guild.id);
    updateGuildSettings(guild.id, { guild_name: guild.name || null });
}

function recordGuildLeave(guild) {
    db.prepare(`
        INSERT INTO guild_installations (
            guild_id, guild_name, member_count, owner_id, active, joined_at, left_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'), datetime('now'))
        ON CONFLICT(guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            member_count = excluded.member_count,
            owner_id = excluded.owner_id,
            active = 0,
            left_at = datetime('now'),
            last_seen_at = datetime('now')
    `).run(guild.id, guild.name || null, guild.memberCount || 0, guild.ownerId || null);
}

function syncGuildInstallations(guilds) {
    const sync = db.transaction(items => {
        for (const guild of items) recordGuildSnapshot(guild);

        if (items.length === 0) {
            db.prepare(`
                UPDATE guild_installations
                SET active = 0,
                    left_at = COALESCE(left_at, datetime('now')),
                    last_seen_at = datetime('now')
                WHERE active = 1
            `).run();
            return;
        }

        const placeholders = items.map(() => '?').join(', ');
        db.prepare(`
            UPDATE guild_installations
            SET active = 0,
                left_at = COALESCE(left_at, datetime('now')),
                last_seen_at = datetime('now')
            WHERE active = 1 AND guild_id NOT IN (${placeholders})
        `).run(...items.map(guild => guild.id));
    });
    sync(Array.from(guilds));
}

function getGuildAnalytics() {
    return db.prepare(`
        SELECT
            SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_guilds,
            SUM(CASE WHEN active = 1 THEN member_count ELSE 0 END) as reachable_members,
            SUM(CASE WHEN is_baseline = 0 AND joined_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as joins_7d,
            SUM(CASE WHEN left_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as leaves_7d,
            COUNT(*) as lifetime_guilds
        FROM guild_installations
    `).get();
}

function recordCommandUsage(guildId, userId, commandName, subcommandName = null) {
    db.prepare(`
        INSERT INTO command_usage (guild_id, user_id, command_name, subcommand_name)
        VALUES (?, ?, ?, ?)
    `).run(guildId || null, userId, commandName, subcommandName || null);
}

/**
 * Language of the guild where the user was most recently active, for DMs sent
 * from background jobs. Prefers the latest command usage, then the latest study
 * session. Returns null when the user has no guild activity.
 */
function getUserActiveGuildLanguage(userId) {
    if (!userId) return null;
    const row = db.prepare(`
        SELECT gs.language AS language
        FROM (
            SELECT guild_id, 0 AS priority FROM (
                SELECT guild_id FROM command_usage
                WHERE user_id = ? AND guild_id IS NOT NULL
                ORDER BY used_at DESC LIMIT 1
            )
            UNION ALL
            SELECT guild_id, 1 AS priority FROM (
                SELECT guild_id FROM study_sessions
                WHERE user_id = ? AND guild_id IS NOT NULL
                ORDER BY started_at DESC LIMIT 1
            )
        ) recent
        LEFT JOIN guild_settings gs ON gs.guild_id = recent.guild_id
        ORDER BY recent.priority ASC
        LIMIT 1
    `).get(String(userId), String(userId));
    return row?.language || null;
}

function recordOnboardingEvent(guildId, userId, eventType, topic = null) {
    if (!userId || !eventType) return;
    db.prepare(`
        INSERT INTO onboarding_events (guild_id, user_id, event_type, topic)
        VALUES (?, ?, ?, ?)
    `).run(guildId || null, userId, eventType, topic || null);
}

function getOnboardingAnalytics(days = 7, limit = 6) {
    const safeDays = Math.max(1, Math.min(Number(days) || 7, 90));
    const safeLimit = Math.max(1, Math.min(Number(limit) || 6, 20));

    const summary = db.prepare(`
        SELECT
            COUNT(*) as events,
            COUNT(DISTINCT guild_id) as guilds,
            COUNT(DISTINCT user_id) as users,
            SUM(CASE WHEN event_type = 'panel_posted' THEN 1 ELSE 0 END) as panels_posted,
            SUM(CASE WHEN event_type = 'panel_click' THEN 1 ELSE 0 END) as panel_clicks
        FROM onboarding_events
        WHERE created_at >= datetime('now', '-' || ? || ' days')
    `).get(safeDays);

    const topTopics = db.prepare(`
        SELECT
            COALESCE(topic, 'unknown') as topic,
            COUNT(*) as clicks,
            COUNT(DISTINCT user_id) as users,
            COUNT(DISTINCT guild_id) as guilds
        FROM onboarding_events
        WHERE event_type = 'panel_click'
          AND created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY topic
        ORDER BY clicks DESC, users DESC
        LIMIT ?
    `).all(safeDays, safeLimit);

    return { ...summary, top_topics: topTopics };
}

function markOnboardingTipShown(userId, tipKey) {
    getOrCreateUser(userId);
    const result = db.prepare(`
        INSERT OR IGNORE INTO user_onboarding (user_id, tip_key)
        VALUES (?, ?)
    `).run(userId, tipKey);
    return result.changes > 0;
}

function hasSeenOnboardingTip(userId, tipKey) {
    return Boolean(db.prepare(`
        SELECT 1 FROM user_onboarding
        WHERE user_id = ? AND tip_key = ?
    `).get(userId, tipKey));
}

function getSeenOnboardingTips(userId) {
    return db.prepare(`
        SELECT tip_key, shown_at
        FROM user_onboarding
        WHERE user_id = ?
        ORDER BY shown_at ASC
    `).all(userId);
}

function getActivationAnalytics() {
    const setup = db.prepare(`
        SELECT
            SUM(CASE WHEN gi.active = 1 AND (
                COALESCE(gs.voice_tracking_enabled, 0) = 1
                OR COALESCE(gs.report_enabled, 0) = 1
                OR COALESCE(gs.goal_enabled, 0) = 1
            ) THEN 1 ELSE 0 END) as configured_guilds,
            SUM(CASE WHEN gi.active = 1 AND COALESCE(gs.voice_tracking_enabled, 0) = 1 THEN 1 ELSE 0 END) as voice_guilds,
            SUM(CASE WHEN gi.active = 1 AND COALESCE(gs.report_enabled, 0) = 1 THEN 1 ELSE 0 END) as report_guilds,
            SUM(CASE WHEN gi.active = 1 AND COALESCE(gs.goal_enabled, 0) = 1 THEN 1 ELSE 0 END) as goal_guilds,
            SUM(CASE WHEN gi.setup_nudge_sent_at IS NOT NULL THEN 1 ELSE 0 END) as setup_nudges_sent,
            SUM(CASE WHEN gi.setup_nudge_sent_at IS NOT NULL AND (
                COALESCE(gs.voice_tracking_enabled, 0) = 1
                OR COALESCE(gs.report_enabled, 0) = 1
                OR COALESCE(gs.goal_enabled, 0) = 1
            ) THEN 1 ELSE 0 END) as setup_nudge_conversions
        FROM guild_installations gi
        LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
    `).get();

    const usage = db.prepare(`
        SELECT
            COUNT(DISTINCT guild_id) as command_guilds_7d,
            COUNT(*) as commands_7d
        FROM command_usage
        WHERE guild_id IS NOT NULL AND used_at >= datetime('now', '-7 days')
    `).get();

    const focusGuilds = db.prepare(`
        SELECT COUNT(DISTINCT guild_id) as count
        FROM (
            SELECT guild_id FROM study_sessions
            WHERE guild_id IS NOT NULL
              AND title != '__break__'
              AND completed = 1
              AND started_at >= datetime('now', '-7 days')
            UNION
            SELECT guild_id FROM team_sessions
            WHERE status = 'completed'
              AND started_at >= datetime('now', '-7 days')
            UNION
            SELECT guild_id FROM voice_sessions
            WHERE status = 'completed'
              AND credited_minutes > 0
              AND ended_at >= datetime('now', '-7 days')
        )
    `).get().count;

    return { ...setup, ...usage, focus_guilds_7d: focusGuilds };
}

/**
 * Why servers leave: servers that joined after tracking started (not baseline)
 * and left in the last `days` days, with what they did before leaving.
 */
function getChurnAnalytics(days = 30) {
    const window = `-${Math.max(1, Math.min(Number(days) || 30, 365))} days`;
    const leavers = db.prepare(`
        WITH left_guilds AS (
            SELECT
                gi.guild_id,
                gi.member_count,
                gi.setup_nudge_sent_at,
                (julianday(gi.left_at) - julianday(gi.joined_at)) * 24 AS hours_stayed,
                COALESCE(gs.voice_tracking_enabled, 0) + COALESCE(gs.report_enabled, 0)
                    + COALESCE(gs.goal_enabled, 0) AS setup_steps,
                EXISTS (
                    SELECT 1 FROM command_usage cu
                    WHERE cu.guild_id = gi.guild_id AND cu.used_at >= gi.joined_at
                ) AS used_commands
            FROM guild_installations gi
            LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
            WHERE gi.active = 0 AND gi.is_baseline = 0
              AND gi.left_at >= datetime('now', ?)
        )
        SELECT
            COUNT(*) AS total,
            SUM(hours_stayed < 1) AS within_1h,
            SUM(hours_stayed >= 1 AND hours_stayed < 24) AS within_1d,
            SUM(hours_stayed >= 24 AND hours_stayed < 168) AS within_7d,
            SUM(hours_stayed >= 168) AS after_7d,
            SUM(used_commands = 0) AS never_used,
            SUM(setup_steps = 0) AS no_setup,
            SUM(setup_nudge_sent_at IS NOT NULL) AS nudged,
            SUM(member_count < 20) AS small_servers,
            ROUND(AVG(member_count)) AS avg_members
        FROM left_guilds
    `).get(window);

    const cohort = db.prepare(`
        SELECT COUNT(*) AS joined, SUM(active = 0) AS already_left
        FROM guild_installations
        WHERE is_baseline = 0 AND joined_at >= datetime('now', ?)
    `).get(window);

    return { days: Math.abs(parseInt(window, 10)), ...leavers, ...cohort };
}

/**
 * Rolling user retention for users first seen in the last 90 days: share who
 * came back (any command or completed session) at least N days after joining.
 * Uses activity logs, so it's correct for history too (command_usage keeps 90 days).
 */
function getRetentionAnalytics() {
    const cameBack = offset => `(
        EXISTS (SELECT 1 FROM command_usage cu
                WHERE cu.user_id = u.discord_id AND cu.used_at >= datetime(u.created_at, '${offset}'))
        OR EXISTS (SELECT 1 FROM activity_rewards ar
                WHERE ar.user_id = u.discord_id AND ar.created_at >= datetime(u.created_at, '${offset}'))
    )`;
    return db.prepare(`
        SELECT
            SUM(u.created_at >= datetime('now', '-30 days')) AS new_users_30d,
            SUM(u.created_at <= datetime('now', '-1 day')) AS d1_cohort,
            SUM(u.created_at <= datetime('now', '-1 day') AND ${cameBack('+1 day')}) AS d1_returned,
            SUM(u.created_at <= datetime('now', '-7 days')) AS d7_cohort,
            SUM(u.created_at <= datetime('now', '-7 days') AND ${cameBack('+7 days')}) AS d7_returned,
            SUM(u.created_at <= datetime('now', '-30 days')) AS d30_cohort,
            SUM(u.created_at <= datetime('now', '-30 days') AND ${cameBack('+30 days')}) AS d30_returned
        FROM users u
        WHERE u.created_at >= datetime('now', '-90 days')
    `).get();
}

function getSetupFunnelAnalytics() {
    return db.prepare(`
        WITH setup AS (
            SELECT
                gi.guild_id,
                COALESCE(gs.voice_tracking_enabled, 0) as voice_enabled,
                COALESCE(gs.report_enabled, 0) as report_enabled,
                COALESCE(gs.goal_enabled, 0) as goal_enabled,
                (
                    COALESCE(gs.voice_tracking_enabled, 0)
                    + COALESCE(gs.report_enabled, 0)
                    + COALESCE(gs.goal_enabled, 0)
                ) as setup_steps
            FROM guild_installations gi
            LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
            WHERE gi.active = 1
        )
        SELECT
            COUNT(*) as active_guilds,
            SUM(CASE WHEN setup_steps = 0 THEN 1 ELSE 0 END) as setup_none,
            SUM(CASE WHEN setup_steps BETWEEN 1 AND 2 THEN 1 ELSE 0 END) as setup_partial,
            SUM(CASE WHEN setup_steps >= 3 THEN 1 ELSE 0 END) as setup_complete,
            SUM(voice_enabled) as voice_enabled,
            SUM(report_enabled) as report_enabled,
            SUM(goal_enabled) as goal_enabled
        FROM setup
    `).get();
}

function getTopCommands(days = 7, limit = 5) {
    return db.prepare(`
        SELECT
            command_name,
            subcommand_name,
            COUNT(*) as uses,
            COUNT(DISTINCT user_id) as users
        FROM command_usage
        WHERE used_at >= datetime('now', '-' || ? || ' days')
        GROUP BY command_name, subcommand_name
        ORDER BY uses DESC
        LIMIT ?
    `).all(days, limit);
}

function getSetupReminderCandidates(limit = 5) {
    return db.prepare(`
        SELECT
            gi.*,
            COALESCE(gs.voice_tracking_enabled, 0) as voice_tracking_enabled,
            COALESCE(gs.report_enabled, 0) as report_enabled,
            COALESCE(gs.goal_enabled, 0) as goal_enabled
        FROM guild_installations gi
        LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
        WHERE gi.active = 1
          AND gi.setup_reminder_sent_at IS NULL
          AND (
              gi.setup_reminder_attempted_at IS NULL
              OR gi.setup_reminder_attempted_at < datetime('now', '-7 days')
          )
          AND gi.joined_at < datetime('now', '-14 days')
          AND (
              COALESCE(gs.voice_tracking_enabled, 0) = 0
              OR COALESCE(gs.report_enabled, 0) = 0
              OR COALESCE(gs.goal_enabled, 0) = 0
          )
          AND NOT EXISTS (
              SELECT 1 FROM study_sessions s
              WHERE s.guild_id = gi.guild_id
                AND s.title != '__break__'
                AND s.started_at >= datetime('now', '-14 days')
          )
          AND NOT EXISTS (
              SELECT 1 FROM team_sessions ts
              WHERE ts.guild_id = gi.guild_id
                AND ts.started_at >= datetime('now', '-14 days')
          )
          AND NOT EXISTS (
              SELECT 1 FROM voice_sessions vs
              WHERE vs.guild_id = gi.guild_id
                AND vs.started_at >= datetime('now', '-14 days')
          )
        ORDER BY gi.joined_at ASC
        LIMIT ?
    `).all(limit);
}

function markSetupReminderAttempt(guildId, sent) {
    db.prepare(`
        UPDATE guild_installations
        SET setup_reminder_attempted_at = datetime('now'),
            setup_reminder_sent_at = CASE
                WHEN ? = 1 THEN datetime('now')
                ELSE setup_reminder_sent_at
            END
        WHERE guild_id = ?
    `).run(sent ? 1 : 0, guildId);
}

function getSetupNudgeEligibility(guildId, minimumSessions = 3) {
    const safeMinimum = Math.max(1, Math.min(Number(minimumSessions) || 3, 100));
    return db.prepare(`
        SELECT
            gi.guild_id,
            COALESCE(gs.voice_tracking_enabled, 0) as voice_tracking_enabled,
            COALESCE(gs.report_enabled, 0) as report_enabled,
            COALESCE(gs.goal_enabled, 0) as goal_enabled,
            COUNT(focus.occurred_at) as completed_sessions
        FROM guild_installations gi
        LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
        LEFT JOIN (
            SELECT guild_id, started_at as occurred_at
            FROM study_sessions
            WHERE completed = 1 AND title != '__break__'

            UNION ALL

            SELECT guild_id, started_at as occurred_at
            FROM team_sessions
            WHERE status = 'completed'

            UNION ALL

            SELECT guild_id, ended_at as occurred_at
            FROM voice_sessions
            WHERE status = 'completed' AND credited_minutes > 0
        ) focus
            ON focus.guild_id = gi.guild_id
           AND focus.occurred_at >= datetime('now', '-7 days')
        WHERE gi.guild_id = ?
          AND gi.active = 1
          AND gi.setup_nudge_sent_at IS NULL
          AND (
              COALESCE(gs.voice_tracking_enabled, 0) = 0
              OR COALESCE(gs.report_enabled, 0) = 0
              OR COALESCE(gs.goal_enabled, 0) = 0
          )
        GROUP BY gi.guild_id
        HAVING COUNT(focus.occurred_at) >= ?
    `).get(guildId, safeMinimum) || null;
}

function markSetupNudgeSent(guildId) {
    return db.prepare(`
        UPDATE guild_installations
        SET setup_nudge_sent_at = COALESCE(setup_nudge_sent_at, datetime('now'))
        WHERE guild_id = ?
    `).run(guildId).changes > 0;
}

/**
 * Active-but-unconfigured servers with recent study activity that have not
 * been nudged yet. Unlike the on-demand nudge (which requires an admin to run
 * a command), this lets a scheduled job proactively reach every eligible
 * server and scale the highest-converting activation lever.
 */
function getSetupNudgeCandidates(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
    return db.prepare(`
        SELECT
            gi.guild_id,
            COALESCE(gs.voice_tracking_enabled, 0) as voice_tracking_enabled,
            COALESCE(gs.report_enabled, 0) as report_enabled,
            COALESCE(gs.goal_enabled, 0) as goal_enabled,
            COUNT(focus.occurred_at) as completed_sessions
        FROM guild_installations gi
        LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
        LEFT JOIN (
            SELECT guild_id, started_at as occurred_at
            FROM study_sessions
            WHERE completed = 1 AND title != '__break__'

            UNION ALL

            SELECT guild_id, started_at as occurred_at
            FROM team_sessions
            WHERE status = 'completed'

            UNION ALL

            SELECT guild_id, ended_at as occurred_at
            FROM voice_sessions
            WHERE status = 'completed' AND credited_minutes > 0
        ) focus
            ON focus.guild_id = gi.guild_id
           AND focus.occurred_at >= datetime('now', '-7 days')
        WHERE gi.active = 1
          AND gi.setup_nudge_sent_at IS NULL
          AND (
              COALESCE(gs.voice_tracking_enabled, 0) = 0
              OR COALESCE(gs.report_enabled, 0) = 0
              OR COALESCE(gs.goal_enabled, 0) = 0
          )
        GROUP BY gi.guild_id
        HAVING COUNT(focus.occurred_at) >= 3
        ORDER BY completed_sessions DESC
        LIMIT ?
    `).all(safeLimit);
}

function getWeekStart(date = new Date(), timeZone = 'UTC') {
    return getTimeZoneWeekStart(date, timeZone);
}

function getGoalRewards(targetMinutes) {
    if (targetMinutes >= 10000) return { water: 10, xp: 50 };
    if (targetMinutes >= 5000) return { water: 8, xp: 40 };
    if (targetMinutes >= 2500) return { water: 5, xp: 25 };
    return { water: 3, xp: 15 };
}

function configureGuildGoal(guildId, targetMinutes, channelId) {
    const settings = getOrCreateGuildSettings(guildId);
    const rewards = getGoalRewards(targetMinutes);
    const minContribution = Math.min(120, Math.max(25, Math.ceil(targetMinutes * 0.01)));

    updateGuildSettings(guildId, {
        goal_enabled: 1,
        goal_target_minutes: targetMinutes,
        goal_channel_id: channelId,
        goal_min_contribution: minContribution,
    });

    const weekStart = getWeekStart(new Date(), settings.timezone || 'UTC');
    db.prepare(`
        INSERT INTO guild_goals (
            guild_id, week_start, target_minutes, reward_water, reward_xp,
            min_contribution, channel_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, week_start) DO UPDATE SET
            target_minutes = excluded.target_minutes,
            reward_water = excluded.reward_water,
            reward_xp = excluded.reward_xp,
            min_contribution = excluded.min_contribution,
            channel_id = excluded.channel_id,
            status = CASE
                WHEN guild_goals.status = 'disabled' THEN 'active'
                ELSE guild_goals.status
            END
    `).run(
        guildId,
        weekStart,
        targetMinutes,
        rewards.water,
        rewards.xp,
        minContribution,
        channelId,
    );

    const goal = getOrCreateCurrentGuildGoal(guildId);
    const stats = getGuildGoalStats(goal.id);
    if (stats.total_minutes >= goal.target_minutes && goal.status === 'active') {
        db.prepare(`
            UPDATE guild_goals
            SET status = 'completed', completed_at = datetime('now')
            WHERE id = ?
        `).run(goal.id);
        return db.prepare('SELECT * FROM guild_goals WHERE id = ?').get(goal.id);
    }
    return goal;
}

function getOrCreateCurrentGuildGoal(guildId) {
    const settings = getOrCreateGuildSettings(guildId);
    if (!settings.goal_enabled) return null;

    const weekStart = getWeekStart(new Date(), settings.timezone || 'UTC');
    let goal = db.prepare(`
        SELECT * FROM guild_goals WHERE guild_id = ? AND week_start = ?
    `).get(guildId, weekStart);

    if (!goal) {
        const target = settings.goal_target_minutes || 2500;
        const rewards = getGoalRewards(target);
        const minContribution = settings.goal_min_contribution
            || Math.min(120, Math.max(25, Math.ceil(target * 0.01)));
        const result = db.prepare(`
            INSERT INTO guild_goals (
                guild_id, week_start, target_minutes, reward_water, reward_xp,
                min_contribution, channel_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            weekStart,
            target,
            rewards.water,
            rewards.xp,
            minContribution,
            settings.goal_channel_id,
        );
        goal = db.prepare('SELECT * FROM guild_goals WHERE id = ?').get(result.lastInsertRowid);
    }

    return goal;
}

function getGuildGoalStats(goalId) {
    const totals = db.prepare(`
        SELECT
            COALESCE(SUM(minutes), 0) as total_minutes,
            COUNT(DISTINCT user_id) as contributors
        FROM guild_goal_contributions
        WHERE goal_id = ?
    `).get(goalId);
    return { ...totals };
}

function getGuildGoalContributors(goalId, limit = 10) {
    return db.prepare(`
        SELECT user_id, SUM(minutes) as minutes
        FROM guild_goal_contributions
        WHERE goal_id = ?
        GROUP BY user_id
        ORDER BY minutes DESC
        LIMIT ?
    `).all(goalId, limit);
}

function getGuildGoalContribution(goalId, userId) {
    return db.prepare(`
        SELECT COALESCE(SUM(minutes), 0) as minutes
        FROM guild_goal_contributions
        WHERE goal_id = ? AND user_id = ?
    `).get(goalId, userId).minutes || 0;
}

function recordGuildGoalContribution(guildId, userId, minutes, sourceType, sourceId) {
    if (!guildId || !userId || minutes <= 0) return null;
    getOrCreateUser(userId);

    const transaction = db.transaction(() => {
        const goal = getOrCreateCurrentGuildGoal(guildId);
        if (!goal || goal.status === 'disabled') return null;

        const result = db.prepare(`
            INSERT OR IGNORE INTO guild_goal_contributions (
                goal_id, user_id, minutes, source_type, source_id
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(goal.id, userId, Math.floor(minutes), sourceType, String(sourceId));

        const stats = getGuildGoalStats(goal.id);
        let justCompleted = false;
        if (stats.total_minutes >= goal.target_minutes && goal.status === 'active') {
            const updated = db.prepare(`
                UPDATE guild_goals
                SET status = 'completed', completed_at = datetime('now')
                WHERE id = ? AND status = 'active'
            `).run(goal.id);
            justCompleted = updated.changes > 0;
        }

        return {
            goal: db.prepare('SELECT * FROM guild_goals WHERE id = ?').get(goal.id),
            stats,
            inserted: result.changes > 0,
            justCompleted,
        };
    });

    return transaction();
}

function disableGuildGoal(guildId) {
    const settings = getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, { goal_enabled: 0 });
    db.prepare(`
        UPDATE guild_goals SET status = 'disabled'
        WHERE guild_id = ? AND week_start = ? AND status = 'active'
    `).run(guildId, getWeekStart(new Date(), settings.timezone || 'UTC'));
}

function updateGuildTimezone(guildId, timeZone) {
    const normalized = normalizeTimeZone(timeZone);
    if (!normalized) {
        throw new RangeError('Invalid timezone');
    }
    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, { timezone: normalized });
    return getOrCreateGuildSettings(guildId);
}

function getPersonalGoalPeriod(periodType, date = new Date()) {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);

    if (periodType === 'monthly') {
        const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
        const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
        end.setUTCDate(end.getUTCDate() - 1);
        return {
            start: start.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10),
        };
    }

    const start = new Date(`${getWeekStart(value)}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
    };
}

function configurePersonalGoal(userId, periodType, targetMinutes, date = new Date()) {
    if (!['weekly', 'monthly'].includes(periodType)) {
        throw new RangeError('periodType must be weekly or monthly');
    }
    if (!Number.isInteger(targetMinutes) || targetMinutes < 60 || targetMinutes > 20000) {
        throw new RangeError('targetMinutes must be an integer between 60 and 20000');
    }

    getOrCreateUser(userId);
    db.prepare(`
        INSERT INTO personal_goal_settings (
            user_id, enabled, period_type, target_minutes, updated_at
        )
        VALUES (?, 1, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            enabled = 1,
            period_type = excluded.period_type,
            target_minutes = excluded.target_minutes,
            updated_at = datetime('now')
    `).run(userId, periodType, targetMinutes);

    db.prepare(`
        UPDATE personal_goals
        SET status = 'disabled'
        WHERE user_id = ? AND status = 'active' AND period_type != ?
    `).run(userId, periodType);

    const period = getPersonalGoalPeriod(periodType, date);
    db.prepare(`
        INSERT INTO personal_goals (
            user_id, period_type, period_start, period_end, target_minutes
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, period_type, period_start) DO UPDATE SET
            period_end = excluded.period_end,
            target_minutes = excluded.target_minutes,
            status = 'active',
            completed_at = NULL
    `).run(userId, periodType, period.start, period.end, targetMinutes);

    const goal = getOrCreateCurrentPersonalGoal(userId, date);
    const stats = getPersonalGoalStats(goal.id);
    if (stats.total_minutes >= goal.target_minutes) {
        db.prepare(`
            UPDATE personal_goals
            SET status = 'completed', completed_at = COALESCE(completed_at, datetime('now'))
            WHERE id = ?
        `).run(goal.id);
        return db.prepare('SELECT * FROM personal_goals WHERE id = ?').get(goal.id);
    }
    return goal;
}

function getOrCreateCurrentPersonalGoal(userId, date = new Date()) {
    const settings = db.prepare(
        'SELECT * FROM personal_goal_settings WHERE user_id = ?'
    ).get(userId);
    if (!settings?.enabled) return null;

    const period = getPersonalGoalPeriod(settings.period_type, date);
    let goal = db.prepare(`
        SELECT * FROM personal_goals
        WHERE user_id = ? AND period_type = ? AND period_start = ?
    `).get(userId, settings.period_type, period.start);

    if (!goal) {
        const result = db.prepare(`
            INSERT INTO personal_goals (
                user_id, period_type, period_start, period_end, target_minutes
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            userId,
            settings.period_type,
            period.start,
            period.end,
            settings.target_minutes,
        );
        goal = db.prepare('SELECT * FROM personal_goals WHERE id = ?').get(result.lastInsertRowid);
    }
    return goal;
}

function getPersonalGoalStats(goalId) {
    return db.prepare(`
        SELECT
            COALESCE(SUM(minutes), 0) as total_minutes,
            COUNT(*) as sessions
        FROM personal_goal_contributions
        WHERE goal_id = ?
    `).get(goalId);
}

function recordPersonalGoalContribution(userId, minutes, sourceType, sourceId, date = new Date()) {
    if (!userId || minutes <= 0) return null;

    return db.transaction(() => {
        const goal = getOrCreateCurrentPersonalGoal(userId, date);
        if (!goal || goal.status === 'disabled') return null;

        const result = db.prepare(`
            INSERT OR IGNORE INTO personal_goal_contributions (
                goal_id, minutes, source_type, source_id
            )
            VALUES (?, ?, ?, ?)
        `).run(goal.id, Math.floor(minutes), sourceType, String(sourceId));

        const stats = getPersonalGoalStats(goal.id);
        let justCompleted = false;
        if (stats.total_minutes >= goal.target_minutes && goal.status === 'active') {
            const update = db.prepare(`
                UPDATE personal_goals
                SET status = 'completed', completed_at = datetime('now')
                WHERE id = ? AND status = 'active'
            `).run(goal.id);
            justCompleted = update.changes > 0;
        }

        return {
            goal: db.prepare('SELECT * FROM personal_goals WHERE id = ?').get(goal.id),
            stats,
            inserted: result.changes > 0,
            justCompleted,
        };
    })();
}

function disablePersonalGoal(userId) {
    db.prepare(`
        INSERT INTO personal_goal_settings (user_id, enabled)
        VALUES (?, 0)
        ON CONFLICT(user_id) DO UPDATE SET
            enabled = 0,
            updated_at = datetime('now')
    `).run(userId);
    db.prepare(`
        UPDATE personal_goals
        SET status = 'disabled'
        WHERE user_id = ? AND status = 'active'
    `).run(userId);
}

function claimGuildGoalReward(guildId, userId) {
    const transaction = db.transaction(() => {
        const goal = getOrCreateCurrentGuildGoal(guildId);
        if (!goal) return { success: false, reason: 'disabled' };
        if (goal.status !== 'completed') return { success: false, reason: 'incomplete', goal };

        const contribution = db.prepare(`
            SELECT COALESCE(SUM(minutes), 0) as minutes
            FROM guild_goal_contributions
            WHERE goal_id = ? AND user_id = ?
        `).get(goal.id, userId).minutes;

        if (contribution < goal.min_contribution) {
            return { success: false, reason: 'contribution', goal, contribution };
        }

        const result = db.prepare(`
            INSERT OR IGNORE INTO guild_goal_claims (goal_id, user_id)
            VALUES (?, ?)
        `).run(goal.id, userId);
        if (result.changes === 0) {
            return { success: false, reason: 'claimed', goal, contribution };
        }

        getOrCreateUser(userId);
        incrementUser(userId, 'water', goal.reward_water);
        incrementUser(userId, 'xp', goal.reward_xp);

        // Award random fruits based on goal size
        const { Plants } = require('./constants');
        const plantKeys = Object.keys(Plants);
        const fruitCount = goal.target_minutes >= 5000 ? 3 : goal.target_minutes >= 2500 ? 2 : 1;
        const fruits = {};
        for (let i = 0; i < fruitCount; i++) {
            const key = plantKeys[Math.floor(Math.random() * plantKeys.length)];
            addItemToInventory(userId, key, 1);
            fruits[key] = (fruits[key] || 0) + 1;
        }

        return { success: true, goal, contribution, fruits };
    });

    return transaction();
}

// Voice Study Helpers
function getVoiceSettings(guildId) {
    return getOrCreateGuildSettings(guildId);
}

function createVoiceSession(userId, guildId, channelId) {
    getOrCreateUser(userId);
    const existing = getActiveVoiceSession(userId, guildId);
    if (existing) return existing;

    const result = db.prepare(`
        INSERT INTO voice_sessions (user_id, guild_id, channel_id)
        VALUES (?, ?, ?)
    `).run(userId, guildId, channelId);


    return db.prepare('SELECT * FROM voice_sessions WHERE id = ?').get(result.lastInsertRowid);
}

function getActiveVoiceSession(userId, guildId) {
    return db.prepare(`
        SELECT * FROM voice_sessions
        WHERE user_id = ? AND guild_id = ? AND status = 'active'
        LIMIT 1
    `).get(userId, guildId);
}

function getActiveVoiceSessions(guildId = null) {
    if (guildId) {
        return db.prepare("SELECT * FROM voice_sessions WHERE guild_id = ? AND status = 'active'").all(guildId);
    }
    return db.prepare("SELECT * FROM voice_sessions WHERE status = 'active'").all();
}

function touchVoiceSession(sessionId) {
    db.prepare("UPDATE voice_sessions SET last_seen_at = datetime('now') WHERE id = ? AND status = 'active'").run(sessionId);
}

function completeVoiceSession(sessionId, values) {
    db.prepare(`
        UPDATE voice_sessions
        SET ended_at = ?,
            total_minutes = ?,
            credited_minutes = ?,
            rewarded_minutes = ?,
            water_reward = ?,
            xp_reward = ?,
            status = ?,
            end_reason = ?
        WHERE id = ? AND status = 'active'
    `).run(
        values.endedAt,
        values.totalMinutes,
        values.creditedMinutes,
        values.rewardedMinutes,
        values.waterReward,
        values.xpReward,
        values.status || 'completed',
        values.endReason || 'left_channel',
        sessionId,
    );
}

function getVoiceRewardedMinutesForDay(userId, date) {
    return db.prepare(`
        SELECT COALESCE(SUM(rewarded_minutes), 0) as total
        FROM voice_sessions
        WHERE user_id = ?
          AND status = 'completed'
          AND date(ended_at) = ?
    `).get(userId, date).total || 0;
}

function getVoiceCreditedMinutesForDay(userId, date) {
    return db.prepare(`
        SELECT COALESCE(SUM(credited_minutes), 0) as total
        FROM voice_sessions
        WHERE user_id = ?
          AND status = 'completed'
          AND date(ended_at) = ?
    `).get(userId, date).total || 0;
}

function getVoiceStats(userId) {
    return db.prepare(`
        SELECT
            COUNT(*) as sessions,
            COALESCE(SUM(credited_minutes), 0) as minutes,
            COALESCE(SUM(rewarded_minutes), 0) as rewarded_minutes,
            COALESCE(SUM(water_reward), 0) as water,
            COALESCE(SUM(xp_reward), 0) as xp
        FROM voice_sessions
        WHERE user_id = ? AND status = 'completed'
    `).get(userId);
}

function updateGuildScore(guildId, guildName, minutes) {
    getOrCreateGuildSettings(guildId); // Ensure it exists
    db.prepare(`
        UPDATE guild_settings
        SET total_focus_minutes = total_focus_minutes + ?,
            guild_name = COALESCE(?, guild_name)
        WHERE guild_id = ?
    `).run(minutes, guildName, guildId);
}

function guildXpForMinutes(minutes) {
    return Math.max(0, Math.floor(Number(minutes) || 0));
}

function guildXpForLevel(level) {
    return 100 * Math.max(1, Number(level) || 1);
}

function guildLevelForXp(xp) {
    let level = 1;
    let remainingXp = Math.max(0, Number(xp) || 0);
    while (remainingXp >= guildXpForLevel(level)) {
        remainingXp -= guildXpForLevel(level);
        level += 1;
    }
    return level;
}

function recordGuildFocusProgress({ guildId, guildName = null, minutes, sourceType, sourceId }) {
    if (!guildId || !sourceType || sourceId === undefined || sourceId === null) {
        return { recorded: false, reason: 'invalid_source' };
    }

    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (safeMinutes <= 0) return { recorded: false, reason: 'no_minutes' };

    return db.transaction(() => {
        getOrCreateGuildSettings(guildId);
        const storedGuildName = db.prepare('SELECT guild_name FROM guild_settings WHERE guild_id = ?').get(guildId)?.guild_name;
        const resolvedGuildName = guildName || storedGuildName || null;
        const xp = guildXpForMinutes(safeMinutes);
        const event = db.prepare(`
            INSERT OR IGNORE INTO guild_xp_events (guild_id, source_type, source_id, minutes, xp)
            VALUES (?, ?, ?, ?, ?)
        `).run(guildId, sourceType, String(sourceId), safeMinutes, xp);

        if (event.changes === 0) {
            const existing = db.prepare(`
                SELECT gp.*
                FROM guild_progress gp
                WHERE gp.guild_id = ?
            `).get(guildId);
            return { recorded: false, duplicate: true, progress: existing || null };
        }

        db.prepare(`
            INSERT INTO guild_progress (
                guild_id, guild_name, level, xp, total_focus_minutes, total_sessions, season_xp, updated_at
            ) VALUES (?, ?, 1, ?, ?, 1, ?, datetime('now'))
            ON CONFLICT(guild_id) DO UPDATE SET
                guild_name = COALESCE(excluded.guild_name, guild_progress.guild_name),
                xp = guild_progress.xp + excluded.xp,
                total_focus_minutes = guild_progress.total_focus_minutes + excluded.total_focus_minutes,
                total_sessions = guild_progress.total_sessions + 1,
                season_xp = guild_progress.season_xp + excluded.season_xp,
                updated_at = datetime('now')
        `).run(guildId, resolvedGuildName, xp, safeMinutes, xp);

        const current = db.prepare('SELECT * FROM guild_progress WHERE guild_id = ?').get(guildId);
        const level = guildLevelForXp(current.xp);
        if (level !== current.level) {
            db.prepare('UPDATE guild_progress SET level = ?, updated_at = datetime(\'now\') WHERE guild_id = ?')
                .run(level, guildId);
        }

        return {
            recorded: true,
            duplicate: false,
            xp,
            level,
            leveledUp: level > current.level,
            progress: { ...current, level },
        };
    })();
}

function getGuildProgress(guildId) {
    getOrCreateGuildSettings(guildId);
    return db.prepare(`
        SELECT
            gp.*,
            COALESCE(gi.member_count, 0) as member_count
        FROM guild_progress gp
        LEFT JOIN guild_installations gi ON gi.guild_id = gp.guild_id
        WHERE gp.guild_id = ?
    `).get(guildId) || {
        guild_id: guildId,
        guild_name: null,
        level: 1,
        xp: 0,
        total_focus_minutes: 0,
        total_sessions: 0,
        season_xp: 0,
        member_count: 0,
    };
}

function getGuildXpToNextLevel(progress) {
    const currentLevel = Math.max(1, Number(progress?.level) || 1);
    const totalXp = Math.max(0, Number(progress?.xp) || 0);
    let spent = 0;
    for (let level = 1; level < currentLevel; level += 1) spent += guildXpForLevel(level);
    const currentLevelXp = totalXp - spent;
    const required = guildXpForLevel(currentLevel);
    return {
        current: Math.max(0, currentLevelXp),
        required,
        remaining: Math.max(0, required - currentLevelXp),
    };
}

// Only promise what is actually granted: titles are unlocked live by
// syncUserTitles, tiers are saved in season_results when the season ends.
const SEASON_REWARDS = [
    { threshold: 100, title: 'Focus Initiate', reward: 'Your season result is saved in /season history' },
    { threshold: 500, title: 'Season Scholar', reward: 'Season Scholar profile title (yours to keep)' },
    { threshold: 1000, title: 'Deep Work Veteran', reward: 'Deep Work Veteran tier in /season history' },
    { threshold: 2500, title: 'Focus Protocol Elite', reward: 'Focus Protocol Elite profile title (yours to keep)' },
];

function seasonRewardTier(seasonXp) {
    const reached = SEASON_REWARDS.filter(r => (Number(seasonXp) || 0) >= r.threshold);
    return reached.length ? reached[reached.length - 1].title : null;
}

/**
 * Save final standings of a season (users, servers, clans) before its counters
 * are reset. Must run inside the startNewSeason transaction.
 */
function archiveSeasonResults(season) {
    const insert = db.prepare(`
        INSERT OR IGNORE INTO season_results (
            season_id, season_name, scope, entity_id, entity_name,
            season_xp, season_focus_minutes, rank, reward_tier
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const users = db.prepare(`
        SELECT discord_id, season_xp, season_focus_minutes FROM users
        WHERE season_xp > 0 OR season_focus_minutes > 0
        ORDER BY season_xp DESC, season_focus_minutes DESC
    `).all();
    users.forEach((u, i) => {
        syncUserTitles(u.discord_id); // grant any threshold title reached at the very end
        insert.run(season.id, season.name, 'user', u.discord_id, null,
            u.season_xp || 0, u.season_focus_minutes || 0, i + 1, seasonRewardTier(u.season_xp));
    });

    const guilds = db.prepare(`
        SELECT guild_id, guild_name, season_xp FROM guild_progress
        WHERE season_xp > 0 ORDER BY season_xp DESC
    `).all();
    guilds.forEach((g, i) => insert.run(season.id, season.name, 'guild', g.guild_id, g.guild_name, g.season_xp || 0, 0, i + 1, null));

    const clans = db.prepare('SELECT id, name, season_xp FROM clans WHERE season_xp > 0 ORDER BY season_xp DESC').all();
    clans.forEach((c, i) => insert.run(season.id, season.name, 'clan', String(c.id), c.name, c.season_xp || 0, 0, i + 1, null));

    return { users: users.length, guilds: guilds.length, clans: clans.length };
}

function getUserSeasonHistory(userId, limit = 5) {
    return db.prepare(`
        SELECT r.*, (
            SELECT COUNT(*) FROM season_results x
            WHERE x.season_id = r.season_id AND x.scope = 'user'
        ) AS participants
        FROM season_results r
        WHERE r.scope = 'user' AND r.entity_id = ?
        ORDER BY r.season_id DESC
        LIMIT ?
    `).all(userId, Math.max(1, Math.min(Number(limit) || 5, 25)));
}

function getLastArchivedSeasonTop(scope = 'user', limit = 3) {
    const last = db.prepare('SELECT MAX(season_id) AS id FROM season_results').get()?.id;
    if (!last) return { season: null, rows: [] };
    const rows = db.prepare(`
        SELECT * FROM season_results WHERE season_id = ? AND scope = ?
        ORDER BY rank ASC LIMIT ?
    `).all(last, scope, limit);
    return { season: rows[0]?.season_name || null, rows };
}

function getActiveSeason() {
    return db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || null;
}

function startNewSeason(name) {
    const seasonName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
    if (!seasonName) return { success: false, reason: 'invalid_name' };

    return db.transaction(() => {
        const existing = db.prepare('SELECT id FROM seasons WHERE name = ?').get(seasonName);
        if (existing) return { success: false, reason: 'already_exists' };

        // Archive final standings BEFORE anything is reset (same transaction)
        const current = db.prepare('SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
        const archived = current ? archiveSeasonResults(current) : null;

        const ended = db.prepare(`
            UPDATE seasons
            SET is_active = 0, ended_at = COALESCE(ended_at, datetime('now'))
            WHERE is_active = 1
        `).run();

        const result = db.prepare('INSERT INTO seasons (name, is_active) VALUES (?, 1)').run(seasonName);
        const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(result.lastInsertRowid);

        db.prepare('UPDATE users SET season_focus_minutes = 0, season_xp = 0').run();
        db.prepare('UPDATE guild_progress SET season_xp = 0, updated_at = datetime(\'now\')').run();
        db.prepare('UPDATE clans SET season_xp = 0').run();


        return { success: true, season, ended: ended.changes, archived };
    })();
}

function getSeasonLeaderboard(scope = 'users', limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    if (scope === 'guilds') {
        return db.prepare(`
            SELECT guild_id, guild_name, season_xp, level, total_focus_minutes
            FROM guild_progress
            ORDER BY season_xp DESC, total_focus_minutes DESC
            LIMIT ?
        `).all(safeLimit);
    }
    if (scope === 'clans') {
        return db.prepare(`
            SELECT id, name, season_xp, level, total_focus_minutes
            FROM clans
            ORDER BY season_xp DESC, total_focus_minutes DESC
            LIMIT ?
        `).all(safeLimit);
    }
    return db.prepare(`
        SELECT discord_id, season_xp, season_focus_minutes, level, streak
        FROM users
        ORDER BY season_xp DESC, season_focus_minutes DESC
        LIMIT ?
    `).all(safeLimit);
}

function getSeasonRewards() {
    return SEASON_REWARDS.map(reward => ({ ...reward }));
}

const CLASSIFIED_EVENT_CLUES = [
    { key: 'signal', threshold: 0, text: 'The signal is real. Pomo is listening.' },
    { key: 'first_lock', thresholdPercent: 25, text: 'The first lock has opened. Keep the focus rooms active.' },
    { key: 'second_lock', thresholdPercent: 50, text: 'Halfway there. The protocol remembers every completed session.' },
    { key: 'final_lock', thresholdPercent: 75, text: 'The final lock is unstable. One last push will reveal the source.' },
    { key: 'reveal', thresholdPercent: 100, text: 'Protocol complete. The focus network has awakened.' },
];

// Per-event story. Events whose key has no theme use the classified protocol.
const EVENT_THEMES = {
    pomo_1k: {
        emoji: '🎉',
        description: 'Pomo just reached 1,000 servers! Celebrate by focusing together: every finished session, in any server, fills the shared goal. Everyone who joins in earns the 🎉 1K Celebrant title.',
        clues: [
            { key: 'kickoff', threshold: 0, text: 'The party has started. Every finished focus session counts toward the goal.' },
            { key: 'quarter', thresholdPercent: 25, text: 'A quarter of the way there! Bring a friend into your next session.' },
            { key: 'halfway', thresholdPercent: 50, text: 'Halfway! Students from servers all over the world are adding minutes.' },
            { key: 'final_stretch', thresholdPercent: 75, text: 'Final stretch. One more session from everyone gets us there.' },
            { key: 'goal', thresholdPercent: 100, text: "Goal reached! Thank you for studying with Pomo. Here's to the next 1,000." },
        ],
    },
};

function getEventTheme(eventKey) {
    return EVENT_THEMES[eventKey] || { emoji: '🔐', description: null, clues: CLASSIFIED_EVENT_CLUES };
}

/** The most recent event that finished within the last `days`, so people can still see the result. */
function getRecentlyCompletedGlobalEvent(days = 3) {
    return db.prepare(`
        SELECT * FROM global_events
        WHERE status = 'completed' AND completed_at >= datetime('now', ?)
        ORDER BY completed_at DESC
        LIMIT 1
    `).get(`-${Math.max(1, Math.floor(days))} days`) || null;
}

function getActiveGlobalEvent() {
    return db.prepare(`
        SELECT * FROM global_events
        WHERE status = 'active'
        ORDER BY id DESC
        LIMIT 1
    `).get() || null;
}

function startGlobalEvent({ eventKey, title, description, targetMinutes }) {
    const safeKey = typeof eventKey === 'string' ? eventKey.trim().slice(0, 40) : '';
    const safeTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
    const theme = getEventTheme(safeKey);
    const rawDescription = theme.description || description;
    const safeDescription = typeof rawDescription === 'string' ? rawDescription.trim().slice(0, 500) : '';
    const target = Math.max(1, Math.floor(Number(targetMinutes) || 0));
    if (!safeKey || !safeTitle || !safeDescription || target <= 0) {
        return { success: false, reason: 'invalid_input' };
    }

    return db.transaction(() => {
        if (getActiveGlobalEvent()) return { success: false, reason: 'active_exists' };
        if (db.prepare('SELECT id FROM global_events WHERE event_key = ?').get(safeKey)) {
            return { success: false, reason: 'already_exists' };
        }

        const result = db.prepare(`
            INSERT INTO global_events (event_key, title, description, target_minutes)
            VALUES (?, ?, ?, ?)
        `).run(safeKey, safeTitle, safeDescription, target);
        const event = db.prepare('SELECT * FROM global_events WHERE id = ?').get(result.lastInsertRowid);

        for (const clue of theme.clues) {
            const threshold = clue.threshold ?? Math.ceil(target * (clue.thresholdPercent / 100));
            db.prepare(`
                INSERT INTO global_event_clues (event_id, clue_key, threshold_minutes, clue_text)
                VALUES (?, ?, ?, ?)
            `).run(event.id, clue.key, threshold, clue.text);
        }
        return { success: true, event };
    })();
}

function getGlobalEventClues(eventId) {
    const event = typeof eventId === 'number'
        ? db.prepare('SELECT * FROM global_events WHERE id = ?').get(eventId)
        : getActiveGlobalEvent();
    if (!event) return [];
    return db.prepare(`
        SELECT * FROM global_event_clues
        WHERE event_id = ? AND threshold_minutes <= ?
        ORDER BY threshold_minutes ASC
    `).all(event.id, event.progress_minutes);
}

function recordGlobalEventProgress({ guildId, userId, minutes, sourceType, sourceId }) {
    if (!guildId || !userId || !sourceType || sourceId === undefined || sourceId === null) {
        return { recorded: false, reason: 'invalid_source' };
    }
    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (safeMinutes <= 0) return { recorded: false, reason: 'no_minutes' };
    getOrCreateUser(userId);

    return db.transaction(() => {
        const event = getActiveGlobalEvent();
        if (!event) return { recorded: false, reason: 'no_active_event' };

        const inserted = db.prepare(`
            INSERT OR IGNORE INTO global_event_contributions (
                event_id, guild_id, user_id, source_type, source_id, minutes
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(event.id, guildId, userId, sourceType, String(sourceId), safeMinutes);
        if (inserted.changes === 0) {
            return { recorded: false, duplicate: true, event };
        }

        const total = db.prepare(`
            SELECT COALESCE(SUM(minutes), 0) as progress
            FROM global_event_contributions
            WHERE event_id = ?
        `).get(event.id).progress;
        const completed = total >= event.target_minutes;
        db.prepare(`
            UPDATE global_events
            SET progress_minutes = ?,
                status = CASE WHEN ? = 1 THEN 'completed' ELSE status END,
                completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END
            WHERE id = ?
        `).run(total, completed ? 1 : 0, completed ? 1 : 0, event.id);

        const eventTitle = Object.values(Titles).find(title => title.eventKey === event.event_key);
        if (eventTitle) unlockTitle(userId, eventTitle.key);
        return {
            recorded: true,
            completed,
            event: db.prepare('SELECT * FROM global_events WHERE id = ?').get(event.id),
        };
    })();
}

const SERVER_QUEST_DEFINITIONS = [
    {
        key: 'focus_minutes',
        title: 'Focus Together',
        description: 'Complete shared focus minutes as a server this week',
        target: 500,
        rewardWater: 8,
        rewardXp: 40,
    },
    {
        key: 'sessions',
        title: 'Keep The Rhythm',
        description: 'Complete focus sessions together as a server this week',
        target: 20,
        rewardWater: 6,
        rewardXp: 30,
    },
    {
        key: 'contributors',
        title: 'Bring The Study Room To Life',
        description: 'Have different members complete a focus session this week',
        target: 5,
        rewardWater: 10,
        rewardXp: 50,
    },
];

function getServerQuestWeek(guildId) {
    const settings = getOrCreateGuildSettings(guildId);
    return getWeekStart(new Date(), settings.timezone || 'UTC');
}

function ensureGuildQuests(guildId) {
    const weekStart = getServerQuestWeek(guildId);
    for (const definition of SERVER_QUEST_DEFINITIONS) {
        db.prepare(`
            INSERT OR IGNORE INTO guild_quests (
                guild_id, week_start, quest_key, title, description, target, reward_water, reward_xp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            weekStart,
            definition.key,
            definition.title,
            definition.description,
            definition.target,
            definition.rewardWater,
            definition.rewardXp,
        );
    }
    return db.prepare(`
        SELECT * FROM guild_quests
        WHERE guild_id = ? AND week_start = ?
        ORDER BY id ASC
    `).all(guildId, weekStart);
}

function getCurrentGuildQuests(guildId) {
    return ensureGuildQuests(guildId);
}

function recordGuildQuestProgress({ guildId, userId, minutes, sourceType, sourceId }) {
    if (!guildId || !userId || !sourceType || sourceId === undefined || sourceId === null) {
        return { recorded: false, reason: 'invalid_source' };
    }

    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (safeMinutes <= 0) return { recorded: false, reason: 'no_minutes' };
    getOrCreateUser(userId);

    return db.transaction(() => {
        const quests = ensureGuildQuests(guildId);
        const affected = [];

        for (const quest of quests) {
            if (quest.quest_key === 'focus_minutes' || quest.quest_key === 'sessions' || quest.quest_key === 'contributors') {
                const inserted = db.prepare(`
                    INSERT OR IGNORE INTO guild_quest_contributions (
                        quest_id, user_id, source_type, source_id, minutes
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(quest.id, userId, sourceType, String(sourceId), safeMinutes);
                if (inserted.changes > 0) affected.push(quest.id);
            }

            if (quest.quest_key === 'voice_minutes' && sourceType === 'voice') {
                const inserted = db.prepare(`
                    INSERT OR IGNORE INTO guild_quest_contributions (
                        quest_id, user_id, source_type, source_id, minutes
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(quest.id, userId, sourceType, String(sourceId), safeMinutes);
                if (inserted.changes > 0) affected.push(quest.id);
            }
        }

        for (const questId of affected) {
            const quest = db.prepare('SELECT * FROM guild_quests WHERE id = ?').get(questId);
            const progress = quest.quest_key === 'sessions'
                ? db.prepare('SELECT COUNT(*) as value FROM guild_quest_contributions WHERE quest_id = ?').get(questId).value
                : quest.quest_key === 'contributors'
                    ? db.prepare('SELECT COUNT(DISTINCT user_id) as value FROM guild_quest_contributions WHERE quest_id = ?').get(questId).value
                    : db.prepare('SELECT COALESCE(SUM(minutes), 0) as value FROM guild_quest_contributions WHERE quest_id = ?').get(questId).value;
            const completed = Number(progress) >= quest.target;
            db.prepare(`
                UPDATE guild_quests
                SET progress = ?,
                    status = CASE WHEN ? = 1 THEN 'completed' ELSE status END,
                    completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END
                WHERE id = ?
            `).run(Number(progress), completed ? 1 : 0, completed ? 1 : 0, questId);
        }


        return {
            recorded: affected.length > 0,
            completed: db.prepare(`
                SELECT * FROM guild_quests
                WHERE guild_id = ? AND week_start = ? AND status = 'completed'
            `).all(guildId, getServerQuestWeek(guildId)),
        };
    })();
}

function claimGuildQuestReward(guildId, userId, questKey = null) {
    getOrCreateUser(userId);
    const quests = ensureGuildQuests(guildId);
    const eligible = quests.filter(quest =>
        quest.status === 'completed' && (!questKey || quest.quest_key === questKey)
    );
    if (eligible.length === 0) {
        return { success: false, reason: questKey ? 'not_found' : 'nothing_to_claim' };
    }

    return db.transaction(() => {
        const claimed = [];
        let water = 0;
        let xp = 0;
        for (const quest of eligible) {
            const result = db.prepare(`
                INSERT OR IGNORE INTO guild_quest_claims (quest_id, user_id)
                VALUES (?, ?)
            `).run(quest.id, userId);
            if (result.changes === 0) continue;
            incrementUser(userId, 'water', quest.reward_water);
            incrementUser(userId, 'xp', quest.reward_xp);
            water += quest.reward_water;
            xp += quest.reward_xp;
            claimed.push(quest);
        }

        if (claimed.length === 0) return { success: false, reason: 'claimed' };
        return { success: true, quests: claimed, water, xp };
    })();
}

function getGuildLeaderboard(limit = 50) {
    return db.prepare(`SELECT guild_id, guild_name, total_focus_minutes FROM guild_settings ORDER BY total_focus_minutes DESC LIMIT ?`).all(limit);
}

function getTopMembersInGuild(guildId, limit = 5) {
    return db.prepare(`
        SELECT u.discord_id as user_id, SUM(s.duration) as total_minutes
        FROM study_sessions s
        JOIN users u ON s.user_id = u.discord_id
        WHERE s.guild_id = ? AND s.completed = 1
        GROUP BY u.discord_id
        ORDER BY total_minutes DESC
        LIMIT ?
    `).all(guildId, limit);
}

// ─── Clan Helpers ───────────────────────────────────────────

function getUserClan(discordId) {
    return db.prepare(`
        SELECT c.*, cm.role 
        FROM clan_members cm 
        JOIN clans c ON cm.clan_id = c.id 
        WHERE cm.discord_id = ?
    `).get(discordId);
}

function createClan(ownerId, name) {
    const res = db.prepare('INSERT INTO clans (name, owner_id) VALUES (?, ?)').run(name, ownerId);
    db.prepare('INSERT INTO clan_members (clan_id, discord_id, role) VALUES (?, ?, ?)').run(res.lastInsertRowid, ownerId, 'owner');
    
    return res.lastInsertRowid;
}

function joinClan(clanId, discordId) {
    db.prepare('INSERT INTO clan_members (clan_id, discord_id, role) VALUES (?, ?, ?)').run(clanId, discordId, 'member');
}

function leaveClan(discordId) {
    db.prepare('DELETE FROM clan_members WHERE discord_id = ?').run(discordId);
}

function createClanInvite(clanId, inviterId, inviteeId) {
    expireOldClanInvites();
    const existing = getPendingClanInvite(clanId, inviteeId);
    if (existing) return { success: false, reason: 'already_pending', invite: existing };

    const result = db.prepare(`
        INSERT INTO clan_invites (clan_id, inviter_id, invitee_id)
        VALUES (?, ?, ?)
    `).run(clanId, inviterId, inviteeId);

    return {
        success: true,
        invite: db.prepare('SELECT * FROM clan_invites WHERE id = ?').get(result.lastInsertRowid),
    };
}

function getPendingClanInvite(clanId, inviteeId) {
    expireOldClanInvites();
    return db.prepare(`
        SELECT * FROM clan_invites
        WHERE clan_id = ?
          AND invitee_id = ?
          AND status = 'pending'
          AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC
        LIMIT 1
    `).get(clanId, inviteeId);
}

function acceptClanInvite(inviteId) {
    db.prepare("UPDATE clan_invites SET status = 'accepted' WHERE id = ? AND status = 'pending'").run(inviteId);
}

function revokePendingClanInvitesForUser(inviteeId) {
    db.prepare("UPDATE clan_invites SET status = 'revoked' WHERE invitee_id = ? AND status = 'pending'").run(inviteeId);
}

function transferClanOwnership(clanId, currentOwnerId, newOwnerId) {
    return db.transaction(() => {
        const currentOwner = db.prepare('SELECT * FROM clan_members WHERE clan_id = ? AND discord_id = ? AND role = ?')
            .get(clanId, currentOwnerId, 'owner');
        const nextOwner = db.prepare('SELECT * FROM clan_members WHERE clan_id = ? AND discord_id = ?')
            .get(clanId, newOwnerId);

        if (!currentOwner || !nextOwner) return false;

        db.prepare("UPDATE clan_members SET role = 'member' WHERE clan_id = ? AND discord_id = ?").run(clanId, currentOwnerId);
        db.prepare("UPDATE clan_members SET role = 'owner' WHERE clan_id = ? AND discord_id = ?").run(clanId, newOwnerId);
        db.prepare('UPDATE clans SET owner_id = ? WHERE id = ?').run(newOwnerId, clanId);
        return true;
    })();
}

function dissolveClan(clanId) {
    return db.transaction(() => {
        db.prepare('DELETE FROM clan_invites WHERE clan_id = ?').run(clanId);
        db.prepare('DELETE FROM clan_members WHERE clan_id = ?').run(clanId);
        const result = db.prepare('DELETE FROM clans WHERE id = ?').run(clanId);
        return result.changes > 0;
    })();
}

function expireOldClanInvites() {
    db.prepare(`
        UPDATE clan_invites
        SET status = 'expired'
        WHERE status = 'pending'
          AND datetime(expires_at) <= datetime('now')
    `).run();
}

function addClanXP(clanId, minutes, xpBoost = 0) {
    let xpGained = minutes + xpBoost;
    db.prepare(`UPDATE clans SET total_focus_minutes = total_focus_minutes + ?, xp = xp + ?, season_xp = season_xp + ? WHERE id = ?`).run(minutes, xpGained, xpGained, clanId);
    
    // Level up clan logic
    const clan = db.prepare('SELECT xp, level FROM clans WHERE id = ?').get(clanId);
    let newLevel = clan.level;
    // Simple clan leveling curve
    while (clan.xp >= newLevel * 500) {
        newLevel++;
    }
    if (newLevel > clan.level) {
        db.prepare('UPDATE clans SET level = ? WHERE id = ?').run(newLevel, clanId);
    }
}

function addItemToInventory(userId, itemKey, quantity) {
    db.prepare(`
        INSERT INTO inventory (user_id, item_key, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(userId, itemKey, quantity);
}

function getClanLeaderboardTotal(limit = 10) {
    return db.prepare('SELECT * FROM clans ORDER BY xp DESC LIMIT ?').all(limit);
}

function getClanMembers(clanId) {
    return db.prepare('SELECT * FROM clan_members WHERE clan_id = ?').all(clanId);
}

function setRuntimeState(key, value) {
    db.prepare(`
        INSERT INTO runtime_state (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')
    `).run(key, String(value));
}

function getRuntimeState(key) {
    return db.prepare('SELECT value, updated_at FROM runtime_state WHERE key = ?').get(key) || null;
}

// ─── Export ─────────────────────────────────────────────────

module.exports = {
    addItemToInventory,
    db,
    initDatabase,
    getOrCreateUser,
    recoverStreakWithWater,
    getUserExams,
    addUserExam,
    deleteUserExam,
    createBuddyRequest,
    getWaitingBuddyRequests,
    isGlobalBuddyMatchingEnabled,
    isStudyHubEnabled,
    isStudyHubAcceptingGuests,
    getEligibleStudyHubs,
    getGlobalWaitingBuddyRequests,
    expireStaleBuddyRequests,
    isBuddyBlocked,
    blockBuddyUser,
    isBuddyUnmatched,
    hasBuddyMatchHistory,
    unmatchBuddyPair,
    BUDDY_REPORT_REASONS,
    normalizeBuddyReportReason,
    createBuddyReport,
    countBuddyReportsToday,
    countRecentBuddyRequests,
    recordBuddySwipe,
    hasBuddyLiked,
    getBuddyActedUserIds,
    matchBuddyRequest,
    matchBuddyPair,
    endBuddyRequest,
    BUDDY_DESTINATIONS,
    normalizeBuddyDestination,
    setBuddyDestination,
    getMatchDestinationState,
    BUDDY_EVENT_NAMES,
    recordBuddyEvent,
    getBuddyFunnelStats,
    buddyMatchKey,
    buddyMatchScope,
    recordHubConsent,
    getHubConsents,
    clearHubConsents,
    claimHubInvite,
    getHubInvite,
    markHubInviteSent,
    markHubInviteFailed,
    addGoalToSession,
    completeGoalForSession,
    createChallenge,
    getActiveChallengesForGuild,
    getActiveChallengesForUser,
    getChallengeById,
    joinChallenge,
    getChallengeLeaderboard,
    updateChallengeProgress,
    unlockTitle,
    syncUserTitles,
    getUserTitles,
    getActiveTitle,
    setActiveTitle,
    getPremiumEntitlement,
    getOrCreateProProfileSettings,
    updateProProfileSettings,
    recordStreakBreak,
    getStreakRecoveryStatus,
    recoverStreak,
    setRuntimeState,
    getRuntimeState,
    grantPremium,
    revokePremium,
    listActivePremiumEntitlements,
    expirePremiumEntitlements,
    getPremiumEvents,
    updateUser,
    incrementUser,
    deductWaterAtomic,
    getOrCreateSettings,
    createSession,
    updateSessionPomodoroData,
    updateTeamSessionPomodoroData,
    getActiveSessions,
    getActiveSessionForUser,
    isUserInAnyActiveSession,
    completeSession,
    deleteSession,
    markReminderSent,
    getPastSessionTitles,
    getFriends,
    getPendingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    canNotifyFriend,
    getUserPets,
    getActivePet,
    addPet,
    equipPet,
    awardPetXP,
    addTodo,
    getActiveTodos,
    getActiveTodoByPosition,
    getTodoByIdForUser,
    addFocusMinutesToTodo,
    completeTodo,
    deleteTodo,
    getCompletedTodos,
    createStudyPlan,
    getStudyPlan,
    updatePlanMessageId,
    updatePlanStatus,
    getPlanSignups,
    signupForPlan,
    leaveFromPlan,
    getActivePlans,
    getHostPlan,
    getOrCreateGuildSettings,
    updateGuildSettings,
    updateGuildTimezone,
    getAllEnabledGuildReports,
    recordGuildJoin,
    recordGuildLeave,
    syncGuildInstallations,
    getGuildAnalytics,
    recordCommandUsage,
    getUserActiveGuildLanguage,
    recordOnboardingEvent,
    getOnboardingAnalytics,
    markOnboardingTipShown,
    hasSeenOnboardingTip,
    getSeenOnboardingTips,
    getActivationAnalytics,
    getSetupFunnelAnalytics,
    getChurnAnalytics,
    getRetentionAnalytics,
    getTopCommands,
    getSetupReminderCandidates,
    markSetupReminderAttempt,
    getSetupNudgeEligibility,
    markSetupNudgeSent,
    getSetupNudgeCandidates,
    getWeekStart,
    configureGuildGoal,
    getOrCreateCurrentGuildGoal,
    getGuildGoalStats,
    getGuildGoalContributors,
    getGuildGoalContribution,
    recordGuildGoalContribution,
    disableGuildGoal,
    getPersonalGoalPeriod,
    configurePersonalGoal,
    getOrCreateCurrentPersonalGoal,
    getPersonalGoalStats,
    recordPersonalGoalContribution,
    disablePersonalGoal,
    claimGuildGoalReward,
    getVoiceSettings,
    createVoiceSession,
    getActiveVoiceSession,
    getActiveVoiceSessions,
    touchVoiceSession,
    completeVoiceSession,
    getVoiceRewardedMinutesForDay,
    getVoiceCreditedMinutesForDay,
    getVoiceStats,
    updateGuildScore,
    guildXpForMinutes,
    guildXpForLevel,
    guildLevelForXp,
    recordGuildFocusProgress,
    getGuildProgress,
    getGuildXpToNextLevel,
    SERVER_QUEST_DEFINITIONS,
    getCurrentGuildQuests,
    recordGuildQuestProgress,
    claimGuildQuestReward,
    getActiveSeason,
    startNewSeason,
    getSeasonLeaderboard,
    getSeasonRewards,
    getUserSeasonHistory,
    getLastArchivedSeasonTop,
    getActiveGlobalEvent,
    getRecentlyCompletedGlobalEvent,
    getEventTheme,
    startGlobalEvent,
    getGlobalEventClues,
    recordGlobalEventProgress,
    getGuildLeaderboard,
    getTopMembersInGuild,
    getUserClan,
    createClan,
    joinClan,
    leaveClan,
    createClanInvite,
    getPendingClanInvite,
    acceptClanInvite,
    revokePendingClanInvitesForUser,
    transferClanOwnership,
    dissolveClan,
    addClanXP,
    getClanLeaderboardTotal,
    getClanMembers,
};

function getPendingActivityCommands() {
    return db.prepare("SELECT * FROM activity_commands WHERE status = 'pending'").all();
}

function markActivityCommandProcessed(id, newStatus = 'processed') {
    db.prepare("UPDATE activity_commands SET status = ? WHERE id = ?").run(newStatus, id);
}

module.exports.getPendingActivityCommands = getPendingActivityCommands;
module.exports.markActivityCommandProcessed = markActivityCommandProcessed;

function recordActivityReward(userId, reward) {
    if (!userId || !reward) return null;
    const result = db.prepare(`
        INSERT INTO activity_rewards (
            user_id, source_type, source_id, title, minutes, water, xp, streak, level, leveled_up, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
        userId,
        reward.sourceType || 'study',
        reward.sourceId || null,
        reward.title || 'Focus Session',
        reward.minutes || 0,
        reward.water || 0,
        reward.xp || 0,
        reward.streak || 0,
        reward.level || 1,
        reward.leveledUp ? 1 : 0,
    );
    return result.lastInsertRowid;
}

function getUnseenActivityRewards(userId, limit = 5) {
    return db.prepare(`
        SELECT id, user_id, source_type, source_id, title, minutes, water, xp, streak, level, leveled_up, created_at
        FROM activity_rewards
        WHERE user_id = ? AND seen_at IS NULL
        ORDER BY id DESC
        LIMIT ?
    `).all(userId, limit);
}

function markActivityRewardsSeen(userId, ids) {
    if (!userId || !Array.isArray(ids) || ids.length === 0) return 0;
    const cleanIds = ids.map(id => Number(id)).filter(Number.isInteger);
    if (cleanIds.length === 0) return 0;
    const placeholders = cleanIds.map(() => '?').join(',');
    const info = db.prepare(`
        UPDATE activity_rewards
        SET seen_at = datetime('now')
        WHERE user_id = ? AND id IN (${placeholders})
    `).run(userId, ...cleanIds);
    return info.changes;
}

module.exports.recordActivityReward = recordActivityReward;
module.exports.getUnseenActivityRewards = getUnseenActivityRewards;
module.exports.markActivityRewardsSeen = markActivityRewardsSeen;

// ─── Market Prices ─────────────────────────────────────────────

/**
 * Get today's market prices for all plant items.
 * Returns a map of { item_key: price }.
 */
function getMarketPrices() {
    const rows = db.prepare('SELECT item_key, price FROM market_prices').all();
    const map = {};
    for (const row of rows) map[row.item_key] = row.price;
    return map;
}

/**
 * Set (upsert) the market price for a single item.
 */
function setMarketPrice(itemKey, price) {
    db.prepare(`
        INSERT INTO market_prices (item_key, price, updated_at)
        VALUES (?, ?, date('now'))
        ON CONFLICT(item_key) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at
    `).run(itemKey, price);
}

/**
 * Atomically deduct crops from inventory and credit water.
 * Returns { ok, waterGained } or { ok: false, reason }.
 */
function sellCrops(userId, itemKey, quantity) {
    return db.transaction(() => {
        const inv = db.prepare(
            'SELECT * FROM inventory WHERE user_id = ? AND item_key = ?'
        ).get(userId, itemKey);

        if (!inv || inv.quantity < quantity) {
            return { ok: false, reason: 'not_enough' };
        }

        const priceRow = db.prepare('SELECT price FROM market_prices WHERE item_key = ?').get(itemKey);
        if (!priceRow) return { ok: false, reason: 'no_price' };

        const waterGained = priceRow.price * quantity;

        if (inv.quantity === quantity) {
            db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
        } else {
            db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, inv.id);
        }

        db.prepare('UPDATE users SET water = water + ? WHERE discord_id = ?').run(waterGained, userId);

        return { ok: true, waterGained, price: priceRow.price };
    })();
}

module.exports.getMarketPrices = getMarketPrices;
module.exports.setMarketPrice = setMarketPrice;
module.exports.sellCrops = sellCrops;

// ─── Pet Evolution ─────────────────────────────────────────────

/**
 * Attempt to evolve a pet.
 * Checks pet is Lv10, not already evolved, and user has required crops.
 * On success: consumes crops, resets pet to Lv1 xp=0, sets evolved=1.
 *
 * @param {string} userId
 * @param {string} petKey
 * @param {Object} evolveRequires  e.g. { apple: 3 }
 * @returns {{ ok: boolean, reason?: string }}
 */
function evolvePet(userId, petKey, evolveRequires) {
    return db.transaction(() => {
        const pet = db.prepare(
            'SELECT * FROM user_pets WHERE user_id = ? AND pet_key = ?'
        ).get(userId, petKey);

        if (!pet) return { ok: false, reason: 'not_owned' };
        if (pet.level < 10) return { ok: false, reason: 'not_max_level', level: pet.level };
        if (pet.evolved === 1) return { ok: false, reason: 'already_evolved' };

        // Check and consume required crops
        for (const [itemKey, qty] of Object.entries(evolveRequires)) {
            const inv = db.prepare(
                'SELECT * FROM inventory WHERE user_id = ? AND item_key = ?'
            ).get(userId, itemKey);

            if (!inv || inv.quantity < qty) {
                return { ok: false, reason: 'missing_ingredients', itemKey, need: qty, have: inv?.quantity ?? 0 };
            }
        }

        // All checks passed — consume ingredients
        for (const [itemKey, qty] of Object.entries(evolveRequires)) {
            const inv = db.prepare(
                'SELECT * FROM inventory WHERE user_id = ? AND item_key = ?'
            ).get(userId, itemKey);

            if (inv.quantity === qty) {
                db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
            } else {
                db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(qty, inv.id);
            }
        }

        // Reset pet to Lv1, mark evolved
        db.prepare(
            'UPDATE user_pets SET level = 1, xp = 0, evolved = 1 WHERE user_id = ? AND pet_key = ?'
        ).run(userId, petKey);

        return { ok: true };
    })();
}

module.exports.evolvePet = evolvePet;

// ─── Clan Treasury & Garden ────────────────────────────────────

function getClanInventory(clanId) {
    return db.prepare('SELECT item_key, quantity FROM clan_inventory WHERE clan_id = ? AND quantity > 0').all(clanId);
}

function donateToClan(userId, clanId, itemKey, amount) {
    return db.transaction(() => {
        if (itemKey === 'water') {
            const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get(userId);
            if (!user || user.water < amount) return { ok: false, reason: 'not_enough' };
            
            db.prepare('UPDATE users SET water = water - ? WHERE discord_id = ?').run(amount, userId);
            db.prepare('UPDATE clans SET water = water + ? WHERE id = ?').run(amount, clanId);
            return { ok: true };
        } else {
            const inv = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
            if (!inv || inv.quantity < amount) return { ok: false, reason: 'not_enough' };
            
            if (inv.quantity === amount) {
                db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
            } else {
                db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(amount, inv.id);
            }
            
            db.prepare(`
                INSERT INTO clan_inventory (clan_id, item_key, quantity) 
                VALUES (?, ?, ?) 
                ON CONFLICT(clan_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity
            `).run(clanId, itemKey, amount);
            
            return { ok: true };
        }
    })();
}

function upgradeClanTree(clanId, requirements) {
    return db.transaction(() => {
        const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
        if (!clan) return { ok: false, reason: 'not_found' };
        
        // Check requirements
        for (const [itemKey, qty] of Object.entries(requirements)) {
            if (itemKey === 'water') {
                if (clan.water < qty) return { ok: false, reason: 'missing_ingredients', itemKey, need: qty, have: clan.water };
            } else {
                const inv = db.prepare('SELECT quantity FROM clan_inventory WHERE clan_id = ? AND item_key = ?').get(clanId, itemKey);
                if (!inv || inv.quantity < qty) return { ok: false, reason: 'missing_ingredients', itemKey, need: qty, have: inv?.quantity || 0 };
            }
        }
        
        // Consume requirements
        for (const [itemKey, qty] of Object.entries(requirements)) {
            if (itemKey === 'water') {
                db.prepare('UPDATE clans SET water = water - ? WHERE id = ?').run(qty, clanId);
            } else {
                db.prepare('UPDATE clan_inventory SET quantity = quantity - ? WHERE clan_id = ? AND item_key = ?').run(qty, clanId, itemKey);
            }
        }
        
        db.prepare('UPDATE clans SET tree_level = tree_level + 1 WHERE id = ?').run(clanId);
        return { ok: true, newLevel: clan.tree_level + 1 };
    })();
}

module.exports.getClanInventory = getClanInventory;
module.exports.donateToClan = donateToClan;
module.exports.upgradeClanTree = upgradeClanTree;

// ─── Referral System ──────────────────────────────────────────────

function setReferral(userId, referrerId) {
    const user = getOrCreateUser(userId);
    
    // Check if user already used a code
    if (user.referred_by) {
        return { success: false, reason: 'already_referred' };
    }
    
    // Check if referrer exists and is not the user themselves
    if (userId === referrerId) {
        return { success: false, reason: 'self_referral' };
    }
    
    const referrer = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(referrerId);
    if (!referrer) {
        return { success: false, reason: 'invalid_referrer' };
    }
    
    // Set referral
    db.prepare('UPDATE users SET referred_by = ? WHERE discord_id = ?').run(referrerId, userId);
    return { success: true };
}

function getReferralStats(userId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE referred_by = ?').get(userId);
    return row.count || 0;
}

module.exports.setReferral = setReferral;
module.exports.getReferralStats = getReferralStats;

module.exports.transactionManager = transactionManager;
module.exports.identityRepository = identityRepository;
module.exports.userRepository = userRepository;
module.exports.inventoryRepository = inventoryRepository;
module.exports.sessionRepository = sessionRepository;
module.exports.teamSessionRepository = teamSessionRepository;
module.exports.voiceSessionRepository = voiceSessionRepository;
module.exports.pomomatchRepository = pomomatchRepository;
module.exports.guildRepository = guildRepository;
module.exports.clanRepository = clanRepository;
module.exports.seasonRepository = seasonRepository;
module.exports.marketRepository = marketRepository;
module.exports.challengeRepository = challengeRepository;
module.exports.gardenRepository = gardenRepository;
module.exports.petRepository = petRepository;

// Functions used in sessionComplete.js that were missing from exports
module.exports.getActiveChallengesForUser = getActiveChallengesForUser;
module.exports.updateChallengeProgress = updateChallengeProgress;
module.exports.recordStreakBreak = recordStreakBreak;
module.exports.awardPetXP = awardPetXP;
module.exports.recordGuildFocusProgress = recordGuildFocusProgress;
