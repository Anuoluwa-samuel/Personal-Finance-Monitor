import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Liveness + database check for load balancers and deploy smoke tests. Public by design and deliberately minimal:
 * it reveals only whether the app can reach its database, never versions, hostnames or error details.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
