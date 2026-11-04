import { base64url, decrypt, fromBase64url, randomBytes, randomToken, sha256 } from "@aurak/crypto";
import type { ApplicationExportV1 } from "@aurak/forms";
import {
  agencySchema,
  allDocumentTypes,
  applicationSchema,
  databaseSchema,
  dateSchema,
  documentRefSchema,
  documentRefs,
  validatePayloadForListing,
} from "@aurak/forms";
import type { ISODate, RetentionEvent, RetentionPolicy } from "@aurak/rules";
import {
  canCollectIdentityDocuments,
  computeRetention,
  DEFAULT_RETENTION,
  listRules,
  localToday,
  retentionPolicySchema,
  rulesVersion,
  validateListingRequest,
  validateRetentionPolicy,
} from "@aurak/rules";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  AccessAuthenticator,
  CloudflareTurnstile,
  DevAuthenticator,
  type StaffAuthenticator,
  type TurnstileVerifier,
} from "./auth/access";
import { aad, applicationKey, createApplicationKey, open, rewrapKeys, seal } from "./crypto/envelope";
import { type Actor, audit, auditStatement } from "./domain/audit";
import { persistDocument } from "./domain/documents";
import { canTransition, FINAL_STATES, STATES, TRANSITIONS } from "./domain/stateMachine";
import type { Env } from "./env";
import { validateEnv } from "./env";
import { purgeApplication, purgeDocument } from "./jobs/purge";
import { log } from "./log";
import { boundedBody, HttpError, MAX_PAYLOAD, multipart } from "./security/uploads";
import type { Staff, StoredApplication, StoredDocument, StoredListing } from "./storage/ports";
import {
  COLLECTION_NOTICE_TEMPLATE,
  getApplication,
  getDocuments,
  getListing,
  getSettings,
  publicListing,
  retentionPolicy,
} from "./storage/repository";

interface Dependencies {
  staffAuthenticator?: StaffAuthenticator;
  turnstileVerifier?: TurnstileVerifier;
  now?: () => Date;
}
type Ctx = { Bindings: Env; Variables: { requestId: string; staff: Staff; application: StoredApplication } };
const _jsonHeaders = { "Content-Type": "application/json" };
const listingInput = z.strictObject({
  jurisdiction: z.enum(["VIC", "NSW"]),
  premisesAddress: z.string().min(5).max(200),
  financialRequested: z.array(z.enum(allDocumentTypes)).max(10),
  identityRequested: z.array(z.enum(allDocumentTypes)).max(10),
  identityStage: z.enum(["application", "preferred"]).default("preferred"),
  maxFinancialDocs: z.number().int().min(0).max(10).default(2),
  refereesRequested: z.boolean().default(false),
  tenancyDatabases: z.array(databaseSchema).max(10).default([]),
  providerType: z.string().optional(),
  programType: z.string().optional(),
});
const settingsInput = z.strictObject({
  details: agencySchema,
  collectionNoticeMd: z.string().min(20).max(12000),
  privacyPolicyUrl: z.url().nullable(),
  retentionPolicy: retentionPolicySchema,
  turnstileRequired: z.boolean(),
});
const submissionInput = z.strictObject({
  payload: applicationSchema,
  consents: z.array(z.strictObject({ id: z.string(), sha256: z.string(), granted: z.boolean() })).max(5),
  collectionNoticeSha256: z.string().regex(/^[a-f\d]{64}$/),
  groupCode: z
    .string()
    .regex(/^[A-Z2-7]{8}$/)
    .optional(),
  turnstileToken: z.string().max(2048).optional(),
});
const asObject = <T>(value: unknown, schema: z.ZodType<T>): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(
      422,
      "validation_failed",
      parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    );
  return parsed.data;
};
async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HttpError(415, "json_required");
  try {
    return asObject(JSON.parse(new TextDecoder().decode(await boundedBody(req, MAX_PAYLOAD))), schema);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "invalid_json");
  }
}
function parseJson(text: FormDataEntryValue | null): unknown {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_PAYLOAD)
    throw new HttpError(422, "invalid_application");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, "invalid_application");
  }
}
function slug() {
  const chars = "abcdefghijklmnopqrstuvwxyz234567";
  return Array.from(randomBytes(12), (n) => chars[n % 32]).join("");
}
async function readPayload(env: Env, row: StoredApplication): Promise<ApplicationExportV1> {
  if (!row.payload_ct || !row.payload_iv || row.purged_at)
    throw new HttpError(410, "application_unavailable");
  return open(env, row.id, "payload", { iv: row.payload_iv, ct: row.payload_ct });
}
function pageCursor(offset: number) {
  return base64url(new TextEncoder().encode(JSON.stringify({ offset })));
}
function pageParams(url: URL) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get("limit")) || 25)));
  const value = url.searchParams.get("cursor");
  let cursor = 0;
  if (value) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(fromBase64url(value)));
      if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > 1e9) throw new Error();
      cursor = parsed.offset;
    } catch {
      throw new HttpError(422, "invalid_cursor");
    }
  }
  return { limit, cursor };
}

