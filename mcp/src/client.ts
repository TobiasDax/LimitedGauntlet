const baseUrl = process.env.LIMITED_GAUNTLET_URL;
const apiToken = process.env.LIMITED_GAUNTLET_TOKEN;

if (!baseUrl) {
  throw new Error(
    "LIMITED_GAUNTLET_URL env var is required (e.g. https://limitedgauntlet.your-tailnet.ts.net) — fails fast, not at first tool call.",
  );
}
if (!apiToken) {
  throw new Error(
    "LIMITED_GAUNTLET_TOKEN env var is required — mint one from the app's API Tokens page (top-right nav) and paste it here.",
  );
}

const apiBase = `${baseUrl.replace(/\/+$/, "")}/api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`LimitedGauntlet API error ${status}: ${JSON.stringify(body)}`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiToken}`,
      // Only set content-type when there's actually a body — Fastify's
      // JSON body parser rejects an empty body sent with this header
      // (FST_ERR_CTP_EMPTY_JSON_BODY), which every no-body DELETE would
      // otherwise hit. Matches client/src/lib/api.ts's same guard.
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>("GET", path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>("PATCH", path, body),
  delete: <T>(path: string): Promise<T> => request<T>("DELETE", path),
};
