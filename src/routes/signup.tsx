import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { apiRequest } from "@/lib/api";
import { requireGuest } from "@/lib/auth";
import { ArrowRight, Mail, Lock, Building2, User, Loader2, Eye, EyeOff, Globe } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Sign up — Klints" }],
  }),
  beforeLoad: () => requireGuest(),
  component: Signup,
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

function getFieldError(err: unknown, field: string): string | null {
  if (err && typeof err === "object") {
    const value = (err as Record<string, unknown>)[field];
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return null;
}

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyWebsiteError, setCompanyWebsiteError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (
      !name.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword ||
      !companyName.trim() ||
      !companyWebsite.trim()
    ) {
      setError("All fields are required.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setCompanyWebsiteError(null);
    setLoading(true);
    try {
      await apiRequest("/api/v1/auth/register/", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          name,
          company_name: companyName,
          company_domain: companyWebsite.trim(),
        }),
      });
      sessionStorage.setItem("verification_email", email.trim().toLowerCase());
      void navigate({ to: "/verify" });
    } catch (err) {
      const domainErr = getFieldError(err, "company_domain");
      if (domainErr) {
        setCompanyWebsiteError(domainErr);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between bg-sand p-8 lg:p-12">
        <KlintsLogo variant="wordmark" tone="dark" to="/signin" />

        <div className="mx-auto w-full max-w-sm">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Create your workspace
          </div>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink">
            Start with Klints
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Stack integrity, orchestrated.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <Field
              icon={<User className="h-4 w-4" />}
              label="Full name"
              type="text"
              placeholder="George L."
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Work email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              icon={<Lock className="h-4 w-4" />}
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Field
              icon={<Lock className="h-4 w-4" />}
              label="Confirm password"
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company</label>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  placeholder="Lumera Skin"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Website</label>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  placeholder="lumera.skin"
                  autoComplete="url"
                  value={companyWebsite}
                  onChange={(e) => {
                    setCompanyWebsite(e.target.value);
                    if (companyWebsiteError) setCompanyWebsiteError(null);
                  }}
                />
              </div>
              {companyWebsiteError ? (
                <p className="mt-1 text-sm text-destructive">{companyWebsiteError}</p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Create workspace
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Already using Klints?{" "}
            <Link to="/signin" className="font-medium text-anchor hover:underline">
              Sign in
            </Link>
          </p>
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
              Five systems.
              <br />
              One integrity layer.
            </div>
            <p className="mt-6 max-w-md text-sm text-sand/70">
              Connect Manago.ai and Shopify — Klints scores whether they
              agree, then guides the fix before handoff.
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
  type,
  ...props
}: { icon: React.ReactNode; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
        <span className="text-muted-foreground">{icon}</span>
        <input
          {...props}
          type={isPassword ? (visible ? "text" : "password") : type}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((v) => !v)}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
