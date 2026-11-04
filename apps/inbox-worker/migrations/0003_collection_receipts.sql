CREATE TABLE collection_receipts (
  application_id TEXT PRIMARY KEY REFERENCES applications(id),
  notice_sha256 TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
