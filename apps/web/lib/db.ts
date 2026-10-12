import { SqliteIdentityRepository, SqliteProductivityRepository, SqliteInventoryRepository, SqliteUserRepository, SqliteTransactionManager, SqlitePetRepository, SqliteGardenRepository } from '@pomo/db';
import { PET_DROPS, PLANT_KEYS, STORE_ITEM_BY_KEY, type StoreItemType } from './gameData';
import { getSqlite } from './sqlite';

/**
 * Returns the shared SQLite connection (see lib/sqlite.ts).
 * The `readonly` flag is kept for call-site compatibility; the shared handle is
 * read-write. Never call `.close()` on it.
 */
export function getDb(_readonly = false) {
  return getSqlite();
}

export function getProductivityRepository() {
  const db = getDb();
  const identityRepo = new SqliteIdentityRepository(db);
  return new SqliteProductivityRepository(db, identityRepo);
}

/**
 * Map a Discord snowflake to the internal SQLite `users.id` expected by the
 * Sqlite*Repository classes. With `create`, a missing users row is created
 * (same behaviour as the bot's first interaction).
 */
export async function resolveSqliteUserId(discordId: string, create = false): Promise<string | null> {
  const identityRepo = getIdentityRepository();
  if (create) {
    return (await identityRepo.resolveIdentity('discord', discordId)).userId;
  }
  return identityRepo.lookupIdentity('discord', discordId);
}


export function getUserStats(discordId: string) {
  try {
    const db = getDb(true);
    const user = db.prepare('SELECT water, xp, level, streak, total_focus_minutes FROM users WHERE discord_id = ?').get(discordId) as any;
    return user || null;
  } catch (err) {
    console.error("DB Error (Stats):", err);
    return null;
  }
}

export function getProtocolDashboardData(discordId: string) {
  try {
    const db = getDb(true);
    const user = db.prepare(`
      SELECT discord_id, season_xp, season_focus_minutes, active_title_key
      FROM users
      WHERE discord_id = ?
    `).get(discordId) as any;
    const season = db.prepare(`
      SELECT id, name, started_at
      FROM seasons
      WHERE is_active = 1
      ORDER BY id DESC
      LIMIT 1
    `).get() as any;
    const event = db.prepare(`
      SELECT id, event_key, title, description, target_minutes, progress_minutes, status, started_at
      FROM global_events
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `).get() as any;

    let clues: any[] = [];
    if (event) {
      clues = db.prepare(`
        SELECT clue_key, threshold_minutes, clue_text
        FROM global_event_clues
        WHERE event_id = ? AND threshold_minutes <= ?
        ORDER BY threshold_minutes ASC
      `).all(event.id, event.progress_minutes) as any[];
    }

    const titles = db.prepare(`
      SELECT title_key, unlocked_at
      FROM user_titles
      WHERE user_id = ?
      ORDER BY unlocked_at ASC, id ASC
    `).all(discordId) as any[];

    const users = db.prepare(`
      SELECT discord_id, season_xp, season_focus_minutes, level
      FROM users
      ORDER BY season_xp DESC, season_focus_minutes DESC
      LIMIT 10
    `).all() as any[];
    const guilds = db.prepare(`
      SELECT guild_id, guild_name, season_xp, level, total_focus_minutes
      FROM guild_progress
      ORDER BY season_xp DESC, total_focus_minutes DESC
      LIMIT 10
    `).all() as any[];
    const clans = db.prepare(`
      SELECT id, name, season_xp, level, total_focus_minutes
      FROM clans
      ORDER BY season_xp DESC, total_focus_minutes DESC
      LIMIT 10
    `).all() as any[];

    return {
      user: user || { season_xp: 0, season_focus_minutes: 0, active_title_key: null },
      season: season || null,
      event: event ? { ...event, clues } : null,
      titles,
      leaderboards: { users, guilds, clans },
    };
  } catch (err) {
    console.error("DB Error (ProtocolDashboard):", err);
    return {
      user: { season_xp: 0, season_focus_minutes: 0, active_title_key: null },
      season: null,
      event: null,
      titles: [],
      leaderboards: { users: [], guilds: [], clans: [] },
    };
  }
}

