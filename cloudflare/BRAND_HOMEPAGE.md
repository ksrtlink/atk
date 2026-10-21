# Calmer homepage and Manrope typography

21 October 2026, Dubai. The user requested a broader homepage improvement, fewer repeated QR visuals and a Google Fonts typeface for the brand.

## Design and scope

Preserve redesign, with variance 5 / motion 2 / density 3: keep the existing logo, orange-and-white palette, hero artwork, public navigation anchors, sign-in state and real creation tools. Replace the technical sample gallery with a warmer brand narrative. The requested Google Fonts typeface is Manrope; the supplied SVG wordmark is unchanged.

- New headline: Share more. Keep it simple. Shorter introduction; functional link/QR tabs remain.
- Remove the sample QR from the creation panel, the three decorative QR patterns, file-format tiles, miniature spreadsheet and six-code print sheet. No black QR pattern is repeated on the marketing page. This does not remove QR functionality or exports from the product.
- New three-step sharing section, second orange/white sculptural illustration, and clear personal/team cards. Personal accounts explicitly require no company. Company access still requires approval or invitation.
- A shorter closing message and a more compact FAQ. Existing workflow/company/questions anchors and factual FAQ limitations remain.
- Optional lower illustration is lazy-loaded; the 21,696-byte WebP uses empty alternative text as decoration. The existing 29,412-byte hero remains. A small entry animation still respects reduced motion.

## Font provenance and delivery

Manrope is downloaded from the official Google Fonts CSS endpoint and fonts.gstatic.com WOFF2 URLs, with the SIL Open Font License supplied from google/fonts/ofl/manrope/OFL.txt. The six variable WOFF2 subsets preserve Google's unicode ranges and weights 200–800. Each binary's wOF2 signature was verified. The Latin subset is 24,836 bytes; other scripts load only when needed. Font-face rules use font-display:swap and local /fonts/ URLs, with a system fallback. The homepage preloads Latin. There are no runtime Google Fonts requests, no tracking script and no new package dependency.

The shared --font-sans token updates homepage, sign-in and dashboard typography. Existing public resource/contact pages keep their standalone system-font stylesheet; print/export font selection and saved QR settings are unchanged. The copyright/license is bundled at /fonts/OFL.txt. Source: https://fonts.google.com/specimen/Manrope and https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt.

The homepage creation handler now waits for initial account restoration before deciding whether a very fast submission should continue to the dashboard or sign-in. Duplicate in-flight submits are ignored. This preserves an existing signed-in user's pending draft instead of making them stop at the sign-in screen while auth is still loading. Server identity checks are unchanged.

## Verification and deployment

Build, responsive checks and actual Manrope font-face loading are verified. Local browser evidence uses synthetic signed identity fixtures, with no production records or emails created. Complete product and sign-in regression outcomes, deployed asset checks and release versions are appended below. No D1 migration, feature-policy change or secret rotation is required. A compatible asset redeploy rolls back this release; issued links and QR identities are unchanged.

Final browser results: the complete browser-enterprise suite passed under Manrope, including bulk/export, personal/company access, profile/resource publishing, contact exchange, link routing/health, Activity and sign-out privacy. The browser-signin suite passed sign-in/create/reset/verification, signed-in homepage/logo, safe return paths and browser-back privacy. Focused homepage checks passed at 1440/768/390/320 pixels with actual Manrope font-face loading, both illustrations having visible rendered dimensions, no repeated QR patterns, reduced motion, anchor navigation and guest QR draft handoff. Mobile illustration sizing was explicitly set to avoid an auto-width grid collapse, and a native viewport capture confirmed painting. Backend code and the registered 130-test suite are unchanged; the browser checks cover this release's font/layout/creation-handoff changes.

Staging Worker c8335ec7-2528-4672-98c9-91e44a1152c7 and production Worker 14d19f9d-b7b1-4df5-abb6-208284628f19 deployed. Both public smoke checks passed: section/form/anchor markup, absent repeated QR samples, all six WOFF2 binary signatures and font/woff2 MIME types, license availability, sharing artwork image/webp MIME and exact size, sign-in HTTP 200, and anonymous private APIs HTTP 401. No real contact/profile/account test data or verification email was created in production.
