import { randomUUID, randomInt } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  jjkPlayerCards,
  jjkPlayers,
  type JjkPlayer,
  type JjkPlayerCard,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  CARD_SETS,
  JJK_CARDS,
  type CardRarity,
  type JjkCard,
} from "./cards";

const STARTING_COINS = 100;
const STARTER_CARD_COUNT = 3;
const DAILY_REWARD = 50;
const NORMAL_SPIN_REWARD = 20;
const HOURLY_SPIN_REWARD = 5;
const NORMAL_SPINS_PER_CLAIM = 10;
const HOURLY_SPINS_PER_CLAIM = 1;
const BATTLE_REWARD = 25;
const PACK_COST = 10;
const PULL_COOLDOWN_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const pullCooldowns = new Map<string, number>();

const RARITY_COLORS: Record<CardRarity, number> = {
  Common: 0x94a3b8,
  Uncommon: 0x22c55e,
  Rare: 0x3b82f6,
  Epic: 0x6366f1,
  Legendary: 0xa855f7,
  Mythic: 0xf59e0b,
  Divine: 0xef4444,
};

const RARITY_SYMBOLS: Record<CardRarity, string> = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🔷",
  Legendary: "🟣",
  Mythic: "✨",
  Divine: "🔱",
};

const SELL_VALUES: Record<CardRarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 5,
  Legendary: 12,
  Mythic: 25,
  Divine: 100,
};

const NORMAL_RARITY_WEIGHTS: Array<{ rarity: CardRarity; weight: number }> = [
  { rarity: "Epic", weight: 75 },
  { rarity: "Legendary", weight: 20 },
  { rarity: "Mythic", weight: 5 },
];

const CRATE_WEIGHTS = {
  common: [
    { rarity: "Epic", weight: 75 },
    { rarity: "Legendary", weight: 34 },
    { rarity: "Mythic", weight: 1 },
  ],
  super: [
    { rarity: "Epic", weight: 40 },
    { rarity: "Legendary", weight: 50 },
    { rarity: "Mythic", weight: 10 },
  ],
  divine: [
    { rarity: "Epic", weight: 25 },
    { rarity: "Legendary", weight: 50 },
    { rarity: "Mythic", weight: 25 },
  ],
  serpent: [{ rarity: "Mythic", weight: 100 }],
} satisfies Record<
  string,
  Array<{ rarity: CardRarity; weight: number }>
>;

type PackTier = keyof typeof CRATE_WEIGHTS;
type PlayerRow = JjkPlayer;
type CardRow = JjkPlayerCard;
type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never;

type BattleState = {
  id: string;
  challengerId: string;
  challengedId: string;
  message: Message;
  status: "pending" | "selecting";
  selected: Partial<Record<string, string>>;
};

type TradeOffer = Record<string, number>;

type TradeState = {
  id: string;
  initiatorId: string;
  targetId: string;
  message: Message;
  selections: Partial<Record<string, string[]>>;
  offers: Partial<Record<string, TradeOffer>>;
  confirmed: Set<string>;
};

const activeBattles = new Map<string, BattleState>();
const activeBattleByUser = new Map<string, string>();
const activeTrades = new Map<string, TradeState>();
const activeTradeByUser = new Map<string, string>();

