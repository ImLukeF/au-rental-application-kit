import type { Env } from "../env";
export const AUDIT_ACTIONS = [
  "auth_denied",
  "list_applications",
  "view_application",
  "download_document",
  "export_application_json",
  "export_application_pdf_data",
  "transition",
  "create_notice",
  "record_db_check",
  "flag_improper",
  "purge_application",
  "purge_document",
  "settings_update",
  "staff_create",
  "staff_update",
  "listing_create",
  "listing_update",
  "listing_close",
  "rewrap_keys",
  "applicant_view",
  "applicant_export",
  "applicant_upload_identity",
  "applicant_withdraw",
  "applicant_consent_change",
  "submit_application",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export interface Actor {
  type: "staff" | "applicant" | "system";
  id?: string;
}
export function auditStatement(
  env: Env,
  action: AuditAction,
  actor: Actor,
  targetType: "listing" | "application" | "document" | "settings" | "staff_user" | "system",
  targetId: string | null,
  requestId: string,
  at: string,
  outcome: "ok" | "denied" | "error" = "ok",
  ruleId: string | null = null,
  condition?: { sql: string; args: unknown[] },
) {
  return env.DB.prepare(
    `INSERT INTO audit_events(id,at,actor_type,actor_id,action,target_type,target_id,rule_id,request_id,outcome) ${condition ? `SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${condition.sql}` : "VALUES(?,?,?,?,?,?,?,?,?,?)"}`,
  ).bind(
    crypto.randomUUID(),
    at,
    actor.type,
    actor.id ?? null,
    action,
    targetType,
    targetId,
    ruleId,
    requestId,
    outcome,
    ...(condition?.args ?? []),
  );
}
export async function audit(...args: Parameters<typeof auditStatement>) {
  await auditStatement(...args).run();
}
