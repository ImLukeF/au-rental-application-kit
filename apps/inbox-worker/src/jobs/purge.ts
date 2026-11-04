import { auditStatement } from "../domain/audit";
import type { Env } from "../env";
import { log } from "../log";
import type { StoredApplication, StoredDocument } from "../storage/ports";
export async function purgeApplication(env: Env, app: StoredApplication, at: string, requestId: string) {
  if (app.purged_at) return false;
  // Delete the only wrapped DEK before touching ciphertext or metadata. Retry never needs plaintext.
  await env.KEYS.delete(`app/${app.id}`);
  let objects = 0;
  while (true) {
    const page = await env.DOCS.list({ prefix: `docs/${app.id}/`, limit: 1000 });
    if (!page.objects.length) break;
    await env.DOCS.delete(page.objects.map((o) => o.key));
    objects += page.objects.length;
  }
  const due = app.purge_due_at ?? at;
  const rule = app.purge_rule_id ?? "CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED";
  const late = app.legal_deadline_at !== null && at > app.legal_deadline_at ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM collection_receipts WHERE application_id=?").bind(app.id),
    env.DB.prepare("DELETE FROM documents WHERE application_id=?").bind(app.id),
    env.DB.prepare("DELETE FROM consents WHERE application_id=?").bind(app.id),
    env.DB.prepare("DELETE FROM notices WHERE application_id=?").bind(app.id),
    env.DB.prepare("DELETE FROM application_messages WHERE application_id=?").bind(app.id),
    env.DB.prepare(
      "UPDATE applications SET payload_ct=NULL,payload_iv=NULL,applicant_token_hash=NULL,status='purged',purged_at=?,status_changed_at=? WHERE id=? AND purged_at IS NULL",
    ).bind(at, at, app.id),
    env.DB.prepare(
      "INSERT OR IGNORE INTO purge_receipts(id,subject_type,subject_id,listing_id,rule_id,due_at,purged_at,r2_objects_deleted,late) VALUES(?,'application',?,?,?,?,?,?,?)",
    ).bind(`application:${app.id}`, app.id, app.listing_id, rule, due, at, objects, late),
    auditStatement(
      env,
      "purge_application",
      { type: "system" },
      "application",
      app.id,
      requestId,
      at,
      "ok",
      rule,
    ),
  ]);
  return true;
}
export async function purgeDocument(env: Env, doc: StoredDocument, at: string, requestId: string) {
  if (doc.purged_at) return false;
  await env.DOCS.delete(doc.r2_key);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM document_metadata WHERE document_id=?").bind(doc.id),
    env.DB.prepare("UPDATE documents SET purged_at=? WHERE id=? AND purged_at IS NULL").bind(at, doc.id),
    env.DB.prepare(
      "INSERT OR IGNORE INTO purge_receipts(id,subject_type,subject_id,rule_id,due_at,purged_at,r2_objects_deleted,late) VALUES(?,'document',?,?,?,?,1,?)",
    ).bind(
      `document:${doc.id}`,
      doc.id,
      doc.purge_rule_id,
      doc.purge_due_at,
      at,
      doc.legal_deadline_at !== null && at > doc.legal_deadline_at ? 1 : 0,
    ),
    auditStatement(
      env,
      "purge_document",
      { type: "system" },
      "document",
      doc.id,
      requestId,
      at,
      "ok",
      doc.purge_rule_id,
    ),
  ]);
  return true;
}
export async function runPurge(
  env: Env,
  now: Date,
  requestId = crypto.randomUUID(),
): Promise<{ count: number; errors: number }> {
  const at = now.toISOString();
  let count = 0,
    errors = 0;
  const apps = (
    await env.DB.prepare(
      "SELECT * FROM applications WHERE purged_at IS NULL AND purge_due_at<=? ORDER BY purge_due_at LIMIT 5",
    )
      .bind(at)
      .all<StoredApplication>()
  ).results;
  for (const app of apps) {
    try {
      if (await purgeApplication(env, app, at, requestId)) count++;
    } catch {
      errors++;
      log({ type: "error", requestId, code: "purge_application_failed" });
    }
  }
  const docs = (
    await env.DB.prepare(
      "SELECT * FROM documents WHERE purged_at IS NULL AND purge_due_at<=? ORDER BY purge_due_at LIMIT 10",
    )
      .bind(at)
      .all<StoredDocument>()
  ).results;
  for (const doc of docs) {
    try {
      if (await purgeDocument(env, doc, at, requestId)) count++;
    } catch {
      errors++;
      log({ type: "error", requestId, code: "purge_document_failed" });
    }
  }
  log({ type: "purge", requestId, count, late: 0 });
  return { count, errors };
}
