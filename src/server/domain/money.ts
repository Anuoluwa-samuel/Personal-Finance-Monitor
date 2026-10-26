/**
 * Exact money arithmetic. Amounts are carried as decimal strings at the
 * boundary and as BigInt minor units (kobo for NGN) for arithmetic.
 * JavaScript `number` is never used for money.
 */

type CurrencyInfo = { digits: number; locale: string };

export const CURRENCIES = {
  NGN: { digits: 2, locale: "en-NG" },
} satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;
export const DEFAULT_CURRENCY: CurrencyCode = "NGN";

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Largest accepted amount: 999,999,999,999.99 in major units (NUMERIC(18,4) holds far more). */
const MAX_INTEGER_DIGITS = 12;

/**
 * Parses a user-entered positive amount ("1500", "1,500.5", "0.05") into minor
 * units. Rejects zero, negatives, exponents, too many decimals, and anything
 * that is not plain digits. It never rounds.
 */
export function parseAmount(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): bigint {
  const { digits }: CurrencyInfo = CURRENCIES[currency];
  const raw = input.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new MoneyError("Enter a valid amount, for example 1500.50");
  const [, whole, frac = ""] = match;
  if (frac.length > digits) {
    throw new MoneyError(
      digits === 0
        ? "This currency does not use decimals"
        : `Use at most ${digits} decimal places`,
    );
  }
  if (whole.replace(/^0+(?=\d)/, "").length > MAX_INTEGER_DIGITS) {
    throw new MoneyError("Amount is too large");
  }
  const minor = BigInt(whole + frac.padEnd(digits, "0"));
  if (minor <= 0n) throw new MoneyError("Amount must be greater than zero");
  return minor;
}

/** Like parseAmount but zero is allowed (e.g. a starting balance). Blank means zero. */
export function parseAmountOrZero(input: string, currency: CurrencyCode = DEFAULT_CURRENCY): bigint {
  if (input.trim() === "") return 0n;
  try {
    return parseAmount(input, currency);
  } catch (e) {
    if (e instanceof MoneyError && e.message === "Amount must be greater than zero") return 0n;
    throw e;
  }
}

/** Minor units -> canonical decimal string with exactly the currency's digits ("1234.50"). */
export function minorToDecimal(minor: bigint, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const { digits }: CurrencyInfo = CURRENCIES[currency];
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  return `${negative ? "-" : ""}${whole}${digits ? "." + frac : ""}`;
}

/**
 * Converts a Postgres NUMERIC string ("1234.5000") to minor units. Throws if
 * the stored value has precision finer than the currency allows, instead of
 * silently dropping it.
 */
export function decimalToMinor(value: string, currency: CurrencyCode = DEFAULT_CURRENCY): bigint {
  const { digits }: CurrencyInfo = CURRENCIES[currency];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new MoneyError("Malformed stored amount");
  const [, sign, whole, frac = ""] = match;
  const extra = frac.slice(digits);
  if (/[^0]/.test(extra)) throw new MoneyError("Stored amount exceeds currency precision");
  const minor = BigInt(whole + frac.slice(0, digits).padEnd(digits, "0"));
  return sign ? -minor : minor;
}

export const sumMinor = (values: readonly bigint[]): bigint => values.reduce((a, b) => a + b, 0n);

/** Display formatting via Intl, using the exact decimal string (no float conversion). */
export function formatMoney(minor: bigint, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const { locale } = CURRENCIES[currency];
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minorToDecimal(minor, currency) as unknown as number,
  );
}

/** part/whole as a percentage with two decimals, truncated (not rounded). Used for utilisation. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}
