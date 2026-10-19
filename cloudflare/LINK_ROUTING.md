# Link destination rules

Use Rules on an active non-legacy link. Existing printed short-link and linked-QR addresses stay unchanged.

Enable rules explicitly. Scheduled windows run first (start inclusive, end exclusive); overlapping windows are rejected. Enter local dates with an explicit IANA timezone. Ambiguous and nonexistent daylight-saving times are rejected rather than guessed. Audience rules run top to bottom after schedules. Country and language constraints on the same rule both must match. The highest-priority accepted browser language is used. Missing geography/language or unmatched rules use the link destination as fallback. Direct QR designs are unchanged.

Save applies the draft. Test before saving simulates a UTC instant, country and language without changing data or following destinations. Clear changes the editor draft until saved. Rules require the same workspace access as editing the link. Optimistic versions cover both rules and the parent link. Deleted links cannot resolve and legacy links cannot acquire rules. Destination safety validation also runs during resolution. No raw request language or geography is persisted by this feature. Redirects use no-store and Vary: Accept-Language; country routing is evaluated at the edge without public redirect caching.

## Verification

59 registered tests pass, including timezone/DST/calendar validation, adjacent and overlapping windows, boundary precedence, language quality exclusions, audience order, fallback, permissions, stale writes and both linked public redirect routes. Enterprise browser tests cover editing, test preview, saving and mobile layout. Analytics browser tests retain count reconciliation and QR identity checks.

Staging Worker 3181d8cf-850e-475a-8fba-66b8e20ff9b5: actual HEAD /r and linked /q redirects verified for active schedule and French-language rules; English mismatch reached fallback. Raw response headers confirmed expected Location and no-store. Synthetic staging records were removed after verification. Production rollout requires migration 0008 before deploying the Worker.

Recovery: D1 Time Travel metadata captured before migration; forward additive tables retain existing link/QR records. To roll back behavior, deploy the prior Worker version; keep the additive migration and data. Do not drop production tables as a rollback.
