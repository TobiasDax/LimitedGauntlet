// HI-8 — operator CLI for hosted-instance entitlements.
//
// Requires direct host access, the same trust boundary as
// scripts/import-legacy.ts and scripts/oidc-relink.ts: there is no HTTP route
// for any of this. Every mutating command previews the exact change and waits
// for an explicit "yes" unless --yes is passed.
//
//   docker compose exec app node server/dist/scripts/admin-entitlements.js show my-org
//   docker compose exec app node server/dist/scripts/admin-entitlements.js grant-tier my-org SERIES --note "partner"
//   docker compose exec app node server/dist/scripts/admin-entitlements.js grant-tier my-org SERIES --months 12
//   docker compose exec app node server/dist/scripts/admin-entitlements.js extend-retention my-org --months 6
//   docker compose exec app node server/dist/scripts/admin-entitlements.js set-dates <tournament-id> --start 2026-10-02 --end 2026-10-04
import { createInterface } from "node:readline/promises";
import type { EntitlementTier } from "../db.js";
import { prisma } from "../prisma.js";
import {
  extendRetention,
  findOrgsToGrandfather,
  getOrgEntitlementSummary,
  grandfatherOrgs,
  grantTier,
  setTournamentDates,
  type OrgEntitlementSummary,
} from "../services/entitlementsAdmin.js";

const TIERS: readonly EntitlementTier[] = ["FREE", "TOURNAMENT_PASS", "SERIES"];

const USAGE = `Usage:
  admin-entitlements.js show <org-slug>
  admin-entitlements.js grant-tier <org-slug> <${TIERS.join("|")}> [--months N] [--note "..."] [--yes]
  admin-entitlements.js extend-retention <org-slug> --months N [--note "..."] [--yes]
  admin-entitlements.js set-dates <tournament-id> --start <date> --end <date> [--yes]
  admin-entitlements.js grandfather [--note "..."] [--yes]

Notes:
  grant-tier SERIES without --months grants it perpetually (no expiry) — the
  usual shape for comping a friend or partner. With --months it extends from
  the current expiry when one is still in the future, so topping up early
  never loses the remaining time.`;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

function monthsFlag(args: string[]): number | undefined {
  const raw = flag(args, "months");
  if (raw === undefined) return undefined;
  const months = Number(raw);
  if (!Number.isInteger(months) || months <= 0) throw new Error("--months must be a positive whole number");
  return months;
}

async function confirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(promptText);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

const showDate = (date: Date | null) => (date ? date.toISOString() : "(none)");

function printSummary(summary: OrgEntitlementSummary): void {
  console.log(`  Org:                 ${summary.name} (${summary.slug})`);
  console.log(`  Tier:                ${summary.tier}`);
  console.log(
    `  Subscription until:  ${summary.subscriptionExpiresAt ? summary.subscriptionExpiresAt.toISOString() : summary.tier === "SERIES" ? "(perpetual)" : "(none)"}`,
  );
  console.log(`  Cumulative months:   ${summary.cumulativePaidMonths}`);
  console.log(`  Retention override:  ${showDate(summary.retentionOverrideUntil)}`);
  console.log(`  Free slot used:      ${summary.freeTournamentUsed ? "yes" : "no"}`);
  console.log(`  Tournaments:         ${summary.tournamentCount}`);
}

async function requireSummary(slug: string): Promise<OrgEntitlementSummary> {
  const summary = await getOrgEntitlementSummary(slug);
  if (!summary) throw new Error(`No organization found with slug "${slug}".`);
  return summary;
}

async function runShow(args: string[]): Promise<void> {
  const [slug] = args;
  if (!slug) throw new Error(USAGE);
  printSummary(await requireSummary(slug));
}

async function runGrantTier(args: string[]): Promise<void> {
  const [slug, tierArg] = args;
  if (!slug || !tierArg) throw new Error(USAGE);
  if (!TIERS.includes(tierArg as EntitlementTier)) {
    throw new Error(`Unknown tier "${tierArg}". Expected one of: ${TIERS.join(", ")}`);
  }
  const tier = tierArg as EntitlementTier;
  const months = monthsFlag(args);
  const note = flag(args, "note");

  if (months !== undefined && tier !== "SERIES") {
    throw new Error("--months only applies to SERIES; the other tiers have no subscription period.");
  }

  const before = await requireSummary(slug);
  console.log("Current state:");
  printSummary(before);
  console.log("");
  console.log(
    `Will set tier to ${tier}` +
      (tier === "SERIES"
        ? months === undefined
          ? " with no expiry (perpetual grant)."
          : `, extending the subscription by ${months} month(s) and adding them to the retention window.`
        : "."),
  );
  if (note) console.log(`Note recorded on the ledger entry: ${note}`);

  if (!args.includes("--yes") && !(await confirm('Type "yes" to apply: '))) {
    console.log("Aborted. No changes made.");
    return;
  }

  console.log("");
  console.log("New state:");
  printSummary(await grantTier(slug, tier, { months, note }));
}

