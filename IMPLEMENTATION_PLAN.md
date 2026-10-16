# TinyTrail implementation plan and execution rules

Status: Release 1 implemented and deployed on 16 October 2026; see `cloudflare/RELEASE1_CONTRACT.md`, `cloudflare/RELEASE1_EVIDENCE.md` and `cloudflare/RELEASE1_RUNBOOK.md`. Releases 2–5 remain specifications.  
Prepared: 16 October 2026.  
Purpose: extend the existing company platform with reliable analytics, employee business cards, Wallet passes, and campaign services.

This document reduces ambiguity and provides verification gates. It does not guarantee error-free implementation. A feature is complete only when its acceptance checks pass with recorded evidence. User instructions take precedence over this plan.

## 1. Product outcome and release order

Build one company platform for sharing links, employee identities, QR codes, and resources, with consistent engagement reporting.

| Release | Deliverable | Dependencies |
| --- | --- | --- |
| 1 | Tracked links and QR codes, analytics dashboard, CSV reports | Existing Worker, D1, authentication, workspace membership |
| 2 | Employee profiles, contact downloads, employee QR codes, basic administration | Release 1 tracking and permissions |
| 3 | Apple Wallet, validated Google Wallet integration, employee imports, signatures, meeting backgrounds | Stable published profiles; issuer credentials for each Wallet provider |
| 4 | Contact exchange, event attribution, selected CRM integration | Profiles, analytics, consent and access controls |
| 5 | Resource pages, scheduled destinations, regional routing, link monitoring | Stable asset model, destination resolution, operations |

Implement one release at a time. Split releases into reviewable changes. Do not implement speculative integrations, install unrelated tools, or redesign unrelated areas. A blocked Wallet or CRM provider must not block independent work in the release.

## 2. Verified starting point

These are source observations as of the preparation date. Inspect the current files again before editing; paths and behavior may change.

- `cloudflare/src/worker.mjs`: `/r/:slug` currently looks up the destination and returns a no-store 302 without storing an engagement event.
- `cloudflare/src/domain.mjs`: validates destinations and QR settings; QR designs can encode arbitrary approved HTTP(S) URLs.
- `cloudflare/migrations/0001_schema.sql`: defines users, links, and QR designs.
- `cloudflare/migrations/0002_original_links.sql`: imports the original links.
- `cloudflare/migrations/0003_enterprise.sql`: adds workspaces, owner/member roles, invitations, presets, and bulk jobs.
- `cloudflare/ui/app.mjs` and `cloudflare/ui/bulk.mjs`: manage company links, designs, and bulk workflows.
- `cloudflare/wrangler.jsonc`: configures Worker routing, static assets, D1, and public origin. New public routes must be checked against static asset routing, including `run_worker_first`.
- `cloudflare/package.json`: defines build, tests, local development, deployment, and database commands.
- `cloudflare/scripts/test.mjs`: currently imports auth and enterprise tests. New tests must be registered in the actual test entry point or an explicitly documented runner; merely creating a test file does not run it.

REA research is in `../analysis/bitly/`. Its public Bitly capture parsed 10 scripts without parse failures but found no endpoint candidates within those captured scripts. It did not inspect an authenticated analytics dashboard or recover server code. Bitly documentation supplied feature requirements; it did not establish Bitly's internal implementation.

REA is a local investigation tool. Do not add REA, its evidence files, or its runtime dependencies to the production application bundle.

## 3. Non-negotiable compatibility and security rules

1. Preserve existing short URLs, printed QR destinations, original eight GitHub redirect folders, and existing account/workspace flows.
2. Do not rewrite old migrations. Add forward migrations after checking which migrations exist at implementation time.
3. Do not infer production state from source. Inspect deployment configuration and the database migration state before rollout.
4. Do not claim historical traffic exists. Measurement starts when instrumentation is enabled.
5. Never show unmeasured legacy traffic as a measured zero. Display its tracking status and instrumentation start date.
6. Authorize every private query, export, update, and background operation using server-verified identity and workspace access. A client-supplied workspace ID is not authorization.
7. Derive workspace ownership from stored records and verified membership. Reject asset IDs belonging to another workspace, including IDs submitted in bulk operations.
8. Preserve current owner/member semantics. Any new role or privilege requires an explicit permission matrix and migration; never silently grant all members administration rights.
9. Keep signing keys, CRM credentials, service tokens, and private keys out of browser code, repository files, logs, and downloadable exports.
10. Treat names, profile text, uploaded files, URL parameters, referrers, and remote content as untrusted input. Use parameterized SQL and safe DOM rendering.
11. Preserve established destination-validation rules. New redirect types must not bypass protocol, credential, loop, and length checks.
12. Do not deploy production changes merely because tests pass. Complete the staged rollout and any approval required by the user or execution environment.

