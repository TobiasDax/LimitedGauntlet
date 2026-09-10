# GDPR / DSGVO notes

Limited Gauntlet stores personal data about identifiable people — player names,
match results, organizer emails, and (optionally) visitor IP addresses. If you
run an instance for people in the EU/EEA (or the UK), the GDPR / DSGVO applies to
you.

> **Not legal advice.** This document is a starting point written by the
> project, not a lawyer. It describes what the software does with personal data
> so you can build your own compliance on top of it. Get advice for your own
> situation if you are unsure.

---

## 1. Who is responsible

**You — the person or group running the instance — are the data controller**
(*Verantwortlicher*, Art. 4(7) GDPR). The Limited Gauntlet project is not: it
ships software, it does not operate your deployment or see your data.

That means the legal obligations are yours:

- having a **lawful basis** for every kind of processing (Art. 6),
- **informing the people** whose data you enter (Art. 13/14) — especially
  players, who never touch the app themselves,
- honouring **data-subject rights** (Art. 15–21),
- signing a **data processing agreement** (*Auftragsverarbeitungsvertrag*,
  Art. 28) with each processor you enable (your mail provider, your analytics
  host, your VPS host, …),
- keeping a **record of processing activities** (*Verzeichnis von
  Verarbeitungstätigkeiten*, Art. 30) if it applies to you,
- **notifying** your supervisory authority within 72 hours of a personal-data
  breach (Art. 33), and affected people if the risk is high (Art. 34).

The project's job is to give you the tools and the transparency to do this. Where
a tool is still missing, it is called out below and tracked in `ROADMAP.md`.

---

## 2. What personal data the software processes

### 2.1 Data you enter

| Data | Model / location | Visibility | Notes |
|---|---|---|---|
| Player display name | `Player.displayName` | **Public** on `/o/<slug>/…` pages by default | Usually a real name or a well-known nickname. Entered by an organizer; the player is not asked. |
| Match results, pairings, drops | `Match`, `Round`, `Entrant.droppedAfterRound` | **Public** | Behavioural data about identifiable people. |
| Standings, Gesamtwertung, Hall of Fame, career stats | computed from the above | **Public** | Aggregated and cross-year. |
| Card-pull attribution | `CardPull.playerId` (+ `cardPullInference.ts` heuristic) | **Public** (Value tab) | The heuristic *infers* "who pulled the valuable card" and writes it as an unreviewed guess. |
| Token balance | `TokenTransaction` sum | **Public** | Only when the org enables tokens. |
| Token ledger + free-text notes | `TokenTransaction.delta`, `.note` | Organizers + the player's own account | Append-only; **never deleted by design**, even when the feature is turned off. |
| Organizer identity | `OrganizerAccount` (`email`, `passwordHash` (argon2), `name`, `oidcSubject`, `lastActiveOrgId`) | Private | |
| Organizer ↔ org grants | `OrganizerMembership` | Private | |
| Player self-service account | `Player.email`, `PlayerIdentity` (`email`, `passwordHash`) | Private | Opt-in (PI-52). |
| Invitations and email changes | `OrganizerInvite.email`, `PlayerInvite.email`, `EmailChangeRequest.newEmail`, `OidcSubjectRelinkRequest.email` (+ token hashes) | Private | Time-limited, single-use, only the token hash is stored. |
| Free-text fields | `Tournament.description`, `Team.name`, `Pod.name` | **Public** | Can accidentally contain third parties' personal data. Rendered as text/links, never raw HTML. |

### 2.2 Data the software generates automatically

| Data | Where | Retention today | Notes |
|---|---|---|---|
| Client **IP address** + User-Agent + request path | Fastify request log (`logger: true`) → container stdout → wherever your host ships logs | **Undefined** — as long as you keep the logs | An IP address is personal data. Nothing in the app rotates or prunes this. |
| Client **IP address** + User-Agent forwarded to analytics | `routes/tracking.ts` → your Umami instance (`x-forwarded-for`, `user-agent`) | Set by your Umami config | Only when `TRACKING_*` is configured. Umami is cookieless by default. |
| Session cookie | `@fastify/secure-session`, encrypted, `httpOnly`, `SameSite=Lax` | 30 days fixed | Strictly necessary for login — no consent needed for this one. |
| Password / token hashes | argon2 (`passwordHash`), SHA-256 (`tokenHash`) | Life of the account | Good practice, no plaintext stored. |

### 2.3 Data sent to third parties

