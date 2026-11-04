import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getRule, listRules, ruleStatus, rulesVersion } from "../src";
import { ruleTest } from "./helpers/ruleTest";

describe("registry contracts", () => {
  it("requires unique cited rules with dated sources and honest confidence", () => {
    const rules = listRules();
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.id).toMatch(/^(VIC|NSW|CTH)\.[A-Z0-9_.]+$/);
      expect(r.citations.length).toBeGreaterThan(0);
      for (const c of r.citations) {
        expect(c.url).toMatch(/^https:\/\//);
        expect(c.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(c.pinpoint.length).toBeGreaterThan(0);
      }
      if (r.confidence === "unverified") expect(r.notes).toMatch(/UNVERIFIED/);
    }
    expect(rulesVersion()).toBe(rulesVersion());
  });
  it("has explicit tests for every rule", () => {
    const source = readdirSync("packages/rules/test")
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => readFileSync(`packages/rules/test/${f}`, "utf8"))
      .join("");
    for (const r of listRules())
      expect(source).toMatch(new RegExp(`ruleTest\\(\\s*["']${r.id.replaceAll(".", "\\.")}["']`));
  });
});
ruleTest("VIC.FORM.PRESCRIBED_FORM_3A", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.FORM.PRESCRIBED_FORM_3A").params).toEqual({
    formId: "VIC-3A-2026-03-31",
    excludedProviders: ["homes_victoria", "registered_agency"],
    excludedPrograms: ["victorian_affordable_housing_program", "specialised_housing_program"],
  });
  expect(ruleStatus(getRule("VIC.FORM.PRESCRIBED_FORM_3A"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.FORM.STATEMENT_FORM_3", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.FORM.STATEMENT_FORM_3").params).toEqual({
    contentFile: "content/vic/form3-statement.md",
  });
  expect(ruleStatus(getRule("VIC.FORM.STATEMENT_FORM_3"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.COLLECT.ONLY_FORM_3A_INFO", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.COLLECT.ONLY_FORM_3A_INFO").params).toEqual({
    allowedFieldPaths: [
      "item1",
      "item2",
      "item3",
      "item4",
      "item5",
      "item6",
      "item7",
      "item8",
      "item9",
      "item10",
      "item11",
      "item12",
    ],
  });
  expect(ruleStatus(getRule("VIC.COLLECT.ONLY_FORM_3A_INFO"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.COLLECT.PRESCRIBED_CATEGORIES", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.COLLECT.PRESCRIBED_CATEGORIES").params).toEqual({
    identityItems: [4, 7],
    financialItems: [6],
    employmentItems: [5],
  });
  expect(ruleStatus(getRule("VIC.COLLECT.PRESCRIBED_CATEGORIES"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DOCS.FINANCIAL_MAX_TWO", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DOCS.FINANCIAL_MAX_TWO").params).toEqual({
    max: 2,
    allowed: ["payslip", "bank_statement_no_transactions", "centrelink_statement_or_letter"],
  });
  expect(ruleStatus(getRule("VIC.DOCS.FINANCIAL_MAX_TWO"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DOCS.IDENTITY_MAX_TWO", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DOCS.IDENTITY_MAX_TWO").params).toEqual({
    max: 2,
    allowed: [
      "driver_licence",
      "proof_of_age_card",
      "medicare_card",
      "australian_passport",
      "foreign_passport_and_visa",
      "birth_certificate",
      "citizenship_certificate",
      "tertiary_student_id",
      "centrelink_card",
      "dva_card",
      "utilities_bill_current_address",
      "government_letter_current_address",
    ],
  });
  expect(ruleStatus(getRule("VIC.DOCS.IDENTITY_MAX_TWO"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DOCS.BANK_STATEMENT_NO_TRANSACTIONS", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DOCS.BANK_STATEMENT_NO_TRANSACTIONS").params).toEqual({ uiWarning: true });
  expect(ruleStatus(getRule("VIC.DOCS.BANK_STATEMENT_NO_TRANSACTIONS"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.USE.PURPOSE_LIMIT", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.USE.PURPOSE_LIMIT").params).toEqual({});
  expect(ruleStatus(getRule("VIC.USE.PURPOSE_LIMIT"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.SECURITY.REASONABLE_STEPS", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.SECURITY.REASONABLE_STEPS").params).toEqual({});
  expect(ruleStatus(getRule("VIC.SECURITY.REASONABLE_STEPS"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.RETENTION.SUCCESSFUL_3Y", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.RETENTION.SUCCESSFUL_3Y").params).toEqual({ yearsAfterTermination: 3 });
  expect(ruleStatus(getRule("VIC.RETENTION.SUCCESSFUL_3Y"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.RETENTION.UNSUCCESSFUL_30D", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.RETENTION.UNSUCCESSFUL_30D").params).toEqual({ daysAfterAgreement: 30 });
  expect(ruleStatus(getRule("VIC.RETENTION.UNSUCCESSFUL_30D"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M").params).toEqual({
    monthsAfterAgreement: 6,
    requiresWrittenConsent: true,
  });
  expect(ruleStatus(getRule("VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.RETENTION.EXCEPTIONS", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.RETENTION.EXCEPTIONS").params).toEqual({});
  expect(ruleStatus(getRule("VIC.RETENTION.EXCEPTIONS"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DISCLOSE.WRITTEN_CONSENT", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DISCLOSE.WRITTEN_CONSENT").params).toEqual({});
  expect(ruleStatus(getRule("VIC.DISCLOSE.WRITTEN_CONSENT"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.PRIVACY.RELATIONSHIP_OTHER_LAWS", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.PRIVACY.RELATIONSHIP_OTHER_LAWS").params).toEqual({});
  expect(ruleStatus(getRule("VIC.PRIVACY.RELATIONSHIP_OTHER_LAWS"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DB.DISCLOSE_IN_FORM", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DB.DISCLOSE_IN_FORM").params).toEqual({ maxRows: 3 });
  expect(ruleStatus(getRule("VIC.DB.DISCLOSE_IN_FORM"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.DB.LISTING_NOTICE_7D", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.DB.LISTING_NOTICE_7D").params).toEqual({ daysAfterUse: 7 });
  expect(ruleStatus(getRule("VIC.DB.LISTING_NOTICE_7D"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.FEES.THIRD_PARTY_BAN", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.FEES.THIRD_PARTY_BAN").params).toEqual({
    appliesTo: ["third_party"],
    matters: [
      "application",
      "background_check",
      "tenancy_history_check",
      "credit_check",
      "database_check",
      "identity_verification",
      "administrative",
      "failed_payment",
      "rent_payment",
    ],
  });
  expect(ruleStatus(getRule("VIC.FEES.THIRD_PARTY_BAN"), "2026-11-04")).toBe("expired");
});
ruleTest("VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN").params).toEqual({
    appliesTo: ["third_party", "agent", "provider"],
    exempt: ["adi"],
    matters: [
      "application",
      "background_check",
      "tenancy_history_check",
      "credit_check",
      "database_check",
      "identity_verification",
      "administrative",
      "failed_payment",
      "rent_payment",
    ],
  });
  expect(ruleStatus(getRule("VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.FORM.SEPARATE_FORM_PER_ADULT", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.FORM.SEPARATE_FORM_PER_ADULT").params).toEqual({ minAge: 18 });
  expect(ruleStatus(getRule("VIC.FORM.SEPARATE_FORM_PER_ADULT"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.PENALTY_UNIT.2026_27", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.PENALTY_UNIT.2026_27").params).toEqual({ valueAUD: 209.1 });
  expect(ruleStatus(getRule("VIC.PENALTY_UNIT.2026_27"), "2026-11-04")).toBe("in_force");
});
ruleTest("VIC.PENALTY_UNIT.2025_26", "applies the cited parameters and commencement", () => {
  expect(getRule("VIC.PENALTY_UNIT.2025_26").params).toEqual({ valueAUD: 203.51 });
  expect(ruleStatus(getRule("VIC.PENALTY_UNIT.2025_26"), "2026-11-04")).toBe("expired");
});
ruleTest("NSW.CURRENT.NO_APPLICATION_FEES_S23", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.CURRENT.NO_APPLICATION_FEES_S23").params).toEqual({
    allowedPreAgreement: ["holding_fee", "rent", "bond", "registration_fee"],
  });
  expect(ruleStatus(getRule("NSW.CURRENT.NO_APPLICATION_FEES_S23"), "2026-11-04")).toBe("guidance");
});
ruleTest("NSW.GUIDANCE.SIGHT_ID_DONT_STORE", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.GUIDANCE.SIGHT_ID_DONT_STORE").params).toEqual({ deleteAfterVerification: true });
  expect(ruleStatus(getRule("NSW.GUIDANCE.SIGHT_ID_DONT_STORE"), "2026-11-04")).toBe("guidance");
});
ruleTest("NSW.GUIDANCE.REDACT_BANK_TRANSACTIONS", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.GUIDANCE.REDACT_BANK_TRANSACTIONS").params).toEqual({});
  expect(ruleStatus(getRule("NSW.GUIDANCE.REDACT_BANK_TRANSACTIONS"), "2026-11-04")).toBe("guidance");
});
ruleTest("NSW.GUIDANCE.MINIMUM_NECESSARY", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.GUIDANCE.MINIMUM_NECESSARY").params).toEqual({
    excluded: [
      "marital_status",
      "bond_claim_history",
      "dispute_history",
      "credit_report",
      "non_lessee_employment",
    ],
  });
  expect(ruleStatus(getRule("NSW.GUIDANCE.MINIMUM_NECESSARY"), "2026-11-04")).toBe("guidance");
});
ruleTest("NSW.PPI.APPS_APPLY", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.APPS_APPLY").params).toEqual({});
  expect(ruleStatus(getRule("NSW.PPI.APPS_APPLY"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.ENTITY_DEFINITION", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.ENTITY_DEFINITION").params).toEqual({ includesTenantEngagedServices: true });
  expect(ruleStatus(getRule("NSW.PPI.ENTITY_DEFINITION"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.DIRECT_COLLECTION", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.DIRECT_COLLECTION").params).toEqual({});
  expect(ruleStatus(getRule("NSW.PPI.DIRECT_COLLECTION"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.APPROVED_FORM", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.APPROVED_FORM").params).toEqual({
    formId: null,
    provisionalFormId: "NSW-PROVISIONAL-2026-11-04",
  });
  expect(ruleStatus(getRule("NSW.PPI.APPROVED_FORM"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.INSPECT_BEFORE_APPLY", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.INSPECT_BEFORE_APPLY").params).toEqual({
    writtenStatementExceptions: ["unable", "does_not_wish"],
  });
  expect(ruleStatus(getRule("NSW.PPI.INSPECT_BEFORE_APPLY"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.ID_AFTER_INTENT_NOTICE", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.ID_AFTER_INTENT_NOTICE").params).toEqual({
    requiresIntent: true,
    requiresPriorWrittenNotice: true,
  });
  expect(ruleStatus(getRule("NSW.PPI.ID_AFTER_INTENT_NOTICE"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD").params).toEqual({ businessDays: 2 });
  expect(ruleStatus(getRule("NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD"), "2026-11-04")).toBe(
    "pending_commencement",
  );
});
ruleTest("NSW.PPI.REGULATIONS_PENDING", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.REGULATIONS_PENDING").params).toEqual({
    topics: [
      "info_types",
      "documents",
      "doc_count",
      "tenant_choice",
      "digital_id",
      "security",
      "retention_max",
      "access_correction",
      "records",
    ],
  });
  expect(ruleStatus(getRule("NSW.PPI.REGULATIONS_PENDING"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PPI.TRIBUNAL_ORDERS", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PPI.TRIBUNAL_ORDERS").params).toEqual({});
  expect(ruleStatus(getRule("NSW.PPI.TRIBUNAL_ORDERS"), "2026-11-04")).toBe("pending_commencement");
});
ruleTest("NSW.PENALTY_UNIT", "applies the cited parameters and commencement", () => {
  expect(getRule("NSW.PENALTY_UNIT").params).toEqual({ valueAUD: 110 });
  expect(ruleStatus(getRule("NSW.PENALTY_UNIT"), "2026-11-04")).toBe("in_force");
});
ruleTest("CTH.PRIVACY.COVERAGE_THRESHOLD", "applies the cited parameters and commencement", () => {
  expect(getRule("CTH.PRIVACY.COVERAGE_THRESHOLD").params).toEqual({
    turnoverAUD: 3000000,
    alwaysCovered: ["residential_tenancy_database_operator"],
  });
  expect(ruleStatus(getRule("CTH.PRIVACY.COVERAGE_THRESHOLD"), "2026-11-04")).toBe("guidance");
});
ruleTest("CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED", "applies the cited parameters and commencement", () => {
  expect(getRule("CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED").params).toEqual({});
  expect(ruleStatus(getRule("CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED"), "2026-11-04")).toBe("guidance");
});
