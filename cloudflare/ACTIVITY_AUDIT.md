# Owner activity history

The plan's audit-record entity is implemented in migration 0014_activity_audit.sql. Activity is private to the current workspace owner, including an individual account's personal workspace. Company membership alone does not grant access; platform-admin status does not bypass this endpoint's owner check. The read-only /api/activity endpoint uses the existing verified identity and workspace resolution, then independently requires owner role.

## What is recorded

Each record contains an opaque ID, workspace, actor UID/kind, action, item type/identifier/version and UTC timestamp. It never copies destination URLs, query strings, titles, profile drafts, photos, submitted contact fields, consent bodies, tokens, cookies, IP addresses or user agents. The owner API resolves current account labels from the users table when reading; names/emails are not historical snapshots stored in the log. Deleted accounts fall back to a former-account label while the opaque actor identifier remains until retention expires.

Covered mutations: link create/edit/Trash/restore/transfer; QR design create/edit/transfer; tracked QR create/update/disable/activate; staff-card and resource revision actions including publication and portraits; destination rules; card templates; preset creation; bulk and staff-import start; analytics opt-in/out; contact-collection settings, event-link creation/activation, accepted contacts, review status and deletion. Starting a job is not a claim that all its rows succeeded. Public visits, page reads, audit reads, automatic network health checks, retention deletion, authentication and membership administration are not emitted as these asset activity events. This is an asset activity trail, not an independent security-event/SIEM product.

Ordinary edits are captured through SQLite triggers in the same transaction as the successful row/revision change. Revision insertion already checks the source mutation token/version, so failed or stale edits do not acquire successful activity. Contact deletion inserts metadata and deletes the submitted fields in one D1 batch with the same workspace/profile/version predicate. Audit storage failure rolls back the actual action. Creation retries reuse existing records and do not emit duplicate activity. Collection changes and QR/event edits now pass the current server-verified actor explicitly; the request body cannot choose that actor.

Database administrators remain trusted. They can change tables/triggers, and directly issued SQL does not prove a human application identity. Use the authorized app APIs for attributed edits. This log is not advertised as tamper-proof or an independent compliance archive.

## UI and retention

Owners get Activity in the existing navigation. Records have a compact, keyboard-scrollable table, 7/30/90-day and item-type filters, and stable 50-row cursor pages. A database-clock snapshot avoids dropping a just-written event due to a Worker/database clock difference. Filters, paging errors and retries have explicit empty/loading/error states. Sign-out, workspace changes and losing owner role clear the private view and invalidate pending render work. No unsupported company selector is added for individuals.

The UI reports when recording began and does not reconstruct earlier activity. Audit metadata is retained for 90 days, independently of engagement settings. Queries exclude expired records immediately; the hourly maintenance job physically prunes bounded batches. Audit recording does not create link/QR engagement events. No outbound notification, new paid service or dependency was added. Additional writes and indexes consume the existing D1 allowance; review actual database metrics as usage grows.

The shared hourly job passes an explicit two-batch limit to each retention task. The forced-full-batch regression exercises at most 25 binding queries for the combined job, below the D1 Free per-invocation ceiling. Existing individual prune functions keep their standalone defaults. Audit/analytics backlog and pruning errors emit metadata-only operational diagnostics; investigate pending rows or errors before changing batch budgets. Public contact collection remains disabled pending its separate policy approval.

## Recording controls and rollback

The operator-controlled audit_policy row records enabled state, initial start, pause count and last pause time. There is no writable app endpoint. The owner UI discloses current and previous pauses. Retained records remain readable and retention continues while recording is paused.

Before rolling the Worker back to code that does not pass all actor fields, pause capture with an authorized D1 operator command:

UPDATE audit_policy SET enabled=0 WHERE id=1;

Then deploy the previously verified compatible Worker/assets. Keep the additive schema, data and all issued redirect/profile/QR routes. After redeploying the current actor-aware code, resume using UPDATE audit_policy SET enabled=1 WHERE id=1; and verify a controlled mutation. A pause is a real recording gap; never fill it with fabricated historical activity. Do not drop tables/triggers as a routine rollback.

## Evidence and rollout

122 registered tests pass. New checks cover actor/action/version metadata, personal/company isolation, forbidden member/anonymous/unverified access, unsupported filters, replay/stale writes, audit-trigger failure with actual asset rollback, contact-delete rollback, omission of private payloads, cursor/type filtering, current account labels, retention, recording pause/resume and the combined maintenance query budget. Existing links, QR exports, staff profiles, contact exchange and analytics tests remain registered.

The desktop/mobile browser suite checks the real owner view, filtering, Next/Previous, error recovery, private URL omission and sign-out clearing, alongside existing app regressions. A temporary deployed Worker exercised the actual module with staging D1: create/edit/Trash/restore triggered correct metadata, a scoped audit failure rolled back the asset update, member access was rejected, expired metadata was pruned and EXPLAIN QUERY PLAN on the actual API query used audit_workspace_time plus the users primary-key index. The probe only used synthetic fixed inputs; it did not substitute for existing Firebase signature tests.

Migration 0014 was applied in isolated staging before production. Capture a D1 Time Travel bookmark before the production migration. Confirm foreign keys, deployment asset hashes, anonymous 401 gates, recording policy and continued contact-collection disablement. Clean up temporary Workers and synthetic data. Deployment identifiers and final cleanup checks are appended after verification.

Primary platform references: https://developers.cloudflare.com/d1/sql-api/sql-statements/ and https://developers.cloudflare.com/d1/platform/limits/ . Runtime staging results, rather than documentation alone, establish the trigger/rollback and query-plan behavior above.

Production migration 0014 and Worker 48cf955c-60ae-4b59-93c1-3461464723d5 deployed. Final staging Worker 05790a48-065d-4797-9c01-a3d8ee9555d2 and production assets match the verified build. The Activity API rejects anonymous requests, public contact collection remains disabled, and the synthetic staging data/scoped failure trigger/temporary Worker were removed. The focused browser regression additionally checks real UI sign-in with local signed test identity, horizontal/vertical table containment, unbroken headers and sign-out clearing.
