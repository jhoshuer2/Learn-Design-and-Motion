import type { PublicApproval, Role, Visibility } from "@prisma/client";

export type Viewer = { id: string; role: Role } | null;
export type AccessLevel = "owner" | "public" | "none";

/**
 * The single visibility decision, used by pages AND by image requests, evaluated fresh on every request.
 * LINK is readable by anyone with the link; PUBLIC only once approved; PRIVATE only by the owner. A moderator hold
 * hides the project from everyone except its owner. Moderators review through their own screen, not this one.
 */
export function projectAccess(viewer: Viewer, p: { userId: string; visibility: Visibility; moderationHold: boolean; publicApproval: PublicApproval }): AccessLevel {
  if (viewer && viewer.id === p.userId) return "owner";
  if (p.moderationHold) return "none";
  if (p.visibility === "LINK") return "public";
  // Public is pre-moderated: until a reviewer approves what is shown, it is not reachable by anyone else, even by link.
  if (p.visibility === "PUBLIC" && p.publicApproval === "APPROVED") return "public";
  return "none";
}
