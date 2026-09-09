import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
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
  function normalizeEventCasing(text: string): string {
    // The model may output event types in all-caps (e.g. "RETURN" / "CANCELLATION").
    // UI requirement: display these as lowercase for readability.
    return text
      .replace(/\bRETURN\b/g, "return")
      .replace(/\bCANCELLATION\b/g, "cancellations");
  }

  const query = useQuery({
    queryKey: aiFixSuggestionQueryKey(checkId, dcsRunId),
    queryFn: () => getOrCreateFixSuggestion(checkId, dcsRunId),
    enabled: enabled && Boolean(checkId.trim()),
    retry: (failureCount, error) =>
      failureCount < 1 &&
      Boolean(error && typeof error === "object" && (error as { status?: number }).status === 503),
    retryDelay: 2000,
    staleTime: 5 * 60 * 1000,
  });

  const payload = query.data?.payload;
  const valid = isValidFixSuggestionPayload(payload);

  return (
    <section className="fix-ai" aria-live="polite">
      <div className="fix-ai-head">
        <span className="fix-ai-kicker">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          AI suggestion
        </span>
        {query.data?.cached && valid ? (
          <span className="fix-ai-cached">Saved suggestion</span>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="fix-ai-skeleton" aria-hidden>
          <div className="fix-ai-skel-line w-3/4" />
          <div className="fix-ai-skel-line w-full" />
          <div className="fix-ai-skel-line w-5/6" />
          <div className="fix-ai-skel-line w-2/3" />
        </div>
      ) : query.isError || !valid ? (
        <p className="fix-ai-fallback">{aiSuggestionErrorMessage(query.error)}</p>
      ) : (
        <>
          <h3 className="fix-ai-headline">
            {normalizeEventCasing(payload.headline)}
          </h3>
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
            {` · check ${query.data.check_id}`}
          </div>
        </>
      )}
    </section>
  );
}
