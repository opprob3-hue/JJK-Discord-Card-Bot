import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const jjkPlayers = pgTable("jjk_players", {
  discordUserId: text("discord_user_id").primaryKey(),
  username: text("username").notNull(),
  pulls: integer("pulls").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jjkPlayerCards = pgTable(
  "jjk_player_cards",
  {
    discordUserId: text("discord_user_id").notNull(),
    cardId: text("card_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    firstPulledAt: timestamp("first_pulled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.discordUserId, table.cardId] }),
  ],
);