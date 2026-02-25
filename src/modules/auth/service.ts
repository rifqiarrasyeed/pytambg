import { compare } from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../../config";
import { query } from "../../db/pool";
import type { Role } from "../../types";
import { ApiError, conflict, unauthorized } from "../../utils/api-error";
import { composeRefreshToken, parseRefreshToken, randomToken, sha256 } from "../../utils/token";
import { parseDurationToSeconds } from "../../utils/time";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  is_super_admin: boolean;
};

type AssignmentRow = {
  sppg_id: string;
  sppg_code: string;
  sppg_name: string;
  role_scope: Role[];
  is_default: boolean;
  status: "ACTIVE" | "INACTIVE";
};

async function getAssignments(userId: string): Promise<AssignmentRow[]> {
  const result = await query<AssignmentRow>(
    `
      SELECT
        us.sppg_id,
        s.code AS sppg_code,
        s.name AS sppg_name,
        us.role_scope,
        us.is_default,
        us.status
      FROM user_sppg us
      JOIN sppg s ON s.id = us.sppg_id
      WHERE us.user_id = $1 AND us.status = 'ACTIVE'
      ORDER BY us.is_default DESC, us.created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    ...row,
    role_scope: Array.isArray(row.role_scope) ? row.role_scope : []
  }));
}

function resolveActiveSppg(assignments: AssignmentRow[], requestedSppgId?: string): string | null {
  if (requestedSppgId) {
    const found = assignments.find((item) => item.sppg_id === requestedSppgId);
    if (!found) {
      throw conflict("SPPG_NOT_ASSIGNED", "SPPG tidak termasuk assignment user");
    }
    return found.sppg_id;
  }

  const defaultAssignment = assignments.find((item) => item.is_default);
  if (defaultAssignment) {
    return defaultAssignment.sppg_id;
  }

  return assignments[0]?.sppg_id ?? null;
}

function rolesForActiveSppg(assignments: AssignmentRow[], activeSppgId: string | null): Role[] {
  if (!activeSppgId) {
    return [];
  }
  const assignment = assignments.find((item) => item.sppg_id === activeSppgId);
  return assignment?.role_scope ?? [];
}

async function createSession(userId: string, activeSppgId: string | null): Promise<{ sessionId: string; refreshSecret: string }> {
  const sessionId = randomUUID();
  const refreshSecret = randomToken();
  const refreshTokenHash = sha256(refreshSecret);
  const ttlSeconds = parseDurationToSeconds(config.jwtRefreshTtl);

  await query(
    `
      INSERT INTO sessions_tokens (
        id,
        user_id,
        refresh_token_hash,
        active_sppg_id,
        expires_at,
        revoked_at,
        created_at,
        created_by,
        updated_at,
        updated_by
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        now() + make_interval(secs => $5),
        NULL,
        now(),
        $2,
        now(),
        $2
      )
    `,
    [sessionId, userId, refreshTokenHash, activeSppgId, ttlSeconds]
  );

  return { sessionId, refreshSecret };
}

export async function login(
  app: FastifyInstance,
  payload: { email: string; password: string; active_sppg_id?: string }
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; name: string; email: string };
  assignments: { sppg_id: string; sppg_code: string; sppg_name: string; roles: Role[]; is_default: boolean }[];
  active_sppg_id: string | null;
}> {
  const userResult = await query<UserRow>(
    `
      SELECT id, email, full_name, password_hash, status, is_super_admin
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [payload.email]
  );

  const user = userResult.rows[0];
  if (!user) {
    throw unauthorized("Email atau password salah");
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError(423, "USER_INACTIVE", "User tidak aktif");
  }

  const passwordMatch = await compare(payload.password, user.password_hash);
  if (!passwordMatch) {
    throw unauthorized("Email atau password salah");
  }

  const assignments = await getAssignments(user.id);
  const activeSppgId = user.is_super_admin
    ? payload.active_sppg_id ?? assignments[0]?.sppg_id ?? null
    : resolveActiveSppg(assignments, payload.active_sppg_id);

  if (!user.is_super_admin && !activeSppgId) {
    throw conflict("SPPG_NOT_ASSIGNED", "User belum memiliki assignment SPPG aktif");
  }

  const roles = user.is_super_admin ? (["SUPER_ADMIN"] as Role[]) : rolesForActiveSppg(assignments, activeSppgId);
  const session = await createSession(user.id, activeSppgId);

  const accessToken = app.signAccessToken({
    user_id: user.id,
    active_sppg_id: activeSppgId,
    roles,
    is_super_admin: user.is_super_admin,
    session_id: session.sessionId
  });

  const refreshToken = composeRefreshToken(session.sessionId, session.refreshSecret);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: parseDurationToSeconds(config.jwtAccessTtl),
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email
    },
    assignments: assignments.map((assignment) => ({
      sppg_id: assignment.sppg_id,
      sppg_code: assignment.sppg_code,
      sppg_name: assignment.sppg_name,
      roles: assignment.role_scope,
      is_default: assignment.is_default
    })),
    active_sppg_id: activeSppgId
  };
}

