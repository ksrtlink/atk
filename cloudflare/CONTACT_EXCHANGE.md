# Voluntary contact exchange

Implementation is prepared and tested. Public collection remains disabled pending the separate contact-details policy decision. Anonymous analytics approval does not activate personal-data collection. No CRM is connected and submitting a form sends no email or other outbound message.

## Contract and permissions

A published staff card can offer Share your details. Viewing the card and Save contact never require a submission. Required fields are name (100 characters) and email (254); optional organization (120), phone (50) and message (1000). The form clearly identifies the receiving public profile and any saved event.

Proposed policy contact-exchange-v1: receiving person and workspace owners may follow up on the conversation; details expire after 90 days; explicit required consent does not subscribe the visitor to marketing. The exact statement, version, acceptance time, expiration, receiving profile/workspace and validated event snapshot are stored with each accepted contact. Policy text is versioned in source and cannot be customized to silently change the purpose.

| Actor | Allowed |
| --- | --- |
| Anonymous visitor | Read published card, voluntarily submit to an enabled published card |
| Receiving assigned employee | Read inbox, export, mark new/reviewed, delete; read event links |
| Workspace owner (including personal-account owner) | Same inbox actions; enable/disable collection and create/deactivate event links |
| Unassigned member / another workspace | No inbox, export, report or configuration access |

All private routes use existing verified Firebase identity and server membership checks. Each query additionally scopes the stored receiving profile and workspace. Employee reassignment changes access through the current stored assignment. Disabled/unpublished cards accept no submissions. Owner disable invalidates outstanding forms; draft/public URLs and original QR identities are preserved.

## Persistence and attribution

Migration 0013_contact_exchange.sql adds separate settings, event links, contact submissions, receipt and abuse-limit tables, and anonymous submission events. An event is created by an owner against one profile/workspace. Event-specific URLs reuse /people/:slug?event=:id; they do not duplicate the person. Arbitrary, inactive, foreign-workspace or mismatched-profile event identifiers are rejected. Event version and profile/settings versions are bound into the signed form so changed contexts require a reload. Event attribution describes the submitted event link, not proof of attendance.

Submission, one-time receipt, abuse counters and optional anonymous contact_submission event commit in one D1 batch. A failed write rolls everything back. Retries return confirmation without duplicate records or counters. Deleting contact details does not let an old valid form recreate them. Anonymous events contain no submitted fields and are recorded only when both deployment and workspace analytics are enabled. They have their own kind and never inflate link/QR visit totals. Reports use completed UTC intervals and describe available enabled periods; contact collection start is recorded separately from earlier analytics activation.

Inbox pages use stable timestamp/ID cursors (50 contacts per page). CSV export reads bounded 500-contact pages with stable timestamp/ID cursors; the UI combines them into one download and stops if the account/workspace changes. Direct CSV API consumers follow the returned next-cursor headers. It quotes fields and protects spreadsheet formulas across all submitted/event/consent text. Review and deletion require saved versions. CSV and all private/public form responses are no-store. The UI clears inbox content on account/workspace reset, including pending asynchronous responses.

## Abuse and retention controls

Forms use server HMAC-signed tokens with canonical origin, profile, settings, event, policy and nonce binding; a two-second minimum age and 30-minute lifetime. POST requires same-origin Origin, form encoding, explicit consent, a blank honeypot, unique supported fields and a streamed 16-KB body limit. Public error pages explain retry/reload without reflecting submitted details.

Pilot limits are ten accepted submissions per IP/hour and 100 per receiving profile/UTC day. Only keyed HMAC bucket identifiers are stored; raw IPs, full user agents and cookies are not stored by this feature. IP keys rotate hourly and expire at the next hour; profile quota keys expire at the next UTC day. Pruning runs hourly even when collection is disabled. Receipts expire with their signed form. Contact details are excluded from inbox/export immediately at expiration, then physically pruned in bounded batches. Anonymous submission events follow the separately approved analytics retention. High-volume/NAT conference behavior and quota sizing should be reviewed for the pilot before broad adoption. No challenge provider or notification channel has been added speculatively.

