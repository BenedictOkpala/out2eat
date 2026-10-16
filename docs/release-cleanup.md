# Release cleanup ? 16 October 2026

## Completed

- Archived 17 unnecessary Grok files outside the public candidate tree, under
  ignored artifacts/private/release-cleanup. Removed preview bridge/path rewrites,
  passthrough auth provider, Grok dev flag endpoint/probes, unused favicon copies,
  and Linux-only preview manager/tests/thumbnail with their callers/scripts.
- Replaced the inherited environment wrapper with an original small Node loader
  and Vite launcher. Preserved .env.local precedence, shell overrides, server-only
  credentials, current ports, stack and environment-file tests. No auth flag.
- Preserved active PWA/install/branding and all third-party licence notices.
  Original dining UI, profile persistence, ranking and usage protections remain.
- Archived detailed venue-by-venue Qloo verification reports privately; public
  coverage/AI docs contain only verification summaries, preset geography and
  attribution. Public service fixtures are explicitly synthetic.
- Added npm run check:public. It scans eligible source files against all five
  privately configured values, credential signatures and recorded-data patterns.
  Private env files, local instructions, QA output, caches, dependencies and
  compiled output are excluded from publication. It reports paths, never values.

## Checks

Typecheck and production build passed. All 117 remaining offline tooling/env/PWA
regressions passed. Offline mobile interaction checks covered editing profiles,
saved locations/budget, example profiles, loading, duplicate prevention, results,
Share, empty/error/retry and labelled profile fallback. Development and production
screenshots were inspected at desktop and mobile sizes: clean console, no overflow,
no share-card warning; production content matches the previous UI baseline.
Remote font/branding requests were isolated for offline browser QA.

The public candidate source scan found no configured secret, credential-shaped
content or recorded response artifact. All 46 compiled output files were checked
for configured secret values: none found. The ignored public-source manifest is
artifacts/public-source-manifest.json. At the time of the initial scan there was no local .git repository. Release
preparation now initializes and audits the main branch before publication. The scan
is a targeted check, not proof of absence of all possible sensitive information.
No repeated shared-store test, live Qloo/Groq request, public push or deployment.

## Corrected release status

The earlier blanket blockers were withdrawn after checking actual public terms.
Public Qloo judging hosting is required, and private server caching has no
retention cap. The 32-file inventory is provenance, not proof of a prohibition.
See license-review.md. The local Git repository is now initialized, and release
preparation published https://github.com/BenedictOkpala/out2eat on main. GitHub
detects MIT and the remote 89-file tree contains no forbidden private paths.
The public scan now checks the working tree, index and committed history.
Vercel account sign-in/import is the next owner action; no deployment was started. Current account/import instructions
are in deployment-preparation.md. No ZIP or paid provisioning is needed.
