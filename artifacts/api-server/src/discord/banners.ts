import { CROSSOVER_CARDS, type CardRarity, type JjkCard } from "./cards";

export type BannerOdds = {
  rarity: CardRarity;
  weight: number;
};

export type BannerDefinition = {
  key: string;
  name: string;
  source: string;
  image_url: string;
  costPerSpin: number;
  cards: JjkCard[];
  odds: BannerOdds[];
};

export const CROSSOVER_BANNER: BannerDefinition = {
  key: "crossover",
  name: "Starlight Envy",
  source: "Crossover",
  image_url: "https://i.ibb.co/84mBN6RH/images-2026-09-15-T193921-541.jpg",
  costPerSpin: 1,
  cards: CROSSOVER_CARDS,
  // The supplied odds leave 10% for Legendary, which completes the hierarchy.
  odds: [
    { rarity: "Epic", weight: 45 },
    { rarity: "Legendary", weight: 10 },
    { rarity: "Mythic", weight: 30 },
    { rarity: "Divine", weight: 10 },
    { rarity: "Celestial", weight: 5 },
  ],
};

export const BANNERS: Record<string, BannerDefinition> = {
  [CROSSOVER_BANNER.key]: CROSSOVER_BANNER,
};
