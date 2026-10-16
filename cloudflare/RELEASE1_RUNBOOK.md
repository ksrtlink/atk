# Release 1 operations and recovery

## What is enabled

The pilot adds tracked short-link requests, stable `/q/:id` QR URLs, company reporting and CSV export. Owners enable measurement in **Analytics**. Shared-library members can read reports and create/edit tracked QR assets; only owners change the company collection setting. Existing static QR designs remain static on reopening. Existing exported images are never rewritten. The original eight GitHub QR URLs remain outside TinyTrail measurement.

The user confirmed the 90-day policy on 16 October 2026. Reports use UTC inclusive-start/exclusive-end intervals and at most 90 days. No IP, visitor cookie, full user agent, full referrer URL or unique-visitor estimate is persisted. QR URL visits are eligible HTTP requests, not proven physical scans. Redirect writes are best effort; missing events cannot be reconstructed or presented as historical zeroes.

## Environments and flags

Production is `tinytrail` / `tinytrail-db` / `https://tinytrail.link`. Staging is `tinytrail-staging` / `tinytrail-staging-db` / its workers.dev URL. Actual IDs and public Firebase values stay in ignored local config files. `node scripts/check-staging.mjs` refuses shared production/staging bindings, names or origins. Never apply `tests/fixtures/analytics.sql` to production.

`ANALYTICS_ENABLED` controls collection availability; `TRACKED_QR_ENABLED` controls new tracked-QR creation. Both default false. Existing `/q/` routes continue resolving when either flag is false. Production uses `ANALYTICS_RETENTION_DAYS=90`; every company starts with collection off until its owner opts in. `MAX_TRACKED_QRS_PER_WORKSPACE` defaults to 200 and supports 1–1000.

A separate staging config can be created from `wrangler.example.jsonc`: change the Worker name and D1 database ID/name, remove production routes, set its public origin, and set analytics/tracked-QR flags true. Run `npm run deploy:staging` only after the isolation check passes.

## Checks and observability

- `npm test` registers authentication, enterprise and analytics suites through `scripts/test.mjs`.
- `npm run build` uses the existing rendering/export dependencies; no new production service or analytics SDK is introduced.
- `node tests/browser-analytics.mjs` uses the loopback SQLite/RSA harness and a browser on CDP port 9226. It verifies company opt-in, exact link/QR counts, CSV, tracked PNG decoding, bulk output, mobile layout, report failure states and sign-out cleanup. Firebase identity responses are simulated; no email is sent.
- The real local Worker uses isolated persistence. With the bundled emulator, use `--compatibility-date 2026-05-22` locally; production/staging keep the configured 2026-10-15 date. This local override is a tooling limit, not a production compatibility change. For a local cron check, start Wrangler with `--test-scheduled` and request `/__scheduled?cron=17+*+*+*+*`; the bundled runtime's `/cdn-cgi/handler/scheduled` endpoint returned an emulator exception instead. The middleware test ran the real exported scheduled handler and verified deletion in local D1.
- `event_insert`, `event_schedule`, `report_query` and `retention_prune` structured errors identify failures without logging visitor details or tokens. Use Cloudflare Worker logs to inspect these operations. Do not infer complete delivery from successful redirects.
- The dashboard shows stored-event count, latest successful event and pending pruning, not provider billing counters. Check actual Cloudflare D1 rows read/written and storage in the provider dashboard during the pilot. Indexed event inserts/deletes consume more than one billed row write. No free/unlimited-traffic claim is made; do not silently upgrade plans.
- Hourly cron at minute 17 removes expired rows in bounded chunks (up to 10,000 per invocation). Reports exclude expired events immediately; physical pruning can lag until the next pass. `more_rows_pending` and the dashboard expose backlog. Investigate sustained backlog or quota pressure rather than claiming retention succeeded.

## Backup, migration and deployment

1. Record the current Worker version and D1 Time Travel bookmark: `wrangler d1 time-travel info DB`. Free-plan bookmarks are subject to the provider's seven-day recovery window.
2. Prefer supported D1 export when the current environment allows it. The bounded pilot fallback is `node --experimental-sqlite scripts/backup-d1.mjs wrangler.jsonc ../.qa/tinytrail-release1-backup.sql`. It saves schema/data privately, restores into separate SQLite, checks table counts/foreign keys and records a checksum. It refuses more than 20,000 records; use provider export or Time Travel beyond that bound. No production data is printed or committed.
3. Apply only new migrations to staging, verify old records, indexes, foreign keys and actual edge routing. Then apply production migration 0004 after backup verification. Old columns and issued addresses are untouched.
4. Deploy the compatible code with flags false and smoke-test public routes/API gates. Then activate availability incrementally with the confirmed policy. Companies remain opted out until their owner enables measurement.

## Pause and rollback

For a planned pause, disable company collection before turning off the deployment flag. This records an ended coverage period; enabling later creates a new period and preserves the measurement gap. If an operator must use a global emergency switch, record its exact UTC time and close open analytics periods/settings through an authorized maintenance operation before resuming. Do not describe an unrecorded outage as continuous complete coverage. Recorded events remain subject to the agreed retention/pruning policy while collection is off.

After any `/q/` URL is issued, do not revert the whole Worker to a pre-Release-1 version: it lacks the `/q/` resolver and would strand printed codes. Prefer disabling collection/creation and keeping the resolver. A UI rollback must retain that compatible Worker. Never drop tracking tables or recycle IDs. Do not restore an older database over newly created company records as routine rollback; Time Travel restoration overwrites live state and requires deliberate recovery authorization.

## Deferred releases

Employee cards, contact files, Apple/Google Wallet, CRM/contact exchange, campaign resources, regional routing and health monitoring remain unimplemented. They require their own gates and, for Wallet/CRM, actual issuer credentials, provider setup and device validation. There are no placeholder buttons claiming these integrations work.
