import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { forgotPassword, requireGuest } from "@/lib/auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Forgot password — Klints" }],
  }),
  beforeLoad: () => requireGuest(),
  component: ForgotPassword,
});

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = err as Record<string, unknown>;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    const first = Object.values(data).find((value) => {
      if (typeof value === "string") return true;
      return Array.isArray(value) && typeof value[0] === "string";
    });
    if (typeof first === "string") return first;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return "Something went wrong. Please try again.";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await forgotPassword(email);
      setSuccessMessage(data.detail);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between bg-sand p-8 lg:p-12">
        <KlintsLogo variant="wordmark" tone="dark" to="/signin" />

        <div className="mx-auto w-full max-w-sm">
          {successMessage ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-revenue-soft text-revenue">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight text-ink">
                Reset link sent
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{successMessage}</p>
              <Link
                to="/signin"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
                Account recovery
              </div>
              <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink">
                Forgot your password?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your work email and we&apos;ll send you a reset link.
              </p>

              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <Field
                  icon={<Mail className="h-4 w-4" />}
                  label="Work email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  disabled={loading}
                  onChange={(e) => setEmail(e.target.value)}
                />

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending reset link..." : "Send reset link"}
                  {!loading ? <ArrowRight className="h-4 w-4" /> : null}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Remember your password?{" "}
                <Link to="/signin" className="font-medium text-anchor hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <div className="text-xs text-fog">© {new Date().getFullYear()} Klints</div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink text-sand lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(245,242,235,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(245,242,235,0.5) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <KlintsLogo variant="mark" tone="light" to={false} className="h-10" />
          <div>
            <div className="font-display text-5xl font-semibold leading-[1.1] tracking-tight">
              The bedrock points
              <br />
              of your martech stack.
            </div>
            <p className="mt-6 max-w-md text-sm text-sand/70">
              Klints is the AI orchestration layer above the tools you already pay for —
              so your stack agrees before the agent acts.
            </p>
          </div>
          <div className="text-xs text-sand/50">klints.ai</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  ...props
}: { icon: React.ReactNode; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <input
          {...props}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