export async function refresh(
  app: FastifyInstance,
  payload: { refresh_token: string; active_sppg_id?: string }
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  active_sppg_id: string | null;
}> {
  const { sessionId, secretPart } = parseRefreshToken(payload.refresh_token);

  const sessionResult = await query<{
    id: string;
    user_id: string;
    refresh_token_hash: string;
    active_sppg_id: string | null;
    revoked_at: string | null;
    expires_at: string;
  }>(
    `
      SELECT id, user_id, refresh_token_hash, active_sppg_id, revoked_at, expires_at
      FROM sessions_tokens
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  const session = sessionResult.rows[0];
  if (!session) {
    throw unauthorized("Refresh token tidak valid");
  }
  if (session.revoked_at) {
    throw unauthorized("Sesi sudah logout");
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw unauthorized("Refresh token kadaluarsa");
  }
  if (session.refresh_token_hash !== sha256(secretPart)) {
    throw unauthorized("Refresh token tidak cocok");
  }

  const userResult = await query<UserRow>(
    `SELECT id, email, full_name, password_hash, status, is_super_admin FROM users WHERE id = $1 LIMIT 1`,
    [session.user_id]
  );
  const user = userResult.rows[0];
  if (!user || user.status !== "ACTIVE") {
    throw unauthorized("User tidak aktif");
  }

  const assignments = await getAssignments(user.id);
  const activeSppgId = user.is_super_admin
    ? payload.active_sppg_id ?? session.active_sppg_id
    : resolveActiveSppg(assignments, payload.active_sppg_id ?? session.active_sppg_id ?? undefined);

  const roles = user.is_super_admin ? (["SUPER_ADMIN"] as Role[]) : rolesForActiveSppg(assignments, activeSppgId);

  const newSecret = randomToken();
  const ttlSeconds = parseDurationToSeconds(config.jwtRefreshTtl);
  await query(
    `
      UPDATE sessions_tokens
      SET refresh_token_hash = $2,
          active_sppg_id = $3,
          expires_at = now() + make_interval(secs => $4),
          updated_at = now(),
          updated_by = $5
      WHERE id = $1
    `,
    [session.id, sha256(newSecret), activeSppgId, ttlSeconds, user.id]
  );

  const accessToken = app.signAccessToken({
    user_id: user.id,
    active_sppg_id: activeSppgId,
    roles,
    is_super_admin: user.is_super_admin,
    session_id: session.id
  });

  return {
    access_token: accessToken,
    refresh_token: composeRefreshToken(session.id, newSecret),
    expires_in: parseDurationToSeconds(config.jwtAccessTtl),
    active_sppg_id: activeSppgId
  };
}

export async function logout(payload: { refresh_token: string }): Promise<void> {
  const { sessionId, secretPart } = parseRefreshToken(payload.refresh_token);
  const result = await query<{
    refresh_token_hash: string;
  }>("SELECT refresh_token_hash FROM sessions_tokens WHERE id = $1 LIMIT 1", [sessionId]);

  const row = result.rows[0];
  if (!row) {
    return;
  }

  if (row.refresh_token_hash !== sha256(secretPart)) {
    return;
  }

  await query(
    `
      UPDATE sessions_tokens
      SET revoked_at = now(), updated_at = now()
      WHERE id = $1
    `,
    [sessionId]
  );
}

export async function switchActiveSppg(
  app: FastifyInstance,
  args: {
    userId: string;
    sessionId: string;
    sppgId: string;
    isSuperAdmin: boolean;
  }
): Promise<{ active_sppg_id: string; access_token: string }> {
  const assignments = await getAssignments(args.userId);
  if (!args.isSuperAdmin) {
    const found = assignments.find((assignment) => assignment.sppg_id === args.sppgId);
    if (!found) {
      throw conflict("SPPG_NOT_ASSIGNED", "SPPG tidak termasuk assignment user");
    }
  }

  const roles = args.isSuperAdmin
    ? (["SUPER_ADMIN"] as Role[])
    : rolesForActiveSppg(assignments, args.sppgId);

  await query(
    `
      UPDATE sessions_tokens
      SET active_sppg_id = $2, updated_at = now(), updated_by = $1
      WHERE id = $3
    `,
    [args.userId, args.sppgId, args.sessionId]
  );

  return {
    active_sppg_id: args.sppgId,
    access_token: app.signAccessToken({
      user_id: args.userId,
      active_sppg_id: args.sppgId,
      roles,
      is_super_admin: args.isSuperAdmin,
      session_id: args.sessionId
    })
  };
}

export async function getMySppg(
  userId: string
): Promise<{ sppg_id: string; sppg_code: string; sppg_name: string; roles: Role[]; is_default: boolean }[]> {
  const assignments = await getAssignments(userId);
  return assignments.map((assignment) => ({
    sppg_id: assignment.sppg_id,
    sppg_code: assignment.sppg_code,
    sppg_name: assignment.sppg_name,
    roles: assignment.role_scope,
    is_default: assignment.is_default
  }));
}
