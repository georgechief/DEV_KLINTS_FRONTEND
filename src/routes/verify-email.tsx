import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { apiRequest } from "@/lib/api";

type VerifySearch = {
  token: string;
  email: string;
};

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    token: typeof search.token === "string" ? search.token : "",
    email: typeof search.email === "string" ? search.email : "",
  }),
  head: () => ({ meta: [{ title: "Verify email — Klints" }] }),
  component: VerifyEmail,
});

type Status = "loading" | "success" | "error";

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && typeof (err as { detail?: unknown }).detail === "string") {
    return (err as { detail: string }).detail;
  }
  return "Invalid or expired verification link.";
}

function VerifyEmail() {
  const navigate = useNavigate();
  const { token, email } = Route.useSearch();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Verifying your email…");
  const verifyStartedRef = useRef(false);

  useEffect(() => {
    const verificationKey =
      token && email ? `verify-email:${token}:${email}` : "";

    if (!verificationKey) {
      setStatus("error");
      setMessage("This verification link is missing a token or email.");
      return;
    }

    if (sessionStorage.getItem(verificationKey) === "success") {
      setStatus("success");
      setMessage("Email verified. You can sign in.");
      const redirectTimer = setTimeout(() => {
        void navigate({ to: "/signin" });
      }, 1500);
      return () => clearTimeout(redirectTimer);
    }

    if (verifyStartedRef.current) {
      return;
    }
    verifyStartedRef.current = true;

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    async function verify() {
      try {
        const data = await apiRequest("/api/v1/auth/verify-email/", {
          method: "POST",
          body: JSON.stringify({ token, email }),
        });
        if (cancelled) return;
        sessionStorage.setItem(verificationKey, "success");
        setStatus("success");
        setMessage(
          typeof data?.detail === "string"
            ? data.detail
            : "Email verified. You can sign in.",
        );
        redirectTimer = setTimeout(() => {
          void navigate({ to: "/signin" });
        }, 1500);
      } catch (err) {
        if (cancelled) return;
        verifyStartedRef.current = false;
        setStatus("error");
        setMessage(getErrorMessage(err));
      }
    }

    void verify();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [token, email, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-sand px-4">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-elevated p-8 text-center shadow-elevated">
        <div className="mb-6 flex justify-center">
          <KlintsLogo variant="wordmark" tone="dark" to={false} />
        </div>

        {status === "loading" ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info-soft text-anchor">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : null}

        {status === "success" ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-revenue-soft text-revenue">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        ) : null}

        {status === "error" ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-6 w-6" />
          </div>
        ) : null}

        <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight">
          {status === "loading"
            ? "Verifying email"
            : status === "success"
              ? "Email verified"
              : "Verification failed"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        {status === "success" ? (
          <p className="mt-4 text-xs text-muted-foreground">Redirecting to sign in…</p>
        ) : null}

        {status === "error" ? (
          <button
            type="button"
            onClick={() => void navigate({ to: "/signin" })}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to sign in
          </button>
        ) : null}
      </div>
    </div>
  );
}
