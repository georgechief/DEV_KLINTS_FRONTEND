import { apiRequest } from "@/lib/api";

export type SearchHitType = "issue" | "audit" | "connector" | "run" | "workflow";

export type SearchHit = {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: Record<string, unknown>;
};

export type SearchResponse = {
  q: string;
  results: SearchHit[];
};

const V1_SEARCH_TYPES = ["issue", "audit", "connector", "run"] as const;

export async function searchGlobal(
  q: string,
  opts?: { types?: string[]; limit?: number; signal?: AbortSignal },
): Promise<SearchResponse> {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return { q: trimmed, results: [] };
  }

  const params = new URLSearchParams();
  params.set("q", trimmed);
  if (opts?.types?.length) {
    params.set("types", opts.types.join(","));
  } else {
    params.set("types", V1_SEARCH_TYPES.join(","));
  }
  if (opts?.limit != null) {
    params.set("limit", String(opts.limit));
  }

  return apiRequest(`/api/v1/search/?${params.toString()}`, {
    signal: opts?.signal,
  }) as Promise<SearchResponse>;
}
