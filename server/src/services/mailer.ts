import nodemailer, { type Transporter } from "nodemailer";
import { config, isEmailConfigured } from "../config.js";

// Transactional email (PI-29). Deliberately thin: one transport, built lazily
// from env-configured SMTP, used only by first-party account flows (never sends
// to a user-supplied arbitrary recipient — callers pass an organizer's own
// address). If SMTP isn't configured, isEmailConfigured() is false and callers
// skip/deny the feature rather than the app crashing.

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export { isEmailConfigured };

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("email_not_configured");
  }
  await getTransporter().sendMail({
    from: config.smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

// Absolute base URL for links in emails: the configured APP_BASE_URL if set,
// else derived from the request that triggered the send.
export function resolveBaseUrl(requestOrigin?: string): string {
  const base = config.appBaseUrl || requestOrigin || "";
  return base.replace(/\/+$/, "");
}