## 4. Measurement contract

Use these definitions consistently in API responses, dashboard labels, exports, and tests.

| Event | Meaning | What it does not prove |
| --- | --- | --- |
| `link_visit` | Successful eligible GET through a tracked short-link route | A unique person or destination page load |
| `qr_visit` | Successful eligible GET through a QR-specific tracked URL | A physical scan; the same URL can be copied or previewed |
| `profile_view` | Eligible public profile document request recorded under the declared request policy | That a human read the page |
| `contact_download` | Server served the contact file successfully | That the recipient saved it |
| `profile_action` | Accepted first-party action signal for an allowed button | Completion of an external call, email, or booking |
| `contact_submission` | Valid contact-exchange submission persisted successfully | Marketing consent beyond the consent explicitly submitted |

- Short links use `/r/:slug`; new tracked QR codes use `/q/:opaqueId`. Use an unguessable, immutable identifier independent of employee names and design titles.
- One `/q/` redirect produces one QR visit, never an additional link visit because its target is a linked short-link record. Resolve the destination internally to avoid a second tracked redirect.
- A QR visit that leads to a profile may be followed by a profile view. Those are different funnel stages. Default combined engagement totals count link and QR visits only; never sum every event type into one unexplained number.
- Do not record visits for HEAD, missing/disabled assets, failed redirects, known prefetch requests, or recognized automated traffic under the selected filter policy.
- Bot and device detection are approximate. Version the filter rules and show unknown categories rather than inventing classifications.
- For Release 1, do not implement unique visitors, fingerprinting, or cross-session identity estimation.
- Store UTC timestamps. Release 1 reports use UTC and display that explicitly. Date intervals are inclusive at the start and exclusive at the end. Compare against an immediately preceding interval of equal duration. Return a null percentage with a clear label when the prior count is zero.
- Missing referrer means unknown/direct combined, not proof of a manually typed URL. Store only normalized hostnames, never full referrer queries or paths.
- Geography is approximate edge-provided metadata and may be absent. Do not derive identity from location.
- Mark instrumentation start times so a request for an earlier period is shown as partial coverage.

## 5. Architecture and data ownership

Keep Cloudflare Workers, D1, and Firebase authentication initially. Extend existing code and shared validation instead of creating a parallel application or a second authentication system.

Proposed records are responsibilities, not permission to generate an unreviewed schema. Write and review the concrete migration and query contracts before implementation.

| Record | Required responsibilities |
| --- | --- |
| Tracked QR asset | Immutable ID, workspace, optional design/link/profile relationship, tracking state, creation time, version, and valid destination resolution |
| Campaign | Workspace, name, optional event metadata, asset associations |
| Engagement event | Event ID, workspace, immutable asset identity, type, UTC timestamp, coarse dimensions, filter version |
| Employee profile | Immutable ID, workspace, optional linked user, public slug, approved public fields, publication status, version |
| Wallet issuance | Provider, profile ID, stable provider serial/object ID, issuance/update state; no public access to device registration tokens |
| Contact submission | Workspace, receiving employee/profile, submitted fields, consent statement/version/time, retention metadata, processing state |
| Audit record | Actor, workspace, action, affected record, timestamp; exclude unnecessary personal data and secrets |

Requirements:

