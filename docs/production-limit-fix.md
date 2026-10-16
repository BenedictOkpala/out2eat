# Production spacing admission fix - 16 October 2026

The original production diagnostics identified app-owned provider.qloo.spacing,
with reset 2026-10-16T14:59:09.002Z (15:59:09.002 WAT), followed by caller.minute
with reset 2026-10-16T14:59:55.120Z (15:59:55.120 WAT). Neither was a provider HTTP
rejection. Both had expired before controlled verification.

Local and production callers have distinct identities: local-development versus
a Vercel-supplied client address. They intentionally share global model/Qloo
budgets, Qloo spacing/cooldowns and stable caches through the same Redis primary
and out2eat:v1 namespace. No keys, counters, salt or caps were reset or replaced.

The local pacing clock started before Redis reservation work. Network/processing
latency meant a subsequent internal Qloo lookup could reach the shared two-second
gate just before expiry. That normal contention formerly aborted the whole search.

reserveProvider now retries atomic admission only for provider.qloo.spacing,
waiting until its reset plus a small margin (or 25 ms if already elapsed), with
at most eight waits inside 15 seconds. Admission rejects before incrementing any
counter, so waits do not consume extra daily units. Every successful reservation
still precedes a real provider attempt. Daily exhaustion, store outages and actual
provider cooldowns remain fail-closed; cooldowns are rechecked after each wait.
Existing Qloo HTTP retry policy and caller limits are unchanged.

Five new mocked regressions cover transient spacing, unchanged daily exhaustion,
a cooldown arriving during a wait, sustained contention and the total wait bound.
All 78 dining/protection tests, typecheck and production build passed. Fix commit
e3d6cc5 was deployed to the existing personal Hobby project.

One real hosted browser submission at https://out2eat.vercel.app used example
profiles, Wuse II, Mid and Food tonight?. It completed in 4192 ms in AI mode.
Server diagnostics confirmed Groq HTTP 200, one dining_search tool call, Mid /
price maximum 2, and Qloo tag + Insights HTTP 200. Shared spacing admission waited
25 ms once, then continued. There were no HTTP retries or repeated submissions.
A primary with food evidence for both and two labelled partial alternatives
rendered without browser errors. Venue names, detailed evidence, raw RPC payload
and screenshots remain private under ignored artifacts/screenshots directories.

No provider budgets were bypassed or cleared. Status/tool diagnostics contain no
keys or raw restaurant responses. Physical-phone behavior and universal dining
quality/availability are not inferred from this single controlled verification.
