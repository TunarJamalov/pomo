"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresMarketRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresMarketRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async getMarketPrices(ctx) {
        const prices = await this.getDb(ctx)
            .select()
            .from(schema.market_prices);
        return prices.map((p) => this.mapMarketPrice(p));
    }
    async getMarketPrice(itemKey, ctx) {
        const prices = await this.getDb(ctx)
            .select()
            .from(schema.market_prices)
            .where((0, drizzle_orm_1.eq)(schema.market_prices.item_key, itemKey))
            .limit(1);
        if (!prices.length)
            return null;
        return this.mapMarketPrice(prices[0]);
    }
    async setMarketPrice(itemKey, price, ctx) {
        await this.getDb(ctx)
            .insert(schema.market_prices)
            .values({
            item_key: itemKey,
            price
        })
            .onConflictDoUpdate({
            target: schema.market_prices.item_key,
            set: {
                price,
                updated_at: (0, drizzle_orm_1.sql) `now()`
            }
        });
    }
    mapMarketPrice(row) {
        return {
            item_key: row.item_key,
            price: row.price,
            updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || '')
        };
    }
}
exports.PostgresMarketRepository = PostgresMarketRepository;
