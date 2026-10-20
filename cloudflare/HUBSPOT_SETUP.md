# HubSpot integration setup

Selected by the user on 20 October 2026. The user confirmed there is no HubSpot account yet. No connection, CRM sync, background delivery or live provider acceptance is implemented. Contact exchange remains useful independently, with a private inbox, CSV export and deletion.

## Account-owner steps

1. Create the intended HubSpot account using the business identity that should own its contact data. Review its terms and account settings personally. Keep the account's public ID for connection verification; never send passwords or access tokens in chat.
2. Start with a separate development/test account and synthetic contacts. Review existing automatic workflows before connecting: an external CRM can have account-specific automations triggered by contact creation. Tinytrail must not imply that avoiding an email API guarantees another system never sends mail.
3. For Tinytrail's multi-workspace product, use an OAuth app with installation authorized by each workspace owner. A single shared production private-app token is not an acceptable tenant connection. The OAuth app and server-only client secret must be set up securely before an install flow can work. Do not grant automation, marketing, forms or email-send permissions for contact syncing.
4. Before enabling delivery, review the displayed field mapping, destination HubSpot account and contact-data notice. The approved conversation-follow-up policy is not a marketing subscription. No historical contact bulk sync occurs without an explicit owner action.

## Required implementation and acceptance

- Server-verified workspace-owner authorization; state-bound, expiring, single-use OAuth start/callback; validated scopes/account identity; encrypted server-only refresh tokens; disconnect and rotation. Never infer the HubSpot account from a browser-provided workspace or portal ID.
- Request only the contact-read/write permissions justified by the final provider calls. Confirm supported endpoints, scope requirements, token exchange and refresh against current HubSpot reference docs before implementation.
- Reviewable field mapping for name/email/optional organization and phone. Preserve the full original name; do not guess a culturally dependent first/last-name split. Free-text messages and internal consent/audit records are not silently copied into unrelated CRM properties.
- Owner-controlled delivery, with per-submission status, bounded retries/backoff and safe failure details. Idempotency must be verified against the actual API: a timeout after a successful create must not make a second contact. Do not overwrite pre-existing account contact fields just because an email matches.
- Keep the original inbox contact when CRM delivery fails; prevent delivery after source deletion or expiration. Define deletion propagation and what happens to existing shared HubSpot records before enabling sync. A local Delete must never silently erase a shared CRM contact owned by another process.
- Preserve the approved 90-day source-detail retention and metadata-only activity policy. Avoid retaining payload copies in job/error logs. Disconnect must stop new and queued sends.
- Use the contact object API only; no communication-preference subscription or email-send request. Record actual account automation behavior during acceptance.
- Real-provider tests must demonstrate account/workspace isolation, connection revocation/refresh, mapping, retries after ambiguous responses, duplicate prevention, failure visibility, disconnect and deletion/retention behavior. Contract fixtures alone cannot establish readiness.

## Official references checked 20 October 2026

- Contact object guide: https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide
- HubSpot app authentication overview: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/overview
- Official comparison of app authorization approaches: https://developers.hubspot.com/blog/hubspot-integration-choosing-private-public-hubspot-apps

The legacy contact guide documents the v3 API; it is reference material, not a choice to ignore current versioning when implementing the integration.
