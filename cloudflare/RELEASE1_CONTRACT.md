# Release 1 implementation contract

Scope: tracked redirects, explicit tracked/static QR modes, shared workspace analytics and CSV reports. Employee profiles, Wallet, CRM, campaigns and other releases are excluded. Existing URLs and printed QR codes remain unchanged.

Baseline (16 October 2026): 14 existing tests pass; production build passes. Git root resolves to the user's home directory, so changes are managed with explicit file paths and GitHub tree updates, never repository-wide add/reset operations. Production currently has migrations 0001–0003 in source; inspect remote state before rollout.

## Schema and identities

Forward migration 0004 adds workspace analytics settings and collection periods, tracked QR assets, and append-only engagement events; adds nullable `tracked_qr_id` to QR designs and a default-static tracking flag to bulk jobs. Existing rows remain static/unmodified.

Tracked QR assets use immutable UUIDv4 IDs and persist the originally issued public URL. A target is either a direct destination validated with existing redirect rules or an authorized same-workspace link record. A linked target resolves the current link destination internally. Color/style edits do not replace tracking identities. Disabled assets return HTTP 410 without recording events. Asset deletion/reassignment is not offered.

Events contain only UUID, workspace, immutable asset key, link_visit/qr_visit kind, UTC timestamp, country, device/browser/OS families, normalized referrer hostname, and filter version. They never store IP, full user agent, cookies, query strings or visitor identity. Event insertion uses INSERT OR IGNORE with a per-request event ID. Separate requests remain separate visits.

## Permissions and APIs

Existing owner/member roles are unchanged. Both can create/edit tracked assets and read/export their company's analytics; only owners can enable/disable workspace collection. Platform admin does not gain access to another company's private analytics merely through an admin flag.

- `GET/POST /api/tracked-qrs`; `GET/PATCH /api/tracked-qrs/:id`: membership-scoped immutable identity, versioned destination/state updates, idempotent create by ID. Link/design relationships are checked server-side.
- `GET/POST /api/analytics/settings`: collection status, coverage periods, retention and flags; only owners change collection. Enable/disable records intervals, keeping the original instrumentation timestamp.
- `GET /api/analytics`: required ISO UTC `from`/`to` (inclusive/exclusive), channel all/link/qr, optional paired assetType link/qr plus assetId, optional format csv. Maximum report interval is the configured 90-day retention (30 if chosen). Unsupported filters fail validation. Every asset filter is authorized in the selected workspace.
- Responses contain UTC/filter version, retained-data coverage and gaps, totals, zero-filled days, equal prior-period comparison, and bounded asset/dimension rankings. Uninstrumented assets have null counts and an explicit tracking status. Previous-zero or partial-coverage percentage comparisons are null with explanatory labels. Failed queries return an error, never fabricated zeros.
- CSV reuses exactly the report's filters, quotes cells, and neutralizes formula markers after leading whitespace/control characters.

## Collection, flags and retention

Only successful eligible GET redirects count. HEAD, missing/disabled assets, prefetch/prerender requests, recognized bots and verified edge bots do not count. Filter policy `tinytrail-2026-10-v1` is approximate and labels unknown dimensions explicitly. QR redirects create one qr_visit, with no internal /r HTTP redirect or link_visit.

Use ctx.waitUntil for bounded best-effort writes. Redirects remain functional on write failure. Structured failures include operation/type/filter version only, without URL, token, IP or personal data. Read/report errors remain visible. Global collection and new tracked-QR flags default off. Existing /q routes keep resolving even when creation or collection is off.

A workspace owner explicitly enables collection. Proposed retention is 90 days with daily bounded pruning; confirm the policy before enabling production globally. No historical events are invented. The eight GitHub-hosted legacy QR destinations remain labeled outside TinyTrail measurement. Health status includes latest successful event time and stored event count, not a fabricated completeness guarantee. Queue delivery and unique visitors are out of scope.

## Validation and rollout

Use a distinct staging Worker and D1 database, without production domain routes. Apply migrations to representative original records and exercise public /r and /q routing, events, exclusions, destination updates, write-failure behavior and pruning. Local SQLite/RSA/browser tests cover authenticated two-workspace queries/exports, individual/bulk encoded QR outputs, date boundaries, null comparisons, legacy status, and UI states. Register tests in scripts/test.mjs. Run isolated Wrangler local D1/Worker checks in addition to direct function tests.

Back up and verify the production database before additive migration. Stage collection enabled only for seeded test workspace; production flags stay off until policy is confirmed. Deploy compatible /q resolver before issuing public codes. Prefer disabling collection/creation over rollback to a Worker that cannot resolve /q. Keep raw records on disable and document any collection gap. Production activation requires explicit workspace opt-in and policy confirmation, and no staging fixture or authentication bypass is deployed to production.

Policy confirmed by the user on 16 October 2026: 90-day raw-event retention, UTC reporting, no IP/cookie/full-user-agent storage. Hourly bounded pruning keeps the same retention deadline with a maximum hourly execution delay.
