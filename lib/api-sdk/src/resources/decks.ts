import type {
  DeckSummary,
  DeckWithCards,
  Deck,
  CreateDeckBody,
  UpdateDeckBody,
  AddDeckCardBody,
  SuggestDeckBody,
  SuggestDeckResponse,
} from "@workspace/api-client-react";
import { get, post, put, del } from "../fetch";

export const decks = {
  list: (): Promise<DeckSummary[]> =>
    get("/api/decks"),

  get: (id: number): Promise<DeckWithCards> =>
    get(`/api/decks/${id}`),

  create: (body: CreateDeckBody): Promise<Deck> =>
    post("/api/decks", body),

  update: (id: number, body: UpdateDeckBody): Promise<Deck> =>
    put(`/api/decks/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/decks/${id}`),

  addCard: (id: number, body: AddDeckCardBody): Promise<DeckWithCards> =>
    post(`/api/decks/${id}/cards`, body),

  removeCard: (id: number, cardId: number): Promise<void> =>
    del(`/api/decks/${id}/cards/${cardId}`),

  suggest: (body: SuggestDeckBody): Promise<SuggestDeckResponse> =>
    post("/api/decks/suggest", body),
};
