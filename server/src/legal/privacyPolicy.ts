// PI-112 — the built-in /legal page content.
//
// Assembles an English Impressum + privacy notice as a single Markdown
// document from the deployer's LEGAL_* env values (see config.ts) plus a few
// flags derived from what the deployment actually has enabled (SMTP, analytics,
// SSO, the operator alert webhook). The client fetches the result from
// GET /api/legal and renders it through the shared <RichText> component — no
// HTML is generated here, only Markdown text.
//
// Every field is optional. An unset one renders as a visible
// "(not configured — set LEGAL_…)" placeholder rather than vanishing, and a
// missing controller name or email sets `incomplete` so the page shows a
// warning banner. The rendered notice never claims to be reviewed or
// authoritative — that responsibility is the operator's (docs/gdpr.md).

export type LawfulBasis = "legitimate-interest" | "consent" | "contract";

export interface LegalDocInput {
  controllerName: string;
  controllerAddress: string;
  controllerEmail: string;
  controllerPhone: string;
  registerInfo: string;
  dpoContact: string;
  lawfulBasis: LawfulBasis;
  retentionTournaments: string;
  retentionLogs: string;
  hostingProvider: string;
  supervisoryAuthority: string;
  smtpProvider: string;
  analyticsProvider: string;
  lastUpdated: string;
  features: {
    email: boolean;
    analytics: boolean;
    sso: Array<{ id: "oidc" | "google" | "discord"; label: string }>;
    adminWebhook: boolean;
    // REQUEST_LOG === "full" — the access log keeps the visitor IP.
    requestLogKeepsIp: boolean;
  };
}

export interface LegalDoc {
  markdown: string;
  // controller name or email missing — the page shows an "incomplete" banner.
  incomplete: boolean;
}

const REPO_URL = "https://github.com/TobiasDax/LimitedGauntlet";

// An unset value renders as a visible placeholder naming the env var to set,
// so an unconfigured deployment reads as obviously unfinished. Parenthesised,
// not bracketed — `[text]` can be mistaken for a link reference in Markdown.
function field(value: string, envName: string): string {
  const v = value.trim();
  return v.length > 0 ? v : `(not configured — set ${envName})`;
}

// Same, but the *set* value is bolded (for names / list items). Callers must
// not add their own `**` around this — the placeholder is bolded too.
function strongField(value: string, envName: string): string {
  return `**${field(value, envName)}**`;
}

// A whole optional line: rendered only when the value is set.
function optionalLine(value: string, render: (v: string) => string): string {
  const v = value.trim();
  return v.length > 0 ? render(v) : "";
}

function joinSections(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
}

function usTransferProviders(sso: LegalDocInput["features"]["sso"]): string[] {
  return sso.filter((p) => p.id === "google" || p.id === "discord").map((p) => p.label);
}

