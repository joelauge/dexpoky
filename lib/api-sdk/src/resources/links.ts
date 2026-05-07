import { post } from "../fetch";

export interface BuiltLink {
  url: string;
  shortUrl: string;
}

export const links = {
  /**
   * Build a canonical URL + short URL for a marketplace listing.
   * Returns the public `/view/listing/:id` page.
   */
  listing: (id: number): Promise<BuiltLink> =>
    post("/api/links/build", { type: "listing", id }),

  /**
   * Build a canonical URL + short URL for a single card in a collection.
   * Returns the public `/view/card/:id` page.
   */
  card: (id: number): Promise<BuiltLink> =>
    post("/api/links/build", { type: "card", id }),

  /**
   * Build a canonical URL + short URL for a group share (bundle of cards).
   * Pass the group share code (e.g. from client.marketplace).
   */
  groupShare: (code: string): Promise<BuiltLink> =>
    post("/api/links/build", { type: "groupShare", code }),

  /**
   * Build a canonical URL + short URL for a "Looking For" / Wanted listing.
   * Pass the wanted listing's short code.
   */
  wanted: (code: string): Promise<BuiltLink> =>
    post("/api/links/build", { type: "wanted", code }),

  /**
   * Build a canonical URL + short URL for a user's public collection.
   * Pass ownerClerkId to link to a specific user's collection,
   * or omit it to link to the authenticated user's own collection.
   */
  collection: (ownerClerkId?: string): Promise<BuiltLink> =>
    post("/api/links/build", { type: "collection", ownerClerkId }),
};
