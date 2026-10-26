# Ispentit: feature rules and behaviour reference

Detailed rules for each feature, written as the features were built (Phases 2-9). The top-level [README](../README.md) is the entry point;
this file is the place to look up exactly how a feature behaves. Where a statement here conflicts with the code, the code and its tests win.


## Phase 2 notes and deviations from the plan

- Next.js 16: `middleware` is now `src/proxy.ts`. It sets a per-request nonce CSP and security headers.
  It is not an authorization layer.
- `cacheComponents` is turned off and the root layout is `force-dynamic`: the CSP nonce needs per-request
  rendering, and private financial data must not be cached statically.
- Better Auth generated the auth tables, so auth user ids are `text` (not UUID) and its timestamps are
  `timestamp` without time zone. Finance tables will reference `user.id` as `text`.
- Better Auth's rate limiter stores counters in Postgres (`rate_limit` table).
- Migrations were applied only to the local Docker database.

## Transaction engine (Phase 3)

Money is carried as decimal strings at the edge and BigInt minor units in code (`src/server/domain/money.ts`),
stored as `NUMERIC(18,4)`. Amounts must be JSON **strings**; numbers are rejected. Input with more decimals than
the currency allows is rejected, never rounded. Dates are calendar days (`YYYY-MM-DD`, 2000–2100).

| Route | Purpose |
|---|---|
| `GET /api/transactions` | List. Query: `q, kind, categoryId, from, to, sort=date\|amount, dir, page, pageSize (max 100)` |
| `POST /api/transactions` | Create. Optional `idempotencyKey` (8–64 chars) makes retries safe |
| `GET/PATCH/DELETE /api/transactions/:id` | Read, partial update, delete |

All routes require a verified session. Writes also require an `Origin` header matching `BETTER_AUTH_URL`.
Another user's id returns 404, the same as a missing one. Responses are `private, no-store`.

Rules enforced both in the service and by database constraints: amount > 0 and < 1e12; a transaction's kind must
equal its category's type (composite foreign key); a category with history cannot be deleted (archive instead);
one `(user, idempotencyKey)` pair per row.

### Phase 3 notes
- Currency is fixed to NGN until user preferences exist (Phase 5+). Each row still stores its currency code.
- Hand-edited migration `0001`: the composite FK was moved after the unique index it needs.
- Hard delete: budgets and analytics are computed from rows, so a deleted transaction leaves them immediately.
- Optional `account` on transactions is deferred to Phase 7.

## Dashboard and analytics (Phase 4)

