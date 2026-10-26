# Ispentit: deployment and operations guide

**What has and has not been verified.** Everything below that touches Postgres (migrations on an empty database, backup and restore, the
least-privilege role, environment validation) was run during Phase 10 against a local Postgres 17. The production build was run and exercised
by the end-to-end suite. **Not tested here:** a deployment to Vercel or any other host, a real email provider, the cron job on a real scheduler,
and behaviour behind a real proxy or CDN. Treat those steps as instructions to follow carefully and verify with the smoke tests in section 8.

## 1. What you need

| Need | Notes |
|---|---|
| Node.js 22.12 or newer | `engines` in `package.json`; developed on Node 24 |
| PostgreSQL | Managed (Neon, Supabase, RDS, ...) for production. **Verified only on 17**; the schema uses nothing newer than partial and expression indexes and `gen_random_uuid()`, so recent versions should work, but test your version |
| An email provider | The app sends through Resend's HTTP API. Without `RESEND_API_KEY` production **refuses** to send, so nobody can verify an email or reset a password |
| A scheduler (optional) | To generate recurring items without anyone opening the app. Vercel Cron is preconfigured; any scheduler that can send an HTTP header works |
| HTTPS and a stable public origin | Cookies are `Secure` and the CSRF checks compare against `BETTER_AUTH_URL` |

## 2. Environment variables

Validated at startup by `src/lib/env.ts`. A missing or malformed value stops the app with the **names** and reasons only; values are never printed
(tested with deliberately leaky inputs). Put them in your host's secret store; never commit them (`.env*` is git-ignored except `.env.example`).

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string for the **application** role (see section 4) |
| `BETTER_AUTH_SECRET` | yes | At least 32 random characters, e.g. `openssl rand -base64 36`. Rotating it invalidates sessions and outstanding verification and reset links |
| `BETTER_AUTH_URL` | yes | The exact public origin, e.g. `https://app.example.com` (no path, no trailing slash). It is the only trusted origin for auth callbacks and for the CSRF check on writes |
| `EMAIL_FROM` | yes | Sender, e.g. `Ispentit <no-reply@example.com>`. Must be an address your email provider has verified |
| `RESEND_API_KEY` | yes in production | Without it, verification and reset emails cannot be sent |
| `CRON_SECRET` | for scheduling | At least 16 random characters. If unset, `/api/cron/recurring` answers 503 and recurring items are still generated when users open the app |
| `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_JURISDICTION` | before launch | Shown in the Terms and Privacy Policy. If unset the pages say the details are not configured |
| `TEST_DATABASE_URL` | development only | Integration-test database; its name must end in `_test` |
| `SKIP_ENV_VALIDATION=1` | CI builds only | Lets a build run without secrets. Never set it on a running server |

## 3. First deployment, step by step

1. **Create the database** and two roles (section 4): an owner that runs migrations, and a restricted role the app uses.
2. **Apply the schema** from a trusted machine or CI, with the *owner* URL:
   ```bash
   DATABASE_URL='postgres://OWNER:PASSWORD@HOST:5432/DBNAME' npm run db:migrate
   DATABASE_URL='postgres://OWNER:PASSWORD@HOST:5432/DBNAME' npm run db:seed   # default categories; safe to repeat
   ```
   Verified: all ten migrations apply cleanly to an empty database, a second run is a no-op, and `drizzle-kit generate` reports no drift.
3. **Configure the host** (section 6 for Vercel, section 7 for a plain Node host) with the variables above, using the *restricted* role for `DATABASE_URL`.
4. **Set up email** (section 5) and `LEGAL_*`.
5. **Deploy**, then run the smoke tests in section 8.

## 4. Database

### Roles (least privilege), verified

The app never needs to create, alter, drop or truncate tables. Give it only data access; keep the owner role for migrations.

```sql
-- run as the database owner / admin
CREATE ROLE ispentit_app LOGIN PASSWORD 'use-a-long-random-password';
GRANT CONNECT ON DATABASE dbname TO ispentit_app;
GRANT USAGE ON SCHEMA public TO ispentit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ispentit_app;
-- tables created by future migrations (replace OWNER with the role that runs migrations)
ALTER DEFAULT PRIVILEGES FOR ROLE OWNER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ispentit_app;
```

Tested as that role: inserts, queries and the cascading deletion of an account all work; `CREATE TABLE`, `DROP TABLE`, `TRUNCATE`, `ALTER TABLE` and
reading the migrations schema are all refused. Use a pooled connection string if your host provides one (serverless functions open many short connections).

### Migrations: rules

- Migrations are SQL files in `src/db/migrations`, applied in order by `npm run db:migrate`, recorded in `drizzle.__drizzle_migrations`.
- **Never run them automatically on boot or on every deploy.** Run them deliberately: staging first, a backup taken first, then production.
- Never use `drizzle-kit push` against production.
- Migrations are forward-only. Make schema changes backward compatible with the previous app version (add before you remove) so a rollback of the app does not need a rollback of the database.
- Generate a migration after changing the schema with `npm run db:generate`, **read the SQL**, and commit it. One migration (`0001`) was hand-edited to order a foreign key after the index it needs; the file says so. Re-check ordering whenever a new foreign key references a new unique index.
- `npx drizzle-kit check` verifies the migration history is internally consistent (passes).

### Backup and restore, verified

