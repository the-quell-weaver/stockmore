export type SeedItem = {
  /** Internal reference key used by SeedBatch.itemRef */
  ref: string;
  name: string;
  unit: string;
  minStock: number;
  note?: string;
};

export type SeedBatch = {
  /** Matches SeedItem.ref */
  itemRef: string;
  quantity: number;
  expiryDate: string | null; // YYYY-MM-DD or null
};

export const SEED_ITEMS: readonly SeedItem[] = [
  { ref: "water",     name: "礦泉水",   unit: "瓶", minStock: 36 },
  { ref: "dryfood",   name: "即食乾糧", unit: "包", minStock: 20 },
  { ref: "firstaid",  name: "急救包",   unit: "個", minStock: 2  },
  { ref: "batteries", name: "乾電池",   unit: "顆", minStock: 20 },
  { ref: "masks",     name: "口罩",     unit: "片", minStock: 50 },
  { ref: "canned",    name: "罐頭食品", unit: "罐", minStock: 24 },
] as const;

// 12 batches: 2 per item, mix of future expiry / no expiry / near-expiry
export const SEED_BATCHES: readonly SeedBatch[] = [
  // 礦泉水
  { itemRef: "water",     quantity: 24, expiryDate: "2027-12-31" },
  { itemRef: "water",     quantity: 12, expiryDate: null },
  // 即食乾糧 (one near-expiry to demo expiry warning state)
  { itemRef: "dryfood",   quantity: 15, expiryDate: "2027-06-30" },
  { itemRef: "dryfood",   quantity: 5,  expiryDate: "2026-03-31" },
  // 急救包
  { itemRef: "firstaid",  quantity: 2,  expiryDate: "2028-12-31" },
  { itemRef: "firstaid",  quantity: 1,  expiryDate: "2026-06-30" },
  // 乾電池
  { itemRef: "batteries", quantity: 16, expiryDate: "2030-12-31" },
  { itemRef: "batteries", quantity: 8,  expiryDate: null },
  // 口罩 (one near-expiry)
  { itemRef: "masks",     quantity: 50, expiryDate: "2027-03-31" },
  { itemRef: "masks",     quantity: 20, expiryDate: "2026-04-30" },
  // 罐頭食品
  { itemRef: "canned",    quantity: 18, expiryDate: "2028-06-30" },
  { itemRef: "canned",    quantity: 6,  expiryDate: null },
] as const;
