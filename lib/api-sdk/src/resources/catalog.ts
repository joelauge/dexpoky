import type { CatalogSearchResponse, CatalogCardDetail, SearchCatalogParams } from "@workspace/api-client-react";
import { get } from "../fetch";

export const catalog = {
  search: (params: SearchCatalogParams): Promise<CatalogSearchResponse> =>
    get("/api/catalog/search", params),

  getCard: (id: string): Promise<CatalogCardDetail> =>
    get(`/api/catalog/cards/${id}`),
};
