export type RetryBudget = { remaining: number };
type RateInfo = { retryAfterMs: number | null; headers: Record<string, string> };

export function rateInfo(headers: Headers, now = Date.now()): RateInfo {
  const safe: Record<string, string> = {};
  const delays: number[] = [];
  const retry = headers.get("retry-after");
  if (retry) {
    const seconds = Number(retry);
    const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(retry) - now;
    if (Number.isFinite(delay)) { delays.push(Math.max(0, delay)); safe["retry-after"] = retry; }
  }
  for (const name of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
    const value = headers.get(name);
    if (value && /^\d+(\.\d+)?$/.test(value)) safe[name] = value;
  }
  // Legacy X-RateLimit-Reset is an epoch; standard RateLimit-Reset is a delta.
  if (safe["x-ratelimit-reset"]) delays.push(Math.max(0, Number(safe["x-ratelimit-reset"]) * 1000 - now));
  if (safe["ratelimit-reset"]) delays.push(Number(safe["ratelimit-reset"]) * 1000);
  // Qloo's actual response uses per-second and per-month delta windows.
  for (const window of ["second", "month"]) {
    for (const field of ["limit", "remaining", "reset"]) {
      const name = `x-${window}-ratelimit-${field}`, value = headers.get(name);
      if (value && /^\d+(\.\d+)?$/.test(value)) safe[name] = value;
    }
    if (safe[`x-${window}-ratelimit-remaining`] === "0" && safe[`x-${window}-ratelimit-reset`]) delays.push(Number(safe[`x-${window}-ratelimit-reset`]) * 1000);
  }
  return { retryAfterMs: delays.length ? Math.max(...delays) : null, headers: safe };
}

export class QlooHttpError extends Error {
  status: number;
  retryAt: number | null;
  constructor(status: number, retryAt: number | null = null) {
    super(`Qloo HTTP ${status}`); this.name = "QlooHttpError";
    this.status = status; this.retryAt = retryAt;
  }
}

export function createQlooClient(options: {
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  spacingMs?: number;
  onResponse?: (event: { path: string; status: number; rate: RateInfo; at: number }) => void;
}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const spacing = options.spacingMs ?? 2000;
  let nextAt = 0, blockedUntil = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    get(path: string, params: Record<string, string | number | undefined>, key: string, budget: RetryBudget): Promise<unknown> {
      const work = async () => {
        const query = new URLSearchParams();
        for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(name, String(value));
        for (;;) {
          const wait = Math.max(nextAt, blockedUntil) - now();
          // Long provider cooldowns are returned to the caller, never shortened.
          if (wait > 15_000) throw new QlooHttpError(429, Math.max(nextAt, blockedUntil));
          if (wait > 0) await sleep(wait);
          nextAt = now() + spacing;
          const response = await options.fetch(`https://hackathon.api.qloo.com${path}?${query}`, {
            method: "GET", headers: { "X-Api-Key": key, Accept: "application/json" },
            redirect: "manual", signal: AbortSignal.timeout(12_000),
          });
          const rate = rateInfo(response.headers, now());
          options.onResponse?.({ path, status: response.status, rate, at: now() });
          if (response.status === 429 || ["x-ratelimit-remaining", "ratelimit-remaining", "x-second-ratelimit-remaining", "x-month-ratelimit-remaining"].some(name => rate.headers[name] === "0")) {
            blockedUntil = Math.max(blockedUntil, now() + (rate.retryAfterMs ?? 60_000));
          }
          if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 429 && budget.remaining > 0 && blockedUntil - now() <= 15_000) {
              budget.remaining--; continue;
            }
            throw new QlooHttpError(response.status, response.status === 429 ? blockedUntil : null);
          }
          const payload: unknown = await response.json();
          if (payload && typeof payload === "object" && "success" in payload && payload.success === false) throw new Error("Qloo reported failure");
          return payload;
        }
      };
      const result = tail.then(work);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
