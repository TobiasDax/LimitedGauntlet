# LimitedGauntlet MCP server

Exposes the app's REST API as MCP tools so an agent can read and manage tournaments, pods, rounds, results, and card pulls directly. A thin wrapper over the HTTP API — pairing/standings/validation/multi-tenancy all stay authoritative on the server, this just calls it.

## Setup

1. Log into the app, open **API Tokens** (top-right nav), mint a token, and copy it — it's shown once.
2. Run over stdio with two env vars:
   - `LIMITED_GAUNTLET_URL` — e.g. `https://limitedgauntlet.your-tailnet.ts.net` (no trailing `/api`)
   - `LIMITED_GAUNTLET_TOKEN` — the token from step 1

```bash
npm run build --workspace mcp
```

Example client config (Claude Desktop / Claude Code style):

```json
{
  "mcpServers": {
    "limitedgauntlet": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "LIMITED_GAUNTLET_URL": "https://limitedgauntlet.your-tailnet.ts.net",
        "LIMITED_GAUNTLET_TOKEN": "lg_..."
      }
    }
  }
}
```

## Auth & blast radius

The token acts **as the organizer who minted it** — same access as their own login, no more. Keep it Tailscale-only and treat it like a password (store it hashed server-side; the plaintext is shown once at mint time and never again). Revoke from the same API Tokens page.

## Destructive tools

`delete_tournament`, `delete_pod`, `remove_entrant`, and `delete_card_pull` require confirmation: the first call is a dry run that describes what would be affected and returns a `confirmationToken`; call the tool again with that token to actually execute (it's single-use and expires after 5 minutes), or pass `confirm: true` on the first call to skip the dry run. Every other write executes directly.
