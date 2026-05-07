import type {
  WantedListing,
  CreateWantedBody,
  UpdateWantedBody,
  ListWantedListingsParams,
  DmThread,
  StartThreadBody,
} from "@workspace/api-client-react";
import { get, post, patch, del } from "../fetch";

export const wanted = {
  list: (params?: ListWantedListingsParams): Promise<WantedListing[]> =>
    get("/api/wanted", params),

  listMine: (): Promise<WantedListing[]> =>
    get("/api/wanted/mine"),

  getByCode: (code: string): Promise<WantedListing> =>
    get(`/api/wanted/by-code/${code}`),

  create: (body: CreateWantedBody): Promise<WantedListing> =>
    post("/api/wanted", body),

  update: (id: number, body: UpdateWantedBody): Promise<WantedListing> =>
    patch(`/api/wanted/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/wanted/${id}`),

  startThread: (id: number, body: StartThreadBody): Promise<DmThread> =>
    post(`/api/wanted/${id}/thread`, body),
};
