import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./client.js";
import { registerConfirmation, runConfirmation } from "./confirm.js";

const server = new McpServer({ name: "limitedgauntlet", version: "0.1.0" });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

// Thin, direct-execute wrapper — reads and non-destructive writes (create,
// pair, start/complete, submit result, add) go straight through to the
// HTTP API. The only guardrail here is the API's own org-scoping via the
// bearer token minted for a specific organizer.
function registerReadWriteTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  handler: (args: { [K in keyof Shape]: z.infer<Shape[K]> }) => Promise<unknown>,
) {
  // The registerTool overloads resolve InputArgs from a concrete shape
  // literal — forwarding our own generic `Shape` through defeats that
  // inference, not a real type mismatch, so this boundary is deliberately
  // untyped. The zod shape itself still validates every real call at
  // runtime; only this glue is unchecked.
  (server.registerTool as (...args: unknown[]) => unknown)(
    name,
    { description, inputSchema: shape },
    async (args: Record<string, unknown>) => {
      try {
        const result = await handler(args as never);
        return json(result ?? { ok: true });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// Destructive tools (delete/remove) get a dry-run + confirm step per the
// PI-4 decision: the first call describes what would be affected and
// returns a confirmation token; nothing mutates until a second call
// passes that token back, or the caller passes confirm: true to skip
// straight to execution.
function registerDestructiveTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: Shape,
  describeImpact: (args: { [K in keyof Shape]: z.infer<Shape[K]> }) => Promise<string>,
  execute: (args: { [K in keyof Shape]: z.infer<Shape[K]> }) => Promise<unknown>,
) {
  const fullShape = {
    ...shape,
    confirm: z.boolean().optional().describe("Skip the dry-run and execute immediately."),
    confirmationToken: z.string().optional().describe("Token returned by a prior dry-run call, to proceed."),
  };

  (server.registerTool as (...args: unknown[]) => unknown)(
    name,
    { description: `${description} DESTRUCTIVE — requires confirmation (see tool description).`, inputSchema: fullShape },
    async (raw: Record<string, unknown>) => {
      try {
        if (raw.confirmationToken) {
          const outcome = await runConfirmation(raw.confirmationToken as string);
          if (!outcome.ok) return errorResult(outcome.error);
          return json(outcome.result ?? { ok: true });
        }

        const { confirm, confirmationToken: _t, ...rest } = raw;
        const args = rest as never;

        if (confirm === true) {
          const result = await execute(args);
          return json(result ?? { ok: true });
        }

        const impact = await describeImpact(args);
        const token = registerConfirmation(impact, () => execute(args));
        return {
          content: [
            {
              type: "text" as const,
              text: `Not executed yet — this is destructive.\n\n${impact}\n\nTo proceed, call ${name} again with confirmationToken: "${token}" (expires in 5 minutes). To skip the dry run next time, pass confirm: true.`,
            },
          ],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// -----------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------

registerReadWriteTool("list_tournaments", "List every tournament in the organization.", {}, () =>
  api.get("/tournaments"),
);

registerReadWriteTool(
  "get_tournament",
  "Get a tournament's detail: pods, attending players, dates, status, description.",
  { tournamentId: z.string() },
  ({ tournamentId }) => api.get(`/tournaments/${tournamentId}`),
);

registerReadWriteTool(
  "list_pods",
  "List every pod (session/draft/etc.) in a tournament.",
  { tournamentId: z.string() },
  ({ tournamentId }) => api.get(`/tournaments/${tournamentId}/pods`),
);

registerReadWriteTool(
  "get_pod",
  "Get a pod's detail: config and full entrant list (individuals and teams).",
  { podId: z.string() },
  ({ podId }) => api.get(`/pods/${podId}`),
);

registerReadWriteTool(
  "get_pod_standings",
  "Get a pod's current standings table (points, tiebreakers).",
  { podId: z.string() },
  ({ podId }) => api.get(`/pods/${podId}/standings`),
);

registerReadWriteTool(
  "get_rounds",
  "Get every round of a pod, including matches (needed to find match/round ids for pairing/results tools).",
  { podId: z.string() },
  ({ podId }) => api.get(`/pods/${podId}/rounds`),
);

registerReadWriteTool(
  "get_gesamtwertung",
  "Get a tournament's weekend-overall ranking (average points per pod played).",
  { tournamentId: z.string() },
  ({ tournamentId }) => api.get(`/tournaments/${tournamentId}/gesamtwertung`),
);

registerReadWriteTool(
  "get_coverage",
  "Get the weekend coverage matrix: how many times each pair of attending players has already faced each other.",
  { tournamentId: z.string() },
  ({ tournamentId }) => api.get(`/tournaments/${tournamentId}/coverage`),
);

registerReadWriteTool(
  "get_pod_card_pulls",
  "Get a pod's card-pull gallery and running total.",
  { podId: z.string() },
  ({ podId }) => api.get(`/pods/${podId}/card-pulls`),
);

registerReadWriteTool(
  "get_tournament_card_pulls",
  "Get the 'best pulls of the weekend' rollup across every pod in a tournament.",
  { tournamentId: z.string() },
  ({ tournamentId }) => api.get(`/tournaments/${tournamentId}/card-pulls`),
);

registerReadWriteTool("get_treasure_chest", "Get the org's all-time top-25 most valuable card pulls.", {}, () =>
  api.get("/card-pulls/treasure-chest"),
);

registerReadWriteTool(
  "get_hall_of_fame",
  "Get the org's all-time player leaderboard, plus headline stats, most-played pairings, and biggest pulls.",
  {},
  () => api.get("/hall-of-fame"),
);

registerReadWriteTool(
  "get_player_stats",
  "Get one player's full stat profile: record, pod/weekend wins, streaks, nemesis/victim, head-to-head.",
  { playerId: z.string() },
  ({ playerId }) => api.get(`/hall-of-fame/players/${playerId}`),
);

registerReadWriteTool("list_players", "List the org's player roster.", {}, () => api.get("/players"));

// -----------------------------------------------------------------------
// Writes (non-destructive)
// -----------------------------------------------------------------------

registerReadWriteTool(
  "create_tournament",
  "Create a new tournament.",
  {
    name: z.string(),
    startDate: z.string().describe("ISO date, e.g. 2026-08-24"),
    endDate: z.string(),
    location: z.string().optional(),
    description: z.string().optional(),
  },
  (input) => api.post("/tournaments", input),
);

registerReadWriteTool(
  "update_tournament",
  "Update a tournament's fields (name, dates, location, description, status). Omitted fields are left unchanged.",
  {
    tournamentId: z.string(),
    name: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    location: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["PLANNING", "ACTIVE", "COMPLETED"]).optional(),
  },
  ({ tournamentId, ...body }) => api.patch(`/tournaments/${tournamentId}`, body),
);

registerReadWriteTool(
  "create_pod",
  "Create a new pod (session/draft) in a tournament.",
  {
    tournamentId: z.string(),
    name: z.string(),
    format: z.enum(["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"]),
    sequenceOrder: z.number().int(),
    date: z.string().optional(),
    isTeamEvent: z.boolean().default(false),
    teamSize: z.number().int().min(2).max(8).optional(),
    roundCount: z.number().int().min(1).max(20).default(3),
    matchFormat: z.enum(["BO1", "BO3"]).default("BO3"),
    pointsWin: z.number().int().default(3),
    pointsDraw: z.number().int().default(1),
    pointsLoss: z.number().int().default(0),
    roundLengthMinutes: z.number().int().default(50),
    excludeFromStats: z.boolean().default(false),
    webhookEnabled: z.boolean().default(true),
    constructedFormat: z
      .enum(["STANDARD", "MODERN", "LEGACY", "VINTAGE", "PIONEER", "PRE_MODERN", "PAUPER", "CUSTOM"])
      .optional(),
    constructedFormatCustom: z.string().optional(),
  },
  ({ tournamentId, ...body }) => api.post(`/tournaments/${tournamentId}/pods`, body),
);

registerReadWriteTool(
  "update_pod",
  "Update a pod's fields. Omitted fields are left unchanged.",
  {
    podId: z.string(),
    name: z.string().optional(),
    date: z.string().optional(),
    format: z.enum(["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"]).optional(),
    roundCount: z.number().int().min(1).max(20).optional(),
    matchFormat: z.enum(["BO1", "BO3"]).optional(),
    pointsWin: z.number().int().optional(),
    pointsDraw: z.number().int().optional(),
    pointsLoss: z.number().int().optional(),
    roundLengthMinutes: z.number().int().optional(),
    status: z.enum(["SETUP", "PAIRING", "IN_PROGRESS", "COMPLETED"]).optional(),
    excludeFromStats: z.boolean().optional(),
    webhookEnabled: z.boolean().optional(),
    constructedFormat: z
      .enum(["STANDARD", "MODERN", "LEGACY", "VINTAGE", "PIONEER", "PRE_MODERN", "PAUPER", "CUSTOM"])
      .nullable()
      .optional(),
    constructedFormatCustom: z.string().nullable().optional(),
  },
  ({ podId, ...body }) => api.patch(`/pods/${podId}`, body),
);

registerReadWriteTool(
  "add_individual_entrant",
  "Add a single player as an entrant to an individual (non-team) pod.",
  { podId: z.string(), playerId: z.string() },
  ({ podId, playerId }) => api.post(`/pods/${podId}/entrants`, { playerId }),
);

registerReadWriteTool(
  "add_team_entrant",
  "Add a team (2+ players) as an entrant to a team-event pod.",
  { podId: z.string(), teamName: z.string(), playerIds: z.array(z.string()).min(1) },
  ({ podId, teamName, playerIds }) => api.post(`/pods/${podId}/entrants`, { teamName, playerIds }),
);

registerReadWriteTool(
  "generate_round",
  "Auto-pair the next round of a pod (Swiss pairing, avoiding repeats).",
  { podId: z.string() },
  ({ podId }) => api.post(`/pods/${podId}/rounds`),
);

registerReadWriteTool(
  "manual_pair_round",
  "Manually pair the next round of a pod. Every active entrant must appear exactly once; use entrantBId: null for a bye.",
  {
    podId: z.string(),
    pairs: z.array(z.object({ entrantAId: z.string(), entrantBId: z.string().nullable() })).min(1),
  },
  ({ podId, pairs }) => api.post(`/pods/${podId}/rounds/manual`, { pairs }),
);

registerReadWriteTool(
  "swap_pairing",
  "Swap two entrant slots between pending matches in a not-yet-started round.",
  {
    roundId: z.string(),
    matchAId: z.string(),
    sideA: z.enum(["A", "B"]),
    matchBId: z.string(),
    sideB: z.enum(["A", "B"]),
  },
  ({ roundId, ...body }) => api.post(`/rounds/${roundId}/swap`, body),
);

registerReadWriteTool("start_round", "Start a pending round, locking further pairing edits and starting its timer.", {
  roundId: z.string(),
}, ({ roundId }) => api.post(`/rounds/${roundId}/start`));

registerReadWriteTool(
  "extend_round",
  "Extend an active round's timer by N minutes.",
  { roundId: z.string(), minutes: z.number().int().min(1).max(60) },
  ({ roundId, minutes }) => api.post(`/rounds/${roundId}/extend`, { minutes }),
);

registerReadWriteTool(
  "complete_round",
  "Complete an active round. Fails if any non-bye match is still missing a result.",
  { roundId: z.string() },
  ({ roundId }) => api.post(`/rounds/${roundId}/complete`),
);

registerReadWriteTool(
  "submit_match_result",
  "Submit or correct a match's result. Works while the round is ACTIVE (submit) or COMPLETED (correction).",
  {
    matchId: z.string(),
    result: z.enum(["A_WINS", "B_WINS", "DRAW"]),
    gamesWonA: z.number().int().min(0),
    gamesWonB: z.number().int().min(0),
    gamesDrawn: z.number().int().min(0).default(0),
  },
  ({ matchId, ...body }) => api.patch(`/matches/${matchId}/result`, body),
);

registerReadWriteTool(
  "add_card_pull",
  "Add a card pull to a pod — resolves the card live via Scryfall for image/price. Pass setCode to pin a specific printing (e.g. a card reprinted across many sets would otherwise resolve to Scryfall's arbitrary 'default' printing, which is often wrong for the actual pod). For a special version that shares its name with the normal printing in the same set (showcase/borderless/promo), pass collectorNumber+setCode instead of cardName — fuzzy name search can't tell those apart.",
  {
    podId: z.string(),
    cardName: z.string().optional(),
    collectorNumber: z
      .string()
      .describe("Scryfall collector number, e.g. '243' — requires setCode, pins the exact printing instead of matching by name")
      .optional(),
    playerId: z.string().optional(),
    setCode: z.string().describe("Scryfall set code, e.g. 'eoe' — pins the printing instead of guessing").optional(),
    foil: z.boolean().optional(),
  },
  ({ podId, ...body }) => api.post(`/pods/${podId}/card-pulls`, body),
);

registerReadWriteTool(
  "update_card_pull",
  "Correct an existing card pull's attribution and/or printing (setCode/foil/collectorNumber) without losing its playerId/addedAt history — use this instead of delete + re-add when a pull resolved to the wrong printing.",
  {
    cardPullId: z.string(),
    playerId: z.string().nullable().optional(),
    setCode: z.string().describe("Scryfall set code, e.g. 'eoe' — re-resolves the same card name in this set").optional(),
    collectorNumber: z
      .string()
      .describe("Scryfall collector number, e.g. '243' — pins an exact printing when the pull matched the wrong one of two cards sharing a name+set")
      .optional(),
    foil: z.boolean().optional(),
  },
  ({ cardPullId, ...body }) => api.patch(`/card-pulls/${cardPullId}`, body),
);

// -----------------------------------------------------------------------
// Destructive (confirm-gated)
// -----------------------------------------------------------------------

registerDestructiveTool(
  "delete_tournament",
  "Delete a tournament and everything in it (all its pods, rounds, matches, entrants, card pulls).",
  { tournamentId: z.string() },
  async ({ tournamentId }) => {
    const data = await api.get<{ tournament: { name: string; pods: Array<{ name: string }> } }>(
      `/tournaments/${tournamentId}`,
    );
    return `Would delete tournament "${data.tournament.name}" and its ${data.tournament.pods.length} pod(s): ${data.tournament.pods.map((p) => p.name).join(", ") || "(none)"}.`;
  },
  ({ tournamentId }) => api.delete(`/tournaments/${tournamentId}`),
);

registerDestructiveTool(
  "delete_pod",
  "Delete a pod and everything in it (its rounds, matches, entrants, card pulls).",
  { podId: z.string() },
  async ({ podId }) => {
    const data = await api.get<{ pod: { name: string; entrants: unknown[] } }>(`/pods/${podId}`);
    const rounds = await api.get<{ rounds: unknown[] }>(`/pods/${podId}/rounds`);
    return `Would delete pod "${data.pod.name}" with ${data.pod.entrants.length} entrant(s) and ${rounds.rounds.length} round(s).`;
  },
  ({ podId }) => api.delete(`/pods/${podId}`),
);

registerDestructiveTool(
  "remove_entrant",
  "Remove an entrant from a pod (deletes their team too, if it's a team entrant — takes any of that team's match results with it).",
  { entrantId: z.string() },
  async ({ entrantId }) => `Would remove entrant ${entrantId} and any match results tied to it.`,
  ({ entrantId }) => api.delete(`/entrants/${entrantId}`),
);

registerDestructiveTool(
  "delete_card_pull",
  "Remove a card pull.",
  { cardPullId: z.string() },
  async ({ cardPullId }) => `Would delete card pull ${cardPullId}.`,
  ({ cardPullId }) => api.delete(`/card-pulls/${cardPullId}`),
);

const transport = new StdioServerTransport();
await server.connect(transport);
