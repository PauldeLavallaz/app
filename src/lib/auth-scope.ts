export function getAuthScopeKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return `${userId ?? "signed-out"}:${orgId ?? "personal"}`;
}
