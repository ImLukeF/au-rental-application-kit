import { agencySchema, listingSchema } from "@aurak/forms";
import type { RetentionPolicy } from "@aurak/rules";
import { DEFAULT_RETENTION, localToday, rulesVersion } from "@aurak/rules";
import type { Env } from "../env";
import { HttpError } from "../security/uploads";
import type { StoredApplication, StoredDocument, StoredListing } from "./ports";
export interface Settings {
  details: ReturnType<typeof agencySchema.parse>;
  collectionNoticeMd: string;
  privacyPolicyUrl: string | null;
  retentionPolicy: RetentionPolicy;
  turnstileRequired: boolean;
}
export const COLLECTION_NOTICE_TEMPLATE =
  "We collect the information in the application form to assess suitability for this property only. With your consent we may share it with the rental provider, referees and listed tenancy databases. We store encrypted information with Cloudflare; storage may be outside Australia. Unsuccessful applications are normally destroyed 14 days after agreement, successful files after a 30-day handoff, withdrawn files after 2 days, and identity copies immediately after verification or within 7 days. Use the applicant portal to access your information, request correction, withdraw or change optional retention consent. For complaints, contact us, then Consumer Affairs Victoria, NSW Fair Trading or the OAIC as applicable. Review this notice and our privacy policy before submitting.";
export async function getSettings(env: Env): Promise<Settings | null> {
  const row = await env.DB.prepare("SELECT * FROM agency_settings WHERE id=1").first<{
    details_json: string;
    collection_notice_md: string;
    privacy_policy_url: string | null;
    retention_policy_json: string;
    turnstile_required: number;
  }>();
  return row
    ? {
        details: agencySchema.parse(JSON.parse(row.details_json)),
        collectionNoticeMd: row.collection_notice_md,
        privacyPolicyUrl: row.privacy_policy_url,
        retentionPolicy: JSON.parse(row.retention_policy_json),
        turnstileRequired: row.turnstile_required === 1,
      }
    : null;
}
export async function retentionPolicy(env: Env) {
  return (await getSettings(env))?.retentionPolicy ?? DEFAULT_RETENTION;
}
export async function getListing(env: Env, id: string, bySlug = false): Promise<StoredListing> {
  const row = await env.DB.prepare(`SELECT * FROM listings WHERE ${bySlug ? "slug" : "id"}=?`)
    .bind(id)
    .first<StoredListing>();
  if (!row) throw new HttpError(404, "not_found");
  return row;
}
export async function publicListing(env: Env, row: StoredListing) {
  const settings = await getSettings(env);
  if (!settings) throw new HttpError(503, "agency_not_configured");
  return listingSchema.parse({
    schemaVersion: "aurak.listing-public.v1",
    slug: row.slug,
    jurisdiction: row.jurisdiction,
    formId: row.form_id,
    provisional: row.jurisdiction === "NSW",
    status: row.status,
    item1: { premisesAddress: row.premises_address },
    item2: JSON.parse(row.agent_details_json),
    financialRequested: JSON.parse(row.requested_financial_json),
    identityRequested: JSON.parse(row.requested_identity_json),
    identityStage: row.identity_stage,
    maxFinancialDocs: row.max_financial_docs,
    refereesRequested: row.referees_requested === 1,
    tenancyDatabases: JSON.parse(row.tenancy_databases_json),
    collectionNoticeMd: settings.collectionNoticeMd,
    privacyPolicyUrl: settings.privacyPolicyUrl,
    retentionSummary: {
      unsuccessfulDays: settings.retentionPolicy.unsuccessfulDays,
      successfulHandoffDays: settings.retentionPolicy.successfulHandoffDays,
    },
    turnstileSiteKey: settings.turnstileRequired ? env.TURNSTILE_SITE_KEY : null,
    rulesVersion: rulesVersion(),
  });
}
export async function getApplication(env: Env, id: string): Promise<StoredApplication> {
  const row = await env.DB.prepare("SELECT * FROM applications WHERE id=?")
    .bind(id)
    .first<StoredApplication>();
  if (!row) throw new HttpError(404, "not_found");
  return row;
}
export async function getDocuments(env: Env, id: string) {
  return (
    await env.DB.prepare("SELECT * FROM documents WHERE application_id=? ORDER BY uploaded_at,id")
      .bind(id)
      .all<StoredDocument>()
  ).results;
}
export function today(now: Date) {
  return localToday(now);
}
