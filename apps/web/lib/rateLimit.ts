/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Process-local (the web app runs as a single `node server.js` process), so it
 * is a best-effort abuse guard, not a distributed quota.
 */
type Bucket = { count: number; resetAt: number };

const g = globalThis as typeof globalThis & { __pomoRateLimits?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = g.__pomoRateLimits ?? (g.__pomoRateLimits = new Map());

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Returns true when the call is allowed, false when `limit` calls were already
 * made for `key` within the current `windowMs` window.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Best-effort client IP. The site sits behind Cloudflare, which overwrites
 * cf-connecting-ip with the real client address; x-forwarded-for's first entry
 * is whatever the client sent, so it is only the last resort.
 */
export function getClientIp(headers: Headers): string {
  const cloudflare = headers.get('cf-connecting-ip')?.trim();
  if (cloudflare) return cloudflare;
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
