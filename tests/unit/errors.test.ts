import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, notFound, toErrorResponse } from "@/lib/errors";

describe("toErrorResponse", () => {
  it("maps AppError to its status and safe message", () => {
    const { status, body } = toErrorResponse(notFound("Transaction"));
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("maps Zod errors to 400 with per-field messages", () => {
    const parsed = z.object({ amount: z.string().min(1) }).safeParse({ amount: "" });
    if (parsed.success) throw new Error("expected failure");
    const { status, body } = toErrorResponse(parsed.error);
    expect(status).toBe(400);
    expect(body.error.fields).toHaveProperty("amount");
  });

  it("hides details of unknown errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = toErrorResponse(new Error('relation "transaction" does not exist'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("relation");
    spy.mockRestore();
  });

  it("uses distinct statuses for auth failures", () => {
    expect(new AppError("UNAUTHENTICATED", "x").status).toBe(401);
    expect(new AppError("RATE_LIMITED", "x").status).toBe(429);
  });
});
