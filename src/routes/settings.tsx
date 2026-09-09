import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section } from "@/components/klints/primitives";
import { Switch } from "@/components/ui/switch";
import { Loader2, LogOut, Plus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDisplayDate } from "@/lib/datetime";
import { toast } from "sonner";
import {
  changePassword,
  clearAuth,
  companyWritebackExecuteEnabled,
  getCurrentUser,
  syncCurrentUserWritebackFlag,
  updateCurrentUser,
  updateWorkspace,
  type UpdateWorkspacePayload,
} from "@/lib/auth";
import {
  createTeamInvite,
  listTeamInvites,
  listTeamMembers,
  memberBadgeLabel,
  resendTeamInvite,
  revokeTeamInvite,
  roleLabel,
  teamErrorMessage,
  updateTeamMember,
} from "@/lib/team";

const tabs = ["Account", "Workspace", "Team", "API keys", "Billing"] as const;
type Tab = (typeof tabs)[number];

const COMING_SOON_TABS = new Set<Tab>(["API keys", "Billing"]);

const tabFromSearch = (raw?: string): Tab => {
  const map: Record<string, Tab> = {
    account: "Account",
    workspace: "Workspace",
    team: "Team",
    "api-keys": "API keys",
    billing: "Billing",
  };
  return (raw && map[raw]) || "Account";
};

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Settings — Klints" },
      { name: "description", content: "Account, workspace, team, API keys, and billing." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab: tabParam } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(() => tabFromSearch(tabParam));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [writebackExecuteEnabled, setWritebackExecuteEnabled] = useState<boolean | null>(null);
  const [tenantNameError, setTenantNameError] = useState<string | null>(null);
  const [companyNameError, setCompanyNameError] = useState<string | null>(null);
  const [companyDomainError, setCompanyDomainError] = useState<string | null>(null);

  const teamEnabled = tab === "Team";

  const { data: currentUser, isPending: currentUserPending } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
  });

  const canEditWorkspace = currentUser?.role === "admin";

  // Derive toggle display value: use local pending state if set, otherwise fall back to server value.
  // This means the toggle ALWAYS shows the server value on mount (no flicker to false),
  // and shows the user's in-progress change after they toggle.
  const serverWritebackEnabled = companyWritebackExecuteEnabled(currentUser?.company ?? null);
  const effectiveWritebackEnabled = writebackExecuteEnabled ?? serverWritebackEnabled;

  const {
    data: members,
    isPending: membersPending,
    isError: membersError,
    error: membersLoadError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["team", "members"],
    queryFn: listTeamMembers,
    enabled: teamEnabled,
  });

  const isWorkspaceOwner = Boolean(
    currentUser &&
      (members ?? []).some(
        (member) => member.id === currentUser.id && member.is_workspace_creator,
      ),
  );

  const canManageRoles = isWorkspaceOwner;

  const {
    data: invites,
    isPending: invitesPending,
    isError: invitesError,
    error: invitesLoadError,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ["team", "invites"],
    queryFn: listTeamInvites,
    enabled: teamEnabled,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (nextName: string) => updateCurrentUser(nextName),
    onSuccess: () => {
      setNameError(null);
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => {
      const nameErr = getFieldError(err, "name");
      if (nameErr) {
        setNameError(nameErr);
      } else {
        setNameError(null);
        toast.error("Could not update profile", {
          description: getAuthErrorMessage(err),
        });
      }
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({
      current_password,
      new_password,
    }: {
      current_password: string;
      new_password: string;
    }) => changePassword(current_password, new_password),
    onSuccess: (data) => {
      toast.success(data.detail);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPasswordError(null);
      setNewPasswordError(null);
      setPasswordFormError(null);
    },
    onError: (err) => {
      const currentErr = getFieldError(err, "current_password");
      const newErr = getFieldError(err, "new_password");
      if (currentErr || newErr) {
        setCurrentPasswordError(currentErr);
        setNewPasswordError(newErr);
        setPasswordFormError(null);
      } else {
        setCurrentPasswordError(null);
        setNewPasswordError(null);
        setPasswordFormError(getAuthErrorMessage(err));
      }
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (payload: UpdateWorkspacePayload) => updateWorkspace(payload),
    onSuccess: (data) => {
      toast.success("Workspace updated");
      setTenantName(data.tenant.name);
      setCompanyName(data.company.name);
      setCompanyDomain(data.company.domain);
      const enabled = companyWritebackExecuteEnabled(data.company);
      syncCurrentUserWritebackFlag(queryClient, enabled);
      // Set local state to the confirmed server value so there is zero render gap.
      // The useEffect will later reset it to null once currentUser re-renders with updated data.
      setWritebackExecuteEnabled(enabled);
      setTenantNameError(null);
      setCompanyNameError(null);
      setCompanyDomainError(null);
    },
    onError: (err) => {
      const tenantErr = getFieldError(err, "tenant_name");
      const companyErr = getFieldError(err, "company_name");
      const domainErr = getFieldError(err, "company_domain");
      if (tenantErr || companyErr || domainErr) {
        setTenantNameError(tenantErr);
        setCompanyNameError(companyErr);
        setCompanyDomainError(domainErr);
      } else {
        setTenantNameError(null);
        setCompanyNameError(null);
        setCompanyDomainError(null);
        toast.error("Could not update workspace", {
          description: getAuthErrorMessage(err),
        });
      }
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      createTeamInvite(email, role),
    onSuccess: (invite) => {
      toast.success("Invite sent", {
        description: `${invite.email} · role ${roleLabel(invite.role)}`,
      });
      setInviteEmail("");
      setInviteRole("analyst");
      setInviteOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["team", "invites"] });
    },
    onError: (err) => {
      toast.error("Could not send invite", {
        description: teamErrorMessage(err, "Please try again."),
      });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => resendTeamInvite(id),
    onSuccess: (invite) => {
      toast.success("Invite resent", { description: invite.email });
      void queryClient.invalidateQueries({ queryKey: ["team", "invites"] });
    },
    onError: (err) => {
      toast.error("Could not resend invite", {
        description: teamErrorMessage(err, "Please try again."),
      });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => revokeTeamInvite(id),
    onSuccess: (invite) => {
      toast.success("Invite revoked", { description: invite.email });
      void queryClient.invalidateQueries({ queryKey: ["team", "invites"] });
    },
    onError: (err) => {
      toast.error("Could not revoke invite", {
        description: teamErrorMessage(err, "Please try again."),
      });
    },
  });

  const membersErrorToastedRef = useRef(false);
  const invitesErrorToastedRef = useRef(false);

  useEffect(() => {
    setTab(tabFromSearch(tabParam));
  }, [tabParam]);

  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name);
    setTenantName(currentUser.tenant.name);
    setCompanyName(currentUser.company?.name ?? "");
    setCompanyDomain(currentUser.company?.domain ?? "");
    // Do NOT touch writebackExecuteEnabled here.
    // On mount: state starts null → effectiveWritebackEnabled reads server value directly.
    // After toggle: state is true/false → effectiveWritebackEnabled uses that until next mount.
    // After save: onSuccess sets state to the confirmed value — no reset needed here.
  }, [currentUser]);

  useEffect(() => {
    if (!teamEnabled) {
      membersErrorToastedRef.current = false;
      invitesErrorToastedRef.current = false;
      return;
    }
    if (membersError && membersLoadError && !membersErrorToastedRef.current) {
      membersErrorToastedRef.current = true;
      toast.error("Could not load team members", {
        description: teamErrorMessage(membersLoadError, "Please try again."),
        action: {
          label: "Retry",
          onClick: () => void refetchMembers(),
        },
      });
    }
    if (!membersError) {
      membersErrorToastedRef.current = false;
    }
    if (invitesError && invitesLoadError && !invitesErrorToastedRef.current) {
      invitesErrorToastedRef.current = true;
      toast.error("Could not load pending invites", {
        description: teamErrorMessage(invitesLoadError, "Please try again."),
        action: {
          label: "Retry",
          onClick: () => void refetchInvites(),
        },
      });
    }
    if (!invitesError) {
      invitesErrorToastedRef.current = false;
    }
  }, [
    teamEnabled,
    membersError,
    membersLoadError,
    refetchMembers,
    invitesError,
    invitesLoadError,
    refetchInvites,
  ]);

  const selectTab = (t: Tab) => {
    setTab(t);
    const slug =
      t === "API keys" ? "api-keys" : t.toLowerCase();
    void navigate({
      to: "/settings",
      search: { tab: slug },
      replace: true,
    });
  };

  const sendInvite = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Enter an email address");
      return;
    }
    createInviteMutation.mutate({ email, role: inviteRole });
  };

  async function handleRoleChange(memberId: string, role: string) {
    if (!canManageRoles) return;

    const member = (members ?? []).find((m) => m.id === memberId);
    if (!member || member.is_workspace_creator) return;
    if (role !== "analyst" && role !== "viewer") return;

    setRoleUpdatingId(memberId);
    try {
      await updateTeamMember(memberId, { role });
      toast.success("Role updated");
      void queryClient.invalidateQueries({ queryKey: ["team", "members"] });
    } catch (err) {
      toast.error("Could not update role", {
        description: teamErrorMessage(err, "Please try again."),
      });
    } finally {
      setRoleUpdatingId(null);
    }
  }

  const pendingInvites = (invites ?? []).filter((invite) => invite.status === "pending");
  const teamLoading = teamEnabled && (membersPending || invitesPending);
  const nameUnchanged = currentUser ? name.trim() === currentUser.name.trim() : true;
  const workspaceUnchanged = currentUser
    ? tenantName === currentUser.tenant.name &&
      companyName === (currentUser.company?.name ?? "") &&
      companyDomain === (currentUser.company?.domain ?? "") &&
      effectiveWritebackEnabled ===
        companyWritebackExecuteEnabled(currentUser.company)
    : true;
  const writebackToggleDirty =
    currentUser != null &&
    writebackExecuteEnabled != null &&
    writebackExecuteEnabled !== companyWritebackExecuteEnabled(currentUser.company);

  function handleSaveProfile() {
    if (!currentUser) return;

    setNameError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (trimmedName === currentUser.name.trim()) return;

    updateProfileMutation.mutate(trimmedName);
  }

  function handleChangePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setPasswordFormError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFormError("All fields are required.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordFormError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFormError("Passwords do not match.");
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  function handleSaveWorkspace() {
    if (!currentUser || !canEditWorkspace) return;

    setTenantNameError(null);
    setCompanyNameError(null);
    setCompanyDomainError(null);

    const payload: UpdateWorkspacePayload = {};
    if (tenantName !== currentUser.tenant.name) {
      payload.tenant_name = tenantName;
    }
    if (companyName !== (currentUser.company?.name ?? "")) {
      payload.company_name = companyName;
    }
    if (companyDomain !== (currentUser.company?.domain ?? "")) {
      payload.company_domain = companyDomain;
    }
    if (effectiveWritebackEnabled !== companyWritebackExecuteEnabled(currentUser.company)) {
      payload.writeback_execute_enabled = effectiveWritebackEnabled;
    }

    if (Object.keys(payload).length === 0) return;

    updateWorkspaceMutation.mutate(payload);
  }

  // NOTE: toggle is local-only; save button persists the workspace.

  return (
    <AppShell title="Settings" subtitle="Account & workspace">
      <PageTitle title="Settings" description="Manage your account, workspace, team, keys, and billing." />

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-border bg-elevated p-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={`min-w-[5.5rem] flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              {t}
              {COMING_SOON_TABS.has(t) ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      {tab === "Account" && (
        <div className="space-y-4">
          <Section title="User settings" description="Your profile in this workspace">
            <div className="space-y-4 p-5">
              {currentUserPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
                </div>
              ) : currentUser ? (
                <>
                  <Field
                    label="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={updateProfileMutation.isPending}
                    error={nameError}
                  />
                  <Field label="Email" defaultValue={currentUser.email} readOnly />
                  <Field label="Role" defaultValue={roleLabel(currentUser.role)} readOnly />
                  <ComingSoonField
                    label="Timezone"
                    helper="Workspace timezone will be configurable in a later release."
                  />
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={updateProfileMutation.isPending || nameUnchanged}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save
                  </button>
                </>
              ) : null}
            </div>
          </Section>
          <Section title="Security" description="Sign-in and session">
            <form className="space-y-4 p-5" onSubmit={handleChangePasswordSubmit}>
              <Field
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                error={currentPasswordError}
                autoComplete="current-password"
              />
              <Field
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                error={newPasswordError}
                autoComplete="new-password"
              />
              <Field
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                autoComplete="new-password"
              />
              {passwordFormError ? (
                <p className="text-sm text-destructive">{passwordFormError}</p>
              ) : null}
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Change password
              </button>
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    clearAuth();
                    void navigate({ to: "/signin" });
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-sm font-medium text-spark hover:bg-sand"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </form>
          </Section>
        </div>
      )}

      {tab === "Workspace" && (
        <Section title="Workspace" description="Company profile and industry context">
          <div className="space-y-4 p-5">
            {currentUserPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workspace…
              </div>
            ) : currentUser ? (
              <>
                {!canEditWorkspace ? (
                  <p className="text-xs text-muted-foreground">
                    Only workspace admins can edit these settings.
                  </p>
                ) : null}
                <Field
                  label="Workspace name"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  disabled={!canEditWorkspace || updateWorkspaceMutation.isPending}
                  error={tenantNameError}
                />
                <Field
                  label="Company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!canEditWorkspace || updateWorkspaceMutation.isPending}
                  error={companyNameError}
                />
                <ComingSoonField
                  label="Industry"
                  helper="Industry classification is not editable yet."
                />
                <Field
                  label="Website"
                  value={companyDomain}
                  onChange={(e) => setCompanyDomain(e.target.value)}
                  disabled={!canEditWorkspace || updateWorkspaceMutation.isPending}
                  error={companyDomainError}
                />
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Allow writebacks</p>
                      <p className="text-xs text-muted-foreground">
                        {writebackToggleDirty
                          ? "Unsaved change — Save workspace to apply Allow writebacks."
                          : effectiveWritebackEnabled
                            ? "When on, analysts can request writeback approval on Fix and admins can Approve & write. Writes go to your connected Manago and Shopify accounts."
                            : "Writebacks are off. Fix can preview and download evidence; Approve will not write."}
                      </p>
                    </div>
                    <Switch
                      checked={effectiveWritebackEnabled}
                      onCheckedChange={(nextChecked) => {
                        setWritebackExecuteEnabled(nextChecked);
                      }}
                      disabled={
                        !canEditWorkspace ||
                        updateWorkspaceMutation.isPending
                      }
                      aria-label="Allow writebacks"
                    />
                  </div>
                </div>
                <ComingSoonField
                  label="Reporting currency"
                  helper="Reporting currency will follow company settings in a later release."
                />
                <button
                  type="button"
                  onClick={handleSaveWorkspace}
                  disabled={
                    !canEditWorkspace ||
                    updateWorkspaceMutation.isPending ||
                    workspaceUnchanged
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateWorkspaceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </button>
                {!workspaceUnchanged && canEditWorkspace ? (
                  <p className="text-xs text-muted-foreground">
                    Unsaved workspace changes — click Save to apply.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </Section>
      )}

      {tab === "Team" && (
        <div className="space-y-6">
          {teamLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-elevated p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : (
            <>
              <Section
                title="Team members"
                description="Who has access to this workspace"
                action={
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add team member
                  </button>
                }
              >
                {inviteOpen && (
                  <div className="border-b border-border bg-sand/60 px-5 py-4">
                    <div className="text-sm font-medium">Invite a teammate</div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="min-w-[14rem] flex-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Email
                        </span>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="name@lumera.skin"
                          disabled={createInviteMutation.isPending}
                          className="mt-1 block w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        />
                      </label>
                      <label className="w-36">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Role
                        </span>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          disabled={createInviteMutation.isPending}
                          className="mt-1 block w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        >
                          <option value="admin">Admin</option>
                          <option value="analyst">Analyst</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={sendInvite}
                        disabled={createInviteMutation.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {createInviteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Send invite
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviteOpen(false)}
                        disabled={createInviteMutation.isPending}
                        className="rounded-md border border-border bg-elevated px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {(members ?? []).map((member) => (
                    <li
                      key={member.id}
                      className={`flex items-center gap-4 px-5 py-3 ${member.is_active ? "" : "opacity-60"}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-revenue-soft text-sm font-semibold text-revenue">
                        {member.name
                          .split(" ")
                          .map((s) => s[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{member.name}</div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                        {!member.is_active ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Inactive
                          </div>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {memberBadgeLabel(member)}
                      </span>
                      {canManageRoles && !member.is_workspace_creator ? (
                        <select
                          value={member.role === "viewer" ? "viewer" : "analyst"}
                          onChange={(e) => void handleRoleChange(member.id, e.target.value)}
                          disabled={roleUpdatingId === member.id}
                          aria-label={`Change role for ${member.name}`}
                          className="rounded-md border border-border bg-elevated px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        >
                          <option value="analyst">Analyst</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section
                title="Pending invites"
                description="Invitations waiting to be accepted"
              >
                {pendingInvites.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-muted-foreground">
                    No pending invites.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {pendingInvites.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center gap-4 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{invite.email}</div>
                          <div className="text-xs text-muted-foreground">
                            {roleLabel(invite.role)} · expires{" "}
                            {formatDisplayDate(invite.expires_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => resendInviteMutation.mutate(invite.id)}
                            disabled={resendInviteMutation.isPending}
                            className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeInviteMutation.mutate(invite.id)}
                            disabled={revokeInviteMutation.isPending}
                            className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      )}

      {tab === "API keys" && (
        <Section title="API keys" description="Programmatic access to Klints">
          <div className="px-5 py-10 text-center">
            <div className="text-sm font-medium text-foreground">Coming soon</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              API keys for programmatic access are not available yet. You can manage connectors and
              credentials under Integrations.
            </p>
          </div>
        </Section>
      )}

      {tab === "Billing" && (
        <Section title="Billing" description="Plan and usage">
          <div className="px-5 py-10 text-center">
            <div className="text-sm font-medium text-foreground">Coming soon</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Plan, usage, and invoice details are not available in the app yet.
            </p>
          </div>
        </Section>
      )}
    </AppShell>
  );
}

function getAuthErrorMessage(err: unknown): string {
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

function getFieldError(err: unknown, field: string): string | null {
  if (err && typeof err === "object") {
    const value = (err as Record<string, unknown>)[field];
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return null;
}

function ComingSoonField({
  label,
  helper,
}: {
  label: string;
  helper: string;
}) {
  return (
    <div className="block">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="rounded bg-sand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  value,
  onChange,
  readOnly,
  disabled,
  error,
  type = "text",
  autoComplete,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  readOnly?: boolean;
  disabled?: boolean;
  error?: string | null;
  type?: string;
  autoComplete?: string;
}) {
  const isControlled = value !== undefined;

  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...(isControlled ? { value, onChange } : { defaultValue })}
        readOnly={readOnly}
        disabled={disabled || readOnly}
        type={type}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring read-only:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </label>
  );
}