// "A" / "A and B" / "A, B, and C"
function andList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function renderLegalDoc(input: LegalDocInput): LegalDoc {
  const incomplete = input.controllerName.trim().length === 0 || input.controllerEmail.trim().length === 0;
  const email = field(input.controllerEmail, "LEGAL_CONTROLLER_EMAIL");

  const impressum = joinSections([
    `# Legal Notice`,
    optionalLine(input.lastUpdated, (v) => `_Last updated: ${v}_`) ||
      `_Last updated: ${field("", "LEGAL_LAST_UPDATED")}_`,
    `## Impressum`,
    `Information pursuant to § 5 DDG (Germany) / the equivalent disclosure duty in your jurisdiction.`,
    [
      strongField(input.controllerName, "LEGAL_CONTROLLER_NAME"),
      ``,
      field(input.controllerAddress, "LEGAL_CONTROLLER_ADDRESS"),
      ``,
      `Email: ${email}`,
      optionalLine(input.controllerPhone, (v) => `\nPhone: ${v}`),
      optionalLine(input.registerInfo, (v) => `\n${v}`),
    ].join("\n"),
    `This service runs on [Limited Gauntlet](${REPO_URL}), open-source self-hosted software. It is operated by the party named above on their own infrastructure; the software's authors have no access to this deployment or to any data in it.`,
  ]);

  const basisParagraph = ((): string => {
    switch (input.lawfulBasis) {
      case "consent":
        return `**Legal basis:** Art. 6(1)(a) GDPR — your consent, given when you joined the roster, which you may withdraw at any time with effect for the future.`;
      case "contract":
        return `**Legal basis:** Art. 6(1)(b) GDPR — performance of your membership relationship with the organizer, of which results-keeping is a part.`;
      default:
        return `**Legal basis:** Art. 6(1)(f) GDPR — the legitimate interest of the organizer in running and publishing the results of a competition you entered. You may object at any time on grounds relating to your particular situation (see "Your rights").`;
    }
  })();

  const logRetention = input.features.requestLogKeepsIp
    ? `**Retention:** ${field(input.retentionLogs, "LEGAL_RETENTION_LOGS")}, then deleted unless needed to investigate a specific incident.`
    : `This deployment is configured **not** to record the visitor IP or query string in its access log (\`REQUEST_LOG=minimal\`); the log keeps only the method, path, status, and timing of each request.${optionalLine(
        input.retentionLogs,
        (v) => ` **Retention:** ${v}.`,
      )}`;

  const analyticsSection = input.features.analytics
    ? joinSections([
        `#### Web analytics`,
        `This deployment uses **Umami**, a privacy-friendly analytics tool, hosted at ${field(
          input.analyticsProvider,
          "LEGAL_ANALYTICS_PROVIDER",
        )}. It records aggregated visit data: pages viewed, referring site, approximate region (derived from the IP address, which is forwarded only in truncated form by default), browser, and device type. It sets **no cookies** and does not track you across other websites.`,
        `**Purpose:** understanding which parts of the service are used, to improve it.`,
        `**Legal basis:** Art. 6(1)(f) GDPR (needs-based operation and improvement). Where the analytics host is operated by a third party, it acts as a processor under an agreement per Art. 28 GDPR.`,
      ])
    : "";

  const ssoSection =
    input.features.sso.length > 0
      ? joinSections([
          `#### SSO login`,
          `You may log in via ${andList(
            input.features.sso.map((p) => `**${p.label}**`),
          )}. When you do, that provider confirms your identity and shares your **verified email address** and a **stable user identifier** with this service. Your use of the provider is governed by its own privacy policy.`,
          usTransferProviders(input.features.sso).length > 0
            ? `Logging in via ${andList(
                usTransferProviders(input.features.sso).map((l) => `**${l}**`),
              )} involves a transfer of personal data to the United States, based on the provider's Data Privacy Framework certification and/or the European Commission's standard contractual clauses.`
            : "",
        ])
      : "";

  const smtpSection = input.features.email
    ? joinSections([
        `#### Transactional email`,
        `Invitation and account emails are sent through ${strongField(
          input.smtpProvider,
          "LEGAL_SMTP_PROVIDER",
        )}, acting as a processor under Art. 28 GDPR. The email contains the recipient address, a link, and the relevant names.`,
      ])
    : "";

  const adminWebhookSection = input.features.adminWebhook
    ? joinSections([
        `#### Operator notification on signup`,
        `When a new organization is created on this deployment, an automated notification containing the **new organizer's email address** and the organization name is sent to the operator's own systems. This is used only to let the operator know the instance is being used.`,
        `**Legal basis:** Art. 6(1)(f) GDPR (administering the deployment).`,
      ])
    : "";

  const processing = joinSections([
    `## Privacy Policy`,
    `### What we process, why, and on what legal basis`,

    `#### Player roster and public results`,
    `If you take part in one of our events, we process your **display name**, your **match results, pairings, drops, and standings** for each session, any **card-pull attributions and card values** ("best pulls" leaderboard), and — where enabled — a **token balance** used for a prize wall.`,
    `This information is shown on **publicly accessible pages** of the service (no login required) so that participants and interested third parties can follow the event and our multi-year records. We ask search engines not to index these pages but cannot prevent all copying.`,
    `**Purpose:** organising, running, and documenting the tournament series; keeping comparable historical records across years.`,
    basisParagraph,
    `If you object to appearing by name, the organizer can replace your name with a stable pseudonym ("Player 7F2A") on every public page while keeping your results followable, or anonymise your entries entirely — see "Your rights".`,

    `#### Organizer accounts`,
    `For people who administer events we process an **email address, a name, a hashed password**, and — if SSO is used — an **identifier from the login provider**.`,
    `**Purpose:** authentication and access control. **Legal basis:** Art. 6(1)(b) GDPR (use of the tool you registered for) and Art. 6(1)(f) GDPR (securing the service).`,

    `#### Player self-service accounts`,
    `Where an organizer invites you to, you may create an account with an **email address and hashed password** to check yourself in and report your own results. **Legal basis:** Art. 6(1)(b) GDPR.`,

    `#### Invitations and email changes`,
    `When a co-organizer or player is invited, or an organizer changes their email, we store the **email address** and a **hashed, single-use, time-limited token** until the invite is used or expires. **Legal basis:** Art. 6(1)(f) GDPR.`,

    `#### Server logs`,
    `Our server processes requests to operate the service, diagnose errors, and detect and defend against abuse. **Legal basis:** Art. 6(1)(f) GDPR (secure and reliable operation).`,
    logRetention,

    `#### Session cookie`,
    `On login we set one **encrypted session cookie** (\`session\`) containing only your session state. It is strictly necessary for the login area and requires no consent (§ 25(2) TTDSG). It expires after 30 days or on logout. We set no other cookies and use no third-party cookies.`,

    analyticsSection,
    ssoSection,

    `#### Outbound notifications (webhooks)`,
    `Where an organizer has configured it, certain event notifications (round start/end, pairings, final standings) are forwarded to a destination the organizer chose — for example a home-automation system or a chat channel. These messages include **pod and tournament names, player and team names, table numbers, and standings**. If that destination is a third-party service it may involve a transfer outside the EU/EEA; the organizer is responsible for disclosing the specific recipient.`,

    smtpSection,
    adminWebhookSection,

    `### Card images`,
    `Card images are loaded directly from **Scryfall** (\`cards.scryfall.io\`) by your browser. We send Scryfall only card names when looking up prices and images; we do not send Scryfall any information about you. Loading an image discloses your IP address to Scryfall as with any embedded image.`,

    `### Recipients and processors`,
    joinSections([
      `We use the following service providers, each bound by a data processing agreement where required:`,
      [
        `- ${strongField(input.hostingProvider, "LEGAL_HOSTING_PROVIDER")} — server hosting.`,
        input.features.email ? `- ${strongField(input.smtpProvider, "LEGAL_SMTP_PROVIDER")} — sending email.` : "",
        input.features.analytics
          ? `- ${strongField(input.analyticsProvider, "LEGAL_ANALYTICS_PROVIDER")} — analytics hosting.`
          : "",
        input.features.sso.length > 0 ? `- **${input.features.sso.map((p) => p.label).join(", ")}** — login.` : "",
      ]
        .filter((l) => l.length > 0)
        .join("\n"),
      `We do not sell personal data and do not use it for advertising.`,
    ]),

    `### Retention`,
    [
      `- **Account data** (organizer and player accounts): until the account is deleted.`,
      `- **Tournament, pod, match, and results data:** ${field(
        input.retentionTournaments,
        "LEGAL_RETENTION_TOURNAMENTS",
      )}`,
      `- **Token ledger:** retained for the life of the organization.`,
      `- **Server logs:** see "Server logs" above.`,
      `- **Unused invitations:** deleted on expiry.`,
    ].join("\n"),

    `### Your rights`,
    `You have the right to **access** your data (Art. 15), **rectification** (Art. 16), **erasure** (Art. 17), **restriction** (Art. 18), **data portability** (Art. 20), and to **object** to processing based on legitimate interest (Art. 21). Where processing is based on consent you may **withdraw** it at any time with effect for the future (Art. 7(3)).`,
    `Where results must be kept for the integrity of the competitive record, we will **anonymise** your entries (remove your name and contact data, keep the anonymous result) rather than delete them, unless you require full deletion.`,
    `To exercise any of these, contact us at **${email}**.`,
    joinSections([
      `You also have the right to **lodge a complaint with a supervisory authority** (Art. 77). The authority responsible for us is:`,
      field(input.supervisoryAuthority, "LEGAL_SUPERVISORY_AUTHORITY"),
    ]),
    optionalLine(input.dpoContact, (v) => `**Data protection officer:** ${v}`),

    `### Is providing data required?`,
    `Providing your display name is necessary to take part in and be listed in our events; without it we cannot pair you or record your results. Providing an email address is only necessary if you want an organizer or player account. Logs do not require you to provide anything actively.`,

    `### Automated decision-making`,
    `We do not use automated decision-making with legal or similarly significant effect. Pairings and standings are computed by rule-based algorithms, reviewed by an organizer, and have no effect beyond the event itself. An optional heuristic suggests which player pulled a high-value card; every suggestion is reviewed by an organizer before it is treated as final.`,

    `### Changes`,
    `We may update this notice to reflect changes to the service or the law. The current version is always the one linked from the application.`,
  ]);

  return { markdown: joinSections([impressum, processing]), incomplete };
}
