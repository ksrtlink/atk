# TinyTrail deployment

- App: https://tinytrail.link/manage/
- Platform: Cloudflare Workers + Static Assets
- Worker name: `tinytrail`
- Database: `tinytrail-db` (binding `DB`)
- Public link origin: `https://tinytrail.link`
- Firebase project: `k-shortlinks`
- Apply migrations through `0006_link_trash.sql` before deploying the link Trash release. The additive deletion timestamp defaults to NULL for all existing links.
- The custom domain was bound successfully during deployment. Cloudflare reports the domain zone as active.
- The original eight GitHub Pages HTML redirects have not been changed. The imported records retain those exact URLs and remain read-only.

The neutral teal/ink TinyTrail theme and wordmark apply only to the Cloudflare build. Shared QR controls are adapted at build time; the existing GitHub Pages manager remains compatible.

Production settings are kept in the ignored `wrangler.jsonc` file. Cloudflare authorization is managed by Wrangler's OAuth login. No Cloudflare token, password, or private Firebase service-account key is included in the repository.

## Redeploy

From `cloudflare/`, after Wrangler authorization:

```powershell
npm ci
npm test
npm run db:remote
npm run deploy
```

The commands use the `DB` binding so the database name can vary between environments. Do not delete or recreate the database for routine deployments. Existing short addresses are stored immutably; changing `PUBLIC_ORIGIN` only changes new records.

## Firebase console checks

- Enable **Authentication → Sign-in method → Email/Password** (the first switch; passwordless email-link sign-in is not required).
- Add `tinytrail.link` under **Authentication → Settings → Authorized domains**. Add any retained workers.dev hostname if users will sign in there too.
- Use “TinyTrail” in verification and reset email templates. Keep the Firebase-hosted action handler unless a custom handler is deliberately implemented.
- Test sign-up, email verification, sign-in, and password reset using an email you control. Do not share account passwords.

The local build, local D1 migration, RSA-token verification, ownership tests, and simulated browser account/QR flows have passed. Cloudflare confirmed the production deployment and custom-domain binding. Direct HTTP checks of the new domain and Firebase timed out from the author's execution environment, so actual client access and email delivery need a live user check before broad sharing.
