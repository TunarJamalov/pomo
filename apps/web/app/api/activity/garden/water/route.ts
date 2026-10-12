import { NextResponse } from 'next/server';
import { getActivityClaims } from '@/lib/activityAuth';
import { getDb } from '@/lib/db';

const Plants: any = {
    carrot: { name: 'Carrot', emoji: '🥕', stages: ['🌱', '🌿', '🌸', '🥕'], waterPerStage: 3, feedXP: 30 },
    tomato: { name: 'Tomato', emoji: '🍅', stages: ['🌱', '🌿', '🌸', '🍅'], waterPerStage: 5, feedXP: 60 },
    potato: { name: 'Potato', emoji: '🥔', stages: ['🌱', '🌿', '🌸', '🥔'], waterPerStage: 8, feedXP: 100 },
    apple: { name: 'Apple', emoji: '🍎', stages: ['🌱', '🌿', '🌸', '🍎'], waterPerStage: 12, feedXP: 180 },
};

export async function POST(request: Request) {
  try {
    const { userId, plotId } = await request.json();
    const claims = getActivityClaims(request);
    if (!claims || claims.sub !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userId || !plotId) {
      return NextResponse.json({ error: 'Missing userId or plotId' }, { status: 400 });
    }

    const db = getDb(false);

    // Synchronous transaction on the shared connection (no awaits inside).
    const water = db.transaction(() => {
      const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get(userId) as any;
      if (!user || user.water <= 0) {
        throw new Error('NOT_ENOUGH_WATER');
      }

      const plot = db.prepare('SELECT * FROM garden_plots WHERE id = ? AND user_id = ?').get(plotId, userId) as any;
      if (!plot) {
        throw new Error('PLOT_NOT_FOUND');
      }

      if (plot.stage >= 3) {
        throw new Error('ALREADY_RIPE');
      }

      const plant = Plants[plot.plant_type];
      if (!plant) throw new Error('INVALID_PLANT_TYPE');

      const progressToNextStage = plot.water_used % plant.waterPerStage;
      const waterNeeded = plant.waterPerStage - progressToNextStage;
      const waterToUse = Math.min(user.water, waterNeeded);

      if (waterToUse <= 0) {
        throw new Error('NOT_ENOUGH_WATER');
      }

      const waterUpdate = db
        .prepare('UPDATE users SET water = water - ? WHERE discord_id = ? AND water >= ?')
        .run(waterToUse, userId, waterToUse);
      if (waterUpdate.changes === 0) {
        throw new Error('NOT_ENOUGH_WATER');
      }

      const newWaterUsed = plot.water_used + waterToUse;
      let newStage = plot.stage;

      if (newWaterUsed % plant.waterPerStage === 0 && newWaterUsed > 0) {
        newStage = Math.min(plot.stage + 1, 3);
      }

      db.prepare('UPDATE garden_plots SET water_used = ?, stage = ?, last_watered = datetime(\'now\') WHERE id = ?').run(newWaterUsed, newStage, plotId);

      return { newStage, newWaterUsed, waterUsed: waterToUse, remainingWater: user.water - waterToUse };
    });

    try {
      const result = water();
      return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  } catch (error) {
    console.error('Watering Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
