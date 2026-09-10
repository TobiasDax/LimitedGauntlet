# Privacy policy template / Vorlage Datenschutzerklärung

> **You may not need this file.** The app ships a built-in Impressum + privacy
> notice at `/legal`, rendered from the `LEGAL_*` env vars — see
> `docs/deployment.md` § 2b. Fill those in and you have a working notice without
> touching this template. Use the template below only if you want your own
> lawyer-drafted text, a translation, or a longer document — host it and point
> `LEGAL_LINK_URL` / `LEGAL_LINK_LABEL` at it (optionally with
> `LEGAL_PAGE_ENABLED=false` to drop the built-in page).

A starting point for the privacy notice **you** must publish if you run a Limited
Gauntlet instance for people in the EU/EEA/UK.

> **Not legal advice.** Written by the project, not a lawyer. It reflects what the
> software does (see `docs/gdpr.md`), but the responsibility for a correct,
> complete notice for your situation is yours. Have it reviewed if you are unsure.

**How to use it**

1. Replace every `{{PLACEHOLDER}}`.
2. Delete the sections for features you have not enabled (SSO, analytics,
   webhooks, player accounts, tokens).
3. Choose your lawful basis in the "Public results" section and delete the
   alternatives.
4. Set your real retention periods.
5. Publish, and link it from the app footer and from the message you send players
   when you add them to the roster.

---
---

# English version

## Privacy Policy — {{ORGANIZATION_NAME}} tournament tracker

_Last updated: {{DATE}}_

### 1. Who is responsible

The controller for the processing described here is:

```
{{CONTROLLER_NAME}}
{{CONTROLLER_ADDRESS}}
Email: {{CONTROLLER_EMAIL}}
{{CONTROLLER_PHONE_OPTIONAL}}
```

{{DPO_BLOCK_OPTIONAL — "Our data protection officer can be reached at …". Most
small amateur setups are not required to appoint one; delete this line if you
have not.}}

