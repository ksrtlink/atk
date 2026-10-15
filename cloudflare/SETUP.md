# Activate the email-account version

The migration is prepared for **Cloudflare Workers + Static Assets + D1**, with **Firebase Authentication** for verified email/password accounts. You do not need to purchase a domain or create a Cloudflare Pages project. Start with the Worker's free `workers.dev` address.

The current GitHub Pages manager and its eight original redirect folders remain operational. This folder is a separate deployment target. Do not replace the working GitHub Pages site until the new deployment has passed the live checks below.

## 1. Create the two free accounts

1. Sign up at https://dash.cloudflare.com/sign-up. Stay on the Free plan.
2. Create a Firebase project at https://console.firebase.google.com/ on the Spark plan. Google Analytics is optional and unnecessary for this tool.
3. In Firebase, open **Build → Authentication → Get started → Sign-in method**. Enable **Email/Password**. Passwordless email-link sign-in is not required.
4. Under Authentication settings, configure a password policy with at least eight characters and enable email-enumeration protection where available. Set verification and password-reset email templates to “TinyTrail”. Firebase owns these emails and hosts their action handler; this application never receives a verification code or user password on its backend.
5. In **Project settings → General → Your apps**, register a **Web** app. Do not enable Firebase Hosting. Copy the public `projectId` and `apiKey` from its configuration. These are client configuration identifiers, not service-account private keys. Do not share passwords, service-account JSON, refresh tokens, or Cloudflare API tokens in chat.

No Firestore database, Firebase Storage, Cloud Functions, Google Analytics, or paid Firebase service is needed. This release implements email/password with address verification. Google sign-in can be added later through Firebase; it is not enabled by the current UI.

## 2. Prepare Cloudflare locally

Use Node.js 22.13 or later. From this `cloudflare` directory:

```powershell
npm ci
npx wrangler login
npx wrangler d1 create tinytrail-db
Copy-Item wrangler.example.jsonc wrangler.jsonc
```

`wrangler login` opens the official Cloudflare browser authorization flow. Complete it yourself. The D1 create command returns a `database_id`; place that ID in the ignored `wrangler.jsonc` file.

In `wrangler.jsonc`, set:

| Setting | Value |
| --- | --- |
| `name` | An available Worker name, e.g. `tinytrail` |
| `d1_databases[0].database_id` | The actual ID returned by D1 create |
| `vars.FIREBASE_PROJECT_ID` | Your Firebase `projectId` |
| `vars.FIREBASE_API_KEY` | Your Firebase Web API key |
| `vars.PUBLIC_ORIGIN` | Leave empty initially; the request origin is used |
| `vars.ALLOWED_EMAIL_DOMAINS` | Empty allows any verified email; `kearney.com` restricts profile access to that domain |

Keep `workers_dev: true`. Do not commit `wrangler.jsonc`, login credentials, `.dev.vars`, or local database state. The Firebase web API key is public client configuration and can be restricted to the Firebase Authentication APIs in Google Cloud; project-level quotas and abuse controls still apply.

## 3. Import the original eight links and deploy

```powershell
npm run db:remote
npm test
npm run deploy
```

The migrations create the tables and import the original eight links exactly once. Their stored public URLs remain `https://ksrtlink.github.io/atk/<original-slug>/`. They appear in **Original 8 links**, available to everyone and read-only. They do not become editable records owned by the first person to sign in.

The deploy command prints the real address, such as `https://<worker-name>.<your-subdomain>.workers.dev`. That example is not an already-created address. Open `<actual-address>/manage/`.

Add the real hostname under **Firebase Authentication → Settings → Authorized domains**. Review the action URL/email templates and confirm they use the Firebase-hosted handler, or configure the new application domain as an allowed continue URL if adding a custom return flow. The current code does not require a custom action handler.

The public app requires Firebase and D1 to be configured to create accounts and save work. A local preview with missing configuration clearly reports that account activation is pending; there is no fake production login or browser-only profile storage.

