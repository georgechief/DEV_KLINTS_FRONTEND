import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/klints/PasswordInput";
import { refreshConnectorsThenDcsStatus } from "@/lib/app-access";
import { getApiErrorMessage, setManagoApiV3Key } from "@/lib/connectors";
import { cn } from "@/lib/utils";

export const MANAGO_API_V3_KEY_DESCRIPTION =
  "Unlocks Manago product catalog checks. Use an API v3 key — not your API v2 Client ID or Secret.";

export function ManagoApiV3KeyGuidance({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p>{MANAGO_API_V3_KEY_DESCRIPTION}</p>
      <div className="space-y-1">
        <p>This step is optional but recommended.</p>
        <p>Create your key in Manago → API access details → API v3.</p>
        <p>
          Also install Manago&apos;s Shopify integration inside Manago (Integrations / Apps →
          Shopify). Klints&apos; Shopify connection alone is not enough.
        </p>
      </div>
    </div>
  );
}

type ManagoApiV3KeyFormProps = {
  inputId?: string;
  canManage?: boolean;
  saveButtonLabel?: string;
  onSuccess?: () => void;
  className?: string;
  guidanceClassName?: string;
  showGuidance?: boolean;
};

export function ManagoApiV3KeyForm({
  inputId = "manago-api-v3-key",
  canManage = true,
  saveButtonLabel = "Save key",
  onSuccess,
  className,
  guidanceClassName = "text-[11px] text-muted-foreground",
  showGuidance = true,
}: ManagoApiV3KeyFormProps) {
  const queryClient = useQueryClient();
  const [draftKey, setDraftKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (key: string) => setManagoApiV3Key(key),
    onSuccess: async () => {
      toast.success("API v3 key saved", {
        description: "Manago catalog checks can use this key on the next run.",
      });
      setDraftKey("");
      setSaveError(null);
      await refreshConnectorsThenDcsStatus(queryClient);
      onSuccess?.();
    },
    onError: (err) => {
      const message = getApiErrorMessage(err, "Could not save the API v3 key.");
      setSaveError(message);
      toast.error("Could not save API v3 key", { description: message });
    },
  });

  function handleSave() {
    const trimmed = draftKey.trim();
    if (!trimmed) {
      setSaveError("Paste the API v3 key from Manago before saving.");
      return;
    }
    setSaveError(null);
    saveMutation.mutate(trimmed);
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showGuidance ? <ManagoApiV3KeyGuidance className={guidanceClassName} /> : null}
      <PasswordInput
        id={inputId}
        name="manago_api_v3_key"
        inputClassName="w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        placeholder="Paste API v3 key"
        value={draftKey}
        onChange={(e) => setDraftKey(e.target.value)}
        disabled={!canManage || saveMutation.isPending}
        autoComplete="off"
      />
      {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
      <button
        type="button"
        disabled={!canManage || saveMutation.isPending}
        onClick={() => handleSave()}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saveMutation.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        ) : (
          saveButtonLabel
        )}
      </button>
      {!canManage ? (
        <p className="text-[11px] text-muted-foreground">
          Only admins and analysts can add or change the API v3 key.
        </p>
      ) : null}
    </div>
  );
}
