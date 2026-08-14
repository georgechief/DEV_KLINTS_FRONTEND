import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatDisplayWhen } from "@/lib/datetime";
import { ArrowRight, AlertTriangle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatDisplayCount } from "@/lib/presentation";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { ConnectorLogo } from "@/components/klints/ConnectorLogo";
import { ManagoApiV3KeySection } from "@/components/klints/ManagoApiV3KeySection";
import { PasswordInput } from "@/components/klints/PasswordInput";
import { Section, StatusBadge } from "@/components/klints/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Connector,
  type LatestBootstrap,
  connectManago,
  disconnectConnector,
  getApiErrorMessage,
  listConnectors,
  maskedConfigString,
  shopifyAuthFailureMessage,
  shopifyErrorReasonMessage,
  startShopifyOAuth,
} from "@/lib/connectors";
import { getCurrentUser } from "@/lib/auth";
import { DCS_STATUS_QUERY_KEY } from "@/lib/app-access";
import { goToOnboardingManagoV3Step, traceManagoV3Onboarding } from "@/lib/manago-v3-onboarding";

type IntegrationsSearch = {
  shopify?: string;
  shop?: string;
  reason?: string;
};

export const Route = createFileRoute("/integrations")({
  validateSearch: (search: Record<string, unknown>): IntegrationsSearch => ({
    shopify: typeof search.shopify === "string" ? search.shopify : undefined,
    shop: typeof search.shop === "string" ? search.shop : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connected stack — Klints" },
      {
        name: "description",
        content: "Phase 1 connectors: Manago.ai and Shopify for stack integrity scoring.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const CONNECTOR_CARDS = [
  {
    key: "manago_ai" as const,
    title: "Manago.ai",
    desc: "CDP profiles, segments, and lifecycle events — the spine Klints scores against.",
  },
  {
    key: "shopify" as const,
    title: "Shopify",
    desc: "Orders, guests, catalog, and discounts — commerce integrity paired with Manago.",
  },
] as const;

function isConnectorLinked(connector: Connector | undefined): boolean {
  return connector?.status === "connected" || connector?.status === "degraded";
}

function isConnectorError(connector: Connector | undefined): boolean {
  return connector?.status === "error";
}

function isBootstrapPending(bootstrap: LatestBootstrap | null | undefined): boolean {
  if (!bootstrap) return true;
  return bootstrap.data_run_status === "pending" || bootstrap.data_run_status === "running";
}

function shortRunId(runId: string | null | undefined): string {
  if (!runId) return "—";
  if (runId.length <= 12) return runId;
  return `${runId.slice(0, 8)}…`;
}

function connectedLabel(connector: Connector): string {
  try {
    return `Connected ${formatDisplayWhen(connector.created_at)}`;
  } catch {
    return "Connected";
  }
}

function IntegrationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shopify: shopifyResult, shop: shopifyShop, reason } = Route.useSearch();
  const callbackHandledRef = useRef(false);

  const {
    data: connectors,
    isPending,
    isError,
    error: loadError,
    refetch,
  } = useQuery({ queryKey: ["connectors"], queryFn: listConnectors });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUser,
  });
  const canManageConnectors =
    currentUser?.role === "admin" || currentUser?.role === "analyst";

  const connectorByName = new Map((connectors ?? []).map((c) => [c.name, c]));
  const errorConnectors = (connectors ?? []).filter((c) => c.status === "error");

  // Toast the result of the Shopify OAuth redirect, then clean the URL.
  useEffect(() => {
    if (!shopifyResult || callbackHandledRef.current) return;
    callbackHandledRef.current = true;

    if (shopifyResult === "connected") {
      toast.success("Shopify connected", {
        description: shopifyShop
          ? `${shopifyShop} is now connected to Klints.`
          : "Your store is now connected to Klints.",
      });
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
    } else {
      toast.error("Shopify connection failed", {
        description: shopifyErrorReasonMessage(reason ?? ""),
      });
    }
    void navigate({ to: "/integrations", search: {}, replace: true });
  }, [shopifyResult, shopifyShop, reason, navigate, queryClient]);

  // Remove (disconnect) flow
  const [removeTarget, setRemoveTarget] = useState<Connector | null>(null);
  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectConnector(id),
    onSuccess: (_data, _id) => {
      toast.success("Connector removed", {
        description: "You can reconnect it at any time.",
      });
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
    },
    onError: (err) => {
      toast.error("Could not remove connector", {
        description: getApiErrorMessage(err, "Please try again."),
      });
    },
    onSettled: () => setRemoveTarget(null),
  });

  // Shopify connect form
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);

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
        `${window.location.origin}/integrations`,
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      setShopifyError(getApiErrorMessage(err, "Could not start the Shopify connection."));
      setShopifyLoading(false);
    }
  }

  // Manago connect form
  const [managoOpen, setManagoOpen] = useState(false);
  const [managoEndpoint, setManagoEndpoint] = useState("");
  const [managoClientId, setManagoClientId] = useState("");
  const [managoApiSecret, setManagoApiSecret] = useState("");
  const [managoLoading, setManagoLoading] = useState(false);
  const [managoError, setManagoError] = useState<string | null>(null);

  async function handleManagoConnect() {
    const endpoint = managoEndpoint.trim().replace(/\/+$/, "");
    const clientId = managoClientId.trim();
    const apiSecret = managoApiSecret.trim();
    if (!endpoint || !clientId || !apiSecret) {
      setManagoError("Endpoint, Client ID, and API Secret are required.");
      return;
    }

    const managoConnector = connectorByName.get("manago_ai");
    const wasLinked = isConnectorLinked(managoConnector);

    setManagoError(null);
    setManagoLoading(true);
    try {
      await connectManago({ endpoint, clientId, apiSecret });
      toast.success("Manago.ai connected", {
        description: "Credentials verified and saved.",
      });

      traceManagoV3Onboarding("integrations post-manago-connect", {
        wasLinked,
        pathname: window.location.pathname,
      });

      if (!wasLinked) {
        // PRD-FE-07: first Manago connect must use the dedicated onboarding v3 step,
        // not the Connected Stack inline editor ("Save key").
        goToOnboardingManagoV3Step("integrations-first-manago-connect");
        return;
      }

      setManagoOpen(false);
      setManagoEndpoint("");
      setManagoClientId("");
      setManagoApiSecret("");
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
    } catch (err) {
      setManagoError(getApiErrorMessage(err, "Could not connect Manago.ai."));
    } finally {
      setManagoLoading(false);
    }
  }

  const connectedConnectors = (connectors ?? []).filter((c) => c.status === "connected");

  return (
    <AppShell title="Connected stack" subtitle="Phase 1 · Manago.ai + Shopify">
      <PageTitle
        kicker="Reference"
        title="Your ecommerce stack"
        description="Phase 1 connects Manago.ai and Shopify. Klints scores cross-stack integrity between CDP and commerce."
      />

      {errorConnectors.length > 0 && (
        <div className="mb-4 rounded-lg border border-risk/30 bg-risk/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Connector needs attention</p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {errorConnectors.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium text-foreground">{c.display_name}</span>
                    {c.name === "shopify" && shopifyAuthFailureMessage(c.config)
                      ? ` — ${shopifyAuthFailureMessage(c.config)}`
                      : " — reconnect required to restore sync and scoring."}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isPending ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-elevated p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connector status…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-elevated p-5">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(loadError, "Could not load connector status.")}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CONNECTOR_CARDS.map((card) => {
            const connector = connectorByName.get(card.key);
            const isLinked = isConnectorLinked(connector);
            const isError = isConnectorError(connector);
            const needsConnect = !isLinked || isError;
            const bootstrap = connector?.latest_bootstrap;
            const shopifyFailureMessage =
              card.key === "shopify" && connector
                ? shopifyAuthFailureMessage(connector.config)
                : null;

            return (
              <div
                key={card.key}
                className="rounded-xl border border-border bg-elevated p-5 shadow-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <ConnectorLogo name={card.key} />
                    <div>
                      <div className="text-base font-semibold">{card.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {isLinked && connector
                          ? `${connectedLabel(connector)}${connector.status === "degraded" ? " · Degraded" : ""}`
                          : isError
                            ? shopifyFailureMessage ?? "Error — reconnect required"
                            : "Not connected"}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    status={isLinked ? "Connected" : isError ? "Error" : "New"}
                  />
                </div>

                <p className="mt-4 text-sm text-muted-foreground">{card.desc}</p>

                {isError && connector && card.key === "shopify" && (
                  <div className="mt-4 rounded-lg border border-loss/25 bg-loss/5 px-3 py-2">
                    <p className="text-xs font-medium text-loss">Shopify auth expired</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {shopifyFailureMessage ??
                        "Reconnect Shopify to restore sync, scoring, and daily checks."}
                    </p>
                    {maskedConfigString(connector.config, "shop_domain") ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {maskedConfigString(connector.config, "shop_domain")}
                      </p>
                    ) : null}
                  </div>
                )}

                {isError && connector && card.key === "manago_ai" && (
                  <div className="mt-4 rounded-lg border border-loss/25 bg-loss/5 px-3 py-2">
                    <p className="text-xs font-medium text-loss">Manago connection error</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reconnect with valid credentials to restore sync and scoring.
                    </p>
                  </div>
                )}

                {isLinked && (
                  <div className="mt-4 rounded-lg border border-border bg-sand px-3 py-2">
                    {isBootstrapPending(bootstrap) ? (
                      <p className="text-xs text-muted-foreground">Bootstrap pending…</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                        <span className="text-muted-foreground">
                          Run ID{" "}
                          <span
                            className="font-mono text-foreground"
                            title={bootstrap?.run_id ?? undefined}
                          >
                            {shortRunId(bootstrap?.run_id)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Contacts{" "}
                          <span className="tabular font-semibold text-foreground">
                            {formatDisplayCount(bootstrap?.contacts ?? 0)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Orders{" "}
                          <span className="tabular font-semibold text-foreground">
                            {formatDisplayCount(bootstrap?.orders ?? 0)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Issues{" "}
                          <span className="tabular font-semibold text-foreground">
                            {formatDisplayCount(bootstrap?.issue_count ?? 0)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {isLinked && card.key === "manago_ai" && connector && (
                  <ManagoApiV3KeySection
                    connector={connector}
                    canManage={canManageConnectors}
                  />
                )}

                {/* Connect / reconnect forms */}
                {needsConnect && card.key === "shopify" && shopifyOpen ? (
                  <form
                    className="mt-4 space-y-3 border-t border-border pt-4"
                    autoComplete="off"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleShopifyConnect();
                    }}
                  >
                    <div>
                      <label
                        htmlFor="integrations-shop-domain"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Shop domain
                      </label>
                      <input
                        id="integrations-shop-domain"
                        name="shopify_shop_domain"
                        className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                        placeholder="your-store.myshopify.com"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        disabled={shopifyLoading}
                        autoComplete="off"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        You&apos;ll be redirected to Shopify to approve access, then brought
                        back here.
                      </p>
                    </div>
                    {shopifyError ? (
                      <p className="text-sm text-destructive">{shopifyError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={shopifyLoading}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {shopifyLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Redirecting to Shopify…
                        </>
                      ) : (
                        <>
                          Continue to Shopify <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  </form>
                ) : null}

                {needsConnect && card.key === "manago_ai" && managoOpen ? (
                  <form
                    className="mt-4 space-y-3 border-t border-border pt-4"
                    autoComplete="off"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleManagoConnect();
                    }}
                  >
                    <div>
                      <label
                        htmlFor="integrations-manago-endpoint"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Endpoint
                      </label>
                      <input
                        id="integrations-manago-endpoint"
                        name="manago_endpoint"
                        className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                        placeholder="app.manago.ai"
                        value={managoEndpoint}
                        onChange={(e) => setManagoEndpoint(e.target.value)}
                        disabled={managoLoading}
                        autoComplete="off"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Copy from Manago API v2 (e.g. app.manago.ai). https:// is added if
                        missing.
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="integrations-manago-client-id"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Client ID
                      </label>
                      <input
                        id="integrations-manago-client-id"
                        name="manago_client_id"
                        className="mt-1 w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                        placeholder="•••••••••••••"
                        value={managoClientId}
                        onChange={(e) => setManagoClientId(e.target.value)}
                        disabled={managoLoading}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="integrations-manago-api-secret"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        API Secret
                      </label>
                      <PasswordInput
                        id="integrations-manago-api-secret"
                        name="manago_api_secret"
                        className="mt-1"
                        inputClassName="w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                        placeholder="•••••••••••••"
                        value={managoApiSecret}
                        onChange={(e) => setManagoApiSecret(e.target.value)}
                        disabled={managoLoading}
                        autoComplete="off"
                      />
                    </div>
                    {managoError ? (
                      <p className="text-sm text-destructive">{managoError}</p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={managoLoading}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {managoLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Connecting…
                        </>
                      ) : (
                        <>
                          Save & connect <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  </form>
                ) : null}

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    {connector?.status === "connected" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-revenue" /> Healthy
                      </>
                    ) : connector?.status === "degraded" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-risk" /> Degraded
                      </>
                    ) : isError ? (
                      <span className="text-loss">Error — reconnect required</span>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" /> Ready to connect
                      </>
                    )}
                  </div>
                  {isLinked && !isError && connector ? (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(connector)}
                      className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  ) : needsConnect ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (card.key === "shopify") {
                          setShopifyOpen((wasOpen) => {
                            if (!wasOpen) {
                              const existingShop = connector
                                ? maskedConfigString(connector.config, "shop_domain")
                                : "";
                              setShopDomain(existingShop);
                              setShopifyError(null);
                            }
                            return !wasOpen;
                          });
                        } else {
                          setManagoOpen((wasOpen) => {
                            if (!wasOpen) {
                              setManagoEndpoint("");
                              setManagoClientId("");
                              setManagoApiSecret("");
                              setManagoError(null);
                            }
                            return !wasOpen;
                          });
                        }
                      }}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      {isError ? "Reconnect" : "Connect"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {connectedConnectors.length > 0 && (
        <Section
          title="Connector health"
          description="Freshness and latency by source"
          className="mt-6"
        >
          <div className="divide-y divide-border">
            {connectedConnectors.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 text-sm">
                <div className="flex-1 font-medium">{c.display_name}</div>
                <span className="text-xs text-muted-foreground">
                  Latency <span className="tabular text-foreground">42s</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Errors <span className="tabular text-foreground">0</span>
                </span>
                <StatusBadge status="Running" />
              </div>
            ))}
          </div>
        </Section>
      )}

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !disconnectMutation.isPending) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.display_name ?? "connector"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Klints will stop syncing from {removeTarget?.display_name ?? "this connector"} and
              its credentials will be deleted. You can reconnect it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnectMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget) disconnectMutation.mutate(removeTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Removing…
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
