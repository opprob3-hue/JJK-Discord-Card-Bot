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
  // Banner odds: Epic 48%, Legendary 45%, Divine 5%, Celestial 2%.
  odds: [
    { rarity: "Epic", weight: 48 },
    { rarity: "Legendary", weight: 45 },
    { rarity: "Divine", weight: 5 },
    { rarity: "Celestial", weight: 2 },
  ],
};

export const BANNERS: Record<string, BannerDefinition> = {
  [CROSSOVER_BANNER.key]: CROSSOVER_BANNER,
};
