/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require('http');
const { parse } = require('url');
const crypto = require('crypto');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Socket.io security helpers
// ---------------------------------------------------------------------------

const ROOM_STATUSES = new Set(['waiting', 'active', 'paused', 'completed']);
const TIMER_ACTIONS = new Set(['start', 'pause', 'resume', 'stop']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TIMESTAMP_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

function originOf(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const origins = new Set(
    [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXTAUTH_URL]
      .map(originOf)
      .filter(Boolean)
  );
  if (dev) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }
  return origins;
}

function isAllowedOrigin(origin) {
  // Same-origin polling requests may omit Origin; the handshake token is
  // still required for every connection.
  if (!origin) return true;
  return getAllowedOrigins().has(origin);
}

// Must match lib/activityAuth.ts getActivityTokenSecret() and
// lib/roomAuth.ts createRoomSocketToken().
function getRoomSocketKey() {
  const secret = process.env.ACTIVITY_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('pomo-room-socket-v1').digest();
}

function verifyRoomSocketToken(token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const key = getRoomSocketKey();
  if (!key) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(payload).digest('base64url'));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.typ !== 'room_socket') return null;
    if (typeof claims.sid !== 'string' || !UUID_RE.test(claims.sid)) return null;
    if (typeof claims.uid !== 'string' || !claims.uid) return null;
    if (!Number.isFinite(claims.exp) || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sid: claims.sid,
      uid: claims.uid,
      kind: claims.kind === 'user' ? 'user' : 'guest',
      host: claims.host === true && claims.kind === 'user',
    };
  } catch {
    return null;
  }
}

/** Fixed-window limiter; returns false when over the limit. */
function makeLimiter(limit, windowMs) {
  const hits = new Map();
  let lastSweep = Date.now();
  return function allow(key) {
    const now = Date.now();
    if (now - lastSweep > windowMs * 2) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  };
}

function sanitizeTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  const now = Date.now();
  if (ms > now + MAX_TIMESTAMP_SKEW_MS || ms < now - MAX_TIMESTAMP_AGE_MS) return undefined;
  return new Date(ms).toISOString();
}

/** Returns a clean timer payload or null when the shape is invalid. */
function sanitizeTimerPayload(data, sessionId) {
  if (!data || typeof data !== 'object') return null;
  if (!ROOM_STATUSES.has(data.status)) return null;
  const startedAt = sanitizeTimestamp(data.startedAt);
  const pausedAt = sanitizeTimestamp(data.pausedAt);
  const endsAt = sanitizeTimestamp(data.endsAt);
  if (startedAt === undefined || pausedAt === undefined || endsAt === undefined) return null;
  const pausedTotalSeconds = Number(data.pausedTotalSeconds ?? 0);
  if (!Number.isInteger(pausedTotalSeconds) || pausedTotalSeconds < 0 || pausedTotalSeconds > 7 * 24 * 3600) return null;
  return { sessionId, status: data.status, startedAt, pausedAt, endsAt, pausedTotalSeconds };
}

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
      methods: ['GET', 'POST'],
    },
    // CORS does not apply to WebSocket upgrades, so check Origin here too.
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
    maxHttpBufferSize: 16 * 1024,
  });

  const allowConnection = makeLimiter(30, 60 * 1000); // per IP
  const allowJoin = makeLimiter(10, 60 * 1000); // per socket
  const allowTimerEvent = makeLimiter(20, 10 * 1000); // per socket

  // Handshake auth: a short-lived room token issued by the room page's server
  // action (getRoomSocketTokenAction) after checking room membership.
  io.use((socket, nextFn) => {
    // Cloudflare sets cf-connecting-ip; x-forwarded-for can be supplied by the client.
    const h = socket.handshake.headers;
    const ip = String(h['cf-connecting-ip'] || h['x-real-ip'] || h['x-forwarded-for'] || socket.handshake.address || 'unknown').split(',')[0].trim();
    if (!allowConnection(ip)) return nextFn(new Error('rate_limited'));
    const claims = verifyRoomSocketToken(socket.handshake.auth && socket.handshake.auth.token);
    if (!claims) return nextFn(new Error('unauthorized'));
    socket.data.claims = claims;
    return nextFn();
  });

  io.on('connection', (socket) => {
    const claims = socket.data.claims;
    const roomName = `session_${claims.sid}`;
    let joined = false;

    // Join a specific session room (only the room the token was issued for).
    socket.on('join_session', (sessionId) => {
      if (!allowJoin(socket.id)) {
        socket.disconnect(true);
        return;
      }
      if (typeof sessionId !== 'string' || sessionId !== claims.sid) return;
      if (joined) return;
      joined = true;
      socket.join(roomName);
      io.to(roomName).emit('user_joined', { socketId: socket.id });
    });

    socket.on('leave_session', (sessionId) => {
      if (typeof sessionId !== 'string' || sessionId !== claims.sid) return;
      joined = false;
      socket.leave(roomName);
    });

    // Timer sync event (host -> server -> room)
    socket.on('sync_timer', (data) => {
      if (!claims.host || !joined) return;
      if (!allowTimerEvent(socket.id)) return;
      if (!data || data.sessionId !== claims.sid) return;
      const clean = sanitizeTimerPayload(data, claims.sid);
      if (!clean) return;
      socket.to(roomName).emit('timer_updated', clean);
    });

    // Play/Pause actions (host only)
    socket.on('timer_action', (data) => {
      if (!claims.host || !joined) return;
      if (!allowTimerEvent(socket.id)) return;
      if (!data || data.sessionId !== claims.sid || !TIMER_ACTIONS.has(data.action)) return;
      io.to(roomName).emit('timer_action_broadcast', { sessionId: claims.sid, action: data.action });
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (with Socket.io)`);
    if (!dev && getAllowedOrigins().size === 0) {
      console.warn('[Socket.io] NEXT_PUBLIC_SITE_URL / NEXTAUTH_URL not set: browser socket connections with an Origin header will be rejected.');
    }
  });
});