export function getUserTopSubjects(discordId: string, limit = 5) {
  try {
    const db = getDb(true);
    const hasSubject = (db.prepare("PRAGMA table_info(study_sessions)").all() as any[])
      .some((column) => column.name === 'subject');
    if (!hasSubject) {
      return [];
    }
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(subject, ''), 'general') as subject,
             SUM(duration) as minutes,
             COUNT(*) as sessions
      FROM study_sessions
      WHERE user_id = ?
        AND completed = 1
        AND title != '__break__'
      GROUP BY COALESCE(NULLIF(subject, ''), 'general')
      ORDER BY minutes DESC, sessions DESC
      LIMIT ?
    `).all(discordId, limit) as any[];
    return rows;
  } catch (err) {
    console.error("DB Error (TopSubjects):", err);
    return [];
  }
}

export function getUserSubjectAnalytics(discordId: string, periodDays = 30, limit = 6) {
  try {
    const db = getDb(true);
    const hasSubject = (db.prepare("PRAGMA table_info(study_sessions)").all() as any[])
      .some((column) => column.name === 'subject');
    if (!hasSubject) {
      return {
        periodDays,
        totalMinutes: 0,
        totalSessions: 0,
        subjects: [],
        bestSubject: null,
        focusDiversity: 0,
        categorizedPercent: 0,
      };
    }

    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(subject, ''), 'general') as subject,
             SUM(duration) as minutes,
             COUNT(*) as sessions,
             ROUND(AVG(duration)) as avgMinutes,
             MAX(started_at) as lastSessionAt
      FROM study_sessions
      WHERE user_id = ?
        AND completed = 1
        AND title != '__break__'
        AND date(started_at) >= date('now', '-' || ? || ' days')
      GROUP BY COALESCE(NULLIF(subject, ''), 'general')
      ORDER BY minutes DESC, sessions DESC
      LIMIT ?
    `).all(discordId, periodDays, limit) as any[];

    const totals = db.prepare(`
      SELECT SUM(duration) as totalMinutes,
             COUNT(*) as totalSessions,
             SUM(CASE WHEN COALESCE(NULLIF(subject, ''), 'general') != 'general' THEN duration ELSE 0 END) as categorizedMinutes
      FROM study_sessions
      WHERE user_id = ?
        AND completed = 1
        AND title != '__break__'
        AND date(started_at) >= date('now', '-' || ? || ' days')
    `).get(discordId, periodDays) as any;

    const totalMinutes = Number(totals?.totalMinutes || 0);
    const totalSessions = Number(totals?.totalSessions || 0);
    const categorizedMinutes = Number(totals?.categorizedMinutes || 0);
    const subjects = rows.map((row) => ({
      ...row,
      minutes: Number(row.minutes || 0),
      sessions: Number(row.sessions || 0),
      avgMinutes: Number(row.avgMinutes || 0),
      percent: totalMinutes > 0 ? Math.round((Number(row.minutes || 0) / totalMinutes) * 100) : 0,
    }));

    return {
      periodDays,
      totalMinutes,
      totalSessions,
      subjects,
      bestSubject: subjects[0] || null,
      focusDiversity: subjects.length,
      categorizedPercent: totalMinutes > 0 ? Math.round((categorizedMinutes / totalMinutes) * 100) : 0,
    };
  } catch (err) {
    console.error("DB Error (SubjectAnalytics):", err);
    return {
      periodDays,
      totalMinutes: 0,
      totalSessions: 0,
      subjects: [],
      bestSubject: null,
      focusDiversity: 0,
      categorizedPercent: 0,
    };
  }
}

export function getUserPets(discordId: string) {
  try {
    const db = getDb(true);
    // Sadece aktif pet'i getir, dilersek tüm inventory'i de çekebiliriz
    const activePet = db.prepare('SELECT pet_key, level, xp, is_active, evolved FROM user_pets WHERE user_id = ? AND is_active = 1').get(discordId) as any;
    return activePet ? [activePet] : [];
  } catch (err) {
    console.error("DB Error (Pets):", err);
    return [];
  }
}

export function getLeaderboard(limit = 50) {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT discord_id, level, xp, total_focus_minutes, streak
      FROM users
      ORDER BY total_focus_minutes DESC, xp DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows;
  } catch (err) {
    console.error("DB Error (Leaderboard):", err);
    return [];
  }
}

export function getUserAllPets(discordId: string) {
  try {
    const db = getDb(true);
    const pets = db.prepare('SELECT pet_key, level, xp, is_active, evolved FROM user_pets WHERE user_id = ? ORDER BY is_active DESC, level DESC').all(discordId) as any[];
    return pets;
  } catch (err) {
    console.error("DB Error (AllPets):", err);
    return [];
  }
}

