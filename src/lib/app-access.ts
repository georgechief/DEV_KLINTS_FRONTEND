import { isRedirect, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  clearAuth,
  getCurrentUser,
  isForbiddenError,
  isUnauthorizedError,
  resolveConnectorSetupPath,
} from "@/lib/auth";
import { AF_LATEST_QUERY_KEY } from "@/lib/architecture";
import {
  DCS_HISTORY_QUERY_KEY,
  DCS_WORKLIST_QUERY_KEY,
  getDcsStatus,
  isRouteAllowed,
  LOCKED_ALLOWED_ROUTES,
} from "@/lib/dcs";
import { ORCH_PLAN_QUERY_KEY } from "@/lib/orchestration";
import { UC_RECOMMENDATIONS_QUERY_KEY } from "@/lib/use-cases";

const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

/** Shared with AppShell / connector invalidation (Feature 4+). */
export const DCS_STATUS_QUERY_KEY = ["dcs", "status"] as const;

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

/** Match BE ``DCS_PENDING_STALE_AFTER`` (90 seconds). */
export const DCS_PENDING_POLL_MAX_MS = 90 * 1000;

/** Slow poll after PENDING exceeds the worker budget. */
export const DCS_RUNNING_POLL_MAX_MS = 10 * 60 * 1000;

/** @deprecated use DCS_PENDING_POLL_MAX_MS / DCS_RUNNING_POLL_MAX_MS */
export const DCS_ACTIVE_POLL_MAX_MS = DCS_PENDING_POLL_MAX_MS;

/** Slow poll after soft-lock timeout until status unlocks / fails stale. */
export const DCS_STALE_POLL_MS = 30_000;

type DcsPollStatus = {
  app_access?: string | null;
  scheduled?: boolean | null;
  active_run?: {
    status?: string | null;
    started_at?: string | null;
    created_at?: string | null;
  } | null;
} | null | undefined;

function isDcsRunInFlight(status: DcsPollStatus): boolean {
  if (!status) return false;
  if (status.app_access === "soft_locked_running") return true;
  if (status.scheduled === true) return true;
  const runStatus = status.active_run?.status;
  return runStatus === "pending" || runStatus === "running";
}

function dcsActiveRunAgeMs(status: DcsPollStatus, now = Date.now()): number | null {
  const started =
    status?.active_run?.started_at ?? status?.active_run?.created_at ?? null;
  if (!started) return null;
  const t = Date.parse(started);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

/** True when an in-flight DCS run has exceeded the soft poll budget. */
export function isDcsScoringStuck(
  status: DcsPollStatus,
  now = Date.now(),
): boolean {
  if (!isDcsRunInFlight(status)) return false;
  const age = dcsActiveRunAgeMs(status, now);
  const runStatus = status?.active_run?.status;
  const budgetMs =
    runStatus === "pending"
      ? DCS_PENDING_POLL_MAX_MS
      : DCS_RUNNING_POLL_MAX_MS;
  // No usable timestamp: treat soft-lock as stuck so we slow-poll + show banner.
  if (age == null) {
    return status?.app_access === "soft_locked_running";
  }
  return age >= budgetMs;
}

/**
 * Poll while DCS is running; after max age (or missing timestamps), slow-poll
 * so BE stale-fail can unlock without hammering every 8s forever.
 *
 * `expectDcsSoon`: keep polling after connector reconnect/bootstrap — DCS is
 * enqueued server-side when bootstrap finishes, and the FE would otherwise miss
 * `active_run` until a manual refresh (button never enters the running loop).
 */
export function getDcsRunningRefetchInterval(
  status: DcsPollStatus,
  now = Date.now(),
  options?: { expectDcsSoon?: boolean },
): number | false {
  if (isDcsRunInFlight(status)) {
    if (isDcsScoringStuck(status, now)) return DCS_STALE_POLL_MS;
    return DCS_STATUS_STALE_MS;
  }
  if (options?.expectDcsSoon) return DCS_STATUS_STALE_MS;
  return false;
}

const CONNECTORS_QUERY_KEY = ["connectors"] as const;

/** Refresh dependent caches when a DCS score run finishes (any page). */
export function invalidateAfterDcsRunComplete(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: CONNECTORS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: DCS_WORKLIST_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: DCS_HISTORY_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ORCH_PLAN_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: UC_RECOMMENDATIONS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: AF_LATEST_QUERY_KEY });
}

/**
 * After connector reconnect/save: load fresh bootstrap status, then refresh DCS
 * so `bootstrapPending` / `expectDcsSoon` polling can start.
 */
export async function refreshConnectorsThenDcsStatus(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.refetchQueries({ queryKey: CONNECTORS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
}

/**
 * After onboarding connect / OAuth return: refresh user gate, connectors,
 * DCS status, and dependent caches (DCS may finish during optional v3 step).
 */
export async function refreshAfterOnboardingConnect(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.refetchQueries({ queryKey: AUTH_ME_QUERY_KEY });
  await refreshConnectorsThenDcsStatus(queryClient);
  invalidateAfterDcsRunComplete(queryClient);
}

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
  const normalized = normalizePathname(pathname);
  if (
    PUBLIC_ROUTES.has(pathname) ||
    normalized === "/onboarding" ||
    normalized === "/integrations"
  ) {
    return;
  }
  if (typeof window === "undefined") return;

  try {
    const user = await queryClient.ensureQueryData({
      queryKey: AUTH_ME_QUERY_KEY,
      queryFn: getCurrentUser,
    });

    if (user.needs_connector === true) {
      throw redirect({ to: await resolveConnectorSetupPath() });
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
