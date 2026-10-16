# Setup and release cleanup

The original proposed cleanup is complete for unused standalone-hosting helpers.
See [current release cleanup](release-cleanup.md) and the exact remaining
[32-file provenance inventory](platform-provenance.md).

Required private variables: QLOO_API_KEY, optional GROQ_API_KEY, and the shared
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, USAGE_CALLER_SALT.
The salt and shared store have been configured and verified without exposing
values. No further store test is needed for this cleanup. Preserve the same
store and salt across instances. No auth flag/provider is needed.

No paid services, deployment or public push occurred. Free-tier instructions
remain in deployment-preparation.md. Do not bypass fail-closed protection.
