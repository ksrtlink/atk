# Full-plan execution status

The user explicitly included staff features on 19 October 2026. This checklist preserves the complete objective; finishing one feature does not mean the whole plan is complete.

| Workstream | Current evidence / remaining work |
| --- | --- |
| Links, QR styling/exports, bulk, personal/company accounts, analytics | Deployed; existing verification records and registered regressions |
| UTM builder | Deployed; UTM_BUILDER.md |
| Resource pages | Deployed; migration 0007, staged edge/count checks, production asset/API checks and foreign-key verification passed; RESOURCE_PAGES.md |
| Scheduled destinations | Implemented: migration 0008; explicit timezone and DST validation, deterministic boundaries/fallback; 59 registered tests and staged /r + /q edge checks passed |
| Country/language routing | Implemented: ordered country/language rules, unknown fallback, linked QR resolution, no-store + Vary response; staged language and fallback checks passed |
| Link health | Implemented and verified in staging: opt-in bounded checks across all saved routing targets, network boundary guards, distinct status states, leases/quotas and no engagement pollution; 97 registered tests and actual scheduled/runtime checks passed; LINK_HEALTH.md. Production migration 0012 and Worker c2ba9c61-90a1-4539-9820-2bb98390d473 deployed |
| Employee profiles/contact files/QRs/admin | Core deployed: migration 0009, owner/assigned-employee permissions, draft/public separation, stable QR, vCard, opt-in funnel events; STAFF_CARDS.md. Company templates and import added in migration 0010. Portrait storage/upload deployed with migration 0011 with private drafts and bounded metadata-free PNGs; actual iPhone/Android contact-import gates remain |
| Employee import/signatures/meeting backgrounds/print cards | Company templates and resumable CSV employee import implemented (71 tests, browser import/export checks); signature HTML/copy, 1920×1080 meeting PNG and 85×55mm print PNG/PDF implemented with published snapshots and decoded export/PDF checks; actual email-client/meeting-app and physical print checks remain |
| Apple Wallet | New paid setup deferred by user on 20 October; future issuer/signing/update and iPhone acceptance remain open |
| Google Wallet | Admin-only server connection check prepared with signed OAuth, fixed-host class access, bounded/redacted errors and disabled defaults; 129 registered tests and native signing probe passed. Real issuer access, issuance/update implementation and Android validation remain pending; WALLET_SETUP.md |
| Contact exchange/events/inbox/export | Implementation prepared: migration 0013, signed voluntary forms, validated event links, scoped inbox/review/delete/CSV, abuse limits and independent retention; 111 registered tests, browser checks and deployed-runtime/D1 checks passed. Production migration 0013 and Worker 9cebe0e0-71c2-4d65-adb2-ca1ad2d7127c initially deployed with public collection disabled. Policy and metadata retention now approved; full staging signed submission/idempotency/count checks passed; activation evidence in CONTACT_EXCHANGE.md |
| CRM integration | HubSpot selected; user confirms no account set up yet. Authorized tenant connection, integration implementation and retry/deletion acceptance remain pending; HUBSPOT_SETUP.md |
| Owner activity records | Implemented: metadata-only transactional audit records, owner-only Activity view and private cursor API, pause-aware rollback and 90-day retention; 122 registered tests, desktop/mobile and deployed D1 trigger/rollback/index checks passed. Production migration 0014 and Worker 48cf955c-60ae-4b59-93c1-3461464723d5 deployed; ACTIVITY_AUDIT.md |
| Monitoring and notifications | Operational health/runbooks required for each release; external recipients/channels require explicit authorization |

Keep the main IMPLEMENTATION_PLAN.md acceptance gates and compatibility/security rules. Do not claim Wallet/CRM is working without provider/device evidence. Continue independent work when provider setup is missing.

Decisions updated on 20 October 2026: Google first, paid Apple enrollment deferred, contact-exchange-v1 including metadata retention approved, and HubSpot selected. The user confirms both provider accounts are not set up yet. Contact activation evidence is in CONTACT_EXCHANGE.md; Wallet remains disabled and HubSpot remains unconnected. See REMAINING_ACCEPTANCE.md for exact unfinished implementation and required inputs. No remaining provider/device acceptance gate is marked complete.

Approved contact availability deployed on 20 October: production Worker 1195b367-f0ac-4400-b1cc-1a2d1e7f9971, staging cd9bf5dd-3624-4bc3-9cfe-711e01e4d6ec. All 129 registered tests pass. Signed staging form, consent/origin rejection, persistence/idempotency/retention/activity/disable checks and production guards passed; no cards were opted in automatically and no synthetic production records were created.

Sign-in and presentation update, 20 October: dedicated /signin/ split visual/form page, verified homepage account state/dashboard entry, guest/verification guards and history-restoration privacy, plus collapsed optional card fields and card/resource engagement. Production Worker 6cf02975-cff6-4f75-aedc-c5b3b557943b; 130 registered tests and focused sign-in, full enterprise and analytics browser suites passed. Details: SIGNIN_REDESIGN.md. Existing Wallet/HubSpot/provider and device gates remain open.

Homepage visual refresh, 21 October: companion orange/white 3D illustration, shorter hero copy and full-width link/QR tools below the hero. Responsive 1440/768/390/320 layouts, reduced motion, QR draft handoff and existing sign-in browser checks passed; staging/production smoke checks passed. Production Worker 22480a53-6038-4d90-a24a-947de1999f6f. See LANDING_VISUALS.md; all provider and device gates remain open.
