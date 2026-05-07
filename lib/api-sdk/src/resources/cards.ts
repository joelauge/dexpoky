import type {
  Card,
  CreateCardBody,
  UpdateCardBody,
  ListCardsParams,
} from "@workspace/api-client-react";
import { get, post, put, del } from "../fetch";

export const cards = {
  list: (params?: ListCardsParams): Promise<Card[]> =>
    get("/api/cards", params as Record<string, string | number | boolean | undefined | null>),

  get: (id: number): Promise<Card> =>
    get(`/api/cards/${id}`),

  create: (body: CreateCardBody): Promise<Card> =>
    post("/api/cards", body),

  update: (id: number, body: UpdateCardBody): Promise<Card> =>
    put(`/api/cards/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/cards/${id}`),

  getListing: (cardId: number): Promise<unknown> =>
    get(`/api/cards/${cardId}/listing`),

  deleteListing: (cardId: number): Promise<void> =>
    del(`/api/cards/${cardId}/listing`),

  getPriceHistory: (id: number): Promise<unknown[]> =>
    get(`/api/cards/${id}/price-history`),

  identify: (body: { imageUrl: string }): Promise<unknown> =>
    post("/api/cards/identify", body),

  lookup: (params: { query?: string; imageUrl?: string }): Promise<unknown> =>
    get("/api/cards/lookup", params),

  getPricing: (params: { name?: string; setName?: string; cardNumber?: string }): Promise<unknown> =>
    get("/api/cards/pricing", params),
};
