# Public-release readiness

The source is prepared for BenedictOkpala/out2eat. Original code is MIT under
Benedict Okpala; dependency and brand notices remain. See license-review.md for
corrected source clauses. No blanket inherited-file or private-cache blocker.

## Functionality and protection

Groq openai/gpt-oss-20b makes one validated dining_search tool call. It may tighten
budget or add supported food/preference constraints; it cannot loosen the preset
radius or invent restaurant facts. Explicit Profile-based search handles missing
or failed AI with an unapplied-instructions notice. Ranking requires supported
food/cuisine evidence for each person for a primary. Single mutual matches are
valid; no mutual match returns an honest empty state. Unknown coordinates and
out-of-radius venues are rejected; explicit budgets exclude unknown prices.

Shared Redis protection is verified across independent local processes. Fixed
caps: caller 3/minute and 20/day; model 100/day; Qloo 300/day and one attempt per
2 seconds. Provider cooldowns, equivalent-constraint caches, 120-second search
leases and idempotent unused-reservation refunds remain enabled. Configuration
preflight precedes admission. Public configuration/store outages fail closed.
No repeated live-store or provider verification is needed during release prep.

Per-caller identity uses Vercel's trusted forwarded address; shared networks can
share a bucket and IP-changing callers can evade per-address limits. Global caps
remain the backstop. Process crashes/store failures can leave pending reservations
until expiry; no durable refund worker is added. Hosted behavior awaits deployment.

## Public data boundary

Only hand-authored synthetic fixtures are in tests. Raw responses, detailed
restaurant-by-restaurant reports, screenshots, HARs, real env files, local workspace
instructions, caches, dependencies and build output are ignored. Run npm run
check:public before commit/push; inspect staged files and compiled output for
configured values. Keep the same server-only store and salt on Vercel.

## Release steps

See deployment-preparation.md for GitHub/Vercel account and import instructions.
No ZIP, paid service or automatic provider check is part of the release.
