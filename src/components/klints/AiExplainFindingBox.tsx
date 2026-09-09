import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
  aiExplainFindingQueryKey,
  getOrCreateExplainFinding,
  isValidExplainFindingPayload,
} from "@/lib/ai";

export function AiExplainFindingBox({
  checkId,
  dcsRunId,
  enabled,
}: {
  checkId: string;
  dcsRunId?: number | null;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: aiExplainFindingQueryKey(checkId, dcsRunId),
    queryFn: () => getOrCreateExplainFinding(checkId, dcsRunId),
    enabled: enabled && Boolean(checkId.trim()),
    retry: (failureCount, error) =>
      failureCount < 1 &&
      Boolean(error && typeof error === "object" && (error as { status?: number }).status === 503),
    retryDelay: 2000,
    staleTime: 5 * 60 * 1000,
  });

  const payload = query.data?.payload;
  const valid = isValidExplainFindingPayload(payload);

  if (!enabled || !checkId.trim()) return null;
  if (query.isError || (!query.isPending && !valid)) return null;

  return (
    <section className="dcc-ai-explain" aria-live="polite">
      <div className="dcc-ai-explain-kicker">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        In plain language
      </div>
      {query.isPending ? (
        <div className="dcc-ai-explain-skeleton" aria-hidden>
          <div className="dcc-ai-explain-skel-line w-3/4" />
          <div className="dcc-ai-explain-skel-line w-full" />
        </div>
      ) : valid && payload ? (
        <>
          <h5 className="dcc-ai-explain-headline">{payload.headline}</h5>
          <p className="dcc-ai-explain-body">{payload.explanation}</p>
        </>
      ) : null}
    </section>
  );
}
