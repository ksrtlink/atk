# ATK Link studio

Manage short links at **https://ksrtlink.github.io/atk/manage/**.

The eight original redirect folders and the root redirect are preserved. The manager is plain HTML, CSS, and JavaScript modules, with no dependencies or build step. GitHub Pages continues to serve each `<name>/index.html` as before.

## Use

Browse, search, copy links, or download a CSV without signing in. The library reads the current GitHub repository, not a separate database. If GitHub cannot be reached, the app clearly labels its bundled eight-link snapshot as potentially out of date.

To create or edit a link, click **Connect GitHub**. Generate a fine-grained GitHub personal access token for resource owner `ksrtlink`, repository `atk`, and **Contents: Read and write**. Your GitHub account must already have write access. Use a short expiration. No token is included in the code. Tokens are sent only to `https://api.github.com`, held in the tab's memory, and cleared on refresh, disconnect, or leaving the page. They are never placed in localStorage, sessionStorage, cookies, or the repository. No third-party scripts run on the manager page. GitHub repository permissions and branch rules remain authoritative. If fine-grained tokens are unavailable to a collaborator, the repository owner should configure a GitHub App/server-based sign-in flow rather than share a token.

1. Enter the full destination URL and a unique lowercase name.
2. Click **Create short link**. The app checks the repository for an existing folder or file and creates `<name>/index.html` with the GitHub Contents API. No existing redirect is overwritten by creation.
3. Copy the resulting `https://ksrtlink.github.io/atk/<name>/` URL.
4. Wait for Pages to publish. Use **Check publishing** to confirm the live HTML matches the saved destination before generating or printing a QR code.

**Edit** changes the destination only; the slug and existing QR codes stay the same. An explicit confirmation is required. Updates include the loaded file's SHA to prevent overwriting concurrent changes. A lost save response is not automatically retried: inspect Refresh and GitHub first. There is intentionally no delete action.

Public read API requests are rate limited by GitHub. Connecting raises the applicable API allowance. A connection confirms account write access; the first actual save also verifies the token's Contents permission. A GitHub commit succeeding does not by itself confirm a successful Pages deployment.

## Hosting

Keep the existing Pages source pointing at `main` / repository root. The manager is an additional `/manage/` page; the main `index.html` remains its existing redirect. GitHub Pages has no application server. This version therefore uses a user-supplied, in-memory token rather than storing a shared write credential. A future GitHub App and small backend can replace the token step with sign-in; agent connector authorization does not transfer to website visitors.

QR styling/export is a separate future phase. This release creates the stable URLs to encode.

## Local development

From this directory, run `python -m http.server 4173 --bind 127.0.0.1`, then visit `http://127.0.0.1:4173/manage/`. Read-only repository requests work normally. Local publishing verification may be limited by CORS; the app reports that rather than claiming success.

Run `node --test tests/core.test.mjs` and `node --check manage/app.mjs`.

API contract: [GitHub repository contents documentation](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
