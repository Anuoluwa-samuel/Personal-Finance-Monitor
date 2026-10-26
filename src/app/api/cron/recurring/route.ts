import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { generateOccurrences } from "@/server/recurring";

const NO_STORE = { "Cache-Control": "no-store" };
const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Scheduled job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). It only records PLANNED occurrences; it
 * never creates transactions. No secret configured means the endpoint refuses everything. Safe to call repeatedly.
 */
export async function GET(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: NO_STORE });
  const given = req.headers.get("authorization") ?? "";
  // Compare fixed-length digests so the comparison is constant-time regardless of input length.
  if (!timingSafeEqual(digest(given), digest(`Bearer ${env.CRON_SECRET}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  try {
    const created = await generateOccurrences();
    return NextResponse.json({ ok: true, created }, { headers: NO_STORE });
  } catch {
    console.error("recurring job failed");
    return NextResponse.json({ error: "Job failed" }, { status: 500, headers: NO_STORE });
  }
}
