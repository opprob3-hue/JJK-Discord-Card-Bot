# Anime Discord Card Bot

This service runs the Discord bot alongside the health-check API.

The active pool contains 23 cards: 11 Jujutsu Kaisen cards and 12 Bleach cards.

## Commands

- `/start` — register once, receive starting coins, and receive a starter pack
- `/summon` — spend one normal spin on a weighted-random anime card
- `/pack` — open a paid pack with an opening state
- `/collection` — view cards, duplicates, and paginated collection pages
- `/card` — inspect a card with autocomplete, including ownership status
- `/sell_card` — sell owned cards for rarity-based coin values
- `/balance` — view coins and normal spins
- `/daily` — claim 30 coins every 24 hours
- `/claim_spin_normal` — claim 20 coins and 10 normal spins every 24 hours
- `/hourly_claim_spin_normal` — claim 5 coins and 1 normal spin every hour
- `/shop_spins` — buy Common, Super, Divine, Serpent, TYBW, and Celestial crates with buttons
- `/generate` — combine 4 Epic, 3 Legendary, or 6 Mythic cards into a higher rarity
- `/battle @user` — challenge, select cards, resolve stats and ability effects
- `/trade @user` — select cards, enter quantities, and confirm a persistent trade
- `/profile` — view wallet, collection, reward, and battle stats
- `/leaderboard` — rank by wins, collection value, and highest card power
- `/help` — show the command list

Summon pity is separate from crates: every 10 summons grants a Legendary, every 20 grants a Mythic, and every 50 grants a Divine card.

## Discord setup

1. Create an application and bot in the Discord Developer Portal.
2. Add the bot token as the `DISCORD_BOT_TOKEN` Replit Secret.
3. Invite the bot with the `bot` and `applications.commands` scopes.
4. Give it permission to send messages and embed links.

The service registers commands globally by default. Set `DISCORD_GUILD_ID` to a server ID to register commands to one server while developing.