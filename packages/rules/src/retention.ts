import { z } from "zod";
import { addBusinessDays, addDays, addMonths, addYears, deadline } from "./dates";
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
          ruleId: j === "VIC" ? "VIC.RETENTION.UNSUCCESSFUL_30D" : "NSW.PPI.REGULATIONS_PENDING",
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
  let rule = j === "VIC" ? "VIC.RETENTION.EXCEPTIONS" : "NSW.PPI.REGULATIONS_PENDING";
  switch (event.kind) {
    case "unsuccessful": {
      due = deadline(addDays(event.agreementDate, policy.unsuccessfulDays));
      if (j === "VIC") {
        rule = event.vicOtherPremisesConsent
          ? "VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M"
          : "VIC.RETENTION.UNSUCCESSFUL_30D";
        legal = deadline(
          event.vicOtherPremisesConsent
            ? addMonths(event.agreementDate, 6)
            : addDays(event.agreementDate, 30),
        );
        if (event.vicOtherPremisesConsent && policy.keepConsentedUnsuccessful) due = legal;
      }
      break;
    }
    case "successful":
      due = deadline(addDays(event.agreementDate, policy.successfulHandoffDays));
      if (j === "VIC") {
        rule = "VIC.RETENTION.SUCCESSFUL_3Y";
        if (event.tenancyEndDate) legal = deadline(addYears(event.tenancyEndDate, 3));
      }
      break;
    case "listing_withdrawn_no_agreement":
      due = deadline(addDays(event.closedOn, policy.listingWithdrawnDays));
      break;
    case "application_withdrawn":
      due = new Date(new Date(event.withdrawnAt).getTime() + policy.withdrawnDays * 86400000).toISOString();
      break;
    case "identity_document": {
      rule = j === "NSW" ? "NSW.GUIDANCE.SIGHT_ID_DONT_STORE" : "VIC.SECURITY.REASONABLE_STEPS";
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
      rule = j === "NSW" ? "NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD" : "VIC.SECURITY.REASONABLE_STEPS";
      legal = j === "NSW" ? addBusinessDays(event.awareAt, 2) : null;
      due = event.awareAt;
      break;
  }
  if (legal && event.kind !== "improperly_collected")
    due = new Date(Math.min(new Date(due).getTime(), new Date(legal).getTime() - 2 * 86400000)).toISOString();
  return { legalDeadline: legal, policyDeadline: due, ruleIds: [rule] };
}
