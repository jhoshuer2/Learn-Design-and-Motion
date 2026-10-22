import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; email: string; name?: string | null };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    tv?: number;
    role?: Role;
  }
}
