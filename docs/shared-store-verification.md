# Shared-store verification ? 16 October 2026

Generated a 32-byte cryptographic random caller salt in ignored .env.local without
printing it. Existing store variables have no shell overrides. Restarted only the
identified Out2Eat development server; no UI/source feature changes or deployment.

Live authenticated Upstash REST tests passed using production-mode usage code and
unique isolated keys. The harness permits only the configured Redis endpoint and
rewrites app keys into a QA namespace; no actual provider allowances are modified.
Four independent Node processes verified atomic caller admission (3 allowed, 1
rejected), reset metadata and cross-process cache visibility. Verified daily caller
limits; model/Qloo global caps using isolated counters near their ceilings; Qloo
spacing; cooldown monotonicity; idempotent unused caller/provider refunds;
non-refund of committed attempts; synthetic empty-result caching and expiry;
search-lease duplicate rejection and cleanup on success/failure. QA keys deleted.

No Qloo or Groq requests. No real restaurant data stored by the verification.
73 offline dining/agent/usage regressions passed, including effective-constraint
cache identity and setup failures before admission/refunding unused reservations.

Re-run explicitly with: node --experimental-strip-types scripts/verify-shared-store.mjs
This spends Redis commands only. Do not run it automatically on builds or requests.
Vercel-hosted behavior is not yet verified. Local independent-process verification
does not prove deployed trusted caller-IP handling or account plan/eviction settings.
Keep the same salt/store across instances and do not reset real counters.
