import { ConnectorLogo } from "@/components/klints/ConnectorLogo";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import {
  ManagoApiV3KeyForm,
} from "@/components/klints/ManagoApiV3KeyForm";
import { PasswordInput } from "@/components/klints/PasswordInput";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { apiRequest } from "@/lib/api";
import {
  DCS_STATUS_STALE_MS,
  refreshAfterOnboardingConnect,
  refreshConnectorsThenDcsStatus,
} from "@/lib/app-access";
import {
  getApiErrorMessage,
  isConnectorBootstrapInFlight,
  listConnectors,
  shopifyErrorReasonMessage,
  startShopifyOAuth,
} from "@/lib/connectors";
import { getCurrentUser, requireOnboarding } from "@/lib/auth";
import {
  clearManagoV3OnboardingPending,
  markManagoV3OnboardingPending,
  onboardingStepFromLocation,
  shouldResumeManagoV3Onboarding,
  syncOnboardingManagoV3Url,
  traceManagoV3Onboarding,
} from "@/lib/manago-v3-onboarding";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type OnboardingSearch = {
  shopify?: string;
  shop?: string;
  reason?: string;
  step?: string;
};

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    shopify: typeof search.shopify === "string" ? search.shopify : undefined,
    shop: typeof search.shop === "string" ? search.shop : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
    step: typeof search.step === "string" ? search.step : undefined,
  }),
  beforeLoad: async ({ search, context }) => {
    if (search.shopify === "connected") {
      await refreshAfterOnboardingConnect(context.queryClient);
    }
    await requireOnboarding(search);
  },
  head: () => ({ meta: [{ title: "Connect your stack — Klints" }] }),
  component: Onboarding,
});

const MIN_CLIENT_ID_LENGTH = 3;
const MIN_API_SECRET_LENGTH = 8;

type ActiveConnector = "manago_ai" | "shopify" | "manago_api_v3" | null;

type VerifyResponse = {
  valid?: boolean;
  message?: string;
};

const MANAGO_GUIDE_STEPS = [
  {
    image: "/manago-onboarding/step1.png",
    title: "Open Integrations → API",
    description:
      "In Manago, click the Integrations (plug) icon in the sidebar, then select API.",
  },
  {
    image: "/manago-onboarding/step2.png",
    title: "Copy API v2 credentials",
    description:
      "Open the API v2 tab. Generate an API key if needed, then copy Endpoint, Client ID, and API Secret.",
  },
] as const;

const SHOPIFY_GUIDE_STEPS = [
  {
    image: "/shopify-onboarding/step1.png",
    title: "Open Settings in Shopify admin",
    description:
      "Go to your Shopify admin, then click Settings in the bottom-left of the sidebar.",
  },
  {
    image: "/shopify-onboarding/step2.png",
    title: "Copy your primary domain",
    description:
      "Click Domains, then copy your primary domain (or your-store.myshopify.com) to connect.",
  },
] as const;

const CONNECTOR_OPTIONS = [
  {
    id: "manago_ai" as const,
    title: "Manago.ai",
    badge: "Recommended first",
    description: "CDP profiles, segments, and lifecycle events — the spine of your stack.",
  },
  {
    id: "shopify" as const,
    title: "Shopify",
    badge: "Commerce",
    description: "Orders, guests, and catalog — paired with Manago for identity integrity.",
  },
];

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = err as Record<string, unknown>;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    const first = Object.values(data).find((value) => {
      if (typeof value === "string") return true;
      return Array.isArray(value) && typeof value[0] === "string";
    });
    if (typeof first === "string") return first;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return "Something went wrong. Please try again.";
}

