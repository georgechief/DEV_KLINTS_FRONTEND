import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AI_FIX_SUGGESTION_UNAVAILABLE,
  aiFixSuggestionQueryKey,
  aiSuggestionErrorMessage,
  getOrCreateFixSuggestion,
  isValidFixSuggestionPayload,
} from "@/lib/ai";

export function FixAiSuggestionBox({
  checkId,
  dcsRunId,
  enabled,
}: {
  checkId: string;
  dcsRunId?: number | null;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();

  function normalizeEventCasing(text: string): string {
    // The model may output event types in all-caps (e.g. "RETURN" / "CANCELLATION").
    // UI requirement: display these as lowercase for readability.
    return text
      .replace(/\bRETURN\b/g, "return")
      .replace(/\bCANCELLATION\b/g, "cancellations");
  }

  const normalizedCheckId = checkId.trim();
  const queryKey = aiFixSuggestionQueryKey(normalizedCheckId, dcsRunId);
  const query = useQuery({
    queryKey,
    // Soft-first on the backend — no Mistral when a saved row exists.
    queryFn: () => getOrCreateFixSuggestion(normalizedCheckId, dcsRunId),
    enabled: enabled && Boolean(normalizedCheckId),
    // Do not retry 503 — Mistral 429 maps to 503 and retries burn the shared quota.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      getOrCreateFixSuggestion(normalizedCheckId, dcsRunId, {
        forceRefresh: true,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success(
        isValidFixSuggestionPayload(data.payload)
          ? "Suggestion refreshed"
          : "Suggestion updated",
      );
    },
    onError: (err) => {
      // Keep the previously loaded saved suggestion on screen.
      toast.error("Could not refresh suggestion", {
        description: aiSuggestionErrorMessage(err),
      });
    },
  });

  const payload = query.data?.payload;
  const valid = isValidFixSuggestionPayload(payload);
  const isRefreshing = refreshMutation.isPending;
  const canRefresh =
    enabled &&
    Boolean(normalizedCheckId) &&
    !query.isPending &&
    !isRefreshing;

  const fallbackCopy = query.isError
    ? aiSuggestionErrorMessage(query.error)
    : AI_FIX_SUGGESTION_UNAVAILABLE;

  return (
    <section className="fix-ai" aria-live="polite">
      <div className="fix-ai-head">
        <span className="fix-ai-kicker">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          AI suggestion
        </span>
        <div className="fix-ai-head-actions">
          {query.data?.cached && valid ? (
            <span className="fix-ai-cached">
              {query.data.stale
                ? "Saved · from earlier score"
                : "Saved suggestion"}
            </span>
          ) : null}
          <button
            type="button"
            className="fix-ai-refresh"
            disabled={!canRefresh}
            onClick={() => refreshMutation.mutate()}
            aria-label={
              valid
                ? "Refresh AI suggestion"
                : "Generate AI suggestion"
            }
            title={
              valid
                ? "Generate a fresh suggestion from Mistral"
                : "Generate an AI suggestion"
            }
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {valid ? "Refresh" : "Generate"}
          </button>
        </div>
      </div>

      {query.isPending || (isRefreshing && !valid) ? (
        <div className="fix-ai-skeleton" aria-hidden>
          <div className="fix-ai-skel-line w-3/4" />
          <div className="fix-ai-skel-line w-full" />
          <div className="fix-ai-skel-line w-5/6" />
          <div className="fix-ai-skel-line w-2/3" />
        </div>
      ) : query.isError || !valid ? (
        <p className="fix-ai-fallback">{fallbackCopy}</p>
      ) : (
        <>
          <h3 className="fix-ai-headline">
            {normalizeEventCasing(payload.headline)}
          </h3>
          <div
            className={
              isRefreshing ? "fix-ai-body is-refreshing" : "fix-ai-body"
            }
          >
            <div className="fix-ai-copy-grid">
              <div>
                <div className="fix-ai-label">What’s wrong</div>
                <p>{normalizeEventCasing(payload.whats_wrong)}</p>
              </div>
              <div>
                <div className="fix-ai-label">Why it matters</div>
                <p>{normalizeEventCasing(payload.why_it_matters)}</p>
              </div>
            </div>
            <ol className="fix-ai-steps">
              {payload.suggestions.map((step) => (
                <li key={step.step}>
                  <span className="fix-ai-step-num">{step.step}</span>
                  <div>
                    <div className="fix-ai-step-title">
                      {normalizeEventCasing(step.title)}
                    </div>
                    <p>{normalizeEventCasing(step.detail)}</p>
                  </div>
                </li>
              ))}
            </ol>
            {payload.cautions.length > 0 ? (
              <div className="fix-ai-cautions">
                <div className="fix-ai-label">Cautions</div>
                <ul>
                  {payload.cautions.map((item) => (
                    <li key={item}>{normalizeEventCasing(item)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="fix-ai-meta">
              Source: {query.data.model || "Mistral"}
              {query.data.cached ? " · cached" : ""}
              {query.data.stale ? " · earlier score" : ""}
              {` · check ${query.data.check_id}`}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
