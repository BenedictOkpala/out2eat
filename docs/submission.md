# Submission description

**Out2Eat - a dinner recommendation that considers both friends.**

Choosing dinner together often becomes a compromise that satisfies one person more than the other. Out2Eat gives two friends simple editable dining profiles, a location and a budget. They ask "Food tonight?" and receive one primary restaurant recommendation with one or two alternatives, each explained for both people.

A Groq-hosted tool-calling model interprets the message and invokes a validated Qloo dining tool. Explicit supported foods, preference exclusions and tighter budgets affect the search. Qloo supplies real candidates and taste evidence; the server enforces preset radii, budget and avoids. Ranking requires food evidence for each friend before selecting a primary, prioritizes balanced suitability, and uses Qloo affinity as supporting evidence. Explanations use returned facts rather than invented details. A single qualifying mutual match is returned on its own. If AI is unavailable, clearly labelled Profile-based search still calls Qloo, explicitly warning that extra message instructions were not applied.

The existing React, TanStack Start, Vite and Tailwind UI is preserved, with a mobile-accessible composer and loading, empty, error and retry states. API credentials stay server-side. Test fixtures are clearly labelled and isolated from the live app.

**Verification status:** local typecheck, synthetic service/agent/usage tests and production build pass. One controlled live Profile-based browser search succeeded in Wuse II. Live Groq dining tool calls are verified: the standard request retains Mid and cheaper tightens to Low. The cheaper live Qloo request returned an honest no-match. Shared Redis limits/cache/refunds are verified across independent local processes; Vercel-hosted verification remains pending. Nothing has been deployed. Actual dining quality, hours and availability are unverified. Raw recordings are private; public fixtures are synthetic. Public judging hosting and private caching are supported by the current hackathon guidance. Retained export provenance is documented without a blanket publication restriction.
