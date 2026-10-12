import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const MAX_FIELD_LENGTH = 500;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_KEYS = 40;
const MAX_DEPTH = 4;

type SanitizedValue = string | number | boolean | null | undefined | SanitizedValue[] | { [key: string]: SanitizedValue };

function sanitize(value: unknown, depth = 0): SanitizedValue {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, MAX_FIELD_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 10).map((entry) => sanitize(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_KEYS)
        .map(([key, entry]) => [key.slice(0, 64), sanitize(entry, depth + 1)])
    );
  }
  return String(value).slice(0, MAX_FIELD_LENGTH);
}

/**
 * Client-side diagnostics for the Discord Activity boot flow. The client sends
 * these before it has an activity token, so the endpoint cannot require one.
 * It is therefore disabled in production unless ACTIVITY_DEBUG_ENABLED=1, and
 * always size-capped and rate-limited per IP.
 */
function isEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.ACTIVITY_DEBUG_ENABLED === '1';
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const ip = getClientIp(request.headers);
  if (!rateLimit(`activity-debug:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    const sanitized = sanitize(JSON.parse(raw));
    const claims = getActivityClaims(request);
    const payload = {
      at: new Date().toISOString(),
      ip,
      user: claims?.sub ?? null,
      ...(sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : { value: sanitized }),
    };

    console.log('[ACTIVITY_DEBUG]', JSON.stringify(payload));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ACTIVITY_DEBUG_ERROR]', error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