const commandData = [
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("Register your player and receive your starter pack"),
  new SlashCommandBuilder()
    .setName("pull")
    .setDescription("Pull a free cooldown card"),
  new SlashCommandBuilder()
    .setName("pack")
    .setDescription("Open a paid random JJK card pack"),
  new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View your JJK card collection"),
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Inspect a card, whether or not you own it")
    .addStringOption((option) =>
      option
        .setName("character")
        .setDescription("Character name")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("sell_card")
    .setDescription("Sell cards for Anime Coins")
    .addStringOption((option) =>
      option
        .setName("character")
        .setDescription("Character name")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("quantity")
        .setDescription("Number of copies to sell")
        .setMinValue(1)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View your Anime Coins and spin balance"),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily Anime Coin reward"),
  new SlashCommandBuilder()
    .setName("claim_spin_normal")
    .setDescription("Claim 20 coins and 10 normal spins every day"),
  new SlashCommandBuilder()
    .setName("hourly_claim_spin_normal")
    .setDescription("Claim 5 coins and 1 normal spin every hour"),
  new SlashCommandBuilder()
    .setName("shop_spins")
    .setDescription("Buy card crates with Anime Coins"),
  new SlashCommandBuilder()
    .setName("battle")
    .setDescription("Challenge another registered player")
    .addUserOption((option) =>
      option.setName("user").setDescription("Player to challenge").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade cards with another registered player")
    .addUserOption((option) =>
      option.setName("user").setDescription("Player to trade with").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View player stats")
    .addUserOption((option) =>
      option.setName("user").setDescription("Player to inspect"),
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Rank players by wins, collection value, and card power"),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("See all available card game commands"),
].map((command) => command.toJSON());

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

function allCards(): JjkCard[] {
  return Object.values(CARD_SETS).flat();
}

function cardForId(cardId: string): JjkCard | undefined {
  return allCards().find((card) => card.id === cardId);
}

function findCard(query: string): JjkCard | undefined {
  const normalized = query.trim().toLowerCase();
  return allCards().find(
    (card) =>
      card.id === normalized ||
      card.name.toLowerCase() === normalized ||
      card.name.toLowerCase().includes(normalized),
  );
}

function rarityValue(rarity: CardRarity): number {
  return SELL_VALUES[rarity];
}

function chooseCard(
  cards: JjkCard[] = JJK_CARDS,
  weights: Array<{ rarity: CardRarity; weight: number }> = NORMAL_RARITY_WEIGHTS,
): JjkCard {
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = randomInt(totalWeight);
  let cursor = 0;
  const rarity =
    weights.find((entry) => {
      cursor += entry.weight;
      return roll < cursor;
    })?.rarity ?? "Epic";
  const matchingCards = cards.filter((card) => card.rarity === rarity);
  return matchingCards[randomInt(matchingCards.length)] ?? cards[0]!;
}

function abilityBonus(card: JjkCard): number {
  const bonuses: Record<string, number> = {
    Infinity: 8,
    "Black Flash": 8,
    "Star Rage": 8,
    "Malevolent Shrine": 10,
    "Boogie Woogie": 7,
    "Ten Shadows": 8,
    Copy: 8,
    "Cursed Technique Manipulation": 8,
    "Heavenly Restriction": 10,
    "Idle Transfiguration": 8,
  };
  return bonuses[card.ability] ?? 0;
}

function battleScore(card: JjkCard): number {
  return card.power + card.attack + card.defense + card.speed + abilityBonus(card);
}

function cardEmbed(card: JjkCard, title?: string, ownership?: string) {
  return new EmbedBuilder()
    .setColor(RARITY_COLORS[card.rarity])
    .setTitle(title ?? `🎴 ${card.name.toUpperCase()}`)
    .setDescription(
      `${card.anime}\n\n${RARITY_SYMBOLS[card.rarity]} **${card.rarity.toUpperCase()}**${
        ownership ? `\n\n${ownership}` : ""
      }`,
    )
    .addFields(
      { name: "⚡ Power", value: `${card.power}`, inline: true },
      { name: "⚔️ Attack", value: `${card.attack}`, inline: true },
      { name: "🛡️ Defense", value: `${card.defense}`, inline: true },
      { name: "💨 Speed", value: `${card.speed}`, inline: true },
      { name: "🔮 Ability", value: card.ability, inline: false },
    )
    .setImage(card.image_url)
    .setFooter({
      text: `${card.id} · Sell value: ${rarityValue(card.rarity)} coins`,
    });
}

function buttonRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

function getPlayer(discordUserId: string): Promise<PlayerRow | undefined> {
  return db.query.jjkPlayers.findFirst({
    where: eq(jjkPlayers.discordUserId, discordUserId),
  });
}

async function ensurePlayer(
  discordUserId: string,
  username: string,
): Promise<PlayerRow> {
  await db
    .insert(jjkPlayers)
    .values({ discordUserId, username, coins: STARTING_COINS })
    .onConflictDoUpdate({
      target: jjkPlayers.discordUserId,
      set: { username, updatedAt: new Date() },
    });
  const player = await getPlayer(discordUserId);
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  return player;
}

async function requirePlayer(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  userId = interaction.user.id,
): Promise<PlayerRow | undefined> {
  const player = await getPlayer(userId);
  if (!player) {
    await interaction.reply({
      content: "Use `/start` first to register your player.",
      ephemeral: true,
    });
  }
  return player;
}

async function addCard(
  tx: DbTransaction,
  discordUserId: string,
  cardId: string,
  quantity = 1,
): Promise<void> {
  await tx
    .insert(jjkPlayerCards)
    .values({ discordUserId, cardId, quantity })
    .onConflictDoUpdate({
      target: [jjkPlayerCards.discordUserId, jjkPlayerCards.cardId],
      set: {
        quantity: sql`${jjkPlayerCards.quantity} + ${quantity}`,
        updatedAt: new Date(),
      },
    });
}

async function registerPlayer(
  discordUserId: string,
  username: string,
): Promise<{ player: PlayerRow; receivedStarterPack: boolean }> {
  await ensurePlayer(discordUserId, username);
  const player = await getPlayer(discordUserId);
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (player.starterPackClaimed) {
    return { player, receivedStarterPack: false };
  }

  const starterCards = Array.from({ length: STARTER_CARD_COUNT }, () =>
    chooseCard(),
  );
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(jjkPlayers)
      .set({ starterPackClaimed: true, updatedAt: new Date() })
      .where(
        and(
          eq(jjkPlayers.discordUserId, discordUserId),
          eq(jjkPlayers.starterPackClaimed, false),
        ),
      )
      .returning({ discordUserId: jjkPlayers.discordUserId });
    if (claimed.length === 0) return;
    for (const card of starterCards) {
      await addCard(tx, discordUserId, card.id);
    }
  });

  const updatedPlayer = await getPlayer(discordUserId);
  if (!updatedPlayer) throw new Error("PLAYER_NOT_FOUND");
  return { player: updatedPlayer, receivedStarterPack: true };
}

async function ownedCards(discordUserId: string): Promise<CardRow[]> {
  return db
    .select()
    .from(jjkPlayerCards)
    .where(and(eq(jjkPlayerCards.discordUserId, discordUserId), gte(jjkPlayerCards.quantity, 1)))
    .orderBy(desc(jjkPlayerCards.quantity), jjkPlayerCards.cardId);
}

async function ownsCard(
  discordUserId: string,
  cardId: string,
  quantity = 1,
): Promise<boolean> {
  const [row] = await db
    .select({ quantity: jjkPlayerCards.quantity })
    .from(jjkPlayerCards)
    .where(
      and(
        eq(jjkPlayerCards.discordUserId, discordUserId),
        eq(jjkPlayerCards.cardId, cardId),
      ),
    )
    .limit(1);
  return (row?.quantity ?? 0) >= quantity;
}

function collectionEmbed(
  user: User,
  rows: CardRow[],
  page: number,
  pageSize = 8,
): EmbedBuilder {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const pageRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const totalCards = rows.reduce((sum, row) => sum + row.quantity, 0);
  const description = pageRows
    .map((row) => {
      const card = cardForId(row.cardId);
      return card
        ? `${RARITY_SYMBOLS[card.rarity]} **${card.name}** · ${card.rarity} · ×${row.quantity}`
        : `Unknown card · ×${row.quantity}`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`🎴 ${user.username}'s Collection`)
    .setDescription(description || "Your collection is empty.")
    .addFields(
      { name: "Unique cards", value: `${rows.length}`, inline: true },
      { name: "Total cards", value: `${totalCards}`, inline: true },
      { name: "Completion", value: `${rows.length}/${JJK_CARDS.length}`, inline: true },
    )
    .setFooter({ text: `Page ${safePage + 1}/${pageCount} · Use /card to inspect a card.` });
}

function collectionComponents(
  userId: string,
  page: number,
  totalRows: number,
  pageSize = 8,
): ActionRowBuilder<ButtonBuilder>[] {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  return pageCount > 1
    ? [
        buttonRow([
          new ButtonBuilder()
            .setCustomId(`collection:${userId}:${page - 1}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
          new ButtonBuilder()
            .setCustomId(`collection:${userId}:${page + 1}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= pageCount - 1),
        ]),
      ]
    : [];
}

async function saveFreePull(
  discordUserId: string,
  username: string,
  card: JjkCard,
): Promise<void> {
  await ensurePlayer(discordUserId, username);
  await db.transaction(async (tx) => {
    await tx
      .update(jjkPlayers)
      .set({ pulls: sql`${jjkPlayers.pulls} + 1`, updatedAt: new Date() })
      .where(eq(jjkPlayers.discordUserId, discordUserId));
    await addCard(tx, discordUserId, card.id);
  });
}

async function purchaseCards(
  discordUserId: string,
  cards: JjkCard[],
  cost: number,
): Promise<number | undefined> {
  return db.transaction(async (tx) => {
    const paid = await tx
      .update(jjkPlayers)
      .set({
        coins: sql`${jjkPlayers.coins} - ${cost}`,
        pulls: sql`${jjkPlayers.pulls} + ${cards.length}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jjkPlayers.discordUserId, discordUserId),
          gte(jjkPlayers.coins, cost),
        ),
      )
      .returning({ coins: jjkPlayers.coins });
    if (paid.length === 0) return undefined;
    for (const card of cards) {
      await addCard(tx, discordUserId, card.id);
    }
    return paid[0]?.coins;
  });
}

async function handleStart(interaction: ChatInputCommandInteraction) {
  const result = await registerPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(result.receivedStarterPack ? "Welcome, sorcerer" : "Welcome back")
        .setDescription(
          result.receivedStarterPack
            ? `Your account is ready. You received **${STARTING_COINS} Anime Coins** and a ${STARTER_CARD_COUNT}-card starter pack.`
            : "Your account is already registered. Nothing was reset.",
        )
        .addFields(
          { name: "Anime Coins", value: `${result.player.coins}`, inline: true },
          { name: "Next step", value: "Use `/pack` or `/collection`.", inline: true },
        ),
    ],
  });
}

async function handlePull(interaction: ChatInputCommandInteraction) {
  const now = Date.now();
  const lastPull = pullCooldowns.get(interaction.user.id) ?? 0;
  const remainingMs = PULL_COOLDOWN_MS - (now - lastPull);
  if (remainingMs > 0) {
    await interaction.reply({
      content: `Your cursed energy is recovering. Try again in ${Math.ceil(remainingMs / 1000)}s.`,
      ephemeral: true,
    });
    return;
  }
  const card = chooseCard();
  pullCooldowns.set(interaction.user.id, now);
  await saveFreePull(interaction.user.id, interaction.user.username, card);
  await interaction.reply({
    content: "You pulled a free cooldown card.",
    embeds: [cardEmbed(card)],
  });
}

async function handlePack(interaction: ChatInputCommandInteraction) {
  if (!(await requirePlayer(interaction))) return;
  await interaction.deferReply();
  await interaction.editReply({ content: "🎴 Opening your pack..." });
  await sleep(900);
  const card = chooseCard();
  const remainingCoins = await purchaseCards(interaction.user.id, [card], PACK_COST);
  if (remainingCoins === undefined) {
    await interaction.editReply({
      content: `You need ${PACK_COST} Anime Coins to open a pack.`,
    });
    return;
  }
  await interaction.editReply({
    content: `🎴 Pack opened. You have **${remainingCoins} Anime Coins** left.`,
    embeds: [cardEmbed(card)],
  });
}

async function handleCollection(interaction: ChatInputCommandInteraction) {
  if (!(await requirePlayer(interaction))) return;
  const rows = await ownedCards(interaction.user.id);
  if (rows.length === 0) {
    await interaction.reply({
      content: "Your collection is empty. Use `/start` or `/pack` to get cards.",
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    embeds: [collectionEmbed(interaction.user, rows, 0)],
    components: collectionComponents(interaction.user.id, 0, rows.length),
  });
}

async function handleCard(interaction: ChatInputCommandInteraction) {
  const card = findCard(interaction.options.getString("character", true));
  if (!card) {
    await interaction.reply({
      content: "Invalid character. Use the autocomplete suggestions.",
      ephemeral: true,
    });
    return;
  }
  const [owned] = await db
    .select({ quantity: jjkPlayerCards.quantity })
    .from(jjkPlayerCards)
    .where(
      and(
        eq(jjkPlayerCards.discordUserId, interaction.user.id),
        eq(jjkPlayerCards.cardId, card.id),
      ),
    )
    .limit(1);
  const ownership =
    owned && owned.quantity > 0
      ? `✅ You own **${owned.quantity}** copy/copies.`
      : "❌ You do not own this card yet.";
  await interaction.reply({ embeds: [cardEmbed(card, undefined, ownership)] });
}

async function handleSellCard(interaction: ChatInputCommandInteraction) {
  if (!(await requirePlayer(interaction))) return;
  const card = findCard(interaction.options.getString("character", true));
  const quantity = interaction.options.getInteger("quantity", true);
  if (!card) {
    await interaction.reply({ content: "Invalid character.", ephemeral: true });
    return;
  }
  if (quantity < 1) {
    await interaction.reply({ content: "Quantity must be at least 1.", ephemeral: true });
    return;
  }
  const value = rarityValue(card.rarity) * quantity;
  const result = await db.transaction(async (tx) => {
    const removed = await tx
      .update(jjkPlayerCards)
      .set({
        quantity: sql`${jjkPlayerCards.quantity} - ${quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jjkPlayerCards.discordUserId, interaction.user.id),
          eq(jjkPlayerCards.cardId, card.id),
          gte(jjkPlayerCards.quantity, quantity),
        ),
      )
      .returning({ quantity: jjkPlayerCards.quantity });
    if (removed.length === 0) return undefined;
    await tx
      .delete(jjkPlayerCards)
      .where(
        and(
          eq(jjkPlayerCards.discordUserId, interaction.user.id),
          eq(jjkPlayerCards.cardId, card.id),
          lte(jjkPlayerCards.quantity, 0),
        ),
      );
    const [player] = await tx
      .update(jjkPlayers)
      .set({ coins: sql`${jjkPlayers.coins} + ${value}`, updatedAt: new Date() })
      .where(eq(jjkPlayers.discordUserId, interaction.user.id))
      .returning({ coins: jjkPlayers.coins });
    return player;
  });
  if (!result) {
    await interaction.reply({
      content: `You do not own ${quantity} ${card.name} card(s).`,
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    content: `Sold **${quantity}× ${card.name}** for **${value} Anime Coins**. Balance: **${result.coins}**.`,
  });
}

async function handleBalance(interaction: ChatInputCommandInteraction) {
  const player = await requirePlayer(interaction);
  if (!player) return;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle(`${interaction.user.username}'s Wallet`)
        .addFields(
          { name: "Anime Coins", value: `${player.coins}`, inline: true },
          { name: "Normal spins", value: `${player.normalSpins}`, inline: true },
        )
        .setFooter({ text: "Use /shop_spins to buy crates." }),
    ],
  });
}

async function claimTimedReward(
  interaction: ChatInputCommandInteraction,
  kind: "daily" | "normal" | "hourly",
) {
  const player = await requirePlayer(interaction);
  if (!player) return;
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - (kind === "hourly" ? HOUR_MS : DAY_MS),
  );
  const update =
    kind === "daily"
      ? {
          coins: sql`${jjkPlayers.coins} + ${DAILY_REWARD}`,
          lastDailyAt: now,
          updatedAt: now,
        }
      : kind === "normal"
        ? {
            coins: sql`${jjkPlayers.coins} + ${NORMAL_SPIN_REWARD}`,
            normalSpins: sql`${jjkPlayers.normalSpins} + ${NORMAL_SPINS_PER_CLAIM}`,
            lastNormalSpinClaimAt: now,
            updatedAt: now,
          }
        : {
            coins: sql`${jjkPlayers.coins} + ${HOURLY_SPIN_REWARD}`,
            normalSpins: sql`${jjkPlayers.normalSpins} + ${HOURLY_SPINS_PER_CLAIM}`,
            lastHourlySpinClaimAt: now,
            updatedAt: now,
          };
  const timeColumn =
    kind === "daily"
      ? jjkPlayers.lastDailyAt
      : kind === "normal"
        ? jjkPlayers.lastNormalSpinClaimAt
        : jjkPlayers.lastHourlySpinClaimAt;
  const [updated] = await db
    .update(jjkPlayers)
    .set(update)
    .where(
      and(
        eq(jjkPlayers.discordUserId, interaction.user.id),
        or(isNull(timeColumn), lt(timeColumn, cutoff)),
      ),
    )
    .returning({
      coins: jjkPlayers.coins,
      normalSpins: jjkPlayers.normalSpins,
    });
  if (!updated) {
    const lastClaim =
      kind === "daily"
        ? player.lastDailyAt
        : kind === "normal"
          ? player.lastNormalSpinClaimAt
          : player.lastHourlySpinClaimAt;
    const waitMs = Math.max(0, (lastClaim?.getTime() ?? now.getTime()) + (kind === "hourly" ? HOUR_MS : DAY_MS) - now.getTime());
    await interaction.reply({
      content: `Already claimed. Try again in ${Math.ceil(waitMs / 60_000)} minute(s).`,
      ephemeral: true,
    });
    return;
  }
  const rewardText =
    kind === "daily"
      ? `**${DAILY_REWARD} Anime Coins**`
      : `**${kind === "normal" ? NORMAL_SPIN_REWARD : HOURLY_SPIN_REWARD} Anime Coins** and **${kind === "normal" ? NORMAL_SPINS_PER_CLAIM : HOURLY_SPINS_PER_CLAIM} normal spin(s)**`;
  await interaction.reply({
    content: `Reward claimed: ${rewardText}. Balance: **${updated.coins} coins**.`,
  });
}

function shopComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    buttonRow([
      new ButtonBuilder()
        .setCustomId("shop:common")
        .setLabel("Common · 10 coins · 5 cards")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shop:super")
        .setLabel("Super · 30 coins · 5 cards")
        .setStyle(ButtonStyle.Primary),
    ]),
    buttonRow([
      new ButtonBuilder()
        .setCustomId("shop:divine")
        .setLabel("Divine · 50 coins · 3 cards")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("shop:serpent")
        .setLabel("Serpent · 100 coins · 1 Mythic")
        .setStyle(ButtonStyle.Danger),
    ]),
  ];
}

function shopEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("🛒 Anime Coin Spin Shop")
    .setDescription("Choose a crate. Your balance is checked again when you buy.")
    .addFields(
      {
        name: "Common Crate · 10 coins",
        value: "5 cards · Epic 75% · Legendary 34% · Mythic 1% (normalized weights)",
      },
      {
        name: "Super Crate · 30 coins",
        value: "5 cards · Epic 40% · Legendary 50% · Mythic 10%",
      },
      {
        name: "Divine Crate · 50 coins",
        value: "3 cards · Epic 25% · Legendary 50% · Mythic 25%",
      },
      {
        name: "Serpent Crate · 100 coins",
        value: "1 card · 100% Mythic",
      },
    );
}

