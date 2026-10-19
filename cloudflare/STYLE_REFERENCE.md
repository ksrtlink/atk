# Cloudflare-inspired visual theme — 19 October 2026

Applied the user's pasted Cloudflare style reference to the landing page, dashboard, forms, bulk tools, analytics and QR designer. This is a native CSS interpretation of the supplied visual reference, not an official Cloudflare component package.

## Audit and scope

The application already shared orange #ff5e1f, system typography, gray canvas and 4px interface corners. The requested reference moves toward a white canvas, charcoal text, smaller corners, compact geometric typography, restrained elevation and a 4px spacing base. Routes, navigation, logo, form IDs, creation handoffs, authentication, company/personal isolation, QR artwork and stored data remain unchanged. No dependency or database migration was introduced.

## Shared tokens and intentional adaptations

`ui/theme.css` owns the shared palette, typography names, spacing, radii, shadows and timing tokens. `ui/cloudflare-style.css` applies them after the existing page-specific sheets. Both public pages load the same layer.

- Primary #ff5e1f; hover #ff7038; white background; #f0f0f0 surfaces/borders; #fdfdfc card/input paper; #262626 text. Primary and hover follow the structured reference rather than its conflicting prose values.
- Corners: 1/2/3/4px tokens, with 2px standard controls and cards and 3px elevated dialogs.
- App display 32px/500; headings 19px/400; body 14px; monospaced URLs 12px. Marketing display reaches 56px using the larger display guidance in the reference. Long paragraphs retain comfortable 1.5 leading; mobile inputs use 16px.
- FT Kunst Grotesk and Apercu Mono Pro are the first font-family choices, with local Arial/system and Consolas/monospace fallbacks. The workspace contains no font files for those named families, and none were downloaded, embedded or represented as installed.
- The reference's white muted-text value is unsuitable on white surfaces. Muted text uses #626262 (6.10:1 on white). Orange controls keep #262626 text (4.95:1 on #ff5e1f); white would be only 3.06:1. The reference's contrast estimates were not reused.
- Fast/base transitions use 100/200ms with cubic-bezier(.19,1,.22,1). Reduced-motion preference disables transitions/animations. Primary mobile controls and navigation have at least 44px height; the QR dialog fits the mobile viewport without horizontal overflow.
- Warm card/elevation shadows follow the meaningful layers in the supplied shadow value; redundant transparent layers are omitted. Dashboard data panels stay flat.

QR ink presets and all saved shapes/colors remain independent of interface colors.

## Verification

31 backend tests passed. Updated enterprise browser checks passed for shared palette/radius consistency, body/control text colors, a mobile 44px primary target, reduced motion, both hero handoffs, automatic-name retry recovery, company approval, personal/company separation, QR saves, bulk exports and sign-out cleanup. The QR dialog was checked separately on desktop and mobile. Existing analytics browser checks passed, including decoded tracked QR images and matching CSV counts. Screenshots were visually reviewed; no horizontal overflow or JavaScript exceptions were found.

Staging and production smoke checks verify both pages, shared tokens and anonymous private API restrictions. Browser authentication uses signed test tokens and simulated Firebase responses; actual email delivery was not retested for this visual-only change.
