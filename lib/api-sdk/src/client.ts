import { setBaseUrl, setAuthTokenGetter } from "./fetch";
import type { AuthTokenGetter } from "./fetch";

import { health } from "./resources/health";
import { cards } from "./resources/cards";
import { categories } from "./resources/categories";
import { marketplace } from "./resources/marketplace";
import { inventory } from "./resources/inventory";
import { decks } from "./resources/decks";
import { catalog } from "./resources/catalog";
import { wishlist } from "./resources/wishlist";
import { wanted } from "./resources/wanted";
import { messages } from "./resources/messages";
import { pokemon } from "./resources/pokemon";
import { rules } from "./resources/rules";
import { storage } from "./resources/storage";
import { users } from "./resources/users";
import { ratings } from "./resources/ratings";
import { wallet } from "./resources/wallet";
import { trades } from "./resources/trades";
import { billing } from "./resources/billing";
import { outreach } from "./resources/outreach";
import { links } from "./resources/links";

export interface DexPokyClientOptions {
  /**
   * Base URL for the API server. Required when calling from a non-browser
   * environment (Node.js, React Native). Example: "https://myapp.replit.app"
   *
   * Leave unset when calling from within the DexPoky web app itself — the
   * browser uses relative paths routed through the shared reverse proxy.
   */
  baseUrl?: string;

  /**
   * A function that returns a Clerk bearer token (or null). Called before
   * every authenticated request. Required for Node.js / React Native clients.
   *
   * In browser contexts where Clerk session cookies handle auth automatically,
   * this can be omitted.
   */
  getToken?: AuthTokenGetter;
}

/**
 * DexPoky API SDK
 *
 * A typed, framework-agnostic client for every DexPoky service. Works in
 * Node.js, browsers, and React Native with no framework dependencies.
 *
 * @example
 * ```ts
 * import { DexPokyClient } from "@workspace/api-sdk";
 *
 * const client = new DexPokyClient({
 *   baseUrl: "https://myapp.replit.app",
 *   getToken: () => clerk.session?.getToken() ?? null,
 * });
 *
 * const listings = await client.marketplace.list({ search: "charizard" });
 * const card = await client.cards.get(42);
 * ```
 */
export class DexPokyClient {
  readonly health = health;
  readonly cards = cards;
  readonly categories = categories;
  readonly marketplace = marketplace;
  readonly inventory = inventory;
  readonly decks = decks;
  readonly catalog = catalog;
  readonly wishlist = wishlist;
  readonly wanted = wanted;
  readonly messages = messages;
  readonly pokemon = pokemon;
  readonly rules = rules;
  readonly storage = storage;
  readonly users = users;
  readonly ratings = ratings;
  readonly wallet = wallet;
  readonly trades = trades;
  readonly billing = billing;
  readonly outreach = outreach;
  readonly links = links;

  constructor(options: DexPokyClientOptions = {}) {
    if (options.baseUrl) {
      setBaseUrl(options.baseUrl);
    }
    if (options.getToken) {
      setAuthTokenGetter(options.getToken);
    }
  }
}