- Separate QR appearance from its tracked destination. Changing colors must not create a new tracking identity.
- Give destination ownership one source of truth. For a QR linked to a short-link record, resolve that record's current destination; do not keep a stale duplicate.
- Preserve issued identifiers. Define safe soft-deletion and disabled-state behavior instead of reassigning old IDs to new assets.
- Index workspace/time and asset/time queries. Verify query plans on representative data.
- Establish an append-only event approach with unique event IDs. Background retries reuse an event ID to avoid duplicate insertion; separate HTTP requests remain separate visits.
- Client action signals are forgeable. Validate event kinds, asset relationships, payload sizes, and rate limits; do not treat them as authoritative conversions.
- If aggregates are introduced, use explicit idempotent processing and watermarks. Never union raw and rolled-up windows in a way that double-counts them.
- Proposed Release 1 defaults: retain raw engagement events for 90 days; allow reporting over retained data with a maximum 90-day interval. Confirm the workspace policy before production and implement pruning. Do not promise indefinite history.
- Contact submissions need a separate documented retention policy before that feature launches.
- Avoid raw IP, full user-agent, cookies, and identifying URL parameters in persisted analytics. Keep coarse parsed dimensions and unknown values.

## 6. Release 1 — tracked links, tracked QR codes, analytics

### Implementation sequence

1. Record baseline behavior and run the existing build/tests.
2. Define schema, event/filter contract, API shape, retention, and feature flags. Apply migrations to a local database containing existing-format records.
3. Add event collection to `/r/` and destination resolution for `/q/`. Update the Worker handler signature if needed to use the execution context.
4. Use `ctx.waitUntil` for bounded writes, catch failures, and emit structured operational errors without secrets. This is best-effort collection, not a durable delivery guarantee. Do not block redirects on analytics failure.
5. Add explicit tracked/static QR modes. Create the tracked record before export and encode its stable `/q/` URL. A static external-destination QR must be labeled untracked.
6. Implement the same behavior in individual and bulk generation. Retries must not allocate duplicate assets for one idempotent creation request.
7. Add authenticated workspace reporting endpoints and CSV export.
8. Add overview and asset-level analytics to the current UI using its established styles, loading, empty, error, and access-denied states.
9. Add monitoring, pruning, and usage checks. Move collection to a queue only if measured load/reliability justifies it; account for retries and dead-letter handling if introduced.

### API contract to finalize before coding

- `GET /api/analytics`: explicit UTC `from`, `to`, allowed event/channel filter, optional authorized asset/campaign, bounded result size.
- Response: instrumentation coverage, totals, zero-filled daily series, equal prior-period summary, ranked assets and dimension breakdowns, timezone, and filter policy version.
- Return correct HTTP status and useful structured errors for malformed ranges, oversized windows, inaccessible assets, and storage failure.
- Separate unavailable data from empty data. A failed query must not return plausible zero totals.
- CSV must use the same scope and filters as the dashboard. Escape delimiter/quote/newline content and neutralize spreadsheet formulas in text cells. Test leading whitespace and formula markers.

### Acceptance gate

- [x] Real local Worker request through `/r/` produces one link event.
- [x] `/q/` produces one QR event and no second link event.
- [x] HEAD, 404, disabled assets, and selected prefetch/bot cases do not count.
- [x] A forced analytics storage failure still returns the correct redirect and produces an operational failure signal.
- [x] Destination edits preserve issued QR URLs and resolve to the current destination.
- [x] Workspace A cannot read workspace B through filters, asset IDs, exports, or bulk requests.
- [x] Date boundaries, missing days, empty periods, unknown dimensions, prior-zero comparisons, and partial instrumentation coverage are correct.
- [x] Exported individual and bulk QR images decode to the intended stable URLs.
- [x] Legacy assets clearly distinguish untracked from measured zero.
- [x] Counts are real stored events; no demo numbers, random trends, or fabricated percentages appear in production.
- [x] Worker/static routing serves the new routes correctly in a staging deployment.

## 7. Release 2 — employee digital business cards

### Product and permissions

