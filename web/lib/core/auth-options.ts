import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/core/db";
import { env } from "@/lib/core/env";

function normalizeRoleScope(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((v) => String(v));
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      // ignore parse failure
    }
    return [input];
  }
  return [];
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function verifyCredentials(email: string, password: string) {
  let user:
    | {
        id: string;
        email: string;
        name: string;
        passwordHash: string;
        isActive: boolean;
        tenantMembers: Array<{ tenantId: string; roles: Array<{ role: { code: string } }>; isDefault: boolean }>;
        platformRoles: Array<{ role: { code: string } }>;
      }
    | null = null;

  try {
    user = await prisma.platformUser.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        tenantMembers: {
          where: { status: "ACTIVE" },
          include: { roles: { include: { role: true } }, tenant: true }
        },
        platformRoles: { include: { role: true } }
      }
    });
  } catch {
    user = null;
  }

  if (user && user.isActive) {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return null;
    }

    const defaultMembership = user.tenantMembers.find((m) => m.isDefault) ?? user.tenantMembers[0] ?? null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      activeTenantId: defaultMembership?.tenantId ?? null,
      tenantRoles: defaultMembership ? defaultMembership.roles.map((r) => r.role.code) : [],
      platformRoles: user.platformRoles.map((r) => r.role.code)
    };
  }

  try {
    type LegacyUser = {
      id: string;
      email: string;
      full_name: string | null;
      password_hash: string;
      status: string;
    };
    type LegacyMembership = {
      sppg_id: string;
      role_scope: unknown;
    };

    const legacyUsers = await prisma.$queryRawUnsafe<LegacyUser[]>(
      `
        SELECT id::text, email, full_name, password_hash, status::text
        FROM users
        WHERE lower(email) = lower(${sqlLiteral(email)})
        LIMIT 1
      `
    );
    const legacyUser = legacyUsers[0];
    if (!legacyUser || legacyUser.status !== "ACTIVE") {
      return null;
    }

    const validLegacy = await bcrypt.compare(password, legacyUser.password_hash);
    if (!validLegacy) {
      return null;
    }

    const memberships = await prisma.$queryRawUnsafe<LegacyMembership[]>(
      `
        SELECT sppg_id::text, role_scope
        FROM user_sppg
        WHERE user_id = ${sqlLiteral(legacyUser.id)}::uuid
          AND status = 'ACTIVE'
        ORDER BY is_default DESC, created_at DESC
        LIMIT 1
      `
    );
    const membership = memberships[0];

    const tenantRoles = normalizeRoleScope(membership?.role_scope);
    const platformRoles = tenantRoles.includes("SUPER_ADMIN") ? ["PLATFORM_ADMIN"] : [];

    return {
      id: legacyUser.id,
      email: legacyUser.email,
      name: legacyUser.full_name ?? legacyUser.email,
      activeTenantId: membership?.sppg_id ?? null,
      tenantRoles,
      platformRoles
    };
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }
        const user = await verifyCredentials(credentials.email, credentials.password);
        return user as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.activeTenantId = (user as any).activeTenantId ?? null;
        token.tenantRoles = (user as any).tenantRoles ?? [];
        token.platformRoles = (user as any).platformRoles ?? [];
      }

      if (trigger === "update" && session?.activeTenantId) {
        token.activeTenantId = session.activeTenantId;
        token.tenantRoles = session.tenantRoles ?? token.tenantRoles;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.userId ?? "");
      session.activeTenantId = (token.activeTenantId as string | null) ?? null;
      session.tenantRoles = (token.tenantRoles as string[]) ?? [];
      session.platformRoles = (token.platformRoles as string[]) ?? [];
      return session;
    }
  },
  secret: env.NEXTAUTH_SECRET
};

