import { handle } from "@/server/http";
import { LIMITS, limit } from "@/server/rate-limit";
import { exportTransactionsCsv } from "@/server/export";

export function GET(req: Request) {
  return handle(
    req,
    async (userId) => {
      await limit(`api:${userId}:export`, LIMITS.exportCsv.max, LIMITS.exportCsv.windowSeconds);
      const params = Object.fromEntries(new URL(req.url).searchParams);
      const { csv, filename } = await exportTransactionsCsv(userId, params as never);
      return new Response("﻿" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    { mutating: false },
  );
}
