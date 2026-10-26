import {
  Briefcase, BookOpen, Bus, Film, Gift, HeartPulse, House, Laptop, Plane, Repeat, ShoppingBag, Sparkles, Utensils, Wallet, Zap,
  type LucideIcon,
} from "lucide-react";
import type { CategoryIcon as Name } from "@/server/domain/category-style";

const ICONS: Record<Name, LucideIcon> = {
  utensils: Utensils, bus: Bus, home: House, zap: Zap, book: BookOpen, heart: HeartPulse, film: Film,
  "shopping-bag": ShoppingBag, repeat: Repeat, sparkles: Sparkles, briefcase: Briefcase, gift: Gift,
  wallet: Wallet, laptop: Laptop, plane: Plane,
};

/** Decorative: the category name always appears next to it. */
export function CategoryIcon({ name, color }: { name: string | null; color: string | null }) {
  const Icon = name && name in ICONS ? ICONS[name as Name] : null;
  if (!Icon && !color) return null;
  return (
    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded" style={{ color: color ?? undefined }}>
      {Icon ? <Icon size={18} /> : <span className="h-3 w-3 rounded-full" style={{ background: color ?? undefined }} />}
    </span>
  );
}
