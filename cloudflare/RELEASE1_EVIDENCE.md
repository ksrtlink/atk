# Release 1 verification record

Verified: 16 October 2026. Scope: tracked links, tracked QR assets, company analytics and CSV only. Releases 2–5 in `../IMPLEMENTATION_PLAN.md` remain specifications.

## Delivery

- Production: https://tinytrail.link/manage/ — Worker `tinytrail`, current version `f04f3f3b-b2e6-4503-8c8d-675c937c24a6` (initial Release 1 activation: `d52a7419-f86a-4974-b492-5a8027b1a4cb`).
- Isolated staging: `tinytrail-staging.hamedmstfa.workers.dev`, current version `30dda920-5e8b-46f6-a327-289bc5dd6dcf`; its D1 binding is separate from production and has no custom-domain routes.
- Forward migration `0004_analytics.sql` applied in both environments. Production reports all four migrations applied and no foreign-key violations.
- Initial production rollout used disabled collection/creation flags, version `f54f02fa-4820-47ae-a72c-62a84a8ba259`. Landing, studio, original redirect, missing QR and anonymous API gates passed before final activation.
- Final global availability flags are enabled, retention is 90 days, cron is `17 * * * *`. Every company starts opted out; only its owner can enable measurement. The user confirmed the 90-day policy.
- Post-deployment production SQL: eight original links, zero engagement events, zero tracked QR records, zero staging fixture workspaces. No historical traffic or demonstration numbers were inserted. These are rollout observations, not permanently fixed counts.

## Automated and browser checks

`npm test`: 24/24 passed after the final Worker export change. Existing authentication/company tests and ten analytics regressions run from the actual package test entry point. The build passed for staging and production.

The registered suites verify eligible GET collection, HEAD/prefetch/bot exclusions, immutable QR identities, current linked destinations, one QR event without a link event, disabled/missing responses, best-effort failure logging, feature-off resolution, member/owner permissions, cross-company filters/exports/assets/bulk rejection, stable bulk retry identities, UTC boundaries, empty days, partial/unmeasured coverage, prior-zero comparison, formula-safe CSV, and indexed retention.

Both `node tests/browser-analytics.mjs` and `node tests/browser-enterprise.mjs` passed against the loopback SQLite/RSA harness in headless Edge. The analytics browser suite checks owner opt-in, persisted counts (one link and two QR requests), matching CSV, decoded individual PNG and bulk ZIP QR URLs, appearance changes retaining identity, destination edits, report error states, desktop/mobile overflow, and sign-out clearing private analytics and QR state. Original enterprise regressions cover account/company flows, links, direct QR, bulk, exports and original-library authorization. No JavaScript exceptions were captured. Desktop/mobile screenshots were visually inspected and remain in ignored local QA files.

Firebase identity responses in this harness are simulated with real RSA-signed test tokens. These checks do not establish real Firebase signup, email delivery, or a human session on production; authentication behavior was not changed in this release.

## Actual Worker and D1 checks

- Real local Wrangler Worker, isolated local D1, all four migrations: eligible `/r/` and `/q/` requests persisted exactly one `link_visit` and one `qr_visit`. HEAD, prefetch, Googlebot, missing and disabled routes did not increase those counts. Eight original records remained present; foreign-key check was empty.
- Local storage failure injection temporarily renamed only the isolated event table. The short link still returned the correct 302, and the Worker emitted a structured `event_insert` failure. The table was restored afterward.
- Actual exported scheduled handler invoked with Wrangler `--test-scheduled` at `/__scheduled?cron=17+*+*+*+*` returned 200. D1 verification showed the 91-day-old fixture deleted and both current events retained. The bundled emulator required a local compatibility-date override and the test middleware endpoint; see runbook. A successful future production cron invocation has not been observed yet.
- Staging edge requests through the browser persisted exactly one eligible event per channel in remote D1. The QR route resolved internally, disabled QR returned 410, missing QR returned 404, and anonymous private endpoints returned 401. Final staged HEAD checks retained that behavior without adding events.
- Final production browser checks: landing, studio and new analytics assets return 200; config reports tracked QR availability; anonymous analytics/settings/tracked-QR/original-library calls return 401; missing QR returns 404; existing `/r/insights` still redirects. Browser manual redirects appear as opaque redirects when the destination is external.

## Recovery evidence

Before migration, a bounded schema/data backup restored successfully into independent SQLite: 11 tables and 11 records (eight links plus three migration receipts), matching table counts and no foreign-key violations. SHA-256: `f126859bbb5a490f772dcc31873c7bff72b3322557dda600d41d8f30c98556cf`. Backup and provider Time Travel bookmark are private ignored local files. The ordinary D1 export endpoint was unavailable in this environment, so the validated bounded query fallback was used. The runbook documents its 20,000-record limit.

A production database restoration was deliberately not executed. Safe feature rollback is tested: disabling collection/creation preserves issued `/q/` resolution. Never revert to a Worker without that resolver or overwrite new production records as a routine rollback.

## Limits and pilot operation

Reports describe eligible HTTP visits, not proven physical scans or unique people. Collection is best effort and bot classification approximate. No IP addresses, visitor cookies, full user agents or full referrer URLs are stored. Historical static/GitHub QR images cannot acquire QR-specific measurement retroactively. Retained events are capped at 90 days; measured zeroes and unavailable/unmeasured data are distinct.

Pruning is bounded and may require multiple hourly passes for a large backlog; reports exclude expired events immediately. The dashboard exposes pending pruning and recent stored events. Operators must inspect Cloudflare logs and actual D1 usage/billing during the pilot; no unlimited/free-at-any-scale claim is made. Planned pauses close company coverage periods before a global switch. Emergency outages must be recorded before resuming, as described in the runbook.

Employee profiles, Wallet, CRM, campaigns and routing extensions are not implemented or advertised as working by this release.

## Company assignment and brand follow-up

Ordinary accounts now open one assigned company automatically. There is no ordinary company picker; platform-admin switching is restricted to explicit memberships. The backend rejects conflicting workspace headers, a second-company invitation and approval after a different invitation assignment. Competing invitation acceptance assigns only one company. Ambiguous old multi-company accounts fail closed for administrator review; no records are deleted. A read-only production preflight found no existing multi-company accounts affected by this policy. No database migration was needed.

All 28 backend tests passed. Enterprise desktop/mobile browser checks passed with assertions for assigned identity, hidden picker, forged-header rejection, matching TinyTrail accent/radius tokens, existing link/QR/bulk flows and exports. Analytics browser checks passed for tracked output decoding, CSV counts and sign-out privacy. Screenshots confirmed full-width mobile link panels and visible wrapping navigation. Final staging and production browser checks found the shared theme at 200, matching orange/4px tokens, no anonymous picker, private APIs at 401 and legacy JSON absent at 404. Firebase delivery and actual customer sign-in were not independently tested.

## Personal accounts follow-up

Migration 0005 and personal account support are deployed. See `PERSONAL_ACCOUNTS.md` for the ownership contract, free pilot limits, backup and rollback details. The personal workspace is private to the verified user and does not count as an additional company assignment. Company joins do not share or move its records. Existing company access, original URLs and analytics behavior are preserved.

All 31 backend tests passed. Updated enterprise browser checks verify personal creation without approval, private QR saving, and separation after switching to the assigned company; existing analytics and export checks also passed. Final production smoke checks passed for both pages, theme and anonymous API gates. Production lists all five migrations, eight original links and no foreign-key violations. No synthetic accounts or events were inserted into production. Actual Firebase email delivery remains unverified by the simulated browser harness.
