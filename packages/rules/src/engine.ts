import { jurisdictionPolicy } from "./policies";
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
  const policy = jurisdictionPolicy(input.jurisdiction);
  const fin = policy.financial.allowed;
  const ids = policy.identity.allowed;
  const add = (path: string, ruleId: string, reason: string) => v.push({ path, ruleId, reason });
  if (
    input.financialRequested.some((t) => !fin.includes(t)) ||
    input.financialRequested.length > policy.financial.max ||
    new Set(input.financialRequested).size !== input.financialRequested.length ||
    input.maxFinancialDocs < 0 ||
    input.maxFinancialDocs > policy.financial.max ||
    !Number.isInteger(input.maxFinancialDocs) ||
    (policy.identity.allowApplicationStage && input.financialRequested.length > input.maxFinancialDocs)
  )
    add(
      "financialRequested",
      policy.financial.ruleId,
      "Only permitted document types; at most two, without duplicates.",
    );
  if (
    input.identityRequested.length > policy.identity.max ||
    input.identityRequested.some((t) => !ids.includes(t)) ||
    new Set(input.identityRequested).size !== input.identityRequested.length
  )
    add(
      "identityRequested",
      policy.identity.ruleId,
      "Request at most two permitted identity document types.",
    );
  if (!policy.identity.allowApplicationStage && input.identityStage !== "preferred")
    add(
      "identityStage",
      policy.identity.timingRuleId,
      "NSW identity collection is only after a prior written intent notice. PROVISIONAL.",
    );
  if (input.tenancyDatabases.length > policy.database.max)
    add("tenancyDatabases", policy.database.discloseRuleId, "At most three tenancy databases.");
  if (
    [...policy.excludedProviders, ...policy.excludedPrograms].some(
      (t) => t === input.providerType || t === input.programType,
    )
  )
    add("providerType", policy.formRuleId, "Use not supported for excluded providers or housing programs.");
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
  const policy = jurisdictionPolicy(ctx.jurisdiction);
  const ruleId = policy.identity.timingRuleId;
  const atApplication =
    policy.identity.allowApplicationStage &&
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
  const policy = jurisdictionPolicy(input.jurisdiction);
  if (policy.fees.guidanceRuleId && policy.fees.guidanceProhibited)
    return {
      result: "prohibited",
      ruleIds: [policy.fees.guidanceRuleId],
      ...(policy.fees.note ? { note: policy.fees.note } : {}),
    };
  const applicable = activeRules(input.jurisdiction, input.on).filter((r) => r.kind === "fee");
  for (const r of applicable) {
    const params = r.params;
    if ((params.exempt as string[] | undefined)?.includes(input.chargedBy))
      return { result: "not_prohibited_by_encoded_rules", ruleIds: [r.id] };
    if (
      (params.appliesTo as string[] | undefined)?.includes(input.chargedBy) &&
      (params.matters as string[] | undefined)?.includes(input.matter)
    )
      return { result: "prohibited", ruleIds: [r.id] };
    if ((params.unknownFor as string[] | undefined)?.includes(input.chargedBy))
      return { result: "unknown", ruleIds: [r.id], note: r.notes ?? "UNVERIFIED historical rule wording." };
  }
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
  const policy = jurisdictionPolicy(ctx.jurisdiction);
  if (policy.database.noticeRuleId && ctx.databaseListingFound && ctx.dbCheckedAt)
    notices.push({
      type: "vic_439d_database_listing",
      ruleId: policy.database.noticeRuleId!,
      dueAt: new Date(
        new Date(ctx.dbCheckedAt).getTime() +
          Number(getRule(policy.database.noticeRuleId!).params.daysAfterUse) * 86400000,
      ).toISOString(),
      beforeCollection: false,
    });
  if (!policy.identity.allowApplicationStage && ctx.collectingIdentity)
    notices.push({
      type: "nsw_210e_intent",
      ruleId: policy.identity.timingRuleId,
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
    ruleId: jurisdictionPolicy(j === "CTH" ? "NSW" : j).collectionRuleId,
    reason: "Not requested or not permitted by this form.",
  }));
}
