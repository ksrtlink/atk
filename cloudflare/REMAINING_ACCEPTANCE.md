# Remaining full-plan acceptance gates

Checkpoint: 20 October 2026, Dubai. The latest release is production Worker 6cf02975-cff6-4f75-aedc-c5b3b557943b, with 130 registered tests passing. The sign-in/presentation release is recorded in SIGNIN_REDESIGN.md. The complete agreed objective remains open; connection diagnostics are not pass issuance.

## Current evidence

Production and staging configuration both have Google Wallet disabled, with no issuer ID or class ID configured. Production now has the contact-exchange signing secret, but no Google issuer credential. This establishes that a Wallet issuer credential is not connected to this Worker; it does not establish whether the account owner already has an external issuer account. Contact collection was disabled at the diagnostic checkpoint; the subsequent approved activation is recorded below. The user subsequently approved contact-exchange-v1 and its 90-day metadata policy, chose Google first with new paid Apple enrollment deferred, selected HubSpot, and confirmed that neither a Google issuer/class nor a HubSpot account is set up. See the activation evidence in CONTACT_EXCHANGE.md.

| Required work | Authoritative current state | Still required |
| --- | --- | --- |
| Existing short links, tracked QR identities, styles/exports, bulk, personal/company access and analytics | Implemented; registered regressions and release runbooks | Preserve these behaviors throughout further provider work |
| Staff cards, portraits, public/draft boundaries, permissions and vCards | Deployed; STAFF_CARDS.md and PROFILE_PHOTOS.md | Actual iPhone and Android contact import, with device/browser versions and representative names/fields |
| Company templates/import, signatures, backgrounds and print assets | Deployed; STAFF_TOOLS.md and STAFF_DISTRIBUTION.md | Supported email-client paste, actual meeting-app framing and physical printed-code scanning |
| Apple Wallet | New paid enrollment explicitly deferred by user; implementation unfinished | Revisit only when the user resumes Apple setup; future signing/update and iPhone acceptance remain open |
| Google Wallet | Admin-only OAuth/class connection diagnostics implemented; no issuance/update service or stable issuance records yet | Issuer/class identity and secure authorized credentials; provider-backed object/save/update implementation, ownership/idempotency/deactivation checks and Android install/update; publishing approval before public distribution |
| Contact exchange and event attribution | Policy explicitly approved; forms, scoped inbox/review/delete/CSV, abuse limits and retention implemented; full staging submission/count verification passed | Production availability activation and evidence recorded in CONTACT_EXCHANGE.md; owners opt in per card; real-user pilot outcomes must not be invented |
| Selected CRM | HubSpot selected; user confirms no account yet; integration not connected or implemented | Account/app setup and authorized tenant connection; mapping, retries, duplicate prevention, failures and deletion acceptance; HUBSPOT_SETUP.md |
| Resources, schedules, regional rules and link health | Deployed; RESOURCE_PAGES.md, LINK_ROUTING.md and LINK_HEALTH.md | Continue existing operational controls; external notification delivery requires chosen channels/recipients and authorization |
| Owner activity | Deployed; ACTIVITY_AUDIT.md | Preserve transactional capture, disclosure of recording gaps and bounded retention |

## Current external dependencies

- Google: the user chose Google first but has no issuer account/class yet. The account owner must complete issuer onboarding and terms, create the class and authorize a service account. Public issuer/class IDs may be shared; keys must be securely provisioned. WALLET_SETUP.md records the steps. Connection diagnostics alone do not issue passes.
- Apple: new paid setup explicitly deferred by the user. No purchase, terms acceptance or signing identity was created.
- Contacts: policy approval is resolved. Production collection requires deployment activation plus per-card owner opt-in. CONTACT_EXCHANGE.md records actual release evidence and the distinction between synthetic staging checks and a real-user production pilot.
- HubSpot: selected; the user has no account yet. HUBSPOT_SETUP.md records owner setup and the implementation/acceptance requirements. No external contact delivery is active.
- Device/client acceptance: actual iPhone/Android contact import, email-client signature paste, meeting-app framing, physical print scanning and eventual Wallet installation/update remain unverified. Browser emulation and provider fixtures cannot satisfy these gates.

Keep the full objective open. External account setup does not justify fabricating provider/device evidence, and contact-policy approval does not activate marketing subscriptions or CRM delivery.
