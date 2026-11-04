import { activeRules, getRule } from "./registry";
import type {
  EngineOptions,
  FeeMatter,
  ISODate,
  Jurisdiction,
  ListingRequestInput,
  Penalty,
  Violation,
} from "./types";
export const VIC_FINANCIAL = [
  "payslip",
  "bank_statement_no_transactions",
  "centrelink_statement_or_letter",
] as const;
export const VIC_IDENTITY = [
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
] as const;
export const NSW_FINANCIAL = [
  "payslip",
  "bank_statement_transactions_redacted",
  "centrelink_statement_or_letter",
  "rental_ledger",
  "proof_of_savings",
] as const;
export const NSW_IDENTITY = [
  "driver_licence",
  "photo_card",
  "australian_passport",
  "foreign_passport_and_visa",
  "medicare_card",
  "birth_certificate",
  "citizenship_certificate",
  "centrelink_card",
  "student_id",
] as const;
export function validateListingRequest(
  input: ListingRequestInput,
  _on: ISODate,
  _opts?: EngineOptions,
): Violation[] {
  const v: Violation[] = [];
  const vic = input.jurisdiction === "VIC";
  const fin: readonly string[] = vic ? VIC_FINANCIAL : NSW_FINANCIAL;
  const ids: readonly string[] = vic ? VIC_IDENTITY : NSW_IDENTITY;
  const add = (path: string, ruleId: string, reason: string) => v.push({ path, ruleId, reason });
  if (
    input.financialRequested.some((t) => !fin.includes(t)) ||
    input.financialRequested.length > 2 ||
    new Set(input.financialRequested).size !== input.financialRequested.length ||
    input.maxFinancialDocs < 0 ||
    input.maxFinancialDocs > 2 ||
    !Number.isInteger(input.maxFinancialDocs) ||
    (vic && input.financialRequested.length > input.maxFinancialDocs)
  )
    add(
      "financialRequested",
      vic ? "VIC.DOCS.FINANCIAL_MAX_TWO" : "NSW.GUIDANCE.MINIMUM_NECESSARY",
      "Only permitted document types; at most two, without duplicates.",
    );
  if (
    input.identityRequested.length > 2 ||
    input.identityRequested.some((t) => !ids.includes(t)) ||
    new Set(input.identityRequested).size !== input.identityRequested.length
  )
    add(
      "identityRequested",
      vic ? "VIC.DOCS.IDENTITY_MAX_TWO" : "NSW.PPI.REGULATIONS_PENDING",
      "Request at most two permitted identity document types.",
    );
  if (!vic && input.identityStage !== "preferred")
    add(
      "identityStage",
      "NSW.PPI.ID_AFTER_INTENT_NOTICE",
      "NSW identity collection is only after a prior written intent notice. PROVISIONAL.",
    );
  if (input.tenancyDatabases.length > 3)
    add(
      "tenancyDatabases",
      vic ? "VIC.DB.DISCLOSE_IN_FORM" : "NSW.GUIDANCE.MINIMUM_NECESSARY",
      "At most three tenancy databases.",
    );
  const form = getRule("VIC.FORM.PRESCRIBED_FORM_3A");
  if (
    vic &&
    [...(form.params.excludedProviders as string[]), ...(form.params.excludedPrograms as string[])].some(
      (t) => t === input.providerType || t === input.programType,
    )
  )
    add("providerType", form.id, "Use not supported for excluded providers or housing programs.");
  return v;
}
export function canCollectIdentityDocuments(
  ctx: {
    jurisdiction: "VIC" | "NSW";
    listingIdentityStage: "application" | "preferred";
    applicationStatus: string;
    intentNoticeRecordedAt?: string | null;
  },
  _on: ISODate,
  _opts?: EngineOptions,
): { allowed: boolean; ruleIds: string[]; reason?: string } {
  const ruleId = ctx.jurisdiction === "NSW" ? "NSW.PPI.ID_AFTER_INTENT_NOTICE" : "VIC.DOCS.IDENTITY_MAX_TWO";
  const atApplication =
    ctx.jurisdiction === "VIC" &&
    ctx.listingIdentityStage === "application" &&
    ctx.applicationStatus === "submitted";
  const invited =
    ["preferred", "id_requested"].includes(ctx.applicationStatus) && !!ctx.intentNoticeRecordedAt;
  return atApplication || invited
    ? { allowed: true, ruleIds: [ruleId] }
    : {
        allowed: false,
        ruleIds: [ruleId],
        reason: "Identity documents require preferred-applicant status and a prior written intent notice.",
      };
}
export function penaltyUnitValueAUD(j: "VIC" | "NSW", on: ISODate): { value: number; ruleId: string } | null {
  const r = activeRules(j, on).find((r) => r.id.includes("PENALTY_UNIT"));
  return r ? { value: r.params.valueAUD as number, ruleId: r.id } : null;
}
export function penaltyToAUD(
  p: Penalty,
  j: "VIC" | "NSW",
  on: ISODate,
): { individual?: number; bodyCorporate?: number } {
  const value = penaltyUnitValueAUD(j, on)?.value;
  if (!value) return {};
  const result: { individual?: number; bodyCorporate?: number } = {};
  if (p.individualPU !== undefined) result.individual = Math.round(p.individualPU * value * 100) / 100;
  const company = p.bodyCorporatePU ?? p.otherwisePU;
  if (company !== undefined) result.bodyCorporate = Math.round(company * value * 100) / 100;
  return result;
}
export function evaluateFee(input: {
  jurisdiction: "VIC" | "NSW";
  chargedBy: "third_party" | "agent" | "provider" | "adi";
  matter: FeeMatter;
  on: ISODate;
}): {
  result: "prohibited" | "not_prohibited_by_encoded_rules" | "unknown";
  ruleIds: string[];
  note?: string;
} {
  if (input.jurisdiction === "NSW")
    return {
      result: "prohibited",
      ruleIds: ["NSW.CURRENT.NO_APPLICATION_FEES_S23"],
      note: "Regulator guidance; s 23 wording UNVERIFIED.",
    };
  if (input.chargedBy === "adi")
    return { result: "not_prohibited_by_encoded_rules", ruleIds: ["VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN"] };
  if (input.on >= "2026-10-13")
    return { result: "prohibited", ruleIds: ["VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN"] };
  if (input.on >= "2026-03-31")
    return input.chargedBy === "third_party"
      ? { result: "prohibited", ruleIds: ["VIC.FEES.THIRD_PARTY_BAN"] }
      : {
          result: "unknown",
          ruleIds: ["VIC.FEES.THIRD_PARTY_BAN"],
          note: "Form 3A Part B item 3 states no application fees; pre-13-Oct s 51A wording not reviewed: UNVERIFIED",
        };
  return { result: "not_prohibited_by_encoded_rules", ruleIds: [] };
}
export function requiredNotices(
  ctx: {
    jurisdiction: "VIC" | "NSW";
    databaseListingFound?: boolean;
    dbCheckedAt?: string;
    collectingIdentity?: boolean;
  },
  _on: ISODate,
  _opts?: EngineOptions,
) {
  const notices: { type: string; ruleId: string; dueAt: string | null; beforeCollection: boolean }[] = [];
  if (ctx.jurisdiction === "VIC" && ctx.databaseListingFound && ctx.dbCheckedAt)
    notices.push({
      type: "vic_439d_database_listing",
      ruleId: "VIC.DB.LISTING_NOTICE_7D",
      dueAt: new Date(new Date(ctx.dbCheckedAt).getTime() + 7 * 86400000).toISOString(),
      beforeCollection: false,
    });
  if (ctx.jurisdiction === "NSW" && ctx.collectingIdentity)
    notices.push({
      type: "nsw_210e_intent",
      ruleId: "NSW.PPI.ID_AFTER_INTENT_NOTICE",
      dueAt: null,
      beforeCollection: true,
    });
  return notices;
}
export function excludedInformationCatalogue(j: Jurisdiction) {
  return [
    "Photos or selfies",
    "Social media accounts",
    "Relationship or marital status",
    "Children’s names, ages or schools",
    "Physical features or tattoos",
    "Protected attributes",
    "Tax file number",
    "Credit report",
    "Bond claim history",
    "Tribunal or dispute history",
    "Bank transactions",
    "Employment information of adults not on the lease",
    "Pet details",
  ].map((path) => ({
    path,
    ruleId: j === "VIC" ? "VIC.COLLECT.ONLY_FORM_3A_INFO" : "NSW.GUIDANCE.MINIMUM_NECESSARY",
    reason: "Not requested or not permitted by this form.",
  }));
}
