# Resource pages

Release scope: collections of approved external URLs, private drafts, owner-controlled publishing, bounded revision history, stable public pages and page QR codes. Document resources are external URLs; no private files are uploaded or published automatically.

## Contract

- Migration 0007 adds pages, revisions and anonymous resource events. Existing link, QR and user records remain unchanged.
- Public address: `/p/:slug`; stable page and item identifiers are never reassigned. Slugs cannot be renamed/reused. Unpublished drafts return 404; formerly published inactive/archived pages return 410 with no cache.
- Page title/introduction and up to 30 labeled external links are validated on the server. HTTP(S), credential and loop checks reuse link validation. HTML is escaped. Published HTML has no scripts and restrictive CSP, no-referrer and no-store headers.
- All private API operations derive access from the verified workspace. Members can create/edit drafts and restore draft revisions; only owners (including personal owners) can publish, unpublish, archive or reactivate. Publishing requires explicit public-sharing approval.
- The public snapshot is separate from the draft. Saving or restoring a draft leaves the live page unchanged until the owner republishes. Mutation versions and atomic D1 batches prevent stale overwrites and partial revision writes.
- Keep the latest 50 revisions. Archive releases the active page allowance; restore produces a private draft and enforces the allowance. Pilot limits: 10 personal / 100 company active pages.
- Public resource buttons resolve only stored items from the current published snapshot at `/p/:slug/go/:itemId`. No client-supplied destination redirect is accepted.
- A page QR directly encodes the stable page URL using the existing designer, including SVG/PNG/JPG exports and saved designs. It does not add a second QR-tracking redirect; eligible page requests remain page requests, not claimed physical scans.
- Page views and resource clicks are separate from link/QR visit totals. They require existing workspace opt-in, exclude HEAD/bots/prefetch, retain no IP/cookies/user-agent/referrer content, use UTC and the established 90-day policy. Best-effort writes never block public responses. Existing cron also prunes resource events.

## Evidence

51 registered tests pass. New cases cover draft privacy, escaped public output, permissions, explicit publication approval, public snapshots, stale writes, revision restore/history bounds, archive/reactivate, quotas, reserved addresses, measurement exclusions/counts, retention and write-failure isolation. Existing original redirects, links, UTM, QR and account regressions pass.

Enterprise browser checks cover editor/public desktop/mobile layouts, private draft changes after publication, page QR PNG decoding, unpublish returning 410 and private-state clearing on logout. Analytics/ZIP/PDF regressions pass.

Staging applied migration 0007 and deployed the Worker with `/p/*` run_worker_first. A synthetic staging-only page served through the actual edge; a page HEAD remained 200, a stored resource button redirected, missing page returned 404 and anonymous private API returned 401. Remote D1 reconciled two eligible page requests and one resource click across the test runs; HEAD added no event. Foreign-key check was empty. Synthetic staging records were removed. No production resource content was created during testing.

Provider references: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/ and https://developers.cloudflare.com/d1/worker-api/d1-database/ .

## Rollback

Keep public `/p/` resolution after issuing pages/QRs. Hide new authoring UI or deploy a compatible resolver rather than reverting to a Worker predating resource pages. Unpublish/archive can revoke a page without deleting its address or revision records. Production recovery uses the provider Time Travel bookmark; no local database export was made.

Production release: Worker `87f3e8b4-8a67-40fb-8ae1-f53069d3af9c`; migration 0007 applied. Delivered assets match the verified build, anonymous resource API returns 401, an unissued public page returns the resolver’s 404, and production foreign-key check is empty.
