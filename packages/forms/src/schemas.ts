import { NSW_FINANCIAL, NSW_IDENTITY, parseDate, VIC_FINANCIAL, VIC_IDENTITY } from "@aurak/rules";
import { z } from "zod";
export const dateSchema = z.string().refine((v) => {
  try {
    parseDate(v);
    return true;
  } catch {
    return false;
  }
}, "Use a valid YYYY-MM-DD date");
export const phoneSchema = z.string().regex(/^(?:\+61|0)[\d ()-]{8,16}$/);
export const shortText = z.string().trim().min(1).max(200);
export const agencySchema = z.strictObject({
  name: shortText,
  acnOrAbn: z
    .string()
    .regex(/^(?:\d{9}|\d{11})$/)
    .optional(),
  address: shortText,
  phone: phoneSchema,
  email: z.email(),
  providerStateOrTerritory: z.enum(["VIC", "NSW", "QLD", "SA", "WA", "TAS", "NT", "ACT", "overseas"]),
});
export const databaseSchema = z.strictObject({
  name: shortText,
  phone: phoneSchema,
  webAddress: z.url().refine((url) => url.startsWith("https://")),
});
export const personalSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(150),
  dateOfBirth: dateSchema,
  phone: phoneSchema,
  email: z.email(),
});
export const historySchema = z
  .strictObject({
    address: shortText,
    postcode: z.string().regex(/^\d{4}$/),
    periodFrom: dateSchema,
    periodTo: dateSchema.optional(),
    providerName: shortText.optional(),
    providerEmail: z.email().optional(),
    providerPhone: phoneSchema.optional(),
  })
  .refine((v) => !v.periodTo || v.periodTo >= v.periodFrom, "Residence end precedes start");
export const refereeSchema = z.strictObject({
  name: shortText,
  phone: phoneSchema,
  email: z.email(),
  connection: shortText,
});
export const employmentSchema = z.strictObject({
  status: z.enum(["employed", "not_employed"]),
  employer: shortText.optional(),
  employerAddress: shortText.optional(),
  netWeeklyIncomeCents: z.number().int().nonnegative().optional(),
  endedOn: dateSchema.optional(),
});
export const profileSchema = z.strictObject({
  personal: personalSchema,
  addresses: z
    .array(
      z.strictObject({
        address: shortText,
        postcode: z.string().regex(/^\d{4}$/),
        from: dateSchema,
        to: dateSchema.optional(),
        providerName: shortText.optional(),
        providerEmail: z.email().optional(),
        providerPhone: phoneSchema.optional(),
        isCurrent: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
  employment: employmentSchema,
  noRegularIncomeDetails: z.string().max(1000).optional(),
  referees: z.array(refereeSchema).max(20),
  preferences: z.strictObject({
    desiredLeaseTerm: z.string().min(1).max(40),
    preferredMoveInDate: dateSchema.optional(),
  }),
  occupantsDefault: z.number().int().min(1).max(20).optional(),
});
export type RenterProfile = z.infer<typeof profileSchema>;
export const allDocumentTypes = [
  ...new Set([...VIC_FINANCIAL, ...NSW_FINANCIAL, ...VIC_IDENTITY, ...NSW_IDENTITY]),
] as [string, ...string[]];
export const documentRefSchema = z.strictObject({
  docId: z.string().min(1).max(80),
  type: z.enum(allDocumentTypes),
  filename: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  byteLength: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});
export type DocumentRef = z.infer<typeof documentRefSchema>;
export const listingSchema = z.strictObject({
  schemaVersion: z.literal("aurak.listing-public.v1"),
  slug: z.string().regex(/^[a-z2-7]{12}$/),
  jurisdiction: z.enum(["VIC", "NSW"]),
  formId: z.enum(["VIC-3A-2026-03-31", "NSW-PROVISIONAL-2026-11-04"]),
  provisional: z.boolean(),
  status: z.enum(["draft", "open", "closed_leased", "closed_withdrawn"]),
  item1: z.strictObject({ premisesAddress: z.string().min(5).max(200) }),
  item2: agencySchema,
  financialRequested: z.array(z.enum(allDocumentTypes)).max(2),
  identityRequested: z.array(z.enum(allDocumentTypes)).max(2),
  identityStage: z.enum(["application", "preferred"]),
  maxFinancialDocs: z.number().int().min(0).max(2),
  refereesRequested: z.boolean(),
  tenancyDatabases: z.array(databaseSchema).max(3),
  collectionNoticeMd: z.string().min(20).max(12000),
  privacyPolicyUrl: z.url().nullable(),
  retentionSummary: z.strictObject({
    unsuccessfulDays: z.number().int().min(0).max(28),
    successfulHandoffDays: z.number().int().min(0).max(90),
  }),
  turnstileSiteKey: z.string().nullable(),
  rulesVersion: z.string(),
});
export type ListingPublicV1 = z.infer<typeof listingSchema>;
export const inspectionSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("inspected"), inspectedOn: dateSchema }),
  z.strictObject({ status: z.enum(["unable", "does_not_wish"]), writtenStatement: z.literal(true) }),
]);
export type NswInspection = z.infer<typeof inspectionSchema>;
export const signatureSchema = z
  .strictObject({
    printName: z.string().trim().min(1).max(150),
    signature: z.string().trim().min(1).max(150),
    signatureMethod: z.literal("typed"),
    date: dateSchema,
  })
  .refine((v) => v.signature === v.printName, "Signature must match printed name");
