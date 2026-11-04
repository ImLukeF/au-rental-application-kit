# Contributing

Use Node 24, pnpm 12.16.1 and `pnpm install --frozen-lockfile`. Keep all dev servers on `127.0.0.1`. Follow the README for local D1 migrations and an ignored development key. Never include real personal data, credentials or agency details in issues, commits or PRs.

Use strict TypeScript and Biome. Start with the owning test file, for example `pnpm exec vitest run packages/rules/test/engine.test.ts --maxWorkers=2 --no-file-parallelism`. The root `pnpm test` is the complete v1 suite and caps local workers at two. Unit/UI tests use Node/happy-dom; Worker integration tests run in workerd with real local D1/R2 and generated keys. No live credentials or external network are required. Axe under happy-dom does not verify contrast or certify WCAG compliance.

Before a PR: `pnpm check:placeholders`, `pnpm check:deps`, `pnpm lint`, `pnpm typecheck`, relevant tests, `pnpm build`, `pnpm check:generated`. Full suites are run only when explicitly requested by the maintainer. CI verifies the complete project on PRs. Never bypass hooks or push to main.

## Changing legal rules

Use a primary source URL, pinpoint and check date. Preserve honest confidence and commencement status; UNVERIFIED does not mean confirmed. Add a `ruleTest` and a behavioral assertion at the owning boundary, then run `pnpm gen`. A changed consent requires a version bump and a new consent hash snapshot. Re-check pending NSW regulations and the final Act before treating NSW PPI rules as commenced. Follow [adding a jurisdiction](docs/ADDING-A-JURISDICTION.md).

Before reproducing a form, verify its content licence, attribute the source, describe changes and exclude logos/branding. Do not copy legislation wholesale. Government content remains separately licensed from code. Glyph fallback preserves the exact Unicode value in JSON, while the PDF notes unsupported characters.

Fixture names are Test Applicant One, Test Applicant Two and Sample Referee. Emails end in `@example.com`, `@example.org` or `@example.net`. Addresses contain “Placeholder” with postcode `0000`. Use only the plan’s ACMA fiction phone numbers. Never use plausible real identities. Keep fixtures and tests offline. Do not add payment, analytics, scoring, AI or arbitrary custom-field dependencies/features.

## Local browser walkthrough

After `pnpm build`, start `pnpm dev:inbox`; keep the server on loopback. Configure the agency as local `admin@example.com`, publish a VIC listing, create a renter vault/profile, add synthetic documents, review exclusions, export PDF/JSON and submit. Retain the receipt and fragment portal link. Shortlist, prefer, request ID with a written notice, share the rotated portal link manually, upload ID and verify it; confirm the copy is gone. Mark a successful applicant, close the listing with an agreement date and review all deadlines. Open the portal, request correction, withdraw optional consent and withdraw an active application. Trigger cron at `http://127.0.0.1:8787/cdn-cgi/local/scheduled?cron=17+*+*+*+*` and inspect tombstones/receipts. Repeat for NSW and confirm PROVISIONAL banners. Check keyboard navigation and a 320px viewport. Close resources you started.