Sign in at `/login`, then `/dashboard`. Pages: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/dashboard`, `/transactions` (+ `/new`, `/:id`, `/:id/edit`), `/categories`, `/budgets` (+ `/new`, `/:id`, `/:id/edit`), `/goals` (+ `/new`, `/:id`, `/:id/edit`), `/accounts` (+ `/:id/edit`), `/recurring` (+ `/new`, `/:id/edit`), `/transactions/import`, `/settings`.

**Periods.** Presets: this month, last month, last 30 days, last 90 days, this year, or a custom range (max 10 years,
2000-2100). A period is an inclusive range of calendar days. The user's timezone (`user_preferences.timezone`,
default `Africa/Lagos`; no settings screen yet) only decides what "today" is, so a transaction dated 1 April counts
in April for a Lagos user at 00:30 local on 1 April even though it is still 31 March in UTC. Invalid ranges are rejected on the server.

**Metric definitions** (computed in SQL from transaction rows on every request; nothing is stored or cached):
- *Income / Expenses*: sum of income / expense rows dated inside the period.
- *Net cash flow*: income - expenses for the period. A surplus is **not** counted as money saved.
- *Recorded balance*: all-time income - expenses. It reflects only what was recorded, not a bank balance.
  There are no opening balances until accounts exist (Phase 7).
- *Category breakdown*: expense totals per category for the period; share = category / total expenses (truncated to 2 dp).
- *Series*: daily buckets for periods up to 62 days, monthly otherwise; empty buckets are shown as real zeroes.
- *Monthly cash flow*: the 12 calendar months ending with the month of min(period end, today).

Chart values are converted to JS numbers for drawing only; every exact figure is rendered from decimal strings.
Each chart has a "View as table" text equivalent and an `aria-label` summary.

**Not built yet:** a settings screen for timezone/currency, shadcn/ui components (plain Tailwind is used for now).

**Performance check** (local Docker Postgres, 100,000 generated transactions for one user): full dashboard
(4 parallel aggregate queries) 107-180 ms; page 400 of the list 89 ms; text search with amount sort 89 ms.
These are single-machine measurements, not production figures.

## Transaction screens

`/transactions` lists with search, type, category and date filters, four sort orders and 25-per-page pagination.
`/transactions/new` and `/:id/edit` use Server Actions that call the same services as the API (so the same validation,
ownership checks and idempotency apply; a double submit of the add form creates one row). Delete uses a confirmation
dialog. The category dropdown only offers categories matching the chosen type; the current category of an old
transaction stays selectable on edit even if archived since.

## Categories (Phase 5)

Policy: default (system) categories are read-only and shared. A custom name may not duplicate (case-insensitively)
a default or your own category of the same type, archived ones included. The type of a category never changes.
Categories are **archived, not deleted**: archived ones disappear from pickers but keep labelling past transactions,
budgets and reports, and can be restored. Up to 100 custom categories per user. Icons and colours come from fixed
lists; the category name is always shown alongside, so colour is never the only signal.

## Budgets (Phase 5)

Monthly budgets only. A budget has an overall limit, category limits (expense categories only), or both.
- **One active budget per user per month** (partial unique index). Archiving frees the month; archived budgets stay in history.
- **Spent** = sum of EXPENSE transactions dated in that calendar month, recomputed on every read from transaction rows.
  Edits, date moves, kind changes and deletes therefore show up immediately. Income, including refunds you record as
  income, never reduces spending (refund-as-negative-expense is not supported yet).
- The **overall limit** is compared with all expenses in the month, including categories that have no limit of their own.
- Status: *On track* below 80%, *Approaching the limit* from 80%, *Limit reached* at exactly 100%, *Over by X* above.
  Always shown as icon + words + bar. Sum of category limits may exceed the overall limit; this is not enforced.
- The month of an existing budget cannot be edited; archive and create a new one.
- Deleting an account removes its budgets, lines and custom categories (budget lines cascade from categories; see migration `0004`).

## Savings goals (Phase 6)

A goal has a name, target, optional already-saved (starting) amount, optional target date and a status
(*active*, *completed*, *archived*). **Contributions are planning records**: they do not verify that money moved
to a bank account or anywhere else, and they are completely separate from transactions. They never change income,
expenses, net cash flow, the recorded balance or budgets (covered by a test).
- **Progress** = starting amount + contributions, against the target. **No overfunding:** a contribution larger than the
  remaining amount is rejected, and the goal row is locked while contributing so concurrent requests cannot jointly
  overshoot (tested: 8 parallel 30 contributions to a 100 goal let exactly 3 through). Lowering the target below what
  is already saved is rejected.
- **Lifecycle:** only active goals accept edits, contributions and contribution removal. Mark complete is manual (reaching the
  target does not complete it automatically); completed goals can be reopened; archived goals can be restored.
  Delete permanently removes the goal and its contributions (confirmation required); archive keeps the history.
- **Mistakes:** a contribution can be removed (while the goal is active), which frees that room again.
- **Retries:** each contribution form carries an idempotency key, so a double submit records one contribution.
- **Dashboard:** shows contributions dated inside the selected period ("set aside") and up to 3 newest active goals. This
  figure is *not* deducted from the recorded balance, because it is a plan rather than a transaction.
- Up to 100 goals per user. A contribution cannot be edited, only removed and re-added. Currency is NGN.

## CSV export and import (Phase 7)

**Export** (`GET /api/transactions/export`, button on `/transactions`): only the signed-in user's rows, with the same filters as
the list (search, type, category, account, dates), oldest first. Columns: Date, Type, Amount, Currency, Description, Category,
Account, Notes. Dates are `YYYY-MM-DD`, amounts have exactly two decimals, line ends are CRLF, and the file starts with a BOM
so Excel reads UTF-8 correctly. Commas, quotes and newlines are quoted per RFC 4180. **Formula injection:** in text columns, any
cell starting with `=`, `+`, `-`, `@`, a tab or CR (even after spaces) is prefixed with `'`. More than 50,000 matching rows is
refused with a message rather than truncated.

**Import** (`/transactions/import`): required columns Date, Type, Amount, Description, Category; optional Account, Notes, Currency
(NGN only). Max 2,000 rows and 512 KB, UTF-8.
1. *Preview*: the whole file is parsed and validated. If any row is invalid nothing is staged and **every** problem is listed with
   its line number. Otherwise the server stores the rows it validated in `import_batch` for one hour and shows a summary.
