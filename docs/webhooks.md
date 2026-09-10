# Webhooks

Any organizer can wire an event stream out of the app from **Settings →
Webhooks** — no code change or redeploy. An org can configure any number of
webhooks, each with its own URL and its own regenerable HMAC secret, delivered
to independently and in parallel, so the same events can fan out to several
places (e.g. Home Assistant *and* a Discord relay) without one affecting the
other. A per-pod toggle (`Pod.webhookEnabled`, on by default) opts a specific
pod out.

Configuration lives in the UI; [`deployment.md` § 9](deployment.md#9-optional-outbound-webhooks-home-assistant-etc)
covers the network side (LAN / Tailscale targets, `TRUSTED_PROXIES`).

## Request shape

`POST <your URL>`, `Content-Type: application/json`, with:

```
X-LimitedGauntlet-Signature: sha256=<hex>
```

where `<hex>` is HMAC-SHA256 of the **raw request body** keyed with that
webhook's secret. Every body is:

```jsonc
{
  "event": "round.started",
  "timestamp": "2026-09-10T18:04:11.284Z",   // ISO 8601, when the event fired
  "data": { /* see below */ }
}
```

For all pod-scoped events, `data` always carries the context:

```jsonc
{
  "podId": "clx…", "podName": "Samstag 1",
  "tournamentId": "clx…", "tournamentName": "GP 2026",
  /* …event-specific fields… */
}
```

## Events

| `event` | Fires when | Extra `data` fields |
|---|---|---|
| `pairings.posted` | Round N pairings are generated | `roundId`, `roundNumber`, `matches` |
| `round.started` | The round timer is started | `roundId`, `roundNumber`, `startedAt`, `endsAt`, `matches` |
| `round.extended` | Time is added to a running round | `roundId`, `roundNumber`, `endsAt` |
| `round.completed` | A round is marked complete | `roundId`, `roundNumber`, `isLastRound`, `standings` |
| `pod.completed` | The pod's **last** round just completed | `roundNumber`, `winner`, `standings` |
| `test` | The "Send test event" button | `message` (no pod context) |

**Round 1 is special.** To avoid leaking round-1 opponents before physical play
starts, `pairings.posted` for round 1 is **not** sent at pairing time — it fires
when the organizer clicks *Reveal pairings* (see the Seatings flow in the
README). Rounds 2+ fire `pairings.posted` at generation, since those pairings
are already derivable from the previous round's results.

### `matches`

```jsonc
[
  {
    "tableNumber": 1,
    "entrantA": { "id": "clx…", "name": "Alice" },
    "entrantB": { "id": "clx…", "name": "Bob" }   // null = bye
  }
]
```

`name` is the resolved player display name, or the team name for a team pod —
so a receiver can announce "Round 3: Alice vs. Bob at table 1" without calling
back into the API.

### `standings`

Ranked, rank 1 first:

```jsonc
[
  {
    "rank": 1,
    "entrant": { "id": "clx…", "name": "Alice" },
    "points": 9,
    "matchWinPct": 1.0,
    "gameWinPct": 0.78,
    "opponentsMatchWinPct": 0.55,
    "opponentsGameWinPct": 0.52
  }
]
```

`winner` on `pod.completed` is the rank-1 row (the same object shape), or `null`
if the pod had no entrants.

## Live round timer

There is no continuous "time remaining" stream. `round.started` and
`round.extended` carry an `endsAt` timestamp; a receiver derives its own live
countdown from it — the same way the app's own frontend does. A chime or
display update is a receiver-side automation triggered off that.

## Verifying the signature

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, header, secret) {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Verify against the **exact bytes received**, before any JSON re-serialisation.

## Delivery semantics

- **Fire-and-forget**, 5 s timeout, **no retries**. A slow or unreachable
  receiver never blocks a round action in the app; a failed delivery is logged
  and dropped. The "Send test event" button is the only place a delivery result
  is reported back.
- Each configured webhook is delivered to **in parallel** with its own
  signature; one broken receiver doesn't delay the others.
- **SSRF guard:** the target hostname is resolved and delivery is refused if it
  points at a loopback or link-local address (`127.0.0.0/8`, `169.254.0.0/16`
  incl. cloud metadata, `::1`, `fe80::/10`). Private LAN ranges
  (`192.168/10.x/172.16–31.x`) are **allowed** — that's the primary use case
  (your own Home Assistant). Best-effort, not airtight against DNS rebinding.

## Operator alert on new-org signup

Separate from the per-org webhooks above: a deployment-level `ADMIN_WEBHOOK_URL`
(+ `ADMIN_WEBHOOK_SECRET`, env config — see `deployment.md` § 11) fires one
HMAC-signed POST when a brand-new organization signs up, with
`event: "organization.created"` and `data: { orgName, orgSlug, creatorEmail }`.
Useful on a public instance with open signup. Inert unless configured.
