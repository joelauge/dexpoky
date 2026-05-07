import type {
  Listing,
  CreateListingBody,
  UpdateListingBody,
  ListListingsParams,
} from "@workspace/api-client-react";
import { get, post, put, del } from "../fetch";

export const marketplace = {
  list: (params?: ListListingsParams): Promise<Listing[]> =>
    get("/api/marketplace", params as Record<string, string | number | boolean | undefined | null>),

  get: (id: number): Promise<Listing> =>
    get(`/api/marketplace/${id}`),

  create: (body: CreateListingBody): Promise<Listing> =>
    post("/api/marketplace", body),

  update: (id: number, body: UpdateListingBody): Promise<Listing> =>
    put(`/api/marketplace/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/marketplace/${id}`),

  getBids: (id: number): Promise<unknown[]> =>
    get(`/api/marketplace/${id}/bids`),

  placeBid: (id: number, body: { amount: number }): Promise<unknown> =>
    post(`/api/marketplace/${id}/bids`, body),

  createCheckout: (id: number): Promise<{ url: string }> =>
    post(`/api/marketplace/${id}/checkout`),

  confirmPurchase: (id: number, body: Record<string, unknown>): Promise<unknown> =>
    post(`/api/marketplace/${id}/confirm-purchase`, body),

  startThread: (id: number, body: { initialMessage: string }): Promise<unknown> =>
    post(`/api/marketplace/${id}/thread`, body),
};
