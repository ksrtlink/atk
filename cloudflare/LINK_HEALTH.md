# Link monitoring

Link owners can enable Health from a saved link row, view every saved destination and run checks. Members can read results. Legacy GitHub links are excluded. This is opt-in: enabling the deployment feature does not monitor every existing link.

## Coverage and behavior

The default destination and all destinations in enabled routing are checked, including future and expired schedules. Disabling routing removes its targets on synchronization. URLs differing only by fragment share one check and retain all rule labels. Destination edits mark coverage stale until synchronization. A monitor supports up to 41 distinct destinations.

Results distinguish healthy (2xx), broken (404/410), restricted (401/403/407/429/451), unreachable (network/timeout/5xx) and unknown (including HEAD unsupported). A HEAD check cannot prove a page works in a browser; restricted and unsupported responses are not labeled broken. Latest results only are retained, with UTC timestamps. No response bodies, arbitrary error messages or notification recipients are stored.

The pilot caps monitoring at 12 links per company, 3 per personal account and 24 across the deployment. The five-minute queue checks at most four targets per invocation and synchronizes one stale monitor. Each checked target becomes due after 24 hours; large queues complete incrementally. Manual checks process two targets at a time, offer Continue checks for pending targets and enforce a five-minute repeat cooldown after a completed round. Sixty-second leases recover interrupted work; an older lease cannot overwrite its replacement. Trash stops checks. Workspace transfers clear previous monitoring data; the new owner must opt in.

## Network and privacy boundary

Only saved owned destinations are accepted; request-body URLs are ignored. Requests use HEAD, no cookies, authorization or referrer, a fixed identifying user-agent and no-store. HTTP(S), standard ports only; no embedded credentials. Local/private/reserved/metadata/mapped IPs, local hostnames, Tinytrail itself and its legacy GitHub host are rejected. Each redirect is validated again, with at most three HTTP requests, no HTTPS downgrade, bounded DNS/header sizes and a 12-second total deadline. Response streams are cancelled.

A/AAAA DNS-over-HTTPS preflight fails closed on malformed, incomplete or non-public answers. Preflight alone cannot prevent rebinding. Deployment requires Cloudflare's global_fetch_strictly_public boundary, forbids the private-origin compatibility flag and uses native global fetch without private network bindings. Configuration checks enforce the boundary and cron. ipaddr.js 2.5.0 handles IP classification. See Cloudflare's compatibility documentation and workerd network policy: https://developers.cloudflare.com/workers/configuration/compatibility-flags/ and https://github.com/cloudflare/workerd/discussions/1523 .

Checks do not request Tinytrail /r or /q routes and do not create engagement events. Private APIs require verified workspace membership; configuration and manual checks require ownership. Feature disabled returns unavailable and the scheduled handler does no monitoring.

## Release evidence

97 registered tests pass, covering network validation, status distinctions, bounded redirects/DNS/timeouts, configuration guards, full target coverage, permissions, workspace isolation, transfer cleanup, quotas, daily scheduling, cooldowns and expired/late leases. Desktop/mobile browser checks cover enable/check/resume, all routing targets, summary labels, existing links, QR exports, resources and staff flows. The separate analytics browser regression passes with no errors.

A deployed temporary Worker exercised the actual network module against synthetic public responses: 200, 404, 410, 403, 405, 503, redirects, loops and a private mapped-IPv6 redirect. A stale-preflight simulation supplied a public preflight answer for a hostname whose real DNS resolved to loopback; native Cloudflare fetch denied it with HTTP 530/error 1016. This is a simulated stale preflight, not a controlled rotating-DNS experiment. No private service was contacted or test record inserted in production.

The real staging five-minute cron synchronized three saved destinations and persisted healthy/200, broken/404 and restricted/403 results at 2026-10-19 21:45 UTC. Staging has a distinct Worker/database. Wrangler was updated to 4.151.2; installation reported zero known dependency vulnerabilities.

## Operations and rollback

Capture a D1 Time Travel bookmark before applying additive migration 0012_link_health.sql. Apply in staging first, build, run configuration checks, deploy and compare delivered assets. Verify private endpoints reject anonymous callers, foreign keys are clean and checks create no engagement events. Remove synthetic staging fixtures and temporary runtime Workers afterward.

To stop monitoring, set LINK_HEALTH_ENABLED=false and redeploy; remove only the five-minute health cron while retaining the existing hourly pruning trigger. Keep additive tables and existing redirect/QR routes. Revert compatible Worker code if needed. There are no external alert deliveries in this release. Quotas and throughput are intentionally bounded for the pilot; increase them only after reviewing actual D1/subrequest consumption.

Production migration 0012 and Worker c2ba9c61-90a1-4539-9820-2bb98390d473 deployed on 19 October 2026. Foreign keys are clean and existing monitors remain opt-in (zero enabled automatically). The staging fixture created zero engagement events. Synthetic staging rows and both temporary runtime Workers were removed after verification.
