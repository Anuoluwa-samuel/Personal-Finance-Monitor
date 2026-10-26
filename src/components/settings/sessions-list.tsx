"use client";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { FormMessage, secondaryButtonClass } from "@/components/ui/field";

type S = { id: string; token: string; userAgent?: string | null; createdAt: Date | string; updatedAt: Date | string };

export function SessionsList() {
  const [sessions, setSessions] = useState<S[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, me] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    if (list.error) return setError("Could not load your devices.");
    setSessions(list.data as S[]);
    setCurrent(me.data?.session.token ?? null);
  }, []);
  useEffect(() => {
    // Loads data from the auth API once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-3">
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      {sessions === null ? <p role="status" className="text-muted">Loading devices…</p> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">{s.token === current ? "This device" : "Another device"}</p>
                <p className="max-w-md break-words text-muted">{s.userAgent || "Unknown browser"} · last active {when(s.updatedAt)}</p>
              </div>
              {s.token !== current ? (
                <button type="button" className={secondaryButtonClass} onClick={async () => { await authClient.revokeSession({ token: s.token }); await load(); }}>
                  Sign out<span className="sr-only"> that device</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {sessions && sessions.length > 1 ? (
        <button type="button" className={secondaryButtonClass} onClick={async () => { await authClient.revokeOtherSessions(); await load(); }}>
          Sign out of all other devices
        </button>
      ) : null}
    </div>
  );
}
