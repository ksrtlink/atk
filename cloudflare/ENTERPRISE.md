# TinyTrail company pilot

The public landing page is served at `/`. The company studio is `/manage/`.

## Access and ownership

Firebase verifies email identities; Cloudflare D1 stores company membership and company-owned libraries. Company workspaces require platform approval. A platform administrator configured in `ADMIN_EMAILS` receives a TinyTrail internal workspace and the Platform admin navigation item. Admins approve company requests. Company owners generate email-bound, single-use invitation links that expire after seven days; TinyTrail does not send invitation emails.

All company library and batch calls require `X-Workspace-Id`. Every request checks the current membership. Owners manage members; company members can create and edit shared links, designs, and presets. The last owner cannot be removed. Original eight links are exposed only through the authenticated platform-admin API; their published redirect addresses remain unchanged. Historical public GitHub files are not made private by this change.

Pre-existing personal records remain unassigned. Users see counts, can preview their previous library, and must explicitly confirm transfer into the selected company. The transfer retains URLs, versions, and design settings. Company members can then see and edit those items.

## Bulk and print

Use Bulk studio to upload CSV (`title,url,slug`) or paste URLs. Direct QR batches need no short names or saved links. Link batches require explicit short names. Preview validates up to 100 rows and checks existing names and workspace allowances. Allowances default to 200 links and 200 QR designs per company; configure `MAX_LINKS_PER_WORKSPACE` and `MAX_DESIGNS_PER_WORKSPACE` to adjust them (maximum 1000 each).

Jobs and per-row results persist. Each run processes five rows; successful results remain stable on refresh/retry. A partial short-link success can be completed with its QR design after a quota adjustment. Failed rows keep their original inputs: correct conflicting inputs in a new batch containing only the failed rows. There are pilot safety limits of 30 company presets, 100 outstanding invitations and 200 saved batches per company.

ZIP exports contain QR artwork and a URL manifest. SVG/PNG/JPG output uses the existing QR renderer. PDF sheets use vector QR artwork and high-resolution Unicode caption images. A4 and US Letter use six 42mm QR images per page, including quiet zones. Titles and URL captions are optional. Always scan-test final production artwork and printed materials.

## Local validation

- `npm ci`, then `npm run build` (esbuild must be allowed to launch its native subprocess).
- `npm test`: RSA identity, company membership, invitations, migration/transfer, quotas, original redirects, and 100-row resumable bulk tests.
- Start `node --experimental-sqlite tests/browser-server.mjs` for the loopback-only SQLite/RSA integration harness. Open a headless browser with CDP on port 9226 and run `node tests/browser-enterprise.mjs`. Firebase responses are simulated; these checks do not send real emails.
- After the browser suite, run `node tests/browser-exports.mjs`. It decodes all 24 style combinations with jsQR/ZXing and creates seven-code A4/Letter PDFs under the ignored `.qa/export-check` directory.
- Render those PDFs with Poppler at 150dpi to `a4-1.png`, `a4-2.png`, `letter-1.png`, `letter-2.png` in that directory. Run `node tests/print-check.mjs` to decode every printed code.
- `node tests/live-smoke.mjs https://tinytrail.link` verifies the public deployment without creating records or sending email.

## Deployment and recovery

Keep `wrangler.jsonc`, credentials, backups and `.qa` out of Git. Set `ADMIN_EMAILS` to the verified platform administrator email. Build first; back up D1 and verify the backup before applying `npm run db:remote`, then `npm run deploy`. Migration 0003 is additive and does not rewrite existing links or designs. Record the previous Worker version before deploying. A Worker rollback can use the old application with the expanded schema; roll forward with a corrected migration rather than dropping company tables or restoring an old backup over new company records.

The browser build contains no original-link JSON fallback. Company endpoints return private no-store responses. This pilot now includes opt-in company engagement analytics and explicit tracked/static QR modes; see RELEASE1_RUNBOOK.md. It does not provide SSO, malware scanning, billing, or customer-specific domains. The landing page describes only the implemented capabilities.

Export libraries: fflate (MIT), jsPDF (MIT), svg2pdf.js (MIT). QR rendering: qr-code-styling (MIT). Build-time sample QR generation: qrcode (MIT). Generated export bundles retain upstream license comments; installed package licenses are included in `EXPORT-LICENSES.txt` at build time.