| Recipient | What is sent | When | Your obligation |
|---|---|---|---|
| **Scryfall** (`api.scryfall.com`) | Card names only — **no personal data** | Adding a card pull / autocomplete | None for GDPR. |
| **Your SMTP provider** | Recipient email + invitation/notification link (contains names) | Organizer/player invites, email changes | Processor — needs an **AVV** (Art. 28). Disclose in your privacy policy. |
| **Your Umami instance** | Visitor IP, User-Agent, page URL, referrer | Every page view, if analytics enabled | Processor if third-party-hosted — AVV + disclosure + lawful basis for the IP. |
| **Your OIDC / Google / Discord** | OAuth exchange for organizer login (`sub`, verified email) | SSO login, if enabled | Recipient — disclose. Google/Discord = **transfer to the USA** (Chapter V). |
| **Organizer-configured webhook targets** (Home Assistant, a Discord relay, …) | Pod/tournament names, **resolved player/team names**, table numbers, ranked standings, winner | Round start/extend/complete, pairings posted, pod completed | You chose the target. A Discord relay = **US transfer**. Disclose recipients. |
| **Operator admin webhook** | A new organizer's org name/slug + **their email** | New org signup, if `ADMIN_WEBHOOK_URL` set | Disclose to organizers that signup notifies the operator. |

---

## 3. Where the software makes compliance harder than it should

These are the known gaps. Some are fixed by documentation (this file + the
policy template); the rest are tracked as ROADMAP items.

### 3.1 Players are never informed and never consent — `PI-103` (docs), your duty

A player is entered by an organizer, never opens the app, is shown no privacy
notice, and their name plus full competitive history is published on an open URL.
You still need:

- a **lawful basis**. Realistic options:
  - **Art. 6(1)(f) legitimate interest** — running and publishing the results of
    a competition the person entered. Do the balancing test and write it down.
    This is the default assumption of the template.
  - **Art. 6(1)(b) contract** — if players are members of your club/association
    and results-keeping is part of that membership.
  - **Art. 6(1)(a) consent** — cleanest for a casual friend group; needed if you
    want to publish more than the minimum.
- **Art. 13/14 information** actually reaching the player. At minimum: hand them
  the privacy notice (or a link) when they join the roster. The invite email for
  player accounts should link to it.

The app now **ships the privacy notice** — a built-in Impressum + Datenschutz­erklärung
at `/legal`, linked from the footer, rendered in English from the `LEGAL_*` env
values (see `docs/deployment.md` § 2b). Fill at least `LEGAL_CONTROLLER_NAME` and
`LEGAL_CONTROLLER_EMAIL`; set `LEGAL_LAWFUL_BASIS` to the option you actually rely
on. `LEGAL_LINK_URL` is now only for an *additional* externally-hosted document.
The built-in page still doesn't do the rest of this section for you — you choose
the lawful basis, do and record the balancing test, and get the notice in front
of the players.

### 3.2 Erasure — `PI-104` ✅

`DELETE /api/players/:id` **cascades**: it deletes the player's `Entrant` and
`Match` rows and silently changes historical standings, Gesamtwertung and Hall of
Fame. That path stays only for genuine mistakes / test data.

To honour an **Art. 17** erasure request, use the roster's **Privacy →
Anonymise** action (`POST /api/players/:id/anonymise`). It scrubs the name to a
non-identifying label, clears the login email + identity link, deletes pending
invites, and blanks token-ledger note text — while keeping every result row, so
standings, Gesamtwertung and Hall of Fame numbers are unchanged. It is
**irreversible** (there is nothing to restore the name from) and gated behind a
confirm dialog. An anonymised entry cannot be re-invited to a login.

If the person wants a *full* delete rather than anonymisation, and you accept the
standings distortion, the cascade `DELETE` is still there.

### 3.3 Per-person data export — `PI-105` ✅

**Art. 15/20** give a person the right to a copy of their data. Alongside the
whole-org export, there is now a per-player export:

- organizer: roster row → **Privacy → Download data** (`GET /api/players/:id/export`);
- the player themselves: portal → **Your account → Download my data**
  (`GET /api/player/export`).

Both return a readable JSON file covering that one player's roster entry,
tournament check-ins, pods and finishes, every match with opponent and score,
card-pull attributions, and (when tokens are on) their token ledger.

### 3.4 Player self-service rectification — `PI-106` ✅

**Art. 16.** A logged-in player can now correct their own display name from the
portal (**Your account → Edit**, `PATCH /api/player/me`), subject to the same
name-uniqueness rule as the organizer.

### 3.5 Acting on an objection / pseudonymising a minor — `PI-106` / `PI-107` / `PI-110` ✅

**Art. 21.** A player can be pseudonymised on the open public pages without
touching the pod: roster row → **Privacy → Pseudonymise on public pages**
(`POST /api/players/:id/public-visibility`). Their name then renders as a
**stable handle** ("Player 7F2A") on every `/o/<slug>/...` route — the same
handle every time, so their results are still followable, just not by name.
Their public stats page works under that handle (opponent names on it are
pseudonymised too). The organizer's own views and all standings/pairing maths
are unchanged (they still count exactly as before).

