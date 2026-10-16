let sequence = 0;

// React thread keys only: never use this fallback for auth/security tokens.
// randomUUID is absent on ordinary HTTP LAN origins on many mobile browsers.
export function createUiId(source: { randomUUID?: () => string } = globalThis.crypto ?? {}): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  sequence++;
  return `ui-${Date.now().toString(36)}-${sequence.toString(36)}`;
}
