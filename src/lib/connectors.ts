import { apiRequest } from "@/lib/api";

export type LatestBootstrap = {
  data_run_id: number;
  run_id: string | null;
  data_run_status: "pending" | "running" | "succeeded" | "failed";
  contacts: number;
  orders: number;
  issue_count: number;
  summary_status: string | null;
  finished_at: string | null;
};

export type Connector = {
  id: string;
  name: string; // "manago_ai" | "shopify"
  type: string;
  display_name: string;
  status: string; // connected | degraded | error
  config: Record<string, unknown>;
  created_at: string;
  latest_bootstrap: LatestBootstrap | null;
  /** Present on Manago connectors from list API (PRD-CONN-06). */
  has_api_v3_key?: boolean;
};

export type ManagoApiV3KeyResponse = {
  platform: string;
  has_api_v3_key: boolean;
  api_v3_key_masked: string;
};

/** Terminal Shopify auth failure codes persisted by backend (PRD-CONN-05). */
export const SHOPIFY_AUTH_FAILURE_REASONS = {
  REFRESH_INACTIVE: "REFRESH_INACTIVE",
  REFRESH_EXPIRED: "REFRESH_EXPIRED",
  AUTH_FAILED: "AUTH_FAILED",
} as const;

const SHOPIFY_AUTH_FAILURE_MESSAGES: Record<string, string> = {
  REFRESH_INACTIVE:
    "Shopify refresh token is inactive. Reconnect to restore access.",
  REFRESH_EXPIRED:
    "Shopify refresh token expired. Reconnect to restore access.",
  AUTH_FAILED: "Shopify authentication failed. Reconnect to restore access.",
};

export function shopifyAuthFailureMessage(
  config: Record<string, unknown> | undefined,
): string | null {
  if (!config) return null;
  const reason = config.auth_failure_reason;
  if (typeof reason !== "string" || !reason.trim()) return null;
  return SHOPIFY_AUTH_FAILURE_MESSAGES[reason] ?? "Reconnect required to restore Shopify access.";
}

export function maskedConfigString(
  config: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!config) return "";
  const value = config[key];
  return typeof value === "string" ? value : "";
}

export async function setManagoApiV3Key(
  apiV3Key: string,
): Promise<ManagoApiV3KeyResponse> {
  return apiRequest("/api/v1/connectors/manago_ai/api-v3-key/", {
    method: "PUT",
    body: JSON.stringify({ api_v3_key: apiV3Key.trim() }),
  }) as Promise<ManagoApiV3KeyResponse>;
}

export async function removeManagoApiV3Key(): Promise<ManagoApiV3KeyResponse> {
  return apiRequest("/api/v1/connectors/manago_ai/api-v3-key/", {
    method: "DELETE",
  }) as Promise<ManagoApiV3KeyResponse>;
}

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const data = err as Record<string, unknown>;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    const first = Object.values(data).find(
      (value) =>
        typeof value === "string" ||
        (Array.isArray(value) && typeof value[0] === "string"),
    );
    if (typeof first === "string") return first;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return fallback;
}

export async function listConnectors(): Promise<Connector[]> {
  const data = (await apiRequest(
    "/api/v1/connectors/",
  )) as PaginatedResponse<Connector>;
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Starts the Shopify OAuth flow. The backend validates and normalizes the
 * shop domain, and after the OAuth callback redirects the browser to
 * `returnTo` with `?shopify=connected|error` query params.
 */
export async function startShopifyOAuth(
  shop: string,
  returnTo: string,
): Promise<string> {
  const data = (await apiRequest("/api/v1/connectors/shopify/start/", {
    method: "POST",
    body: JSON.stringify({ shop, return_to: returnTo }),
  })) as { authorize_url?: string };

  if (typeof data.authorize_url !== "string" || !data.authorize_url) {
    throw new Error("The server did not return a Shopify authorization URL.");
  }
  return data.authorize_url;
}

export async function disconnectConnector(id: string): Promise<void> {
  await apiRequest(`/api/v1/connectors/${id}/`, { method: "DELETE" });
}

export type ManagoCredentials = {
  endpoint: string;
  clientId: string;
  apiSecret: string;
};

/** Manago UI shows hosts like `app.manago.ai` without a scheme. */
function normalizeManagoEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Verifies Manago.ai credentials, then creates the connector. */
export async function connectManago(creds: ManagoCredentials): Promise<void> {
  const endpoint = normalizeManagoEndpoint(creds.endpoint);
  const verifyResult = (await apiRequest("/api/v1/connectors/verify/", {
    method: "POST",
    body: JSON.stringify({
      client_id: creds.clientId,
      api_secret: creds.apiSecret,
      endpoint,
    }),
  })) as { valid?: boolean; message?: string };

  if (verifyResult.valid !== true) {
    throw new Error(verifyResult.message || "Credentials could not be verified.");
  }

  await apiRequest("/api/v1/connectors/", {
    method: "POST",
    body: JSON.stringify({
      name: "manago_ai",
      type: "cdp",
      display_name: "Manago.ai",
      config: {
        base_url: endpoint,
        workspace_id: creds.clientId,
        api_key: creds.apiSecret,
      },
    }),
  });
}

/** Maps backend `?shopify=error&reason=...` codes to user-facing messages. */
export function shopifyErrorReasonMessage(reason: string): string {
  const messages: Record<string, string> = {
    invalid_state: "The connection link expired. Please start again.",
    shop_mismatch: "Shopify returned a different shop than expected. Please try again.",
    invalid_hmac: "Shopify returned an invalid response. Please try again.",
    missing_code: "Shopify did not authorize the connection.",
    company_not_found: "Your company could not be found. Please contact support.",
    token_exchange_failed: "Could not complete the Shopify connection. Please try again.",
  };
  return messages[reason] || "The Shopify connection failed. Please try again.";
}
