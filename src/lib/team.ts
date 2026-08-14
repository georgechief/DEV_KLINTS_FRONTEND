import { apiRequest } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/connectors";

export type InvitePreview = {
  email: string;
  role: string;
  workspace_name: string;
  invited_by_name: string;
  expires_at: string;
};

export type InviteAcceptResponse = {
  access?: string;
  needs_connector?: boolean;
};

export const INVITE_INVALID_MESSAGE =
  "This invite link is invalid or has expired. Ask your admin to send a new one.";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  return apiRequest(
    `/api/v1/team/invites/accept/?token=${encodeURIComponent(token)}`,
  ) as Promise<InvitePreview>;
}

export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<InviteAcceptResponse> {
  return apiRequest("/api/v1/team/invites/accept/", {
    method: "POST",
    body: JSON.stringify({ token, name, password }),
  }) as Promise<InviteAcceptResponse>;
}

function inviteErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const detail = (err as { detail?: unknown }).detail;
    if (
      detail === "Invite not found." ||
      detail === "Invite is no longer valid."
    ) {
      return INVITE_INVALID_MESSAGE;
    }
    if (typeof detail === "string") return detail;
    const first = Object.values(err as Record<string, unknown>).find(
      (value) =>
        typeof value === "string" ||
        (Array.isArray(value) && typeof value[0] === "string"),
    );
    if (typeof first === "string") return first;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return fallback;
}

/** True when the backend returned 404/410 invite-gone errors. */
export function isInviteGoneError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const detail = (err as { detail?: unknown }).detail;
    return (
      detail === "Invite not found." || detail === "Invite is no longer valid."
    );
  }
  return false;
}

export function invitePreviewErrorMessage(err: unknown): string {
  return inviteErrorMessage(err, INVITE_INVALID_MESSAGE);
}

export function inviteAcceptErrorMessage(err: unknown): string {
  return inviteErrorMessage(err, "Could not accept the invite. Please try again.");
}

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  is_workspace_creator: boolean;
  created_at: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by: {
    id: string;
    name: string;
    email: string;
  };
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

export function memberBadgeLabel(member: TeamMember): string {
  if (member.is_workspace_creator) return "Owner";
  return roleLabel(member.role);
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const data = (await apiRequest("/api/v1/team/members/")) as {
    members?: TeamMember[];
  };
  return Array.isArray(data.members) ? data.members : [];
}

export async function listTeamInvites(): Promise<TeamInvite[]> {
  const data = (await apiRequest("/api/v1/team/invites/")) as {
    invites?: TeamInvite[];
  };
  return Array.isArray(data.invites) ? data.invites : [];
}

export async function createTeamInvite(
  email: string,
  role: string,
): Promise<TeamInvite> {
  return apiRequest("/api/v1/team/invites/", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  }) as Promise<TeamInvite>;
}

export async function resendTeamInvite(id: string): Promise<TeamInvite> {
  return apiRequest(`/api/v1/team/invites/${id}/resend/`, {
    method: "POST",
    body: JSON.stringify({}),
  }) as Promise<TeamInvite>;
}

export async function revokeTeamInvite(id: string): Promise<TeamInvite> {
  return apiRequest(`/api/v1/team/invites/${id}/revoke/`, {
    method: "POST",
    body: JSON.stringify({}),
  }) as Promise<TeamInvite>;
}

export async function updateTeamMember(
  id: string,
  payload: { role?: string; is_active?: boolean },
): Promise<TeamMember> {
  return apiRequest(`/api/v1/team/members/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }) as Promise<TeamMember>;
}

export function teamErrorMessage(err: unknown, fallback: string): string {
  return getApiErrorMessage(err, fallback);
}
