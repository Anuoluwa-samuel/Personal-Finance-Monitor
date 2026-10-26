import { handle, json, readJson } from "@/server/http";
import { createTransaction, listTransactions } from "@/server/transactions";

export function GET(req: Request) {
  return handle(
    req,
    async (userId) => json(await listTransactions(userId, Object.fromEntries(new URL(req.url).searchParams))),
    { mutating: false },
  );
}

export function POST(req: Request) {
  return handle(req, async (userId) => json(await createTransaction(userId, (await readJson(req)) as never), 201), {
    mutating: true,
  });
}