2. *Confirm*: the browser sends only the batch id. All staged rows are inserted in **one database transaction** (all or nothing).
   Confirming twice, or from two tabs, imports once. Another user's batch id is "not found".
Categories and accounts must already exist (matched by name, ignoring case); archived ones are not accepted. Formulas are never
evaluated; they are stored as text, and the `'` added by export is removed again so exports round-trip.
**De-duplication:** each row gets a deterministic key from user, date, type, amount, description, category (and account when
present) plus its occurrence number among identical rows in the file, stored as the transaction's idempotency key. Re-importing a
file skips rows already imported; two genuinely identical rows in one file are both kept. Rows typed by hand have no key, so
they are **not** detected as duplicates. Recovery from a mistaken import: filter the list and delete, or restore from backup.

## Accounts (Phase 7)

Optional wallets/bank accounts with an opening balance (>= 0). A transaction may belong to one account; ownership is enforced in
the service **and** by a composite foreign key. An account balance = opening balance + income - expenses recorded against it.
The dashboard's **recorded balance** is now: opening balances of all accounts (archived included) + all-time income - expenses
(transactions without an account still count). Accounts are archived, not deleted; archived ones leave pickers but keep history.
Max 20 per user, names unique ignoring case. **Transfers between accounts are not implemented**; when added they must be a
separate kind so they never count as income or expense.

## Recurring transactions (Phase 7)

