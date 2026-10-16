# Profile-based search and real AI adapter

16 October 2026. This change restores live recommendations without requiring
an LLM key, preserves the existing UI/ranking/constraints and adds no product
features, dependencies, purchased credits or infrastructure. Nothing deployed.

## Profile-based outcome: verified live locally

One controlled browser submission used the existing authorised Qloo credential,
Maya and Leo's example profiles, Wuse II's canonical 2.5 km radius and Mid budget.
The local server returned real ranked results in **8.904 seconds**:

A qualifying primary and alternatives were returned. Venue-specific provider
content remains in private verification records.

The primary ranks above those alternatives on balanced food evidence, as the
actual comparator reports. The existing service continues to reject missing,
invalid or out-of-radius coordinates, over-budget/unknown-price candidates for
explicit budgets, dessert-only categories and known preference avoids. No
radius widening, cuisine inference or invented restaurants were used.

The live page displayed **Profile-based search**, plus a notice that the
message was not interpreted and extra instructions could not be applied.
The share text carries the same qualification. Only the validated profiles,
preset geography, budget and previously shown exclusions affect this path;
client-supplied hidden AI constraints are cleared. Local real-response QA
artifacts remain ignored and private. No raw provider response was added to
public fixtures. This report is an application verification summary, not a
grant of data redistribution rights.

## AI outcome: live tool calling verified

The server now calls Groq's OpenAI-compatible Chat Completions endpoint with
`openai/gpt-oss-20b`, `tool_choice: required`, parallel calls disabled, low
reasoning effort and a 400-completion-token cap. Only `dining_search` is exposed.
One function call is accepted; malformed/multiple/unknown calls cannot execute
unvalidated arguments. Zod validates supported food/avoid terms, and the tool
cannot loosen budget or change geography/profiles. Food requirements filter
actual Qloo evidence. No further model pass invents restaurant descriptions:
the tool result is rendered using the existing deterministic ranking/evidence.

A valid clarification action makes no Qloo request. Missing optional credentials,
HTTP errors, timeout, invalid tool output, exhausted model budget or model
cooldown use the explicitly labelled profile path. Shared-store failures,
caller limits, Qloo limits and missing base configuration never bypass public
protection through fallback. No automatic model retry is made; 429 Retry-After
creates a shared model cooldown before profile fallback.

Create a Free-plan key at **https://console.groq.com/keys**. Save it privately as
**GROQ_API_KEY** in `.env.local`, then restart through `npm run dev`.
No model environment variable is required. The owner subsequently saved the
Groq key privately and authorised live verification. The server was restarted,
the key was detected without displaying it, and no shell override was present.
xAI is not required.

Initial Groq attempts returned HTTP 400 `tool_use_failed`: the model copied
profile preferences into the extra-food field and exceeded its three-item
limit. Those attempts correctly used profile fallback. The prompt now keeps
profile preferences inside the Qloo tool and reserves argument arrays for
additional instructions in the current message. Strict bounds remain enforced.

After the fix, each requested message returned HTTP 200 from Groq,
`finish_reason=tool_calls`, and exactly one validated `dining_search` call:

| Message | Tool budget | Qloo price maximum | Mode/outcome |
| --- | --- | --- | --- |
| Food tonight? | mid | 2 | AI: qualifying primary and alternatives |
| food tonight, somewhere cheaper. | low | 1 | AI: no qualifying mutual match |

Both calls used `action=search`, `requiredFood=[]` and `avoids=[]`. Wuse II's
2,500 m radius remained enforced. The cheaper request also excluded the three
previously shown venues. Its empty result was AI mode, not profile fallback.

The first successful baseline reused authenticated Qloo data. A final baseline
after natural cache expiry completed the fresh Groq → Qloo Insights → ranked
results flow in **3.144 seconds**. The fresh cheaper request took **1.840 seconds**
and enforced price maximum 1. No budgets were reset, constraints broadened or
restaurants invented. Live calls stopped after verification. Real-response
artifacts remain private; diagnostics contain only safe status/tool metadata.
Typecheck, 72 focused tests, production build and desktop/mobile render checks
passed. Shared Redis is verified across independent local processes; hosted Vercel verification remains pending. No deployment was performed.

Official documentation checked:

- [Groq free-plan limits](https://console.groq.com/docs/rate-limits) list a
  free allowance for `openai/gpt-oss-20b`. Exact account quotas may differ.
- [Tool support](https://console.groq.com/docs/tool-use/overview) lists the
  model's local function-calling support.
- [Local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)
  and [OpenAI compatibility](https://console.groq.com/docs/openai) document
  the request/tool-call format and endpoint used by the adapter.

Stay on the Free plan; this integration does not create accounts, buy credits,
activate billing or guarantee perpetual provider availability/free quotas.

## Usage and setup behavior

Qloo and required public-store configuration are checked before admission or
provider budgets. Missing optional AI credentials reserve **zero model units**.
A real profile search still legitimately uses caller allowance and any actual
Qloo attempts. Failed provider attempts count; unused reservations are released
idempotently against the original window. Public/Vercel requires the existing
shared Redis configuration and caller salt, even for profile-only searches.
No production fallback to process-local limits is introduced.

The synthetic suite covers successful Groq calls, missing credentials, HTTP
401/429/500, timeout, invalid arguments/output, clarification, word-derived
constraints, labelled profile fallback, shared cooldown, refunds and limits.
These tests do not claim live model language quality or hosted-store verification.
