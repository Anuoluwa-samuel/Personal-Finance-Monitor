/** Allowlists for optional category styling. Stored as plain strings; unknown values are rejected on write. */
export const CATEGORY_ICONS = [
  "utensils", "bus", "home", "zap", "book", "heart", "film", "shopping-bag",
  "repeat", "sparkles", "briefcase", "gift", "wallet", "laptop", "plane",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  { name: "Teal", hex: "#0f6b5c" },
  { name: "Red", hex: "#a3341f" },
  { name: "Amber", hex: "#8a5a00" },
  { name: "Blue", hex: "#1f5fa8" },
  { name: "Violet", hex: "#6b3fa0" },
  { name: "Pink", hex: "#a8336b" },
  { name: "Slate", hex: "#4b5563" },
] as const;