## 4. Verify before sharing with the team

1. Create an account with an email you control. Confirm the actual verification email arrives.
2. Before verification, confirm the private library and creation API are denied.
3. Verify using the email link, return to the app, and click **I’ve verified my email**.
4. Create a link. It should be ready immediately at `/r/<name>`, with no GitHub sync or deployment wait.
5. Open the link anonymously and confirm it redirects to the intended destination.
6. Open its QR designer, name the design, and click **Save to my profile**. Export and scan the SVG/PNG/JPG.
7. Sign out and sign in on another browser/device. Confirm the link and saved QR design are present.
8. Sign in with a second verified account. Confirm it cannot see or edit the first account's links or designs.
9. Open all eight original GitHub Pages URLs and confirm the old QRs still resolve normally.

Private means the management records and QR designs belong to the account. Short links themselves are intentionally public so scanners do not need to sign in.

The application keeps refresh credentials in per-tab session storage so it can renew the Firebase ID token after a page reload. Passwords go directly to Firebase and are cleared from the form. The backend verifies the RSA signature, project audience, issuer, expiry, authentication time, email-verification claim, and optional email-domain restriction. It never trusts a browser-supplied owner ID. Standard ID-token revocation behavior applies: a disabled account may retain access until its current ID token expires (normally up to one hour); immediate revocation checking can be added if required.

## 5. Connect a custom domain later

1. Add the purchased domain to the same Cloudflare account.
2. In the Worker settings, add a **Custom Domain**, or add the equivalent custom-domain route to `wrangler.jsonc` and deploy it.
3. Keep `workers_dev: true` and verify the original Worker hostname remains enabled. Existing QRs may encode that address.
4. Set `PUBLIC_ORIGIN` to the new HTTPS origin, e.g. `https://kearney.page`, without a trailing path, and redeploy.
5. Add the custom hostname to Firebase's authorized domains and adjust API-key restrictions/action templates if applicable.
6. Test both the old and new hosts. Do not retire the old hostname while printed QR codes still use it.

Only **new** links use the new `PUBLIC_ORIGIN`; every saved link retains its original `short_url`. Both hosts resolve `/r/<name>` through the same database. Updating a destination therefore keeps a printed QR code's address working. Saved QR designs retain their exact encoded URL; they are never silently rewritten to the new domain.

GitHub remains the source-code repository and can trigger deployments through a later Workers Git integration. End users never connect to GitHub. Keep the old GitHub Pages redirect folders online independently of the new deployment. The original eight links stay read-only in the new app until a deliberate, tested bridge migration is requested; changing a D1 record alone would not update the old hardcoded HTML redirect.

## Data and operational notes

- Users own their link records and QR designs. The QR design stores the URL and styling settings; exported binary images need no paid file storage and can be regenerated.
- New link names are globally unique. Changing destinations preserves short URLs. Saved versions prevent overwriting changes from another tab.
- Creation uses idempotency IDs to avoid duplicates after uncertain responses. The default per-user cap is 200 links and 200 designs and is configurable up to 1000.
- Free Workers and D1 quotas apply. Exceeding free limits can interrupt service; no code here enables a paid plan automatically. Watch usage before promoting the tool broadly.
- Back up D1 and test exports before operational use. Do not delete or recreate the database when changing the domain.
- A custom domain is optional for testing and does not improve authorization by itself.

## Development checks

```powershell
npm run build
npm test
npx wrangler deploy --dry-run --config wrangler.example.jsonc
```

The backend tests use real RSA signatures and in-memory SQLite. Browser tests use `tests/browser-server.mjs` on loopback, simulate Firebase's HTTP responses, and exercise the real ownership checks, JWT verification, and SQL operations. They verify the UI without sending emails or creating cloud resources. Fixtures do not verify actual Firebase delivery or deployed Cloudflare access.

## Official references

- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Firebase email/password REST API](https://firebase.google.com/docs/reference/rest/auth)
- [Firebase ID token verification requirements](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
