import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ManagoApiV3KeyGuidance,
  ManagoApiV3KeyForm,
} from "@/components/klints/ManagoApiV3KeyForm";
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
import { DCS_STATUS_QUERY_KEY } from "@/lib/app-access";
import {
  type Connector,
  getApiErrorMessage,
  maskedConfigString,
  removeManagoApiV3Key,
} from "@/lib/connectors";

type ManagoApiV3KeySectionProps = {
  connector: Connector;
  canManage: boolean;
};

export function ManagoApiV3KeySection({ connector, canManage }: ManagoApiV3KeySectionProps) {
  const queryClient = useQueryClient();
  const hasKey = connector.has_api_v3_key === true;
  const maskedFromConfig = maskedConfigString(connector.config, "api_v3_key");

  const [replaceMode, setReplaceMode] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
  };

  const removeMutation = useMutation({
    mutationFn: () => removeManagoApiV3Key(),
    onSuccess: () => {
      toast.success("API v3 key removed");
      setRemoveOpen(false);
      setReplaceMode(false);
      invalidate();
    },
    onError: (err) => {
      toast.error("Could not remove API v3 key", {
        description: getApiErrorMessage(err, "Please try again."),
      });
    },
  });

  const showInput = !hasKey || replaceMode;
  const maskedDisplay = maskedFromConfig || "****";

  return (
    <div className="mt-4 rounded-lg border border-border bg-sand px-3 py-3">
      <div className="text-[11px] font-medium text-foreground">API v3 key</div>
      <ManagoApiV3KeyGuidance className="mt-1 text-[11px] text-muted-foreground" />

      {showInput ? (
        <div className="mt-3 space-y-2">
          <ManagoApiV3KeyForm
            showGuidance={false}
            inputId={`manago-v3-key-${connector.id}`}
            canManage={canManage}
            onSuccess={() => setReplaceMode(false)}
          />
          {hasKey && replaceMode ? (
            <button
              type="button"
              onClick={() => setReplaceMode(false)}
              className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs text-foreground">
              {maskedDisplay}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setReplaceMode(true);
                  }}
                  className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveOpen(true)}
                  className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  Remove
                </button>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">Key saved (masked).</p>
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!open && !removeMutation.isPending) setRemoveOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Manago API v3 key?</AlertDialogTitle>
            <AlertDialogDescription>
              Product catalog checks (PT-01 / PT-03) may stay UNKNOWN until you add a key again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                removeMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Removing…
                </>
              ) : (
                "Remove key"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