## Activation and rollback

Three deployment conditions must all be satisfied: CONTACT_EXCHANGE_ENABLED=true, CONTACT_EXCHANGE_POLICY=contact-exchange-v1 and a server-only CONTACT_EXCHANGE_SECRET with at least 32 characters. Owner opt-in is additionally required per card. Defaults are disabled/blank, and absent secrets fail closed. Provision a cryptographically random signing secret with Wrangler secrets; never put it into browser bundles, repository configuration, chat or exports. Secret rotation invalidates outstanding forms; existing contacts remain readable once the new deployment is correctly configured.

Before activation obtain the separate policy approval and review the declared fields/access/retention and pilot limits. Capture a D1 Time Travel recovery bookmark, apply the additive migration in staging first and verify permissions, forms, exports, pruning and foreign keys. Deploy compatible code with collection disabled. After approval, provision the signing secret and enable the approved policy flag, then opt in a controlled card and check real submissions/counts. No automatic CRM delivery is implied. A selected CRM still needs actual provider credentials, mapping, retry/deletion handling and acceptance tests.

To stop collection set CONTACT_EXCHANGE_ENABLED=false and redeploy. Public forms disappear and POST rejects. Retention pruning must continue. Leave additive tables and issued profile/QR URLs intact. Revert compatible Worker code if necessary; do not reverse migrations by deleting records.

## Verification evidence

111 registered tests pass: existing regressions plus consent/version binding, strict field/body/origin validation, signed-token age/expiry/tamper rejection, workspace/employee restrictions, event ownership, transaction rollback, idempotency and delete/replay prevention, quotas, safe CSV, expiry/pruning, pagination, exports beyond 500 records and UTC report boundaries. The build passes. Browser checks use actual local form tokens and native browser requests, review/delete/cancel, CSV contents and desktop/mobile inbox layouts. Existing link, QR, staff, routing, resource and analytics browser checks also pass.

An isolated temporary Cloudflare Worker exercised the actual module with staging D1 and synthetic-only fixed inputs: native HMAC token creation/verification, atomic persistence/retry, event provenance, 90-day timestamps, private owner/member scopes, CSV, deletion/replay prevention and exactly one anonymous submission event all passed. This probe did not substitute for Firebase auth tests or activate collection on the staging app. Staging migration 0013 was applied with app collection disabled. Temporary fixture cleanup and final production rollout evidence are recorded below when verified.

The native browser form regression (tests/browser-contact-form.mjs) passes at desktop/mobile sizes, including built-in required-field checks, actual form POST and 303 confirmation, and private persisted results. This exposed and fixed a browser-specific Origin:null issue: form pages use Referrer-Policy:same-origin, while the server continues rejecting null/cross-origin POST. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy . Synthetic staging contacts, receipts, abuse buckets and the temporary runtime Worker were removed; foreign-key checks passed.

Production migration 0013 and Worker 9cebe0e0-71c2-4d65-adb2-ca1ad2d7127c deployed with CONTACT_EXCHANGE_ENABLED=false and a blank policy flag. Production has zero contacts and zero opted-in cards, public exchange GET/POST return 404, the private inbox rejects anonymous requests and foreign keys are clean. Staging final Worker 77fde16b-a986-406f-85fa-65a01191da34 also remains disabled. The staff-card engagement UI now reads the actual analytics coverage fields instead of an undefined enabled field.

The disabled-card inbox remains accessible to authorized owners/assigned employees. The browser regression covers reopening it after card deactivation and removing it on privacy reset. Export pagination is verified across 507 contacts with one CSV header and no missing addresses. Final deployed contact UI asset hashes match the tested build; collection flags and anonymous-access gates were rechecked in both environments.
