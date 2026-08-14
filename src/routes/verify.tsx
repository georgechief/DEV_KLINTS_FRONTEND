import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail, ArrowRight } from "lucide-react";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verify your email — Klints" }] }),
  component: Verify,
});

function Verify() {
  const navigate = useNavigate();

const [email, setEmail] = useState("");

useEffect(() => {
  const savedEmail = sessionStorage.getItem("verification_email");

  if (savedEmail) {
    setEmail(savedEmail);
  }
}, []);

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
          Didn't get it?{" "}
          <button
            type="button"
            onClick={() =>
              toast.success("Verification link resent", {
                description: "Check spam if it doesn’t arrive in a minute.",
              })
            }
            className="font-medium text-anchor hover:underline"
          >
            Resend link
          </button>
        </p>
      </div>
    </div>
  );
}