async function handleShop(interaction: ChatInputCommandInteraction) {
  if (!(await requirePlayer(interaction))) return;
  await interaction.reply({ embeds: [shopEmbed()], components: shopComponents() });
}

async function handleShopPurchase(
  interaction: ButtonInteraction,
  tier: PackTier,
) {
  if (!(await requirePlayer(interaction))) return;
  const config: Record<PackTier, { cost: number; count: number; label: string }> = {
    common: { cost: 10, count: 5, label: "Common Crate" },
    super: { cost: 30, count: 5, label: "Super Crate" },
    divine: { cost: 50, count: 3, label: "Divine Crate" },
    serpent: { cost: 100, count: 1, label: "Serpent Crate" },
  };
  const selected = config[tier];
  const cards = Array.from({ length: selected.count }, () =>
    chooseCard(JJK_CARDS, CRATE_WEIGHTS[tier]),
  );
  const remainingCoins = await purchaseCards(interaction.user.id, cards, selected.cost);
  if (remainingCoins === undefined) {
    await interaction.reply({
      content: `You need ${selected.cost} Anime Coins for that crate.`,
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    content: `You opened the **${selected.label}**. Balance: **${remainingCoins} coins**.`,
    embeds: cards.map((card, index) =>
      cardEmbed(card, `🎴 Pull ${index + 1}: ${card.name.toUpperCase()}`),
    ),
    ephemeral: false,
  });
}

async function handleProfile(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const player = await getPlayer(target.id);
  if (!player) {
    await interaction.reply({
      content: "That player is not registered. They need to use `/start`.",
      ephemeral: true,
    });
    return;
  }
  const cards = await ownedCards(target.id);
  const totalCards = cards.reduce((sum, row) => sum + row.quantity, 0);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle(`${target.username}'s Sorcerer Profile`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "Anime Coins", value: `${player.coins}`, inline: true },
          { name: "Pulls", value: `${player.pulls}`, inline: true },
          { name: "Normal spins", value: `${player.normalSpins}`, inline: true },
          { name: "Unique cards", value: `${cards.length}`, inline: true },
          { name: "Total cards", value: `${totalCards}`, inline: true },
          { name: "Battle record", value: `${player.battleWins}W / ${player.battleLosses}L`, inline: true },
        ),
    ],
  });
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction) {
  const players = await db.select().from(jjkPlayers);
  const cards = await db.select().from(jjkPlayerCards);
  const stats = players
    .map((player) => {
      const playerCards = cards.filter((card) => card.discordUserId === player.discordUserId);
      const collectionValue = playerCards.reduce((sum, row) => {
        const card = cardForId(row.cardId);
        return sum + (card ? rarityValue(card.rarity) * row.quantity : 0);
      }, 0);
      const highestPower = Math.max(
        0,
        ...playerCards.map((row) => (cardForId(row.cardId)?.power ?? 0)),
      );
      return { player, collectionValue, highestPower };
    })
    .sort(
      (a, b) =>
        b.player.battleWins - a.player.battleWins ||
        b.collectionValue - a.collectionValue ||
        b.highestPower - a.highestPower,
    )
    .slice(0, 10);
  const description =
    stats.length > 0
      ? stats
          .map(
            (entry, index) =>
              `**${index + 1}. ${entry.player.username}** · ${entry.player.battleWins} wins · ${entry.collectionValue} value · ${entry.highestPower} max power`,
          )
          .join("\n")
      : "No registered players yet.";
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("🏆 Anime Card Leaderboard")
        .setDescription(description)
        .setFooter({ text: "Ranked by wins, collection value, then highest power." }),
    ],
  });
}

