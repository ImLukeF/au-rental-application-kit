export type Jurisdiction = "VIC" | "NSW" | "CTH";
export type ISODate = `${number}-${number}-${number}`;
export interface Citation {
  instrument: string;
  pinpoint: string;
  url: string;
  checkedOn: ISODate;
  sourceKind:
    | "legislation"
    | "bill"
    | "regulator_guidance"
    | "regulator_form"
    | "government_release"
    | "secondary";
  versionNote?: string;
  excerpt?: string;
}
export type Confidence = "verified_primary" | "verified_secondary" | "unverified";
export type Commencement =
  | { kind: "fixed"; from: ISODate; to?: ISODate }
  | { kind: "pending_proclamation"; configKey: "NSW_PPI_COMMENCEMENT_DATE" }
  | { kind: "guidance" };
export interface Penalty {
  individualPU?: number;
  bodyCorporatePU?: number;
  otherwisePU?: number;
}
export type RuleKind =
  | "form"
  | "collection_limit"
  | "document_limit"
  | "id_timing"
  | "inspection"
  | "purpose_limit"
  | "security"
  | "retention"
  | "disclosure"
  | "fee"
  | "notice"
  | "statement"
  | "informational";
export interface Rule<P = Record<string, unknown>> {
  id: string;
  jurisdiction: Jurisdiction;
  kind: RuleKind;
  title: string;
  summary: string;
  commencement: Commencement;
  params: P;
  penalty?: Penalty;
  citations: [Citation, ...Citation[]];
  confidence: Confidence;
  notes?: string;
}
export type RuleStatus = "in_force" | "not_yet_in_force" | "pending_commencement" | "guidance" | "expired";
export interface EngineOptions {
  nswPpiCommencementDate?: ISODate | null;
}
export interface Violation {
  path: string;
  ruleId: string;
  reason: string;
}
export interface ListingRequestInput {
  jurisdiction: "VIC" | "NSW";
  financialRequested: string[];
  identityRequested: string[];
  identityStage: "application" | "preferred";
  maxFinancialDocs: number;
  tenancyDatabases: readonly unknown[];
  providerType?: string | undefined;
  programType?: string | undefined;
}
export type RetentionEvent =
  | { kind: "unsuccessful"; agreementDate: ISODate; vicOtherPremisesConsent: boolean }
  | { kind: "listing_withdrawn_no_agreement"; closedOn: ISODate }
  | { kind: "application_withdrawn"; withdrawnAt: string }
  | { kind: "successful"; agreementDate: ISODate; tenancyEndDate?: ISODate }
  | { kind: "identity_document"; uploadedAt: string; verifiedAt?: string; decidedAt?: string }
  | { kind: "improperly_collected"; awareAt: string };
export interface RetentionPolicy {
  unsuccessfulDays: number;
  keepConsentedUnsuccessful: boolean;
  successfulHandoffDays: number;
  withdrawnDays: number;
  listingWithdrawnDays: number;
  identityDocMaxDays: number;
}
export type FeeMatter =
  | "application"
  | "background_check"
  | "tenancy_history_check"
  | "credit_check"
  | "database_check"
  | "identity_verification"
  | "administrative"
  | "failed_payment"
  | "rent_payment";
