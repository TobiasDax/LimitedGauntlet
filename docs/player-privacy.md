# Player privacy & data-subject rights

Limited Gauntlet publishes player names and full competitive histories on open
URLs, so it ships tools for handling the requests that come with that. This page
is the "what the buttons do" reference for organizers and players.

> For your **legal** obligations as the person running the instance — lawful
> basis, informing players, processor agreements, retention periods, breach
> process — see [`gdpr.md`](gdpr.md). None of the tools below discharge those.

---

## For organizers — the roster "Privacy ▾" menu

Every player on the roster has a **Privacy ▾** menu with three actions. All are
organizer-only and scoped to the current organization.

### Pseudonymise on public pages

Replaces the player's name with a **stable per-player handle** — e.g.
`Player 7F2A` — on every `/o/<slug>/…` public page (standings, pairings,
tournament standings, Hall of Fame, card pulls, their own stats page). The
handle is the same every time, so their results stay followable — just not by
name. Your own organizer views and every standings/pairing calculation are
untouched; they still count exactly as before.

The roster row then shows "Shown publicly as **Player 7F2A**". Toggle it back off
and the same handle is reused if you re-enable it later.

This is the right default for **anyone under 16** — see [Minors](#minors) below.

### Anonymise a player

Honours an erasure request **without breaking the historical record**. It
scrubs the display name to a non-identifying label, clears any linked login
email, deletes pending invites, and blanks free-text notes on the token
ledger — but keeps every result, pairing, drop, and card-pull row, so
standings, Tournament Standings, and Hall of Fame numbers don't move.

It is **irreversible** (there is nothing left to restore the name from) and
gated behind a confirm dialog. An anonymised entry can't be re-invited to a
login.

*(A hard `DELETE` that cascades through the player's match rows still exists for
genuine mistakes and test data, but it silently rewrites history — use
Anonymise for real requests.)*

### Download data

Produces a readable JSON file with everything the app holds about that one
player: their roster entry (including any login email and privacy flags),
tournament check-ins, every pod and finishing position, every match with the
opponent's name and score, card-pull attributions, and — when the org has
tokens enabled — their token ledger. Covers Art. 15 / 20 access and portability.

---

## For players — the self-service portal

A player who has been invited to create an account (see the README's *Player
Accounts*) gets a **"Your account"** section in their portal at
`/o/<slug>/player`:

- **Correct your own name** — an inline edit, subject to the same
  name-uniqueness rule the organizer sees. No approval step; it's your name.
- **Download my data** — the same per-player export an organizer can produce.
- **Request removal** — an optional message plus a button. This is **not** a
  self-executing delete (anonymisation is irreversible, so a human decides): it
  emails every organizer when SMTP is configured, and always writes a log line,
  so the request is visible even on an instance with no mail set up.

A logged-in player never *needs* to do any of this to read a public page —
these are opt-in self-service tools, not a gate.

---

## Minors

Magic events often include people under 16, whose data merits specific
protection (GDPR Art. 8 / Recital 38). The concrete tool is
[**Pseudonymise on public pages**](#pseudonymise-on-public-pages): tick it for
every under-16 player. Their results stay followable at the event under a
handle; their real name never reaches a page anyone can load or scrape.

That handle is still *pseudonymised* personal data, not anonymous — you hold the
map from handle to child — so it doesn't remove your other duties. Get consent
from a parent or guardian before adding a child to the roster, keep a record of
it, and consider a shorter retention period. See [`gdpr.md`](gdpr.md) § 3.9.

---

## The built-in `/legal` page

The app serves its own **Impressum + privacy notice at `/legal`**, linked from
every footer, rendered from `LEGAL_*` environment variables — so an EU
deployment has a working notice without hosting one. The SMTP / analytics / SSO
/ operator-webhook sections include themselves automatically based on what the
deployment has enabled.

Fill at least `LEGAL_CONTROLLER_NAME` and `LEGAL_CONTROLLER_EMAIL`; an unset
field renders as a visible `(not configured — set LEGAL_…)` placeholder and a
missing name/email puts an "incomplete" banner on the page. Full field
reference: [`deployment.md` § 2b](deployment.md). `LEGAL_LINK_URL` /
`LEGAL_LINK_LABEL` still add an optional extra footer link for a
lawyer-drafted policy or a separate corporate Impressum, and
`LEGAL_PAGE_ENABLED=false` drops the built-in page entirely.

---

## Related

- [`gdpr.md`](gdpr.md) — the operator's compliance side: controller framing,
  lawful bases, processor agreements, an Art. 30 record template, breach process
- [`privacy-policy-template.md`](privacy-policy-template.md) — a longer
  adaptable notice (EN + DE) if you'd rather host your own
