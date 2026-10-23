import { ensureSqliteSchema } from '@/lib/sqlite';
import type { ActivityClaims } from '@/lib/activityAuth';

/**
 * Desktop tokens are signed and last 180 days, so they can't be deleted one by one.
 * Instead each user has a cut-off: desktop tokens issued before it stop working.
 */
function getDb() {
  return ensureSqliteSchema('desktop_token_revocations', `
    CREATE TABLE IF NOT EXISTS desktop_token_revocations (
      user_id TEXT PRIMARY KEY,
      revoked_at INTEGER NOT NULL
    )
  `);
}

/** Disconnects every desktop app the user has connected so far. */
export function revokeDesktopTokens(userId: string) {
  getDb().prepare(`
    INSERT INTO desktop_token_revocations (user_id, revoked_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at
  `).run(userId, Math.floor(Date.now() / 1000));
}

/** True for a desktop token issued before the user's last "disconnect all". */
export function isDesktopTokenRevoked(claims: ActivityClaims) {
  if (claims.scope !== 'desktop') return false;
  const row = getDb().prepare('SELECT revoked_at FROM desktop_token_revocations WHERE user_id = ?')
    .get(claims.sub) as { revoked_at: number } | undefined;
  // Tokens from before iat existed count as issued at 0, so they can be revoked too
  return Boolean(row && (claims.iat ?? 0) < row.revoked_at);
}
