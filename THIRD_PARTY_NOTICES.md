# Third-party material

The root MIT licence covers only Benedict Okpala's original Out2Eat code and
documentation. It does not replace upstream licences or provider terms.
Preserve supplied copyright, licence and notice files when redistributing
third-party material, including applicable notices in bundles.

- **Dependencies:** packages retain their own licences and notices. Installed
  metadata reports MIT for React, TanStack Start, Vite, Tailwind CSS, Nitro,
  Vaul and Zod; Lucide React reports ISC. This is not a full transitive
  inventory and does not replace the actual package licence files.
- **Grok export:** `.grok/`, `public/__grok/`, `server/`, Grok PWA scripts,
  preview/auth/app-data helpers and other inherited template/tooling code are
  excluded from the original-code MIT grant. No separate redistribution
  licence text for the overall platform/template export was supplied here. This
  absence alone does not establish a publication restriction. Generated code and
  project artwork are subject to the output provisions of Grok's terms;
  pre-existing platform material and third-party assets retain their own rights.
  Preserve its notices and branding. The existing
  licence for the unused video2dsprite component remains with its private
  original at `artifacts/private/.grok/skills/video2dsprite/LICENSE`.
  That component is no longer in the public tree. Exact retained files are
  listed in `docs/platform-provenance.md`.
- **Qloo content:** API responses, including
  recordings under `artifacts/private/` and saved responses or reports
  reproducing provider data, remain outside MIT. Restaurant information,
  tags and photos remain subject to provider and content-owner terms.
  Test use does not grant redistribution rights.
  The public `tests/fixtures/dining-synthetic.json` is hand-authored fictional
  test data, not a Qloo response, and is original Out2Eat material.
- **Assets:** third-party assets, remote restaurant images, Grok branding,
  exported share cards/icons and Google Fonts (Fraunces and Outfit) are
  excluded. The project licence grants no new rights to those assets.
  Confirm applicable terms before redistributing asset copies.

No upstream licence, attribution or branding was removed in this review.

Release cleanup removed unused preview/env-flag/Linux tooling from public source.
Private originals and notices remain archived; the current exact retained
provenance inventory is docs/platform-provenance.md (32 files); it is not a
blanket publication blocker. Active attribution/branding/notices remain unchanged.

Licence scope: MIT applies to original Out2Eat code/documentation owned by
Benedict Okpala, including his rights in generated application output. It does
not relicense dependencies, pre-existing platform material, Qloo response data,
restaurant content, fonts, logos or other third-party assets. This scope notice
lives here so LICENSE remains standard MIT text recognizable by GitHub.
