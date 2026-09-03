export function getAuthScopeKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return `${userId ?? "signed-out"}:${orgId ?? "personal"}`;
}

export function reconcileAuthScopeCache(
  currentScope: string,
  nextScope: string,
  clearCache: () => void,
) {
  if (currentScope === nextScope) return false;

  clearCache();
  return true;
}
