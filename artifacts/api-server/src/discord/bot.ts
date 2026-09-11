import { randomInt } from "node:crypto";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { desc, eq, sql } from "drizzle-orm";
import { db, jjkPlayerCards, jjkPlayers } from "@workspace/db";
import { logger } from "../lib/logger";
import { JJK_CARDS, type CardRarity, type JjkCard } from "./cards";

const PULL_COOLDOWN_MS = 30_000;
const pullCooldowns = new Map<string, number>();

const RARITY_COLORS: Record<CardRarity, number> = {
  Mythic: 0xf59e0b,
  Legendary: 0xa855f7,
  Epic: 0x3b82f6,
};

const RARITY_WEIGHTS: Array<{ rarity: CardRarity; weight: number }> = [
  { rarity: "Mythic", weight: 5 },
  { rarity: "Legendary", weight: 20 },
  { rarity: "Epic", weight: 75 },
];

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("See the JJK card bot commands"),
  new SlashCommandBuilder()
    .setName("pull")
    .setDescription("Pull a random Jujutsu Kaisen card"),
  new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View your Jujutsu Kaisen card collection"),
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Inspect a Jujutsu Kaisen card")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card name")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View pull stats for a player")
    .addUserOption((option) =>
      option.setName("user").setDescription("Player to inspect"),
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the top JJK card collectors"),
].map((command) => command.toJSON());

function chooseCard(): JjkCard {
  const roll = randomInt(100);
  let cursor = 0;
  const rarity =
    RARITY_WEIGHTS.find((entry) => {
      cursor += entry.weight;
      return roll < cursor;
    })?.rarity ?? "Epic";
  const matchingCards = JJK_CARDS.filter((card) => card.rarity === rarity);
  return matchingCards[randomInt(matchingCards.length)] ?? JJK_CARDS[0]!;
}

function cardEmbed(card: JjkCard, title?: string) {
  return new EmbedBuilder()
    .setColor(RARITY_COLORS[card.rarity])
    .setTitle(title ?? `${card.name} · ${card.rarity}`)
    .setDescription(`**${card.anime}**\nAbility: **${card.ability}**`)
    .addFields(
      { name: "Power", value: `${card.power}`, inline: true },
      { name: "Attack", value: `${card.attack}`, inline: true },
      { name: "Defense", value: `${card.defense}`, inline: true },
      { name: "Speed", value: `${card.speed}`, inline: true },
    )
    .setImage(card.image_url)
    .setFooter({ text: `Card ID: ${card.id}` });
}

async function ensurePlayer(
  discordUserId: string,
  username: string,
): Promise<void> {
  await db
    .insert(jjkPlayers)
    .values({ discordUserId, username })
    .onConflictDoUpdate({
      target: jjkPlayers.discordUserId,
      set: { username, updatedAt: new Date() },
    });
}

async function savePull(
  discordUserId: string,
  username: string,
  card: JjkCard,
): Promise<void> {
  await ensurePlayer(discordUserId, username);
  await db
    .update(jjkPlayers)
    .set({ pulls: sql`${jjkPlayers.pulls} + 1`, updatedAt: new Date() })
    .where(eq(jjkPlayers.discordUserId, discordUserId));

  await db
    .insert(jjkPlayerCards)
    .values({ discordUserId, cardId: card.id })
    .onConflictDoUpdate({
      target: [jjkPlayerCards.discordUserId, jjkPlayerCards.cardId],
      set: {
        quantity: sql`${jjkPlayerCards.quantity} + 1`,
        updatedAt: new Date(),
      },
    });
}

async function handlePull(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const now = Date.now();
  const lastPullAt = pullCooldowns.get(interaction.user.id) ?? 0;
  const remainingMs = PULL_COOLDOWN_MS - (now - lastPullAt);
  if (remainingMs > 0) {
    await interaction.reply({
      content: `Your cursed energy is recovering. Try again in ${Math.ceil(remainingMs / 1000)}s.`,
      ephemeral: true,
    });
    return;
  }

  const card = chooseCard();
  pullCooldowns.set(interaction.user.id, now);
  await savePull(interaction.user.id, interaction.user.username, card);
  await interaction.reply({
    content:
      card.rarity === "Mythic"
        ? "A special-grade presence appears..."
        : "You pulled a new card.",
    embeds: [cardEmbed(card)],
  });
}

