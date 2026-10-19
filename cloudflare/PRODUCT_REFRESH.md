# Creation-focused refresh — 19 October 2026

## Design read and audit

Preserve TinyTrail branding and routes while focusing the hero and workspace on short links and QR creation. Existing tokens: orange #ff5e1f, ink #18181b, white/gray surfaces, system fonts and 4px corners. Existing landing anchors, company information, export descriptions, FAQ, authentication, library ownership and analytics stay in place. The previous hero emphasized an illustrative spreadsheet/print flow; dashboard creation was in a narrow side column. The user requested the supplied `Tinytrail-mark.svg` as the full logo and a creation-focused layout inspired by the supplied references.

## Result

- The supplied full SVG is used as the logo without adding another wordmark. Its native aspect ratio is preserved. The favicon uses the symbol from that artwork.
- Hero headline: Short links. Sharp QR codes. A functional short-link/QR selector accepts a destination and continues to the authenticated workspace. It never creates or publishes an item on the landing page.
- Draft handoff uses same-origin session storage, not a destination in the address bar. HTTP(S), credential and length validation run before handoff and again in the app. Drafts expire after 30 minutes, are consumed once, and clear on explicit sign-out.
- The dashboard presents creation above a full-width library. The URL can create a short link or open QR design directly. A custom name is optional; blank names generate an eight-character code. The generated value remains stable across a lost-response retry and uses the existing server idempotency checks.
- Personal/company membership rules, old redirect addresses, existing QR destinations and backend APIs are unchanged. No database migration, new dependency or paid service is needed.

## Verification

31 backend tests passed. Updated desktop/mobile browser checks passed for both hero handoffs through sign-in, no automatic publication, generated short names, lost-response recovery without duplicates, personal/company separation, direct QR saves, bulk ZIP/PDF exports and sign-out cleanup. Existing analytics browser checks passed, including decoded tracked QR exports and matching CSV counts. Visual screenshots were reviewed locally at desktop and mobile sizes; no overflow or JavaScript exceptions were found. Private browser QA files remain ignored.

The browser authentication harness uses signed test tokens and simulated Firebase responses; actual verification-email delivery was not tested. Staging and production smoke checks verify pages, shared theme and anonymous private API gates. Backend behavior and data were not changed by the refresh.
