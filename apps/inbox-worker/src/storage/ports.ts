import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
export interface MetadataStore {
  prepare: D1Database["prepare"];
  batch: D1Database["batch"];
}
export interface BlobStore {
  get: R2Bucket["get"];
  put: R2Bucket["put"];
  delete: R2Bucket["delete"];
  list: R2Bucket["list"];
}
export interface StoredApplication {
  id: string;
  listing_id: string;
  group_code: string | null;
  form_id: string;
  rules_version: string;
  status: import("../domain/stateMachine").Status;
  payload_ct: string | null;
  payload_iv: string | null;
  applicant_token_hash: string | null;
  submitted_at: string;
  status_changed_at: string;
  intent_notice_at: string | null;
  id_requested_at: string | null;
  id_verified_at: string | null;
  id_verification_method: string | null;
  db_checked_at: string | null;
  db_listing_found: number | null;
  db_notice_at: string | null;
  tenancy_end_date: string | null;
  legal_deadline_at: string | null;
  purge_due_at: string | null;
  purge_rule_id: string | null;
  purged_at: string | null;
}
export interface StoredDocument {
  id: string;
  application_id: string;
  category: "financial" | "identity";
  doc_type: string;
  stage: string;
  r2_key: string;
  content_type: string;
  byte_length: number;
  ct_sha256: string;
  iv: string;
  uploaded_at: string;
  legal_deadline_at: string | null;
  purge_due_at: string;
  purge_rule_id: string;
  purged_at: string | null;
}
export interface StoredListing {
  id: string;
  slug: string;
  jurisdiction: "VIC" | "NSW";
  form_id: string;
  premises_address: string;
  agent_details_json: string;
  requested_financial_json: string;
  requested_identity_json: string;
  identity_stage: "application" | "preferred";
  referees_requested: number;
  max_financial_docs: number;
  tenancy_databases_json: string;
  status: "draft" | "open" | "closed_leased" | "closed_withdrawn";
  agreement_date: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface Staff {
  id: string;
  email: string;
  role: "admin" | "agent";
  disabled: number;
  created_at: string;
}
