import { describe, expect, it } from "vitest";
import {
  addMonths,
  addYears,
  canCollectIdentityDocuments,
  computeRetention,
  DEFAULT_RETENTION,
  evaluateFee,
  getRule,
  penaltyToAUD,
  policyRules,
  requiredNotices,
  ruleStatus,
  validateListingRequest,
  validateRetentionPolicy,
} from "../src";

const on = "2026-11-04";
describe("dated legal behavior", () => {
  it.each([
    ["third_party", "2026-03-30", "not_prohibited_by_encoded_rules"],
    ["third_party", "2026-03-31", "prohibited"],
    ["agent", "2026-10-12", "unknown"],
    ["agent", "2026-10-13", "prohibited"],
    ["adi", "2026-11-04", "not_prohibited_by_encoded_rules"],
  ] as const)("VIC fee %s %s", (chargedBy, date, result) =>
    expect(evaluateFee({ jurisdiction: "VIC", chargedBy, on: date, matter: "application" }).result).toBe(
      result,
    ),
  );
  it("calculates deadlines, consent extension and safety margin", () => {
    expect(
      computeRetention(
        { kind: "unsuccessful", agreementDate: "2026-11-10", vicOtherPremisesConsent: false },
        "VIC",
        on,
      ),
    ).toMatchObject({
      legalDeadline: "2026-12-10T00:00:00.000Z",
      policyDeadline: "2026-11-24T00:00:00.000Z",
    });
    expect(
      computeRetention(
        { kind: "unsuccessful", agreementDate: "2026-11-10", vicOtherPremisesConsent: true },
        "VIC",
        on,
        {},
        { ...DEFAULT_RETENTION, keepConsentedUnsuccessful: true },
      ),
    ).toMatchObject({
      legalDeadline: "2027-05-10T00:00:00.000Z",
      policyDeadline: "2027-05-08T00:00:00.000Z",
    });
    expect(
      computeRetention(
        { kind: "successful", agreementDate: "2026-11-10", tenancyEndDate: "2027-11-09" },
        "VIC",
        on,
      ).legalDeadline,
    ).toBe("2030-11-09T00:00:00.000Z");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addYears("2024-02-29", 3)).toBe("2027-02-28");
    expect(validateRetentionPolicy({ ...DEFAULT_RETENTION, unsuccessfulDays: 60 })[0]?.ruleId).toBe(
      "VIC.RETENTION.UNSUCCESSFUL_30D",
    );
  });
  it("enforces document request types, count and exclusions", () => {
    const base = {
      jurisdiction: "VIC",
      financialRequested: ["payslip"],
      identityRequested: ["driver_licence", "medicare_card", "australian_passport"],
      identityStage: "preferred",
      maxFinancialDocs: 2,
      tenancyDatabases: [],
    } as const;
    expect(
      validateListingRequest(
        {
          ...base,
          financialRequested: [...base.financialRequested],
          identityRequested: [...base.identityRequested],
        },
        on,
      )[0]?.ruleId,
    ).toBe("VIC.DOCS.IDENTITY_MAX_TWO");
    expect(
      validateListingRequest(
        {
          ...base,
          financialRequested: ["tax_return"],
          identityRequested: [],
          tenancyDatabases: [1, 2, 3, 4],
        },
        on,
      ),
    ).toHaveLength(2);
    expect(
      validateListingRequest(
        { ...base, financialRequested: [], identityRequested: [], providerType: "homes_victoria" },
        on,
      )[0]?.reason,
    ).toMatch(/not supported/);
  });
  it("gates NSW identity on preference and a prior notice", () => {
    const base = { jurisdiction: "NSW", listingIdentityStage: "preferred" } as const;
    expect(canCollectIdentityDocuments({ ...base, applicationStatus: "submitted" }, on).allowed).toBe(false);
    expect(canCollectIdentityDocuments({ ...base, applicationStatus: "preferred" }, on).allowed).toBe(false);
    expect(
      canCollectIdentityDocuments(
        { ...base, applicationStatus: "preferred", intentNoticeRecordedAt: "2026-11-04T01:00:00Z" },
        on,
      ).allowed,
    ).toBe(true);
  });
  it("keeps NSW policy active early and status contingent on configuration", () => {
    const rule = getRule("NSW.PPI.APPROVED_FORM");
    expect(ruleStatus(rule, on)).toBe("pending_commencement");
    expect(ruleStatus(rule, "2027-02-01", { nswPpiCommencementDate: "2027-02-01" })).toBe("in_force");
    expect(policyRules("NSW", on).map((r) => r.id)).toContain(rule.id);
  });
  it("destroys improperly collected data immediately and skips weekends for legal caps", () => {
    expect(
      computeRetention({ kind: "improperly_collected", awareAt: "2026-11-06T08:00:00.000Z" }, "NSW", on),
    ).toMatchObject({
      legalDeadline: "2026-11-10T08:00:00.000Z",
      policyDeadline: "2026-11-06T08:00:00.000Z",
    });
  });
  it("converts penalty units and notices without asserting liability", () => {
    expect(penaltyToAUD({ bodyCorporatePU: 300 }, "VIC", on)).toEqual({ bodyCorporate: 62730 });
    expect(penaltyToAUD({ otherwisePU: 450 }, "NSW", on)).toEqual({ bodyCorporate: 49500 });
    expect(
      requiredNotices(
        { jurisdiction: "VIC", databaseListingFound: true, dbCheckedAt: "2026-11-04T00:00:00.000Z" },
        on,
      )[0]?.dueAt,
    ).toBe("2026-11-11T00:00:00.000Z");
  });
});
it("does not invent an agreement date for an earlier decision", () => {
  expect(
    computeRetention(
      { kind: "decision_without_agreement", decidedAt: "2026-11-04T01:00:00.000Z", successful: false },
      "VIC",
      "2026-11-04",
    ),
  ).toMatchObject({ legalDeadline: null, policyDeadline: "2026-11-18T01:00:00.000Z" });
});
