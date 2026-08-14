import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, User, XCircle } from "lucide-react";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import { resolveAppHomePath, setAuthTokens } from "@/lib/auth";
import {
  acceptInvite,
  INVITE_INVALID_MESSAGE,
  inviteAcceptErrorMessage,
  invitePreviewErrorMessage,
  isInviteGoneError,
  previewInvite,
  roleLabel,
  type InvitePreview,
} from "@/lib/team";

type InviteSearch = {
  token: string;
};

export const Route = createFileRoute("/invite/accept")({
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({ meta: [{ title: "Accept invite — Klints" }] }),
  component: InviteAccept,
});

type PageStatus = "loading" | "error" | "ready" | "submitting";

function InviteAccept() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const previewedTokenRef = useRef<string | null>(null);

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedToken = token.trim();

    if (!trimmedToken) {
      if (typeof window !== "undefined") {
        const urlToken = new URLSearchParams(window.location.search)
          .get("token")
          ?.trim();
        if (!urlToken) {
          setStatus("error");
          setErrorMessage(INVITE_INVALID_MESSAGE);
        }
      }
      return;
    }

    if (previewedTokenRef.current === trimmedToken) {
      return;
    }
    previewedTokenRef.current = trimmedToken;

    let cancelled = false;
    setStatus("loading");
    setErrorMessage("");

    async function loadPreview() {
      try {
        const data = await previewInvite(trimmedToken);
        if (cancelled) return;
        setPreview(data);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(invitePreviewErrorMessage(err));
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || !password || !confirmPassword) {
      setFormError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setFormError(null);
    setStatus("submitting");

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setStatus("error");
      setErrorMessage(INVITE_INVALID_MESSAGE);
      return;
    }

    try {
      const data = await acceptInvite(trimmedToken, trimmedName, password);
      setAuthTokens(data);
      const home = await resolveAppHomePath(
        typeof data.needs_connector === "boolean" ? data.needs_connector : undefined,
      );
      void navigate({ to: home });
    } catch (err) {
      if (isInviteGoneError(err)) {
        setStatus("error");
        setErrorMessage(inviteAcceptErrorMessage(err));
        return;
      }
      setStatus("ready");
      setFormError(inviteAcceptErrorMessage(err));
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-sand px-4">
      <div className="grid-bg absolute inset-0 opacity-40" />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-elevated p-8 shadow-elevated">
        <div className="mb-6 flex justify-center">
          <KlintsLogo variant="wordmark" tone="dark" to={false} />
        </div>

        {status === "loading" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info-soft text-anchor">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight">
              Loading invite
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Checking your invitation…
            </p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
            </div>
            <h1 className="font-display mt-5 text-2xl font-semibold tracking-tight">
              Invite unavailable
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        ) : null}

        {(status === "ready" || status === "submitting") && preview ? (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Join {preview.workspace_name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.invited_by_name} invited you to join as{" "}
                {roleLabel(preview.role)}.
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <Field label="Email">
                <input
                  type="email"
                  value={preview.email}
                  readOnly
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground outline-none"
                />
              </Field>

              <Field label="Full name" icon={<User className="h-4 w-4" />}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === "submitting"}
                  autoComplete="name"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  placeholder="Your name"
                />
              </Field>

              <Field label="Password" icon={<Lock className="h-4 w-4" />}>
                <SecretField
                  value={password}
                  onChange={setPassword}
                  disabled={status === "submitting"}
                  autoComplete="new-password"
                  placeholder="Create a password"
                />
              </Field>

              <Field label="Confirm password" icon={<Lock className="h-4 w-4" />}>
                <SecretField
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  disabled={status === "submitting"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                />
              </Field>

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining workspace…
                  </>
                ) : (
                  <>
                    Accept invite <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {icon ? (
        <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
          <span className="text-muted-foreground">{icon}</span>
          {children}
        </div>
      ) : (
        <div className="mt-1">{children}</div>
      )}
    </label>
  );
}

function SecretField({
  value,
  onChange,
  disabled,
  autoComplete,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        placeholder={placeholder}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  );
}
