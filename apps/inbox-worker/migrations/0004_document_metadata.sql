-- Late-stage identity uploads need an encrypted manifest outside the immutable form payload.
CREATE TABLE document_metadata (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  metadata_ct TEXT NOT NULL,
  metadata_iv TEXT NOT NULL
);
