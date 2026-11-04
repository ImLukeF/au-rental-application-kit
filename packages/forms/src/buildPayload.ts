import type { EngineOptions, ISODate, Violation } from "@aurak/rules";
import { addYears, excludedInformationCatalogue, rulesVersion, validateListingRequest } from "@aurak/rules";
import { CONSENTS } from "./consents";
import type {
  ApplicationExportV1,
  DocumentRef,
  ListingPublicV1,
  NswInspection,
  RenterProfile,
} from "./schemas";
import { applicationSchema, listingSchema, profileSchema } from "./schemas";
import { DISCLAIMER, NSW_PROVISIONAL_BANNER } from "./text";
export interface Selections {
  financialDocIds: string[];
  identityDocIds: string[];
  historyIds: [string, string?];
  refereeIds: string[];
  inspection?: NswInspection;
  consents: Record<string, boolean>;
  signature: { printName: string; date: ISODate };
}
export interface SharedItem {
  path: string;
  label: string;
}
export interface ExcludedItem {
  path: string;
  ruleId: string;
  reason: string;
}
export function buildPayload(input: {
  profile: RenterProfile;
  listing: ListingPublicV1;
  documents?: DocumentRef[];
  selections: Selections;
  on: ISODate;
  opts?: EngineOptions;
}): {
  payload: ApplicationExportV1 | null;
  shared: SharedItem[];
  excluded: ExcludedItem[];
  errors: Violation[];
} {
  const { profile, listing, selections, on } = input;
  const vic = listing.jurisdiction === "VIC";
  const collectionRule = vic ? "VIC.COLLECT.ONLY_FORM_3A_INFO" : "NSW.GUIDANCE.MINIMUM_NECESSARY";
  const errors = validateListingRequest(listing, on, input.opts);
  const excluded: ExcludedItem[] = [];
  const shared: SharedItem[] = [];
  const reject = (path: string, reason: string, ruleId = collectionRule) =>
    errors.push({ path, ruleId, reason });
  if (!profileSchema.safeParse(profile).success) reject("profile", "Complete and correct the profile first.");
  if (!listingSchema.safeParse(listing).success) reject("listing", "Invalid listing.");
  if (on < addYears(profile.personal.dateOfBirth as ISODate, 16))
    reject(
      "personal.dateOfBirth",
      "Applicants must be at least 16. Discuss a separate form with the provider if under 18.",
    );
  const documentMap = new Map((input.documents ?? []).map((d) => [d.docId, d]));
  const selected = [...selections.financialDocIds, ...selections.identityDocIds];
  if (new Set(selected).size !== selected.length)
    reject("documents", "Each document may be included only once.");
  const selectDocs = (ids: string[], category: "financial" | "identity") => {
    const docs: DocumentRef[] = [];
    for (const id of ids) {
      const doc = documentMap.get(id);
      if (!doc) {
        reject("documents", "Selected document is unavailable.");
        continue;
      }
      const allowed = category === "financial" ? listing.financialRequested : listing.identityRequested;
      if (!allowed.includes(doc.type))
        reject(
          "documents",
          "Document type not requested by this agent.",
          category === "identity" && !vic ? "NSW.PPI.ID_AFTER_INTENT_NOTICE" : collectionRule,
        );
      docs.push(doc);
    }
    return docs;
  };
  const financial = selectDocs(selections.financialDocIds, "financial");
  const identity = selectDocs(selections.identityDocIds, "identity");
  if (financial.length > listing.maxFinancialDocs)
    reject(
      "financialDocuments",
      "Too many financial documents.",
      vic ? "VIC.DOCS.FINANCIAL_MAX_TWO" : collectionRule,
    );
  if (identity.length > 2)
    reject(
      "identityDocuments",
      "At most two identity documents.",
      vic ? "VIC.DOCS.IDENTITY_MAX_TWO" : "NSW.PPI.REGULATIONS_PENDING",
    );
  const earlyId = vic && listing.identityStage === "application";
  if (!earlyId && identity.length)
    reject(
      "identityDocuments",
      "ID documents are requested later, only from the preferred applicant.",
      vic ? "VIC.DOCS.IDENTITY_MAX_TWO" : "NSW.PPI.ID_AFTER_INTENT_NOTICE",
    );
  for (const type of listing.financialRequested) {
    if (vic && !financial.some((d) => d.type === type))
      reject("financialDocuments", `Provide one ${type} document requested by the agent.`);
  }
  if (earlyId)
    for (const type of listing.identityRequested)
      if (!identity.some((d) => d.type === type))
        reject("identityDocuments", `Provide the requested ${type} document.`);
  for (const d of documentMap.values())
    if (!selected.includes(d.docId))
      excluded.push({
        path: `documents.${d.docId}`,
        ruleId:
          d.type.includes("passport") || listing.identityRequested.includes(d.type)
            ? vic
              ? "VIC.DOCS.IDENTITY_MAX_TWO"
              : "NSW.PPI.ID_AFTER_INTENT_NOTICE"
            : collectionRule,
        reason: "Document not selected or not requested at this stage.",
      });
  if (
    financial.reduce((n, d) => n + d.byteLength, 0) + identity.reduce((n, d) => n + d.byteLength, 0) >
    24 * 1024 * 1024
  )
    reject("documents", "Selected files leave insufficient space within the 25 MB submission limit.");
  const addresses = selections.historyIds
    .map((id) => profile.addresses[Number(id)])
    .filter((a): a is RenterProfile["addresses"][number] => !!a);
  if (!addresses.length) reject("addresses", "Select current or most recent address history.");
  for (const [i] of profile.addresses.entries())
    if (!selections.historyIds.includes(String(i)))
      excluded.push({
        path: `profile.addresses[${i}]`,
        ruleId: collectionRule,
        reason: "Only two address-history entries are on this form.",
      });
  const history = (a: RenterProfile["addresses"][number]) => ({
    address: a.address,
    postcode: a.postcode,
    periodFrom: a.from,
    ...(a.to ? { periodTo: a.to } : {}),
    ...(a.providerName ? { providerName: a.providerName } : {}),
    ...(a.providerEmail ? { providerEmail: a.providerEmail } : {}),
    ...(a.providerPhone ? { providerPhone: a.providerPhone } : {}),
  });
  const selectedReferees = listing.refereesRequested
    ? selections.refereeIds
        .map((id) => profile.referees[Number(id)])
        .filter((r): r is RenterProfile["referees"][number] => !!r)
    : [];
  if (listing.refereesRequested && (selectedReferees.length === 0 || selectedReferees.length > 2))
    reject("referees", "Choose one or two requested referees.");
  profile.referees.forEach((_, i) => {
    if (!listing.refereesRequested || !selections.refereeIds.includes(String(i)))
      excluded.push({
        path: `profile.referees[${i}]`,
        ruleId: collectionRule,
        reason: listing.refereesRequested ? "Referee not selected." : "References not requested.",
      });
  });
  if (!vic && !selections.inspection)
    reject(
      "inspection",
      "Record inspection or the written statement exception.",
      "NSW.PPI.INSPECT_BEFORE_APPLY",
    );
  if (!selections.consents["share_with_agency@1"])
    reject("consents", "Consent to share this application is required.");
  if (
    (listing.refereesRequested || addresses.some((a) => a.providerName)) &&
    !selections.consents["referee_contact@1"]
  )
    reject("consents", "Consent is required before reference checks.");
  if (listing.tenancyDatabases.length && !selections.consents["tenancy_database_check@1"])
    reject("consents", "Acknowledge the listed tenancy database checks.");
  if (
    !vic &&
    selections.inspection?.status !== "inspected" &&
    !selections.consents["nsw_inspection_statement@1"]
  )
    reject("inspection", "Confirm the written inspection statement.", "NSW.PPI.INSPECT_BEFORE_APPLY");
  if (selections.signature.printName !== profile.personal.fullName)
    reject("signature", "Typed signature must match your full name.");
  const current = profile.addresses.find((a) => a.isCurrent) ?? profile.addresses[0];
  const first = addresses[0];
  if (!first || !current) return { payload: null, shared, excluded, errors };
  const employment = {
    ...(profile.employment.employer ? { employer: profile.employment.employer } : {}),
    ...(profile.employment.netWeeklyIncomeCents !== undefined
      ? { netWeeklyIncomeCents: profile.employment.netWeeklyIncomeCents }
      : {}),
    ...(profile.employment.endedOn ? { employmentEndedOn: profile.employment.endedOn } : {}),
  };
  const personal = { ...profile.personal, currentAddress: current.address, postcode: current.postcode };
  const rentalHistory = {
    property1: history(first),
    ...(addresses[1] ? { property2: history(addresses[1]) } : {}),
  };
  const signature = {
    ...selections.signature,
    signature: selections.signature.printName,
    signatureMethod: "typed",
  };
  const at = `${on}T00:00:00.000Z`;
  const consents = CONSENTS.filter(
    (c) => c.jurisdictions.some((j) => j === listing.jurisdiction) && selections.consents[c.id] !== undefined,
  ).map((c) => ({ id: c.id, sha256: c.sha256, granted: selections.consents[c.id] === true, at }));
  const common = {
    $schema:
      "https://github.com/ImLukeF/au-rental-application-kit/blob/main/schemas/application.v1.schema.json",
    schemaVersion: "aurak.application.v1",
    rulesVersion: rulesVersion(),
    generatedAt: at,
    generator: { name: "au-rental-application-kit", version: "0.1.0" },
    listing: {
      item1: listing.item1,
      item2: listing.item2,
      item6Requested: listing.financialRequested,
      item7Requested: listing.identityRequested,
      item11: listing.tenancyDatabases,
    },
    consents,
    excluded,
    disclaimer: DISCLAIMER,
    provisionalBanner: vic ? null : NSW_PROVISIONAL_BANNER,
  };
  const finances = { documents: financial, noRegularIncomeDetails: profile.noRegularIncomeDetails ?? null };
  const candidate = vic
    ? {
        ...common,
        jurisdiction: "VIC",
        formId: "VIC-3A-2026-03-31",
        provisional: false,
        applicant: {
          item3: { totalOccupants: profile.occupantsDefault ?? 1 },
          item4: personal,
          item5: {
            ...employment,
            ...(profile.employment.employerAddress
              ? { employerAddress: profile.employment.employerAddress }
              : {}),
          },
          item6: finances,
          item7: { documents: identity },
          item8: rentalHistory,
          item9: selectedReferees[0]
            ? {
                referee1: selectedReferees[0],
                ...(selectedReferees[1] ? { referee2: selectedReferees[1] } : {}),
              }
            : null,
          item10: {
            desiredLeaseTerm: profile.preferences.desiredLeaseTerm,
            preferredMoveInDate: profile.preferences.preferredMoveInDate ?? on,
          },
          item12: signature,
        },
      }
    : {
        ...common,
        jurisdiction: "NSW",
        formId: "NSW-PROVISIONAL-2026-11-04",
        provisional: true,
        applicant: {
          nsw: {
            occupants: { total: profile.occupantsDefault ?? 1 },
            applicant: personal,
            employment,
            financialEvidence: finances,
            rentalHistory,
            references: selectedReferees,
            lease: {
              desiredTerm: profile.preferences.desiredLeaseTerm,
              preferredMoveInDate: profile.preferences.preferredMoveInDate ?? on,
            },
            inspection: selections.inspection,
            declaration: signature,
          },
        },
      };
  const parsed = applicationSchema.safeParse(candidate);
  if (!parsed.success) for (const issue of parsed.error.issues) reject(issue.path.join("."), issue.message);
  if (parsed.success) {
    for (const key of Object.keys(parsed.data.applicant))
      shared.push({ path: `applicant.${key}`, label: vic ? `Form 3A ${key}` : key });
  }
  return { payload: parsed.success && errors.length === 0 ? parsed.data : null, shared, excluded, errors };
}
export function exportApplicationJson(payload: ApplicationExportV1): string {
  return JSON.stringify(applicationSchema.parse(payload), null, 2);
}
export function documentRefs(payload: ApplicationExportV1): {
  financial: DocumentRef[];
  identity: DocumentRef[];
} {
  return payload.jurisdiction === "VIC"
    ? { financial: payload.applicant.item6.documents, identity: payload.applicant.item7.documents }
    : { financial: payload.applicant.nsw.financialEvidence.documents, identity: [] };
}
export function validatePayloadForListing(
  payload: ApplicationExportV1,
  listing: ListingPublicV1,
  on: ISODate,
): Violation[] {
  const v = validateListingRequest(listing, on);
  const vic = listing.jurisdiction === "VIC";
  const ruleId = vic ? "VIC.COLLECT.ONLY_FORM_3A_INFO" : "NSW.GUIDANCE.MINIMUM_NECESSARY";
  const add = (path: string, reason: string, id = ruleId) => v.push({ path, reason, ruleId: id });
  if (
    payload.jurisdiction !== listing.jurisdiction ||
    payload.formId !== listing.formId ||
    payload.rulesVersion !== listing.rulesVersion
  )
    add("formId", "Listing jurisdiction, form and rules version must match.");
  const expected = {
    item1: listing.item1,
    item2: listing.item2,
    item6Requested: listing.financialRequested,
    item7Requested: listing.identityRequested,
    item11: listing.tenancyDatabases,
  };
  if (JSON.stringify(payload.listing) !== JSON.stringify(expected))
    add("listing", "Listing details cannot be modified by the applicant.");
  const docs = documentRefs(payload);
  if (
    docs.financial.length > listing.maxFinancialDocs ||
    docs.financial.some((d) => !listing.financialRequested.includes(d.type))
  )
    add(
      "financialDocuments",
      "Requested financial types and limits must match.",
      vic ? "VIC.DOCS.FINANCIAL_MAX_TWO" : ruleId,
    );
  if (vic) {
    for (const type of listing.financialRequested)
      if (!docs.financial.some((d) => d.type === type))
        add("financialDocuments", "A requested financial document is missing.");
  }
  if (docs.identity.length && (!vic || listing.identityStage !== "application"))
    add(
      "identityDocuments",
      "Identity documents may only be provided at the permitted stage.",
      vic ? "VIC.DOCS.IDENTITY_MAX_TWO" : "NSW.PPI.ID_AFTER_INTENT_NOTICE",
    );
  if (docs.identity.length > 2 || docs.identity.some((d) => !listing.identityRequested.includes(d.type)))
    add("identityDocuments", "Identity types do not match the request.", "VIC.DOCS.IDENTITY_MAX_TWO");
  if (vic && listing.identityStage === "application")
    for (const type of listing.identityRequested)
      if (!docs.identity.some((d) => d.type === type))
        add("identityDocuments", "A requested identity document is missing.");
  if (payload.jurisdiction === "VIC" && !listing.refereesRequested && payload.applicant.item9 !== null)
    add("item9", "References were not requested.");
  if (payload.jurisdiction === "NSW" && !listing.refereesRequested && payload.applicant.nsw.references.length)
    add("references", "References were not requested.");
  const personal = payload.jurisdiction === "VIC" ? payload.applicant.item4 : payload.applicant.nsw.applicant;
  if (on < addYears(personal.dateOfBirth as ISODate, 16))
    add("dateOfBirth", "Applicant must be at least 16.");
  const signature =
    payload.jurisdiction === "VIC" ? payload.applicant.item12 : payload.applicant.nsw.declaration;
  if (signature.printName !== personal.fullName) add("signature", "Signature must match applicant name.");
  for (const consent of payload.consents) {
    const known = CONSENTS.find((c) => c.id === consent.id);
    if (
      !known ||
      known.sha256 !== consent.sha256 ||
      !known.jurisdictions.some((j) => j === listing.jurisdiction)
    )
      add("consents", "Consent version or text hash is invalid.");
  }
  if (new Set(payload.consents.map((c) => c.id)).size !== payload.consents.length)
    add("consents", "Duplicate consent receipts.");
  if (!payload.consents.some((c) => c.id === "share_with_agency@1" && c.granted))
    add("consents", "Sharing consent is required.");
  if (
    (listing.refereesRequested ||
      (payload.jurisdiction === "VIC"
        ? [payload.applicant.item8.property1, payload.applicant.item8.property2]
        : [payload.applicant.nsw.rentalHistory.property1, payload.applicant.nsw.rentalHistory.property2]
      ).some((h) => h?.providerName)) &&
    !payload.consents.some((c) => c.id === "referee_contact@1" && c.granted)
  )
    add("consents", "Reference consent is required.");
  if (
    listing.tenancyDatabases.length &&
    !payload.consents.some((c) => c.id === "tenancy_database_check@1" && c.granted)
  )
    add("consents", "Database acknowledgment is required.");
  if (
    payload.jurisdiction === "NSW" &&
    payload.applicant.nsw.inspection.status !== "inspected" &&
    !payload.consents.some((c) => c.id === "nsw_inspection_statement@1" && c.granted)
  )
    add("inspection", "Written statement consent is required.", "NSW.PPI.INSPECT_BEFORE_APPLY");
  if (
    payload.disclaimer !== DISCLAIMER ||
    payload.provisionalBanner !== (vic ? null : NSW_PROVISIONAL_BANNER)
  )
    add("disclaimer", "Required disclaimers must be included.");
  return v;
}
export { excludedInformationCatalogue };
