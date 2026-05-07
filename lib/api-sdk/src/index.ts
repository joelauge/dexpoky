export { DexPokyClient } from "./client";
export type { DexPokyClientOptions } from "./client";

export { setBaseUrl, setAuthTokenGetter, ApiError } from "./fetch";
export type { AuthTokenGetter } from "./fetch";

export * from "./resources/health";
export * from "./resources/cards";
export * from "./resources/categories";
export * from "./resources/marketplace";
export * from "./resources/inventory";
export * from "./resources/decks";
export * from "./resources/catalog";
export * from "./resources/wishlist";
export * from "./resources/wanted";
export * from "./resources/messages";
export * from "./resources/pokemon";
export * from "./resources/rules";
export * from "./resources/storage";
export * from "./resources/users";
export * from "./resources/ratings";
export * from "./resources/wallet";
export * from "./resources/trades";
export * from "./resources/billing";
export * from "./resources/outreach";
export * from "./resources/links";

export type {
  Card,
  CreateCardBody,
  UpdateCardBody,
  ListCardsParams,
  Category,
  CreateCategoryBody,
  UpdateCategoryBody,
  Listing,
  CreateListingBody,
  UpdateListingBody,
  ListListingsParams,
  ListListingsStatus,
  InventoryStats,
  CategoryValue,
  DeckSummary,
  DeckWithCards,
  Deck,
  CreateDeckBody,
  UpdateDeckBody,
  AddDeckCardBody,
  SuggestDeckBody,
  SuggestDeckResponse,
  SuggestedDeckCard,
  CatalogCard,
  CatalogCardDetail,
  CatalogSearchResponse,
  SearchCatalogParams,
  WishlistItem,
  AddWishlistBody,
  UpdateWishlistBody,
  WantedListing,
  CreateWantedBody,
  UpdateWantedBody,
  ListWantedListingsParams,
  DmThread,
  DmThreadSummary,
  DmMessage,
  SendMessageBody,
  StartThreadBody,
  PokemonResult,
  SearchPokemonParams,
  RulebookResponse,
  RulebookSection,
  RulebookSearchResult,
  SearchRulebookParams,
  UploadUrlRequest,
  UploadUrlResponse,
  HealthStatus,
  ErrorEnvelope,
  CardRarity,
  CardCondition,
} from "@workspace/api-client-react";