export function getUserGarden(discordId: string) {
  try {
    const db = getDb(true);
    const garden = db.prepare('SELECT id, plant_type, stage, water_used, planted_at, last_watered FROM garden_plots WHERE user_id = ? ORDER BY planted_at ASC').all(discordId) as any[];
    return garden;
  } catch (err) {
    console.error("DB Error (Garden):", err);
    return [];
  }
}

export function getUserHarvests(discordId: string) {
  try {
    const db = getDb(true);
    const harvests = db.prepare('SELECT plant_type, COUNT(*) as count FROM harvested_items WHERE user_id = ? GROUP BY plant_type ORDER BY count DESC').all(discordId) as any[];
    return harvests;
  } catch (err) {
    console.error("DB Error (Harvests):", err);
    return [];
  }
}

// ------ TODOS CRUD ------

export async function getUserTodos(discordId: string) {
  try {
    const productivityRepository = getProductivityRepository();
    const userId = await getIdentityRepository().lookupIdentity("discord", discordId);
    if (!userId) return [];
    const tasks = await productivityRepository.listTasks(userId, false);
    return tasks;
  } catch (err) {
    console.error("DB Error (GetTodos):", err);
    return [];
  }
}

export async function addTodo(discordId: string, content: string) {
  try {
    const productivityRepository = getProductivityRepository();
    const userId = await getIdentityRepository().resolveIdentity("discord", discordId).then(r => r.userId);
    const res = await productivityRepository.createTask(userId, content);
    return res.success;
  } catch (err) {
    console.error("DB Error (AddTodo):", err);
    return false;
  }
}

export async function toggleTodo(discordId: string, id: string, completed: boolean) {
  try {
    const productivityRepository = getProductivityRepository();
    if (completed) {
      const userId = await getIdentityRepository().lookupIdentity("discord", discordId); return userId ? await productivityRepository.completeTask(userId, id) : false;
    } else {
      const userId = await getIdentityRepository().lookupIdentity("discord", discordId); return userId ? await productivityRepository.uncompleteTask(userId, id) : false;
    }
  } catch (err) {
    console.error("DB Error (ToggleTodo):", err);
    return false;
  }
}

export async function deleteTodo(discordId: string, id: string) {
  try {
    const productivityRepository = getProductivityRepository();
    const userId = await getIdentityRepository().lookupIdentity("discord", discordId); return userId ? await productivityRepository.deleteTask(userId, id) : false;
  } catch (err) {
    console.error("DB Error (DeleteTodo):", err);
    return false;
  }
}

// ------ SESSIONS CRUD ------

