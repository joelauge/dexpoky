import type { PokemonResult, SearchPokemonParams } from "@workspace/api-client-react";
import { get } from "../fetch";

export const pokemon = {
  search: (params: SearchPokemonParams): Promise<PokemonResult[]> =>
    get("/api/pokemon/search", params),
};