async function handleCollection(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rows = await db
    .select({
      cardId: jjkPlayerCards.cardId,
      quantity: jjkPlayerCards.quantity,
    })
    .from(jjkPlayerCards)
    .where(eq(jjkPlayerCards.discordUserId, interaction.user.id))
    .orderBy(desc(jjkPlayerCards.quantity), jjkPlayerCards.cardId);

  if (rows.length === 0) {
    await interaction.reply({
      content: "Your collection is empty. Use `/pull` to draw your first card.",
      ephemeral: true,
    });
    return;
  }

  const totalCards = rows.reduce((sum, row) => sum + row.quantity, 0);
  const lines = rows.map((row) => {
    const card = JJK_CARDS.find((candidate) => candidate.id === row.cardId);
    return card
      ? `**${card.name}** · ${card.rarity} · ×${row.quantity}`
      : `Unknown card · ×${row.quantity}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`${interaction.user.username}'s Collection`)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Unique cards", value: `${rows.length}`, inline: true },
      { name: "Total cards", value: `${totalCards}`, inline: true },
      {
        name: "Completion",
        value: `${rows.length}/${JJK_CARDS.length}`,
        inline: true,
      },
    )
    .setFooter({ text: "Use /card to inspect any card in the set." });
  await interaction.reply({ embeds: [embed] });
}

async function handleCard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("name", true).trim().toLowerCase();
  const card = JJK_CARDS.find(
    (candidate) =>
      candidate.id === query ||
      candidate.name.toLowerCase() === query ||
      candidate.name.toLowerCase().includes(query),
  );

  if (!card) {
    await interaction.reply({
      content: "I couldn't find that card. Use the autocomplete suggestions.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ embeds: [cardEmbed(card)] });
}

async function handleProfile(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const [player] = await db
    .select()
    .from(jjkPlayers)
    .where(eq(jjkPlayers.discordUserId, target.id))
    .limit(1);
  const [collection] = await db
    .select({
      uniqueCards: sql<number>`count(*)`,
      totalCards: sql<number>`coalesce(sum(${jjkPlayerCards.quantity}), 0)`,
    })
    .from(jjkPlayerCards)
    .where(eq(jjkPlayerCards.discordUserId, target.id));

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`${target.username}'s Sorcerer Profile`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Pulls", value: `${player?.pulls ?? 0}`, inline: true },
      { name: "Unique cards", value: `${collection?.uniqueCards ?? 0}`, inline: true },
      { name: "Total cards", value: `${collection?.totalCards ?? 0}`, inline: true },
    )
    .setFooter({ text: "Keep pulling to complete the set." });

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rows = await db
    .select({
      username: jjkPlayers.username,
      pulls: jjkPlayers.pulls,
      totalCards: sql<number>`coalesce(sum(${jjkPlayerCards.quantity}), 0)`,
    })
    .from(jjkPlayers)
    .leftJoin(
      jjkPlayerCards,
      eq(jjkPlayers.discordUserId, jjkPlayerCards.discordUserId),
    )
    .groupBy(jjkPlayers.discordUserId, jjkPlayers.username, jjkPlayers.pulls)
    .orderBy(
      desc(sql`coalesce(sum(${jjkPlayerCards.quantity}), 0)`),
      desc(jjkPlayers.pulls),
    )
    .limit(10);

  const description =
    rows.length > 0
      ? rows
          .map(
            (row, index) =>
              `**${index + 1}. ${row.username}** · ${row.totalCards} cards · ${row.pulls} pulls`,
          )
          .join("\n")
      : "No collectors yet. Be the first to pull a card.";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("JJK Collector Leaderboard")
        .setDescription(description)
        .setFooter({ text: "Ranked by total cards collected." }),
    ],
  });
}

async function handleHelp(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle("Jujutsu Kaisen Cards")
        .setDescription(
          "Collect the strongest sorcerers and curses in the set. Every pull is saved to your profile.",
        )
        .addFields(
          { name: "/pull", value: "Draw a random card.", inline: true },
          { name: "/collection", value: "View your cards.", inline: true },
          { name: "/card", value: "Inspect a card.", inline: true },
          { name: "/profile", value: "View pull stats.", inline: true },
          { name: "/leaderboard", value: "See the top collectors.", inline: true },
        )
        .setFooter({ text: "Mythic cards are the rarest pulls." }),
    ],
  });
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const query = interaction.options.getString("name")?.toLowerCase() ?? "";
  const suggestions = JJK_CARDS.filter(
    (card) =>
      card.name.toLowerCase().includes(query) ||
      card.id.includes(query),
  )
    .slice(0, 25)
    .map((card) => ({ name: `${card.name} · ${card.rarity}`, value: card.id }));
  await interaction.respond(suggestions);
}

async function registerCommands(applicationId: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required to register Discord commands.");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
  await rest.put(route, { body: commands });
  logger.info(
    { scope: guildId ? "guild" : "global" },
    "Discord slash commands registered",
  );
}

export async function startDiscordBot(): Promise<Client> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required to start the Discord bot.");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(
      { tag: readyClient.user.tag, applicationId: readyClient.user.id },
      "Discord bot is ready",
    );
    void registerCommands(readyClient.user.id).catch((error) => {
      logger.error({ err: error }, "Failed to register Discord slash commands");
    });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void (async () => {
      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
      }
      if (!interaction.isChatInputCommand()) {
        return;
      }

      switch (interaction.commandName) {
        case "help":
          await handleHelp(interaction);
          break;
        case "pull":
          await handlePull(interaction);
          break;
        case "collection":
          await handleCollection(interaction);
          break;
        case "card":
          await handleCard(interaction);
          break;
        case "profile":
          await handleProfile(interaction);
          break;
        case "leaderboard":
          await handleLeaderboard(interaction);
          break;
        default:
          await interaction.reply({
            content: "That command is not available.",
            ephemeral: true,
          });
      }
    })().catch(async (error: unknown) => {
      logger.error({ err: error }, "Discord interaction failed");
      if (interaction.isRepliable()) {
        const content =
          "Something went wrong while handling that command. Please try again.";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content, ephemeral: true }).catch(() => {});
        }
      }
    });
  });

  await client.login(token);
  return client;
}