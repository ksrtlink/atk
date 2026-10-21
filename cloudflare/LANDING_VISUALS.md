# Homepage companion artwork

21 October 2026, Dubai. The user liked the sign-in illustration and requested the same visual direction on the main landing page.

Preserve redesign: existing Tinytrail logo, orange/white/neutral palette, typography, public navigation anchors, signed-in account state and creation behavior remain. Design dials stay at variance 5, motion 2, density 3. A new companion image uses the sign-in artwork as a reference: tactile orange/white chain links and a small trail of blocks, without fake QR codes or interface elements. It is decorative (empty alt text and aria-hidden wrapper); the real sample QR remains in the functional tool.

The hero pairs the headline with the new image. Short link / QR tools move immediately below the hero into a compact full-width panel; all existing form/tab IDs and JavaScript behavior remain. Try the tools links directly to #quick-tools. The intro is shorter. The illustration uses a short entrance animation only when reduced motion is not requested. A dedicated landing-visual.css isolates presentation changes from the dashboard and sign-in page. Inherited legacy illustration padding/min-heights are explicitly reset to avoid excessive whitespace on mobile.

The source WebP is 1536x1024 and 29,412 bytes. No framework, runtime dependency, database migration, authentication or email-provider change is introduced.

Build passed. Focused real-browser checks passed at 1440, 768, 390 and 320 pixels: no horizontal overflow, image loading, reduced motion, tool anchor, QR-tab selection, draft persistence and guest sign-in handoff without dashboard exposure. The existing browser-signin suite also passed with freshly issued synthetic QA identity fixtures, covering account and verification flows, homepage account/logo, safe returns and browser-back privacy. Desktop/mobile screenshots were inspected. No real account or verification email was created during testing. Backend code is unchanged; the existing 130 registered tests were not rerun for this presentation-only change.

Deployment versions and public smoke evidence are appended below. Rollback is a compatible asset/application redeploy; no data or issued identities need changing.

Staging Worker 75867a26-e053-4efb-bced-bff6c411cfbb and production Worker 22480a53-6038-4d90-a24a-947de1999f6f deployed. Both passed public checks for hero/tool/account markup, image/webp content type and exact 29,412-byte size, styles, sign-in 200 and anonymous /api/me 401. No production test records or emails were created.
