import type { Role } from "@prisma/client";

export type StoredFile = {
  key: string; name: string; mime: string; size: number; sha256: string;
  width: number; height: number; role: "final" | "preview" | "process";
};

/** Submissions and their files are private: the owner, or a reviewer/admin handling an appeal. */
export function canReadSubmission(user: { id: string; role: Role }, submission: { userId: string }) {
  return submission.userId === user.id || user.role === "REVIEWER" || user.role === "ADMIN";
}
