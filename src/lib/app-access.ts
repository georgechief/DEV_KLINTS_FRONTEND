import { isRedirect, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  clearAuth,
  getCurrentUser,
  isForbiddenError,
  isUnauthorizedError,
} from "@/lib/auth";
import {
  getDcsStatus,
  isRouteAllowed,
  LOCKED_ALLOWED_ROUTES,
} from "@/lib/dcs";

/** Shared with AppShell / connector invalidation (Feature 4+). */
export const DCS_STATUS_QUERY_KEY = ["dcs", "status"] as const;

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

/** Public auth routes — no connector or DCS gates. */
const PUBLIC_ROUTES = new Set([
  "/signin",
  "/signup",
  "/verify",
  "/verify-email",
  "/invite/accept",
  "/forgot-password",
  "/reset-password",
]);

/** Public routes plus onboarding — never subject to the DCS gate. */
const APP_ACCESS_EXEMPT_ROUTES = new Set([...PUBLIC_ROUTES, "/onboarding"]);

export const DCS_STATUS_STALE_MS = 8_000;

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (pathOnly === "/") return pathOnly;
  return pathOnly.replace(/\/$/, "") || "/";
}

function isLockedFallbackRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return LOCKED_ALLOWED_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
}

/**
 * FE-02 connector gate. Runs after `requireAuth`, before DCS app-gate.
 * Users who still need a connector must complete onboarding first.
 */
export async function requireConnectorOnboarding(
  pathname: string,
  queryClient: QueryClient,
): Promise<void> {
  if (PUBLIC_ROUTES.has(pathname) || pathname === "/onboarding") return;
  if (typeof window === "undefined") return;

  try {
    const user = await queryClient.ensureQueryData({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: getCurrentUser,
    });

    if (user.needs_connector === true) {
      throw redirect({ to: "/onboarding" });
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

/**
 * Central DCS app-gate (PRD-FE-03). Runs after `requireAuth` on protected app routes.
 * FE-02 (`needs_connector`) and onboarding remain the first gate for connector setup.
 */
export async function requireAppAccess(
  pathname: string,
  queryClient: QueryClient,
): Promise<void> {
  if (APP_ACCESS_EXEMPT_ROUTES.has(pathname)) return;
  if (typeof window === "undefined") return;

  try {
    const user = await queryClient.ensureQueryData({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: getCurrentUser,
    });

    if (user.needs_connector === true) return;

    const status = await queryClient.ensureQueryData({
      queryKey: DCS_STATUS_QUERY_KEY,
      queryFn: getDcsStatus,
      staleTime: DCS_STATUS_STALE_MS,
    });

    if (isRouteAllowed(status, pathname)) return;

    throw redirect({ to: "/dashboard" });
  } catch (err) {
    if (isRedirect(err)) throw err;

    if (isUnauthorizedError(err) || isForbiddenError(err)) {
      clearAuth();
      throw redirect({ to: "/signin" });
    }

    if (isLockedFallbackRoute(pathname)) return;

    throw redirect({ to: "/dashboard" });
  }
}
