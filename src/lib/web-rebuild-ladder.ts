/** web-rebuild rebuilds each hop; digest pin is promote-only. Pipeline SHA pin still applies. */
export function hopRequiresDigestPin(templateFamily: 'promote' | 'web-rebuild'): boolean {
  return templateFamily === 'promote';
}

/** Runtime env may stay compile-time for web-rebuild (existing frontend onboarding). */
export function webRebuildAllowsCompileTimeEnv(compileTimeEnv: boolean): boolean {
  return compileTimeEnv === true;
}
