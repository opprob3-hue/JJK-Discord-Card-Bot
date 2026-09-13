# Anime Discord Card Bot

An always-on Discord bot that lets servers collect, inspect, battle, trade, and rank anime character cards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server and Discord bot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `DISCORD_BOT_TOKEN`
- Optional env: `DISCORD_GUILD_ID` — register commands to one server for faster iteration instead of globally

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/discord/cards.ts` — source of truth for the JJK, Bleach, and future card sets
- `artifacts/api-server/src/discord/bot.ts` — Discord client, slash commands, buttons, select menus, and embeds
- `lib/db/src/schema/index.ts` — persistent players, wallets, rewards, battles, and collections
- `artifacts/api-server/src/index.ts` — API and Discord bot startup

## Architecture decisions

- Discord slash commands are registered globally by default; set `DISCORD_GUILD_ID` for instant server-local registration while developing.
- Cards remain source-controlled static content while player ownership, wallets, rewards, battles, and pull counts are stored in PostgreSQL.
- The bot only requests the `Guilds` gateway intent because all interaction is handled through slash commands.
- Normal pulls use weighted rarity selection: Epic 75%, Legendary 20%, Mythic 5%. The Common crate keeps the supplied 75/34/1 weights as normalized relative weights because those values total 110%.

## Product

- `/pull` awards a weighted-random card with a 30-second per-user cooldown.
- `/start` registers a player once, grants starting coins, and grants a one-time starter pack.
- `/pack`, `/shop_spins`, `/balance`, `/daily`, `/claim_spin_normal`, `/hourly_claim_spin_normal`, and `/sell_card` manage the economy.
- `/collection` shows unique cards, duplicate counts, and completion progress.
- `/card` provides autocomplete and a stat embed for every card.
- `/battle` uses accept/decline buttons and per-player card select menus.
- `/trade` uses accept/decline buttons, card select menus, quantity modals, and two-party confirmation.
- `/profile` shows wallet, pull, collection, reward, and battle totals for any player.
- `/leaderboard` ranks players by battle wins, collection value, then highest card power.
- `/help` explains the bot in Discord.

## User preferences

- The active card pool contains 11 Jujutsu Kaisen cards and 12 Bleach cards.
- `ALL_CARDS` is the combined pool used by packs, card lookup, collection completion, shop crates, and battles.
- Additional anime sets can be added to the card catalog without changing the command flow.

## Gotchas

- Global Discord slash-command registration can take time to appear in every server. Use `DISCORD_GUILD_ID` during development if immediate command visibility is needed.
- Keep `DISCORD_BOT_TOKEN` in Replit Secrets; never put it in source control or logs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
