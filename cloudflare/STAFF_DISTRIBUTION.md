# Staff sharing assets

Open a published Contact card and choose Sharing assets. Owners and assigned employees may export; other members and other workspaces cannot read the distribution API. Draft, unpublished and disabled cards cannot generate new assets.

Every preview/export reads the approved public snapshot. Unpublished draft changes never enter generated assets. Card access and publication are checked again before each export. Workspace/account changes close the dialog, clear previews, revoke preview object URLs and cancel in-flight output.

## Formats

- Email signature: copy rich HTML plus plain text or download standalone HTML. Presentation tables, system fonts, escaped approved contact text and links only; no scripts, external images, tracking pixels or remote styles. Its preview uses a shadow root to avoid dashboard CSS leaking into email markup. Browser clipboard support is required for rich copy; HTML download remains available.
- Print card: 1004×650 PNG and one-page 85×55 mm PDF, approximately 300 dpi. The same opaque profile QR route is encoded. Long text fits the reserved region and may be shortened visually; the public profile/vCard retains complete values.
- Meeting background: 1920×1080 PNG with a clear center, name/title at lower left and QR at lower right. The source is not mirrored. Meeting-app crop/mirror behavior must be checked in the chosen app.

Exports are generated locally with existing bundled QR/PDF libraries. No employee data or URL goes to a third-party QR/export service. Files do not refresh after download. Disabling a profile stops its online page/QR/contact routes; existing files and offline copies can remain.

## Verification

73 registered tests cover snapshot/permission/publication checks and escaped safe signatures, alongside existing tests. The enterprise browser suite exports real print/background PNGs, decodes both to the same card QR identity, checks pixel dimensions, exports signature HTML and a real PDF, and checks desktop/mobile controls. The generated PDF is one 240.945×155.906 point page (85×55 mm), with no JavaScript. Poppler-rendered output decodes to the expected profile QR at 200 dpi. Local screenshots were visually reviewed. The owned QA browser is brought to the foreground for actions so download-hub tabs do not throttle preview timers.

The files are functional, but actual Outlook/Gmail paste formatting, chosen meeting-app framing and physical print scans are not yet verified. Do not claim those real-client/device gates complete from browser tests. Apple/Google Wallet and actual iPhone/Android contact import remain separate gates.

Staging Worker 430318ca-1f4b-43f2-8b31-4b21047e3147 deployed. Rollout: compare delivered asset hashes/private API guards, then deploy production. No schema migration is needed for this workstream. Roll back to the preceding Worker if needed; existing profile identities and database rows are unchanged.
