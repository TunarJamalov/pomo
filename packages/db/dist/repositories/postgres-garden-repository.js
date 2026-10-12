"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresGardenRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const gamification_1 = require("../schema/gamification");
class PostgresGardenRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapPlot(row) {
        return {
            id: String(row.id),
            user_id: row.user_id,
            plant_type: row.plant_type,
            stage: row.stage || 0,
            water_used: row.water_used || 0,
            planted_at: row.planted_at,
            last_watered: row.last_watered
        };
    }
    async getPlots(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(gamification_1.garden_plots).where((0, drizzle_orm_1.eq)(gamification_1.garden_plots.user_id, userId));
        return rows.map((r) => this.mapPlot(r));
    }
    async getPlot(plotId, userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(gamification_1.garden_plots)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.garden_plots.id, String(plotId)), (0, drizzle_orm_1.eq)(gamification_1.garden_plots.user_id, userId)))
            .limit(1);
        return result.length > 0 ? this.mapPlot(result[0]) : null;
    }
    async plantSeed(userId, plantType, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(gamification_1.garden_plots).values({
            user_id: userId,
            plant_type: plantType,
            stage: 0,
            water_used: 0
        });
    }
    async updatePlot(plotId, waterUsed, stage, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.update(gamification_1.garden_plots)
            .set({
            water_used: waterUsed,
            stage: stage,
            last_watered: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`
        })
            .where((0, drizzle_orm_1.eq)(gamification_1.garden_plots.id, String(plotId)));
    }
    async removePlot(plotId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(gamification_1.garden_plots)
            .where((0, drizzle_orm_1.eq)(gamification_1.garden_plots.id, String(plotId)))
            .returning({ id: gamification_1.garden_plots.id });
        return result.length > 0;
    }
    async logHarvest(userId, plantType, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(gamification_1.harvested_items).values({
            user_id: userId,
            plant_type: plantType
        });
    }
}
exports.PostgresGardenRepository = PostgresGardenRepository;
