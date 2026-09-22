import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  aiNbaBlurbQueryKey,
  getOrCreateNbaBlurb,
  isValidNbaBlurbPayload,
} from "@/lib/ai";

/** Overview mounts 4 cards; stagger so they don't stampede the shared Mistral lock. */
const NBA_STAGGER_MS = 800;

export function NbaBlurbBox({
  checkId,
  dcsRunId,
  planRank,
  enabled,
}: {
  checkId: string;
  dcsRunId?: number | null;
  planRank: number;
  enabled: boolean;
}) {
  const [gateOpen, setGateOpen] = useState(planRank <= 1);

  useEffect(() => {
    if (planRank <= 1) {
      setGateOpen(true);
      return;
    }
    const timer = window.setTimeout(
      () => setGateOpen(true),
      (planRank - 1) * NBA_STAGGER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [planRank]);

  const query = useQuery({
    queryKey: aiNbaBlurbQueryKey(checkId, dcsRunId, planRank),
    queryFn: () => getOrCreateNbaBlurb(checkId, dcsRunId, planRank),
    enabled: enabled && Boolean(checkId.trim()) && gateOpen,
    // Do not retry 503 — Mistral 429 maps to 503 and retries burn the shared quota.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const payload = query.data?.payload;
  if (!isValidNbaBlurbPayload(payload)) return null;

  return <p className="ov-nba-blurb">{payload.blurb}</p>;
}
