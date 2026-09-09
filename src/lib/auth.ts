import type { QueryClient } from "@tanstack/react-query";
import { isRedirect, redirect } from "@tanstack/react-router";
import { apiRequest } from "@/lib/api";
import { listConnectors } from "@/lib/connectors";
import {
  isOnboardingManagoV3Step,
  isManagoV3OnboardingPending,
  traceManagoV3Onboarding,
} from "@/lib/manago-v3-onboarding";

export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";

const LOCAL_AUTH_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY] as const;

const PUBLIC_ROUTES = new Set([
  "/signin",
  "/signup",
  "/verify",
  "/verify-email",
  "/invite/accept",
  "/forgot-password",
  "/reset-password",
]);

export type AppHomePath = "/onboarding" | "/dashboard" | "/integrations";

/** URL search value for the optional post-Manago API v3 onboarding step (PRD-FE-07). */
export const ONBOARDING_MANAGO_V3_STEP = "manago-api-v3" as const;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified: boolean;
  needs_connector: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  company: {
    id: string;
    name: string;
    domain: string;
    writeback_execute_enabled?: boolean;
  } | null;
};

/** Fail closed when the API omits the flag (PRD-WB-03). */
export function companyWritebackExecuteEnabled(
  company: CurrentUser["company"],
): boolean {
  return company?.writeback_execute_enabled === true;
}

export function applyWritebackExecuteToCurrentUser(
  user: CurrentUser | undefined,
  enabled: boolean,
): CurrentUser | undefined {
  if (!user?.company) return user;
  return {
    ...user,
    company: {
      ...user.company,
      writeback_execute_enabled: enabled,
    },
  };
}

/** Keep /auth/me cache in sync immediately after workspace PATCH (avoids stale Fix gate). */
export function syncCurrentUserWritebackFlag(
  queryClient: QueryClient,
  enabled: boolean,
): void {
  queryClient.setQueryData<CurrentUser>(["auth", "me"], (previous) =>
    applyWritebackExecuteToCurrentUser(previous, enabled),
  );
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest("/api/v1/auth/me/") as Promise<CurrentUser>;
}

export type DetailResponse = {
  detail: string;
};

export type WorkspaceSummary = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  company: {
    id: string;
    name: string;
    domain: string;
    writeback_execute_enabled?: boolean;
  };
};

export type UpdateWorkspacePayload = {
  tenant_name?: string;
  company_name?: string;
  company_domain?: string;
  writeback_execute_enabled?: boolean;
};

export async function forgotPassword(email: string): Promise<DetailResponse> {
  return apiRequest("/api/v1/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  }) as Promise<DetailResponse>;
}

export async function resetPassword(
  token: string,
  email: string,
  password: string,
): Promise<DetailResponse> {
  return apiRequest("/api/v1/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify({
      token,
      email: email.trim().toLowerCase(),
      password,
    }),
  }) as Promise<DetailResponse>;
}

export async function changePassword(
  current_password: string,
  new_password: string,
): Promise<DetailResponse> {
  return apiRequest("/api/v1/auth/change-password/", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  }) as Promise<DetailResponse>;
}

export async function resendVerificationEmail(email: string): Promise<DetailResponse> {
  return apiRequest("/api/v1/auth/resend-verification/", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  }) as Promise<DetailResponse>;
}

export async function updateCurrentUser(name: string): Promise<CurrentUser> {
  return apiRequest("/api/v1/auth/me/", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }) as Promise<CurrentUser>;
}

export async function updateWorkspace(
  payload: UpdateWorkspacePayload,
): Promise<WorkspaceSummary> {
  return apiRequest("/api/v1/auth/workspace/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }) as Promise<WorkspaceSummary>;
}

export function userInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;

  for (const key of LOCAL_AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}

let handlingUnauthorized = false;

/** Clear stale credentials and leave protected routes after a 401. */
export function handleUnauthorized(): void {
  if (typeof window === "undefined" || handlingUnauthorized) return;

  handlingUnauthorized = true;
  clearAuth();

  if (!PUBLIC_ROUTES.has(window.location.pathname)) {
    window.location.replace("/signin");
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { status?: number }).status === 401,
  );
}

export function isForbiddenError(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { status?: number }).status === 403,
  );
}

/**
 * First-time connect vs reconnect after auth failure (CONN-05 / DCS-10 fresh import).
 * Only send users to Connected stack when a connector is in terminal `error` —
 * not during first-time onboarding (connector row may exist while bootstrap runs).
 */
export async function resolveConnectorSetupPath(): Promise<
  "/onboarding" | "/integrations"
> {
  try {
    const connectors = await listConnectors();
    if (!connectors.length) return "/onboarding";
    const hasTerminalError = connectors.some(
      (connector) => connector.status === "error",
    );
    return hasTerminalError ? "/integrations" : "/onboarding";
  } catch {
    return "/onboarding";
  }
}

/** Resolve post-auth landing from /me or a known login `needs_connector` value. */
export async function resolveAppHomePath(
  knownNeedsConnector?: boolean,
): Promise<AppHomePath> {
  const needsConnector =
    typeof knownNeedsConnector === "boolean"
      ? knownNeedsConnector
      : (await getCurrentUser()).needs_connector === true;

  if (!needsConnector) return "/dashboard";
  return resolveConnectorSetupPath();
}

export function setAuthTokens(data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  const access =
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.access === "string" && data.access) ||
    null;
  const refresh =
    (typeof data.refresh_token === "string" && data.refresh_token) ||
    (typeof data.refresh === "string" && data.refresh) ||
    null;

  if (access) localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function requireAuth(pathname: string) {
  if (PUBLIC_ROUTES.has(pathname)) return;

  // localStorage is only available in the browser; enforce auth on client navigations.
  if (typeof window === "undefined") return;

  if (!isAuthenticated()) {
    throw redirect({ to: "/signin" });
  }
}

/** If the stored access token is still valid, send guests to onboarding or dashboard. */
export async function requireGuest() {
  if (typeof window === "undefined") return;

  if (!getAccessToken()) return;

  try {
    const path = await resolveAppHomePath();
    throw redirect({ to: path });
  } catch (err) {
    if (isRedirect(err)) throw err;

    if (isUnauthorizedError(err) || isForbiddenError(err)) {
      clearAuth();
      return;
    }

    clearAuth();
  }
}

/**
 * Onboarding is for signed-in users who still need a connector, or who are on the
 * optional Manago API v3 step immediately after their first Manago connect.
 */
export async function requireOnboarding(
  search?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;

  if (!isAuthenticated()) {
    traceManagoV3Onboarding("requireOnboarding → /signin (unauthenticated)");
    throw redirect({ to: "/signin" });
  }

  if (isOnboardingManagoV3Step(search) || isManagoV3OnboardingPending()) {
    traceManagoV3Onboarding("requireOnboarding: allow manago v3 step", {
      searchStep: search?.step,
    });
    return;
  }

  try {
    const home = await resolveAppHomePath();
    traceManagoV3Onboarding("requireOnboarding: resolved home", { home });
    if (home !== "/onboarding") {
      traceManagoV3Onboarding(`requireOnboarding → ${home}`);
      throw redirect({ to: home });
    }
  } catch (err) {
    if (isRedirect(err)) throw err;

    if (isUnauthorizedError(err) || isForbiddenError(err)) {
      clearAuth();
      throw redirect({ to: "/signin" });
    }

    throw err;
  }
}

