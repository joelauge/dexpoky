import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Verified catalog entries absent from a provider's canonical set checklist.
 * This is checklist metadata only; it is never an owned collection card.
 */
export const pokemonSetCardSupplementsTable = pgTable(
  "pokemon_set_card_supplements",
  {
    id: serial("id").primaryKey(),
    setId: text("set_id").notNull(),
    catalogCardId: text("catalog_card_id").notNull(),
    identityKey: text("identity_key").notNull(),
    localId: text("local_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    rarity: text("rarity"),
    sourceId: text("source_id").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    setIdentityUniqueIdx: uniqueIndex("pokemon_set_card_supplements_set_identity_idx")
      .on(table.setId, table.identityKey),
    setCatalogCardUniqueIdx: uniqueIndex("pokemon_set_card_supplements_set_catalog_card_idx")
      .on(table.setId, table.catalogCardId),
    setIdIdx: index("pokemon_set_card_supplements_set_id_idx").on(table.setId),
  }),
);

export type PokemonSetCardSupplement = typeof pokemonSetCardSupplementsTable.$inferSelect;