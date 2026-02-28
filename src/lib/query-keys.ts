export const queryKeys = {
  locations: ["stock", "locations"] as const,
  tags: ["stock", "tags"] as const,
  items: ["stock", "items"] as const,
  batches: (q?: string) => ["stock", "batches", q ?? ""] as const,
  planModeItems: (q?: string, excludeExpired = true) =>
    ["stock", "planModeItems", q ?? "", excludeExpired] as const,
  itemsWithBatches: (q?: string) =>
    ["stock", "itemsWithBatches", q ?? ""] as const,
};
