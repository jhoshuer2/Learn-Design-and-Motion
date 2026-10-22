import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

/** Server-side gate. Every protected page/action calls this; the UI hiding things is never the control. */
export async function requireUser(roles?: Role[]) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (roles && !roles.includes(session.user.role)) redirect("/dashboard");
  return session.user;
}
