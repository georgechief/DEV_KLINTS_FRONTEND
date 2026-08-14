import { ONBOARDING_MANAGO_V3_STEP } from "@/lib/auth";

const MANAGO_V3_ONBOARDING_PENDING_KEY = "klints_onboarding_manago_v3_pending";

export function isManagoV3OnboardingPending(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(MANAGO_V3_ONBOARDING_PENDING_KEY) === "1";
}

export function markManagoV3OnboardingPending(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MANAGO_V3_ONBOARDING_PENDING_KEY, "1");
  traceManagoV3Onboarding("markManagoV3OnboardingPending");
}

export function clearManagoV3OnboardingPending(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(MANAGO_V3_ONBOARDING_PENDING_KEY);
  traceManagoV3Onboarding("clearManagoV3OnboardingPending");
}

export function onboardingManagoV3Url(): string {
  if (typeof window === "undefined") {
    return `/onboarding?step=${ONBOARDING_MANAGO_V3_STEP}`;
  }
  const url = new URL(window.location.origin);
  url.pathname = "/onboarding";
  url.search = `?step=${ONBOARDING_MANAGO_V3_STEP}`;
  return `${url.pathname}${url.search}`;
}

/** Hard navigation — avoids TanStack beforeLoad races after connector POST. */
export function goToOnboardingManagoV3Step(reason: string): void {
  if (typeof window === "undefined") return;
  markManagoV3OnboardingPending();
  const target = onboardingManagoV3Url();
  traceManagoV3Onboarding("goToOnboardingManagoV3Step", { reason, target });
  window.location.assign(target);
}

export function syncOnboardingManagoV3Url(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("step", ONBOARDING_MANAGO_V3_STEP);
  window.history.replaceState(window.history.state, "", url.toString());
  traceManagoV3Onboarding("syncOnboardingManagoV3Url", { href: url.toString() });
}

export function onboardingStepFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("step") ?? undefined;
}

export function isOnboardingManagoV3Step(
  search?: Record<string, unknown>,
): boolean {
  const step =
    typeof search?.step === "string"
      ? search.step
      : onboardingStepFromLocation();
  return step === ONBOARDING_MANAGO_V3_STEP;
}

export function shouldResumeManagoV3Onboarding(): boolean {
  return (
    isOnboardingManagoV3Step() || isManagoV3OnboardingPending()
  );
}

export function traceManagoV3Onboarding(
  event: string,
  extra?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  console.log(`[FE-07] ${event}`, {
    pathname: window.location.pathname,
    search: window.location.search,
    pending: isManagoV3OnboardingPending(),
    ...extra,
  });
}
