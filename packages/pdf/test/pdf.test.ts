import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildPayload, listingSchema, profileSchema, VIC_ITEMS } from "@aurak/forms";
import { rulesVersion } from "@aurak/rules";
import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import rawNsw from "../../../fixtures/listings/nsw-listing.json";
import rawVic from "../../../fixtures/listings/vic-listing.json";
import rawProfile from "../../../fixtures/profiles/vic-employed.json";
import { renderApplicationPdf } from "../src";

const fonts = {
  regular: new Uint8Array(readFileSync("packages/pdf/fonts/NotoSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync("packages/pdf/fonts/NotoSans-Bold.ttf")),
};
const now = new Date("2026-11-04T00:00:00.000Z");
function fixture(nsw = false, name = "Test Applicant One") {
  const profile = profileSchema.parse({
    ...rawProfile,
    personal: { ...rawProfile.personal, fullName: name },
  });
  const listing = listingSchema.parse({
    ...(nsw ? rawNsw : rawVic),
    financialRequested: [],
    rulesVersion: rulesVersion(),
  });
  const result = buildPayload({
    profile,
    listing,
    selections: {
      financialDocIds: [],
      identityDocIds: [],
      historyIds: ["0", "1"],
      refereeIds: [],
      inspection: { status: "inspected", inspectedOn: "2026-11-01" },
      consents: { "share_with_agency@1": true },
      signature: { printName: name, date: "2026-11-04" },
    },
    on: "2026-11-04",
  });
  expect(result.errors).toEqual([]);
  return result.payload!;
}
describe("client-side PDF exports", () => {
  it("includes official sections, every item, attribution and only shared values", async () => {
    const bytes = await renderApplicationPdf(fixture(), { fonts, now });
    const { text } = await extractText(bytes, { mergePages: true });
    expect(text).toContain("Residential rental application");
    expect(text).toContain("PART A—GENERAL");
    for (const item of VIC_ITEMS) expect(text).toContain(item.label);
    expect(text).toContain("PART B–RIGHTS AND OBLIGATIONS");
    expect(text).toContain("Statement of Information for Rental Applicants");
    expect(text).toContain("Test Applicant One");
    expect(text).toContain("© State of Victoria");
    expect(text).not.toContain("Sample Referee");
    expect(text).not.toContain("0 Placeholder Earlier Road, Fixtureville");
  }, 20000);
  it("labels every NSW page PROVISIONAL", async () => {
    const { text } = await extractText(await renderApplicationPdf(fixture(true), { fonts, now }), {
      mergePages: false,
    });
    expect(text.length).toBeGreaterThan(0);
    for (const page of text) expect(page).toContain("PROVISIONAL — not the NSW approved form");
  }, 20000);
  it("renders deterministically at a fixed timestamp", async () => {
    const a = await renderApplicationPdf(fixture(), { fonts, now }),
      b = await renderApplicationPdf(fixture(), { fonts, now });
    const hash = (x: Uint8Array) => createHash("sha256").update(x).digest("hex");
    expect(hash(a)).toBe(hash(b));
  }, 20000);
  it("replaces unavailable glyphs and preserves an explicit warning", async () => {
    const { text } = await extractText(
      await renderApplicationPdf(fixture(false, "Test Applicant One 漢"), { fonts, now }),
      { mergePages: true },
    );
    expect(text).toContain("Some characters could not be displayed; see the JSON export.");
  }, 20000);
});
