import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { resendVerificationEmail } from "@/lib/auth";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verify your email — Klints" }] }),
  component: Verify,
});

function Verify() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const savedEmail = sessionStorage.getItem("verification_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  async function handleResend() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Email required", {
        description: "Use the same address you signed up with.",
      });
      return;
    }

    setResending(true);
    try {
      const response = await resendVerificationEmail(trimmed);
      toast.success(response.detail || "Verification link sent", {
        description: "Check spam if it doesn't arrive in a minute.",
      });
    } catch {
      toast.error("Could not resend verification link", {
        description: "Try again in a moment.",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-sand px-4">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-elevated p-8 text-center shadow-elevated">
        <div className="mb-6 flex justify-center">
          <KlintsLogo variant="wordmark" tone="dark" to={false} />
        </div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info-soft text-anchor">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>. Open it, then
          continue setup.
        </p>
        <button
          onClick={() => navigate({ to: "/signin" })}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continue (demo) <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          Didn&apos;t get it?{" "}
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resending}
            className="inline-flex items-center gap-1 font-medium text-anchor hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Sending…
              </>
            ) : (
              "Resend link"
            )}
          </button>
        </p>
      </div>
    </div>
  );
}
