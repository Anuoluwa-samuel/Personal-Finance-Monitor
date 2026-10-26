import { DeleteAccount } from "@/components/settings/delete-account";
import { PasswordForm } from "@/components/settings/password-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { SessionsList } from "@/components/settings/sessions-list";
import { getPreferences, getTheme } from "@/server/preferences";
import { getSessionUser, requireUserId } from "@/server/session";

export const metadata = { title: "Settings · Ispentit" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = (await getSessionUser())!;
  const [prefs, theme] = await Promise.all([getPreferences(userId), getTheme(userId)]);
  const zones = Intl.supportedValuesOf("timeZone");
  const timezones = zones.includes(prefs.timezone) ? zones : [prefs.timezone, ...zones];
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted">Signed in as {user.email}.</p>
      </header>

      <section aria-labelledby="prefs" className="space-y-3">
        <h2 id="prefs" className="text-lg font-semibold">Profile and preferences</h2>
        <PreferencesForm initial={{ name: user.name, timezone: prefs.timezone, theme }} timezones={timezones} />
      </section>

      <section aria-labelledby="pw" className="space-y-3">
        <h2 id="pw" className="text-lg font-semibold">Password</h2>
        <PasswordForm />
      </section>

      <section aria-labelledby="dev" className="space-y-3">
        <h2 id="dev" className="text-lg font-semibold">Signed-in devices</h2>
        <SessionsList />
      </section>

      <section aria-labelledby="data" className="space-y-3">
        <h2 id="data" className="text-lg font-semibold">Your data</h2>
        <p className="text-muted">
          Your records belong to you. You can {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download, not a page */}
          <a href="/api/transactions/export" className="underline">export all your transactions as CSV</a> at any time. Nothing is shared
          with third parties or sent to analytics. Deleting your account removes your data from the database immediately; copies may remain in database backups until
          they expire (backup retention is set by whoever hosts this deployment).
        </p>
      </section>

      <section aria-labelledby="danger" className="space-y-3 rounded-lg border border-expense p-4">
        <h2 id="danger" className="text-lg font-semibold">Delete account</h2>
        <p className="text-muted">Permanently delete your account and all of your data.</p>
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
