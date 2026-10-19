# Contact-card foundation — pilot scope

Contact cards are available to personal accounts (one card) and companies (250 reserved identities). Public addresses `/people/:slug` and opaque QR addresses `/people/qr/:id` stay stable. Names are not used as database identities. Disabled and unpublished identities are never recycled.

## Access matrix

| Operation | Owner | Assigned employee | Other member |
| --- | --- | --- | --- |
| List/read private card | Workspace cards | Own assigned cards | No |
| Create, assign, change field permissions | Yes | No | No |
| Edit draft | Any public field | Explicitly permitted fields only | No |
| Publish, unpublish, disable, activate | Yes | No | No |
| View engagement report | Workspace cards | Own assigned cards | No |

Verified workspace access is required before every private operation. Personal accounts do not display employee-assignment controls. Profile contact emails are entered deliberately, never copied from sign-in identity. Members removed from their company lose API access even if a card assignment still exists. Owners should disable/reassign cards during offboarding.

Only approved published snapshots appear publicly. Saving drafts does not change public pages or downloads. Publishing requires explicit approval; version checks prevent overwrites. Disabling gates the public page, vCard, QR redirect and actions. Activate returns to a private draft; publishing is a separate step. Public responses are no-store, escaped, script-free and use restrictive CSP; internal record/assignment identifiers are excluded.

Contact files follow RFC 6350 (https://www.rfc-editor.org/rfc/rfc6350): UTF-8, CRLF, text escaping and 75-octet line folding without breaking code points. A stable public URL is the contact UID. Existing saved phone contacts do not automatically update. Phone, email, LinkedIn, booking and selected resource actions use stored values; no arbitrary redirect parameter is accepted.

QR visits, page views, contact downloads and action clicks are separately labeled. Downloads mean served files, not confirmed address-book saves. Eligible opt-in collection excludes HEAD, recognized bots/prefetch and disabled/missing records; no raw IP, cookies or user-agent strings are stored. Events use UTC and the agreed 90-day retention; reports show completed days. These events are not added to the existing link/QR combined engagement total.

## Evidence

65 registered tests pass: public/private separation, owner-only creation and publication, assignment and editable fields, cross-workspace denial, disable/activate, stable QR identity, conflict handling, public escaping/action safety, Unicode/long vCard serialization, event reconciliation and retention. Browser coverage includes card creation/publication, unchanged public drafts, desktop/mobile editor, vCard fetch and decoding an actual exported PNG to the opaque profile QR URL. Existing analytics regressions also run.

Staging Worker 09b418a9-6e5d-46b0-ac54-3320334f48de served the profile document, vCard, QR redirect and saved action correctly. Anonymous private APIs returned 401. Synthetic opt-in events reconciled to one each of view/download/action/QR; HEAD requests added none. Public desktop/mobile layouts fit and the accent button has white text. Synthetic fixtures were removed.

## Still required for full Release 2/3 completion

This is a functional foundation, not a claim that every staff acceptance gate is complete. Photo uploads need an explicitly configured, validated storage path. Company templates, bulk employee import and distribution tools remain follow-ups. Actual iPhone and Android vCard import (including non-Latin names, punctuation and long/multiple fields) must be checked with recorded device/browser versions. Automated serialization and browser download checks do not replace those checks. Apple/Google Wallet integrations require issuer setup and real-device validation; no placeholder Wallet buttons are shipped.

Recovery: capture a D1 Time Travel bookmark before production migration 0009. If needed deploy the prior Worker to remove the new UI/routes while retaining additive tables and records; do not drop staff tables as rollback.
