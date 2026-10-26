import { decimalToMinor, formatMoney, type CurrencyCode } from "@/server/domain/money";

/** Formats a canonical decimal string ("1500.50") for display. Exact: no float conversion. */
export function money(value: string, currency: CurrencyCode = "NGN"): string {
  return formatMoney(decimalToMinor(value, currency), currency);
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2025-03-14" -> "14 Mar 2025". Treats the value as a calendar day, never an instant. */
export const formatDay = (d: string) => dateFmt.format(new Date(d + "T00:00:00Z"));
export const formatMonth = (d: string) => monthFmt.format(new Date(d + "T00:00:00Z"));
export const formatShortDay = (d: string) => dayFmt.format(new Date(d + "T00:00:00Z"));

const monthLongFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2025-03-01" -> "March 2025". */
export const formatMonthLong = (d: string) => monthLongFmt.format(new Date(d + "T00:00:00Z"));
