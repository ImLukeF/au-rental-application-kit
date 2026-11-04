# Australian rental application kit

A free, local-first rental profile and document vault, a self-hosted agency inbox, cited VIC/NSW rules, and browser-generated PDF/JSON exports. One deployment serves one agency. This is v1 software for review, not a compliance certification.

**Not legal advice.** au-rental-application-kit is free, open-source software provided "as is" under the Apache License 2.0. It summarises Australian rental laws as understood by contributors on the dates shown, and may be incomplete, out of date or wrong. It is not a law firm and is not affiliated with or endorsed by Consumer Affairs Victoria, NSW Fair Trading or any government. Forms it produces are not official government documents. Rental providers and agents remain responsible for their own legal compliance. Get advice from a lawyer or the relevant regulator before relying on it. NSW features are **PROVISIONAL** until the NSW approved form and regulations are published and the law commences.

| Jurisdiction             | v1 status (plan checked 4 November 2026)                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| VIC                      | Form 3A items, Part B and Form 3 text supported; legal review still recommended                                                       |
| NSW                      | **PROVISIONAL — not the NSW approved form.** Final Act wording/commencement UNVERIFIED. Pending privacy rules applied early as policy |
| Other states/territories | Unsupported                                                                                                                           |

The kit charges no fees, tracks nobody, performs no scoring, and has no AI processing. It does not run credit checks, send email/SMS, generate leases or store a renter’s reusable profile on a server. Renters explicitly submit a selected application to an agency’s inbox.

## Run locally

Requires Node 24 and pnpm 12.16.1 (Corepack can activate the version in `packageManager`).

```sh
corepack pnpm install --frozen-lockfile
pnpm test
pnpm build
cp apps/inbox-worker/.dev.vars.example apps/inbox-worker/.dev.vars
```

Generate a local encryption key without printing it and put it in the ignored file:

```sh
node apps/inbox-worker/scripts/gen-kek.mjs | node scripts/set-local-kek.mjs
pnpm --filter @aurak/inbox-worker exec wrangler d1 migrations apply aurak-dev --local --env development
pnpm dev:inbox
```

Open `http://127.0.0.1:8787/agent/` and enter `admin@example.com` in the local development identity form. Configure agency details and the collection notice, create and publish a listing, then open its apply link. Development auth works only on loopback in the development environment. `pnpm dev:renter` starts the standalone renter interface on loopback; the agency origin must explicitly allow it for API use.

```sh
pnpm check:placeholders
pnpm check:deps
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:generated
```

Tests use synthetic fixtures, generated test keys and local D1/R2. Fetch is disabled unless a test injects a mock; workerd outbound requests are denied. `pnpm build` assembles static assets, generates Worker binding types and runs Wrangler **dry-run only**. It never deploys.

## Renters

The passphrase vault uses PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM in IndexedDB. Keys stay in memory while unlocked; inactivity locks the vault. A lost passphrase cannot be recovered. Browsers can evict storage: request persistent storage and keep encrypted `.aurak` backups. Use the review screen to see shared and excluded information; downloaded PDF/JSON files are plaintext and should be stored carefully. Applicant portal links contain a secret token in the fragment; keep them private. ID invitations rotate the token, so use the latest link supplied by the agency.

## Agencies

Read [the deployment guide](docs/DEPLOY-CLOUDFLARE.md), [architecture](docs/ARCHITECTURE.md) and [privacy design](docs/PRIVACY-DESIGN.md). Workers Paid is required for production upload encryption; the plan’s checked pricing was USD 5/month minimum, subject to change. **Cloudflare does not guarantee Australian storage residency.** The Oceania location hint is best effort; disclose possible offshore storage and obtain advice on APP 8. This repository has not been deployed.

Set Access policies/MFA, review all notices and retention settings, own the offline KEK backup, monitor purge receipts and transfer successful files before the handoff deadline. Downloads held elsewhere remain the agency’s responsibility. Strongly recommended: obtain a lawyer’s or regulator’s review of [all open legal questions](docs/LEGAL-QUESTIONS.md) before real use.

## Rules and contribution

[Generated rules and dated citations](docs/rules.md) · [Sources](docs/SOURCES.md) · [Add a jurisdiction](docs/ADDING-A-JURISDICTION.md) · [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md)

Code is [Apache-2.0](LICENSE). [Government form text](content/LICENSE.md) is CC BY 4.0; Noto Sans is SIL OFL 1.1. No government branding is included. Maintainers decide whether to enable Dependabot and private vulnerability reporting; this change does not alter repository settings.
