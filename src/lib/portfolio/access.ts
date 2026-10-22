import type { Role, Visibility } from "@prisma/client";

export type Viewer = { id: string; role: Role } | null;
export type AccessLevel = "owner" | "public" | "none";

/**
 * The single visibility decision, used by pages AND by image requests, evaluated fresh on every request.
 * LINK and PUBLIC are readable by anyone who has the page; PRIVATE only by the owner. A moderator hold
 * hides the project from everyone except its owner. Moderators review through their own screen, not this one.
 */
export function projectAccess(viewer: Viewer, p: { userId: string; visibility: Visibility; moderationHold: boolean }): AccessLevel {
  if (viewer && viewer.id === p.userId) return "owner";
  if ((p.visibility === "LINK" || p.visibility === "PUBLIC") && !p.moderationHold) return "public";
  return "none";
}
