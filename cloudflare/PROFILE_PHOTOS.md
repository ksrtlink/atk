# Profile portraits

A saved contact card can have one square portrait. Owners may change it; assigned employees need the explicit Profile photo field permission. Company templates can set that permission for newly created drafts. Photo APIs use the same verified identity/workspace/profile scope as the card.

## Preparation and validation

The browser accepts PNG/JPEG/WebP up to 5 MB, rejects dimensions above 8192 per side or 25 megapixels, centers a square crop, composites on white and produces a PNG. It reduces from 256 to 192 or 128 pixels where needed to meet 120 KB. Re-encoding drops source EXIF and other metadata. The form is locked while preparing/saving to prevent losing simultaneous edits; changing account/context cancels previews and output.

The server accepts only bounded base64 PNG input, checks signature, chunk lengths/order, CRC, non-interlaced 8-bit RGB/RGBA dimensions up to 256, complete bounded zlib output and scanline filter values. It rejects animation, text/EXIF and unsupported chunks, and removes accepted color/density hints. No remote image URL is fetched. Images are served with image/png, nosniff, no-store and a restrictive CSP.

## Storage/publication

Migration 0011 uses the existing D1 binding (BLOB support documented at https://developers.cloudflare.com/d1/worker-api/); no additional service or credentials are required. At most two 120-KB photos remain per profile: the current draft and approved snapshot. Replacing/uploading/removing a photo is versioned and atomic with its revision. Retrying the same completed upload is idempotent. A failed transaction rolls back image insertion as well as the profile update.

The draft portrait is available only through the authorized private photo endpoint. Public `/people/:slug/photo` resolves only the approved photo after publication. A draft replacement/removal leaves the current public photo unchanged until republishing. Republishing removes orphan photo bytes. Disabled/unpublished cards cannot expose public photos. Publication history retains photo identifiers, not abandoned image bytes. The vCard references the approved public photo URL; actual contact-app import compatibility still needs device checks. Photo fetches do not add engagement events.

## Evidence

80 registered tests pass, including malformed/oversized/animated files, CRC and decompression limits, metadata hints, unpublished/disabled photos, owner/employee/other-workspace access, cross-profile substitution, stale writes, retry/concurrent replacement, bounded cleanup and transactional rollback. Browser tests use real file inputs and a nonsquare PNG to exercise crop/re-encoding, private drafts, published-image hash stability before republishing and actual image changes after approval. Desktop/mobile layouts and existing link/QR/resource/import/distribution/analytics regressions are checked.

Staging migration 0011 and Worker f51ad834-8e5a-4134-be95-78f71005f744 deployed. Actual D1 BLOB reads return the expected synthetic PNG hash; HEAD is empty and private photo access rejects anonymous callers. The public portrait renders at 96 CSS pixels on desktop/mobile. A temporary isolated Worker verified PNG/decompression/CRC behavior in Cloudflare's deployed runtime; it and synthetic staging data were removed after verification.

The browser suite also exposed and now covers a QR dialog race: a queued close notification from an earlier opening could clear a newly reopened preview. The close handler ignores that stale notification while the dialog is open.

Rollout: capture D1 Time Travel metadata, apply additive migration 0011, deploy the verified Worker/assets and check foreign keys and private/public gates. Existing links and QR identities stay unchanged. Keep the additive table if rolling back the Worker. No real portrait is inserted into production as a test fixture.
