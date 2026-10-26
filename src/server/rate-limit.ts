import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppError } from "@/lib/errors";

export type LimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Counts one hit against `key` in a fixed window and says whether it is still allowed. A single atomic upsert, so
 * concurrent requests cannot slip past the limit. Keys must never contain secrets (use ids or a lower-cased email).
 */
export async function hit(key: string, max: number, windowSeconds: number, now: number = Date.now()): Promise<LimitResult> {
  const windowMs = windowSeconds * 1000;
  const rows = await db.execute<{ count: number; window_start: string }>(sql`
    insert into app_rate_limit (key, window_start, count) values (${key}, ${now}, 1)
    on conflict (key) do update set
      count = case when app_rate_limit.window_start <= ${now - windowMs} then 1 else app_rate_limit.count + 1 end,
      window_start = case when app_rate_limit.window_start <= ${now - windowMs} then ${now} else app_rate_limit.window_start end
    returning count, window_start`);
  const { count, window_start } = rows[0];
  // Expired rows are only ever overwritten by the same key, so sweep them now and then (about 1 call in 200).
  if (Math.random() < 0.005) {
    void db.execute(sql`delete from app_rate_limit where window_start < ${now - 24 * 60 * 60 * 1000}`).catch(() => undefined);
  }
  return {
    allowed: count <= max,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((Number(window_start) + windowMs - now) / 1000)),
  };
}

/** Throws a 429 AppError when the limit is exceeded. */
export async function limit(key: string, max: number, windowSeconds: number): Promise<void> {
  const r = await hit(key, max, windowSeconds);
  if (!r.allowed) throw new AppError("RATE_LIMITED", `Too many requests. Please wait ${r.retryAfterSeconds} seconds and try again.`);
}

export const LIMITS = {
  /** Any create/update/delete by one user. Generous: it only stops runaway scripts. */
  mutate: { max: 120, windowSeconds: 60 },
  exportCsv: { max: 5, windowSeconds: 60 },
  importPreview: { max: 10, windowSeconds: 60 },
} as const;