**This is also the tool for minors (§3.9).** A stable pseudonym is still
*pseudonymised* personal data — GDPR still applies to it, because you hold the
map from the handle to the child — but it keeps a child's real name off a page
anyone can load or scrape, which is the proportionate protection Recital 38
asks for. It does not remove your other duties (lawful basis, Art. 8, retention).

A logged-in player can raise the request themselves from the portal (**Your
account → Request removal**, `POST /api/player/removal-request`) — this notifies
every organizer by email (when SMTP is configured) and always logs the request;
a human then anonymises or hides them. There is no self-executing erase, because
anonymisation is irreversible.

The org-wide public-password lock (`PI-27`, `Settings → Public page access`)
remains the option when the whole event should be non-public.

### 3.6 IP addresses in logs and analytics — `PI-108` ✅ (partly)

Two places touch a visitor's IP: the HTTP access log, and (if analytics is on)
the forward to your Umami collector. Both need a lawful basis (Art. 6(1)(f) for
secure operation is defensible) **and** disclosure, and the logs need a
retention limit. Two env knobs now reduce the exposure by default:

- **`REQUEST_LOG`** — `minimal` (the default) logs method / url path / status /
  duration but **not** the client IP or query string. `full` restores the raw
  request log; `off` drops the access log entirely.
- **`TRACKING_FORWARD_IP`** — `truncated` (the default) zeroes the last IPv4
  octet / IPv6 host bits before forwarding to the collector, so Umami still does
  country/region geo but never sees a full address. `full` sends the exact IP;
  `off` sends none.

Still on you:

- If you set `REQUEST_LOG=full`, give your container logs a retention limit
  (e.g. 14–30 days) and say so in your policy.
