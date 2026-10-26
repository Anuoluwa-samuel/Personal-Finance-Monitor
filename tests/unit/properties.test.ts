import { describe, expect, it } from "vitest";
import { restoreFormula, toCsv, neutraliseFormula } from "@/server/domain/csv";
import { parseCsv } from "@/server/domain/csv-parse";
import { isValidCalendarDate } from "@/server/domain/dates";
import { budgetProgress } from "@/server/domain/budget-rules";
import { goalProgress } from "@/server/domain/goal-rules";
import { decimalToMinor, minorToDecimal, parseAmount, sumMinor } from "@/server/domain/money";
import { daysBetween } from "@/server/domain/periods";
import { dueOccurrences, nthOccurrence, type Frequency } from "@/server/domain/recurrence";
import { rng } from "../support/prng";

const RUNS = 2000;

describe("money (property tests)", () => {
  it("minor -> decimal -> minor round-trips for any positive amount, including beyond 2^53", () => {
    const r = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const minor = r.big(r.int(1, 14));
      if (minor >= 10n ** 14n) continue; // above the product's maximum
      expect(parseAmount(minorToDecimal(minor))).toBe(minor);
      expect(decimalToMinor(minorToDecimal(minor) + "00")).toBe(minor); // NUMERIC(18,4) padding
    }
  });

  it("thousands separators never change the value", () => {
    const r = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const whole = r.big(r.int(1, 11)).toString();
      const frac = r.int(0, 99);
      const plain = `${whole}.${String(frac).padStart(2, "0")}`;
      const grouped = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(frac).padStart(2, "0")}`;
      expect(parseAmount(grouped), `seed 2 run ${i}`).toBe(parseAmount(plain));
    }
  });

  it("sums do not depend on order and equal the exact total", () => {
    const r = rng(3);
    for (let i = 0; i < 200; i++) {
      const xs = Array.from({ length: r.int(1, 40) }, () => r.big(r.int(1, 12)));
      const shuffled = [...xs].sort(() => r.next() - 0.5);
      expect(sumMinor(shuffled)).toBe(sumMinor(xs));
      expect(sumMinor(xs)).toBe(xs.reduce((a, b) => a + b, 0n));
    }
  });

  it("rejects every string with more than two decimals or non-digit junk, never rounding", () => {
    const r = rng(4);
    for (let i = 0; i < RUNS; i++) {
      const frac = String(r.int(100, 99999)).padStart(3, "0");
      expect(() => parseAmount(`${r.int(0, 99999)}.${frac}`)).toThrow();
    }
    for (const junk of ["1e3", "0x10", "1_000", "١٢٣", "1,00,0.5x", "--1", "1.2.3", "$5", "5 NGN"]) expect(() => parseAmount(junk)).toThrow();
  });
});

describe("budget and goal progress (property tests)", () => {
  it("status is consistent with the numbers for any spent and limit", () => {
    const r = rng(5);
    for (let i = 0; i < RUNS; i++) {
      const limit = r.big(r.int(1, 13));
      const spent = r.next() < 0.3 ? limit : r.next() < 0.5 ? limit + r.big(r.int(1, 6)) : (limit * BigInt(r.int(0, 100))) / 100n;
      const p = budgetProgress(spent, limit);
      expect(p.remaining).toBe(limit - spent);
      expect(p.status === "over").toBe(spent > limit);
      expect(p.status === "reached").toBe(spent === limit);
      if (p.status === "ok") expect(p.percent).toBeLessThan(80);
      if (p.status === "approaching") expect(p.percent >= 80 && spent < limit).toBe(true);
      expect(p.percent).toBeGreaterThanOrEqual(0);
    }
  });

  it("more spending never improves the status", () => {
    const order = { ok: 0, approaching: 1, reached: 2, over: 3 } as const;
    const r = rng(6);
    for (let i = 0; i < 300; i++) {
      const limit = r.big(r.int(2, 9));
      let last = -1;
      for (let step = 0; step <= 20; step++) {
        const rank = order[budgetProgress((limit * BigInt(step * 7)) / 100n, limit).status];
        expect(rank).toBeGreaterThanOrEqual(last);
        last = rank;
      }
    }
  });

  it("goal progress never exceeds 100% while saved <= target, and remaining never goes negative", () => {
    const r = rng(7);
    for (let i = 0; i < RUNS; i++) {
      const target = r.big(r.int(1, 12));
      const starting = (target * BigInt(r.int(0, 100))) / 100n;
      const contributed = ((target - starting) * BigInt(r.int(0, 100))) / 100n;
      const p = goalProgress(starting, contributed, target);
      expect(p.percent).toBeLessThanOrEqual(100);
      expect(p.remaining).toBeGreaterThanOrEqual(0n);
      expect(p.saved + p.remaining).toBe(target);
      expect(p.reached).toBe(p.saved === target);
    }
  });
});

describe("recurrence schedules (property tests)", () => {
  const freqs: Frequency[] = ["weekly", "monthly", "yearly"];
  const randomStart = (r: ReturnType<typeof rng>) => {
    for (;;) {
      const d = `${r.int(2000, 2090)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 31)).padStart(2, "0")}`;
      if (isValidCalendarDate(d)) return d;
    }
  };

  it("occurrences are real dates, strictly increasing, and keep the anchor day (clamped)", () => {
    const r = rng(8);
    for (let i = 0; i < 400; i++) {
      const start = randomStart(r);
      const f = r.pick(freqs);
      const n = r.int(1, 12);
      let prev = "";
      for (let k = 0; k < 40; k++) {
        const d = nthOccurrence(start, f, n, k);
        expect(isValidCalendarDate(d), `${start} ${f} ${n} k=${k} -> ${d}`).toBe(true);
        expect(d > prev).toBe(true);
        if (f === "weekly") expect(daysBetween(nthOccurrence(start, f, n, 0), d)).toBe(7 * n * k);
        else expect(Number(d.slice(8)) <= Number(start.slice(8))).toBe(true);
        if (f !== "weekly" && Number(start.slice(8)) <= 28) expect(d.slice(8)).toBe(start.slice(8));
        prev = d;
      }
    }
  });

  it("catching up in chunks gives exactly the same dates as doing it in one go (idempotent resume)", () => {
    const r = rng(9);
    for (let i = 0; i < 200; i++) {
      const rule = { startDate: randomStart(r), endDate: null, frequency: r.pick(freqs), intervalCount: r.int(1, 6), nextIndex: 0 };
      const today = nthOccurrence(rule.startDate, rule.frequency, rule.intervalCount, r.int(0, 60));
      const all = dueOccurrences(rule, today, 1000).dates;
      const chunked: string[] = [];
      let idx = 0;
      for (let guard = 0; guard < 100; guard++) {
        const step = dueOccurrences({ ...rule, nextIndex: idx }, today, r.int(1, 7));
        if (step.dates.length === 0) break;
        chunked.push(...step.dates);
        idx = step.nextIndex;
      }
      expect(chunked).toEqual(all);
      expect(new Set(all).size).toBe(all.length); // never the same date twice
      expect(all.every((d) => d <= today)).toBe(true);
    }
  });
});

describe("CSV (property tests)", () => {
  const ALPHABET = ['a', 'Z', '5', ' ', ',', '"', "'", '\n', '\r', '\t', '=', '+', '-', '@', '₦', 'é', '日', '😀', ';', '\\', '|', '%', '_'];
  const randomText = (r: ReturnType<typeof rng>) => Array.from({ length: r.int(0, 12) }, () => r.pick(ALPHABET)).join("");

  it("parse(toCsv(table)) returns the original table for arbitrary text", () => {
    const r = rng(10);
    for (let i = 0; i < 500; i++) {
      const cols = r.int(1, 6);
      const rows = Array.from({ length: r.int(1, 8) }, () => Array.from({ length: cols }, () => randomText(r)));
      const headers = Array.from({ length: cols }, (_, c) => `h${c}`);
      const parsed = parseCsv(toCsv(headers, rows, new Set()));
      // A row made of one empty field is indistinguishable from a blank line in CSV, so it is skipped by design.
      const expected = rows.filter((row) => !(row.length === 1 && row[0] === ""));
      expect(parsed.slice(1), `seed 10 run ${i}`).toEqual(expected);
    }
  });

  it("formula protection is lossless: restore(neutralise(x)) === x for any text", () => {
    const r = rng(11);
    for (let i = 0; i < 5000; i++) {
      const x = randomText(r);
      expect(restoreFormula(neutraliseFormula(x)), JSON.stringify(x)).toBe(x);
    }
    for (const x of ["'=1", "''=1", "'+2", "'", "''", "'a", "' =1", "=", "'\t=1"]) expect(restoreFormula(neutraliseFormula(x)), x).toBe(x);
  });

  it("no exported text cell can start a formula", () => {
    const r = rng(12);
    const dangerous = /^[ \t\r]*[=+\-@]|^[\t\r]/;
    for (let i = 0; i < 5000; i++) {
      const out = neutraliseFormula(randomText(r));
      expect(dangerous.test(out), JSON.stringify(out)).toBe(false);
    }
  });

  it("the full export -> parse -> restore path preserves text and never leaves a live formula", () => {
    const r = rng(13);
    for (let i = 0; i < 500; i++) {
      const texts = Array.from({ length: r.int(1, 5) }, () => randomText(r)).filter((t) => t !== "");
      if (!texts.length) continue;
      const csv = toCsv(["t"], texts.map((t) => [t]), new Set([0]));
      const cells = parseCsv(csv).slice(1).map((row) => row[0]);
      expect(cells.map(restoreFormula)).toEqual(texts);
      for (const c of cells) expect(/^[ \t\r]*[=+\-@]|^[\t\r]/.test(c)).toBe(false);
    }
  });
});
