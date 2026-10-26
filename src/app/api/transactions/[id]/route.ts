import { handle, json, readJson } from "@/server/http";
import { deleteTransaction, getTransaction, updateTransaction } from "@/server/transactions";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(req, async (userId) => json(await getTransaction(userId, id)), { mutating: false });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(req, async (userId) => json(await updateTransaction(userId, id, (await readJson(req)) as never)), {
    mutating: true,
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(
    req,
    async (userId) => {
      await deleteTransaction(userId, id);
      return json({ ok: true });
    },
    { mutating: true },
  );
}