export function createApp(deps: Dependencies = {}) {
  const app = new Hono<Ctx>();
  const now = () => deps.now?.() ?? new Date();
  const at = () => now().toISOString();
  app.use("*", async (c, next) => {
    const start = Date.now(),
      requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    const invalid = validateEnv(c.env, new URL(c.req.url).hostname);
    if (invalid.length) {
      c.res = c.json({ error: "misconfigured", missing: invalid }, 500);
    } else await next();
    const origins = (c.env.RENTER_APP_ORIGINS ?? "").split(",").filter(Boolean);
    const turnstile = !!c.env.TURNSTILE_SECRET_KEY;
    const csp = `default-src 'self'; script-src 'self'${turnstile ? " https://challenges.cloudflare.com" : ""}; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${origins.join(" ")}; frame-src ${turnstile ? "https://challenges.cloudflare.com" : "'none'"}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
    for (const [key, value] of Object.entries({
      "X-Request-Id": requestId,
      "Content-Security-Policy": c.res.headers.get("Content-Disposition") ? "sandbox" : csp,
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    }))
      c.header(key, value);
    if (new URL(c.req.url).pathname.startsWith("/api/")) c.header("Cache-Control", "no-store");
    log({
      type: "request",
      requestId,
      route: c.req.routePath ?? "unmatched",
      status: c.res.status,
      ms: Date.now() - start,
    });
  });
  app.onError((error, c) => {
    if (error instanceof HttpError)
      return c.json(
        {
          error: error.code,
          ...(error.details ? { details: error.details } : {}),
          ...(error.ruleIds ? { ruleIds: error.ruleIds } : {}),
        },
        error.status as 400,
      );
    log({ type: "error", requestId: c.get("requestId"), code: "internal_error" });
    return c.json({ error: "internal_error" }, 500);
  });
  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    const cors = path.startsWith("/api/public/") || path.startsWith("/api/applicant/");
    const origin = c.req.header("Origin");
    if (cors && origin) {
      const allowed =
        origin === new URL(c.req.url).origin || (c.env.RENTER_APP_ORIGINS ?? "").split(",").includes(origin);
      if (!allowed) throw new HttpError(403, "origin_denied");
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (c.req.method === "OPTIONS") return c.body(null, 204);
    }
    await next();
  });
  async function staffAuth(c: Context<Ctx>, next: () => Promise<void>) {
    const auth =
      deps.staffAuthenticator ??
      (c.env.AUTH_MODE === "dev-insecure"
        ? new DevAuthenticator()
        : new AccessAuthenticator(c.env.ACCESS_TEAM_DOMAIN!, c.env.ACCESS_AUD!));
    const identity = await auth.authenticate(c.req.raw);
    let staff: Staff | null = null;
    if (identity) {
      staff = await c.env.DB.prepare("SELECT * FROM staff_users WHERE email=? COLLATE NOCASE")
        .bind(identity.email)
        .first<Staff>();
      if (!staff && !c.env.BOOTSTRAP_ADMIN_EMAIL && c.env.AUTH_MODE === "dev-insecure")
        c.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
      if (!staff && identity.email.toLowerCase() === c.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase()) {
        await c.env.DB.prepare(
          "INSERT INTO staff_users(id,email,role,disabled,created_at) SELECT ?,?,'admin',0,? WHERE NOT EXISTS(SELECT 1 FROM staff_users)",
        )
          .bind(crypto.randomUUID(), identity.email, at())
          .run();
        staff = await c.env.DB.prepare("SELECT * FROM staff_users WHERE email=? COLLATE NOCASE")
          .bind(identity.email)
          .first<Staff>();
      }
    }
    if (!staff || staff.disabled) {
      await audit(
        c.env,
        "auth_denied",
        { type: "system" },
        "system",
        null,
        c.get("requestId"),
        at(),
        "denied",
      );
      throw new HttpError(403, "forbidden");
    }
    c.set("staff", staff);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (c.req.header("Origin") !== new URL(c.req.url).origin) throw new HttpError(403, "csrf_denied");
      if (!c.req.header("Content-Type")?.startsWith("application/json"))
        throw new HttpError(415, "json_required");
    }
    await next();
  }
  app.use("/api/agent/*", staffAuth);
  const assetAuth: import("hono").MiddlewareHandler<Ctx> = (c, next) =>
    c.env.AUTH_MODE === "dev-insecure" ? next() : staffAuth(c, next);
  app.use("/agent", assetAuth);
  app.use("/agent/*", assetAuth);
  app.use("/api/applicant/*", async (c, next) => {
    const id = new URL(c.req.url).pathname.split("/")[4];
    if (!id) throw new HttpError(401, "invalid_token");
    const bearer = c.req.header("Authorization");
    if (!bearer?.startsWith("Bearer ") || bearer.length !== 50) throw new HttpError(401, "invalid_token");
    let row: StoredApplication;
    try {
      row = await getApplication(c.env, id);
    } catch {
      throw new HttpError(401, "invalid_token");
    }
    if (
      !row.applicant_token_hash ||
      (await sha256(bearer.slice(7))) !== row.applicant_token_hash ||
      row.purged_at
    )
      throw new HttpError(401, "invalid_token");
    if (c.env.PUBLIC_LIMITER && !(await c.env.PUBLIC_LIMITER.limit({ key: `portal:${id}` })).success)
      throw new HttpError(429, "rate_limited");
    c.set("application", row);
    await next();
  });
  const admin = (c: { get: (key: "staff") => Staff }) => {
    if (c.get("staff").role !== "admin") throw new HttpError(403, "admin_required");
  };
  const actor = (staff: Staff): Actor => ({ type: "staff", id: staff.id });
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      version: "0.1.0",
      rulesVersion: rulesVersion(),
      devAuth: c.env.ENVIRONMENT === "development" && c.env.AUTH_MODE === "dev-insecure",
    }),
  );
  app.get("/api/public/listings/:slug", async (c) => {
    const row = await getListing(c.env, c.req.param("slug"), true);
    if (row.status === "draft") throw new HttpError(404, "not_found");
    return c.json(await publicListing(c.env, row));
  });
  app.post("/api/public/listings/:slug/applications", async (c) => {
    const row = await getListing(c.env, c.req.param("slug"), true);
    if (row.status !== "open") throw new HttpError(409, "listing_closed");
    if (c.env.PUBLIC_LIMITER) {
      if (!(await c.env.PUBLIC_LIMITER.limit({ key: `submit:${row.slug}` })).success)
        throw new HttpError(429, "rate_limited");
    } else log({ type: "error", requestId: c.get("requestId"), code: "rate_limiter_unavailable" });
    const form = await multipart(c.req.raw);
    const input = asObject(parseJson(form.get("application")), submissionInput);
    const listing = await publicListing(c.env, row);
    const violations = validatePayloadForListing(input.payload, listing, localToday(now()));
    if (violations.length)
      throw new HttpError(422, "rule_violation", violations, [...new Set(violations.map((v) => v.ruleId))]);
    if ((await sha256(listing.collectionNoticeMd)) !== input.collectionNoticeSha256)
      throw new HttpError(422, "collection_notice_changed");
    const expected = input.payload.consents.map(({ id, sha256, granted }) => ({ id, sha256, granted }));
    if (JSON.stringify(expected) !== JSON.stringify(input.consents))
      throw new HttpError(422, "consent_mismatch");
    const settings = await getSettings(c.env);
    if (settings?.turnstileRequired) {
      const verifier =
        deps.turnstileVerifier ??
        new CloudflareTurnstile(c.env.TURNSTILE_SECRET_KEY ?? "", new URL(c.req.url).hostname);
      if (!input.turnstileToken || !(await verifier.verify(input.turnstileToken)))
        throw new HttpError(403, "turnstile_failed");
    }
    const refs = documentRefs(input.payload);
    const docs = [...refs.financial, ...refs.identity];
    if (new Set(docs.map((d) => d.docId)).size !== docs.length)
      throw new HttpError(422, "duplicate_document");
    const allowedParts = new Set(["application", ...docs.map((_, i) => `doc_${i}`)]);
    for (const name of form.keys())
      if (!allowedParts.has(name) || form.getAll(name).length !== 1)
        throw new HttpError(422, "extra_document");
    for (let i = 0; i < docs.length; i++) {
      const file = form.get(`doc_${i}`);
      if (!file || typeof file === "string") throw new HttpError(422, "missing_document");
    }
    const id = crypto.randomUUID(),
      token = randomToken(),
      submittedAt = at();
    const policy = await retentionPolicy(c.env);
    const provisionalDue = new Date(now().getTime() + 90 * 86400000).toISOString();
    // Persist a tombstone-capable staging row before R2 writes; cron can recover an interrupted upload.
    const inserted = await c.env.DB.prepare(
      "INSERT INTO applications(id,listing_id,group_code,form_id,rules_version,status,submitted_at,status_changed_at,inspection_status,purge_due_at,purge_rule_id) SELECT ?,?,?,?,?,'submitted',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM listings WHERE id=? AND status='open')",
    )
      .bind(
        id,
        row.id,
        input.groupCode ?? null,
        input.payload.formId,
        input.payload.rulesVersion,
        submittedAt,
        submittedAt,
        input.payload.jurisdiction === "NSW" ? input.payload.applicant.nsw.inspection.status : null,
        new Date(now().getTime() + 86400000).toISOString(),
        "CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED",
        row.id,
      )
      .run();
    if (!inserted.meta.changes) throw new HttpError(409, "listing_closed");
    try {
      await createApplicationKey(c.env, id);
      for (const [i, ref] of docs.entries())
        await persistDocument(
          c.env,
          id,
          ref,
          form.get(`doc_${i}`) as File,
          i < refs.financial.length ? "financial" : "identity",
          "application",
          row.jurisdiction,
          now(),
          policy,
          provisionalDue,
        );
      const encrypted = await seal(c.env, id, "payload", input.payload);
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE applications SET payload_ct=?,payload_iv=?,applicant_token_hash=?,purge_due_at=? WHERE id=?",
        ).bind(encrypted.ct, encrypted.iv, await sha256(token), provisionalDue, id),
        ...input.payload.consents.map((consent) =>
          c.env.DB.prepare(
            "INSERT INTO consents(id,application_id,consent_id,text_sha256,granted,recorded_at) VALUES(?,?,?,?,?,?)",
          ).bind(crypto.randomUUID(), id, consent.id, consent.sha256, consent.granted ? 1 : 0, submittedAt),
        ),
        c.env.DB.prepare(
          "INSERT INTO collection_receipts(application_id,notice_sha256,recorded_at) VALUES(?,?,?)",
        ).bind(id, input.collectionNoticeSha256, submittedAt),
        auditStatement(
          c.env,
          "submit_application",
          { type: "applicant" },
          "application",
          id,
          c.get("requestId"),
          submittedAt,
        ),
      ]);
    } catch (error) {
      try {
        await purgeApplication(c.env, await getApplication(c.env, id), at(), c.get("requestId"));
      } catch {
        log({ type: "error", requestId: c.get("requestId"), code: "submission_cleanup_pending" });
      }
      throw error;
    }
    return c.json(
      {
        applicationId: id,
        applicantToken: token,
        portalPath: `/my-application#id=${id}&t=${token}`,
        receipt: {
          submittedAt,
          formId: input.payload.formId,
          rulesVersion: input.payload.rulesVersion,
          sharedPaths: Object.keys(input.payload.applicant),
          documents: docs.map(({ type, sha256, byteLength }) => ({ type, sha256, byteLength })),
          consents: input.consents,
        },
      },
      201,
    );
  });
  app.get("/api/agent/me", (c) => c.json(c.get("staff")));
  app.get("/api/agent/rules", (c) =>
    c.json({
      rules: listRules(),
      on: localToday(now()),
      nswPpiCommencementDate: c.env.NSW_PPI_COMMENCEMENT_DATE || null,
    }),
  );
  app.get("/api/agent/settings", async (c) => {
    admin(c);
    return c.json(
      (await getSettings(c.env)) ?? {
        details: null,
        collectionNoticeMd: COLLECTION_NOTICE_TEMPLATE,
        privacyPolicyUrl: null,
        retentionPolicy: DEFAULT_RETENTION,
        turnstileRequired: false,
      },
    );
  });
  app.put("/api/agent/settings", async (c) => {
    admin(c);
    const input = await body(c.req.raw, settingsInput);
    const violations = validateRetentionPolicy(input.retentionPolicy);
    if (violations.length) throw new HttpError(422, "rule_violation", violations);
    if (input.turnstileRequired && (!c.env.TURNSTILE_SECRET_KEY || !c.env.TURNSTILE_SITE_KEY))
      throw new HttpError(422, "turnstile_not_configured");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO agency_settings(id,details_json,collection_notice_md,privacy_policy_url,retention_policy_json,turnstile_required,updated_at,updated_by) VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET details_json=excluded.details_json,collection_notice_md=excluded.collection_notice_md,privacy_policy_url=excluded.privacy_policy_url,retention_policy_json=excluded.retention_policy_json,turnstile_required=excluded.turnstile_required,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      ).bind(
        JSON.stringify(input.details),
        input.collectionNoticeMd,
        input.privacyPolicyUrl,
        JSON.stringify(input.retentionPolicy),
        input.turnstileRequired ? 1 : 0,
        at(),
        c.get("staff").id,
      ),
      auditStatement(
        c.env,
        "settings_update",
        actor(c.get("staff")),
        "settings",
        null,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json(input);
  });
  app.get("/api/agent/listings", async (c) => {
    const { limit, cursor } = pageParams(new URL(c.req.url));
    const rows = (
      await c.env.DB.prepare("SELECT * FROM listings ORDER BY created_at DESC,id LIMIT ? OFFSET ?")
        .bind(limit + 1, cursor)
        .all<StoredListing>()
    ).results;
    return c.json({
      items: await Promise.all(
        rows.slice(0, limit).map(async (r) => ({ id: r.id, ...(await publicListing(c.env, r)) })),
      ),
      cursor: rows.length > limit ? pageCursor(cursor + limit) : null,
    });
  });
  app.post("/api/agent/listings", async (c) => {
    const input = await body(c.req.raw, listingInput);
    if (input.jurisdiction === "VIC" && input.identityStage === "application") admin(c);
    const violations = validateListingRequest(input, localToday(now()));
    if (violations.length)
      throw new HttpError(
        422,
        "rule_violation",
        violations,
        violations.map((v) => v.ruleId),
      );
    const settings = await getSettings(c.env);
    if (!settings) throw new HttpError(422, "agency_not_configured");
    const id = crypto.randomUUID(),
      publicSlug = slug();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO listings(id,slug,jurisdiction,form_id,premises_address,agent_details_json,requested_financial_json,requested_identity_json,identity_stage,referees_requested,max_financial_docs,tenancy_databases_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)",
      ).bind(
        id,
        publicSlug,
        input.jurisdiction,
        input.jurisdiction === "VIC" ? "VIC-3A-2026-03-31" : "NSW-PROVISIONAL-2026-11-04",
        input.premisesAddress,
        JSON.stringify(settings.details),
        JSON.stringify(input.financialRequested),
        JSON.stringify(input.identityRequested),
        input.identityStage,
        input.refereesRequested ? 1 : 0,
        input.maxFinancialDocs,
        JSON.stringify(input.tenancyDatabases),
        c.get("staff").id,
        at(),
        at(),
      ),
      auditStatement(c.env, "listing_create", actor(c.get("staff")), "listing", id, c.get("requestId"), at()),
    ]);
    return c.json({ id, ...(await publicListing(c.env, await getListing(c.env, id))) }, 201);
  });
  app.get("/api/agent/listings/:id", async (c) => {
    const row = await getListing(c.env, c.req.param("id"));
    return c.json({ id: row.id, ...(await publicListing(c.env, row)) });
  });
  app.patch("/api/agent/listings/:id", async (c) => {
    const row = await getListing(c.env, c.req.param("id"));
    if (row.status !== "draft") throw new HttpError(409, "published_listing_immutable");
    const input = await body(c.req.raw, listingInput);
    if (input.identityStage === "application") admin(c);
    const violations = validateListingRequest(input, localToday(now()));
    if (violations.length)
      throw new HttpError(
        422,
        "rule_violation",
        violations,
        violations.map((v) => v.ruleId),
      );
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE listings SET jurisdiction=?,form_id=?,premises_address=?,requested_financial_json=?,requested_identity_json=?,identity_stage=?,referees_requested=?,max_financial_docs=?,tenancy_databases_json=?,updated_at=? WHERE id=? AND status='draft'",
      ).bind(
        input.jurisdiction,
        input.jurisdiction === "VIC" ? "VIC-3A-2026-03-31" : "NSW-PROVISIONAL-2026-11-04",
        input.premisesAddress,
        JSON.stringify(input.financialRequested),
        JSON.stringify(input.identityRequested),
        input.identityStage,
        input.refereesRequested ? 1 : 0,
        input.maxFinancialDocs,
        JSON.stringify(input.tenancyDatabases),
        at(),
        row.id,
      ),
      auditStatement(
        c.env,
        "listing_update",
        actor(c.get("staff")),
        "listing",
        row.id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({ id: row.id, ...(await publicListing(c.env, await getListing(c.env, row.id))) });
  });
  app.post("/api/agent/listings/:id/publish", async (c) => {
    const row = await getListing(c.env, c.req.param("id"));
    if (row.status !== "draft") throw new HttpError(409, "invalid_listing_status");
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE listings SET status='open',updated_at=? WHERE id=? AND status='draft'").bind(
        at(),
        row.id,
      ),
      auditStatement(
        c.env,
        "listing_update",
        actor(c.get("staff")),
        "listing",
        row.id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({ id: row.id, slug: row.slug, applyPath: `/apply/${row.slug}` });
  });
  async function applicationView(env: Env, row: StoredApplication) {
    const documents = await getDocuments(env, row.id);
    const notices = (
      await env.DB.prepare(
        "SELECT id,notice_type,body_ct,body_iv,created_at,delivery FROM notices WHERE application_id=? ORDER BY created_at,id",
      )
        .bind(row.id)
        .all<{
          id: string;
          notice_type: string;
          body_ct: string;
          body_iv: string;
          created_at: string;
          delivery: string;
        }>()
    ).results;
    const messages = (
      await env.DB.prepare(
        "SELECT id,kind,body_ct,body_iv,created_at FROM application_messages WHERE application_id=? ORDER BY created_at,id",
      )
        .bind(row.id)
        .all<{ id: string; kind: string; body_ct: string; body_iv: string; created_at: string }>()
    ).results;
    return {
      id: row.id,
      status: row.status,
      groupCode: row.group_code,
      purgeDueAt: row.purge_due_at,
      legalDeadlineAt: row.legal_deadline_at,
      payload: await readPayload(env, row),
      documents: await Promise.all(
        documents.map(async (d) => {
          const metadata = await env.DB.prepare(
            "SELECT metadata_ct,metadata_iv FROM document_metadata WHERE document_id=?",
          )
            .bind(d.id)
            .first<{ metadata_ct: string; metadata_iv: string }>();
          const ref =
            metadata && !d.purged_at
              ? await open<Record<string, unknown>>(env, row.id, `doc-meta:${d.id}`, {
                  ct: metadata.metadata_ct,
                  iv: metadata.metadata_iv,
                })
              : {};
          return {
            ...ref,
            id: d.id,
            category: d.category,
            type: d.doc_type,
            purgedAt: d.purged_at,
            byteLength: d.byte_length,
          };
        }),
      ),
      consents: (
        await env.DB.prepare(
          "SELECT consent_id AS id,text_sha256 AS sha256,granted,recorded_at AS at,withdrawn_at AS withdrawnAt FROM consents WHERE application_id=?",
        )
          .bind(row.id)
          .all()
      ).results,
      notices: await Promise.all(
        notices.map(async (n) => ({
          id: n.id,
          type: n.notice_type,
          createdAt: n.created_at,
          delivery: n.delivery,
          body: await open<string>(env, row.id, `notice:${n.id}`, { iv: n.body_iv, ct: n.body_ct }),
        })),
      ),
      messages: await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          kind: m.kind,
          createdAt: m.created_at,
          text: await open<string>(env, row.id, `message:${m.id}`, { iv: m.body_iv, ct: m.body_ct }),
        })),
      ),
      collectionNoticeReceipt: await env.DB.prepare(
        "SELECT notice_sha256 AS sha256,recorded_at AS at FROM collection_receipts WHERE application_id=?",
      )
        .bind(row.id)
        .first(),
      allowedTransitions: TRANSITIONS[row.status].filter((s) => s !== "purged" && s !== "withdrawn"),
    };
  }
  app.get("/api/agent/listings/:id/applications", async (c) => {
    const listing = await getListing(c.env, c.req.param("id"));
    const { limit, cursor } = pageParams(new URL(c.req.url));
    const rows = (
      await c.env.DB.prepare(
        "SELECT * FROM applications WHERE listing_id=? AND purged_at IS NULL AND payload_ct IS NOT NULL ORDER BY submitted_at,id LIMIT ? OFFSET ?",
      )
        .bind(listing.id, limit + 1, cursor)
        .all<StoredApplication>()
    ).results;
    await audit(
      c.env,
      "list_applications",
      actor(c.get("staff")),
      "listing",
      listing.id,
      c.get("requestId"),
      at(),
    );
    return c.json({
      items: await Promise.all(
        rows.slice(0, limit).map(async (row) => ({
          id: row.id,
          status: row.status,
          groupCode: row.group_code,
          submittedAt: row.submitted_at,
          purgeDueAt: row.purge_due_at,
          payload: await readPayload(c.env, row),
          documents: (await getDocuments(c.env, row.id)).map((d) => ({
            id: d.id,
            category: d.category,
            type: d.doc_type,
            purgedAt: d.purged_at,
          })),
        })),
      ),
      cursor: rows.length > limit ? pageCursor(cursor + limit) : null,
    });
  });
  app.get("/api/agent/applications/:id", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    await audit(
      c.env,
      "view_application",
      actor(c.get("staff")),
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json({
      ...(await applicationView(c.env, row)),
      audit: (
        await c.env.DB.prepare(
          "SELECT * FROM audit_events WHERE target_id=? AND (?='admin' OR actor_id=?) ORDER BY seq DESC LIMIT 50",
        )
          .bind(row.id, c.get("staff").role, c.get("staff").id)
          .all()
      ).results,
    });
  });
  app.get("/api/agent/applications/:id/export", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    await audit(
      c.env,
      "export_application_json",
      actor(c.get("staff")),
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json(await readPayload(c.env, row));
  });
  app.get("/api/agent/applications/:id/documents/:docId", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    const doc = await c.env.DB.prepare(
      "SELECT * FROM documents WHERE id=? AND application_id=? AND purged_at IS NULL",
    )
      .bind(c.req.param("docId"), row.id)
      .first<StoredDocument>();
    if (!doc || row.purged_at) throw new HttpError(404, "not_found");
    const obj = await c.env.DOCS.get(doc.r2_key);
    if (!obj) throw new HttpError(410, "document_unavailable");
    const ciphertext = new Uint8Array(await obj.arrayBuffer());
    if ((await sha256(ciphertext)) !== doc.ct_sha256) throw new HttpError(500, "document_integrity_error");
    const bytes = await decrypt(
      await applicationKey(c.env, row.id),
      { iv: doc.iv, ct: base64url(ciphertext) },
      aad(row.id, `doc:${doc.id}`),
    );
    await audit(
      c.env,
      "download_document",
      actor(c.get("staff")),
      "document",
      doc.id,
      c.get("requestId"),
      at(),
    );
    c.header("Content-Type", doc.content_type);
    c.header(
      "Content-Disposition",
      `attachment; filename="document.${doc.content_type === "application/pdf" ? "pdf" : doc.content_type === "image/png" ? "png" : "jpg"}"`,
    );
    c.header("Content-Security-Policy", "sandbox");
    return c.body(bytes);
  });
  async function schedule(
    env: Env,
    row: StoredApplication,
    event: RetentionEvent,
    j: "VIC" | "NSW",
    instant: Date,
    policy?: RetentionPolicy,
  ) {
    const result = computeRetention(
      event,
      j,
      localToday(instant),
      {},
      policy ?? (await retentionPolicy(env)),
    );
    await env.DB.prepare(
      "UPDATE applications SET legal_deadline_at=?,purge_due_at=?,purge_rule_id=? WHERE id=? AND purged_at IS NULL",
    )
      .bind(result.legalDeadline, result.policyDeadline, result.ruleIds[0]!, row.id)
      .run();
    await env.DB.prepare(
      "UPDATE documents SET purge_due_at=MIN(purge_due_at,?),legal_deadline_at=? WHERE application_id=? AND category='financial' AND purged_at IS NULL",
    )
      .bind(result.policyDeadline, result.legalDeadline, row.id)
      .run();
    return result;
  }
  app.post("/api/agent/applications/:id/transition", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    const input = await body(
      c.req.raw,
      z.strictObject({
        to: z.enum(STATES),
        notice: z.strictObject({ body: z.string().min(20).max(8000) }).optional(),
        verificationMethod: z.enum(["sighted_in_person", "document_review"]).optional(),
      }),
    );
    if (input.to === "purged" || input.to === "withdrawn" || !canTransition(row.status, input.to))
      throw new HttpError(409, "invalid_transition", { from: row.status, to: input.to });
    if (input.to === "id_verified" && !input.verificationMethod)
      throw new HttpError(422, "verification_method_required");
    const listing = await getListing(c.env, row.listing_id),
      timestamp = at();
    let noticeId: string | undefined, newToken: string | undefined;
    const statements = [];
    if (input.to === "id_requested") {
      if (!input.notice) throw new HttpError(422, "intent_notice_required");
      noticeId = crypto.randomUUID();
      newToken = randomToken();
      const encrypted = await seal(c.env, row.id, `notice:${noticeId}`, input.notice.body);
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO notices(id,application_id,notice_type,body_ct,body_iv,created_at,created_by,delivery) SELECT ?,?,?,?,?,?,?,'applicant_portal' WHERE EXISTS(SELECT 1 FROM applications WHERE id=? AND status=?)",
        ).bind(
          noticeId,
          row.id,
          listing.jurisdiction === "NSW" ? "nsw_210e_intent" : "id_request",
          encrypted.ct,
          encrypted.iv,
          timestamp,
          c.get("staff").id,
          row.id,
          row.status,
        ),
      );
    }
    statements.push(
      c.env.DB.prepare(
        "UPDATE applications SET status=?,status_changed_at=?,intent_notice_at=CASE WHEN ?='id_requested' THEN ? ELSE intent_notice_at END,id_requested_at=CASE WHEN ?='id_requested' THEN ? ELSE id_requested_at END,applicant_token_hash=COALESCE(?,applicant_token_hash),id_verified_at=CASE WHEN ?='id_verified' THEN ? ELSE id_verified_at END,id_verification_method=COALESCE(?,id_verification_method) WHERE id=? AND status=?",
      ).bind(
        input.to,
        timestamp,
        input.to,
        timestamp,
        input.to,
        timestamp,
        newToken ? await sha256(newToken) : null,
        input.to,
        timestamp,
        input.verificationMethod ?? null,
        row.id,
        row.status,
      ),
    );
    const results = await c.env.DB.batch(statements);
    if (!results[results.length - 1]!.meta.changes)
      throw new HttpError(409, "invalid_transition", { from: row.status, to: input.to });
    await audit(
      c.env,
      "transition",
      actor(c.get("staff")),
      "application",
      row.id,
      c.get("requestId"),
      timestamp,
    );
    if (FINAL_STATES.includes(input.to)) {
      const consent =
        (
          await c.env.DB.prepare(
            "SELECT granted FROM consents WHERE application_id=? AND consent_id='vic_retain_for_other_premises@1' AND withdrawn_at IS NULL",
          )
            .bind(row.id)
            .first<{ granted: number }>()
        )?.granted === 1;
      await schedule(
        c.env,
        row,
        input.to === "successful"
          ? { kind: "successful", agreementDate: (listing.agreement_date ?? localToday(now())) as ISODate }
          : {
              kind: "unsuccessful",
              agreementDate: (listing.agreement_date ?? localToday(now())) as ISODate,
              vicOtherPremisesConsent: consent,
            },
        listing.jurisdiction,
        now(),
      );
    }
    if (input.to === "id_verified" || FINAL_STATES.includes(input.to)) {
      await c.env.DB.prepare(
        "UPDATE documents SET purge_due_at=? WHERE application_id=? AND category='identity' AND purged_at IS NULL",
      )
        .bind(timestamp, row.id)
        .run();
      for (const doc of await getDocuments(c.env, row.id))
        if (doc.category === "identity" && !doc.purged_at)
          await purgeDocument(c.env, { ...doc, purge_due_at: timestamp }, timestamp, c.get("requestId"));
    }
    return c.json({
      status: input.to,
      ...(newToken
        ? { applicantToken: newToken, portalPath: `/my-application#id=${row.id}&t=${newToken}` }
        : {}),
    });
  });
  app.post("/api/agent/listings/:id/close", async (c) => {
    const listing = await getListing(c.env, c.req.param("id"));
    if (listing.status !== "open") throw new HttpError(409, "invalid_listing_status");
    const input = await body(
      c.req.raw,
      z.strictObject({
        outcome: z.enum(["leased", "withdrawn"]),
        agreementDate: dateSchema.optional(),
        successfulApplicationIds: z.array(z.uuid()).max(20).optional(),
        tenancyEndDate: dateSchema.optional(),
      }),
    );
    const rows = (
      await c.env.DB.prepare("SELECT * FROM applications WHERE listing_id=? AND purged_at IS NULL")
        .bind(listing.id)
        .all<StoredApplication>()
    ).results;
    if (input.outcome === "leased") {
      if (!input.agreementDate || !input.successfulApplicationIds?.length)
        throw new HttpError(422, "agreement_and_successful_applicants_required");
      for (const id of input.successfulApplicationIds)
        if (!rows.some((r) => r.id === id && r.status === "successful"))
          throw new HttpError(422, "successful_application_required");
      if (rows.some((r) => r.status === "successful" && !input.successfulApplicationIds!.includes(r.id)))
        throw new HttpError(422, "include_all_successful_applications");
      if (input.tenancyEndDate && input.tenancyEndDate < input.agreementDate)
        throw new HttpError(422, "invalid_tenancy_end_date");
    } else if (rows.some((r) => r.status === "successful"))
      throw new HttpError(409, "successful_applications_exist");
    const policy = await retentionPolicy(c.env),
      timestamp = at();
    const consentRows = (
      await c.env.DB.prepare(
        "SELECT application_id,granted FROM consents WHERE consent_id='vic_retain_for_other_premises@1' AND withdrawn_at IS NULL AND application_id IN (SELECT id FROM applications WHERE listing_id=?)",
      )
        .bind(listing.id)
        .all<{ application_id: string; granted: number }>()
    ).results;
    const chosen = input.successfulApplicationIds ?? [];
    const guard = `EXISTS(SELECT 1 FROM listings WHERE id=? AND status='open')${chosen.map(() => " AND EXISTS(SELECT 1 FROM applications WHERE id=? AND listing_id=? AND status='successful')").join("")}`;
    const guardArgs = [listing.id, ...chosen.flatMap((id) => [id, listing.id])];
    const statements = [];
    for (const row of rows) {
      if (row.status === "withdrawn") continue;
      const success = chosen.includes(row.id);
      const event: RetentionEvent =
        input.outcome === "withdrawn"
          ? { kind: "listing_withdrawn_no_agreement", closedOn: localToday(now()) }
          : success
            ? {
                kind: "successful",
                agreementDate: input.agreementDate as ISODate,
                ...(input.tenancyEndDate ? { tenancyEndDate: input.tenancyEndDate as ISODate } : {}),
              }
            : {
                kind: "unsuccessful",
                agreementDate: input.agreementDate as ISODate,
                vicOtherPremisesConsent: consentRows.some(
                  (c) => c.application_id === row.id && c.granted === 1,
                ),
              };
      const retention = computeRetention(event, listing.jurisdiction, localToday(now()), {}, policy);
      statements.push(
        c.env.DB.prepare(
          `UPDATE applications SET status=?,status_changed_at=?,legal_deadline_at=?,purge_due_at=?,purge_rule_id=?,tenancy_end_date=? WHERE id=? AND status!='withdrawn' AND purged_at IS NULL AND ${guard}`,
        ).bind(
          success ? "successful" : "unsuccessful",
          timestamp,
          retention.legalDeadline,
          retention.policyDeadline,
          retention.ruleIds[0]!,
          success ? (input.tenancyEndDate ?? null) : null,
          row.id,
          ...guardArgs,
        ),
      );
      statements.push(
        c.env.DB.prepare(
          `UPDATE documents SET purge_due_at=CASE WHEN category='identity' THEN ? ELSE MIN(purge_due_at,?) END,legal_deadline_at=? WHERE application_id=? AND purged_at IS NULL AND ${guard}`,
        ).bind(timestamp, retention.policyDeadline, retention.legalDeadline, row.id, ...guardArgs),
      );
      if (!FINAL_STATES.includes(row.status))
        statements.push(
          auditStatement(
            c.env,
            "transition",
            actor(c.get("staff")),
            "application",
            row.id,
            c.get("requestId"),
            timestamp,
          ),
        );
    }
    statements.push(
      c.env.DB.prepare(
        `UPDATE listings SET status=?,agreement_date=?,closed_at=?,updated_at=? WHERE id=? AND ${guard}`,
      ).bind(
        input.outcome === "leased" ? "closed_leased" : "closed_withdrawn",
        input.agreementDate ?? null,
        timestamp,
        timestamp,
        listing.id,
        ...guardArgs,
      ),
    );
    const closeResults = await c.env.DB.batch(statements);
    if (!closeResults[closeResults.length - 1]!.meta.changes)
      throw new HttpError(409, "invalid_listing_status");
    await audit(
      c.env,
      "listing_close",
      actor(c.get("staff")),
      "listing",
      listing.id,
      c.get("requestId"),
      timestamp,
    );
    // Identity deletion is retryable: its due marker was committed atomically with close.
    for (const row of rows)
      for (const doc of await getDocuments(c.env, row.id))
        if (doc.category === "identity" && !doc.purged_at)
          await purgeDocument(c.env, { ...doc, purge_due_at: timestamp }, timestamp, c.get("requestId"));
    return c.json({ status: input.outcome === "leased" ? "closed_leased" : "closed_withdrawn" });
  });
  app.post("/api/agent/applications/:id/db-check", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    const input = await body(
      c.req.raw,
      z.strictObject({ checkedAt: z.iso.datetime(), listingFound: z.boolean() }),
    );
    if (input.checkedAt > at()) throw new HttpError(422, "future_check");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE applications SET db_checked_at=?,db_listing_found=? WHERE id=? AND purged_at IS NULL",
      ).bind(input.checkedAt, input.listingFound ? 1 : 0, row.id),
      auditStatement(
        c.env,
        "record_db_check",
        actor(c.get("staff")),
        "application",
        row.id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({
      ok: true,
      noticeDueAt: input.listingFound
        ? new Date(new Date(input.checkedAt).getTime() + 7 * 86400000).toISOString()
        : null,
    });
  });
  app.post("/api/agent/applications/:id/notices", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    const input = await body(
      c.req.raw,
      z.strictObject({
        type: z.enum(["vic_439d_database_listing", "outcome"]),
        body: z.string().min(1).max(8000),
        delivery: z.enum(["applicant_portal", "manual"]),
      }),
    );
    if (row.purged_at) throw new HttpError(410, "application_unavailable");
    const id = crypto.randomUUID(),
      encrypted = await seal(c.env, row.id, `notice:${id}`, input.body);
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO notices(id,application_id,notice_type,body_ct,body_iv,created_at,created_by,delivery) VALUES(?,?,?,?,?,?,?,?)",
      ).bind(id, row.id, input.type, encrypted.ct, encrypted.iv, at(), c.get("staff").id, input.delivery),
      ...(input.type === "vic_439d_database_listing"
        ? [c.env.DB.prepare("UPDATE applications SET db_notice_at=? WHERE id=?").bind(at(), row.id)]
        : []),
      auditStatement(
        c.env,
        "create_notice",
        actor(c.get("staff")),
        "application",
        row.id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({ id }, 201);
  });
  app.post("/api/agent/applications/:id/flag-improper", async (c) => {
    const row = await getApplication(c.env, c.req.param("id"));
    const input = await body(
      c.req.raw,
      z.strictObject({
        documentIds: z.array(z.uuid()).max(4).optional(),
        entireApplication: z.boolean().optional(),
      }),
    );
    if (!input.entireApplication && !input.documentIds?.length)
      throw new HttpError(422, "select_documents_or_application");
    const listing = await getListing(c.env, row.listing_id),
      timestamp = at(),
      retention = computeRetention(
        { kind: "improperly_collected", awareAt: timestamp },
        listing.jurisdiction,
        localToday(now()),
      );
    await audit(
      c.env,
      "flag_improper",
      actor(c.get("staff")),
      "application",
      row.id,
      c.get("requestId"),
      timestamp,
      "ok",
      retention.ruleIds[0]!,
    );
    if (input.entireApplication) {
      await c.env.DB.prepare(
        "UPDATE applications SET legal_deadline_at=?,purge_due_at=?,purge_rule_id=? WHERE id=?",
      )
        .bind(retention.legalDeadline, timestamp, retention.ruleIds[0]!, row.id)
        .run();
      await purgeApplication(c.env, await getApplication(c.env, row.id), timestamp, c.get("requestId"));
    } else {
      const docs = await getDocuments(c.env, row.id);
      for (const id of input.documentIds!) {
        const doc = docs.find((d) => d.id === id);
        if (!doc) throw new HttpError(404, "not_found");
        await c.env.DB.prepare(
          "UPDATE documents SET legal_deadline_at=?,purge_due_at=?,purge_rule_id=? WHERE id=?",
        )
          .bind(retention.legalDeadline, timestamp, retention.ruleIds[0]!, id)
          .run();
        await purgeDocument(
          c.env,
          {
            ...doc,
            purge_due_at: timestamp,
            purge_rule_id: retention.ruleIds[0]!,
            legal_deadline_at: retention.legalDeadline,
          },
          timestamp,
          c.get("requestId"),
        );
      }
    }
    return c.json({ ok: true });
  });
  app.post("/api/agent/applications/:id/purge", async (c) => {
    admin(c);
    const row = await getApplication(c.env, c.req.param("id"));
    await audit(
      c.env,
      "flag_improper",
      actor(c.get("staff")),
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    await purgeApplication(c.env, row, at(), c.get("requestId"));
    return c.json({ ok: true });
  });
  app.get("/api/applicant/applications/:id", async (c) => {
    const row = c.get("application"),
      listing = await getListing(c.env, row.listing_id);
    await audit(
      c.env,
      "applicant_view",
      { type: "applicant" },
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    const view = await applicationView(c.env, row);
    return c.json({
      status: row.status,
      listing: { premises: listing.premises_address, agency: JSON.parse(listing.agent_details_json).name },
      notices: view.notices,
      identityRequest: {
        allowed:
          row.status === "id_requested" &&
          canCollectIdentityDocuments(
            {
              jurisdiction: listing.jurisdiction,
              listingIdentityStage: listing.identity_stage,
              applicationStatus: row.status,
              intentNoticeRecordedAt: row.intent_notice_at,
            },
            localToday(now()),
          ).allowed,
        types: JSON.parse(listing.requested_identity_json),
        max: JSON.parse(listing.requested_identity_json).length || 1,
      },
      purgeDueAt: row.purge_due_at,
      legalDeadlineAt: row.legal_deadline_at,
      provisional: listing.jurisdiction === "NSW",
    });
  });
  app.get("/api/applicant/applications/:id/export", async (c) => {
    const row = c.get("application");
    await audit(
      c.env,
      "applicant_export",
      { type: "applicant" },
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json(await applicationView(c.env, row));
  });
  app.post("/api/applicant/applications/:id/withdraw", async (c) => {
    const row = c.get("application");
    if (!canTransition(row.status, "withdrawn"))
      throw new HttpError(409, "invalid_transition", { from: row.status, to: "withdrawn" });
    const listing = await getListing(c.env, row.listing_id);
    const changed = await c.env.DB.prepare(
      "UPDATE applications SET status='withdrawn',status_changed_at=? WHERE id=? AND status=?",
    )
      .bind(at(), row.id, row.status)
      .run();
    if (!changed.meta.changes) throw new HttpError(409, "invalid_transition");
    const due = await schedule(
      c.env,
      row,
      { kind: "application_withdrawn", withdrawnAt: at() },
      listing.jurisdiction,
      now(),
    );
    await audit(
      c.env,
      "applicant_withdraw",
      { type: "applicant" },
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json({ status: "withdrawn", purgeDueAt: due.policyDeadline });
  });
  app.post("/api/applicant/applications/:id/consents", async (c) => {
    const row = c.get("application");
    const input = await body(
      c.req.raw,
      z.strictObject({ id: z.literal("vic_retain_for_other_premises@1"), granted: z.literal(false) }),
    );
    const listing = await getListing(c.env, row.listing_id);
    if (listing.jurisdiction !== "VIC") throw new HttpError(422, "consent_not_applicable");
    await c.env.DB.prepare(
      "UPDATE consents SET granted=0,withdrawn_at=? WHERE application_id=? AND consent_id=?",
    )
      .bind(at(), row.id, input.id)
      .run();
    if (row.status === "unsuccessful" && listing.agreement_date) {
      const result = computeRetention(
        {
          kind: "unsuccessful",
          agreementDate: listing.agreement_date as ISODate,
          vicOtherPremisesConsent: false,
        },
        "VIC",
        localToday(now()),
        {},
        await retentionPolicy(c.env),
      );
      await c.env.DB.prepare(
        "UPDATE applications SET legal_deadline_at=?,purge_due_at=MIN(COALESCE(purge_due_at,?),?),purge_rule_id=? WHERE id=?",
      )
        .bind(result.legalDeadline, result.policyDeadline, result.policyDeadline, result.ruleIds[0]!, row.id)
        .run();
      await c.env.DB.prepare(
        "UPDATE documents SET legal_deadline_at=?,purge_due_at=MIN(purge_due_at,?) WHERE application_id=? AND purged_at IS NULL",
      )
        .bind(result.legalDeadline, result.policyDeadline, row.id)
        .run();
    }
    await audit(
      c.env,
      "applicant_consent_change",
      { type: "applicant" },
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json({ ok: true });
  });
  app.post("/api/applicant/applications/:id/messages", async (c) => {
    const row = c.get("application");
    const input = await body(
      c.req.raw,
      z.strictObject({ kind: z.literal("correction_request"), text: z.string().min(1).max(2000) }),
    );
    const id = crypto.randomUUID(),
      encrypted = await seal(c.env, row.id, `message:${id}`, input.text);
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO application_messages(id,application_id,kind,body_ct,body_iv,created_at) VALUES(?,?,?,?,?,?)",
      ).bind(id, row.id, input.kind, encrypted.ct, encrypted.iv, at()),
      auditStatement(
        c.env,
        "applicant_consent_change",
        { type: "applicant" },
        "application",
        row.id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({ id }, 201);
  });
  app.post("/api/applicant/applications/:id/identity-documents", async (c) => {
    const row = c.get("application"),
      listing = await getListing(c.env, row.listing_id);
    const gate = canCollectIdentityDocuments(
      {
        jurisdiction: listing.jurisdiction,
        listingIdentityStage: listing.identity_stage,
        applicationStatus: row.status,
        intentNoticeRecordedAt: row.intent_notice_at,
      },
      localToday(now()),
    );
    if (row.status !== "id_requested" || !gate.allowed)
      throw new HttpError(403, "identity_not_allowed", undefined, gate.ruleIds);
    const form = await multipart(c.req.raw);
    const input = asObject(
      parseJson(form.get("application")),
      z.strictObject({
        documents: z
          .array(
            z.strictObject({
              part: z.string().regex(/^doc_\d$/),
              category: z.literal("identity"),
              type: z.enum(allDocumentTypes),
              filename: z.string().min(1).max(200),
            }),
          )
          .min(1)
          .max(2),
      }),
    );
    const expected = new Set(["application", ...input.documents.map((d) => d.part)]);
    for (const key of form.keys())
      if (!expected.has(key) || form.getAll(key).length !== 1) throw new HttpError(422, "extra_document");
    const allowed: string[] = JSON.parse(listing.requested_identity_json);
    const existing = (await getDocuments(c.env, row.id)).filter(
      (d) => d.category === "identity" && !d.purged_at,
    );
    if (existing.length + input.documents.length > Math.min(2, allowed.length || 1))
      throw new HttpError(422, "identity_limit", undefined, gate.ruleIds);
    const types = [...existing.map((d) => d.doc_type), ...input.documents.map((d) => d.type)];
    if (new Set(types).size !== types.length || types.some((t) => !allowed.includes(t)))
      throw new HttpError(422, "identity_type_not_requested", undefined, gate.ruleIds);
    const policy = await retentionPolicy(c.env);
    const uploaded = [];
    for (const reference of input.documents) {
      const file = form.get(reference.part);
      if (!file || typeof file === "string") throw new HttpError(422, "missing_document");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ref = asObject(
        {
          docId: crypto.randomUUID(),
          type: reference.type,
          filename: reference.filename,
          sha256: await sha256(bytes),
          byteLength: bytes.length,
          contentType: file.type,
        },
        documentRefSchema,
      );
      uploaded.push(
        await persistDocument(
          c.env,
          row.id,
          ref,
          file,
          "identity",
          "identity_stage",
          listing.jurisdiction,
          now(),
          policy,
          row.purge_due_at!,
        ),
      );
    }
    await audit(
      c.env,
      "applicant_upload_identity",
      { type: "applicant" },
      "application",
      row.id,
      c.get("requestId"),
      at(),
    );
    return c.json({ documents: uploaded }, 201);
  });
  app.get("/api/agent/retention", async (c) => {
    const { limit, cursor } = pageParams(new URL(c.req.url));
    const applications = (
      await c.env.DB.prepare(
        "SELECT id,listing_id,status,purge_due_at AS purgeDueAt,legal_deadline_at AS legalDeadlineAt FROM applications WHERE purged_at IS NULL ORDER BY purge_due_at LIMIT ? OFFSET ?",
      )
        .bind(limit, cursor)
        .all()
    ).results;
    const documents = (
      await c.env.DB.prepare(
        "SELECT id,application_id,category,purge_due_at AS purgeDueAt FROM documents WHERE purged_at IS NULL ORDER BY purge_due_at LIMIT ? OFFSET ?",
      )
        .bind(limit, cursor)
        .all()
    ).results;
    const receipts = (
      await c.env.DB.prepare("SELECT * FROM purge_receipts ORDER BY purged_at DESC LIMIT ? OFFSET ?")
        .bind(limit, cursor)
        .all()
    ).results;
    const counts = await c.env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM listings WHERE status='open') AS openListings,(SELECT COUNT(*) FROM applications WHERE status='submitted' AND purged_at IS NULL) AS newApplications,(SELECT COUNT(*) FROM applications WHERE purge_due_at<=? AND purged_at IS NULL) AS purgesDue,(SELECT COUNT(*) FROM purge_receipts WHERE late=1) AS latePurges,(SELECT COUNT(*) FROM applications WHERE db_listing_found=1 AND db_notice_at IS NULL AND db_checked_at<? AND purged_at IS NULL) AS overdueDatabaseNotices",
    )
      .bind(
        new Date(now().getTime() + 7 * 86400000).toISOString(),
        new Date(now().getTime() - 7 * 86400000).toISOString(),
      )
      .first();
    const overdueApplications = (
      await c.env.DB.prepare(
        "SELECT id,listing_id AS listingId,db_checked_at AS checkedAt FROM applications WHERE db_listing_found=1 AND db_notice_at IS NULL AND db_checked_at<? AND purged_at IS NULL ORDER BY db_checked_at LIMIT ? OFFSET ?",
      )
        .bind(new Date(now().getTime() - 7 * 86400000).toISOString(), limit, cursor)
        .all()
    ).results;
    return c.json({
      applications,
      documents,
      receipts,
      overdueApplications,
      counts,
      cursor: [applications, documents, receipts, overdueApplications].some((items) => items.length === limit)
        ? pageCursor(cursor + limit)
        : null,
    });
  });
  app.get("/api/agent/audit", async (c) => {
    const url = new URL(c.req.url),
      { limit, cursor } = pageParams(url);
    const where = ["seq>?"];
    const args: unknown[] = [cursor];
    if (c.get("staff").role !== "admin") {
      where.push("actor_id=?");
      args.push(c.get("staff").id);
    }
    for (const [query, column, op] of [
      ["from", "at", ">="],
      ["to", "at", "<="],
      ["action", "action", "="],
      ["targetId", "target_id", "="],
    ] as const) {
      const value = url.searchParams.get(query);
      if (value) {
        where.push(`${column}${op}?`);
        args.push(value);
      }
    }
    const rows = (
      await c.env.DB.prepare(`SELECT * FROM audit_events WHERE ${where.join(" AND ")} ORDER BY seq LIMIT ?`)
        .bind(...args, limit + 1)
        .all<Record<string, string | number | null>>()
    ).results;
    const items = rows.slice(0, limit);
    if (url.searchParams.get("format") === "csv") {
      admin(c);
      const keys = [
        "seq",
        "at",
        "actor_type",
        "actor_id",
        "action",
        "target_type",
        "target_id",
        "rule_id",
        "request_id",
        "outcome",
      ];
      const csv = [
        keys.join(","),
        ...items.map((r) => keys.map((k) => `"${String(r[k] ?? "").replaceAll('"', '""')}"`).join(",")),
      ].join("\r\n");
      c.header("Content-Type", "text/csv");
      c.header("Content-Disposition", 'attachment; filename="audit.csv"');
      return c.body(csv);
    }
    return c.json({
      items,
      cursor: rows.length > limit ? pageCursor(Number(items[items.length - 1]!.seq)) : null,
    });
  });
  app.get("/api/agent/staff", async (c) => {
    admin(c);
    return c.json({
      items: (
        await c.env.DB.prepare(
          "SELECT id,email,role,disabled,created_at FROM staff_users ORDER BY created_at LIMIT 50",
        ).all()
      ).results,
    });
  });
  app.post("/api/agent/staff", async (c) => {
    admin(c);
    const input = await body(
      c.req.raw,
      z.strictObject({ email: z.email(), role: z.enum(["admin", "agent"]) }),
    );
    const id = crypto.randomUUID();
    if (
      await c.env.DB.prepare("SELECT id FROM staff_users WHERE email=? COLLATE NOCASE")
        .bind(input.email)
        .first()
    )
      throw new HttpError(409, "staff_exists");
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO staff_users(id,email,role,disabled,created_at) VALUES(?,?,?,0,?)").bind(
        id,
        input.email.toLowerCase(),
        input.role,
        at(),
      ),
      auditStatement(
        c.env,
        "staff_create",
        actor(c.get("staff")),
        "staff_user",
        id,
        c.get("requestId"),
        at(),
      ),
    ]);
    return c.json({ id, ...input }, 201);
  });
  const staffUpdate = async (c: import("hono").Context<Ctx>) => {
    admin(c);
    const input = await body(
      c.req.raw,
      z.strictObject({ id: z.uuid().optional(), role: z.enum(["admin", "agent"]), disabled: z.boolean() }),
    );
    const id = c.req.param("id") ?? input.id;
    if (!id) throw new HttpError(422, "staff_id_required");
    const result = await c.env.DB.prepare(
      "UPDATE staff_users SET role=?,disabled=? WHERE id=? AND (role!='admin' OR disabled=1 OR (?='admin' AND ?=0) OR (SELECT COUNT(*) FROM staff_users WHERE role='admin' AND disabled=0)>1)",
    )
      .bind(input.role, input.disabled ? 1 : 0, id, input.role, input.disabled ? 1 : 0)
      .run();
    if (!result.meta.changes) throw new HttpError(409, "last_admin_or_missing_staff");
    await audit(c.env, "staff_update", actor(c.get("staff")), "staff_user", id, c.get("requestId"), at());
    return c.json({ ok: true });
  };
  app.patch("/api/agent/staff/:id", staffUpdate);
  app.patch("/api/agent/staff", staffUpdate);
  app.post("/api/agent/keys/rewrap", async (c) => {
    admin(c);
    await audit(c.env, "rewrap_keys", actor(c.get("staff")), "system", null, c.get("requestId"), at());
    return c.json({ count: await rewrapKeys(c.env) });
  });
  app.get("/agent", (c) => c.redirect("/agent/"));
  app.get("/agent/*", async (c) => {
    const request = new Request(c.req.url, c.req.raw);
    const assets = c.env.ASSETS as unknown as { fetch: (request: Request) => Promise<Response> };
    const response = await assets.fetch(request);
    if (response.status !== 404 && !response.headers.get("Content-Type")?.includes("text/html"))
      return response;
    return assets.fetch(new Request(new URL("/agent/index.html", request.url), request));
  });
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));
  app.get("*", (c) =>
    (c.env.ASSETS as unknown as { fetch: (request: Request) => Promise<Response> }).fetch(c.req.raw),
  );
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
