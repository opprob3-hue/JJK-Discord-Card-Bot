export type CardRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Epic"
  | "Legendary"
  | "Mythic"
  | "Divine";

export type AnimeCard = {
  id: string;
  name: string;
  anime: string;
  rarity: CardRarity;
  power: number;
  attack: number;
  defense: number;
  speed: number;
  ability: string;
  image_url: string;
};

export type JjkCard = AnimeCard;

export const JJK_CARDS: JjkCard[] = [
  {
    id: "jjk_gojo",
    name: "Satoru Gojo",
    anime: "Jujutsu Kaisen",
    rarity: "Mythic",
    power: 985,
    attack: 970,
    defense: 990,
    speed: 995,
    ability: "Infinity",
    image_url:
      "https://i.ibb.co/DDFDPjkQ/Satoru-Gojo-arrives-on-the-battlefield-Anime.webp",
  },
  {
    id: "jjk_yuji",
    name: "Yuji Itadori",
    anime: "Jujutsu Kaisen",
    rarity: "Epic",
    power: 870,
    attack: 900,
    defense: 860,
    speed: 850,
    ability: "Black Flash",
    image_url:
      "https://i.ibb.co/ycwQDffd/90ae68f0-22dc-43c1-939c-467a838d2b72-800x690.jpg",
  },
  {
    id: "jjk_yuki",
    name: "Yuki Tsukumo",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 940,
    attack: 965,
    defense: 900,
    speed: 880,
    ability: "Star Rage",
    image_url: "https://i.ibb.co/1tCx031G/download-36.jpg",
  },
  {
    id: "jjk_sukuna",
    name: "Ryomen Sukuna",
    anime: "Jujutsu Kaisen",
    rarity: "Mythic",
    power: 1000,
    attack: 1000,
    defense: 975,
    speed: 965,
    ability: "Malevolent Shrine",
    image_url: "https://i.ibb.co/vvBmgdy2/images-5.webp",
  },
  {
    id: "jjk_todo",
    name: "Aoi Todo",
    anime: "Jujutsu Kaisen",
    rarity: "Epic",
    power: 825,
    attack: 880,
    defense: 850,
    speed: 820,
    ability: "Boogie Woogie",
    image_url: "https://i.ibb.co/FLrYFMZ1/images-69.jpg",
  },
  {
    id: "jjk_megumi",
    name: "Megumi Fushiguro",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 900,
    attack: 875,
    defense: 860,
    speed: 850,
    ability: "Ten Shadows",
    image_url: "https://i.ibb.co/wZ3kJT9B/images-4.jpg",
  },
  {
    id: "jjk_yuta",
    name: "Yuta Okkotsu",
    anime: "Jujutsu Kaisen",
    rarity: "Mythic",
    power: 970,
    attack: 955,
    defense: 950,
    speed: 900,
    ability: "Copy",
    image_url: "https://i.ibb.co/Jwp5ddN2/images-3.webp",
  },
  {
    id: "jjk_kenjaku",
    name: "Kenjaku",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 930,
    attack: 900,
    defense: 920,
    speed: 850,
    ability: "Cursed Technique Manipulation",
    image_url: "https://i.ibb.co/PsSDDbT4/download-37.jpg",
  },
  {
    id: "jjk_toji",
    name: "Toji Fushiguro",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 925,
    attack: 965,
    defense: 850,
    speed: 975,
    ability: "Heavenly Restriction",
    image_url: "https://i.ibb.co/ZpmHWzK2/images-66.jpg",
  },
  {
    id: "jjk_maki",
    name: "Maki Zenin",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 915,
    attack: 950,
    defense: 845,
    speed: 965,
    ability: "Heavenly Restriction",
    image_url: "https://i.ibb.co/KcnkrXhG/images-67.jpg",
  },
  {
    id: "jjk_mahito",
    name: "Mahito",
    anime: "Jujutsu Kaisen",
    rarity: "Legendary",
    power: 910,
    attack: 925,
    defense: 900,
    speed: 870,
    ability: "Idle Transfiguration",
    image_url: "https://i.ibb.co/zzMHn0M/images-68.jpg",
  },
];

// New anime sets can be added here without changing command or database code.
export const CARD_SETS: Record<string, AnimeCard[]> = {
  jjk: JJK_CARDS,
};