- Configure your Umami instance to hash or drop IPs as well (defence in depth).
- Keep analytics **cookieless** (Umami's default) — this keeps you out of the
  § 25 TTDSG consent requirement for storing/reading data on the device. If you
  add cookie-based analytics later, you need a consent banner.

### 3.7 No retention concept — `PI-108`

Nothing is deleted by design. The token ledger is explicitly permanent; disabled
pods keep their data. Multi-year history is a deliberate feature — but "storage
limitation" (Art. 5(1)(e)) still needs an answer. Decide how long you keep data,
write it in your policy, and delete old tournaments when that time is up.

### 3.8 Bulk history import — your duty

`import-legacy` loads real people's past results in bulk. Those people have the
same rights as anyone you add through the UI. Make sure they were informed at
some point that you keep and publish this history.

### 3.9 Minors

Magic events often include people under 16. **Art. 8** (consent of the holder
of parental responsibility) and Recital 38 (children's data merits specific
protection) are yours to handle:

- Get consent from a parent/guardian before entering a child on the roster, and
  keep a record of it. Legitimate interest is a weak basis for a child's data.
- **Tick Privacy → "Pseudonymise on public pages" (§3.5)** for every player
  under 16. Their results stay followable under a handle; their name never
  reaches the public pages. This is still pseudonymised personal data, not
  anonymous — but it's the right default for a child.
- The same retention limits (§3.7) apply; consider a shorter one for minors.

---

## 4. What the software already does right

- Passwords hashed with **argon2**; invite/API-token secrets stored only as
  **SHA-256 hashes**; plaintext tokens shown once.
- Session cookie is **encrypted, `httpOnly`, `SameSite=Lax`**, `Secure` when
  `SESSION_COOKIE_SECURE=true`.
- **Helmet CSP** locked to same-origin scripts/styles; `frameAncestors 'none'`;
  HSTS + COOP when behind TLS.
- **Rate limiting** globally and tighter on auth routes; `TRUSTED_PROXIES` must
  be set explicitly so forwarding headers can't be spoofed.
- Analytics is **off by default**, **cookieless**, **self-hosted only**, and
  proxied same-origin so no third-party host sees your visitors directly.
- Scryfall lookups send **card names only**.
- `X-Robots-Tag: noindex` + `robots.txt Disallow: /` on every response (a
  courtesy signal, not a legal control).
- Container runs **non-root** with `cap_drop: ALL`, `read_only`, `no-new-privileges`.
- Free-text fields render as **text + links, never raw HTML**.
- **Data-subject-rights tooling** (`PI-104`–`PI-107`, `PI-110`): anonymise a
  player without breaking the record, per-player data export (organizer and
  self-service), self-service name correction, and a per-player "pseudonymise on
  public pages" switch (a stable handle — also the tool for minors).
- **Built-in Impressum + privacy notice** (`PI-112`, `/legal`): rendered from
  `LEGAL_*` env, linked from every footer, with the SMTP / analytics / SSO /
  operator-webhook sections auto-matched to what the deployment has enabled.

---

## 5. Your compliance checklist

**Before you let real people's data into a live instance:**

- [ ] Decide your **lawful basis** for the roster + public results (§ 3.1) and
      write it down. Set `LEGAL_LAWFUL_BASIS` to match.
- [ ] Fill the **`LEGAL_*` env vars** (`docs/deployment.md` § 2b) so the built-in
      `/legal` page names a real controller, authority, retention period, and
      processors — then read the generated page and confirm it's accurate for
      you. Host your own instead only if you need lawyer-drafted text; then point
      `LEGAL_LINK_URL` at it (and optionally `LEGAL_PAGE_ENABLED=false`).
- [ ] **Tell your players** — hand them the `/legal` link when they join the roster.
- [ ] Sign an **AVV** with your VPS host, and with your SMTP provider / analytics
      host / any managed service you use.
- [ ] Set a **log retention** limit on your host and an Umami retention/IP setting.
- [ ] Decide a **data-retention period** for tournaments and diarise the deletions.
- [ ] If Art. 30 applies to you, fill in the **record of processing** (§ 6).
- [ ] Know your **breach process** (§ 7).

**Configuration choices that reduce your exposure:**

- [ ] Leave analytics off unless you need it; if on, self-host Umami, cookieless,
      no raw IP storage.
- [ ] Only add webhook targets you control; avoid sending player names to
      US-based chat relays unless you've disclosed it.
- [ ] Consider turning on the **public-password lock** (`PI-27`) if the event is
      genuinely private.
- [ ] Keep `TRUSTED_PROXIES` correct so request logs aren't polluted with spoofed
      IPs.

---

## 6. Record of processing — template entry (Art. 30)

Adapt this for your deployment:

```
Controller:            <your name / association>, <address>, <email>
Name of processing:    Running an amateur Magic: The Gathering tournament series
Purpose:               Pairing, results, live standings, cross-year records, and
                       an optional card-value leaderboard for a recurring event
Categories of data
  subjects:            Players (participants), organizers
Categories of data:    Name; competition results, pairings, drops; card-pull
                       attributions and values; optional token balance;
                       organizer email + login credentials; server logs
                       containing IP addresses; (if enabled) visitor analytics
Legal basis:           Art. 6(1)(f) — legitimate interest in organising and
                       documenting a competition entrants took part in
                       [or 6(1)(b)/(a) — adjust to your situation]
                       Art. 6(1)(f) for security logging
Recipients:            <VPS host>; <SMTP provider>; <analytics host, if any>;
                       <OIDC/Google/Discord, if any>; <webhook targets, if any>
Third-country
  transfers:           <none> / <Google LLC, USA — SCCs> / <Discord Inc., USA — SCCs>
Retention:             Account data: until the account is deleted.
                       Tournament + results data: <N years> after the event,
                       then deleted or anonymised.
                       Server logs: <N days>.
                       Token ledger: retained for the life of the organization.
Technical/organisational
  measures:            Argon2 password hashing; encrypted session cookies;
                       hashed API tokens; HTTPS/HSTS; CSP; rate limiting;
                       non-root hardened container; database on an internal
                       network with no host port; regular backups
```

---

## 7. Breach process (Art. 33/34)

If personal data in your instance is exposed, altered, lost, or accessed without
authorisation:

1. **Contain it** — rotate `SESSION_SECRET` (logs everyone out), rotate DB
   credentials and any leaked API tokens, patch the cause.
2. **Assess the risk** to the people involved (what data, how many, how
   sensitive, is it now public).
3. **Notify your supervisory authority within 72 hours** of becoming aware,
   unless the breach is unlikely to result in a risk to people's rights. In
   Germany that is the data protection authority of your Bundesland.
4. **Notify the affected people** without undue delay if the risk is high.
5. **Document** the breach, its effects, and your response — you must keep this
   record even if you decide not to notify.

Keep a recent **database backup** at all times — it is both your recovery path
and, for an integrity/loss breach, part of your mitigation.

---

## 8. Related

- `docs/player-privacy.md` — the organizer/player-facing "what the buttons do"
  for the anonymise / export / pseudonymise tools and the `/legal` page
- The built-in `/legal` page — configure it via the `LEGAL_*` vars in
  `docs/deployment.md` § 2b
- `docs/privacy-policy-template.md` — a longer adaptable notice (EN + DE), for
  self-hosting your own instead of / alongside the built-in page
- `docs/deployment.md` — `TRUSTED_PROXIES`, SMTP, analytics, webhooks, backups
- `ROADMAP.md` — the GDPR items (`PI-103`…`PI-108`, `PI-110`, `PI-112`)
