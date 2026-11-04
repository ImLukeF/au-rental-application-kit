CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,                               -- uuid v4
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,         -- staff identity from Cloudflare Access
  role TEXT NOT NULL CHECK (role IN ('admin','agent')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE agency_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  details_json TEXT NOT NULL,          -- {name, acnOrAbn?, address, phone, email, providerStateOrTerritory} — the agency's own business details (VIC item 2), entered at runtime
  collection_notice_md TEXT NOT NULL,  -- APP 5-style notice shown before submit (template in §14.9)
  privacy_policy_url TEXT,
  retention_policy_json TEXT NOT NULL, -- RetentionPolicy, validated by @aurak/rules
  turnstile_required INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES staff_users(id)
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                         -- 12 chars base32 random; never derived from the address
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('VIC','NSW')),
  form_id TEXT NOT NULL,
  premises_address TEXT NOT NULL,                    -- property address (not renter info)
  agent_details_json TEXT NOT NULL,                  -- snapshot of item 2 at publish time
  requested_financial_json TEXT NOT NULL DEFAULT '[]',
  requested_identity_json TEXT NOT NULL DEFAULT '[]',
  identity_stage TEXT NOT NULL CHECK (identity_stage IN ('application','preferred')),
  referees_requested INTEGER NOT NULL DEFAULT 0 CHECK (referees_requested IN (0,1)),
  max_financial_docs INTEGER NOT NULL DEFAULT 2,
  tenancy_databases_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft','open','closed_leased','closed_withdrawn')),
  agreement_date TEXT,                               -- YYYY-MM-DD
  closed_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  group_code TEXT,                                   -- random 8-char code, links co-applicants
  form_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','shortlisted','preferred','id_requested','id_verified','successful','unsuccessful','withdrawn','purged')),
  payload_ct TEXT, payload_iv TEXT,                  -- AES-256-GCM of ApplicationPayloadV1 + doc manifest (filenames); NULL after purge
  applicant_token_hash TEXT,                         -- hex sha256(token); NULL after purge
  inspection_status TEXT CHECK (inspection_status IN ('inspected','unable','does_not_wish')),
  submitted_at TEXT NOT NULL,
  status_changed_at TEXT NOT NULL,
  intent_notice_at TEXT,                             -- NSW s 210E written notice recorded
  id_requested_at TEXT,
  id_verified_at TEXT,
  id_verification_method TEXT CHECK (id_verification_method IN ('sighted_in_person','document_review')),
  db_checked_at TEXT, db_listing_found INTEGER CHECK (db_listing_found IN (0,1)), db_notice_at TEXT, -- VIC s 439D
  tenancy_end_date TEXT,
  legal_deadline_at TEXT, purge_due_at TEXT, purge_rule_id TEXT,
  purged_at TEXT
);
CREATE INDEX idx_app_listing ON applications(listing_id);
CREATE INDEX idx_app_purge ON applications(purge_due_at) WHERE purged_at IS NULL;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  category TEXT NOT NULL CHECK (category IN ('financial','identity')),
  doc_type TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('application','identity_stage')),
  r2_key TEXT NOT NULL,                              -- docs/{applicationId}/{documentId}
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  byte_length INTEGER NOT NULL,
  ct_sha256 TEXT NOT NULL,
  iv TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  legal_deadline_at TEXT, purge_due_at TEXT NOT NULL, purge_rule_id TEXT NOT NULL,
  purged_at TEXT
);
CREATE INDEX idx_doc_purge ON documents(purge_due_at) WHERE purged_at IS NULL;

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  consent_id TEXT NOT NULL,                          -- e.g. 'vic_retain_for_other_premises@1'
  text_sha256 TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0,1)),
  recorded_at TEXT NOT NULL,
  withdrawn_at TEXT
);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  notice_type TEXT NOT NULL CHECK (notice_type IN ('nsw_210e_intent','id_request','vic_439d_database_listing','outcome')),
  body_ct TEXT NOT NULL, body_iv TEXT NOT NULL,      -- encrypted with the application DEK
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  delivery TEXT NOT NULL CHECK (delivery IN ('applicant_portal','manual'))
);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff','applicant','system')),
  actor_id TEXT,                                     -- staff_users.id; NULL for applicant/system
  action TEXT NOT NULL,                              -- AuditAction enum (§14.5)
  target_type TEXT NOT NULL CHECK (target_type IN ('listing','application','document','settings','staff_user','system')),
  target_id TEXT,
  rule_id TEXT,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','denied','error'))
);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

CREATE TABLE purge_receipts (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('application','document')),
  subject_id TEXT NOT NULL,
  listing_id TEXT,
  rule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  purged_at TEXT NOT NULL,
  r2_objects_deleted INTEGER NOT NULL,
  late INTEGER NOT NULL CHECK (late IN (0,1))
);
