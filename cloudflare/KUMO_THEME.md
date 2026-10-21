# Kumo components and appearance

Tinytrail uses official `@cloudflare/kumo` 2.15.0 with React 19.3.1. The standalone upstream stylesheet is copied during build; no runtime CDN or Tailwind compiler is required. Reference: https://github.com/cloudflare/kumo.

## Component audit

| Surface | Implementation |
| --- | --- |
| Static buttons, action links and text/email/password/URL/search/number/tel inputs | Official Kumo Button, LinkButton and Input rendered during build by scripts/kumo-html.mjs. Native attributes, IDs, labels, form submission and existing handlers are preserved. These presentational controls are not hydrated React roots. |
| Appearance menu | Official Kumo Select in an isolated React root, with keyboard support and focus return. |
| Dynamically created buttons and supported inputs | Upstream buttonVariants/inputVariants recipes applied to existing DOM. These remain native controls; handlers and state are preserved. |
| Dialogs, tables, textareas, remaining selects, checkbox/radio and file/color inputs | Native implementations styled with Kumo semantic tokens. These have not been migrated to Kumo React components. |
| QR/print artwork, signatures and published content | Separate output surfaces; interface appearance does not recolor customer designs or change public content. |

Kumo light/dark neutral, line, foreground, success, danger, warning and primary blue tokens are authoritative. ui/kumo-alignment.css bridges existing semantic names and overrides legacy hardcoded surfaces. Orange remains in Tinytrail's logo, illustrations and decorative brand text. Manrope remains self-hosted. Product controls use 14px content, medium weight, compact spacing, 8px corners, ring borders and instant state changes. Marketing layout remains distinct.

## Behavior

- The header offers System, Light and Dark on homepage, sign-in and workspace.
- System follows OS preference. Explicit selection persists in localStorage under tinytrail.appearance and syncs across tabs. This is a browser preference, not profile data.
- appearance-init.js runs before styles, after security metadata, to avoid a light flash. Invalid values use System; storage errors remain safe.
- Theme updates data-mode with Kumo's data-theme=kumo palette. No inline scripts, remote styles/fonts or relaxed CSP are introduced. Kumo's exported CSPProvider disables Base UI inline style elements; its scrollbar rule lives in the external stylesheet.
- Dedicated dark hero/sharing WebP assets retain the original orange/white direction.
- QR preview paper stays white. Encoded destinations, export colors, saved designs, links, access rules, authentication and database schema are unchanged.

## Validation

npm run test:theme checks system/explicit/invalid/blocked-storage/cross-tab preferences and build-time form semantics. npm run test:theme:browser checks the actual menu, keyboard Escape/focus, OS preference, route persistence, 320/390/768/1440px layouts, dialog centering, selected-tab contrast and white QR paper.

The sign-in and analytics browser suites pass. The complete enterprise suite passes in both Light and Dark, including bulk links/designs, decoded exports, deletion/restore, private/company access and staff/resource tools. All 130 registered tests pass. Evidence is in the ignored .qa directory. Browser checks do not satisfy broader physical print/device acceptance gates.

## Release

No database migration or production data export is involved. Roll back Worker/assets together if needed; keep dependencies and lockfile pinned. Deployment versions and live smoke-check evidence follow below.

Final staging Worker: 9d61accb-6bc9-4efa-a34b-83cd5836e3ce. Live checks passed for theme selection, persistent sign-in appearance, guest dashboard redirection, private API denial, absent legacy JSON, all new assets and zero CSP violations.

Production Worker: 2f023bdd-4da8-4617-81fa-0776cc6e44e0 at https://tinytrail.link. The same live theme/menu, route-persistence, guest/private API, asset and strict-CSP checks passed after deployment. The preceding production version was 14d19f9d-b7b1-4df5-abb6-208284628f19.