function challengeButtons(kind: "battle" | "trade", id: string) {
  return buttonRow([
    new ButtonBuilder()
      .setCustomId(`${kind}:accept:${id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${kind}:decline:${id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  ]);
}

async function handleBattle(interaction: ChatInputCommandInteraction) {
  const challenger = await requirePlayer(interaction);
  if (!challenger) return;
  const target = interaction.options.getUser("user", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "You cannot battle yourself.", ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: "You cannot battle a bot.", ephemeral: true });
    return;
  }
  if (!(await getPlayer(target.id))) {
    await interaction.reply({
      content: "That player is not registered. They need to use `/start`.",
      ephemeral: true,
    });
    return;
  }
  if (activeBattleByUser.has(interaction.user.id) || activeBattleByUser.has(target.id)) {
    await interaction.reply({ content: "One of these players already has an active battle.", ephemeral: true });
    return;
  }
  const id = randomUUID();
  const message = (await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("⚔️ CARD BATTLE")
        .setDescription(`${interaction.user} challenged ${target}.\n\nThe challenge expires when either player declines.`),
    ],
    components: [challengeButtons("battle", id)],
    fetchReply: true,
  })) as Message;
  const state: BattleState = {
    id,
    challengerId: interaction.user.id,
    challengedId: target.id,
    message,
    status: "pending",
    selected: {},
  };
  activeBattles.set(id, state);
  activeBattleByUser.set(interaction.user.id, id);
  activeBattleByUser.set(target.id, id);
}

function battleSelectionRows(state: BattleState): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    battleSelectRow(state, state.challengerId, "Player 1 choose a card"),
    battleSelectRow(state, state.challengedId, "Player 2 choose a card"),
  ];
}

function battleSelectRow(
  state: BattleState,
  userId: string,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`battle-select:${state.id}:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(
      JJK_CARDS.map((card) => ({
        label: `${card.name} · ${card.rarity}`,
        value: card.id,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

async function finishBattle(
  state: BattleState,
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const challengerCardId = state.selected[state.challengerId];
  const challengedCardId = state.selected[state.challengedId];
  if (!challengerCardId || !challengedCardId) return;
  const challengerCard = cardForId(challengerCardId);
  const challengedCard = cardForId(challengedCardId);
  if (!challengerCard || !challengedCard) throw new Error("INVALID_BATTLE_CARD");

  const challengerOwns = await ownsCard(state.challengerId, challengerCardId);
  const challengedOwns = await ownsCard(state.challengedId, challengedCardId);
  if (!challengerOwns || !challengedOwns) {
    throw new Error("CARD_NO_LONGER_OWNED");
  }
  const challengerScore = battleScore(challengerCard);
  const challengedScore = battleScore(challengedCard);
  const winnerId =
    challengerScore === challengedScore
      ? undefined
      : challengerScore > challengedScore
        ? state.challengerId
        : state.challengedId;

  await db.transaction(async (tx) => {
    if (winnerId) {
      const loserId = winnerId === state.challengerId ? state.challengedId : state.challengerId;
      await tx
        .update(jjkPlayers)
        .set({
          coins: sql`${jjkPlayers.coins} + ${BATTLE_REWARD}`,
          battleWins: sql`${jjkPlayers.battleWins} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(jjkPlayers.discordUserId, winnerId));
      await tx
        .update(jjkPlayers)
        .set({
          battleLosses: sql`${jjkPlayers.battleLosses} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(jjkPlayers.discordUserId, loserId));
    }
  });

  const winnerText = winnerId
    ? `<@${winnerId}> wins and receives **${BATTLE_REWARD} Anime Coins**.`
    : "The battle is a draw. No coins are awarded.";
  await interaction.update({
    content: winnerText,
    embeds: [
      new EmbedBuilder()
        .setColor(winnerId ? 0x22c55e : 0xf59e0b)
        .setTitle("⚔️ CARD BATTLE RESULT")
        .setDescription(
          `${winnerText}\n\n**${challengerCard.name}**: ${challengerScore} points\n**${challengedCard.name}**: ${challengedScore} points`,
        ),
      cardEmbed(challengerCard, `🎴 ${challengerCard.name.toUpperCase()} · ${challengerScore}`),
      cardEmbed(challengedCard, `🎴 ${challengedCard.name.toUpperCase()} · ${challengedScore}`),
    ],
    components: [],
  });
}

async function handleBattleButton(interaction: ButtonInteraction, action: string, id: string) {
  const state = activeBattles.get(id);
  if (!state) {
    await interaction.reply({ content: "That battle is no longer active.", ephemeral: true });
    return;
  }
  if (action === "decline") {
    if (interaction.user.id !== state.challengedId && interaction.user.id !== state.challengerId) {
      await interaction.reply({ content: "You are not part of this battle.", ephemeral: true });
      return;
    }
    activeBattles.delete(id);
    activeBattleByUser.delete(state.challengerId);
    activeBattleByUser.delete(state.challengedId);
    await interaction.update({ content: "Battle declined.", embeds: [], components: [] });
    return;
  }
  if (interaction.user.id !== state.challengedId) {
    await interaction.reply({ content: "Only the challenged player can accept.", ephemeral: true });
    return;
  }
  if (state.status !== "pending") {
    await interaction.reply({ content: "This battle is already active.", ephemeral: true });
    return;
  }
  if (!(await ownsCard(state.challengerId, JJK_CARDS[0]!.id)) &&
      (await ownedCards(state.challengerId)).length === 0) {
    await interaction.reply({ content: "The challenger has no cards to battle with.", ephemeral: true });
    return;
  }
  if ((await ownedCards(state.challengedId)).length === 0) {
    await interaction.reply({ content: "You need at least one card to battle.", ephemeral: true });
    return;
  }
  state.status = "selecting";
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("⚔️ CARD BATTLE · SELECT YOUR CARD")
        .setDescription(
          `<@${state.challengerId}> and <@${state.challengedId}>, choose one card each. Only the matching player can use each menu.`,
        ),
    ],
    components: battleSelectionRows(state),
  });
}

async function handleBattleSelect(interaction: StringSelectMenuInteraction) {
  const [, id, userId] = interaction.customId.split(":");
  const state = activeBattles.get(id);
  if (!state || userId !== interaction.user.id) {
    await interaction.reply({ content: "That card selector is not for you.", ephemeral: true });
    return;
  }
  const cardId = interaction.values[0];
  if (!cardId || !(await ownsCard(interaction.user.id, cardId))) {
    await interaction.reply({ content: "You do not own that card.", ephemeral: true });
    return;
  }
  state.selected[interaction.user.id] = cardId;
  if (state.selected[state.challengerId] && state.selected[state.challengedId]) {
    try {
      await finishBattle(state, interaction);
    } finally {
      activeBattles.delete(id);
      activeBattleByUser.delete(state.challengerId);
      activeBattleByUser.delete(state.challengedId);
    }
    return;
  }
  await interaction.deferUpdate();
  await state.message.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("⚔️ CARD BATTLE · SELECT YOUR CARD")
        .setDescription(
          `<@${state.challengerId}>: ${state.selected[state.challengerId] ? "✅ selected" : "choose a card"}\n<@${state.challengedId}>: ${state.selected[state.challengedId] ? "✅ selected" : "choose a card"}`,
        ),
    ],
    components: battleSelectionRows(state),
  });
}

async function handleTrade(interaction: ChatInputCommandInteraction) {
  if (!(await requirePlayer(interaction))) return;
  const target = interaction.options.getUser("user", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "You cannot trade with yourself.", ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: "You cannot trade with a bot.", ephemeral: true });
    return;
  }
  if (!(await getPlayer(target.id))) {
    await interaction.reply({
      content: "That player is not registered. They need to use `/start`.",
      ephemeral: true,
    });
    return;
  }
  if (activeTradeByUser.has(interaction.user.id) || activeTradeByUser.has(target.id)) {
    await interaction.reply({ content: "One of these players already has an active trade.", ephemeral: true });
    return;
  }
  const id = randomUUID();
  const message = (await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle("🔁 CARD TRADE")
        .setDescription(`${interaction.user} wants to trade with ${target}.`),
    ],
    components: [challengeButtons("trade", id)],
    fetchReply: true,
  })) as Message;
  const state: TradeState = {
    id,
    initiatorId: interaction.user.id,
    targetId: target.id,
    message,
    selections: {},
    offers: {},
    confirmed: new Set(),
  };
  activeTrades.set(id, state);
  activeTradeByUser.set(interaction.user.id, id);
  activeTradeByUser.set(target.id, id);
}

