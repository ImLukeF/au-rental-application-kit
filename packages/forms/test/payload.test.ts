import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rulesVersion, VIC_FINANCIAL, VIC_IDENTITY } from "@aurak/rules";
import { describe, expect, it } from "vitest";
import rawNsw from "../../../fixtures/listings/nsw-listing.json";
import rawListing from "../../../fixtures/listings/vic-listing.json";
import rawProfile from "../../../fixtures/profiles/vic-employed.json";
import snapshot from "../consents.snap.json";
import type { DocumentRef, Selections } from "../src";
import { applicationSchema, buildPayload, CONSENTS, listingSchema, profileSchema, VIC_ITEMS } from "../src";

const profile = profileSchema.parse(rawProfile);
const listing = listingSchema.parse({ ...rawListing, rulesVersion: rulesVersion() });
const documents: DocumentRef[] = ["payslip", "bank_statement_no_transactions"].map((type, i) => ({
  docId: `doc${i}`,
  type,
  filename: `sample-${i}.pdf`,
  sha256: "a".repeat(64),
  byteLength: 100,
  contentType: "application/pdf",
}));
const selections: Selections = {
  financialDocIds: ["doc0", "doc1"],
  identityDocIds: [],
  historyIds: ["0", "1"],
  refereeIds: [],
  consents: { "share_with_agency@1": true },
  signature: { printName: "Test Applicant One", date: "2026-11-04" },
};
describe("minimised form payloads", () => {
  it("follows all twelve official item headings and document enums", () => {
    const official = readFileSync("content/vic/form3a-part-a.md", "utf8");
    expect(VIC_ITEMS.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const i of VIC_ITEMS) expect(official).toContain(`${i.number}. ${i.label}`);
    expect(VIC_IDENTITY).toHaveLength(12);
    expect(VIC_IDENTITY[11]).toBe("government_letter_current_address");
    expect(VIC_FINANCIAL).toHaveLength(3);
  });
  it("shares requested documents and excludes third address and unrequested references", () => {
    const result = buildPayload({ profile, listing, documents, selections, on: "2026-11-04" });
    expect(result.errors).toEqual([]);
    expect(result.payload?.jurisdiction).toBe("VIC");
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "profile.addresses[2]" }),
        expect.objectContaining({ reason: "References not requested." }),
      ]),
    );
    if (result.payload?.jurisdiction === "VIC") expect(result.payload.applicant.item9).toBeNull();
  });
  it("rejects extra documents and third IDs", () => {
    const result = buildPayload({
      profile,
      listing,
      documents: [...documents, { ...documents[0]!, docId: "extra", type: "proof_of_savings" }],
      selections: { ...selections, financialDocIds: ["extra"], identityDocIds: ["doc0", "doc1", "extra"] },
      on: "2026-11-04",
    });
    expect(result.payload).toBeNull();
    expect(result.errors.map((e) => e.ruleId)).toContain("VIC.DOCS.IDENTITY_MAX_TWO");
  });
  it("requires NSW inspection and never includes identity documents in its schema", () => {
    const nsw = listingSchema.parse({ ...rawNsw, rulesVersion: rulesVersion() });
    const s = { ...selections, financialDocIds: [] };
    expect(
      buildPayload({ profile, listing: nsw, selections: s, on: "2026-11-04" }).errors.map((e) => e.ruleId),
    ).toContain("NSW.PPI.INSPECT_BEFORE_APPLY");
    const result = buildPayload({
      profile,
      listing: nsw,
      selections: { ...s, inspection: { status: "inspected", inspectedOn: "2026-11-01" } },
      on: "2026-11-04",
    });
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result.payload?.applicant)).not.toContain("identity");
  });
  it("implements alternative ability-to-pay detail and rejects missing alternatives", () => {
    const p = {
      ...profile,
      employment: { status: "not_employed" as const },
      noRegularIncomeDetails: "Savings (fixture)",
    };
    expect(buildPayload({ profile: p, listing, documents, selections, on: "2026-11-04" }).errors).toEqual([]);
    const { noRegularIncomeDetails: _details, ...withoutDetails } = p;
    expect(
      buildPayload({ profile: withoutDetails, listing, documents, selections, on: "2026-11-04" }).errors,
    ).not.toEqual([]);
  });
  it("strictly rejects extra fields at profile and nested application boundaries", () => {
    expect(profileSchema.safeParse({ ...profile, extra: "x" }).success).toBe(false);
    const result = buildPayload({ profile, listing, documents, selections, on: "2026-11-04" });
    expect(applicationSchema.safeParse({ ...result.payload, extra: "x" }).success).toBe(false);
  });
  it("pins consent version hashes to independently computed SHA-256", () => {
    for (const c of CONSENTS) {
      const hash = createHash("sha256").update(c.text).digest("hex");
      expect(hash).toBe(c.sha256);
      expect(hash).toBe(snapshot[c.id]);
    }
  });
});
it("contains no fields for the never-collected catalogue", async () => {
  const { z } = await import("zod");
  const scan = (schema: unknown) => {
    if (!schema || typeof schema !== "object") return;
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties")
        for (const name of Object.keys(value as object))
          expect(name).not.toMatch(
            /photo|selfie|social|marital|relationship|child|tattoo|religion|ethnic|gender|disab|tfn|taxFile|credit|bond(Claim|History)|tribunal|dispute/i,
          );
      scan(value);
    }
  };
  scan(z.toJSONSchema(profileSchema));
  scan(z.toJSONSchema(applicationSchema));
});
