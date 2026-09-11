import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const jjkPlayers = pgTable("jjk_players", {
  discordUserId: text("discord_user_id").primaryKey(),
  username: text("username").notNull(),
  coins: integer("coins").notNull().default(100),
  pulls: integer("pulls").notNull().default(0),
  battleWins: integer("battle_wins").notNull().default(0),
  battleLosses: integer("battle_losses").notNull().default(0),
  normalSpins: integer("normal_spins").notNull().default(0),
  starterPackClaimed: boolean("starter_pack_claimed").notNull().default(false),
  lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
  lastNormalSpinClaimAt: timestamp("last_normal_spin_claim_at", {
    withTimezone: true,
  }),
  lastHourlySpinClaimAt: timestamp("last_hourly_spin_claim_at", {
    withTimezone: true,
  }),
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

export type JjkPlayer = typeof jjkPlayers.$inferSelect;
export type JjkPlayerCard = typeof jjkPlayerCards.$inferSelect;