- Public profile route proposal: `/people/:publicSlug`; contact download route resolves the same published profile.
- Fields: photo, name, optional pronunciation, title, department, approved phone/email, LinkedIn, office, introduction, booking URL, selected resources.
- Workspace owners manage templates, publication, assignment, and deactivation. Linked employees edit only specifically permitted fields on their own profile. Existing workspace members receive no automatic access to other employees' private data.
- Store public and administrative fields separately in API serializers. Public routes must never return user IDs, private email alternatives, internal notes, or workspace membership lists.
- Draft, published, and disabled states must be explicit. Disabled cards must not expose contact downloads or issue new passes.
- Public slugs are unique in their selected namespace; immutable internal IDs remain independent of slugs. Do not recycle old public identities to unrelated employees.
- If photos require storage, establish a supported storage binding, upload limits, allowed formats, verified content types, and safe rendering. Never assume an unconfigured upload service exists.

### Contact file requirements

- Use a supported vCard format and `text/vcard` response with a safe filename.
- Correctly escape text, handle international phone numbers and Unicode, and serialize/fold lines using a tested implementation.
- Exclude internal fields and unsupported content. Apply publication/disabled checks on the server.
- Treat the response as a contact download event, not confirmed contact creation.
- Profile changes affect future downloads; existing address-book contacts do not automatically update.

### Acceptance gate

- [ ] A visitor can view a published profile and download a contact without creating an account.
- [ ] Draft/disabled/private data cannot be obtained through alternate endpoints or guessed IDs.
- [ ] Owners and linked employees have the intended permissions; cross-workspace edits fail.
- [ ] Actual iPhone and Android contact import is checked, including non-Latin names, punctuation, multiple fields, and long values. Record device/browser versions. Emulator-only checks must be labeled accordingly.
- [ ] Profile QR codes use tracked asset identities with accurate funnel reporting.
- [ ] Mobile accessibility, keyboard use, screen-reader labels, contrast, and long-content layouts are checked.

## 8. Release 3 — Wallet and company distribution

### Apple Wallet

Before coding, verify current Apple documentation, pass layout constraints, signing requirements, certificate lifecycle, and distribution/update behavior.

- Create a valid pass type identifier and signing certificate using the company's issuer account. Credentials must be provisioned through an approved secret mechanism.
- Produce a correctly signed `.pkpass` with appropriate response headers and approved branding. Show only fields supported by the actual pass style.
- Encode the stable profile QR URL. Do not encode private administrative URLs, auth tokens, or copied employee secrets.
- Employee pass issuance requires authorization. Public profile visitors get Save contact; they do not automatically get an employee's pass issuance privileges.
- Stable pass identity and serial number must survive updates. Reissuing the same employee pass must not generate uncontrolled duplicates.
- Implement the provider's authenticated registration/update endpoints and notification lifecycle if automatic pass refresh is promised. Avoid caching private pass responses publicly.
- Store the signing key server-side. If the Worker runtime cannot support the required signing operation safely, document and select a dedicated signing service before implementation; never move signing to the browser.
- Plan certificate expiry monitoring, rotation, issuance failures, and authenticated retry behavior.
- Deactivation disables the profile server-side immediately. An installed pass may remain on a device and offline content may persist; never promise guaranteed remote deletion.

### Google Wallet

- Verify current issuer onboarding, class/object model, supported pass types, signing, save flow, update permissions, and branding requirements independently.
- Do not reuse Apple package logic or assume identical capabilities.
- If issuer approval or credentials are missing, clearly report that integration as blocked. Do not deliver a fake Add to Wallet button or an unsigned placeholder.

### Bulk and distribution

- CSV import: preview, row-level validation, duplicate policy, dry run, bounded batch size, idempotent commit, and useful result export.
- Formula protection applies to all exported text, including names and titles.
- Generate email signatures without script, tracking pixels, or uncontrolled remote HTML. Verify the declared supported email clients.
- Meeting backgrounds and printable cards must use correct employee QR codes and decode at intended sizes.
- NFC tags use the existing stable public URL. Do not promise iPhone NameDrop or Wallet NFC behavior from a generic web pass.

### Acceptance gate

- [ ] Actual iPhone installs a valid Apple pass; its QR opens the right profile.
- [ ] Actual profile/pass field update is verified through the supported update service.
- [ ] Invalid signatures, expired credentials, unauthorized issuance, duplicate retries, and disabled profiles have tested failure behavior.
- [ ] Google integration is tested independently on an actual supported Android device before being marked complete.
- [ ] An administrator can import a batch, inspect errors, retry safely, and deactivate one employee without changing others.
- [ ] No pass keys, private registration tokens, or signed issuance credentials appear in client bundles or logs.

