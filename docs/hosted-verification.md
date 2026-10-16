# Hosted verification ? 16 October 2026

Public production URL: https://out2eat.vercel.app
Project: out2eat; personal default workspace signalpilot (slug signalpilot2),
confirmed Hobby. Header commit: 80f7ded. The subsequent production spacing fix e3d6cc5 is deployed.

Vercel's Linux build installed the lockfile, passed TypeScript and built the
existing React/TanStack Start/Vite/Tailwind app with Nitro's Node 24 runtime.
No paid plan, service, domain or usage-limit reset was enabled. Existing Qloo,
Groq, Redis endpoint/token and caller salt were saved as sensitive Production
variables without printing their values. Store identity and global protections
remain unchanged. The public alias returns HTTP 200 without Vercel login.

Real external assets were used for hosted checks. Desktop (1280x800) and mobile
(390x844) both hydrate, have visible content, no horizontal overflow and no
console/runtime errors. Screenshots were inspected and remain private/ignored.

Synthetic server-function interception verified header click, Tab, Enter and
Space; return to setup from results/empty/error; editing a profile; preserved
location/budget/profile storage; no header-triggered page navigation or search;
and safe handling of late success/error responses while a newer UI request is
pending. These are labelled QA-only synthetic results, not live restaurants.
No live Groq or Qloo requests were made during hosted verification. No completed
shared-store verification was repeated.

A subsequent controlled hosted verification confirmed real Groq -> Qloo -> ranked
results in AI mode (one submission, 4192 ms); see production-limit-fix.md. Public
caller/global protections remain enabled and no shared counters were reset.
Native sharing on a physical phone and deliberate trusted-header spoof testing
were not exercised. The single result does not establish universal dining quality.

Deployment used the official Vercel CLI from this source tree. GitHub main is
pushed; automatic Vercel deployments from future GitHub pushes are not connected.
Do not assume a future push alone updates the public app. Use the existing
linked Hobby project for explicit deployments; never upload real env files.