Rules: weekly / monthly / yearly, every N (1-52), a start date and optional end date. Dates are computed from the start date
(31 Jan -> 28 Feb -> 31 Mar; 29 Feb -> 28 Feb in non-leap years), so month-ends never drift.
- A rule **never creates real transactions on its own.** When an occurrence falls due (in the user's timezone) it becomes a
  **planned** item on `/recurring`. Planned items are not counted in totals, budgets, balances or exports. Only **Confirm paid /
  received** creates the transaction (amount and date can be adjusted for variable bills); **Skip** discards it. A date passing
  never marks anything as paid.
- Generation is idempotent (unique rule + date) and concurrency-safe (row locks). It runs from the cron endpoint and also when
  you open `/recurring` or the dashboard, so it works without a scheduler.
- Pausing stops generation; resuming does **not** back-fill dates missed while paused. A long gap is caught up 60 occurrences per run.
- Editing a rule changes amount, description, category, account or end date for future confirmations. Type, schedule and start date
  are fixed: delete the rule and create another. Deleting a rule removes its planned items but keeps transactions already confirmed.
- **Scheduled job:** `GET /api/cron/recurring` with `Authorization: Bearer $CRON_SECRET`. Without `CRON_SECRET` it answers 503;
  with a wrong secret 401. `vercel.json` schedules it daily at 03:00 UTC. **Not tested on Vercel**; only the handler was exercised locally.

## UI, accessibility and settings (Phase 8)

- **Themes:** light, dark, or match the device. The choice is saved per user (`user_preferences.theme`) and mirrored in a `theme`
  cookie so the server renders the right theme with no flash and no inline script (which the CSP forbids). Changeable from the
  header selector or Settings.
- **Shell:** skip-to-content link, one `<main>` landmark, labelled navigation with `aria-current`, and on phones a "Menu" disclosure
  button (`aria-expanded`, closes on navigation or Escape and returns focus). Interactive targets are at least 44px high.
- **Settings (`/settings`):** name, timezone (drives what "today" and "this month" mean), theme, change password (signs out other
  devices), list and revoke signed-in devices, and **account deletion** (confirmation dialog + password; permanently removes
  everything, verified to leave no orphan rows). Data-access note: export is always available; backups may retain deleted data until
  they expire, which is controlled by the host.
- **States:** every area has a loading skeleton, an error boundary with a generic message (no internals) and a not-found page.
- **Security fix found during this phase:** forms that carry passwords now declare `method="post"`. Before hydration finishes a
  browser submits the form natively, and the default (GET) would have put the email and password in the URL. A test guards this.
- **Automated audit:** axe-core (WCAG 2.0/2.1/2.2 A and AA plus best-practice rules) was run in a real browser on every screen in light
  theme and on the main screens in dark theme, plus at 375px width. Findings fixed: one heading-order issue. Final result: 0 violations
  on every audited page. axe cannot judge everything; the points below were **not** verified by a human.
- **React Testing Library tests** cover forms (labels, error association, category filtering), progress components (status stated in
  words), the nav (menu state, Escape, `aria-current`), and chart text equivalents.
- **How to re-run the audit:** copy `node_modules/axe-core/axe.min.js` into `public/`, start `npm run dev`, sign in, and in the browser
  console fetch and `eval` it, then `axe.run(document)`. Delete the copy afterwards (it is not part of the app).

**Not verified in Phase 8:** real screen-reader use (VoiceOver/NVDA), keyboard-only walkthroughs of every flow, Windows high-contrast
mode, zoom to 400%, and real devices. There are no Playwright end-to-end tests yet. The charts expose summaries and tables but the
SVG itself is not keyboard-navigable.

## Security and QA (Phase 9)

Full threat model, controls with their evidence, the findings of this review and the deployment checklist are in
[docs/SECURITY.md](SECURITY.md). Summary of what changed:
- **Rate limits** on writes (120/min/user), CSV export (5/min, 50,000 rows max) and import preview (10/min), stored in Postgres so they hold across
  serverless instances; **per-email limits** on sign-in, sign-up, password reset and verification email, which still work if an attacker rotates IPs.
- **Server Actions now reject requests with a missing or foreign `Origin`** (previously a request with no Origin was accepted).
- **CSV formula protection is lossless** (a property test found text like `'=1` was being altered on re-import).
- A URL parameter that printed arbitrary text on the import page was replaced with fixed codes.
- One shared sign-in helper for all Server Actions, enforced by a structural test that also covers API routes and pages.
- `Cross-Origin-Resource-Policy: same-origin` added.
- New tests: structural auth coverage, request layer (`handle()`), action origin checks, rate limiter, per-email auth limits and account
  enumeration, 2,000-case property tests for money, budgets, goals, schedules and CSV, and a reconciliation test where the dashboard, list, export,
  account balances and budgets must agree to the kobo on 300 random transactions.
- Checked live on a production build: security headers, cookie flags (`__Secure-`, HttpOnly, Secure, SameSite=Lax), no-store caching of private
  pages, no CORS headers, rejected external `callbackURL`s, identical responses for real and made-up accounts, forged-origin replays of a real form.

`npm run check` runs types, lint and every test. **Not done:** Playwright end-to-end tests, an external penetration test, MFA, and the items under
"Known limitations" in docs/SECURITY.md.

## Terms of Service and Privacy Policy

Public pages at `/terms` and `/privacy` (footer links on every page, plus a notice beside the **Create account** button). They are written
from what the application actually does: what is stored (including each session's IP address and browser string), the cookies used (session
and theme only), the one-hour token and import-preview lifetimes, that nothing is sold or sent to analytics, that deleting an account removes
data from the live database immediately while backups may keep it until they expire, and that Ispentit is not a bank or financial adviser.
They do **not** claim compliance with any law or certification.

**Before a public launch** (tracked for Phase 10):
- Set `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` and `LEGAL_JURISDICTION`. If unset, the pages say the details are "not configured for this
  deployment" instead of inventing any.
- Have a lawyer review both documents for your jurisdiction (for example Nigerian data-protection requirements) and for your actual hosting,
  database and email providers, which the privacy policy describes only generically. Change the text if you add analytics, new providers or
  new data collection.
- Update `LEGAL_EFFECTIVE_DATE` in `src/lib/legal.ts` whenever either document changes.
- Sign-up shows a notice rather than a checkbox, and acceptance is not recorded per user. If you need provable consent, add a required
  checkbox and store the accepted version and time.

## Known issues (see also the Known limitations section of the README)

- `npm audit` reports 4 moderate findings, all one advisory (GHSA-67mh-4wv8-2f99) in an old `esbuild` nested inside
  `drizzle-kit`'s `@esbuild-kit` loader. It concerns esbuild's development server, which `drizzle-kit` does not run,
  and `drizzle-kit` is a dev tool that is not part of the deployed app. `npm audit fix --force` would downgrade
  `drizzle-kit` to 0.18.1 (breaking), so it was deliberately not applied. Re-check when `drizzle-kit` ships a fix.
- Account deletion is enabled in the auth config but has no settings screen yet.
- CSV export is not rate-limited beyond the 50,000-row cap.
- Single currency (NGN) only; the timezone is editable in Settings.
- In a hidden or background browser tab React may not reveal streamed page content (it uses `requestAnimationFrame`), so automated
  tools driving a hidden tab can see skeletons; this affects test tooling, not visible tabs.
