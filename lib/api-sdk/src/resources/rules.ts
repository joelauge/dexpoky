import type {
  RulebookResponse,
  RulebookSearchResult,
  SearchRulebookParams,
} from "@workspace/api-client-react";
import { get } from "../fetch";

export const rules = {
  get: (): Promise<RulebookResponse> =>
    get("/api/rules"),

  search: (params: SearchRulebookParams): Promise<RulebookSearchResult[]> =>
    get("/api/rules/search", params),
};
