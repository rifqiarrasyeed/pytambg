export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN_SPPG",
  "NUTRITIONIST",
  "INVENTORY",
  "KITCHEN_PRODUCTION",
  "DRIVER",
  "SCHOOL_VERIFIER",
  "AUDITOR_VIEWER"
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  SPPG_MANAGE: "sppg.manage",
  ASSIGN_USER: "assignment.manage",
  MASTER_WRITE: "master.write",
  MASTER_READ: "master.read",
  PLANNING_WRITE: "planning.write",
  PLANNING_APPROVE: "planning.approve",
  PROCUREMENT_WRITE: "procurement.write",
  PROCUREMENT_APPROVE: "procurement.approve",
  RECEIPT_POST: "receipt.post",
  INVENTORY_WRITE: "inventory.write",
  INVENTORY_APPROVE: "inventory.approve",
  PRODUCTION_WRITE: "production.write",
  PRODUCTION_FINALIZE: "production.finalize",
  DELIVERY_MANAGE: "delivery.manage",
  DELIVERY_UPDATE_STATUS: "delivery.update_status",
  DELIVERY_UPLOAD_PROOF: "delivery.upload_proof",
  DELIVERY_VERIFY: "delivery.verify",
  DISPUTE_MANAGE: "dispute.manage",
  REPORT_VIEW: "report.view",
  REPORT_EXPORT: "report.export",
  AUDIT_VIEW: "audit.view",
  PERIOD_LOCK: "period.lock",
  PERIOD_UNLOCK: "period.unlock",
  ATTACHMENT_READ: "attachment.read",
  ATTACHMENT_WRITE: "attachment.write"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type JwtClaims = {
  user_id: string;
  active_sppg_id: string | null;
  roles: Role[];
  is_super_admin: boolean;
  session_id: string;
};

export type ActorContext = {
  userId: string;
  activeSppgId: string | null;
  roles: Role[];
  isSuperAdmin: boolean;
  sessionId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

export type ApiErrorCode =
  | "INVALID_CREDENTIAL"
  | "USER_INACTIVE"
  | "SPPG_NOT_ASSIGNED"
  | "ASSIGNMENT_INACTIVE"
  | "ACTIVE_SPPG_REQUIRED"
  | "TENANT_SCOPE_VIOLATION"
  | "PERMISSION_DENIED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "STATE_TRANSITION_INVALID"
  | "PRECONDITION_FAILED"
  | "INSUFFICIENT_STOCK"
  | "ALREADY_VERIFIED"
  | "IDEMPOTENCY_CONFLICT"
  | "PERIOD_LOCKED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    request_id: string;
    timestamp: string;
  };
};
