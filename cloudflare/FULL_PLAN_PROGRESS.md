# Full-plan execution status

The user explicitly included staff features on 19 October 2026. This checklist preserves the complete objective; finishing one feature does not mean the whole plan is complete.

| Workstream | Current evidence / remaining work |
| --- | --- |
| Links, QR styling/exports, bulk, personal/company accounts, analytics | Deployed; existing verification records and registered regressions |
| UTM builder | Deployed; UTM_BUILDER.md |
| Resource pages | Deployed; migration 0007, staged edge/count checks, production asset/API checks and foreign-key verification passed; RESOURCE_PAGES.md |
| Scheduled destinations | Pending: explicit timezone, boundaries, fallback and deterministic server resolution |
| Country/language routing | Pending: explicit ordered rules, safe unknown fallback, linked QR behavior and no-cache response |
| Link health | Pending: bounded checks, private-address/redirect/DNS-rebinding defenses, honest unreachable/blocked/broken states, no engagement pollution |
| Employee profiles/contact files/QRs/admin | Pending: complete Release 2 acceptance gates |
| Employee import/signatures/meeting backgrounds/print cards | Pending: Release 3 distribution checks |
| Apple Wallet | Pending issuer credentials, signing/update implementation and actual iPhone validation |
| Google Wallet | Pending issuer onboarding/credentials and actual Android validation |
| Contact exchange/events/inbox/export | Pending: consent and separate retention policy, permissions, abuse controls and attribution |
| CRM integration | Pending actual company-selected provider, authorized credentials and retry/deletion acceptance checks |
| Monitoring and notifications | Operational health/runbooks required for each release; external recipients/channels require explicit authorization |

Keep the main IMPLEMENTATION_PLAN.md acceptance gates and compatibility/security rules. Do not claim Wallet/CRM is working without provider/device evidence. Continue independent work when provider setup is missing.
