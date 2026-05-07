import type {
  WishlistItem,
  AddWishlistBody,
  UpdateWishlistBody,
} from "@workspace/api-client-react";
import { get, post, put, del } from "../fetch";

export const wishlist = {
  list: (): Promise<WishlistItem[]> =>
    get("/api/wishlist"),

  add: (body: AddWishlistBody): Promise<WishlistItem> =>
    post("/api/wishlist", body),

  update: (id: number, body: UpdateWishlistBody): Promise<WishlistItem> =>
    put(`/api/wishlist/${id}`, body),

  remove: (id: number): Promise<void> =>
    del(`/api/wishlist/${id}`),
};
