# Campaign URL builder

Scope: optional UTM destination parameters for individual links/QRs and bulk creation. This is the UTM subfeature from Release 5, selected by the user independently of the deferred employee features. No database, authentication, analytics collection or external-service changes.

## Behavior

- Source, medium, campaign, term and content accept up to 200 characters each, trim surrounding whitespace and preserve case.
- The collapsed Campaign tracking section shows a live individual destination preview and Copy campaign URL. Tags apply automatically to Shorten link and the creation form’s Create QR code action.
- Keep existing values is the default. Replace supplied fields replaces all matching existing instances of those fields only; blank inputs never remove existing tags. Encoded and mixed-case existing keys are recognized. Unknown parameters and fragments remain intact; unrelated query bytes are preserved rather than reserialized.
- URL parsing and parameter encoding use URL/URLSearchParams. HTTP(S) and no embedded credentials are required. The final URL remains bounded to 4,096 characters and passes existing destination validation on save.
- Bulk supports common tags and optional utm_source/utm_medium/utm_campaign/utm_term/utm_content CSV columns. Nonblank per-row fields override common fields; keep/replace policy then governs the destination’s existing tags. Preview displays the final URLs. Campaign edits invalidate that preview and creation request ID. Bad values are reported per row before creation.
- Campaign fields are temporary form state. Clear fields resets the additions, not existing URL tags. Successful link creation, cancel/edit reset and account/workspace changes clear their state. Bulk jobs store the final URL through existing APIs so resume/export needs no new UTM metadata.
- UTMs describe the destination campaign; they do not create campaign dashboards, change TinyTrail tracking identities, or prove destination conversions.

## Verification

Nine registered URL regressions cover query bytes/duplicates/fragments, preservation/replacement, encoded keys, Unicode and reserved characters, unsafe input, length bounds and repeated application. Existing 33 backend tests remain in the same runner.

Enterprise browser coverage verifies preview matches saved individual destination and QR handoff; bulk saved destinations use shared/row overrides; post-preview changes disable creation; desktop/mobile fit; state resets on sign-out. Existing analytics/QR decode and export tests remain applicable. Screenshots are private local QA artifacts.