function tradeSelectionRows(state: TradeState): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [tradeSelectRow(state, state.initiatorId, "Player 1 select cards"), tradeSelectRow(state, state.targetId, "Player 2 select cards")];
}

function tradeSelectRow(
  state: TradeState,
  userId: string,
  placeholder: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`trade-select:${state.id}:${userId}`)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions([
      {
        label: "Select cards in the next interaction",
        value: "pending",
        description: "The list is refreshed when the trade is accepted.",
      },
    ]);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

async function tradeSelectionRowsWithCards(
  state: TradeState,
): Promise<ActionRowBuilder<StringSelectMenuBuilder>[]> {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (const [userId, placeholder] of [
    [state.initiatorId, "Player 1 select cards"],
    [state.targetId, "Player 2 select cards"],
  ] as const) {
    const owned = await ownedCards(userId);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`trade-select:${state.id}:${userId}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(Math.min(5, owned.length));
    menu.addOptions(
      owned.map((row) => {
        const card = cardForId(row.cardId);
        return {
          label: `${card?.name ?? row.cardId} · ×${row.quantity}`,
          value: row.cardId,
          description: `${card?.rarity ?? "Unknown"} · enter quantity after selecting`,
        };
      }),
    );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  return rows;
}

function offerText(state: TradeState, userId: string): string {
  const offer = state.offers[userId];
  if (!offer) return "Offer not submitted.";
  const text = Object.entries(offer)
    .map(([cardId, quantity]) => `${cardForId(cardId)?.name ?? cardId} ×${quantity}`)
    .join(", ");
  return text || "No cards";
}

async function refreshTradeMessage(state: TradeState): Promise<void> {
  const bothOffers = Boolean(state.offers[state.initiatorId] && state.offers[state.targetId]);
  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
  if (bothOffers) {
    components.push(...(await tradeSelectionRowsWithCards(state)));
    components.push(
      buttonRow([
        new ButtonBuilder()
          .setCustomId(`trade-confirm:${state.id}:${state.initiatorId}`)
          .setLabel("Player 1 Confirm")
          .setStyle(ButtonStyle.Success)
          .setDisabled(state.confirmed.has(state.initiatorId)),
        new ButtonBuilder()
          .setCustomId(`trade-confirm:${state.id}:${state.targetId}`)
          .setLabel("Player 2 Confirm")
          .setStyle(ButtonStyle.Success)
          .setDisabled(state.confirmed.has(state.targetId)),
        new ButtonBuilder()
          .setCustomId(`trade-cancel:${state.id}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger),
      ]),
    );
  } else {
    components.push(...(await tradeSelectionRowsWithCards(state)));
    components.push(buttonRow([
      new ButtonBuilder()
        .setCustomId(`trade-cancel:${state.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger),
    ]));
  }
  await state.message.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle("🔁 CARD TRADE · REVIEW")
        .setDescription(
          `<@${state.initiatorId}> offers: **${offerText(state, state.initiatorId)}**\n<@${state.targetId}> offers: **${offerText(state, state.targetId)}**\n\nBoth players must confirm. Ownership is checked again at completion.`,
        ),
    ],
    components,
  });
}

function parseOffer(input: string, selectedIds: string[]): TradeOffer | undefined {
  const offer: TradeOffer = {};
  for (const part of input.split(",")) {
    const [rawId, rawQuantity] = part.trim().split(/[=:]/);
    const cardId = rawId?.trim();
    const quantity = Number(rawQuantity);
    if (!cardId || !selectedIds.includes(cardId) || !Number.isInteger(quantity) || quantity < 1) {
      return undefined;
    }
    if (offer[cardId]) return undefined;
    offer[cardId] = quantity;
  }
  return Object.keys(offer).length > 0 ? offer : undefined;
}

async function completeTrade(
  state: TradeState,
  interaction: ButtonInteraction,
): Promise<void> {
  const initiatorOffer = state.offers[state.initiatorId];
  const targetOffer = state.offers[state.targetId];
  if (!initiatorOffer || !targetOffer) return;
  await db.transaction(async (tx) => {
    for (const [cardId, quantity] of Object.entries(initiatorOffer)) {
      const removed = await tx
        .update(jjkPlayerCards)
        .set({ quantity: sql`${jjkPlayerCards.quantity} - ${quantity}`, updatedAt: new Date() })
        .where(
          and(
            eq(jjkPlayerCards.discordUserId, state.initiatorId),
            eq(jjkPlayerCards.cardId, cardId),
            gte(jjkPlayerCards.quantity, quantity),
          ),
        )
        .returning({ quantity: jjkPlayerCards.quantity });
      if (removed.length === 0) throw new Error("TRADE_OWNERSHIP_CHANGED");
    }
    for (const [cardId, quantity] of Object.entries(targetOffer)) {
      const removed = await tx
        .update(jjkPlayerCards)
        .set({ quantity: sql`${jjkPlayerCards.quantity} - ${quantity}`, updatedAt: new Date() })
        .where(
          and(
            eq(jjkPlayerCards.discordUserId, state.targetId),
            eq(jjkPlayerCards.cardId, cardId),
            gte(jjkPlayerCards.quantity, quantity),
          ),
        )
        .returning({ quantity: jjkPlayerCards.quantity });
      if (removed.length === 0) throw new Error("TRADE_OWNERSHIP_CHANGED");
    }
    await tx
      .delete(jjkPlayerCards)
      .where(
        and(
          or(
            eq(jjkPlayerCards.discordUserId, state.initiatorId),
            eq(jjkPlayerCards.discordUserId, state.targetId),
          ),
          lte(jjkPlayerCards.quantity, 0),
        ),
      );
    for (const [cardId, quantity] of Object.entries(initiatorOffer)) {
      await addCard(tx, state.targetId, cardId, quantity);
    }
    for (const [cardId, quantity] of Object.entries(targetOffer)) {
      await addCard(tx, state.initiatorId, cardId, quantity);
    }
  });
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🔁 TRADE COMPLETE")
        .setDescription(
          `<@${state.initiatorId}> received **${offerText(state, state.targetId)}**.\n<@${state.targetId}> received **${offerText(state, state.initiatorId)}**.`,
        ),
    ],
    components: [],
  });
}

async function handleTradeButton(interaction: ButtonInteraction, parts: string[]) {
  const action = parts[1];
  const id = parts[2];
  const state = activeTrades.get(id);
  if (!state) {
    await interaction.reply({ content: "That trade is no longer active.", ephemeral: true });
    return;
  }
  const isParticipant =
    interaction.user.id === state.initiatorId || interaction.user.id === state.targetId;
  if (!isParticipant) {
    await interaction.reply({ content: "You are not part of this trade.", ephemeral: true });
    return;
  }
  if (action === "decline" || action === "cancel") {
    activeTrades.delete(id);
    activeTradeByUser.delete(state.initiatorId);
    activeTradeByUser.delete(state.targetId);
    await interaction.update({ content: "Trade cancelled.", embeds: [], components: [] });
    return;
  }
  if (action === "accept") {
    if (interaction.user.id !== state.targetId) {
      await interaction.reply({ content: "Only the target player can accept.", ephemeral: true });
      return;
    }
    const initiatorCards = await ownedCards(state.initiatorId);
    const targetCards = await ownedCards(state.targetId);
    if (initiatorCards.length === 0 || targetCards.length === 0) {
      await interaction.reply({ content: "Both players need at least one card to trade.", ephemeral: true });
      return;
    }
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle("🔁 CARD TRADE · SELECT CARDS")
          .setDescription("Select up to five cards, then enter quantities such as `jjk_gojo=2, jjk_yuji=1`."),
      ],
      components: await tradeSelectionRowsWithCards(state),
    });
    return;
  }
  if (action === "confirm") {
    const expectedUserId = parts[3];
    if (expectedUserId !== interaction.user.id) {
      await interaction.reply({ content: "That confirm button is not for you.", ephemeral: true });
      return;
    }
    if (!state.offers[state.initiatorId] || !state.offers[state.targetId]) {
      await interaction.reply({ content: "Both players must submit an offer first.", ephemeral: true });
      return;
    }
    state.confirmed.add(interaction.user.id);
    if (state.confirmed.has(state.initiatorId) && state.confirmed.has(state.targetId)) {
      try {
        await completeTrade(state, interaction);
      } finally {
        activeTrades.delete(id);
        activeTradeByUser.delete(state.initiatorId);
        activeTradeByUser.delete(state.targetId);
      }
      return;
    }
    await interaction.reply({ content: "Confirmation saved. Waiting for the other player.", ephemeral: true });
    await refreshTradeMessage(state);
  }
}

async function handleTradeSelect(interaction: StringSelectMenuInteraction) {
  const [, id, userId] = interaction.customId.split(":");
  const state = activeTrades.get(id);
  if (!state || userId !== interaction.user.id) {
    await interaction.reply({ content: "That card selector is not for you.", ephemeral: true });
    return;
  }
  state.selections[interaction.user.id] = interaction.values.filter((value) => value !== "pending");
  if (state.selections[interaction.user.id]?.length === 0) {
    await interaction.reply({ content: "Select at least one card.", ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`trade-qty:${id}:${interaction.user.id}`)
    .setTitle("Set trade quantities")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("quantities")
          .setLabel("Card quantities")
          .setPlaceholder("jjk_gojo=2, jjk_yuji=1")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

async function handleTradeModal(interaction: ModalSubmitInteraction) {
  const [, id, userId] = interaction.customId.split(":");
  const state = activeTrades.get(id);
  if (!state || userId !== interaction.user.id) {
    await interaction.reply({ content: "That trade is no longer active.", ephemeral: true });
    return;
  }
  const selectedIds = state.selections[userId] ?? [];
  const offer = parseOffer(interaction.fields.getTextInputValue("quantities"), selectedIds);
  if (!offer) {
    await interaction.reply({
      content: "Invalid quantities. Use `card_id=quantity` for each selected card.",
      ephemeral: true,
    });
    return;
  }
  for (const [cardId, quantity] of Object.entries(offer)) {
    if (!(await ownsCard(userId, cardId, quantity))) {
      await interaction.reply({
        content: `You do not own enough ${cardForId(cardId)?.name ?? "of that card"}.`,
        ephemeral: true,
      });
      return;
    }
  }
  state.offers[userId] = offer;
  state.confirmed.delete(userId);
  await interaction.reply({ content: "Trade offer saved. Review the trade in the channel.", ephemeral: true });
  await refreshTradeMessage(state);
}

async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const query = interaction.options.getString("character")?.toLowerCase() ?? "";
  const suggestions = allCards()
    .filter(
      (card) =>
        card.name.toLowerCase().includes(query) || card.id.toLowerCase().includes(query),
    )
    .slice(0, 25)
    .map((card) => ({
      name: `${card.name} · ${card.rarity}`,
      value: card.id,
    }));
  await interaction.respond(suggestions);
}

async function registerCommands(applicationId: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required to register Discord commands.");
  const rest = new REST({ version: "10" }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  await rest.put(
    guildId
      ? Routes.applicationGuildCommands(applicationId, guildId)
      : Routes.applicationCommands(applicationId),
    { body: commandData },
  );
  logger.info({ scope: guildId ? "guild" : "global" }, "Discord slash commands registered");
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle("🎴 Anime Card Game")
        .setDescription("Collect Jujutsu Kaisen cards, trade duplicates, and battle other players.")
        .addFields(
          { name: "Account", value: "`/start` · `/balance` · `/profile` · `/daily`", inline: false },
          { name: "Cards", value: "`/pull` · `/pack` · `/collection` · `/card` · `/sell_card`", inline: false },
          { name: "Rewards", value: "`/claim_spin_normal` · `/hourly_claim_spin_normal` · `/shop_spins`", inline: false },
          { name: "Multiplayer", value: "`/battle @user` · `/trade @user` · `/leaderboard`", inline: false },
        )
        .setFooter({ text: "Current set: 11 Jujutsu Kaisen cards." }),
    ],
  });
}

export async function startDiscordBot(): Promise<Client> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required to start the Discord bot.");
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
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("trade-qty:")) {
          await handleTradeModal(interaction);
        }
        return;
      }
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("battle-select:")) {
          await handleBattleSelect(interaction);
        } else if (interaction.customId.startsWith("trade-select:")) {
          await handleTradeSelect(interaction);
        }
        return;
      }
      if (interaction.isButton()) {
        const parts = interaction.customId.split(":");
        if (parts[0] === "collection") {
          if (interaction.user.id !== parts[1]) {
            await interaction.reply({ content: "That collection page is not yours.", ephemeral: true });
            return;
          }
          const rows = await ownedCards(interaction.user.id);
          const page = Number(parts[2]);
          await interaction.update({
            embeds: [collectionEmbed(interaction.user, rows, page)],
            components: collectionComponents(interaction.user.id, page, rows.length),
          });
        } else if (parts[0] === "shop" && parts[1] in CRATE_WEIGHTS) {
          await handleShopPurchase(interaction, parts[1] as PackTier);
        } else if (parts[0] === "battle") {
          await handleBattleButton(interaction, parts[1] ?? "", parts[2] ?? "");
        } else if (parts[0] === "trade") {
          await handleTradeButton(interaction, parts);
        }
        return;
      }
      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case "start":
          await handleStart(interaction);
          break;
        case "pull":
          await handlePull(interaction);
          break;
        case "pack":
          await handlePack(interaction);
          break;
        case "collection":
          await handleCollection(interaction);
          break;
        case "card":
          await handleCard(interaction);
          break;
        case "sell_card":
          await handleSellCard(interaction);
          break;
        case "balance":
          await handleBalance(interaction);
          break;
        case "daily":
          await claimTimedReward(interaction, "daily");
          break;
        case "claim_spin_normal":
          await claimTimedReward(interaction, "normal");
          break;
        case "hourly_claim_spin_normal":
          await claimTimedReward(interaction, "hourly");
          break;
        case "shop_spins":
          await handleShop(interaction);
          break;
        case "battle":
          await handleBattle(interaction);
          break;
        case "trade":
          await handleTrade(interaction);
          break;
        case "profile":
          await handleProfile(interaction);
          break;
        case "leaderboard":
          await handleLeaderboard(interaction);
          break;
        case "help":
          await handleHelp(interaction);
          break;
        default:
          await interaction.reply({ content: "That command is not available.", ephemeral: true });
      }
    })().catch(async (error: unknown) => {
      logger.error({ err: error }, "Discord interaction failed");
      if (interaction.isRepliable()) {
        const content = "Something went wrong while handling that command. Please try again.";
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