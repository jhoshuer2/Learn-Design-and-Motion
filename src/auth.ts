import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { dummyHash } from "@/lib/auth/password";
import { checkLogin, clearLoginFailures, recordLoginFailure } from "@/lib/auth/throttle";

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      async authorize(raw, request) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const headers = request?.headers ?? new Headers();
        // Too many recent failures for this account or from this client: refuse without even checking the password.
        if ((await checkLogin(email, headers)).blocked) return null;
        const user = await db.user.findUnique({ where: { email } });
        // An unknown email still pays for one hash comparison, so response time does not reveal which emails exist.
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? (await dummyHash()));
        if (!user?.passwordHash || !ok) { await recordLoginFailure(email, headers); return null; }
        await clearLoginFailures(email);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      // Role is always read from the database, never from the client.
      if (token.uid) {
        const u = await db.user.findUnique({ where: { id: token.uid }, select: { role: true, tokenVersion: true } });
        // A deleted account must stop working at once: returning null ends the session.
        if (!u) return null;
        // A session remembers the version it was issued under; a password change, reset or "sign out everywhere" bumps it.
        if (user?.id) token.tv = u.tokenVersion;
        else if (token.tv !== u.tokenVersion) return null;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