## 9. Release 4 — voluntary contact exchange and events

- Add a Share your details back form without requiring submission to view a profile or save its contact.
- Define submitted fields, purpose, consent wording/version, retention, access, deletion, and export behavior before launch.
- Validate on the server, rate-limit abuse, and add a supported challenge only if needed. Do not log submitted personal data unnecessarily.
- Store receiving profile, workspace, campaign/event, and consent provenance. Treat campaign IDs as untrusted and authorize associations.
- Define lead visibility explicitly. Default proposal: receiving employee and workspace owners; do not expose every submission to all members.
- Start with an authenticated inbox and CSV export. Select one CRM based on an actual company requirement; do not prebuild several integrations.
- CRM delivery must handle authentication, retries, duplicate prevention, destination field mapping, failure status, and deletion obligations. No outbound messages are sent merely because a form was submitted.
- Event-specific links reuse employee profiles and preserve separate campaign attribution without duplicating employee records.

Acceptance: voluntary submission persists once, consent and attribution are retained, unauthorized users cannot retrieve it, abuse controls work, export is safe, and CRM failure is visible without losing the original record.

## 10. Release 5 — campaigns and resources

- Resource pages: approved links/documents, revision history, stable QR, publication controls, no accidental exposure of internal files.
- Scheduling: explicit timezone, start/end boundaries, deterministic precedence, and a fallback when no rule applies. Evaluate destination rules server-side.
- Regional/language routing: explicit rules, safe default, correct cache variation, and unknown-location/language handling. Do not infer sensitive identity.
- UTM builder: parse URLs using a URL library, preserve unrelated parameters/fragments, and define whether existing UTM values are replaced.
- Link health: bounded background checks with sensible timeouts and status handling. Distinguish unreachable, blocked, and confirmed broken results.
- Health checks must not count as engagement. Defend server-side fetching against SSRF, including loopback/private/link-local addresses, redirects, IPv6, and DNS resolution changes. Do not build a generic unrestricted URL fetch endpoint.
- Notifications require the user's explicit authorization for the chosen channel and recipients; configure deduplication and frequency limits.

Acceptance: exercise rule boundaries, fallback behavior, unsupported inputs, SSRF cases, false-positive health responses, and campaign count reconciliation before enabling these services.

## 11. AI execution protocol

Every implementing agent or developer must follow this process.

### Before editing

1. Read this document, applicable `AGENTS.md` files, current code, and deployment notes. Do not assume the research snapshot still matches the application.
2. Inspect the working tree and preserve unrelated changes. Determine the actual Git root before issuing repository-wide commands; this checkout may sit inside a broader parent repository.
3. Name the release and exact acceptance criteria in scope. List affected files, migration changes, external dependencies, and unresolved decisions.
4. Verify current provider documentation for Wallet, authentication, Cloudflare services, or external APIs used by the change.
5. Run relevant baseline checks. Record existing failures separately from new failures.

### During implementation

1. Implement schema/domain contracts before wiring UI. Reuse server validation across single and bulk operations.
2. Keep public serializers separate from private data. Check permissions at the server boundary for each route.
3. Build real empty/error/disabled states. Never replace a missing integration with a successful-looking mock.
4. Avoid unrelated dependency upgrades, new frameworks, duplicate state stores, and architecture rewrites.
5. Preserve URLs and stable identities. Trace every new URL through generation, QR export, routing, resolution, tracking, and reporting.
6. Use feature flags where needed. Flags must have defined defaults and test coverage; disabling analytics must not disable redirects.
7. Do not swallow errors without observability. Redact secrets and personal data in diagnostics.
8. Do not leave unreachable code, commented-out alternatives, placeholder API responses, unresolved production TODOs, or fake buttons in delivered flows.
9. If a required credential or external decision is missing, finish independent work, document the exact dependency, and mark the dependent feature incomplete.

### Verification and reporting

