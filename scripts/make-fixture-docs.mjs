import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/pdf/package.json", import.meta.url));
const { PDFDocument, StandardFonts } = require("pdf-lib");
const doc = await PDFDocument.create();
doc.setCreationDate(new Date("2026-11-04T00:00:00Z"));
doc.setModificationDate(new Date("2026-11-04T00:00:00Z"));
const font = await doc.embedFont(StandardFonts.Helvetica);
doc.addPage([300, 100]).drawText("SAMPLE - NOT A REAL DOCUMENT", { x: 10, y: 50, font, size: 12 });
await mkdir("fixtures/documents", { recursive: true });
await writeFile("fixtures/documents/sample-payslip.pdf", await doc.save());
await writeFile(
  "fixtures/documents/sample-id.png",
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqN0AAAAASUVORK5CYII=",
    "base64",
  ),
);
