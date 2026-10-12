import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { SqliteSessionRepository, SqliteTeamSessionRepository, SqliteIdentityRepository } from '@pomo/db';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  try {
    let userId = null;
    const claims = getActivityClaims(req);
    if (claims && claims.sub) {
      userId = claims.sub;
    } else {
      const session = await getServerSession(authOptions);
      if ((session?.user as any)?.id) userId = (session?.user as any)?.id;
    }

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb(true);

    // Read-only repository use on the shared connection
    const identityRepo = new SqliteIdentityRepository(db);
    const sessionRepo = new SqliteSessionRepository(db, identityRepo);
    const teamRepo = new SqliteTeamSessionRepository(db);
    const ctx = { db }; // dummy context for read-only ops

    let activeSession = null;

    const solo = await sessionRepo.getActiveSession(ctx, userId);
    if (solo) {
      activeSession = { type: 'solo', duration: solo.duration, started_at: solo.started_at, status: 'active' };
    } else {
      const team = teamRepo.getActiveOrWaitingSessionByUserId(ctx, userId);
      if (team) {
        activeSession = { type: 'team', status: team.status, duration: team.duration, started_at: team.startedAt };
      }
    }

    return NextResponse.json({ activeSession });
  } catch (error) {
    console.error('Activity status GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
