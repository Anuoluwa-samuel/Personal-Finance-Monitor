# Ispentit: threat model, controls and Phase 9 review

Status: reviewed 26 October 2026 against the code in this repository. This is a developer review with automated tests and
manual probing of a local production build. It is **not** an independent penetration test and makes no claim of certification
or regulatory compliance.

## 1. Assets and attackers

| Asset | Why it matters |
|---|---|
| Financial records (transactions, budgets, goals, accounts, recurring rules) | Sensitive personal data; confidentiality and integrity both matter |
| Credentials and sessions | Takeover exposes everything above |
| Availability of the service | Users rely on it for records |

Attackers considered: an anonymous visitor; another signed-in user (the main one: horizontal privilege escalation); a malicious
web page visited by a signed-in user (CSRF); someone with a stolen/guessed password or session; a script hammering endpoints;
a user supplying hostile data (CSV, text, dates, ids). Not considered: a compromised host or database, a malicious operator, nation-state attackers.

## 2. Threats, controls and the evidence for each

| Threat | Control | Evidence |
|---|---|---|
| Reading or changing another user's data (IDOR) | `userId` always comes from the verified session, never the client; every query filters by it; foreign ids answer "not found"; composite foreign keys tie transactions to the same user's categories and accounts | Ownership tests in every integration suite; `reconciliation` test with another user's rows present; DB-constraint tests |
| Unauthenticated access | Every Server Action calls `userOrLogin()`, every private API route goes through `handle()`, every page authenticates, the `(app)` layout redirects | `tests/unit/auth-coverage.test.ts` fails the build if one is missing |
| CSRF | Session cookie `SameSite=Lax`; API writes require `Origin` equal to the app origin; Server Actions require the same (or `Sec-Fetch-Site: same-origin`) and Next rejects mismatches | `http-handle` and `action-origin` unit tests; live replay of forged, `null`, missing and cross-site requests: only the legitimate one created a row |
| Session theft / fixation | `__Secure-` prefixed cookie, HttpOnly, Secure, SameSite=Lax, 7-day expiry; password change signs out other devices; users can list and revoke sessions | Cookie flags read from a real sign-in response |
| Brute force and credential stuffing | Per-IP limits (auth library, Postgres-backed) plus per-email limits (10 sign-ins / 15 min) that hold even if the IP header is spoofed | `auth-limits` integration tests; limiter concurrency test |
| Account enumeration | Sign-up, sign-in and password-reset answers are identical for real and made-up addresses | Tested in code and against the live server |
| Inbox flooding | Per-email limits on reset (3/h), verification (3/h) and sign-up (5/h) | `auth-limits` tests |
| Abuse of expensive actions | Writes 120/min per user; export 5/min and capped at 50,000 rows; import preview 10/min, 512 KB, 2,000 rows; list pages capped at 100; analytics ranges capped at 10 years | The limiter itself (window, atomicity, concurrency) is tested; the numeric limits are constants in `src/server/rate-limit.ts` and are not asserted by a test |
| Injection (SQL) | Drizzle parameterises every value; the only raw SQL fragment takes a fixed `'day' \| 'month'` literal; LIKE wildcards in search are escaped | A test fails if any other `sql.raw` appears; wildcard tests |
| XSS | React escapes output; no `dangerouslySetInnerHTML`, `eval` or `new Function`; nonce-based CSP with `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` | Source-scan test; CSP observed on every response |
| Spreadsheet formula injection | Exported text cells beginning `= + - @` (even after spaces) or tab/CR get a leading `'`; import reverses it exactly | Unit and 5,000-case property tests (found and fixed a lossy edge case) |
| Hostile uploads | CSV only, 512 KB, strict RFC 4180 parser, never evaluated; rows validated; staged then committed in one transaction; duplicates detected | Parser, validation and import integration tests |
| Duplicate financial mutations | Idempotency keys (transactions, contributions), unique constraints (budgets, recurring occurrences, import keys), row locks (goals, occurrences) | Concurrency tests (8 parallel contributions, 5 parallel confirms, etc.) |
| Money errors | BigInt minor units in code, NUMERIC in the database, no rounding, 2,000-case property tests, one dataset reconciled across dashboard, list, export, accounts and budgets | `properties` and `reconciliation` tests |
| Data leakage via errors/logs | Generic error bodies; unexpected errors log only the error name; logs never contain amounts or descriptions | `http-handle` leak test; source review of every `console.*` |
| Data leakage via caches | Authenticated pages and API: `Cache-Control: private, no-store`; dynamic rendering | Headers read from the live server |
| Open redirects | No user-controlled redirect targets; the auth library rejects foreign `callbackURL`s; messages passed in URLs were replaced by fixed codes | Live probe: 403 for external callback URLs |
| Clickjacking, sniffing, referrer leaks | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP `same-origin`, HSTS in production | Headers read from the live server |
| Cross-origin reads | No CORS headers are sent, so browsers block cross-origin reads | Live preflight and read probes |
| Scheduled-job abuse | Cron endpoint needs `Authorization: Bearer $CRON_SECRET` (constant-time compare); 503 if unset | Integration tests |
| Password in a URL | Password forms declare `method="post"` | Component tests (found in Phase 8) |