export function getUserSessions(discordId: string, limit = 50) {
  try {
    const db = getDb(true);
    const hasSubject = (db.prepare("PRAGMA table_info(study_sessions)").all() as any[])
      .some((column) => column.name === 'subject');
    const sessions = db.prepare(hasSubject
      ? 'SELECT id, duration, title, started_at, completed, COALESCE(subject, \'general\') as subject FROM study_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT id, duration, title, started_at, completed, \'general\' as subject FROM study_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(discordId, limit) as any[];
    return sessions;
  } catch (err) {
    console.error("DB Error (GetSessions):", err);
    return [];
  }
}

// ------ FRIENDS CRUD ------

export function getUserFriends(discordId: string) {
  try {
    const db = getDb(true);
    // Get all approved friend IDs
    const friendsRows = db.prepare(`
      SELECT sender_id, receiver_id 
      FROM friends 
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
    `).all(discordId, discordId) as any[];

    const friendIds = friendsRows.map(r => r.sender_id === discordId ? r.receiver_id : r.sender_id);

    if (friendIds.length === 0) {
      return [];
    }

    // Fetch details for those friends
    const placeholders = friendIds.map(() => '?').join(',');
    const friendsData = db.prepare(`
      SELECT discord_id, level, xp, total_focus_minutes 
      FROM users 
      WHERE discord_id IN (${placeholders})
    `).all(...friendIds) as any[];
    
    return friendsData;
  } catch (err) {
    console.error("DB Error (GetFriends):", err);
    return [];
  }
}

// ------ PETS MUTATIONS ------

export function equipUserPet(discordId: string, petKey: string) {
  try {
    const db = getDb(false);
    const owned = db.prepare('SELECT id FROM user_pets WHERE user_id = ? AND pet_key = ?').get(discordId, petKey);
    if (!owned) {
      return false;
    }

    // 1. Unequip all pets
    db.prepare('UPDATE user_pets SET is_active = 0 WHERE user_id = ?').run(discordId);
    // 2. Equip the chosen one
    db.prepare('UPDATE user_pets SET is_active = 1 WHERE user_id = ? AND pet_key = ?').run(discordId, petKey);
    return true;
  } catch (err) {
    console.error("DB Error (EquipPet):", err);
    return false;
  }
}

// ------ PROFILE MUTATIONS ------

export function getUserProfile(discordId: string) {
  try {
    const db = getDb(true);
    const profile = db.prepare(`
      SELECT
        users.bio,
        users.theme,
        COALESCE(pro_profile_settings.accent_key, 'gold') AS proAccent,
        COALESCE(pro_profile_settings.badge_key, 'pomo_pro') AS proBadge
      FROM users
      LEFT JOIN pro_profile_settings
        ON pro_profile_settings.user_id = users.discord_id
      WHERE users.discord_id = ?
    `).get(discordId) as any;
    return profile || {
      bio: '',
      theme: 'basic',
      proAccent: 'gold',
      proBadge: 'pomo_pro',
    };
  } catch (err) {
    console.error("DB Error (GetProfile):", err);
    return {
      bio: '',
      theme: 'basic',
      proAccent: 'gold',
      proBadge: 'pomo_pro',
    };
  }
}

export function updateUserProfile(
  discordId: string,
  bio: string,
  theme: string,
  proAccent: string,
  proBadge: string
) {
  try {
    const db = getDb(false);
    const update = db.transaction(() => {
      db.prepare('UPDATE users SET bio = ?, theme = ? WHERE discord_id = ?').run(bio, theme, discordId);
      db.prepare(`
        INSERT INTO pro_profile_settings (user_id, accent_key, badge_key, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          accent_key = excluded.accent_key,
          badge_key = excluded.badge_key,
          updated_at = datetime('now')
      `).run(discordId, proAccent, proBadge);
    });
    update();
    return true;
  } catch (err) {
    console.error("DB Error (UpdateProfile):", err);
    return false;
  }
}

// ------ LIVE SESSIONS ------

export function getLiveSessions() {
  try {
    const db = getDb(true);
    
    // Get active team sessions
    const sessions = db.prepare(`
      SELECT id, host_id, duration, started_at, ends_at, status 
      FROM team_sessions 
      WHERE status IN ('waiting', 'active', 'break')
      ORDER BY started_at DESC
    `).all() as any[];

    // For each session, fetch its members
    for (const session of sessions) {
      const members = db.prepare(`
        SELECT user_id, joined_at 
        FROM team_members 
        WHERE session_id = ?
      `).all(session.id) as any[];
      
      session.members = members;
    }
    
    return sessions;
  } catch (err) {
    console.error("DB Error (GetLiveSessions):", err);
    return [];
  }
}

// ------ INVENTORY / THEMES ------

export function getUserThemes(discordId: string) {
  try {
    const db = getDb(true);
    // Find all items in inventory starting with 'theme_'
    const rows = db.prepare(`SELECT item_key FROM inventory WHERE user_id = ? AND item_key LIKE 'theme_%'`).all(discordId) as { item_key: string }[];
    
    // Convert 'theme_nature' to 'nature'
    const themes = rows.map(r => r.item_key.replace('theme_', ''));
    
    // basic is always unlocked
    if (!themes.includes('basic')) {
      themes.push('basic');
    }
    
    return themes;
  } catch (err) {
    console.error("DB Error (GetThemes):", err);
    return ['basic'];
  }
}

export function processStorePurchase(discordId: string, itemKey: string, _clientCost: number, _itemType: StoreItemType) {
  const db = getDb(false);
  const item = STORE_ITEM_BY_KEY[itemKey];
  const actualCost = item?.cost;
  const actualType = item?.type;

  try {
    if (!item || actualCost === undefined || !actualType) throw new Error('INVALID_ITEM');

    const transaction = db.transaction(() => {
      const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get(discordId) as any;
      if (!user || user.water < actualCost) {
        throw new Error('NOT_ENOUGH_WATER');
      }

      if (itemKey === 'seed_pack') {
        const plotCount = db.prepare('SELECT COUNT(*) as cnt FROM garden_plots WHERE user_id = ?').get(discordId) as any;
        if (plotCount.cnt >= 6) throw new Error('GARDEN_FULL');
      }

      if (actualType === 'theme') {
        const existing = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(discordId, itemKey);
        if (existing) throw new Error('ALREADY_OWNED');
      }

      const updateWater = db.prepare('UPDATE users SET water = water - ? WHERE discord_id = ? AND water >= ?');
      const result = updateWater.run(actualCost, discordId, actualCost);
      if (result.changes === 0) throw new Error('NOT_ENOUGH_WATER');

      const deliveryResult = { success: true, message: "Purchase complete!" };

      if (actualType === 'theme') {
        db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1)').run(discordId, itemKey);
        const themeKey = itemKey.replace('theme_', '');
        db.prepare('UPDATE users SET theme = ? WHERE discord_id = ?').run(themeKey, discordId);
        deliveryResult.message = "Theme unlocked and equipped!";
      } else if (actualType === 'seed_pack') {
        const randomPlant = PLANT_KEYS[Math.floor(Math.random() * PLANT_KEYS.length)];
        db.prepare('INSERT INTO garden_plots (user_id, plant_type, stage, water_used, planted_at) VALUES (?, ?, 0, 0, datetime(\'now\'))').run(discordId, randomPlant);
        deliveryResult.message = `Seed Pack opened! Planted a ${randomPlant} in your garden!`;
      } else if (actualType === 'pet_box') {
        const totalChance = PET_DROPS.reduce((sum, p) => sum + p.chance, 0);
        let rand = Math.random() * totalChance;
        let selectedPet: string = PET_DROPS[0].key;
        for (const p of PET_DROPS) {
          if (rand < p.chance) { selectedPet = p.key; break; }
          rand -= p.chance;
        }

        const existingPet = db.prepare('SELECT id FROM user_pets WHERE user_id = ? AND pet_key = ?').get(discordId, selectedPet);
        if (!existingPet) {
          const petCount = db.prepare('SELECT COUNT(*) as count FROM user_pets WHERE user_id = ?').get(discordId) as { count: number };
          db.prepare('INSERT INTO user_pets (user_id, pet_key, level, xp, is_active) VALUES (?, ?, 1, 0, ?)').run(discordId, selectedPet, petCount.count === 0 ? 1 : 0);
          deliveryResult.message = `Box opened! You got a new pet: ${selectedPet}!`;
        } else {
          db.prepare('UPDATE users SET water = water + 150 WHERE discord_id = ?').run(discordId);
          deliveryResult.message = `You got a duplicate ${selectedPet}. The box refunded you 150 💧!`;
        }
      } else {
        const existing = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(discordId, itemKey) as any;
        if (existing) {
          db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
        } else {
          db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1)').run(discordId, itemKey);
        }
        deliveryResult.message = "Item added to your inventory!";
      }

      return deliveryResult;
    });

    const res = transaction();
    return res;
  } catch (err: any) {
    return { success: false, message: err.message || "Transaction failed" };
  }
}

