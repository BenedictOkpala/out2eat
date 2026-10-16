import { createHash, createHmac, randomUUID } from "node:crypto";

export class UsageError extends Error {
  limiter?: string;
  resetAt?: number;
  constructor(message: string, details?: {limiter: string; resetAt: number}) {
    super(message); this.name = "UsageError";
    this.limiter = details?.limiter; this.resetAt = details?.resetAt;
  }
}
export type Reservation = { commit: () => void; release: () => Promise<void> };
const local = new Map<string, { value: string; until: number; window?: string }>();
export function resetUsageState() { local.clear(); }
export function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function distributed(): boolean {
  const configured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!configured && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    throw new UsageError("Public dining search is disabled until shared usage protection is configured.");
  }
  return configured;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL!);
  if (url.protocol !== "https:" || url.username || url.password) throw new UsageError("Invalid shared usage configuration.");
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(4000),
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(command) });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    if (payload.error || !("result" in payload)) throw new Error();
    return payload.result;
  } catch { throw new UsageError("Shared usage protection is unavailable. No further provider calls were made."); }
}

function localGet(key: string) {
  const row = local.get(key);
  if (!row || row.until <= Date.now()) { local.delete(key); return null; }
  return row.value;
}

// All checks and increments are one atomic operation on the shared primary.
export const LIMIT_SCRIPT = `
for i,key in ipairs(KEYS) do
  if tonumber(redis.call('GET',key) or '0') >= tonumber(ARGV[i*2-1]) then
    local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
    local ttl=redis.call('PTTL',key)
    if ttl<0 then return {0,i,0} end
    return {0,i,now+ttl}
  end
end
local result={1}
for i,key in ipairs(KEYS) do
  local n=redis.call('INCR',key)
  if n==1 then redis.call('EXPIRE',key,ARGV[i*2]) end
  local window=redis.call('GET',key..':window')
  if not window then
    window=ARGV[#KEYS*2+1]
    redis.call('SET',key..':window',window,'PX',math.max(1,redis.call('PTTL',key)))
  end
  table.insert(result,window)
end
return result`;
export const RELEASE_SCRIPT = `
for i,key in ipairs(KEYS) do
  if redis.call('GET',key..':window')==ARGV[i] and tonumber(redis.call('GET',key) or '0')>0 then redis.call('DECR',key) end
end
return 1`;
function limited(key: string, resetAt: number, quietSpacing = false): never {
  const limiter = key.startsWith("caller:") ? `caller.${key.split(":").at(-1)}` : key.replaceAll(":", ".");
  if (!quietSpacing || limiter !== "provider.qloo.spacing") console.warn("Dining limiter rejected", JSON.stringify({limiter,resetAt:resetAt > 0 ? new Date(resetAt).toISOString() : null}));
  throw new UsageError("Dining usage limit reached. Please try again later.", {limiter,resetAt});
}
async function reserve(rows: { key: string; limit: number; ttl: number }[], quietSpacing = false): Promise<Reservation> {
  const shared = distributed();
  const keys = rows.map(r => `out2eat:v1:${r.key}`);
  let windows: string[];
  if (shared) {
    const result = await redis(["EVAL", LIMIT_SCRIPT, rows.length, ...keys, ...rows.flatMap(r => [r.limit, r.ttl]), randomUUID()]);
    if (!Array.isArray(result)) throw new UsageError("Invalid shared usage response.");
    if (result[0] === 0 && rows[Number(result[1])-1]) limited(rows[Number(result[1])-1]!.key, Number(result[2]), quietSpacing);
    if (result[0] !== 1 || result.length !== rows.length+1 || result.slice(1).some(value => typeof value !== "string")) throw new UsageError("Invalid shared usage response.");
    windows = result.slice(1) as string[];
  } else {
    const rejected = rows.find(r => Number(localGet(r.key) ?? 0) >= r.limit);
    if (rejected) limited(rejected.key, local.get(rejected.key)!.until);
    windows = [];
    for (const r of rows) {
      const value = Number(localGet(r.key) ?? 0);
      const window = local.get(r.key)?.window ?? randomUUID();
      windows.push(window);
      local.set(r.key, { value: String(value + 1), until: local.get(r.key)?.until ?? Date.now() + r.ttl * 1000, window });
    }
  }
  let state: "pending" | "committed" | "released" = "pending";
  return {
    commit() { if (state === "pending") state = "committed"; },
    async release() {
      if (state !== "pending") return;
      if (shared) await redis(["EVAL", RELEASE_SCRIPT, keys.length, ...keys, ...windows]);
      else rows.forEach((r,i) => {
        const value = Number(localGet(r.key) ?? 0), row = local.get(r.key);
        if (row?.window === windows[i] && value > 0) local.set(r.key, {...row,value:String(value-1)});
      });
      state = "released";
    },
  };
}

