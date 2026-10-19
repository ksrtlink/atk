# Company card templates and employee imports

Company owners find both tools under Contact cards. They are hidden for personal accounts and ordinary employees; the API enforces the same permissions.

A company template supplies organization, department and office defaults plus the fields assigned employees may edit. It affects newly templated drafts only. Existing profiles/public snapshots stay unchanged. Version checks prevent stale template saves and reject importing a preview prepared with an older template.

## Employee CSV contract

Download the CSV template in the app. Required columns: slug,name. Supported optional columns: givenName,familyName,title,organization,department,email,phone,office,intro,pronunciation,linkedin,booking,employeeEmail. Unknown/duplicate headers and inconsistent row widths are rejected. Blank optional fields remain blank; omitted organization/department/office columns inherit company defaults.

- Maximum 100 rows and 150 KB input; normal API size limits also apply.
- Validate preview performs no writes. It checks contact fields, safe destinations, duplicate/reserved addresses and exact approved-member email assignments.
- Editing CSV invalidates the preview. Starting an import validates again on the server, with the current template version.
- Only new private drafts are created. Existing addresses are never overwritten or automatically republished.
- Creation uses a stable import ID and per-row profile/QR identities. Each request processes at most ten pending rows; Continue import handles the next batch. Retry failed rows is explicit. Errors do not prevent later pending rows from running.
- Each row commits profile, revision and result atomically. Concurrent runners converge on one saved profile and result. Removed employee membership is checked again at commit.
- Saved imports can be resumed after refresh. Result exports protect all text against spreadsheet formula execution, including names and error messages.
- Remove import history deletes uploaded row data and results; it keeps created cards and their public/QR identities. Up to 100 saved imports are retained per company, with 50 most recent listed. Owners can remove old history to free space.

No invitation email or other outbound notification is sent by import. Account emails used for assignment are private; the separately entered email field is the public contact address only after explicit card publication.

## Verification and limits

71 registered tests pass, covering templates/versions, dry-run validation, chunk resume, immutable retry identities, cross-company and owner permissions, race conflicts, removed memberships, concurrent runners and history deletion without breaking foreign keys/cards. Desktop/mobile browser tests exercise 12-row import, invalid data, changed-preview lockout, private imported cards, safe CSV export and completed-batch controls. Existing link, QR, resource, routing and analytics regressions remain registered.

Staging migration 0010 applied. Worker b35042e9-c2ee-490a-a858-5df072919bf2 deployed and private template/import endpoints reject anonymous access. Delivered files are checked against the verified build before production. No real employee fixture is inserted into production.

Production migration 0010 and Worker a9ac64cc-8be6-44e9-857e-d3b7cf3bff8e deployed; delivered files, anonymous private API denial and foreign-key checks passed.

This completes the import/template portion, not Wallet or photo storage acceptance gates. Sharing-asset progress is in STAFF_DISTRIBUTION.md. See STAFF_CARDS.md and FULL_PLAN_PROGRESS.md for remaining work.
