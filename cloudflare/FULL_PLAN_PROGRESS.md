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
| Apple Wallet | Pending issuer credentials, signing/update implementation and actual iPhone validation |
| Google Wallet | Admin-only server connection check prepared with signed OAuth, fixed-host class access, bounded/redacted errors and disabled defaults; 129 registered tests and native signing probe passed. Real issuer access, issuance/update implementation and Android validation remain pending; WALLET_SETUP.md |
| Contact exchange/events/inbox/export | Implementation prepared: migration 0013, signed voluntary forms, validated event links, scoped inbox/review/delete/CSV, abuse limits and independent retention; 111 registered tests, browser checks and deployed-runtime/D1 checks passed. Production migration 0013 and Worker 9cebe0e0-71c2-4d65-adb2-ca1ad2d7127c deployed with public collection disabled pending separate policy approval; CONTACT_EXCHANGE.md |
| CRM integration | Pending actual company-selected provider, authorized credentials and retry/deletion acceptance checks |
| Owner activity records | Implemented: metadata-only transactional audit records, owner-only Activity view and private cursor API, pause-aware rollback and 90-day retention; 122 registered tests, desktop/mobile and deployed D1 trigger/rollback/index checks passed. Production migration 0014 and Worker 48cf955c-60ae-4b59-93c1-3461464723d5 deployed; ACTIVITY_AUDIT.md |
| Monitoring and notifications | Operational health/runbooks required for each release; external recipients/channels require explicit authorization |

Keep the main IMPLEMENTATION_PLAN.md acceptance gates and compatibility/security rules. Do not claim Wallet/CRM is working without provider/device evidence. Continue independent work when provider setup is missing.

Remaining provider/policy/device gates were revalidated on 20 October 2026: issuer/class configuration is absent, production Wallet secrets are not provisioned, contact collection is off, and CRM is unselected. See REMAINING_ACCEPTANCE.md for exact unfinished implementation and required inputs. No remaining provider/device acceptance gate is marked complete.