This service runs on [Limited Gauntlet](https://github.com/{{REPO}}), open-source
self-hosted software. It is operated by us on our own infrastructure; the
software's authors have no access to it or to your data.

### 2. What we process, why, and on what legal basis

#### a) Player roster and public results

If you take part in one of our events, we process:

- your **display name** (as you are known in our group);
- your **match results, pairings, drops, and standings** for each session;
- **card-pull attributions and card values** (an optional "best pulls"
  leaderboard), where applicable;
- an optional **token balance** used for a prize wall, where applicable.

This information is shown on **publicly accessible pages** of the service (no
login required) so that participants and interested third parties can follow the
event and our multi-year records.

**Purpose:** organising, running, and documenting the tournament series; keeping
comparable historical records across years.

**Legal basis:** _{{choose one and delete the others}}_

- Art. 6(1)(f) GDPR — our legitimate interest in organising and publishing the
  results of a competition you entered. You may object at any time on grounds
  relating to your particular situation (see section 6).
- Art. 6(1)(b) GDPR — performance of your membership relationship with
  {{ASSOCIATION_NAME}}, of which results-keeping is a part.
- Art. 6(1)(a) GDPR — your consent, given when you joined the roster, which you
  may withdraw at any time with effect for the future.

**Recipients:** the pages are public, so this data can be read by anyone who has
the link. We ask search engines not to index the pages, but cannot prevent all
copying.

#### b) Organizer accounts

For people who administer events we process **email address, name, a hashed
password**, and — if SSO is used — an **identifier from the login provider**.

**Purpose:** authentication and access control.
**Legal basis:** Art. 6(1)(b) GDPR (use of the tool you registered for) and
Art. 6(1)(f) GDPR (securing the service).

#### c) Player self-service accounts _(delete if not enabled)_

Players we invite may create an account with an **email address and hashed
password** to check themselves in and report their own results.

**Purpose:** letting players manage their own participation.
**Legal basis:** Art. 6(1)(b) GDPR.

#### d) Invitations and email changes

When we invite a co-organizer or a player, or when an organizer changes their
email, we store the **email address** and a **hashed, single-use, time-limited
token** until the invite is used or expires.

**Legal basis:** Art. 6(1)(f) GDPR (operating the invite mechanism).

#### e) Server logs

Our server automatically records, for each request, the **IP address**, the
**date and time**, the **page or endpoint requested**, and the **browser
identification (User-Agent)**.

**Purpose:** operating the service, diagnosing errors, and detecting and
defending against attacks and abuse.
**Legal basis:** Art. 6(1)(f) GDPR (secure and reliable operation).
**Retention:** {{LOG_RETENTION e.g. "14 days", "30 days"}}, then deleted{{ " unless needed to investigate a specific incident" }}.

#### f) Session cookie

On login we set one **encrypted session cookie** (`session`). It contains only
your session state, is not read by any third party, and is strictly necessary for
the login area to work. No consent is required for it (§ 25(2) TTDSG). It expires
after 30 days or when you log out.

We set **no other cookies** and use no third-party cookies.

#### g) Web analytics _(delete this whole section if analytics is not enabled)_

We use **Umami**, a privacy-friendly analytics tool, {{"hosted by us on our own
server" / "hosted for us by {{UMAMI_HOST}}"}}. It records aggregated visit data:
pages viewed, referring site, approximate region (derived from the IP address,
which is {{"not stored" / "stored in shortened/hashed form"}}), browser, and
device type. **It sets no cookies** and does not track you across other websites.

**Purpose:** understanding which parts of the service are used, to improve it.
**Legal basis:** Art. 6(1)(f) GDPR (needs-based operation and improvement).
{{If your Umami is hosted by a third party: "…processing on our behalf under a
data processing agreement per Art. 28 GDPR."}}

#### h) SSO login _(delete if not enabled)_

You may log in via {{"Google" / "Discord" / "our identity provider
{{OIDC_PROVIDER}}"}}. If you do, that provider confirms your identity to us and
shares your **verified email address** and a **stable user identifier**. Your use
of the provider is governed by its own privacy policy.
{{For Google/Discord: "This involves a transfer to the United States. {{Provider}}
is certified under the EU–US Data Privacy Framework / we rely on the European
Commission's standard contractual clauses."}}

#### i) Outbound notifications (webhooks) _(delete if not used)_

We forward certain event notifications (round start/end, pairings, final
standings) to {{"our home-automation system" / "a chat channel" / "{{WEBHOOK_TARGET}}"}}.
These messages include **pod and tournament names, player and team names, table
numbers, and standings**.
{{If the target is a third-party service, name it and its location, and note any
US transfer.}}

#### j) Transactional email _(delete if SMTP is not configured)_

Invitation and account emails are sent through **{{SMTP_PROVIDER}}**, acting as
our processor under Art. 28 GDPR. The email contains the recipient address, a
link, and the relevant names.

### 3. Card images

Card images are loaded directly from **Scryfall** (`cards.scryfall.io`) by your
browser. We send Scryfall only card names when looking up prices and images; we do
not send Scryfall any information about you. Loading an image discloses your IP
address to Scryfall as with any embedded image. See Scryfall's privacy policy.

### 4. Recipients and processors

We use the following service providers, each bound by a data processing agreement
where required:

- **{{HOSTING_PROVIDER}}** — server hosting ({{COUNTRY}}).
- **{{SMTP_PROVIDER}}** — sending email _(if applicable)_.
- **{{UMAMI_HOST}}** — analytics hosting _(if third-party-hosted)_.
- **{{OIDC_PROVIDER / Google LLC / Discord Inc.}}** — login _(if applicable)_.

We do not sell personal data and do not use it for advertising.

### 5. Retention

- **Account data** (organizer and player accounts): until the account is deleted,
  then removed{{ " within {{N}} days" }}.
- **Tournament, pod, match, and results data:** kept as part of our permanent
  competitive record{{ " / deleted or anonymised {{N}} years after the event" }}.
- **Token ledger:** retained for the life of the organization.
- **Server logs:** see section 2(e).
- **Unused invitations:** deleted on expiry.

### 6. Your rights

You have the right to:

- **access** your data (Art. 15);
- **rectification** of inaccurate data (Art. 16);
- **erasure** (Art. 17) — where results must be kept for the integrity of the
  competitive record, we will **anonymise** your entries (remove your name and
  contact data, keep the anonymous result) rather than delete them, unless you
  require full deletion;
- **restriction** of processing (Art. 18);
- **data portability** (Art. 20);
- **object** to processing based on legitimate interest (Art. 21), on grounds
  relating to your particular situation;
- **withdraw consent** at any time, where processing is based on consent, with
  effect for the future (Art. 7(3)).

To exercise any of these, contact us at **{{CONTROLLER_EMAIL}}**.

You also have the right to **lodge a complaint with a supervisory authority**
(Art. 77). Ours is:

```
{{SUPERVISORY_AUTHORITY_NAME}}
{{SUPERVISORY_AUTHORITY_ADDRESS}}
{{SUPERVISORY_AUTHORITY_URL}}
```

### 7. Is providing data required?

Providing your display name is necessary to take part in and be listed in our
events; without it we cannot pair you or record your results. Providing an email
address is only necessary if you want an organizer or player account. Analytics
and logs do not require you to provide anything actively.

### 8. Automated decision-making

We do not use automated decision-making with legal or similarly significant
effect. Pairings and standings are computed by rule-based algorithms, reviewed by
an organizer, and have no effect beyond the event itself.
{{If you leave card-pull inference on: "An optional heuristic suggests which
player pulled a high-value card; every suggestion is reviewed by an organizer
before it is treated as final."}}

### 9. Changes

We may update this policy to reflect changes to the service or the law. The
current version is always the one linked from the application.

---
---

# Deutsche Fassung

## Datenschutzerklärung — Turnierverwaltung {{ORGANIZATION_NAME}}

_Stand: {{DATUM}}_

### 1. Verantwortlicher

Verantwortlicher für die hier beschriebene Verarbeitung ist:

```
{{VERANTWORTLICHER_NAME}}
{{VERANTWORTLICHER_ANSCHRIFT}}
E-Mail: {{VERANTWORTLICHER_EMAIL}}
{{VERANTWORTLICHER_TELEFON_OPTIONAL}}
```

{{DSB_BLOCK_OPTIONAL — „Unseren Datenschutzbeauftragten erreichen Sie unter …".
Kleine Amateur-Setups sind i.d.R. nicht zur Bestellung verpflichtet; andernfalls
Zeile löschen.}}

Dieser Dienst basiert auf [Limited Gauntlet](https://github.com/{{REPO}}), einer
quelloffenen, selbst gehosteten Software. Wir betreiben sie auf eigener
Infrastruktur; die Autoren der Software haben keinen Zugriff auf den Dienst oder
Ihre Daten.

### 2. Was wir verarbeiten, wozu und auf welcher Rechtsgrundlage

#### a) Spielerliste und öffentliche Ergebnisse

Wenn Sie an einer unserer Veranstaltungen teilnehmen, verarbeiten wir:

- Ihren **Anzeigenamen** (unter dem Sie in unserer Gruppe bekannt sind);
- Ihre **Match-Ergebnisse, Paarungen, Drops und Platzierungen** je Runde/Pod;
- ggf. **Zuordnungen und Werte gezogener Karten** (optionale „Best Pulls"-Wertung);
- ggf. ein **Token-Guthaben** für eine Prämienwand.

Diese Informationen werden auf **öffentlich zugänglichen Seiten** des Dienstes
(ohne Login) angezeigt, damit Teilnehmende und interessierte Dritte die
Veranstaltung und unsere jahresübergreifenden Auswertungen verfolgen können.

**Zweck:** Organisation, Durchführung und Dokumentation der Turnierserie;
vergleichbare historische Aufzeichnungen über mehrere Jahre.

**Rechtsgrundlage:** _{{eine auswählen, andere löschen}}_

- Art. 6 Abs. 1 lit. f DSGVO — unser berechtigtes Interesse an der Organisation
  und Veröffentlichung der Ergebnisse eines Wettbewerbs, an dem Sie teilgenommen
  haben. Sie können jederzeit aus Gründen Ihrer besonderen Situation widersprechen
  (Ziffer 6).
- Art. 6 Abs. 1 lit. b DSGVO — Durchführung Ihres Mitgliedschaftsverhältnisses
  mit {{VEREIN_NAME}}, zu dem die Ergebnisführung gehört.
- Art. 6 Abs. 1 lit. a DSGVO — Ihre bei Aufnahme in die Spielerliste erteilte
  Einwilligung, die Sie jederzeit mit Wirkung für die Zukunft widerrufen können.

**Empfänger:** Die Seiten sind öffentlich und können von jeder Person mit dem
Link gelesen werden. Wir bitten Suchmaschinen, die Seiten nicht zu indexieren,
können ein Kopieren aber nicht vollständig verhindern.

#### b) Organisator-Konten

Für Personen, die Veranstaltungen verwalten, verarbeiten wir **E-Mail-Adresse,
Name, einen gehashten Passwort-Wert** und — bei SSO — eine **Kennung des
Login-Anbieters**.

**Zweck:** Authentifizierung und Zugriffskontrolle.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Nutzung des Tools, für das Sie
sich registriert haben) und Art. 6 Abs. 1 lit. f DSGVO (Absicherung des Dienstes).

#### c) Spieler-Konten zur Selbstverwaltung _(löschen, falls nicht aktiviert)_

Von uns eingeladene Spieler können ein Konto mit **E-Mail-Adresse und gehashtem
Passwort** anlegen, um sich selbst anzumelden und eigene Ergebnisse zu melden.

**Zweck:** Selbstverwaltung der Teilnahme.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

#### d) Einladungen und E-Mail-Änderungen

Bei Einladung eines Mit-Organisators oder Spielers bzw. bei einer
E-Mail-Änderung speichern wir die **E-Mail-Adresse** und ein **gehashtes,
einmal verwendbares, zeitlich begrenztes Token**, bis die Einladung genutzt wird
oder abläuft.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (Betrieb des Einladungsverfahrens).

#### e) Server-Logs

Unser Server protokolliert bei jeder Anfrage automatisch die **IP-Adresse**,
**Datum und Uhrzeit**, die **angefragte Seite bzw. Endpunkt** und die
**Browser-Kennung (User-Agent)**.

**Zweck:** Betrieb des Dienstes, Fehlerdiagnose sowie Erkennung und Abwehr von
Angriffen und Missbrauch.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb).
**Speicherdauer:** {{LOG_SPEICHERDAUER z. B. „14 Tage", „30 Tage"}}, danach
Löschung{{ „, sofern nicht zur Aufklärung eines konkreten Vorfalls erforderlich" }}.

#### f) Session-Cookie

Beim Login setzen wir ein **verschlüsseltes Session-Cookie** (`session`). Es
enthält nur Ihren Anmeldestatus, wird von keinem Dritten gelesen und ist für den
Betrieb des Login-Bereichs unbedingt erforderlich. Eine Einwilligung ist dafür
nicht nötig (§ 25 Abs. 2 TTDSG). Es läuft nach 30 Tagen oder beim Abmelden ab.

Wir setzen **keine weiteren Cookies** und keine Cookies Dritter.

#### g) Webanalyse _(gesamten Abschnitt löschen, falls nicht aktiviert)_

Wir nutzen **Umami**, ein datenschutzfreundliches Analyse-Tool, {{„von uns auf
eigenem Server gehostet" / „für uns gehostet von {{UMAMI_HOST}}"}}. Erfasst
werden aggregierte Besuchsdaten: aufgerufene Seiten, verweisende Website,
ungefähre Region (aus der IP-Adresse abgeleitet, die {{„nicht gespeichert" /
„gekürzt/gehasht gespeichert"}} wird), Browser und Gerätetyp. **Es werden keine
Cookies gesetzt**, und es findet kein website-übergreifendes Tracking statt.

**Zweck:** Verständnis der Nutzung zur Verbesserung des Dienstes.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (bedarfsgerechter Betrieb und
Verbesserung).
{{Falls Umami durch Dritte gehostet: „… Verarbeitung in unserem Auftrag gemäß
Auftragsverarbeitungsvertrag nach Art. 28 DSGVO."}}

#### h) SSO-Login _(löschen, falls nicht aktiviert)_

Sie können sich über {{„Google" / „Discord" / „unseren Identity-Provider
{{OIDC_PROVIDER}}"}} anmelden. Dabei bestätigt der Anbieter uns Ihre Identität
und übermittelt Ihre **verifizierte E-Mail-Adresse** sowie eine **stabile
Nutzerkennung**. Ihre Nutzung des Anbieters richtet sich nach dessen eigener
Datenschutzerklärung.
{{Für Google/Discord: „Damit ist eine Übermittlung in die USA verbunden.
{{Anbieter}} ist unter dem EU-US Data Privacy Framework zertifiziert / wir
stützen uns auf die Standardvertragsklauseln der EU-Kommission."}}

#### i) Ausgehende Benachrichtigungen (Webhooks) _(löschen, falls nicht genutzt)_

Wir übermitteln bestimmte Ereignis-Benachrichtigungen (Rundenbeginn/-ende,
Paarungen, Endstände) an {{„unser Heimautomatisierungssystem" / „einen
Chat-Kanal" / „{{WEBHOOK_ZIEL}}"}}. Diese Nachrichten enthalten **Pod- und
Turniernamen, Spieler- und Teamnamen, Tischnummern und Platzierungen**.
{{Ist das Ziel ein Drittdienst: Namen, Sitz und ggf. US-Übermittlung angeben.}}

#### j) Transaktions-E-Mail _(löschen, falls kein SMTP konfiguriert)_

Einladungs- und Konto-E-Mails werden über **{{SMTP_ANBIETER}}** versendet, der
als Auftragsverarbeiter nach Art. 28 DSGVO tätig ist. Die E-Mail enthält die
Empfängeradresse, einen Link und die betreffenden Namen.

### 3. Kartenbilder

Kartenbilder werden von Ihrem Browser direkt von **Scryfall**
(`cards.scryfall.io`) geladen. Wir übermitteln Scryfall bei der Preis- und
Bildabfrage nur Kartennamen, keine Informationen über Sie. Beim Laden eines
Bildes wird — wie bei jeder eingebundenen Grafik — Ihre IP-Adresse an Scryfall
übermittelt. Siehe die Datenschutzerklärung von Scryfall.

### 4. Empfänger und Auftragsverarbeiter

Wir setzen folgende Dienstleister ein, jeweils — soweit erforderlich —
vertraglich als Auftragsverarbeiter gebunden:

- **{{HOSTING_ANBIETER}}** — Server-Hosting ({{LAND}}).
- **{{SMTP_ANBIETER}}** — E-Mail-Versand _(sofern zutreffend)_.
- **{{UMAMI_HOST}}** — Analyse-Hosting _(sofern durch Dritte gehostet)_.
- **{{OIDC_PROVIDER / Google LLC / Discord Inc.}}** — Login _(sofern zutreffend)_.

Wir verkaufen keine personenbezogenen Daten und nutzen sie nicht für Werbung.

### 5. Speicherdauer

- **Kontodaten** (Organisator- und Spielerkonten): bis zur Löschung des Kontos,
  danach Entfernung{{ „ innerhalb von {{N}} Tagen" }}.
- **Turnier-, Pod-, Match- und Ergebnisdaten:** dauerhaft als Teil unserer
  Wettbewerbsaufzeichnung{{ „ / Löschung oder Anonymisierung {{N}} Jahre nach der
  Veranstaltung" }}.
- **Token-Ledger:** für die Lebensdauer der Organisation.
- **Server-Logs:** siehe Ziffer 2 e).
- **Nicht genutzte Einladungen:** Löschung bei Ablauf.

### 6. Ihre Rechte

Sie haben das Recht auf:

- **Auskunft** über Ihre Daten (Art. 15);
- **Berichtigung** unrichtiger Daten (Art. 16);
- **Löschung** (Art. 17) — soweit Ergebnisse zur Integrität der
  Wettbewerbsaufzeichnung erhalten bleiben müssen, **anonymisieren** wir Ihre
  Einträge (Entfernen von Name und Kontaktdaten, Beibehaltung des anonymen
  Ergebnisses), sofern Sie keine vollständige Löschung verlangen;
- **Einschränkung** der Verarbeitung (Art. 18);
- **Datenübertragbarkeit** (Art. 20);
- **Widerspruch** gegen die auf berechtigtem Interesse beruhende Verarbeitung
  aus Gründen Ihrer besonderen Situation (Art. 21);
- **Widerruf einer Einwilligung** jederzeit mit Wirkung für die Zukunft, soweit
  die Verarbeitung auf einer Einwilligung beruht (Art. 7 Abs. 3).

Zur Ausübung wenden Sie sich an **{{VERANTWORTLICHER_EMAIL}}**.

Sie haben zudem das Recht auf **Beschwerde bei einer Aufsichtsbehörde**
(Art. 77). Für uns zuständig ist:

```
{{AUFSICHTSBEHOERDE_NAME}}
{{AUFSICHTSBEHOERDE_ANSCHRIFT}}
{{AUFSICHTSBEHOERDE_URL}}
```

### 7. Pflicht zur Bereitstellung

Die Angabe Ihres Anzeigenamens ist erforderlich, um an unseren Veranstaltungen
teilzunehmen und gelistet zu werden; ohne ihn können wir Sie nicht paaren oder
Ergebnisse erfassen. Eine E-Mail-Adresse ist nur erforderlich, wenn Sie ein
Organisator- oder Spielerkonto wünschen. Für Logs und Analyse müssen Sie nichts
aktiv bereitstellen.

### 8. Automatisierte Entscheidungsfindung

Eine automatisierte Entscheidungsfindung mit rechtlicher oder ähnlich erheblicher
Wirkung findet nicht statt. Paarungen und Platzierungen werden durch
regelbasierte Algorithmen berechnet, von einem Organisator geprüft und haben
keine Wirkung über die Veranstaltung hinaus.
{{Falls Karten-Zuordnungsheuristik aktiv: „Eine optionale Heuristik schlägt vor,
welcher Spieler eine hochwertige Karte gezogen hat; jeder Vorschlag wird von
einem Organisator geprüft, bevor er als endgültig gilt."}}

### 9. Änderungen

Wir können diese Erklärung anpassen, um Änderungen des Dienstes oder der
Rechtslage abzubilden. Es gilt stets die aus der Anwendung verlinkte Fassung.