async function runExtendRetention(args: string[]): Promise<void> {
  const [slug] = args;
  if (!slug) throw new Error(USAGE);
  const months = monthsFlag(args);
  if (months === undefined) throw new Error("extend-retention requires --months N");
  const note = flag(args, "note");

  const before = await requireSummary(slug);
  console.log("Current state:");
  printSummary(before);
  console.log("");
  console.log(`Will extend data retention by ${months} month(s).`);
  if (note) console.log(`Note recorded on the ledger entry: ${note}`);

  if (!args.includes("--yes") && !(await confirm('Type "yes" to apply: '))) {
    console.log("Aborted. No changes made.");
    return;
  }

  console.log("");
  console.log("New state:");
  printSummary(await extendRetention(slug, months, note));
}

async function runGrandfather(args: string[]): Promise<void> {
  const note = flag(args, "note");
  const candidates = await findOrgsToGrandfather();

  if (candidates.length === 0) {
    console.log("Nothing to do — every organization is already on SERIES.");
    return;
  }

  console.log(`${candidates.length} organization(s) would be granted perpetual SERIES:`);
  for (const c of candidates) {
    console.log(`  ${c.slug.padEnd(30)} ${c.name} (created ${c.createdAt.toISOString().slice(0, 10)})`);
  }
  console.log("");
  console.log("Run this before switching HOSTED_ENTITLEMENTS on, so nobody who signed up while");
  console.log("the app was unrestricted is retroactively restricted. Safe to re-run.");

  if (!args.includes("--yes") && !(await confirm('Type "yes" to apply: '))) {
    console.log("Aborted. No changes made.");
    return;
  }

  // Applies exactly the list just shown, so an org created between the preview
  // and the confirmation isn't swept in unseen.
  const applied = await grandfatherOrgs(candidates, note);
  console.log(`Grandfathered ${applied} organization(s).`);
}

async function runSetDates(args: string[]): Promise<void> {
  const [tournamentId] = args;
  if (!tournamentId) throw new Error(USAGE);
  const startRaw = flag(args, "start");
  const endRaw = flag(args, "end");
  if (!startRaw || !endRaw) throw new Error("set-dates requires --start and --end");

  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);
  if (Number.isNaN(startDate.getTime())) throw new Error(`--start is not a valid date: "${startRaw}"`);
  if (Number.isNaN(endDate.getTime())) throw new Error(`--end is not a valid date: "${endRaw}"`);
  if (endDate < startDate) throw new Error("--end cannot be before --start");

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organization: { select: { slug: true, name: true } } },
  });
  if (!tournament) throw new Error(`No tournament found with id "${tournamentId}".`);

  console.log("Tournament date change:");
  console.log(`  Tournament:  ${tournament.name} (${tournament.id})`);
  console.log(`  Org:         ${tournament.organization.name} (${tournament.organization.slug})`);
  console.log(`  Start:       ${tournament.startDate.toISOString()}  ->  ${startDate.toISOString()}`);
  console.log(`  End:         ${tournament.endDate.toISOString()}  ->  ${endDate.toISOString()}`);
  console.log("");
  console.log("This is the sanctioned override for the hosted date lock, so no tier duration limit is applied.");

  if (!args.includes("--yes") && !(await confirm('Type "yes" to apply: '))) {
    console.log("Aborted. No changes made.");
    return;
  }

  await setTournamentDates(tournamentId, startDate, endDate);
  console.log(`Dates updated for tournament ${tournamentId}.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "show":
      return runShow(args);
    case "grant-tier":
      return runGrantTier(args);
    case "extend-retention":
      return runExtendRetention(args);
    case "grandfather":
      return runGrandfather(args);
    case "set-dates":
      return runSetDates(args);
    default:
      console.error(USAGE);
      process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
