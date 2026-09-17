import { logger } from "../lib/logger";
import { ALL_CARDS } from "./cards";
import { CROSSOVER_BANNER } from "./banners";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

function verifiedGameContext(): string {
  const odds = CROSSOVER_BANNER.odds
    .map(({ rarity, weight }) => rarity + " " + weight + "%")
    .join(" · ");
  const cards = ALL_CARDS
    .map((card) => card.id + ": " + card.name + " (" + card.rarity + ", power " + card.power + ")")
    .join("; ");

  return [
    "Verified game rules:",
    "- /start registers a player and gives the starter pack once.",
    "- /summon uses one normal spin.",
    "- /pack costs 10 Anime Coins.",
    "- /banner Starlight Envy costs 1 Fragment of Soul per spin.",
    "- Starlight Envy odds: " + odds + ". Mythic is not in this banner's odds.",
    "- A 10-spin banner pull guarantees at least one Legendary-or-higher card.",
    "- /daily, /claim_spin_normal, and /hourly_claim_spin_normal have their own timed claim limits.",
    "- There is no global cooldown for ordinary commands.",
    "- Live balances, collections, and cooldown timestamps are private database data; do not guess them. Tell the player to use /balance, /collection, or the relevant claim command.",
    "Card catalog:",
    cards,
  ].join("\n");
}

export async function answerGameQuestion(question: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: [
            "You are the concise, friendly game assistant for a Discord anime card game.",
            "Answer questions about commands, cards, banner odds, rewards, and rules using only the verified context below.",
            "Do not invent player balances, card ownership, cooldown timestamps, costs, or mechanics.",
            "If the question needs live player data, point the player to the correct bot command.",
            "If the answer is not in the verified context, say that you do not have that information and suggest /help.",
            "Keep answers under 1,700 characters and use Discord-friendly Markdown.",
            "\n" + verifiedGameContext(),
          ].join("\n\n"),
        },
        { role: "user", content: question },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const data = (await response.json().catch(() => ({}))) as GroqResponse;
  if (!response.ok) {
    logger.error({ status: response.status, error: data.error }, "Groq game assistant request failed");
    throw new Error("GROQ_HTTP_" + response.status);
  }

  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("GROQ_EMPTY_RESPONSE");
  return answer.length > 1_900 ? answer.slice(0, 1_897) + "..." : answer;
}
