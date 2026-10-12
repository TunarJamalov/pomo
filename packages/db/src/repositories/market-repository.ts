import { TransactionContext } from '../transaction/transaction-manager';

export interface MarketPrice {
    item_key: string;
    price: number;
    updated_at: string;
}

export interface MarketRepository {
    getMarketPrices(ctx?: TransactionContext): Promise<MarketPrice[]>;
    getMarketPrice(itemKey: string, ctx?: TransactionContext): Promise<MarketPrice | null>;
    setMarketPrice(itemKey: string, price: number, ctx?: TransactionContext): Promise<void>;
}
