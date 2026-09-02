# Setting up Google and Discord login

Step-by-step for wiring "Continue with Google" and "Continue with Discord" into a
LimitedGauntlet deployment. For how SSO logins resolve to an account (link by
email, invite provisioning, the one-identity-per-account rule, SSO-only mode,
the relink flow) see [`deployment.md` §8](deployment.md#8-optional-sso-login-oidc-google-discord)
— this doc is only the provider console walkthrough.

Both providers are **optional and independent**. Configure one, both, or neither
(alongside or instead of the generic OIDC provider). A provider with no
credentials set simply has no button.

---

## Before you start

You need the app's public base URL — the exact origin browsers use to reach it,
**HTTPS, no trailing slash**. Example: `https://gauntlet.example.com`.

Set it as `APP_BASE_URL` in `.env` if you haven't already:

```sh
APP_BASE_URL=https://gauntlet.example.com
```

Every redirect URI below is `APP_BASE_URL` + a fixed path:

| Provider | Redirect / callback URI |
|----------|-------------------------|
| Google   | `https://gauntlet.example.com/api/auth/sso/google/callback` |
| Discord  | `https://gauntlet.example.com/api/auth/sso/discord/callback` |

These must match **exactly** in the provider console — scheme, host, path, no
trailing slash, no extra query string.

---

## Google

### 1. Create (or pick) a Google Cloud project

Go to the [Google Cloud Console](https://console.cloud.google.com/). Use the
project picker in the top bar to create a new project (any name — it's only an
internal container) or select an existing one.

### 2. Configure the OAuth consent screen

In the console, open **APIs & Services → OAuth consent screen** (in the newer
console this lives under **Google Auth Platform**). You have to do this once
before you can create credentials.

- **User type / Audience:** choose **External** unless this is a Google Workspace
  org and you only want people in that org to log in (then **Internal**).
- **App information:** app name (shown on the Google consent screen), a user
  support email, and a developer contact email. These are required.
- **Scopes:** add `openid`, `.../auth/userinfo.email`, and
  `.../auth/userinfo.profile`. All three are **non-sensitive** — no Google
  verification review is required for them.
- **Test users:** while the app's publishing status is **Testing**, only Google
  accounts you add here can sign in (up to 100). Add yourself and anyone else who
  needs access now.
- **Publishing status:** you can leave it in **Testing** (fine for a small fixed
  group) or click **Publish app** to move to **In production**. Because the
  scopes are non-sensitive, publishing does **not** trigger a Google review — it
  just lifts the test-user cap. An unpublished app shows an extra "Google hasn't
  verified this app" interstitial on the consent screen; it still works.

### 3. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**.

- **Application type:** Web application.
- **Name:** anything (internal only).
- **Authorized JavaScript origins:** leave empty — the flow is server-side, no
  browser code calls Google directly.
- **Authorized redirect URIs:** add exactly
  `https://<your-domain>/api/auth/sso/google/callback`. Google requires HTTPS
  here (except for `localhost`).

Click **Create**. Copy the **Client ID** (ends in
`.apps.googleusercontent.com`) and **Client secret**.

> New or changed redirect URIs can take **5 minutes to a few hours** to take
> effect on Google's side. If you get `redirect_uri_mismatch` right after adding
> one, wait and retry.

### 4. Set the env vars and restart

```sh
GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
```

```sh
docker compose up -d       # picks up the new env
```

---

## Discord

### 1. Create an application

Go to the [Discord Developer Portal](https://discord.com/developers/applications)
→ **New Application**. Name it (this name shows on Discord's authorization
screen). Accept the terms, **Create**.

There is no bot and no consent-screen review for this — it's plain user OAuth2.

### 2. Configure OAuth2

Open the **OAuth2** section in the left sidebar.

- **Client ID:** shown at the top — copy it.
- **Client Secret:** click **Reset Secret** (or **Reveal**) and copy it. Discord
  shows a secret once; reset again if you lose it.
- **Redirects:** click **Add Redirect** and enter exactly
  `https://<your-domain>/api/auth/sso/discord/callback`. Save changes at the
  bottom of the page.
- **Scopes:** you don't select these in the portal — the app requests
  `identify` + `email` at login time. (The portal's "OAuth2 URL Generator" is
  just a link builder; ignore it.)
- **"Requires OAuth2 Code Grant":** leave this **off** (the default). It's for a
  different bot-authorization scenario and isn't needed here.

### 3. Set the env vars and restart

```sh
DISCORD_CLIENT_ID=…
DISCORD_CLIENT_SECRET=…
```

```sh
docker compose up -d
```

> Discord only reports an email as usable when the user has **verified their
> email with Discord**. Someone whose Discord email is unverified will see
> "your identity provider didn't share a verified email" and can't be matched to
> an account — they'd need to verify it with Discord first, or use another login
> method.

---

## Verify it works

1. Open the app's **/login** page. You should see a **Continue with Google** /
   **Continue with Discord** button for each provider you configured. If a button
   is missing, its `*_CLIENT_ID` **and** `*_CLIENT_SECRET` aren't both set, or the
   container wasn't restarted.
2. Click it, approve on the provider's screen, and you're redirected back.
3. Outcome depends on your account state (full detail in `deployment.md` §8):
   - Email matches an existing organizer → **logged straight in** (and that
     provider identity is now linked to your account).
   - Email matches a pending co-organizer invite → a passwordless account is
     created in that org.
   - Unknown email + `ALLOW_SIGNUP=true` → the org-setup screen.
   - Unknown email + `ALLOW_SIGNUP=false` → bounced to `/login` with "No
     organizer account matches your SSO identity."

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **`redirect_uri_mismatch` (Google)** or **"Invalid OAuth2 redirect_uri" (Discord)** | The redirect URI in the console doesn't exactly match `APP_BASE_URL` + `/api/auth/sso/<provider>/callback`. Check scheme (`https`), host, no trailing slash, and that `APP_BASE_URL` is set correctly. On Google, also wait for propagation. |
| **Button doesn't appear on /login** | Both `*_CLIENT_ID` and `*_CLIENT_SECRET` must be set for that provider, and the app container restarted. Check `GET /api/app-config` — it lists the providers it will show. |
| **Google: "Access blocked: app is not verified" / "hasn't been verified"** | Expected while the consent screen is in **Testing** — add the user as a test user, or **Publish app** (no review needed for the non-sensitive scopes used here). |
| **Google: "Access blocked: app is being tested" / `Error 403: access_denied`** | The signing-in Google account isn't in the consent screen's **Test users** list. Add it, or publish the app. |
| **"Your identity provider didn't share a verified email"** | The provider returned no email or an unverified one. On Discord, the user must verify their email with Discord. On Google, ensure the `email` scope is on the consent screen. |
| **After clicking the button: "That SSO login expired before it finished."** | The session cookie was lost between the redirect out and the callback — usually a cookie/`SameSite` issue behind a misconfigured proxy, or `APP_BASE_URL` not matching the host the browser actually used. |
| **"Your identity provider's account for this email looks different than what we have on file"** | You already linked this account to a *different* SSO identity (another provider, or the same provider's subject changed). This is the deliberate one-identity-per-account guard — follow the relink link emailed to your existing address, or the operator CLI (`deployment.md` §8). |
| **`sso_not_configured` (HTTP 404) at `/api/auth/sso/<provider>/login`** | That provider's credentials aren't set on the server. |