/** Manago shows hosts like `app.manago.ai` without a scheme. */
function normalizeManagoEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function GuideCarousel({
  steps,
}: {
  steps: readonly { image: string; title: string; description: string }[];
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            How to find your credentials
          </div>
          <div className="mt-1 text-sm font-medium">
            Step {current + 1} of {steps.length} · {steps[current]?.title}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {steps.map((step, index) => (
            <button
              key={step.image}
              type="button"
              aria-label={`Go to step ${index + 1}`}
              onClick={() => api?.scrollTo(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === current ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>

      <Carousel setApi={setApi} className="relative w-full" opts={{ loop: false }}>
        <CarouselContent>
          {steps.map((step) => (
            <CarouselItem key={step.image}>
              <div className="rounded-lg bg-muted/30 p-2 sm:p-3">
                <img
                  src={step.image}
                  alt={step.title}
                  className="mx-auto h-auto max-h-[min(68vh,560px)] w-full object-contain"
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{step.description}</p>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-3 top-[38%] z-10 h-9 w-9 border-border bg-elevated shadow-md hover:bg-elevated disabled:opacity-30" />
        <CarouselNext className="right-3 top-[38%] z-10 h-9 w-9 border-border bg-elevated shadow-md hover:bg-elevated disabled:opacity-30" />
      </Carousel>
    </div>
  );
}

function readInitialActiveConnector(): ActiveConnector {
  if (typeof window === "undefined") return null;
  return shouldResumeManagoV3Onboarding() ? "manago_api_v3" : null;
}

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shopify: shopifyResult, reason, step } = Route.useSearch();
  const shopifyCallbackHandledRef = useRef(false);
  const [active, setActive] = useState<ActiveConnector>(readInitialActiveConnector);
  const [selected, setSelected] = useState<"manago_ai" | "shopify">("manago_ai");

  const [endpoint, setEndpoint] = useState("");
  const [clientId, setClientId] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  // Prevent Chrome from treating this as a login form and autofilling the user email.
  const [clientIdLocked, setClientIdLocked] = useState(true);
  const [apiSecretLocked, setApiSecretLocked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shopDomain, setShopDomain] = useState("");
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);

  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) =>
      isConnectorBootstrapInFlight(query.state.data) ? DCS_STATUS_STALE_MS : false,
  });
  const bootstrapPending = isConnectorBootstrapInFlight(connectors);
  const wasBootstrapPendingRef = useRef(false);

  useEffect(() => {
    if (wasBootstrapPendingRef.current && !bootstrapPending) {
      void refreshConnectorsThenDcsStatus(queryClient);
    }
    wasBootstrapPendingRef.current = bootstrapPending;
  }, [bootstrapPending, queryClient]);

  const { data: currentUser } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
  });
  const canManageApiV3Key = currentUser?.role !== "viewer";

  useEffect(() => {
    traceManagoV3Onboarding("Onboarding mount", {
      active,
      routeStep: step,
      locationStep: onboardingStepFromLocation(),
      needs_connector: currentUser?.needs_connector,
    });
    if (shouldResumeManagoV3Onboarding()) {
      markManagoV3OnboardingPending();
      setActive("manago_api_v3");
    }
  }, [active, step, currentUser?.needs_connector]);

  async function goToAppHomeAfterConnect(source: "skip" | "save") {
    traceManagoV3Onboarding("goToAppHomeAfterConnect", { source });
    clearManagoV3OnboardingPending();
    await refreshAfterOnboardingConnect(queryClient);
    void navigate({ to: "/dashboard", replace: true });
  }

  // Shopify OAuth errors return here with ?shopify=error; success is handled by
  // requireOnboarding() redirecting to dashboard once needs_connector is false.
  useEffect(() => {
    if (!shopifyResult || shopifyCallbackHandledRef.current) return;
    shopifyCallbackHandledRef.current = true;

    if (shopifyResult === "error") {
      toast.error("Shopify connection failed", {
        description: shopifyErrorReasonMessage(reason ?? ""),
      });
      void navigate({ to: "/onboarding", search: {}, replace: true });
    }
  }, [shopifyResult, reason, navigate]);

  function continueWithSelected() {
    if (selected === "manago_ai") {
      setEndpoint("");
      setClientId("");
      setApiSecret("");
      setClientIdLocked(true);
      setApiSecretLocked(true);
      setError(null);
      setActive("manago_ai");
      return;
    }

    setShopDomain("");
    setShopifyError(null);
    setActive("shopify");
  }

  function backToPicker() {
    setSelected(active === "shopify" ? "shopify" : "manago_ai");
    setActive(null);
    setError(null);
    setShopifyError(null);
  }

  function validateFields(): string | null {
    const trimmedEndpoint = normalizeManagoEndpoint(endpoint);
    const trimmedClientId = clientId.trim();
    const trimmedApiSecret = apiSecret.trim();

    if (!endpoint.trim() || !trimmedClientId || !trimmedApiSecret) {
      return "Endpoint, Client ID, and API Secret are required.";
    }
    if (!isValidHttpUrl(trimmedEndpoint)) {
      return "Endpoint must be a valid host or URL (e.g. app.manago.ai).";
    }
    if (trimmedClientId.length < MIN_CLIENT_ID_LENGTH) {
      return `Client ID must be at least ${MIN_CLIENT_ID_LENGTH} characters.`;
    }
    if (trimmedApiSecret.length < MIN_API_SECRET_LENGTH) {
      return `API Secret must be at least ${MIN_API_SECRET_LENGTH} characters.`;
    }
    return null;
  }

  async function handleSaveAndConnect() {
    const validationError = validateFields();
    if (validationError) {
      setError(validationError);
      return;
    }

    const trimmedEndpoint = normalizeManagoEndpoint(endpoint);
    const trimmedClientId = clientId.trim();
    const trimmedApiSecret = apiSecret.trim();

    setError(null);
    setLoading(true);

    try {
      const verifyResult = (await apiRequest("/api/v1/connectors/verify/", {
        method: "POST",
        body: JSON.stringify({
          client_id: trimmedClientId,
          api_secret: trimmedApiSecret,
          endpoint: trimmedEndpoint,
        }),
      })) as VerifyResponse;

      if (verifyResult.valid !== true) {
        setError(
          typeof verifyResult.message === "string" && verifyResult.message
            ? verifyResult.message
            : "Credentials could not be verified.",
        );
        return;
      }

      await apiRequest("/api/v1/connectors/", {
        method: "POST",
        body: JSON.stringify({
          name: "manago_ai",
          type: "cdp",
          display_name: "Manago.ai",
          config: {
            base_url: trimmedEndpoint,
            workspace_id: trimmedClientId,
            api_key: trimmedApiSecret,
          },
        }),
      });

      toast.success("Manago.ai connected", {
        description: "Credentials verified and saved.",
      });

      traceManagoV3Onboarding("post-manago-connect: success", {
        pathname: window.location.pathname,
      });
      await refreshConnectorsThenDcsStatus(queryClient);
      markManagoV3OnboardingPending();
      setActive("manago_api_v3");
      syncOnboardingManagoV3Url();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleShopifyConnect() {
    const shop = shopDomain.trim();
    if (!shop) {
      setShopifyError("Enter your shop domain, e.g. your-store.myshopify.com.");
      return;
    }

    setShopifyError(null);
    setShopifyLoading(true);

    try {
      const authorizeUrl = await startShopifyOAuth(
        shop,
        `${window.location.origin}/onboarding`,
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      setShopifyError(getApiErrorMessage(err, "Could not start the Shopify connection."));
      setShopifyLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-elevated">
        <div
          className={`mx-auto flex h-16 items-center justify-between px-6 ${
            active === "manago_ai" || active === "shopify" || active === "manago_api_v3"
              ? "max-w-6xl"
              : "max-w-4xl"
          }`}
        >
          <KlintsLogo variant="wordmark" tone="dark" to="/signin" />
          <div className="text-xs text-muted-foreground">Step 3 of 3 · Connect stack</div>
        </div>
      </header>

      <main
        className={`mx-auto px-6 py-16 ${
          active === "manago_ai" || active === "shopify" || active === "manago_api_v3"
            ? "max-w-6xl"
            : "max-w-3xl"
        }`}
      >
        {active === null ? (
          <>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Stack connection
            </div>
            <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
              Connect your stack
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Klints scores cross-stack integrity and surfaces issues worth fixing. Select a
              Phase 1 connector to continue.
            </p>

            <div
              className="mt-10 grid gap-4 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Choose a connector"
            >
              {CONNECTOR_OPTIONS.map((option) => {
                const isSelected = selected === option.id;
                return (
                  <label
                    key={option.id}
                    htmlFor={`connector-${option.id}`}
                    className={cn(
                      "group relative flex cursor-pointer flex-col gap-4 rounded-xl border bg-elevated p-5 transition-all",
                      isSelected
                        ? "border-primary ring-1 ring-primary/30 shadow-sm"
                        : "border-border hover:border-primary/35",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <ConnectorLogo name={option.id} />
                      <Checkbox
                        id={`connector-${option.id}`}
                        checked={isSelected}
                        onCheckedChange={() => setSelected(option.id)}
                        className="mt-0.5 h-5 w-5 rounded-md"
                        aria-label={`Select ${option.title}`}
                      />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{option.title}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {option.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Selected:{" "}
                <span className="font-medium text-foreground">
                  {CONNECTOR_OPTIONS.find((o) => o.id === selected)?.title}
                </span>
              </p>
              <button
                type="button"
                onClick={continueWithSelected}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : null}

        {active === "manago_ai" ? (
          <div className="space-y-8">
            <div>
              <button
                type="button"
                onClick={backToPicker}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to connectors
              </button>
              <div className="mt-4 flex items-center gap-3">
                <ConnectorLogo name="manago_ai" className="h-12 w-12" />
                <div>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">
                    Connect Manago.ai
                  </h1>
                  <p className="mt-1 max-w-xl text-muted-foreground">
                    Follow the guide on the left, then paste your API v2 credentials on the
                    right.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <GuideCarousel steps={MANAGO_GUIDE_STEPS} />

              <form
                className="space-y-3 rounded-xl border border-border bg-elevated p-5 lg:sticky lg:top-6"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveAndConnect();
                }}
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
                  Your credentials
                </div>
                <p className="text-sm text-muted-foreground">
                  Paste Endpoint, Client ID, and API Secret from Manago API v2.
                </p>

                {/* Decoy fields: absorb browser login autofill away from Manago credentials. */}
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                  value=""
                  readOnly
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                  value=""
                  readOnly
                />

                <div>
                  <label
                    htmlFor="manago-endpoint"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Endpoint
                  </label>
                  <input
                    id="manago-endpoint"
                    name="manago_endpoint"
                    className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    placeholder="app.manago.ai"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    e.g. app.manago.ai — https:// is added if missing.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="manago-client-id"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Client ID
                  </label>
                  <input
                    id="manago-client-id"
                    name="manago_client_id"
                    className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    placeholder="•••••••••••••"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    onFocus={() => setClientIdLocked(false)}
                    readOnly={clientIdLocked}
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manago-api-secret"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    API Secret
                  </label>
                  <PasswordInput
                    id="manago-api-secret"
                    name="manago_api_secret"
                    className="mt-1"
                    inputClassName="w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    placeholder="•••••••••••••"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    onFocus={() => setApiSecretLocked(false)}
                    readOnly={apiSecretLocked}
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      Save & connect <ArrowRight className="h-3 w-3" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {active === "manago_api_v3" ? (
          <div className="mx-auto max-w-xl space-y-6" data-testid="onboarding-manago-v3-step">
            <div className="flex items-center gap-3">
              <ConnectorLogo name="manago_ai" className="h-12 w-12" />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-revenue">
                  Manago.ai connected
                </div>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
                  Optional step
                </div>
                <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">
                  Add an API v3 key (optional)
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Recommended so Klints can read your Manago product catalog for Data
                  Consistency Score checks (PT-01 / PT-03). You can skip and add this later
                  under Connected stack.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-elevated p-5">
              <ManagoApiV3KeyForm
                className="space-y-5"
                guidanceClassName="text-sm text-muted-foreground"
                inputId="onboarding-manago-api-v3-key"
                canManage={canManageApiV3Key}
                saveButtonLabel="Save & Continue"
                onSuccess={() => void goToAppHomeAfterConnect("save")}
              />

              <button
                type="button"
                onClick={() => void goToAppHomeAfterConnect("skip")}
                className="mt-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip for now
              </button>
            </div>
          </div>
        ) : null}

        {active === "shopify" ? (
          <div className="space-y-8">
            <div>
              <button
                type="button"
                onClick={backToPicker}
                disabled={shopifyLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to connectors
              </button>
              <div className="mt-4 flex items-center gap-3">
                <ConnectorLogo name="shopify" className="h-12 w-12" />
                <div>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">
                    Connect Shopify
                  </h1>
                  <p className="mt-1 max-w-xl text-muted-foreground">
                    Follow the guide on the left to find your shop domain, then paste it on the
                    right to start OAuth.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <GuideCarousel steps={SHOPIFY_GUIDE_STEPS} />

              <form
                className="space-y-3 rounded-xl border border-border bg-elevated p-5 lg:sticky lg:top-6"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleShopifyConnect();
                }}
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
                  Your shop
                </div>
                <p className="text-sm text-muted-foreground">
                  Paste the primary domain from Shopify Settings → Domains.
                </p>

                <div>
                  <label
                    htmlFor="shopify-shop-domain"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Shop domain
                  </label>
                  <input
                    id="shopify-shop-domain"
                    name="shopify_shop_domain"
                    className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    placeholder="your-store.myshopify.com"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    disabled={shopifyLoading}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    You&apos;ll be redirected to Shopify to approve access, then brought back to
                    Klints when your store is connected.
                  </p>
                </div>

                {shopifyError ? <p className="text-sm text-destructive">{shopifyError}</p> : null}

                <button
                  type="submit"
                  disabled={shopifyLoading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {shopifyLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Redirecting to Shopify…
                    </>
                  ) : (
                    <>
                      Continue to Shopify <ArrowRight className="h-3 w-3" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
