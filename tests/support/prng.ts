/** Small deterministic PRNG (mulberry32) so property tests are reproducible: a failure prints its seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    /** A BigInt up to ~max, built from digits so it can exceed 2^53. */
    big: (digits: number): bigint => {
      let s = String(Math.floor(next() * 9) + 1);
      for (let i = 1; i < digits; i++) s += Math.floor(next() * 10);
      return BigInt(s);
    },
  };
}