1. Run tests that demonstrate observable behavior and security boundaries, not tests that merely repeat implementation expressions.
2. Include failure injection, two-workspace isolation, migration compatibility, and QR decoding where relevant.
3. Test real SQL/migrations in addition to mocked database tests. Test the local/staged Worker routing in addition to direct function calls.
4. Run the application build and inspect the changed UI in a browser at mobile and desktop widths. Use actual devices for provider-specific acceptance.
5. Inspect the final diff for unrelated changes, credentials, fixture/demo data, and generated files accidentally edited as source.
6. Report exactly what changed, checks actually run, failures, untested behavior, migrations, and deployment status. Never say a feature is complete if required device/provider verification is missing.

## 12. Build, test, and rollout procedure

Run application commands from `atk/cloudflare`, using a compatible Node runtime. The application currently requires Node >=22.13; verify the requirement again when dependencies change.

```powershell
npm test
npm run build
```

These are existing entry points, not evidence that every new test is included. Register added tests and verify their names/results appear in the output.

For local migration testing, use an isolated local D1 state; inspect current Wrangler persistence behavior first. The existing command is:

```powershell
npm run db:local
```

Do not confuse that command with `db:remote`, which changes the configured remote database. Existing deploy scripts target the configured account/domain; do not use them as a substitute for a separate staging environment.

### Required rollout order

1. Create a distinct staging Worker and D1 binding. Never point staging at the production database accidentally.
2. Inspect migration state and create a supported recoverable backup/export before production migrations.
3. Apply forward migrations in staging with representative old records. Validate record counts, foreign keys, indexes, and legacy URL behavior.
4. Deploy backward-compatible code with new collection/features disabled where appropriate. Smoke-test redirects, login, workspace access, creation, editing, and QR export.
5. Enable collection for a controlled test set. Verify persisted events against known requests and check write failures and D1 consumption.
6. Verify analytics, profile flows, and relevant Wallet/device cases in staging.
7. Present the concrete release, validation evidence, migrations, rollback approach, and unresolved limits for any required deployment approval.
8. Apply production migrations/deploy only under the user's authorization and environment permissions. Enable incrementally and inspect operational metrics.

### Rollback and recovery

- Prefer disabling a new feature or reverting compatible application code over deleting data or reversing a destructive schema change.
- Do not assume old Worker code tolerates new schema automatically; verify compatibility before deployment.
- Keep deployed `/q/` and profile URLs resolving after rollback once issued publicly. A rollback must not strand printed codes.
- Preserve recorded data when disabling collection. Document any collection gap and its reporting consequences.
- Define an emergency owner and runbook for redirect failures, database errors, credential expiry, and leaked signing credentials before Wallet production launch.

## 13. Release completion record

Copy this checklist into each release handoff. Check boxes only when verified.

- [ ] Scope and excluded work stated.
- [ ] Concrete schema/API/permission decisions documented.
- [ ] Existing URLs and workspace flows verified.
- [ ] Forward migrations tested against old-format data.
- [ ] Applicable acceptance gates passed with recorded results.
- [ ] New tests are actually executed by the declared commands.
- [ ] Build and browser checks passed.
- [ ] Real-device/provider checks passed, or feature explicitly held incomplete.
- [ ] No secrets, fabricated analytics, fake integrations, or unresolved production placeholders.
- [ ] Retention, pruning, monitoring, and failure behavior implemented where applicable.
- [ ] Deployment, migration, and rollback steps verified.
- [ ] Final report distinguishes local, staging, and production status.

## 14. Reference material

Verify current versions before relying on provider details.

- Local investigation and limitations: `../analysis/bitly/FINDINGS.txt`, `page-evidence.json`, and `bundle-evidence.json`.
- REA: https://github.com/morluto/rea
- Bitly analytics: https://bitly.com/pages/products/analytics/
- Bitly QR metrics: https://support.bitly.com/hc/en-us/articles/12203216582925-How-do-I-view-scan-data-for-a-Bitly-Code
- Bitly metric API concepts: https://dev.bitly.com/docs/tutorials/retrieve-metrics/
- Apple Wallet distribution/updates: https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass
- Apple Wallet identifiers/certificates: https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/

Release 1 is delivered; its verification and limits are recorded in `cloudflare/RELEASE1_EVIDENCE.md`. Further implementation starts with Release 2 as a separately scoped task; Releases 2–5 are not part of this deployment.
