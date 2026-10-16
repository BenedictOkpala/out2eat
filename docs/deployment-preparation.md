# GitHub and Vercel release preparation

Published public GitHub repository: https://github.com/BenedictOkpala/out2eat.
Main is pushed; GitHub detects MIT. Remote file paths and committed history were
checked: no real env/private QA/build paths or configured secrets were found.
Vercel is not linked and no deployment has been started.
Current source stays in this project; no ZIP is used. See license-review.md for
corrected terms: public judging hosting is required, private caching is permitted,
and provenance alone is not a publication restriction.

## GitHub

The local main branch tracks origin/main. The repository contains source,
package-lock.json, synthetic tests, .env.example, LICENSE and third-party notices.
Git uses Benedict Okpala and the verified GitHub account's privacy-preserving
noreply address. No real env file, QA artifact or build output is committed.

Preparation checks: npm run check:public; git diff --cached --check; review
tracked paths. The scan also checks committed blobs for configured secrets and
recorded-response patterns. No provider/store calls are part of this check.

## Vercel account action (no payment required)

1. Open https://vercel.com/signup (or https://vercel.com/login), choose Continue
   with GitHub, and sign in as BenedictOkpala. Use a personal Hobby workspace for
   this non-commercial judging demo. Do not start a paid trial or add billing.
2. Open https://vercel.com/new and import BenedictOkpala/out2eat. If it is missing,
   use Adjust GitHub App Permissions and allow only the out2eat repository.
3. Keep project name out2eat, root ./, Framework Preset Other, Node.js 24.x.
   vercel.json supplies npm ci --include=dev --no-audit --no-fund and
   npm run typecheck && npm run build. Leave Output Directory unmodified: Nitro
   emits the supported Build Output API at .vercel/output. Do not add SPA rewrites.
   Keep Fluid compute enabled; the server function's 120-second duration fits Hobby.
4. In Environment Variables, privately copy these five existing .env.local values
   into server settings (Production, and Preview if you will test previews):
   QLOO_API_KEY, GROQ_API_KEY, UPSTASH_REDIS_REST_URL,
   UPSTASH_REDIS_REST_TOKEN, USAGE_CALLER_SALT. Prefer the sensitive/hidden option.
   Never paste values into chat/Git and never prefix them VITE_. Keep the same salt
   and shared primary, so deploys do not reset allowances. Groq is needed for AI
   mode; an absent key deliberately uses labelled Profile-based search.
5. Leave Deploy unclicked until deployment is explicitly authorized. Creating a
   custom domain or paid infrastructure is unnecessary. A Vercel project token
   is not needed for this GitHub-import flow.
6. Once authorized, deploy and use the generated HTTPS URL. Verify profiles,
   Wuse/Maitama selection, one paced AI search, separate evidence and Share.
   Verify trusted caller identity/fail-closed behavior and OG metadata on the
   hosted origin. Do not rerun the completed Redis verification automatically.
7. Ensure the judging URL is publicly accessible without Vercel login protection.
   Do not share the .env.local file or enable raw-response endpoints. A public
   HTTPS judging demo is required through the judging period. Hackathon keys
   expire afterward; renewed access is needed for ongoing live operation.

References: https://vercel.com/docs/git/vercel-for-github,
https://vercel.com/docs/environment-variables,
https://vercel.com/docs/fluid-compute,
https://qloo.devpost.com/,
https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide.
