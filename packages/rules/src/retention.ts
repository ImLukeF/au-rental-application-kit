import { z } from "zod";
import { addBusinessDays, addDays, addMonths, addYears, deadline } from "./dates";
import { jurisdictionPolicy, ruleParameter } from "./policies";
import type {
  EngineOptions,
  ISODate,
  Jurisdiction,
  RetentionEvent,
  RetentionPolicy,
  Violation,
} from "./types";
export const retentionPolicySchema = z.strictObject({
  unsuccessfulDays: z.number().int().min(0).max(28),
  keepConsentedUnsuccessful: z.boolean(),
  successfulHandoffDays: z.number().int().min(0).max(90),
  withdrawnDays: z.number().int().min(0).max(7),
  listingWithdrawnDays: z.number().int().min(0).max(28),
  identityDocMaxDays: z.number().int().min(0).max(7),
});
export const DEFAULT_RETENTION: RetentionPolicy = {
  unsuccessfulDays: 14,
  keepConsentedUnsuccessful: false,
  successfulHandoffDays: 30,
  withdrawnDays: 2,
  listingWithdrawnDays: 14,
  identityDocMaxDays: 7,
};
export function validateRetentionPolicy(policy: RetentionPolicy, j: Jurisdiction = "VIC"): Violation[] {
  return retentionPolicySchema.safeParse(policy).success
    ? []
    : [
        {
          path: "retentionPolicy",
          ruleId:
            jurisdictionPolicy(j).retention.unsuccessfulRuleId ??
            jurisdictionPolicy(j).retention.fallbackRuleId,
          reason:
            "Policy exceeds legal safety margin or kit cap (28 unsuccessful days; 7 withdrawn/identity days; 90 handoff days).",
        },
      ];
}
export function computeRetention(
  event: RetentionEvent,
  j: Jurisdiction,
  _on: ISODate,
  _opts: EngineOptions = {},
  policy: RetentionPolicy = DEFAULT_RETENTION,
): { legalDeadline: string | null; policyDeadline: string; ruleIds: string[] } {
  const errors = validateRetentionPolicy(policy, j);
  if (errors.length) throw new Error(errors[0]!.ruleId);
  let legal: string | null = null;
  let due: string;
  const cfg = jurisdictionPolicy(j).retention;
  let rule = cfg.fallbackRuleId;
  switch (event.kind) {
    case "unsuccessful": {
      due = deadline(addDays(event.agreementDate, policy.unsuccessfulDays));
      if (cfg.unsuccessfulRuleId) {
        rule =
          event.vicOtherPremisesConsent && cfg.consentedRuleId ? cfg.consentedRuleId : cfg.unsuccessfulRuleId;
        legal = deadline(
          event.vicOtherPremisesConsent
            ? addMonths(event.agreementDate, ruleParameter(rule, "monthsAfterAgreement") ?? 0)
            : addDays(event.agreementDate, ruleParameter(rule, "daysAfterAgreement") ?? 0),
        );
        if (event.vicOtherPremisesConsent && policy.keepConsentedUnsuccessful) due = legal;
      }
      break;
    }
    case "successful":
      due = deadline(addDays(event.agreementDate, policy.successfulHandoffDays));
      if (cfg.successfulRuleId) {
        rule = cfg.successfulRuleId;
        if (event.tenancyEndDate)
          legal = deadline(addYears(event.tenancyEndDate, ruleParameter(rule, "yearsAfterTermination") ?? 0));
      }
      break;
    case "listing_withdrawn_no_agreement":
      due = deadline(addDays(event.closedOn, policy.listingWithdrawnDays));
      break;
    case "application_withdrawn":
      due = new Date(new Date(event.withdrawnAt).getTime() + policy.withdrawnDays * 86400000).toISOString();
      break;
    case "identity_document": {
      rule = cfg.identityRuleId;
      due = new Date(
        Math.min(
          new Date(event.uploadedAt).getTime() + policy.identityDocMaxDays * 86400000,
          ...[event.verifiedAt, event.decidedAt]
            .filter((t): t is string => !!t)
            .map((t) => new Date(t).getTime()),
        ),
      ).toISOString();
      break;
    }
    case "improperly_collected":
      rule = cfg.improperRuleId ?? cfg.identityRuleId;
      legal = cfg.improperRuleId
        ? addBusinessDays(event.awareAt, ruleParameter(cfg.improperRuleId, "businessDays") ?? 0)
        : null;
      due = event.awareAt;
      break;
  }
  if (legal && event.kind !== "improperly_collected")
    due = new Date(Math.min(new Date(due).getTime(), new Date(legal).getTime() - 2 * 86400000)).toISOString();
  return { legalDeadline: legal, policyDeadline: due, ruleIds: [rule] };
}
