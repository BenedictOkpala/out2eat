export const DINING_UNAVAILABLE = "Dining recommendations are unavailable right now. Your profiles are saved. Please try again later.";
export class DiningSetupError extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`Check server configuration: ${fields.join(", ")}. See README Setup. Never log credential values.`);
    this.fields = fields;
  }
}

/** Pure preflight: no store commands, reservations or provider calls. */
export function checkDiningConfiguration() {
  const missing: string[] = [];
  if (!["QLOO_API_KEY","QLOO_HACKATHON_API_KEY","HACKATHON_QLOO_API_KEY"].some(name => process.env[name]?.trim())) missing.push("QLOO_API_KEY");
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim(), token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const publicMode = !!process.env.VERCEL || process.env.NODE_ENV === "production";
  if (publicMode || url || token) {
    if (!url) missing.push("UPSTASH_REDIS_REST_URL");
    if (!token) missing.push("UPSTASH_REDIS_REST_TOKEN");
    if (url) {
      try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(); }
      catch { missing.push("UPSTASH_REDIS_REST_URL (valid HTTPS endpoint required)"); }
    }
  }
  if (publicMode && !process.env.USAGE_CALLER_SALT?.trim()) missing.push("USAGE_CALLER_SALT");
  if (missing.length) throw new DiningSetupError(missing);
}

export function setupUnavailable(error: DiningSetupError) {
  console.warn("Dining configuration unavailable", error.message);
  return {ok:false as const,code:"unconfigured" as const,message:DINING_UNAVAILABLE};
}
