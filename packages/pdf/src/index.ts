import type { ApplicationExportV1 } from "@aurak/forms";
import { applicationSchema, DISCLAIMER, NSW_PROVISIONAL_BANNER, VIC_ITEMS } from "@aurak/forms";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import statement from "../../../content/vic/form3-statement.md?raw";
import partA from "../../../content/vic/form3a-part-a.md?raw";
import partB from "../../../content/vic/form3a-part-b.md?raw";

const A4: [number, number] = [595.28, 841.89],
  margin = 42.52;
export async function renderApplicationPdf(
  input: ApplicationExportV1,
  opts: { fonts: { regular: Uint8Array; bold: Uint8Array }; now: Date },
): Promise<Uint8Array> {
  const payload = applicationSchema.parse(input);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setCreationDate(opts.now);
  pdf.setModificationDate(opts.now);
  pdf.setProducer("au-rental-application-kit 0.1.0");
  pdf.setCreator("au-rental-application-kit");
  pdf.setTitle(
    payload.jurisdiction === "VIC" ? "Residential rental application" : "NSW PROVISIONAL rental application",
  );
  const regular = await pdf.embedFont(opts.fonts.regular, { subset: true });
  const bold = await pdf.embedFont(opts.fonts.bold, { subset: true });
  const glyphs = new Set(regular.getCharacterSet());
  let missing = false;
  let page: PDFPage;
  let y = 0;
  function safe(value: string) {
    return Array.from(value)
      .map((c) => {
        if (c === "\n" || c === "\r" || glyphs.has(c.codePointAt(0)!)) return c;
        missing = true;
        return "□";
      })
      .join("");
  }
  function newPage() {
    page = pdf.addPage(A4);
    y = A4[1] - margin;
    if (payload.jurisdiction === "NSW") {
      line("PROVISIONAL — not the NSW approved form", bold, 11);
      paragraph(NSW_PROVISIONAL_BANNER, 8);
      y -= 8;
    }
  }
  function line(value: string, font: PDFFont = regular, size = 10) {
    if (y < 82) newPage();
    page.drawText(safe(value), { x: margin, y, font, size, color: rgb(0.1, 0.13, 0.15) });
    y -= size + 5;
  }
  function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
    const result: string[] = [];
    for (const original of safe(value).split(/\r?\n/)) {
      let current = "";
      for (const word of original.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
        else {
          if (current) result.push(current);
          current = "";
          for (const char of word) {
            if (font.widthOfTextAtSize(current + char, size) > width) {
              result.push(current);
              current = "";
            }
            current += char;
          }
        }
      }
      result.push(current);
    }
    return result;
  }
  function paragraph(value: string, size = 10) {
    for (const text of wrap(value, regular, size, A4[0] - 2 * margin)) line(text, regular, size);
    y -= 5;
  }
  function field(label: string, value: unknown) {
    line(label, bold, 10);
    const text =
      value === null || value === undefined
        ? "Not requested"
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    for (const row of wrap(text, regular, 10, A4[0] - 2 * margin - 12)) {
      if (y < 92) newPage();
      page.drawRectangle({
        x: margin,
        y: y - 5,
        width: A4[0] - 2 * margin,
        height: 20,
        borderWidth: 0.4,
        borderColor: rgb(0.65, 0.65, 0.65),
      });
      page.drawText(safe(row), { x: margin + 6, y, font: regular, size: 10 });
      y -= 20;
    }
    y -= 8;
  }
  function objectFields(value: unknown, prefix = "") {
    if (value === null || value === undefined) {
      field(prefix, "Not requested");
      return;
    }
    if (Array.isArray(value)) {
      if (!value.length) field(prefix, "Not requested");
      value.forEach((v, i) => {
        objectFields(v, `${prefix} ${i + 1}`);
      });
      return;
    }
    if (typeof value === "object") {
      for (const [key, v] of Object.entries(value))
        objectFields(v, prefix ? `${prefix} · ${fieldLabels[key] ?? key}` : (fieldLabels[key] ?? key));
    } else field(prefix, String(value));
  }
  newPage();
  if (payload.jurisdiction === "VIC") {
    line("Residential rental application", bold, 14);
    paragraph(
      "Residential Tenancies Act 1997 Section 30AC\nResidential Tenancies Regulations 2021 Regulation Sections 14A and 14B",
    );
    const intro = partA.split("PART A—GENERAL")[0]!.split("\n").slice(4).join("\n");
    paragraph(intro);
    line("PART A—GENERAL", bold, 14);
    const a = payload.applicant;
    for (const item of VIC_ITEMS) {
      line(`${item.number}. ${item.label}`, bold, 14);
      switch (item.number) {
        case 1:
          field("Address of premises", payload.listing.item1.premisesAddress);
          break;
        case 2:
          objectFields(payload.listing.item2);
          break;
        case 6:
          field(
            "Requested financial documents",
            payload.listing.item6Requested.join(", ") || "Not requested",
          );
          objectFields(a.item6);
          break;
        case 7:
          field("Requested identity documents", payload.listing.item7Requested.join(", ") || "Not requested");
          objectFields(a.item7);
          break;
        case 11:
          objectFields(payload.listing.item11, "Tenancy databases");
          break;
        case 12:
          objectFields(a.item12);
          paragraph(
            "I understand that my application may not be processed unless all required documents are submitted.",
          );
          paragraph("Signed electronically (typed name)");
          break;
        default:
          objectFields(a[`item${item.number}` as keyof typeof a]);
      }
    }
    newPage();
    paragraph(partB);
    newPage();
    paragraph(statement);
  } else {
    line("NSW rental application", bold, 14);
    objectFields(payload.listing);
    objectFields(payload.applicant.nsw);
  }
  newPage();
  line("Consent receipts", bold, 14);
  for (const c of payload.consents)
    paragraph(`${c.id}: ${c.granted ? "Granted" : "Not granted"} · SHA-256 ${c.sha256} · ${c.at}`);
  paragraph(DISCLAIMER, 9);
  if (missing) paragraph("Some characters could not be displayed; see the JSON export.");
  const pages = pdf.getPages();
  for (const [i, p] of pages.entries()) {
    const footer = `Page ${i + 1} of ${pages.length} · Generated by au-rental-application-kit 0.1.0 · Not an official government document · Not legal advice${payload.jurisdiction === "VIC" ? " · Form text © State of Victoria (Consumer Affairs Victoria), CC BY 4.0" : ""}`;
    const lines = wrap(footer, regular, 7, A4[0] - 2 * margin);
    lines.forEach((t, j) => {
      p.drawText(t, { x: margin, y: 52 - j * 10, font: regular, size: 7 });
    });
  }
  return pdf.save({ useObjectStreams: false });
}
const fieldLabels: Record<string, string> = {
  name: "Full name or company name of rental provider or their agent",
  acnOrAbn: "ACN (or ABN if not a registered company)",
  address: "Address",
  phone: "Phone",
  email: "Email",
  providerStateOrTerritory: "Australian State or Territory in which the rental provider resides",
  totalOccupants: "Total number of occupants intended to reside on the premises",
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  currentAddress: "Current address",
  postcode: "Postcode",
  employer: "Current or most recent employer",
  employerAddress: "Employer address",
  netWeeklyIncomeCents: "Net weekly income (cents)",
  employmentEndedOn: "If not currently employed, date on which most recent employment ended:",
  desiredLeaseTerm: "Desired lease term (e.g. 6 months, 12 months, 24 months):",
  preferredMoveInDate: "Preferred move in date:",
  printName: "Print name",
  signature: "Signature",
  date: "Date",
  connection: "Referee’s connection to applicant",
  periodFrom: "Period of residence at address — from",
  periodTo: "Period of residence at address — to",
  providerName: "Rental provider / agent name if applicable",
  providerEmail: "Rental provider / agent email if applicable",
  providerPhone: "Rental provider / agent phone contact details if applicable",
};
