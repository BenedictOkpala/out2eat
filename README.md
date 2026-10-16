# Out2Eat

Two friends, one dinner decision. Edit both taste profiles, choose a preset
location and basic budget, then ask **“Food tonight?”**. A tool-calling model
can interpret the message and invoke Qloo when configured. Otherwise a clearly
labelled Profile-based search uses only both profiles, location and budget,
with a warning that extra message instructions could not be applied. Returned evidence supports a primary
recommendation and up to two quieter alternatives. A single qualifying mutual
match is valid; no mutual match produces an honest empty state.

The React, TanStack Start, Vite and Tailwind UI is preserved. No accounts,
booking or extra onboarding. Profiles stay in browser storage.

Live judging demo: **https://out2eat.vercel.app** (personal Vercel Hobby workspace).
[Hosted verification](docs/hosted-verification.md) separates UI checks from live API verification.

## Setup

Use Node **24.x** and npm:

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and configure credentials privately.
Restart after changing environment files. The wrapper reads project-root
`.env`, then `.env.local`; existing shell variables take precedence.

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Server-side Qloo key for `https://hackathon.api.qloo.com` |
| `GROQ_API_KEY` | Optional server-side free-plan Groq key; model fixed to `openai/gpt-oss-20b` |
| `UPSTASH_REDIS_REST_URL` | HTTPS shared Redis REST primary; required for public/production use |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only Redis token allowing GET, SET and EVAL |
| `USAGE_CALLER_SALT` | Private random HMAC salt for caller buckets; required in production |

Never prefix credentials with `VITE_`. Without the optional model credential,
Profile-based search still calls real Qloo and is never labelled an AI agent.
AI failures also use this labelled fallback; valid AI clarification does not.
Extra instructions are explicitly reported as unapplied, including in shared text.
Production fails closed without working shared usage protection. Development
can use process-local limits, which reset on restart. No Redis service was
provisioned or paid plan enabled. Discuss costs before enabling a billable service.

Configuration is checked locally before caller allowances, shared-store commands
or provider reservations. Missing Qloo/protection configuration consumes none
of those limits. Missing optional Groq credentials consume zero model units;
a valid profile search still uses caller allowance and actual Qloo units.
The UI says only that recommendations are unavailable and profiles are saved;
server diagnostics name missing settings from the table above and point here.
Production still requires shared Redis and `USAGE_CALLER_SALT`; local fallback
does not bypass that requirement. A partial Redis configuration is also rejected.

Unused reservations are refunded if setup fails after admission but before any
provider attempt. Refunds are idempotent and tied to the original counter window,
so a delayed refund cannot reduce a newer window's usage. Once a provider attempt
starts, its unit and the caller admission remain used, including authentication
errors/timeouts; they are not unused reservations. If Redis is unavailable during
a refund or the process dies, a pending reservation may remain until its original
window expires. Protection remains fail-closed; no durable refund worker is added.

When a limit rejects, server diagnostics include `limiter` and an absolute UTC
`resetAt` timestamp, without caller identity or credential values. IDs distinguish
`caller.minute` (3/60 seconds), `caller.day` (20/24 hours),
`provider.model.day` (100/24 hours), `provider.qloo.day` (300/24 hours) and
`provider.qloo.spacing` (one/2 seconds). Qloo spacing contention waits for atomic admission (up to eight
waits inside 15 seconds), rather than failing a normal multi-call search. Daily
caps and provider cooldowns still reject. Local and production share global
provider budgets/cooldowns; their caller identities differ. Windows begin at their first reservation,
not midnight. The old generic message did not record a specific window/reset;
its historical timestamp cannot be recovered from process-local state after HMR
or restart. This change does not reset shared production counters.

Development listens on `0.0.0.0:8080`. `startup.ps1` and `startup.sh` launch
through `npm run dev`. `npm run preview` serves the build on `127.0.0.1:8081`.

## Enable the optional AI path