export async function admitCaller(caller: string) {
  distributed();
  const salt = process.env.USAGE_CALLER_SALT;
  if (!salt && (process.env.VERCEL || process.env.NODE_ENV === "production")) throw new UsageError("Public dining search needs USAGE_CALLER_SALT.");
  const id = createHmac("sha256", salt ?? "local-development-only").update(caller).digest("hex");
  return reserve([{key:`caller:${id}:minute`,limit:3,ttl:60},{key:`caller:${id}:day`,limit:20,ttl:86400}]);
}

// Each actual attempt, including a Qloo retry, reserves a unit before fetch.
// Fixed caps deliberately cannot be raised by public request arguments.
export async function reserveProvider(provider: "model" | "qloo") {
  const deadline = Date.now() + 15_000;
  for (let attempt = 0; ; attempt++) {
    // Recheck provider cooldowns after waiting: another instance may set one.
    const cooldown = await cacheRead<number>(`cooldown:${provider}`);
    if (cooldown && cooldown > Date.now()) throw new UsageError(`Dining provider is rate limited. Retry after ${new Date(cooldown).toISOString()}.`, {limiter:`provider.${provider}.cooldown`,resetAt:cooldown});
    try {
      return await reserve([{key:`provider:${provider}:day`,limit:provider === "model" ? 100 : 300,ttl:86400},
        ...(provider === "qloo" && distributed() ? [{key:"provider:qloo:spacing",limit:1,ttl:2}] : [])], provider === "qloo");
    } catch (error) {
      if (!(error instanceof UsageError) || error.limiter !== "provider.qloo.spacing") throw error;
      const delay = Math.max(25, (error.resetAt ?? 0) - Date.now() + 25);
      // Only retry shared admission, never a provider request. Rejection is
      // atomic and charges no daily unit. Bound both contention and total wait.
      if (!error.resetAt || attempt >= 8 || Date.now() + delay > deadline) {
        console.warn("Dining limiter rejected", JSON.stringify({limiter:error.limiter,resetAt:error.resetAt ? new Date(error.resetAt).toISOString() : null}));
        throw error;
      }
      if (process.env.DINING_DIAGNOSTICS === "true") console.info("Dining Qloo spacing wait", JSON.stringify({waitMs:delay,attempt:attempt + 1,resetAt:new Date(error.resetAt).toISOString()}));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function recordQlooCooldown(until: number) {
  return recordProviderCooldown("qloo", until);
}
export async function recordProviderCooldown(provider: "qloo" | "model", until: number) {
  const ttl = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  if (distributed()) {
    await redis(["EVAL", "local old=tonumber(redis.call('GET',KEYS[1]) or '0'); if tonumber(ARGV[1])>old then redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]) end return 1", 1, `out2eat:v1:cache:cooldown:${provider}`, until, ttl]);
  } else {
    const current = await cacheRead<number>(`cooldown:${provider}`);
    if (!current || until > current) await cacheWrite(`cooldown:${provider}`, until, ttl);
  }
}

export async function cacheRead<T>(key: string): Promise<T | null> {
  const value = distributed() ? await redis(["GET", `out2eat:v1:cache:${key}`]) : localGet(`cache:${key}`);
  return typeof value === "string" ? JSON.parse(value) as T : null;
}
export async function cacheWrite(key: string, value: unknown, seconds: number) {
  if (distributed()) await redis(["SET", `out2eat:v1:cache:${key}`, JSON.stringify(value), "EX", seconds]);
  else {
    for (const [k, row] of local) if (row.until <= Date.now()) local.delete(k);
    if (local.size > 1024) throw new UsageError("Local cache is full. Try again later.");
    local.set(`cache:${key}`, { value: JSON.stringify(value), until: Date.now() + seconds * 1000 });
  }
}
export async function withSearchLease<T>(key: string, work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const shared = distributed();
  const leaseKey = `out2eat:v1:lease:${key}`;
  if (shared) {
    if (await redis(["SET", leaseKey, token, "NX", "EX", 120]) !== "OK") throw new UsageError("An equivalent search is running. Try again shortly.");
  } else {
    if (localGet(leaseKey)) throw new UsageError("An equivalent search is running. Try again shortly.");
    local.set(leaseKey, { value: token, until: Date.now() + 120000 });
  }
  try { return await work(); }
  finally {
    if (shared) await redis(["EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, leaseKey, token]);
    else local.delete(leaseKey);
  }
}