const financial = z.strictObject({
  documents: z.array(documentRefSchema).max(2),
  noRegularIncomeDetails: z.string().max(1000).nullable(),
});
const rentalHistory = z.strictObject({ property1: historySchema, property2: historySchema.optional() });
export const vicApplicantSchema = z
  .strictObject({
    item3: z.strictObject({ totalOccupants: z.number().int().min(1).max(20) }),
    item4: personalSchema.extend({ currentAddress: shortText, postcode: z.string().regex(/^\d{4}$/) }),
    item5: z.strictObject({
      employer: shortText.optional(),
      employerAddress: shortText.optional(),
      netWeeklyIncomeCents: z.number().int().nonnegative().optional(),
      employmentEndedOn: dateSchema.optional(),
    }),
    item6: financial,
    item7: z.strictObject({ documents: z.array(documentRefSchema).max(2) }),
    item8: rentalHistory,
    item9: z.strictObject({ referee1: refereeSchema, referee2: refereeSchema.optional() }).nullable(),
    item10: z.strictObject({ desiredLeaseTerm: z.string().min(1).max(40), preferredMoveInDate: dateSchema }),
    item12: signatureSchema,
  })
  .superRefine((v, ctx) => {
    if (
      !(v.item5.employer && v.item5.netWeeklyIncomeCents !== undefined) &&
      !v.item5.employmentEndedOn &&
      !v.item6.noRegularIncomeDetails
    )
      ctx.addIssue({
        code: "custom",
        path: ["item5"],
        message: "Give employment details, employment end date or ability-to-pay details under item 6.",
      });
  });
export const nswApplicantSchema = z.strictObject({
  nsw: z.strictObject({
    occupants: z.strictObject({ total: z.number().int().min(1).max(20) }),
    applicant: personalSchema.extend({ currentAddress: shortText, postcode: z.string().regex(/^\d{4}$/) }),
    employment: z.strictObject({
      employer: shortText.optional(),
      netWeeklyIncomeCents: z.number().int().nonnegative().optional(),
      employmentEndedOn: dateSchema.optional(),
    }),
    financialEvidence: financial,
    rentalHistory,
    references: z.array(refereeSchema).max(2),
    lease: z.strictObject({ desiredTerm: z.string().min(1).max(40), preferredMoveInDate: dateSchema }),
    inspection: inspectionSchema,
    declaration: signatureSchema,
  }),
});
export const consentReceiptSchema = z.strictObject({
  id: z.string(),
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  granted: z.boolean(),
  at: z.iso.datetime(),
});
export const excludedSchema = z.strictObject({ path: z.string(), ruleId: z.string(), reason: z.string() });
export const exportListingSchema = z.strictObject({
  item1: listingSchema.shape.item1,
  item2: agencySchema,
  item6Requested: z.array(z.enum(allDocumentTypes)).max(2),
  item7Requested: z.array(z.enum(allDocumentTypes)).max(2),
  item11: z.array(databaseSchema).max(3),
});
const common = {
  $schema: z.literal(
    "https://github.com/ImLukeF/au-rental-application-kit/blob/main/schemas/application.v1.schema.json",
  ),
  schemaVersion: z.literal("aurak.application.v1"),
  rulesVersion: z.string().regex(/^sha256:[a-f\d]{64}$/),
  generatedAt: z.iso.datetime(),
  generator: z.strictObject({ name: z.literal("au-rental-application-kit"), version: z.literal("0.1.0") }),
  listing: exportListingSchema,
  consents: z.array(consentReceiptSchema).max(5),
  excluded: z.array(excludedSchema).max(100),
  disclaimer: z.string(),
  provisionalBanner: z.string().nullable(),
};
export const applicationSchema = z.discriminatedUnion("jurisdiction", [
  z.strictObject({
    ...common,
    jurisdiction: z.literal("VIC"),
    formId: z.literal("VIC-3A-2026-03-31"),
    provisional: z.literal(false),
    applicant: vicApplicantSchema,
  }),
  z.strictObject({
    ...common,
    jurisdiction: z.literal("NSW"),
    formId: z.literal("NSW-PROVISIONAL-2026-11-04"),
    provisional: z.literal(true),
    applicant: nswApplicantSchema,
  }),
]);
export type ApplicationExportV1 = z.infer<typeof applicationSchema>;
export type ApplicationPayloadV1 = ApplicationExportV1;
export const kdfSchema = z.strictObject({
  name: z.literal("PBKDF2"),
  hash: z.literal("SHA-256"),
  iterations: z.literal(600000),
  salt: z.string().min(20).max(30),
});
export const backupSchema = z.strictObject({
  schemaVersion: z.literal("aurak.profile-backup.v1"),
  kdf: kdfSchema,
  iv: z.string().min(16).max(16),
  ct: z.string().min(20),
});