Turn on your provider's automated backups and point-in-time recovery, and **practise a restore** before you need one. Manual logical backup:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" -f ispentit.dump
createdb ispentit_restore                       # a new, empty database
pg_restore --no-owner --no-acl --exit-on-error --dbname ispentit_restore ispentit.dump
```

Drill result (local, 4,548 transactions): 17 tables restored with identical row counts, the exact same sum of all transaction amounts, the same
21 foreign keys, 18 check constraints and 42 indexes, and the restored database still rejected an invalid row. After any restore: run the smoke tests,
and remember that **users who deleted their account may reappear if you restore a backup taken before the deletion**; re-apply deletions (the privacy
policy tells users that backups can retain data until they expire).

## 5. Email (Resend)

1. Create a Resend account and **add and verify your sending domain** (DNS records for SPF and DKIM).
2. Create an API key and set it as `RESEND_API_KEY`. Set `EMAIL_FROM` to an address on the verified domain.
3. Test: register a new account; the verification email must arrive and its link must sign you in. Then use "Forgot your password?".
4. Messages sent are only the verification and password-reset emails. No marketing email is sent. Their text contains one-time links valid for one hour.
5. In development (no key, not production) the message and link are printed to the server console instead. Production never prints them.

Using another provider means changing `src/lib/mailer.ts` (one function, `sendMail`).

## 6. Vercel (the configured target)

1. Import the repository. Framework: Next.js (detected). Node version 22 or newer.
2. Add the environment variables from section 2 for **Production** (and Preview if you use it; remember `BETTER_AUTH_URL` is per-origin, and preview URLs would need to be trusted separately; the simplest approach is to not use previews against real data).
3. Provision Postgres (an integration or an external provider) and apply migrations as in section 3 step 2.
4. Deploy. Set `BETTER_AUTH_URL` to the final domain, then **redeploy** so the value is in effect.
5. **Cron:** `vercel.json` schedules `GET /api/cron/recurring` daily at 03:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set. Confirm in the Vercel dashboard that the cron job is listed and, after the first run, that it returned 200. This has not been tested on Vercel.
6. Domains are HTTPS by default. Vercel sets `X-Forwarded-For` itself, which the per-IP rate limits rely on.

## 7. Any other Node host

```bash
npm ci
npm run build
NODE_ENV=production npm start        # next start; set PORT as needed
```

- Put a reverse proxy in front for TLS. It **must overwrite** `X-Forwarded-For` with the real client address; otherwise clients can spoof it and dilute the per-IP limits (the per-email limits still hold).
- Run under a process manager and restart on failure; point the load balancer health check at `GET /api/health`.
- Trigger recurring generation with any scheduler: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your.domain/api/cron/recurring`.

## 8. Post-deployment smoke tests

Replace `$APP` with your origin.

```bash
curl -fsS $APP/api/health                                   # {"ok":true}
curl -sI $APP/ | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type"   # headers present
curl -s -o /dev/null -w "%{http_code}\n" $APP/api/transactions                                # 401 without a session
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/recurring   # 200
curl -s -o /dev/null -w "%{http_code}\n" $APP/api/cron/recurring                              # 401
```

Then by hand: register, receive and click the verification email, sign in, add a transaction, check the dashboard, export CSV, change theme, sign out, and
confirm that `/dashboard` redirects to `/login`. Check the session cookie in the browser's tools: `__Secure-` prefix, HttpOnly, Secure, SameSite=Lax.

## 9. Logging, errors and monitoring

- The app writes to **stdout/stderr**; your host collects it. Normal request logging is the framework's.
- **Deliberately not logged:** amounts, descriptions, notes, emails, tokens, passwords. Unexpected errors log only the error's class name, and users see a generic message. Do not add logging of request bodies or database errors.
- Auth failures such as a rejected `callbackURL` are logged by the auth library without credentials.
- Recommended: an uptime check on `/api/health`; alerts on 5xx rate and on sustained 429s (abuse, or a limit that is too tight); log retention on the host set to match what the Privacy Policy says.
- There is no built-in error-tracking service. If you add one (Sentry or similar), configure it to **drop request bodies and user data**, and update the Privacy Policy to list the provider.

## 10. Operations notes

| Topic | Guidance |
|---|---|
| Rotating `BETTER_AUTH_SECRET` | Signs everyone out and invalidates pending emails; do it only after a suspected leak |
| Rate-limit tables | `rate_limit` and `app_rate_limit` hold small counters; the app sweeps old application rows occasionally. If they ever grow, `DELETE FROM app_rate_limit WHERE window_start < (extract(epoch from now()) - 86400) * 1000;` is safe |
| Abandoned import previews | Uncommitted staged imports are removed the next time that user starts an import, and when the account is deleted; a periodic `DELETE FROM import_batch WHERE expires_at < now();` is safe |
| Deleting a user by hand | `DELETE FROM "user" WHERE id = '...'` cascades through every table (tested) |
| Capacity | Measured on one laptop only: 100,000 transactions for one user, dashboard about 0.1-0.2 s. Plan a load test for your real traffic before relying on a number |
| Rollback | Redeploy the previous build; because migrations are backward compatible, the database stays as is. To undo data damage, restore from backup (section 4) |
| Dependency updates | `npm run check` (types, lint, unit, integration and component tests) and `npm run test:e2e` before every release; run `npm audit` and read docs/SECURITY.md section 4 about the one open advisory |

## 11. Before you invite real users

- [ ] `LEGAL_*` set; Terms of Service and Privacy Policy reviewed by a lawyer for your jurisdiction and providers
- [ ] Email provider verified and the verification and reset emails tested
- [ ] Least-privilege database role in use; automated backups on; one restore practised
- [ ] `BETTER_AUTH_URL` is the real HTTPS origin; secrets are long and random
- [ ] Proxy overwrites `X-Forwarded-For` (unless on Vercel)
- [ ] Cron confirmed running (or you accept generation only when users open the app)
- [ ] Smoke tests in section 8 pass on the real deployment
