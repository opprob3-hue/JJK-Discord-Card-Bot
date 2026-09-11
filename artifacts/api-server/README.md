# JJK Discord Card Bot

This service runs the Discord bot alongside the health-check API.

## Commands

- `/pull` — pull a weighted-random JJK card
- `/collection` — view your cards and duplicate counts
- `/card` — inspect a card with autocomplete
- `/profile` — view pull and collection stats
- `/leaderboard` — rank the top collectors
- `/help` — show the command list

## Discord setup

1. Create an application and bot in the Discord Developer Portal.
2. Add the bot token as the `DISCORD_BOT_TOKEN` Replit Secret.
3. Invite the bot with the `bot` and `applications.commands` scopes.
4. Give it permission to send messages and embed links.

The service registers commands globally by default. Set `DISCORD_GUILD_ID` to a server ID to register commands to one server while developing.