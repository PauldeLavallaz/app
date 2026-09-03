function trimTrailingSlash(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function normalizeUrl(value?: string | null) {
  const normalized = trimTrailingSlash(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeApiBaseUrl(value?: string | null) {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return null;
  }

  return normalized.endsWith("/api") ? normalized.slice(0, -4) : normalized;
}

function ensureLeadingSlash(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function getApiBaseUrl() {
  return (
    normalizeApiBaseUrl(process.env.NEXT_PUBLIC_CD_API_URL) ??
    (typeof window !== "undefined"
      ? normalizeApiBaseUrl(window.location.origin)
      : "http://localhost:3011")
  );
}

export function getApiRouteUrl(path = "") {
  const normalizedPath = path ? ensureLeadingSlash(path.replace(/^\/+/, "")) : "";
  return `${getApiBaseUrl()}/api${normalizedPath}`;
}

export function getAppBaseUrl() {
  return (
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    (typeof window !== "undefined"
      ? normalizeUrl(window.location.origin)
      : "http://localhost:3001") ??
    "http://localhost:3001"
  );
}

export function getStudioBaseUrl() {
  return normalizeUrl(process.env.NEXT_PUBLIC_STUDIO_URL) ?? getAppBaseUrl();
}

export function getAdminBaseUrl() {
  return normalizeUrl(process.env.NEXT_PUBLIC_ADMIN_URL) ?? getAppBaseUrl();
}

export function getComfyUiFrontendUrl() {
  return (
    normalizeUrl(process.env.COMFYUI_FRONTEND_URL) ??
    "https://comfyui.comfydeploy.com"
  );
}
