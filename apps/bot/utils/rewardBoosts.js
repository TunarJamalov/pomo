/**
 * Shared reward multipliers so solo, team and voice sessions stay consistent.
 */

const { db } = require('./database');
const { isProActive } = require('./premiumManager');

/**
 * Apply the 2x water doubler. Active Pro doubles water for free; otherwise a
 * `water_boost` item is used (when allowItem).
 * Returns { water, source } where source is 'item', 'premium' or null.
 */
function applyWaterDoubler(userId, water, { allowItem = true } = {}) {
    // Pro already doubles water, so a water_boost item is kept for later
    if (isProActive(userId)) return { water: water * 2, source: 'premium' };
    if (allowItem) {
        const boost = db.prepare(`
            SELECT * FROM inventory
            WHERE user_id = ? AND item_key = 'water_boost' AND quantity > 0
        `).get(userId);
        if (boost) {
            if (boost.quantity <= 1) {
                db.prepare('DELETE FROM inventory WHERE id = ?').run(boost.id);
            } else {
                db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(boost.id);
            }
            return { water: water * 2, source: 'item' };
        }
    }
    return { water, source: null };
}

module.exports = { applyWaterDoubler };
