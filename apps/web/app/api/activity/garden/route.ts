import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const claims = getActivityClaims(request);
  if (!claims || claims.sub !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb(true);

    const plots = db.prepare('SELECT id, plant_type, stage, water_used, planted_at FROM garden_plots WHERE user_id = ?').all(userId);
    const user = (db.prepare('SELECT water, level FROM users WHERE discord_id = ?').get(userId) as any) || { water: 0, level: 1 };


    return NextResponse.json({ plots, water: user.water, level: user.level ?? 1 });
  } catch (error) {
    console.error('Garden Fetch Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
