# Remaining full-plan acceptance gates

Checkpoint: 20 October 2026, Dubai. The last implemented release is production Worker 721f50f2-1578-4d59-8f54-c537d7cb9e8e, with 129 registered tests passing. The complete agreed objective remains open; connection diagnostics are not pass issuance.

## Current evidence

Production and staging configuration both have Google Wallet disabled, with no issuer ID or class ID configured. The production Worker secret inventory is empty. This establishes that an issuer credential is not connected to this Worker; it does not establish whether the account owner already has an external issuer account. Contact collection and its policy flag remain disabled. No further account/credential, contact-policy or CRM decision has been supplied in this chat at this checkpoint.

| Required work | Authoritative current state | Still required |
| --- | --- | --- |
| Existing short links, tracked QR identities, styles/exports, bulk, personal/company access and analytics | Implemented; registered regressions and release runbooks | Preserve these behaviors throughout further provider work |
| Staff cards, portraits, public/draft boundaries, permissions and vCards | Deployed; STAFF_CARDS.md and PROFILE_PHOTOS.md | Actual iPhone and Android contact import, with device/browser versions and representative names/fields |
| Company templates/import, signatures, backgrounds and print assets | Deployed; STAFF_TOOLS.md and STAFF_DISTRIBUTION.md | Supported email-client paste, actual meeting-app framing and physical printed-code scanning |
| Apple Wallet | No issuer identity/certificate connected; signing, issuance, device registration, update and push implementation remain unfinished | Account/team and budget choice; Pass Type ID and secure signing credentials; implement/validate service and expiry/rotation/failure handling; actual iPhone install and update |
| Google Wallet | Admin-only OAuth/class connection diagnostics implemented; no issuance/update service or stable issuance records yet | Issuer/class identity and secure authorized credentials; provider-backed object/save/update implementation, ownership/idempotency/deactivation checks and Android install/update; publishing approval before public distribution |
| Contact exchange and event attribution | Forms, scoped inbox/review/delete/CSV, abuse limits and independent retention implemented; collection disabled | Separate contact-data policy decision; controlled real production pilot and persisted-count verification after approval |
| Selected CRM | No provider selected or connected; integration not implemented | Actual provider choice and authorized connection; field mapping, retries, duplicate prevention, visible failures and deletion acceptance |
| Resources, schedules, regional rules and link health | Deployed; RESOURCE_PAGES.md, LINK_ROUTING.md and LINK_HEALTH.md | Continue existing operational controls; external notification delivery requires chosen channels/recipients and authorization |
| Owner activity | Deployed; ACTIVITY_AUDIT.md | Preserve transactional capture, disclosure of recording gaps and bounded retention |

## Decisions needed to continue the dependent work

- Wallet: identify existing issuer accounts or choose Google-first setup while holding new paid Apple enrollment. Public issuer/class IDs can be shared; private keys must use secure server-side provisioning. WALLET_SETUP.md contains the verified account steps. No membership purchase or terms acceptance has been performed.
- Contacts: approve or retain the hold on name/email and optional organization/phone/message, 90-day detail retention, receiving-employee/owner access, CSV/deletion and no marketing subscription. The decision also needs to cover opaque activity metadata retained for 90 days after each action, without copies of submitted fields. Anonymous analytics retention approval did not activate this separate collection.
- CRM: choose the actual provider or explicitly defer this work. Do not build or claim a speculative integration with several providers.
- Device/client acceptance: provide access to appropriate test devices/clients or arrange recorded results from their users. Browser emulation, decoded PNGs and provider-response fixtures cannot satisfy actual device/provider gates.

These dependencies have remained unresolved across successive full-plan turns while independent implementation progressed. No credentials, approvals, provider responses or physical-device results will be invented to close the remaining gates. Keep Wallet and contact collection unavailable until their applicable setup and acceptance checks are satisfied. Keep the full objective and existing deployed features intact when work resumes.
