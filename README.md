# Ispentit

A secure personal finance tracker: record income and expenses, plan with budgets and savings goals, and see where your money goes. Built with
Next.js, TypeScript, PostgreSQL and Drizzle as a full-stack engineering project.

> **What it is and is not.** Ispentit organises what *you* enter. It is not a bank, payment service, investment adviser or credit-scoring
> service; it never moves or verifies money, and every balance is a **recorded** balance. It is a portfolio-quality build that has **not yet been
> deployed or load-tested in production**. See [Known limitations](#13-known-limitations) before relying on it.

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams (system, request flow, lifecycles, ERD), metric definitions, HTTP and server-operation reference, decision records |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environment, database roles, migrations, backup and restore, email, Vercel and other hosts, smoke tests, operations |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, controls with evidence, findings fixed, residual risk |
| [docs/FEATURE-NOTES.md](docs/FEATURE-NOTES.md) | Exact behavioural rules of every feature |
| [docs/BRIEF.md](docs/BRIEF.md), [docs/PLAN.md](docs/PLAN.md) | The original product brief and the Phase 1 plan |

## 1. Overview

Ispentit gives people a clear picture of where their money comes from and goes, using only records they enter. Principles: calculations are exact
and consistent; users own their data and can never see anyone else's; every important mutation is validated on the server; charts and reports are
computed from the database, never invented; and the interface says what it can and cannot verify.

## 2. Features

| Area | What you can do | Status |
|---|---|---|
| Accounts and security | Register, verify email, sign in and out, reset password, list and revoke sessions, change password, delete account | Implemented (email needs a provider key) |
| Transactions | Add, view, edit, delete income and expenses; search, filter, sort, paginate | Implemented |
| Dashboard | Period filters (this/last month, 30/90 days, this year, custom), totals, net cash flow, recorded balance, category breakdown, trends, charts with text tables | Implemented |
| Categories | Default and custom, icons and colours, archive and restore | Implemented |
| Budgets | Monthly overall and per-category limits, live progress, warnings in words and icons, history | Implemented |
| Savings goals | Targets, contributions, history, complete, reopen, archive, delete; no overfunding | Implemented |
| Accounts (wallets) | Optional accounts with opening balances and per-account balances | Implemented |
| Recurring | Weekly, monthly, yearly rules that create *planned* items you confirm or skip | Implemented (scheduler needs setup) |
| CSV | Safe export; import with preview, row-level errors, all-or-nothing commit, duplicate detection | Implemented |
| Settings and themes | Name, timezone, light/dark/system theme | Implemented |
| Legal | Terms of Service and Privacy Policy pages | Implemented; **needs legal review** |
| Transfers, multi-currency, MFA, notifications, bank connections | | **Not implemented** (see [Future improvements](#14-future-improvements)) |

## 3. Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Route Handlers), React 19 |
| Language | TypeScript, strict mode |
| Database | PostgreSQL via Drizzle ORM and Drizzle Kit migrations |
| Auth | Better Auth (email and password, verification, reset, sessions) |
| Validation | Zod |
| UI | Tailwind CSS 4, lucide-react icons, Recharts, native HTML controls |
| Tests | Vitest, React Testing Library, Playwright (Chromium) |

Deliberate departures from the original brief: **shadcn/ui and React Hook Form were not used** (native accessible controls and server-side validation
instead; see decision records 13 and 14 in the architecture doc).

## 4. Architecture overview

One Next.js deployment talks to one PostgreSQL database. Requests pass through a small guard (origin check, session, rate limit) into services
that validate, authorise and run each change in a single database transaction, using pure, heavily tested domain functions for money, periods, budgets,
goals, schedules and CSV. Every total is computed from transaction rows on read. Full diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/app/        pages, Server Actions, Route Handlers (auth, transactions, export, cron, health)
src/components/ UI (dashboard, forms, charts, app shell, settings, legal)
src/server/     services + guards (transactions, budgets, goals, accounts, recurring, import, export, analytics ...)
src/server/domain/  pure logic: money, periods, budget and goal rules, recurrence, CSV parse/encode, import rows
src/validators/ Zod schemas (explicit field allow-lists)
src/db/         schema, migrations, seed scripts
src/lib/        env validation, auth config, errors, mailer, formatting
tests/          unit, integration (real Postgres), components, e2e (Playwright)
```

## 5. Installation

Requirements: Node.js 22.12+, npm, Docker (for a local PostgreSQL).

```bash
npm install
cp .env.example .env.local        # then edit as described in section 6
docker compose up -d db           # PostgreSQL 17 on localhost:54340
npm run db:migrate                # create the tables
npm run db:seed                   # default categories (safe to repeat)
npm run dev                       # http://localhost:3000
```

Without `RESEND_API_KEY`, development prints verification and reset links to the server console instead of emailing them.
Optional demo data for a signed-up account (development only; refuses to run in production):
`npm run db:seed-demo -- you@example.com 300`.

## 6. Environment configuration

Copy `.env.example` to `.env.local`. For the bundled Docker database:

```bash
DATABASE_URL=postgres://ispentit:ispentit@localhost:54340/ispentit
BETTER_AUTH_SECRET=<at least 32 random characters: openssl rand -base64 36>
BETTER_AUTH_URL=http://localhost:3000
EMAIL_FROM="Ispentit <no-reply@localhost>"
TEST_DATABASE_URL=postgres://ispentit:ispentit@localhost:54340/ispentit_test   # tests only; name must end in _test
```

Optional: `RESEND_API_KEY`, `CRON_SECRET` (16+ characters), `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_JURISDICTION`. The full table, with production
guidance, is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Variables are validated at startup; a bad value stops the app with the variable's name and the
reason, never its value.

## 7. Database migrations

```bash
npm run db:generate    # after editing src/db/schema: creates a SQL migration. READ IT before committing
npm run db:migrate     # applies pending migrations (never run automatically in production)
```

Verified: all migrations apply to an empty database, re-running is a no-op, and the schema and migrations have no drift. Rules for production
(forward-only, back up first, never `drizzle-kit push`) are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 8. Local development

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | Types, lint and all Vitest suites |
| `npm run db:up` | Start the Docker database |

`src/proxy.ts` (Next 16's replacement for middleware) sets a per-request CSP nonce, so every page renders per request. `AGENTS.md` notes that this Next.js
version differs from older ones; read `node_modules/next/dist/docs` before changing framework-level code.

## 9. Testing

| Suite | Count | Needs | Run |
|---|---|---|---|
| Unit, property, component, integration (Vitest) | 447 | A `*_test` Postgres database | `npm test` |
| End-to-end (Playwright, Chromium, production build) | 49 | A `ispentit_e2e` database, `npx playwright install chromium` once | `npm run test:e2e` |

One-time setup for a new checkout:

```bash
docker compose exec db psql -U ispentit -d postgres -c "create database ispentit_test" -c "create database ispentit_e2e"
npx playwright install chromium
npm run check && npm run test:e2e
```

The Vitest run migrates the test database itself and refuses to run against any database whose name does not end in `_test`. The e2e run builds and starts
the app on port 3199 against `ispentit_e2e`, migrates and seeds it, and gives every test context its own client IP so rate limits behave as they would for
different people.

What the tests cover: exact money arithmetic with 2,000-case property tests; dates, timezones, month and year boundaries and leap years; budget, goal and
recurrence rules; CSV encoding, formula protection and a strict parser; cross-user isolation in every service; database constraints; duplicate and concurrent
submissions; rate limits; account deletion cascades; a randomised dataset that must reconcile across dashboard, list, export, accounts and budgets; a structural test that
fails if any action, API route or page skips authentication; and the 14 user journeys from the brief, malformed and hostile requests, empty and 1,500-row datasets,
phone layout, password reset, session and account-deletion flows, keyboard behaviour, and an axe accessibility sweep of 27 screens in light and dark themes.

Only tests that were actually run are claimed here. Not covered: real screen readers, other browsers, real devices, load testing, a real email provider, a real scheduler.

## 10. Deployment

Short version for Vercel: create a Postgres database and a restricted app role; run `npm run db:migrate` and `npm run db:seed` with the owner URL; set the environment
variables; deploy; set `BETTER_AUTH_URL` to the final domain and redeploy; verify email delivery and the cron job. Complete steps, a verified least-privilege role,
backup and restore commands, smoke tests and an operations checklist are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). **Nothing has been deployed yet**, so the guide's
host-specific steps are untested.

## 11. Security controls

Summary (evidence and residual risk in [docs/SECURITY.md](docs/SECURITY.md)):

- Server-side ownership on every read and write; composite foreign keys for category and account ownership; foreign ids answer "not found".
- Sessions: `__Secure-` cookie, HttpOnly, Secure, SameSite=Lax, 7-day expiry, revocable; passwords hashed by the auth library; verification and reset links expire in an hour and are single-use.
- CSRF defence: SameSite cookies, strict `Origin` checks on API writes and Server Actions.
- Rate limits: per-IP and per-email on authentication; per-user on writes, export and import; stored in Postgres.
- Input safety: Zod allow-lists, exact amount parsing, parameterised queries, no unsafe HTML, nonce-based CSP, security headers, no CORS, generic error bodies, no financial data in logs.
- CSV: spreadsheet-formula neutralisation (lossless), strict parser, size and row limits, preview and atomic commit.
- Privacy: data only used to run the service, no analytics or ads, export and full account deletion available, Terms and Privacy Policy pages.

No security certification or regulatory compliance is claimed.

## 12. Financial calculation definitions

| Metric | Definition |
|---|---|
| Income / Expenses | Sum of income / expense rows dated inside the period |
| Net cash flow | Income - Expenses (a surplus is **not** "money saved") |
| Recorded balance | Account opening balances + all-time income - all-time expenses; not a bank balance |
| Budget spent | Expenses in the budget's calendar month; income and refunds recorded as income never reduce it |
| Goal progress | Starting amount + contributions, never above the target; contributions are planning records and never affect income, expenses or balance |
| Planned recurring items | Not counted anywhere until the user confirms them |

Amounts are exact (NUMERIC in the database, BigInt minor units in code, no rounding: extra decimals are rejected). Transaction dates are calendar days; the user's
timezone only decides what "today" is. Complete definitions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#6-financial-definitions).

## 13. Known limitations

- **Not deployed.** Vercel, the real email provider and the cron job have not been exercised. Production email will not work without `RESEND_API_KEY`.
- **Single currency (NGN)** and one timezone per user (editable). No exchange rates.
- **No transfers between accounts**, no refund model (record a refund as income), opening balances cannot be negative, a transaction has no time of day.
- **Recurring items need a manual confirmation**; a long absence is caught up 60 occurrences per run.
- **Import:** NGN only, 2,000 rows and 512 KB per file, categories and accounts must already exist, and hand-entered rows cannot be recognised as duplicates.
- **Security gaps:** no MFA, breached-password check, "new sign-in" emails or audit log. Per-IP limits trust `X-Forwarded-For`, so the edge must overwrite it. One moderate dev-tooling advisory in `npm audit` (details in docs/SECURITY.md). Never penetration-tested.
- **Accessibility:** automated checks and keyboard tests pass, but no manual screen-reader or high-contrast testing was done; chart graphics themselves are not keyboard-navigable (each has a text summary and a table).
- **Scale:** measured only on one machine (100,000 transactions for one user); no multi-user load test. Totals are computed on read and may need summary tables at much larger sizes.
- **Legal text is a draft** written from the app's behaviour, not legal advice.
- **Browser coverage:** end-to-end tests run in Chromium only.
- A request for a missing record returns a "Not found" page with HTTP 200 (a streaming side effect); it carries `noindex`.
- No licence has been chosen for this code.

## 14. Future improvements

Transfers between accounts as a separate transaction kind; multiple currencies with a documented exchange-rate model; MFA and breached-password checks; security
notification emails and an audit log; email and in-app reminders for budgets and recurring items; CSV import that can create categories and accounts; bank
statement formats; summary tables for very large histories; row-level security as a second line of defence; end-to-end tests in more browsers and a real load test;
internationalisation; an installable offline-capable app; a licence and contribution guide.
