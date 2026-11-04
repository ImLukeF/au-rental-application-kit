import { getRule } from "./registry";
import type { Jurisdiction } from "./types";
export interface JurisdictionPolicy {
  financial: { allowed: readonly string[]; max: number; ruleId: string };
  identity: {
    allowed: readonly string[];
    max: number;
    ruleId: string;
    allowApplicationStage: boolean;
    timingRuleId: string;
  };
  collectionRuleId: string;
  database: { max: number; discloseRuleId: string; noticeRuleId: string | null };
  excludedProviders: readonly string[];
  excludedPrograms: readonly string[];
  formRuleId: string;
  retention: {
    fallbackRuleId: string;
    unsuccessfulRuleId: string | null;
    consentedRuleId: string | null;
    successfulRuleId: string | null;
    improperRuleId: string | null;
    identityRuleId: string;
  };
  fees: { guidanceRuleId: string | null; guidanceProhibited: boolean; note?: string };
}
// Register another jurisdiction's data here; engine algorithms only consume these contracts.
export const POLICIES: Partial<Record<Jurisdiction, JurisdictionPolicy>> = {
  VIC: {
    financial: {
      allowed: ["payslip", "bank_statement_no_transactions", "centrelink_statement_or_letter"],
      max: 2,
      ruleId: "VIC.DOCS.FINANCIAL_MAX_TWO",
    },
    identity: {
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
      max: 2,
      ruleId: "VIC.DOCS.IDENTITY_MAX_TWO",
      allowApplicationStage: true,
      timingRuleId: "VIC.DOCS.IDENTITY_MAX_TWO",
    },
    collectionRuleId: "VIC.COLLECT.ONLY_FORM_3A_INFO",
    database: { max: 3, discloseRuleId: "VIC.DB.DISCLOSE_IN_FORM", noticeRuleId: "VIC.DB.LISTING_NOTICE_7D" },
    excludedProviders: ["homes_victoria", "registered_agency"],
    excludedPrograms: ["victorian_affordable_housing_program", "specialised_housing_program"],
    formRuleId: "VIC.FORM.PRESCRIBED_FORM_3A",
    retention: {
      fallbackRuleId: "VIC.RETENTION.EXCEPTIONS",
      unsuccessfulRuleId: "VIC.RETENTION.UNSUCCESSFUL_30D",
      consentedRuleId: "VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M",
      successfulRuleId: "VIC.RETENTION.SUCCESSFUL_3Y",
      improperRuleId: null,
      identityRuleId: "VIC.SECURITY.REASONABLE_STEPS",
    },
    fees: { guidanceRuleId: null, guidanceProhibited: false },
  },
  NSW: {
    financial: {
      allowed: [
        "payslip",
        "bank_statement_transactions_redacted",
        "centrelink_statement_or_letter",
        "rental_ledger",
        "proof_of_savings",
      ],
      max: 2,
      ruleId: "NSW.GUIDANCE.MINIMUM_NECESSARY",
    },
    identity: {
      allowed: [
        "driver_licence",
        "photo_card",
        "australian_passport",
        "foreign_passport_and_visa",
        "medicare_card",
        "birth_certificate",
        "citizenship_certificate",
        "centrelink_card",
        "student_id",
      ],
      max: 2,
      ruleId: "NSW.PPI.REGULATIONS_PENDING",
      allowApplicationStage: false,
      timingRuleId: "NSW.PPI.ID_AFTER_INTENT_NOTICE",
    },
    collectionRuleId: "NSW.GUIDANCE.MINIMUM_NECESSARY",
    database: { max: 3, discloseRuleId: "NSW.GUIDANCE.MINIMUM_NECESSARY", noticeRuleId: null },
    excludedProviders: [],
    excludedPrograms: [],
    formRuleId: "NSW.PPI.APPROVED_FORM",
    retention: {
      fallbackRuleId: "NSW.PPI.REGULATIONS_PENDING",
      unsuccessfulRuleId: null,
      consentedRuleId: null,
      successfulRuleId: null,
      improperRuleId: "NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD",
      identityRuleId: "NSW.GUIDANCE.SIGHT_ID_DONT_STORE",
    },
    fees: {
      guidanceRuleId: "NSW.CURRENT.NO_APPLICATION_FEES_S23",
      guidanceProhibited: true,
      note: "Regulator guidance; s 23 wording UNVERIFIED.",
    },
  },
};
export function jurisdictionPolicy(j: Jurisdiction): JurisdictionPolicy {
  const policy = POLICIES[j];
  if (!policy) throw new Error("Unsupported jurisdiction");
  return policy;
}
export function ruleParameter(id: string | null, name: string): number | null {
  if (!id) return null;
  const value = getRule(id).params[name];
  return typeof value === "number" ? value : null;
}
