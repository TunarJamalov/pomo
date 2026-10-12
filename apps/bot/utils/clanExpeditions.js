const { db } = require('./database');

/**
 * Return the clan's running expedition, marking it failed if its time ran out.
 */
function getActiveExpedition(clanId) {
    const expedition = db.prepare('SELECT * FROM clan_expeditions WHERE clan_id = ? AND status = ?').get(clanId, 'active');
    if (expedition && new Date() > new Date(expedition.ends_at)) {
        db.prepare('UPDATE clan_expeditions SET status = ? WHERE id = ?').run('failed', expedition.id);
        return null;
    }
    return expedition || null;
}

/**
 * Add focus minutes to an active clan expedition
 */
function addFocusMinutesToExpedition(userId, clanId, minutes) {
    if (!clanId || minutes <= 0) return null;

    const activeExpedition = db.prepare('SELECT * FROM clan_expeditions WHERE clan_id = ? AND status = ?').get(clanId, 'active');
    
    if (!activeExpedition) return null;

    // Check if it's expired
    if (new Date() > new Date(activeExpedition.ends_at)) {
        db.prepare('UPDATE clan_expeditions SET status = ? WHERE id = ?').run('failed', activeExpedition.id);
        return { completed: false, failed: true, expedition: activeExpedition };
    }

    // Add progress
    db.prepare(`
        INSERT INTO clan_expedition_members (expedition_id, user_id, contributed_minutes)
        VALUES (?, ?, ?)
        ON CONFLICT(expedition_id, user_id) DO UPDATE SET contributed_minutes = contributed_minutes + ?
    `).run(activeExpedition.id, userId, minutes, minutes);

    db.prepare('UPDATE clan_expeditions SET current_minutes = current_minutes + ? WHERE id = ?').run(minutes, activeExpedition.id);
    
    const updated = db.prepare('SELECT * FROM clan_expeditions WHERE id = ?').get(activeExpedition.id);
    
    // Check for completion
    if (updated.current_minutes >= updated.target_minutes) {
        db.prepare('UPDATE clan_expeditions SET status = ? WHERE id = ?').run('completed', updated.id);
        
        // Award clan XP / water
        const xpReward = Math.floor(updated.target_minutes * 0.5);
        db.prepare('UPDATE clans SET xp = xp + ?, season_xp = season_xp + ?, water = water + ? WHERE id = ?')
            .run(xpReward, xpReward, xpReward, clanId);
            
        return { completed: true, failed: false, expedition: updated, xpReward };
    }
    
    return { completed: false, failed: false, expedition: updated };
}

module.exports = { addFocusMinutesToExpedition, getActiveExpedition };