export function getClanLeaderboardWeb(limit = 50) {
  try {
    const db = getDb(true);
    const rows = db.prepare(`
      SELECT id, name, total_focus_minutes, xp, level
      FROM clans
      ORDER BY xp DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows;
  } catch (err) {
    console.error("DB Error (GetClanLeaderboardWeb):", err);
    return [];
  }
}

export function getIdentityRepository() {
  const db = getDb();
  return new SqliteIdentityRepository(db);
}

export function getInventoryRepository() {
  const db = getDb();
  const identityRepo = new SqliteIdentityRepository(db);
  return new SqliteInventoryRepository(db, identityRepo);
}

export function getUserRepository() {
  const db = getDb();
  return new SqliteUserRepository(db);
}
// One manager per process so its async mutex actually serialises transactions
// on the shared connection.
let transactionManager: SqliteTransactionManager | null = null;
export function getTransactionManager() {
  if (!transactionManager) transactionManager = new SqliteTransactionManager(getDb(false));
  return transactionManager;
}


export function getPetRepository() {
  const db = getDb();
  const identityRepo = new SqliteIdentityRepository(db);
  return new SqlitePetRepository(db, identityRepo);
}
export function getGardenRepository() {
  const db = getDb();
  const identityRepo = new SqliteIdentityRepository(db);
  return new SqliteGardenRepository(db, identityRepo);
}
