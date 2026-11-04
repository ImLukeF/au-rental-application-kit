-- Correction requests were required by the plan but absent from its initial table list.
CREATE TABLE application_messages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  kind TEXT NOT NULL CHECK (kind = 'correction_request'),
  body_ct TEXT NOT NULL,
  body_iv TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_message_application ON application_messages(application_id);
