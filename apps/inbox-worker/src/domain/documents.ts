import { encrypt, fromBase64url, sha256 } from "@aurak/crypto";
import type { DocumentRef } from "@aurak/forms";
import { computeRetention, type ISODate, type RetentionPolicy } from "@aurak/rules";
import { aad, applicationKey, seal } from "../crypto/envelope";
import type { Env } from "../env";
import { checkFile, HttpError } from "../security/uploads";
export async function persistDocument(
  env: Env,
  applicationId: string,
  reference: DocumentRef,
  file: File,
  category: "financial" | "identity",
  stage: "application" | "identity_stage",
  jurisdiction: "VIC" | "NSW",
  now: Date,
  policy: RetentionPolicy,
  applicationDue: string,
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkFile(bytes, file.type);
  if (
    reference.byteLength !== bytes.length ||
    reference.sha256 !== (await sha256(bytes)) ||
    reference.contentType !== file.type
  )
    throw new HttpError(422, "document_manifest_mismatch");
  const id = crypto.randomUUID();
  const encrypted = await encrypt(
    await applicationKey(env, applicationId),
    bytes,
    aad(applicationId, `doc:${id}`),
  );
  const ciphertext = fromBase64url(encrypted.ct);
  const key = `docs/${applicationId}/${id}`;
  const ctHash = await sha256(ciphertext);
  await env.DOCS.put(key, ciphertext, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { v: "1", iv: encrypted.iv, docType: reference.type, category },
  });
  const retention =
    category === "identity"
      ? computeRetention(
          { kind: "identity_document", uploadedAt: now.toISOString() },
          jurisdiction,
          now.toISOString().slice(0, 10) as ISODate,
          {},
          policy,
        )
      : {
          legalDeadline: null,
          policyDeadline: applicationDue,
          ruleIds: ["CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED"],
        };
  const metadata = await seal(env, applicationId, `doc-meta:${id}`, reference);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO documents(id,application_id,category,doc_type,stage,r2_key,content_type,byte_length,ct_sha256,iv,uploaded_at,legal_deadline_at,purge_due_at,purge_rule_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      applicationId,
      category,
      reference.type,
      stage,
      key,
      file.type,
      bytes.length,
      ctHash,
      encrypted.iv,
      now.toISOString(),
      retention.legalDeadline,
      retention.policyDeadline,
      retention.ruleIds[0]!,
    ),
    env.DB.prepare("INSERT INTO document_metadata(document_id,metadata_ct,metadata_iv) VALUES(?,?,?)").bind(
      id,
      metadata.ct,
      metadata.iv,
    ),
  ]);

  return { id, ...reference, category };
}
