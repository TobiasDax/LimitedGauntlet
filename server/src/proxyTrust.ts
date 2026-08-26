import { isIP } from "node:net";

export type TrustedProxyConfig = false | string[];

export function parseTrustedProxies(raw: string | undefined): TrustedProxyConfig {
  if (raw === undefined || raw.trim() === "") return false;

  return raw.split(",").map((entry) => {
    const value = entry.trim();
    if (!value) throw new Error("TRUSTED_PROXIES contains an empty entry");
    const [address, prefix, extra] = value.split("/");
    if (!address) throw new Error(`Invalid TRUSTED_PROXIES entry: ${value}`);
    const version = isIP(address);
    if (!version || extra !== undefined) {
      throw new Error(`Invalid TRUSTED_PROXIES entry: ${value}`);
    }
    if (prefix !== undefined) {
      if (!/^\d+$/.test(prefix)) throw new Error(`Invalid TRUSTED_PROXIES entry: ${value}`);
      const bits = Number(prefix);
      if (bits < 0 || bits > (version === 4 ? 32 : 128)) {
        throw new Error(`Invalid TRUSTED_PROXIES entry: ${value}`);
      }
      if (bits === 0) throw new Error(`Invalid TRUSTED_PROXIES entry: ${value}`);
    }
    return value;
  });
}
