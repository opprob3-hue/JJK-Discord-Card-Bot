# JJK Discord Card Bot

An always-on Discord bot that lets servers collect, inspect, and rank Jujutsu Kaisen character cards.

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

- `artifacts/api-server/src/discord/cards.ts` — source of truth for the JJK card set
- `artifacts/api-server/src/discord/bot.ts` — Discord client, slash commands, pull rates, and embeds
- `lib/db/src/schema/index.ts` — persistent player and collection tables
- `artifacts/api-server/src/index.ts` — API and Discord bot startup

## Architecture decisions

- Discord slash commands are registered globally by default; set `DISCORD_GUILD_ID` for instant server-local registration while developing.
- Cards remain source-controlled static content while player ownership and pull counts are stored in PostgreSQL.
- The bot only requests the `Guilds` gateway intent because all interaction is handled through slash commands.
- Pulls use weighted rarity selection: Epic 75%, Legendary 20%, Mythic 5%.

## Product

- `/pull` awards a weighted-random card with a 30-second per-user cooldown.
- `/collection` shows unique cards, duplicate counts, and completion progress.
- `/card` provides autocomplete and a stat embed for every card.
- `/profile` shows pulls and collection totals for any player.
- `/leaderboard` ranks collectors by total cards.
- `/help` explains the bot in Discord.

## User preferences

- The initial collection is the Jujutsu Kaisen card data supplied by the user.

## Gotchas

- Global Discord slash-command registration can take time to appear in every server. Use `DISCORD_GUILD_ID` during development if immediate command visibility is needed.
- Keep `DISCORD_BOT_TOKEN` in Replit Secrets; never put it in source control or logs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
