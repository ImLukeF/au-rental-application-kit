# Security

The latest main branch is supported. This is new software; it has not received an independent security or legal review.

Use GitHub’s **Report a vulnerability** (private advisory) on this repository if enabled. Otherwise open an issue titled **Security contact request**, without technical details, personal data or credentials; a maintainer will arrange a private channel.

Security scope includes vault isolation, authentication/authorization, application/document disclosure, token handling, crypto, uploads, logs and deletion. Use synthetic data in reproductions. Avoid testing someone else’s live deployment.

Self-hosters own Access application policies/MFA, staff membership, a Workers Paid plan, offline encryption-key backups, jurisdiction notices, monitoring and retention. Use Oceania hints while disclosing possible offshore storage: they do not guarantee Australian residency. Never place keys in frontend variables. Use ignored local configuration, and never commit real IDs.

Per-application AES-GCM DEKs are wrapped with AES-KW using a KEK in Worker secrets; wrapped keys live in a separate R2 bucket. Unique IVs and application/purpose AAD prevent record swapping. Applicant tokens are random 256-bit values stored hashed and shared in URL fragments. The browser vault derives a non-extractable AES-GCM key using PBKDF2-SHA256 at 600,000 iterations.

Known limits: a compromised Worker with access to secrets can decrypt live data; device malware/XSS can access an unlocked vault; agencies can keep downloaded copies; deletion cannot recall those copies. D1 Time Travel retains ciphertext. R2 internal retention after deletion is UNVERIFIED; crypto-shredding is not a legal guarantee. Document-only deletion retains the application DEK for other records; a previously copied encrypted document may remain decryptable until that application key is destroyed. Unknown NSW law and form details are PROVISIONAL. Font support is incomplete. See [privacy design](docs/PRIVACY-DESIGN.md) and [legal questions](docs/LEGAL-QUESTIONS.md).
