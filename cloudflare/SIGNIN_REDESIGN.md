# Sign-in and entry flow redesign

20 October 2026, Dubai. The user requested a separate 50/50 visual/sign-in page, signed-in state on the homepage, a dashboard entry through the logo or a clear action, and simpler presentation of newer features.

## Audit and design decisions

Preserve redesign: the existing Tinytrail wordmark, orange accent (#ff5e1f and existing token shades), light surfaces, border treatment and font stack remain. The existing homepage content, anchors, public profile/resource URLs, issued link/QR identities, field IDs and consent wording remain. This is native CSS inspired by the existing theme, not an installation of the official Kumo component package. No framework or runtime dependency was introduced.

The old homepage sent every sign-in/account entry into /manage/ and opened a modal over the workspace shell. It had no signed-in account state. Contact cards presented fourteen profile fields at once; resource/card engagement controls competed with editing.

Design dials: variance 5, motion 2, density 3. The 50/50 composition and light neutral treatment fit a calm enterprise entry point. A short form-entry transition provides hierarchy and is disabled for reduced motion. A generated orange/white link illustration is encoded as a 26,338-byte WebP, with empty alt text because it is decorative. The existing logo remains the accessible brand link. On mobile the image becomes a compact header above the form. No stock testimonials or invented product claims were added.

## Resulting behavior

- /signin/ contains email/password sign-in, account creation, password visibility, password reset and verification/resend/check states. It reuses the existing Firebase auth module and APIs. Email sender/templates/DNS are unchanged by this release.
- Normal successful verified sign-in returns to the homepage. Existing signed-in users opening /signin/ see their account and an Open dashboard action. Unverified accounts remain in the verification step and cannot reveal the dashboard.
- Explicit local dashboard destinations preserve a pending creation draft or invitation fragment. The return helper accepts only /manage/ on the current product origin; arbitrary external, protocol-relative, backslash, control-character and unrelated route destinations are rejected. Tests cover those boundaries.
- The homepage displays a verified Signed in account menu, a welcome note and Open dashboard actions. Its header logo opens the dashboard for verified users; for guests it remains the home link. Personal email appears only inside the account menu. Homepage sign-out clears the local account, workspace selection and pending creation draft.
- Guest or unverified direct dashboard requests are redirected to /signin/ before the dashboard shell is revealed. Dashboard APIs retain their server-side identity/membership checks. On navigation away the shell is cloaked; history restoration clears private data and rechecks storage and identity. Auth initialization clears cached in-memory identity when stored credentials are absent. Sign-in history restoration also reinitializes identity and clears password fields.
- Contact cards keep name, title, optional organization, public email/phone and introduction visible; additional fields move into More contact details, with an indication of saved values. Invalid optional fields expand their section so native validation can focus them. Card and resource engagement move into expandable sections. Inputs, permissions, draft/publish approval, QR/export and inbox functionality are preserved.

## Verification and operational boundaries

npm test passes 130 registered tests. browser-signin.mjs covers sign-in/account creation, error/reset/visibility, verification/resend/check, homepage identity/logo, guest guard, dashboard return safety, sign-out and browser-back privacy, collapsed-field validation and 1440/390/320-pixel layouts. Identity responses are synthetic local fixtures; the backend verifies the real signed local QA tokens. No real verification email was sent during these tests.

The complete browser-enterprise suite passed link/QR creation, static/tracked exports, bulk, personal/company permissions, templates/import, contact exchange, portraits, sharing assets, routing, resource publication and Activity. browser-analytics passed decoded QR identity, known visit-count/CSV reconciliation, bulk export and sign-out privacy. Generated desktop/mobile screenshots were inspected. Browser testing is on the isolated local QA app; real-provider email delivery and device tests are not inferred from it.

Staging and production deployment IDs and public smoke results are appended below. No D1 migration or data rewrite is required. Retain the approved contact flags, signing secret, hourly retention and original links. Rollback is a compatible application/asset redeploy; no schema rollback is needed. Wallet/HubSpot and actual-device gates remain as recorded in REMAINING_ACCEPTANCE.md.

## Deployment evidence

- Staging Worker 50a84af5-3a77-47ce-bcaa-5352286b4ac8 deployed after final browser-history guards; public HTTP smoke checks passed for /signin/, its script/style/image, the homepage and dashboard shell. The image has image/webp content type and remains below 40 KB. Private /api/me and /api/people return 401 anonymously, and approved contact exchange remains available.
- Production Worker 6cf02975-cff6-4f75-aedc-c5b3b557943b deployed with the same application assets and existing policy/retention settings. No migration, auth-provider change or secret rotation was required. Production public asset/API guards, D1 foreign keys and original-link count are verified in the release handoff.