Create a Free-plan key at [Groq API keys](https://console.groq.com/keys), save it
privately as `GROQ_API_KEY` in `.env.local`, then restart the dev server.
The selected model is `openai/gpt-oss-20b`; no model setting or SDK is needed.
Groq's [current limits](https://console.groq.com/docs/rate-limits) list a free
allowance for this model; check your account's actual quota. Do not upgrade or
add billing to enable this demo. xAI credentials are no longer required or used.
A private Groq key is now configured locally. Live tool calling is verified;
see [AI verification](docs/ai-and-profile-search.md). Never expose the key.

## Agent, constraints and evidence

One bounded Groq tool-calling request reads the message, selected context and
profiles. Its validated `dining_search` call may tighten budget, require
supported food evidence, add preference exclusions or decline an unsupported
request. For example, “cheap pasta, avoid seafood” can change constraints.
No model pass generates restaurant facts or ranking explanations.

The service resolves Qloo tags and searches `/v2/insights`, considering both
friends. Candidates must fit the price ceiling and canonical preset radius;
missing/invalid coordinates are rejected. Client preset coordinates/radius
cannot broaden a search. Wuse II remains a preset at 9.0761981, 7.4759718
with a strict 2.5 km radius. Maitama (9.0900989, 7.4908053) is also a verified
example. Wuse II is the default for new sessions; saved choices are preserved.
Searches are within 2.5 km of these area centre points; circles can cross
district boundaries. Other locations remain secondary with their existing radii.
[Coverage findings](docs/maitama-jabi-coverage.md) include Jabi: venues were
returned but no mutual food match met the tested constraints. Custom text must exactly
identify a listed preset by label/locality. Other geographic boundaries
receive a clear limitation without a Qloo search or silent substitution.

Ranking first favors balanced food evidence, then total food matches, then
taste coverage/Qloo affinity. Each person needs supported food/cuisine evidence
for the primary; wine/atmosphere cannot satisfy that rule. Dessert-only evidence
and known avoids exclude candidates. Weak alternatives stay labelled. Avoids
are preferences, not allergy guarantees. Budget is a Qloo price-level ceiling,
not a meal-price promise; unknown prices are excluded unless Any is selected.
Hours/tables are not checked. Missing metadata is not invented.

Public protection uses atomic caller limits, global daily provider budgets,
per-attempt reservations, effective-constraint caches, shared leases, tag caches
and Qloo cooldowns. [Current review](docs/public-readiness.md) documents fixed
limits, identity limitations, cache behavior and remaining verification.

## 30–45-second demo

1. Choose **Try example profiles**, then open **Your tastes** and
   **Friend’s tastes** to demonstrate editing.
2. Select Wuse II (or another preset) and a basic price tier.
3. Send **“Food tonight?”**, showing the loading state.
4. Show the primary's separate evidence for each friend and actual ranking
   reason, then quieter alternatives if available.
5. Tap **Share**. Secure browsers may open native sharing; HTTP uses copy
   or selectable text. Setup stays editable through the compact summary.

Live results depend on credentials and coverage. Never present synthetic QA
fixtures as live results. No-match and provider failures are shown honestly.

## Checks

```sh
npm run typecheck
npm run test:dining
npm test
npm run build
```

Tests cover model validation, message constraints, usage budgets, cache keys,
two-person ranking, avoids, radius, budget, single/empty results and rate limits.
`scripts/dining-browser-test.mjs` intercepts labelled fixtures for profile/mobile,
loading, duplicate-submit, results, Share, empty/error and retry checks.
`scripts/wuse-replay-browser.mjs` now uses synthetic data only, despite its
historical name. Neither script verifies live providers.

Local typecheck, focused tests and production build pass. One controlled live
Profile-based search in Wuse II succeeded through the local browser in 8.904 s
with real Qloo restaurants. Live Groq calls now produce validated dining_search
tool calls: Food tonight retains Mid (price level ≤2), while somewhere cheaper
tightens to Low (≤1) and returns an honest no-match. The normal AI search returned
real Qloo-ranked restaurants; the cheaper Qloo request enforced Low. Hosted
Redis protection is verified across independent local processes; Vercel-hosted verification remains pending.
See [separate outcomes and adapter details](docs/ai-and-profile-search.md).

## Vercel preparation — do not deploy yet

Node 24 and Nitro's Vercel preset emit Build Output API files under
`.vercel/output`. `vercel.json` installs the lockfile, typechecks and builds.
No manual SPA rewrite is needed. Configure all server variables above. All
instances must share one consistent Redis primary/budget namespace, with
persistence and non-eviction appropriate to counters. Missing/outage protection
blocks provider calls. Build on Vercel; do not upload Windows native dependencies.

Unused auth/database/connector implementations, preview bridge/path/provider
helpers, Grok dev flags and Linux-only preview tooling are outside the public
source tree. The environment launcher loads private files without platform flags.
The existing Grok PWA/install/branding group remains intact pending export terms.
Google Fonts and other remote assets still need internet. The app is deployed
at https://out2eat.vercel.app; see the hosted verification report.

## Licence and public-repository readiness

Original code/documentation by Benedict Okpala are [MIT licensed](LICENSE).
Dependencies, inherited Grok code, Qloo data and third-party assets retain
their terms; see [third-party notices](THIRD_PARTY_NOTICES.md).

Public tests use small hand-authored synthetic fixtures. Raw recordings and
QA artifacts remain in ignored private directories. API data/cache usage is
subject to Qloo's terms and any account-specific agreement; code publication
does not grant raw-data publication rights.

The [corrected terms review](docs/license-review.md) distinguishes generated code,
third-party assets and platform implementations. The provenance inventory alone
is not a publication restriction. The current Qloo hackathon requires a public
hosted demo and permits private server-side caches without a retention limit.
Raw Qloo responses must stay out of the public repository. Hackathon credentials
expire after judging; ongoing service requires renewed access.

Run `npm run check:public` before committing/pushing. It scans source, tracked
files and committed blobs without printing secrets. See
[deployment preparation](docs/deployment-preparation.md) for exact GitHub/Vercel
steps and server environment variables. No ZIP, paid infrastructure or new
product feature is needed.

The [production spacing fix](docs/production-limit-fix.md) was verified with one
real hosted Groq-to-Qloo search. Restaurant evidence and raw QA records stay private.
