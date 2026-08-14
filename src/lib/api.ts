import { ACCESS_TOKEN_KEY, handleUnauthorized } from "@/lib/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/** Endpoints that must not send a Bearer token (stale JWTs break AllowAny views). */
const AUTH_PUBLIC_ENDPOINTS = [
  "/api/v1/auth/login/",
  "/api/v1/auth/register/",
  "/api/v1/auth/verify-email/",
  "/api/v1/auth/resend-verification/",
  "/api/v1/auth/forgot-password/",
  "/api/v1/auth/reset-password/",
  "/api/v1/team/invites/accept/",
];

function shouldAttachAuth(endpoint: string): boolean {
  return !AUTH_PUBLIC_ENDPOINTS.some((path) => endpoint.startsWith(path));
}

function getAccessToken(endpoint: string): string | null {
  return typeof window !== "undefined" && shouldAttachAuth(endpoint)
    ? localStorage.getItem(ACCESS_TOKEN_KEY)
    : null;
}

async function throwIfNotOk(response: Response, token: string | null): Promise<void> {
  if (response.ok) return;
  const data = await response.json().catch(() => ({}));
  const error = {
    ...(typeof data === "object" && data !== null ? data : {}),
    status: response.status,
  };
  if (response.status === 401 && token) {
    handleUnauthorized();
  }
  throw error;
}

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = getAccessToken(endpoint);
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  await throwIfNotOk(response, token);
  return response.json().catch(() => ({}));
}

export async function apiRequestBlob(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ blob: Blob; contentDisposition: string | null }> {
  const token = getAccessToken(endpoint);
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/pdf, application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  await throwIfNotOk(response, token);
  return {
    blob: await response.blob(),
    contentDisposition: response.headers.get("Content-Disposition"),
  };
}
