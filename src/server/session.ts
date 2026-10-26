import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";

/** Verifies the session cookie against the database. The only source of a user id for private operations. */
export async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.emailVerified) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue");
  }
  return session.user.id;
}

/** For pages: the signed-in user, or null. Pages redirect on null; data access still goes through requireUserId. */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.emailVerified) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
