import type { InventoryStats, CategoryValue, Card, GetRecentActivityParams } from "@workspace/api-client-react";
import { get, del } from "../fetch";

export interface TradingStats {
  totalSales: number;
  totalRevenue: number;
  totalTrades: number;
}

export interface MyShare {
  id: number;
  code: string;
  url: string;
  createdAt: string;
}

export const inventory = {
  getStats: (): Promise<InventoryStats> =>
    get("/api/inventory/stats"),

  getValueByCategory: (): Promise<CategoryValue[]> =>
    get("/api/inventory/value-by-category"),

  getRecentActivity: (params?: GetRecentActivityParams): Promise<Card[]> =>
    get("/api/inventory/recent-activity", params),

  getTradingStats: (): Promise<TradingStats> =>
    get("/api/inventory/trading-stats"),

  getMyShares: (): Promise<MyShare[]> =>
    get("/api/inventory/my-shares"),

  deleteShortLink: (id: number): Promise<void> =>
    del(`/api/inventory/short-links/${id}`),
};
