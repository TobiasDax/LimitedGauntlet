// HI-11 — the hosted instance's Terms of Service + refund/cancellation policy.
//
// Served only when HOSTED_ENTITLEMENTS is on (routes/terms.ts): a self-hosted
// deployment sells nothing, so it has no terms to publish and never shows this
// page. Same shape as the privacy notice — Markdown text assembled from the
// deployment's LEGAL_* operator identity, rendered client-side by <RichText>.
//
// Deliberately contains no prices: amounts are read live from the payment
// processor and shown at checkout, so this text can't drift from them.
//
// This is a good-faith draft by the software's maintainers, not legal advice;
// the operator is responsible for having it reviewed.

export const TERMS_LAST_UPDATED = "2026-10-05";

export interface TermsInput {
  operatorName: string;
  operatorAddress: string;
  supportEmail: string;
  // LEGAL_PAGE_ENABLED — when off, don't point readers at a /legal page that 404s.
  legalPageEnabled: boolean;
}

export interface TermsDoc {
  markdown: string;
  // operator name or contact email missing — the page shows an "incomplete" banner.
  incomplete: boolean;
}

function field(value: string, envName: string): string {
  const v = value.trim();
  return v.length > 0 ? v : `(not configured — set ${envName})`;
}

export function renderTerms(input: TermsInput): TermsDoc {
  const contactEmail = input.supportEmail.trim();
  const incomplete = input.operatorName.trim().length === 0 || contactEmail.length === 0;
  const email = field(contactEmail, "HOSTED_SUPPORT_EMAIL");
  const privacyPointer = input.legalPageEnabled
    ? `How personal data is handled is described in the [Legal notice and privacy policy](/legal).`
    : `How personal data is handled is described in the privacy policy published by the operator.`;

  const sections: string[] = [
    `# Terms of Service`,
    `_Last updated: ${TERMS_LAST_UPDATED}_`,
    `These terms apply to the hosted Limited Gauntlet service at this address (the "Service"). They do not apply to running the open-source software yourself on your own server, which is covered only by its [license](https://github.com/TobiasDax/LimitedGauntlet/blob/main/LICENSE) and is free, with no restrictions and nothing to pay.`,

    `## 1. Who provides the Service`,
    `The Service is operated by **${field(input.operatorName, "LEGAL_CONTROLLER_NAME")}**, ${field(
      input.operatorAddress,
      "LEGAL_CONTROLLER_ADDRESS",
    ).replace(/\n+/g, ", ")} ("we", "us"). Contact: ${email}.`,
    `Paid plans are sold through our payment partner **Link** (operated by Stripe), which acts as the seller of record for each purchase: it charges your payment method, collects and remits applicable sales tax or VAT, and sends your receipts and invoices. Your purchase is also subject to Link's own terms shown at checkout. We provide the Service itself.`,

    `## 2. Your account and organization`,
    `You sign in with a third-party login (for example Discord or Google). You are responsible for activity under your account and for keeping that login secure. An _organization_ is the workspace that holds your tournaments and player roster; everyone you invite as an organizer has full access to it.`,
    `Each account may create **one** free organization. Creating further organizations requires upgrading your existing free one to a paid plan first. Don't create multiple accounts to get around plan limits.`,

    `## 3. Plans`,
    `Current prices, and the tax added to them, are always shown at checkout and in **Settings → Plan & billing** before you pay.`,
    `- **Free** — one tournament with one pod, running for at most seven days. Tournament dates are set when the tournament is created and cannot be changed afterwards (contact us if you made a mistake). Webhooks, outgoing email, bulk/Excel export and API tokens are not included, and a free organization has one organizer.`,
    `- **Tournament pass** — a one-time purchase that unlocks **one additional tournament** with unlimited pods, with the same seven-day and fixed-date rules as the free tournament. You can use it for a new tournament or upgrade your free one, which hands the free slot back. A pass never expires while unused.`,
    `- **Series subscription** — monthly or yearly. While active it removes the limits: unlimited tournaments and pods, editable dates, co-organizers, webhooks, exports and API access.`,
    `We may change what a plan includes or what it costs in future. A change never affects a period you have already paid for, and a pass you have already bought keeps the scope it had when you bought it.`,

    `## 4. Subscriptions, renewal and cancellation`,
    `A Series subscription renews automatically at the end of each billing period (monthly or yearly, as you chose) until you cancel. You can cancel at any time, effective at the end of the period you've already paid for — you keep full access until then. To cancel, update your payment method, or view your orders, sign in at [app.link.com](https://app.link.com) with the email address you used at checkout (if you paid as a guest, create a Link account with that same email). Cancelling stops future charges; it does not by itself refund the current period.`,
    `If a renewal payment fails, access continues only to the end of the period already paid for.`,

    `## 5. Refunds`,
    `- **14-day refund.** If you change your mind, ask for a refund within **14 days** of a purchase and we'll refund it in full, as long as a tournament pass hasn't yet been applied to a tournament. After that, a pass or a started subscription period is not refundable unless the law requires it or the Service was materially unusable.`,
    `- **Statutory rights.** Nothing here limits mandatory consumer rights. If you are a consumer in the EU, you may have a statutory 14-day right of withdrawal for digital services; by starting to use a purchased plan right away you ask us to begin the service immediately, and the right can lapse, or the refund can be reduced to account for what you've already used, as the law provides.`,
    `- **How to ask.** Contact Link support via [support.link.com](https://support.link.com/topics/sold-through-link) or email ${email} with the email address you used to purchase. Refunds go back to the original payment method and include the tax you paid. A refunded pass or subscription may be withdrawn from your organization.`,
    `- **Service discontinued.** If we shut the Service down, we'll tell you in advance and refund the unused remainder of any prepaid subscription period.`,

    `## 6. Your data and what happens when a plan ends`,
    `You own the tournament data you enter. You are responsible for having a proper basis to enter other people's data (names of players, results) and for telling them where it's published. ${privacyPointer}`,
    `Free and pass tournaments stay accessible for **one month after the tournament ends**. For an organization whose Series subscription has ended, data stays accessible for as many months as you have paid for in total across all your subscription periods, counted from the day the subscription lapsed.`,
    `Once that period is over, your data becomes **inaccessible, not deleted**: it is kept, and upgrading again brings everything back. We don't delete it automatically; you can ask us to delete it at any time (${email}), and you can delete your organization yourself in **Settings**. A player's right to access or export their own personal data is never limited by your plan.`,
    `Export your data while you have access if you want your own copy.`,

    `## 7. Acceptable use`,
    `Don't use the Service to break the law, to harass or defame people, to spread malware, to attack or overload it, to scrape it at scale, or to resell it. Don't put content in it that you have no right to publish. We may remove content or suspend an organization that breaks these rules, and for serious or repeated abuse close it; where possible we'll warn you first and, for a paying customer closed without fault, refund the unused part of the paid period.`,

    `## 8. Availability and changes to the Service`,
    `We run the Service with reasonable care and back up its database, but it is provided as available: we don't guarantee uninterrupted operation, and maintenance or outages can happen. Round timers and live features are conveniences — keep a way to run your event without them. We may improve, change or retire features; if a change materially reduces what a plan you've paid for includes, you may cancel and ask for a refund of the unused remainder of that period.`,

    `## 9. Liability`,
    `We are liable without limit for intent, gross negligence, injury to life, body or health, fraudulent concealment, and where the law makes liability mandatory (for example product liability). For slightly negligent breach of an obligation essential to the contract, our liability is limited to the damage typically foreseeable at the time the contract was made. Otherwise we are not liable for slightly negligent breaches. Our liability for lost data is limited to the effort that regular backups and your own exports would have required.`,

    `## 10. Changes to these terms`,
    `We may update these terms, for example when the Service or the law changes. We'll announce material changes in the app or by email in advance. If you keep using the Service after a change takes effect you accept it; if you don't, you can cancel and, for prepaid periods affected by a change that is to your disadvantage, ask for a refund of the unused remainder. A change never reduces a period you have already paid for.`,

    `## 11. Governing law`,
    `German law applies, excluding the UN Sales Convention. If you are a consumer, this doesn't remove the protection of the mandatory consumer law of the country where you live. If you are a business, the place of jurisdiction is the operator's registered seat, to the extent the law allows.`,

    `## 12. Contact`,
    `Questions, refund requests, date changes or deletion requests: ${email}.`,
  ];

  return { markdown: sections.join("\n\n"), incomplete };
}