## 3. Findings fixed in Phase 9

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | A Server Action POST with **no `Origin` header** was accepted (Next only checks a header that is present). Not exploitable from a browser today (cookies are SameSite=Lax and browsers send Origin), but weaker than the API routes | `assertSameOrigin()` in the shared action helper; tested; replayed live |
| 2 | Medium | No application-level rate limiting on writes, export or import; auth limits were keyed by IP only, so a spoofed `X-Forwarded-For` or many IPs could attack one account | Postgres-backed fixed-window limiter; per-user limits; per-email auth limits |
| 3 | Medium (integrity) | CSV formula protection was lossy: text starting with `'` plus a formula character was exported unchanged, and import then removed the apostrophe, altering the user's data | Lossless encoding; found by the property tests |
| 4 | Low | `/transactions/import?problem=<text>` printed arbitrary text from the URL, so a crafted link could show a user a fake message | The URL now carries a fixed code only; the page maps it to fixed text |
| 5 | Low (maintainability) | Eight copies of the sign-in helper in Server Action files; a new action could forget it | One shared helper plus a structural test |
| 6 | Info | Added `Cross-Origin-Resource-Policy: same-origin` | `proxy.ts` |

Found earlier but worth repeating: in Phase 8 an unhydrated login form could submit via GET and place the password in the URL (fixed).

## 4. Known limitations and residual risk (not fixed)

- **Client IP trust.** The auth library's per-IP limits read `X-Forwarded-For`. Behind Vercel the platform sets it; on any other host,
  put the app behind a proxy that overwrites it. The per-email limits do not depend on it.
- **No multi-factor authentication**, no breached-password check, no "new sign-in" or "password changed" emails, no security-event audit log.
- **CSP** allows inline `style=""` attributes (`style-src-attr 'unsafe-inline'`) because charts and bars set widths that way; scripts remain nonce-only.
- **Dependency advisory (moderate, GHSA-67mh-4wv8-2f99):** an old `esbuild` nested in `drizzle-kit`'s loader. It concerns esbuild's development
  server, which `drizzle-kit` does not start; no application code imports `drizzle-kit`. npm still reports it because `better-auth` lists
  `drizzle-kit` as an optional peer. The "fix" downgrades `drizzle-kit` to 0.18.1, so it was not applied. I could not confirm from build
  trace files that it is excluded from a deployed bundle, so treat it as a dev-tool issue to re-check when `drizzle-kit` updates.
- **Database privileges.** The app uses one connection string. In production use a role that can read and write the app tables but cannot
  create or drop schema, and run migrations with a separate role.
- **Backups and restore** are the host's responsibility and untested here. Deleted accounts can survive in backups until they expire.
- **Not tested:** Vercel deployment, the cron job on Vercel, a real email provider, behaviour behind a real proxy/CDN.
- **No automated end-to-end (Playwright) tests and no external penetration test or dynamic scanner run.**
- A request to a missing record returns a "Not found" page with HTTP 200 (a consequence of streaming with a loading state); the page carries `noindex`.

## 5. Deployment requirements checklist

1. HTTPS only; set `BETTER_AUTH_URL` to the exact public origin (it is also the only trusted origin for CSRF checks).
2. `BETTER_AUTH_SECRET` at least 32 random characters, `CRON_SECRET` at least 16, `RESEND_API_KEY`; never commit `.env*` (only `.env.example`).
3. Separate production database; least-privilege runtime role; migrations run deliberately, never automatically on boot; backups enabled and a restore tested.
4. Overwrite `X-Forwarded-For` at the edge, or use a platform that does.
5. Set the `LEGAL_*` variables and have the Terms and Privacy Policy reviewed.
6. Run `npm run check` and `npm audit` before each release.

## 6. Re-running the checks

```bash
npm run check                      # types, lint, all tests
npm audit
npm run build && npm start         # then probe headers with curl -I
```
