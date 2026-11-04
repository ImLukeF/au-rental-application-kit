import { createScheduledController } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  base64url,
  decrypt,
  decryptBytes,
  encrypt,
  encryptBytes,
  newDataKey,
  randomBytes,
  sha256,
} from "@aurak/crypto";
import { buildPayload, listingSchema, profileSchema } from "@aurak/forms";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import rawListing from "../../../fixtures/listings/vic-listing.json";
import rawProfile from "../../../fixtures/profiles/vic-employed.json";
import worker from "../src";
import { createApp } from "../src/app";
import { AccessAuthenticator } from "../src/auth/access";
import { applicationKey, open, rewrapKeys } from "../src/crypto/envelope";
import { canTransition, STATES } from "../src/domain/stateMachine";
import type { Env } from "../src/env";
import { runPurge } from "../src/jobs/purge";
import { log } from "../src/log";
import { getApplication } from "../src/storage/repository";

const runtime = env as unknown as Env;
const fixed = new Date("2026-11-04T01:00:00.000Z");
const app = createApp({ now: () => fixed });
function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: {
      "X-Dev-User": "admin@example.com",
      ...(method !== "GET" ? { Origin: "http://127.0.0.1", "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
  bindings = runtime,
) {
  return app.fetch(request(path, method, body, headers), bindings);
}
async function setup(
  jurisdiction: "VIC" | "NSW" = "VIC",
  financial: string[] = ["payslip", "bank_statement_no_transactions"],
) {
  expect((await call("/api/agent/me")).status).toBe(200);
  expect(
    (
      await call("/api/agent/settings", "PUT", {
        details: rawListing.item2,
        collectionNoticeMd: rawListing.collectionNoticeMd,
        privacyPolicyUrl: null,
        retentionPolicy: {
          unsuccessfulDays: 14,
          keepConsentedUnsuccessful: false,
          successfulHandoffDays: 30,
          withdrawnDays: 2,
          listingWithdrawnDays: 14,
          identityDocMaxDays: 7,
        },
        turnstileRequired: false,
      })
    ).status,
  ).toBe(200);
  const r = await call("/api/agent/listings", "POST", {
    jurisdiction,
    premisesAddress: rawListing.item1.premisesAddress,
    financialRequested: financial,
    identityRequested: ["driver_licence"],
    identityStage: "preferred",
    maxFinancialDocs: jurisdiction === "NSW" ? 1 : 2,
    refereesRequested: false,
    tenancyDatabases: [],
  });
  expect(r.status).toBe(201);
  const listing = (await r.json()) as { id: string; slug: string };
  expect((await call(`/api/public/listings/${listing.slug}`)).status).toBe(404);
  expect((await call(`/api/agent/listings/${listing.id}/publish`, "POST", {})).status).toBe(200);
  return listing;
}
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nSAMPLE - NOT A REAL DOCUMENT\n");
async function submit(listing: { id: string; slug: string }, modify?: (body: any, form: FormData) => void) {
  const publicResponse = await call(`/api/public/listings/${listing.slug}`);
  const publicListing = listingSchema.parse(await publicResponse.json());
  const docs = publicListing.financialRequested.map((type, i) => ({
    docId: `doc${i}`,
    type,
    filename: `sample-${i}.pdf`,
    sha256: "",
    byteLength: pdfBytes.length,
    contentType: "application/pdf" as const,
  }));
  for (const doc of docs) doc.sha256 = await sha256(pdfBytes);
  const payload = buildPayload({
    profile: profileSchema.parse(rawProfile),
    listing: publicListing,
    documents: docs,
    selections: {
      financialDocIds: docs.map((d) => d.docId),
      identityDocIds: [],
      historyIds: ["0", "1"],
      refereeIds: [],
      inspection: { status: "inspected", inspectedOn: "2026-11-01" },
      consents: { "share_with_agency@1": true, "vic_retain_for_other_premises@1": true },
      signature: { printName: "Test Applicant One", date: "2026-11-04" },
    },
    on: "2026-11-04",
  });
  expect(payload.errors).toEqual([]);
  const body = {
    payload: payload.payload,
    consents: payload.payload!.consents.map(({ id, sha256, granted }) => ({ id, sha256, granted })),
    collectionNoticeSha256: await sha256(publicListing.collectionNoticeMd),
  };
  const form = new FormData();
  for (const [i, d] of docs.entries())
    form.append(`doc_${i}`, new File([pdfBytes], d.filename, { type: "application/pdf" }));
  modify?.(body, form);
  form.append("application", JSON.stringify(body));
  return app.fetch(
    new Request(`http://127.0.0.1/api/public/listings/${listing.slug}/applications`, {
      method: "POST",
      body: form,
    }),
    runtime,
  );
}
async function submitted() {
  const listing = await setup();
  const response = await submit(listing);
  expect(response.status).toBe(201);
  return {
    listing,
    ...((await response.json()) as {
      applicationId: string;
      applicantToken: string;
      portalPath: string;
      receipt: { documents: unknown[] };
    }),
  };
}
async function move(id: string, to: string, extra = {}) {
  return call(`/api/agent/applications/${id}/transition`, "POST", { to, ...extra });
}
describe("inbox runtime security", () => {
  it("runs the default Worker and WebCrypto in workerd", async () => {
    const r = await exports.default.fetch("http://127.0.0.1/api/health");
    expect(r.status).toBe(200);
    const key = await newDataKey(),
      plain = new Uint8Array([1, 2, 3]);
    expect(await decrypt(key, await encrypt(key, plain, "runtime"), "runtime")).toEqual(plain);
  });
  it("refuses missing auth, hostile dev auth, CSRF and non-admin settings", async () => {
    expect(
      (await app.fetch(request("/api/agent/me", "GET", undefined, { "X-Dev-User": "" }), runtime)).status,
    ).toBe(403);
    expect((await app.fetch(new Request("https://agency.example.com/api/agent/me"), runtime)).status).toBe(
      500,
    );
    expect(
      (await call("/api/agent/me", "GET", undefined, {}, { ...runtime, ENVIRONMENT: "production" })).status,
    ).toBe(500);
    await call("/api/agent/me");
    expect(
      (
        await app.fetch(
          new Request("http://127.0.0.1/api/agent/listings", {
            method: "POST",
            headers: { "X-Dev-User": "admin@example.com", "Content-Type": "application/json" },
            body: "{}",
          }),
          runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("/api/agent/staff", "POST", { email: "agent@example.com", role: "agent" })).status,
    ).toBe(201);
    expect(
      (await call("/api/agent/settings", "GET", undefined, { "X-Dev-User": "agent@example.com" })).status,
    ).toBe(403);
    expect(
      (
        await runtime.DB.prepare("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin'").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
  it("verifies Access signatures, audience, issuer and registered staff with injected JWKS", async () => {
    const keys = await generateKeyPair("RS256"),
      jwk = await exportJWK(keys.publicKey);
    jwk.kid = "test";
    const resolver = createLocalJWKSet({ keys: [jwk] });
    const auth = new AccessAuthenticator("https://example.cloudflareaccess.com", "expected", resolver);
    const token = await new SignJWT({ email: "admin@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://example.cloudflareaccess.com")
      .setAudience("wrong")
      .setExpirationTime("1h")
      .sign(keys.privateKey);
    expect(
      await auth.authenticate(
        new Request("https://example.com", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      ),
    ).toBeNull();
    const good = await new SignJWT({ email: "unknown@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://example.cloudflareaccess.com")
      .setAudience("expected")
      .setExpirationTime("1h")
      .sign(keys.privateKey);
    expect(
      await auth.authenticate(
        new Request("https://example.com", { headers: { "Cf-Access-Jwt-Assertion": good } }),
      ),
    ).toEqual({ email: "unknown@example.com" });
    const secured = createApp({ staffAuthenticator: auth });
    expect(
      (
        await secured.fetch(
          request("/api/agent/me", "GET", undefined, { "Cf-Access-Jwt-Assertion": good }),
          runtime,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects excessive VIC documents and NSW collection at application stage", async () => {
    await setup();
    const base = {
      jurisdiction: "VIC",
      premisesAddress: rawListing.item1.premisesAddress,
      financialRequested: [],
      identityRequested: ["driver_licence", "medicare_card", "australian_passport"],
      identityStage: "preferred",
      maxFinancialDocs: 2,
    };
    const vic = await call("/api/agent/listings", "POST", base);
    expect(vic.status).toBe(422);
    expect(await vic.json()).toMatchObject({ ruleIds: ["VIC.DOCS.IDENTITY_MAX_TWO"] });
    expect(
      (
        await call("/api/agent/listings", "POST", {
          ...base,
          jurisdiction: "NSW",
          identityRequested: ["driver_licence"],
          identityStage: "application",
        })
      ).status,
    ).toBe(422);
  });
  it("stores ciphertext, a separate wrapped DEK, accurate receipt and an append-only audit", async () => {
    const data = await submitted();
    const row = await getApplication(runtime, data.applicationId);
    expect(row.payload_ct).not.toContain("Test Applicant One");
    expect(row.payload_iv).toBeTruthy();
    expect(await runtime.KEYS.get(`app/${data.applicationId}`)).not.toBeNull();
    const docs = await runtime.DB.prepare("SELECT r2_key FROM documents WHERE application_id=?")
      .bind(data.applicationId)
      .all<{ r2_key: string }>();
    const stored = new Uint8Array(await (await runtime.DOCS.get(docs.results[0]!.r2_key))!.arrayBuffer());
    expect(stored).not.toEqual(pdfBytes);
    expect(data.receipt.documents).toHaveLength(2);
    expect(
      (
        await runtime.DB.prepare(
          "SELECT COUNT(*) AS n FROM audit_events WHERE action='submit_application'",
        ).first<{ n: number }>()
      )?.n,
    ).toBe(1);
    await expect(runtime.DB.prepare("UPDATE audit_events SET outcome='error'").run()).rejects.toThrow();
  });
  it("rejects unknown fields, extra attachments, magic mismatch, oversized files and closed listings", async () => {
    const listing = await setup();
    expect(
      (
        await submit(listing, (b) => {
          b.payload.extra = "x";
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await submit(listing, (_b, f) => {
          f.append("doc_9", new File([pdfBytes], "extra.pdf", { type: "application/pdf" }));
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await submit(listing, (_b, f) => {
          f.set("doc_0", new File(["wrong"], "bad.pdf", { type: "application/pdf" }));
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await submit(listing, (_b, f) => {
          f.set(
            "doc_0",
            new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }),
          );
        })
      ).status,
    ).toBe(413);
    expect(
      (await call(`/api/agent/listings/${listing.id}/close`, "POST", { outcome: "withdrawn" })).status,
    ).toBe(200);
    expect((await submit(listing)).status).toBe(409);
  });
  it("audits plaintext reads and sends safe attachment/security headers", async () => {
    const data = await submitted();
    const view = await call(`/api/agent/applications/${data.applicationId}`);
    expect(view.status).toBe(200);
    const document = ((await view.json()) as { documents: { id: string }[] }).documents[0]!;
    const response = await call(`/api/agent/applications/${data.applicationId}/documents/${document.id}`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(
      (
        await runtime.DB.prepare(
          "SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('view_application','download_document')",
        ).first<{ n: number }>()
      )?.n,
    ).toBe(2);
  });
  it("exhaustively encodes every valid and invalid state edge", () => {
    const expected = new Set([
      "submitted:shortlisted",
      "submitted:unsuccessful",
      "submitted:withdrawn",
      "shortlisted:preferred",
      "shortlisted:unsuccessful",
      "shortlisted:withdrawn",
      "preferred:id_requested",
      "preferred:unsuccessful",
      "preferred:withdrawn",
      "id_requested:id_verified",
      "id_requested:unsuccessful",
      "id_requested:withdrawn",
      "id_verified:successful",
      "id_verified:unsuccessful",
      "id_verified:withdrawn",
      "successful:purged",
      "unsuccessful:purged",
      "withdrawn:purged",
    ]);
    for (const from of STATES)
      for (const to of STATES) expect(canTransition(from, to)).toBe(expected.has(`${from}:${to}`));
    expect(canTransition("submitted", "successful")).toBe(false);
    expect(canTransition("purged", "submitted")).toBe(false);
  });
  it("blocks premature ID, rotates portal token on prior notice and purges ID on verification", async () => {
    const data = await submitted();
    const identityRequest = () => {
      const f = new FormData();
      f.append(
        "application",
        JSON.stringify({
          documents: [
            { part: "doc_0", category: "identity", type: "driver_licence", filename: "sample-id.pdf" },
          ],
        }),
      );
      f.append("doc_0", new File([pdfBytes], "sample-id.pdf", { type: "application/pdf" }));
      return f;
    };
    const upload = (token: string) =>
      app.fetch(
        new Request(`http://127.0.0.1/api/applicant/applications/${data.applicationId}/identity-documents`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: identityRequest(),
        }),
        runtime,
      );
    expect((await upload(data.applicantToken)).status).toBe(403);
    expect((await move(data.applicationId, "successful")).status).toBe(409);
    expect((await move(data.applicationId, "shortlisted")).status).toBe(200);
    expect((await move(data.applicationId, "preferred")).status).toBe(200);
    expect((await move(data.applicationId, "id_requested")).status).toBe(422);
    const invitation = await move(data.applicationId, "id_requested", {
      notice: {
        body: "We intend to enter into an agreement subject to verifying your identity. Please provide one driver licence.",
      },
    });
    expect(invitation.status).toBe(200);
    const token = ((await invitation.json()) as { applicantToken: string }).applicantToken;
    expect((await upload(data.applicantToken)).status).toBe(401);
    expect((await upload(token)).status).toBe(201);
    expect(
      (await move(data.applicationId, "id_verified", { verificationMethod: "document_review" })).status,
    ).toBe(200);
    const doc = await runtime.DB.prepare(
      "SELECT * FROM documents WHERE application_id=? AND category='identity'",
    )
      .bind(data.applicationId)
      .first<{ r2_key: string; purged_at: string }>();
    expect(doc?.purged_at).toBeTruthy();
    expect(await runtime.DOCS.get(doc!.r2_key)).toBeNull();
    expect(
      (
        await runtime.DB.prepare("SELECT COUNT(*) AS n FROM notices WHERE application_id=?")
          .bind(data.applicationId)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });
  it("closes leased listings with correct legal and policy deadlines", async () => {
    const winner = await submitted();
    const loserResponse = await submit(winner.listing),
      loser = (await loserResponse.json()) as { applicationId: string; applicantToken: string };
    for (const to of ["shortlisted", "preferred"])
      expect((await move(winner.applicationId, to)).status).toBe(200);
    expect(
      (
        await move(winner.applicationId, "id_requested", {
          notice: { body: "We intend to enter into an agreement subject to identity verification." },
        })
      ).status,
    ).toBe(200);
    expect(
      (await move(winner.applicationId, "id_verified", { verificationMethod: "sighted_in_person" })).status,
    ).toBe(200);
    expect((await move(winner.applicationId, "successful")).status).toBe(200);
    expect(
      (
        await call(`/api/agent/listings/${winner.listing.id}/close`, "POST", {
          outcome: "leased",
          agreementDate: "2026-11-10",
          successfulApplicationIds: [winner.applicationId],
        })
      ).status,
    ).toBe(200);
    expect(await getApplication(runtime, loser.applicationId)).toMatchObject({
      status: "unsuccessful",
      legal_deadline_at: "2027-05-10T00:00:00.000Z",
      purge_due_at: "2026-11-24T00:00:00.000Z",
    });
    expect(
      (
        await call(
          `/api/applicant/applications/${loser.applicationId}/consents`,
          "POST",
          { id: "vic_retain_for_other_premises@1", granted: false },
          { Authorization: `Bearer ${loser.applicantToken}` },
        )
      ).status,
    ).toBe(200);
    expect(await getApplication(runtime, loser.applicationId)).toMatchObject({
      legal_deadline_at: "2026-12-10T00:00:00.000Z",
      purge_due_at: "2026-11-24T00:00:00.000Z",
    });
  });
  it("purges from cron idempotently, retries partial failures, and makes saved ciphertext unusable", async () => {
    const data = await submitted(),
      saved = await getApplication(runtime, data.applicationId);
    await runtime.DB.prepare("UPDATE applications SET purge_due_at=?,legal_deadline_at=? WHERE id=?")
      .bind("2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", saved.id)
      .run();
    const failing = {
      ...runtime,
      DOCS: new Proxy(runtime.DOCS, {
        get(target, key) {
          if (key === "delete")
            return () => {
              throw new Error("synthetic_failure");
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    expect((await runPurge(failing, fixed)).errors).toBe(1);
    expect(await runtime.KEYS.get(`app/${saved.id}`)).toBeNull();
    await expect(applicationKey(runtime, saved.id)).rejects.toThrow("key_destroyed");
    await worker.scheduled(
      createScheduledController({ scheduledTime: fixed.getTime(), cron: "17 * * * *" }),
      runtime,
    );
    const row = await getApplication(runtime, saved.id);
    expect(row).toMatchObject({
      status: "purged",
      payload_ct: null,
      payload_iv: null,
      applicant_token_hash: null,
    });
    expect((await runtime.DOCS.list({ prefix: `docs/${saved.id}/` })).objects).toHaveLength(0);
    expect(
      (
        await runtime.DB.prepare("SELECT late FROM purge_receipts WHERE subject_id=?")
          .bind(saved.id)
          .first<{ late: number }>()
      )?.late,
    ).toBe(1);
    expect((await runPurge(runtime, fixed)).count).toBe(0);
    await expect(
      open(runtime, saved.id, "payload", { ct: saved.payload_ct!, iv: saved.payload_iv! }),
    ).rejects.toThrow();
  });
  it("requires a portal token, supports encrypted corrections and schedules withdrawal", async () => {
    const data = await submitted();
    expect((await call(`/api/applicant/applications/${data.applicationId}`)).status).toBe(401);
    const headers = { Authorization: `Bearer ${data.applicantToken}` };
    expect(
      (await call(`/api/applicant/applications/${data.applicationId}/export`, "GET", undefined, headers))
        .status,
    ).toBe(200);
    expect(
      (
        await call(
          `/api/applicant/applications/${data.applicationId}/messages`,
          "POST",
          { kind: "correction_request", text: "Please correct the fixture details." },
          headers,
        )
      ).status,
    ).toBe(201);
    const response = await call(
      `/api/applicant/applications/${data.applicationId}/withdraw`,
      "POST",
      {},
      headers,
    );
    expect(response.status).toBe(200);
    expect(await getApplication(runtime, data.applicationId)).toMatchObject({
      status: "withdrawn",
      purge_due_at: "2026-11-06T01:00:00.000Z",
    });
  });
  it("rewraps KEKs while preserving data and drops unknown log fields", async () => {
    const data = await submitted();
    const rotated = { ...runtime, ACTIVE_KEK_ID: "v2", DATA_KEK_V2: base64url(randomBytes(32)) };
    expect(await rewrapKeys(rotated)).toBe(1);
    const withoutOld = { ...rotated, DATA_KEK_V1: "" };
    expect(await applicationKey(withoutOld, data.applicationId)).toBeTruthy();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log({
      type: "error",
      requestId: "fixture",
      code: "sample",
      email: "applicant1@example.com",
      payload: rawProfile,
    } as never);
    expect(spy.mock.calls.flat().join("")).not.toContain("applicant1@example.com");
    expect(spy.mock.calls.flat().join("")).not.toContain("Test Applicant One");
    spy.mockRestore();
  });
});
it("keeps renter PII out of the real application table and applies headers to assets", async () => {
  const columns = (
    await runtime.DB.prepare("PRAGMA table_info(applications)").all<{ name: string }>()
  ).results.map((c) => c.name);
  expect(columns).toEqual([
    "id",
    "listing_id",
    "group_code",
    "form_id",
    "rules_version",
    "status",
    "payload_ct",
    "payload_iv",
    "applicant_token_hash",
    "inspection_status",
    "submitted_at",
    "status_changed_at",
    "intent_notice_at",
    "id_requested_at",
    "id_verified_at",
    "id_verification_method",
    "db_checked_at",
    "db_listing_found",
    "db_notice_at",
    "tenancy_end_date",
    "legal_deadline_at",
    "purge_due_at",
    "purge_rule_id",
    "purged_at",
  ]);
  const response = await call("/");
  expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});
it("keeps NSW identity out of submission and only uses injected Turnstile verification", async () => {
  const listing = await setup("NSW", []);
  expect(
    (
      await submit(listing, (b) => {
        b.payload.applicant.nsw.identityDocuments = [];
      })
    ).status,
  ).toBe(422);
  await runtime.DB.prepare("UPDATE agency_settings SET turnstile_required=1").run();
  const verifier = { verify: vi.fn(async () => false) };
  const protectedApp = createApp({ turnstileVerifier: verifier, now: () => fixed });
  const publicListing = listingSchema.parse(
    await (await call(`/api/public/listings/${listing.slug}`)).json(),
  );
  const result = buildPayload({
    profile: profileSchema.parse(rawProfile),
    listing: publicListing,
    selections: {
      financialDocIds: [],
      identityDocIds: [],
      historyIds: ["0"],
      refereeIds: [],
      consents: { "share_with_agency@1": true },
      inspection: { status: "inspected", inspectedOn: "2026-11-01" },
      signature: { printName: "Test Applicant One", date: "2026-11-04" },
    },
    on: "2026-11-04",
  });
  const form = new FormData();
  form.append(
    "application",
    JSON.stringify({
      payload: result.payload,
      consents: result.payload!.consents.map(({ id, sha256, granted }) => ({ id, sha256, granted })),
      collectionNoticeSha256: await sha256(publicListing.collectionNoticeMd),
      turnstileToken: "synthetic-fixture",
    }),
  );
  const response = await protectedApp.fetch(
    new Request(`http://127.0.0.1/api/public/listings/${listing.slug}/applications`, {
      method: "POST",
      body: form,
    }),
    runtime,
  );
  expect(response.status).toBe(403);
  expect(verifier.verify).toHaveBeenCalledWith("synthetic-fixture");
});

it("encrypts the maximum file-size boundary as bytes in workerd", async () => {
  const key = await newDataKey();
  const input = new Uint8Array(10 * 1024 * 1024).fill(7);
  const sealed = await encryptBytes(key, input, "aurak:v1:fixture:doc:max");
  expect(sealed.bytes.length).toBe(input.length + 16);
  const plain = await decryptBytes(key, sealed, "aurak:v1:fixture:doc:max");
  expect(plain.length).toBe(input.length);
  expect(plain[plain.length - 1]).toBe(7);
});
it("atomically rolls back a status change if its mandatory audit write fails", async () => {
  const data = await submitted();
  await runtime.DB.exec(
    "CREATE TRIGGER reject_transition_audit BEFORE INSERT ON audit_events WHEN NEW.action='transition' BEGIN SELECT RAISE(ABORT, 'synthetic_audit_failure'); END;",
  );
  expect((await move(data.applicationId, "shortlisted")).status).toBe(500);
  expect((await getApplication(runtime, data.applicationId)).status).toBe("submitted");
});
