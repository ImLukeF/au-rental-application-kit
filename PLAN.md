# PLAN.md — au-rental-application-kit (v1)

> **Status:** Implementation plan for the first pull request. Research done and sources checked on **2026-11-04** (Australia/Melbourne).
> **Audience:** A coding agent (Codex) building v1 in one PR from this file alone, without asking questions. Every decision below is final for v1 unless it is marked **OPEN QUESTION** (listed in §24). Open questions already have a default you must implement.
> **Repo:** `github.com/ImLukeF/au-rental-application-kit` (public, generic, open source).
> **Not legal advice.** This plan summarises laws as read on the check date. Items marked **UNVERIFIED** could not be confirmed from a primary source. Do not present them as settled in code, UI or docs.

---

## 0. Rules for the implementer (read first)

1. **Only work inside the repository.** Do not deploy anything. Do not run `wrangler deploy` (except `--dry-run`), `wrangler secret put`, `wrangler d1 create` or `wrangler r2 bucket create`. Do not create any Cloudflare, GitHub or other cloud resources.
2. **Local servers bind to `127.0.0.1` only.** Use `wrangler dev --ip 127.0.0.1 --port 8787` and `vite --host 127.0.0.1`. Never use `0.0.0.0`. Never open public ports or tunnels.
3. **No secrets, no real identifiers in the repo.** No real Cloudflare account IDs, D1 database IDs, Access AUD tags, team domains, API tokens, server IPs, personal or business emails, street addresses or PO boxes. Use the placeholders in §13. Fixture people, addresses and phone numbers must follow the fixture rules in §18.6.
4. **Name no real agencies, businesses or people** anywhere: code, fixtures, docs, comments or commit messages.
5. **Invent nothing.** No statistics, user counts, quotes or testimonials in docs or UI.
6. **Tests make no live network calls and use no live credentials.** All external interactions go through injectable interfaces and are tested with committed fixtures and mocks (§18).
7. **Every legal rule in code cites its source** (URL, pinpoint and check date). The test suite enforces this (§8.6).
8. **Keep "UNVERIFIED" and "PROVISIONAL" labels visible** in the code, the UI (banners) and the docs wherever this plan uses them.
9. Use exactly the stack and versions in §6.4 unless one fails to install. If it fails, use the nearest working version in the same major line and note it in the PR description.

---

## 1. Summary and problem

**au-rental-application-kit** is a free, privacy-first, open-source kit for residential rental applications in Australia. v1 covers Victoria (VIC) and New South Wales (NSW). It has four parts:

- **(a) Renter app.** A static, local-first web app. Renters keep a reusable profile and document vault encrypted on their own device. For a particular property, the app builds an application that follows the jurisdiction's form item by item. It shares only the fields and documents the law allows and the agent actually requested. It records consents and produces a PDF and a JSON export. It never takes payment.
- **(b) Agency inbox.** A self-hostable Cloudflare Worker for small agencies and private rental providers. It publishes listings, receives applications, and holds sensitive ID documents back until the chosen-applicant stage where the law requires it (and by default everywhere). It encrypts all applicant data at rest with application-level envelope encryption, logs every staff access, and automatically destroys data on a schedule derived from the law.
- **(c) Rules engine.** A pure TypeScript package. It encodes each VIC and NSW rule with commencement dates, parameters, penalties and citations, and can be extended to other states. Every rule has tests.
- **(d) Exports.** A PDF that follows the layout of the VIC prescribed form (licensing allows this, see §17.3), a clearly labelled provisional NSW PDF, and a versioned JSON export with a published JSON Schema.

**Why now (verified, see §2):**

- **Victoria.** From **31 March 2026**, rental providers and agents must use the prescribed application form (Form 3A) and may ask only for the information in it (RTA 1997 s 30AC, s 30C; Regs 2021 regs 14A, 15). Third-party platforms may not charge renters fees from **31 March 2026**. From **13 October 2026**, no person other than an ADI may charge application or rent-payment fees (s 51A; reg 21C). Since **25 November 2025**, privacy and destruction duties apply (ss 505BA–505BE).
- **New South Wales.** Parliament passed the Residential Tenancies Amendment (Protection of Personal Information) Bill 2025 on **24 September 2026**. It applies the Australian Privacy Principles to landlords, agents and related services, requires an approved application form, allows ID collection only after the landlord gives written notice of intent to enter an agreement, requires improperly collected data to be destroyed, and sets penalties. Commencement is by proclamation and is **expected in early 2027**. The approved form and the retention regulations are **still being consulted on**.
- **No open-source tool exists.** GitHub searches on 2026-11-04 found no Australian open-source rental application kit, only student projects, empty repos, analytics projects and generic property managers (§12.6). Commercial platforms must rework their forms.

---

## 2. Legal basis: verified facts the code relies on

All checked **2026-11-04**. "Primary" means the Act or Regulation text, the bill text or the regulator's own page. "PU" means penalty units.

### 2.1 Victoria

| # | Fact | Source (primary unless noted) |
|---|---|---|
| V1 | Applications must be in the prescribed form. Preparing or authorising a non-prescribed application form is an offence: **60 PU** (natural person) / **300 PU** (body corporate). | RTA 1997 (Vic) **s 30AC** (inserted by No. 6/2025 s 5), authorised version 115, in force from 13 Oct 2026 [S7] |
| V2 | The prescribed form is **Form 3A in Schedule 1**, effective **on and after 31 March 2026**. It does not apply to Homes Victoria, registered agencies, Victorian Affordable Housing Programs or specialised housing programs. | Residential Tenancies Regulations 2021 **reg 14A**, version 009, in force from 30 Jun 2026 [S8] |
| V3 | Providers may request only "prescribed" identity information (Form 3A **items 4 and 7**), financial information (**item 6**) and employment information (**item 5**), plus other matters in Form 3A. | RTA **s 30BA**; Regs **reg 14B** [S7][S8] |
| V4 | Requesting any information **other than the information in Form 3A** is prohibited from 31 Mar 2026: **60 PU / 300 PU**. | RTA **s 30C(1)**; Regs **reg 15** [S7][S8] |
| V5 | Personal information on the application may be used only to assess suitability as a renter or for another requirement of the Act: **60 PU / 300 PU**. | RTA **s 30B** [S7] |
| V6 | The application form must include the prescribed statement of information (**Form 3**: the unlawful discrimination statement). | RTA **s 29C**; Regs **reg 14** [S7][S8]; CAV docx [S5] |
| V7 | Form 3A item 6: **no more than two** of: pay slips, a bank statement **without transaction details**, Centrelink payment statements or letters. | Form 3A [S4][S8] |
| V8 | Form 3A item 7: **no more than two** ID documents from a fixed list of 12 (see §9.1). | Form 3A [S4][S8] |
| V9 | Providers must take reasonable steps to protect renter's information from misuse, loss, and unauthorised access, modification or disclosure: **60 PU / 300 PU**. In effect from **25 Nov 2025** (per CAV). | RTA **s 505BB** [S7]; CAV [S2][S3] |
| V10 | Destroy or permanently de-identify: **(a)** within **3 years** after the tenancy terminates; **(b)(i)** for unsuccessful applicants, within **30 days** after the agreement for the premises is entered into; **(b)(ii)** within **6 months** if the applicant gave written consent to use the information to apply for other premises. **60 PU / 300 PU**. Exceptions are in s 505BC(2). | RTA **s 505BC** [S7]; CAV [S3] |
| V11 | Disclosure only with written consent or another listed ground (court order, authorised by law, serious threat, law enforcement, ASIO/ASIS, proceedings, prescribed circumstances): **60 PU / 300 PU**. | RTA **s 505BD** [S7] |
| V12 | Sections 505BB–505BD do not apply to the extent a corresponding obligation under the Privacy Act 1988 (Cth) and other listed laws has been complied with or exempted. | RTA **s 505BE** [S7] |
| V13 | If a tenancy database is used and the applicant is listed, the provider must give written notice **within 7 days** (database name, the information, who listed it, how to remove or amend it): **60 PU**. Databases used must be disclosed in Form 3A **item 11**. | RTA **s 439D(2)**; Form 3A item 11 [S7][S8] |
| V14 | "A person, other than an ADI, must not demand or receive a fee for any prescribed matter in relation to an application… or the payment of rent": **80 PU / 400 PU**. The prescribed matters are background checks, tenancy or rental history checks, credit checks, tenancy database checks, identity verification, administrative costs, failed payments, the application itself, and rent payment (other than surcharges permitted by another Act). | RTA **s 51A** (substituted by No. 46/2025 s 13) in version 115; Regs **reg 21C** [S7][S8] |
| V15 | Fee-ban dates: third parties banned from **31 Mar 2026**; providers and agents banned from **13 Oct 2026**. | CAV "New changes to rental laws" [S2] |
| V16 | Each applicant aged 18 or over may be asked to complete a separate form. | Form 3A preamble [S4][S8] |
| V17 | VIC penalty unit value is **$209.10** for the financial year starting 1 July 2026. | Vic Gov notice under s 6 Monetary Units Act 2004 [S10] |
| V18 | CAV website material, including its forms, is licensed **CC BY 4.0**, except images, photographs and branding (including the CAV logo, coat of arms and government logo) and third-party content. Attribution: "© State of Victoria (Consumer Affairs Victoria)". | CAV copyright page [S6] |
| V19 | legislation.vic.gov.au content: Government Printer copyright, reproduction as allowed by the Copyright Act 1968. **No CC licence.** | [S9] |

**Discrepancy noted (see §23, legal question L3):** Part B, "Information for the applicant" item 6, refers to "Item **13**" in the Regulations (v009) but to "Item **11**" in the CAV docx. Item 11 is the tenancy databases item.

### 2.2 New South Wales

**Instrument:** Residential Tenancies Amendment (Protection of Personal Information) Bill 2025 (NSW) ("NSW PPI Amendment"). It amends the Residential Tenancies Act 2010 (NSW).

- **Passed:** 24 September 2026 (REINSW [S17]; NSW ministerial release dated 25 Sep 2026 says it passed "last night" [S15]).
- **Assent:** search-engine summaries of the NSW Parliament bill page report assent on 2 Oct 2026 as Act No 38 of 2026. **UNVERIFIED**: the page returns HTTP 403 to automated fetches.
- **Commencement:** clause 2 says Sch 1[13] (pets) starts on assent and the rest "on a day or days to be appointed by proclamation". Reported as expected in early 2027 [S15][S17].
- **Text used for this plan:** the **Legislative Assembly second print** (archived 15 Mar 2026) [S13]. Amendments made in the Legislative Council before final passage could not be retrieved. **Section numbers and penalties below are therefore UNVERIFIED against the final Act.** REINSW's summary of the passed bill matches s 210E, s 210F(2), the s 210D inspection rule and the Tribunal and access rules [S17]. REINSW also mentions a 21-day pet rule that is not in the second print, which suggests the Council made amendments.

| # | Rule (second-print text) | Pinpoint | Max penalty (ind. / otherwise) |
|---|---|---|---|
| N1 | Adopts the Australian Privacy Principles (APPs). They apply to every "residential tenancy entity" as if it were an APP organisation under the Privacy Act. It must not contravene an APP. | ss 210, 210A(2)–(5) | 100 PU / 450 PU |
| N2 | "Residential tenancy entity" includes landlords, agents, people engaged by them to handle tenant information (including receiving applications and verifying ID), **and (d) a person engaged by a tenant to collect, hold, use or disclose the tenant's information for the purpose of sharing it with a landlord or agent.** | s 210A(1) | n/a |
| N3 | Landlord or agent must offer a way to give information **directly**. Entities may collect only directly from the tenant, unless the tenant consents or the regulations permit otherwise. | s 210C | 50 / 200 |
| N4 | Information relating to a tenancy application may be collected **only in the approved form**. | s 210D(1) | 50 / 300 |
| N5 | An application must not be accepted **before the person inspects** the premises, unless the person states **in writing** that they are unable to, or do not wish to, inspect. | s 210D(2)–(3) | 50 / 200 |
| N6 | **Identity verification information** may be collected only if the landlord (a) intends to enter into an agreement with the tenant, and (b) **notifies the tenant in writing** of that intent **before** collection. What counts as "identity verification information" is to be prescribed by regulation. | s 210E; s 209 definition | 50 / 200 |
| N7 | Information collected in contravention must not be used and must be **destroyed within 2 business days** after the entity becomes aware. | s 210F | 50 / 200 |
| N8 | NCAT may order restrictions on collection, use or disclosure, or order access, destruction, amendment or de-identification. | s 210G | n/a |
| N9 | Regulations may restrict information types and documents, limit the number of documents, require tenant choice of documents, allow digital ID verification, and set security, notification, consent methods, **maximum retention periods**, access and correction, and record-keeping. Offences up to 450 PU. **No such regulation has been made yet.** | s 218A | up to 450 PU |
| N10 | Penalties reported as "up to $11,000 for individuals and $49,500 for corporations" for privacy breaches. This equals 100 PU and 450 PU at $110 per PU. | Ministerial releases [S15][S16] |
| N11 | NSW penalty unit = **$110** under Crimes (Sentencing Procedure) Act 1999 s 17. Secondary sources only, so **UNVERIFIED** against legislation.nsw.gov.au (HTTP 403). | secondary |
| N12 | **Current NSW law (before commencement).** No prescribed application form. The Fair Trading Commissioner's guidance says: collect only what is reasonably necessary; best practice is to **sight ID and not store copies**; redact daily bank transactions; no obligation to provide a credit report; no fees in connection with an application other than those allowed by RTA 2010 **s 23** (holding fee, rent, bond, registration fee); charging for credit or background checks "is a breach". | Fair Trading Commissioner's guidance [S18]. The wording of s 23 itself is **UNVERIFIED** (legislation.nsw.gov.au 403). |
| N13 | Government statement: "ID documents like driver licences and passports will now only be collected from the preferred applicant before signing the lease." Consultation on the standard form, permitted documents and destruction timing has started. | NSW ministerial release, 25 Sep 2026 [S15] |
| N14 | A Legislative Assembly amendment that would have added a specific ID-destruction duty to s 210E was **not agreed**: it is struck through on the archived "Agreed amendments" sheet. Only the s 216 nominee amendment was agreed. | [S14] |

**Consequences for the design:**

- NSW s 210A(1)(d) can bring a **hosted renter-side service** within the APPs. v1's renter app is therefore **local-only**: no server stores renter profiles (§6.1).
- s 210E drives the **identity stage gate** (§11).
- s 218A means NSW retention periods, the document list and the form are **not yet known**. The NSW form in v1 is a **PROVISIONAL** schema built from the Act and the guidance (§9.2), behind a banner.

### 2.3 Commonwealth

- The Privacy Act 1988 (Cth) generally covers organisations with annual turnover **over $3 million**. Operators of residential tenancy databases are covered regardless of turnover. Real estate agents may or may not be covered. [S22] (OAIC)
- APP 11.2 requires destroying or de-identifying personal information that is no longer needed. **UNVERIFIED**: well known, but the text was not fetched in this session. Cite *Privacy Act 1988 (Cth) Sch 1 APP 11.2*, https://www.legislation.gov.au/C2004A03712/latest/text, and mark the rule `confidence: "unverified"`.
- NSW s 210A(4) applies only Privacy Act ss 6, 6A(1), 8 and Part III Div 2. On the second-print reading, the Notifiable Data Breaches scheme (Part IIIC) is **not** applied by the NSW Act (legal question L16).

### 2.4 Other states (extensibility only, not in v1)

Queensland has required an approved rental application form (RTA **Form 22**, latest listed version "v4 Mar26") since **1 May 2025** [S24]. Details are **UNVERIFIED** (search results only). QLD is the recommended next jurisdiction. The rules engine must make adding it a data-only change (§8.5).

---

## 3. Goals and non-goals

### Goals (v1)

1. Renters can build one reusable profile and produce **VIC Form 3A applications item for item**, and **NSW provisional** applications, sharing only what each listing may lawfully request.
2. Renter data stays **on the renter's device**, encrypted with a passphrase. The kit has no backend for renters, no account, no tracking and no fees.
3. Small agencies can **self-host an inbox** on their own Cloudflare account. It provides listings, application intake, encryption at rest, staff access logging, ID stage gating, legally driven automatic destruction, applicant self-service (status, data access, withdrawal) and exports.
4. A **rules engine** with dated, cited, tested rules for VIC and NSW that can be extended to other states.
5. **Exports**: a VIC layout-following PDF with official text (CC BY 4.0, attributed), a provisional NSW PDF, and a JSON export with a published schema.
6. **Honest compliance posture**: "not legal advice" disclaimers, a visible list of rules and their verification status, and a legal-questions document.
7. CI: lint, typecheck, test and build on every PR.

### Non-goals (v1)

- No payments, fees, subscriptions, premium tiers or "boost your application" features.
- No credit checks, tenancy database integrations, identity verification APIs (DVS, digital ID), open-banking or income-verification integrations.
- No scoring, ranking or algorithmic assessment of applicants (discrimination risk; NSW guidance flags algorithms).
- No custom application fields. Agencies cannot add questions (VIC s 30C / reg 15).
- No outbound email or SMS. Agents share links themselves.
- No hosted multi-tenant SaaS. One deployment serves one agency or provider.
- No lease or agreement generation, bond lodgement, inspections booking or property management features.
- No AI or LLM processing of applicant data and no MCP server in v1 (§16.4).
- No other states (QLD next), no languages other than English, no native mobile apps.
- No Node/Docker self-host adapter in v1. The storage interfaces are designed for one (§6.2).

---

## 4. Target users

1. **Renters in VIC and NSW** applying for several properties who want to fill in details once, see exactly what they share, and keep control of their documents.
2. **Small real-estate agencies and self-managing rental providers** (one to roughly twenty staff) who need a compliant, low-cost intake process and cannot buy or build an enterprise platform. They are the first deploying users. They are non-technical, so deployment documentation must be step by step.
3. **Contributors**: developers, tenant advocates and lawyers who add jurisdictions, correct rules and review citations.
4. **Advocates and regulators** may use the rules registry (`docs/rules.md`) as a readable reference. It is not legal advice.

---

## 5. v1 scope

**In scope**

| Area | Included |
|---|---|
| Rules | VIC (in force) and NSW (current-law guidance plus PPI Amendment rules marked `pending_commencement`). Commonwealth informational rules. Penalty-unit tables. Retention calculators. Fee checks. ID-stage gate. Notice requirements. |
| Forms | VIC Form 3A, items 1–12, field for field, with official Part B text and the Form 3 statement. NSW **PROVISIONAL** schema. Consent catalogue. JSON Schemas. |
| Renter app | Encrypted local vault (profile and documents). Apply from an inbox link or by manual entry for agents without the kit. Review screen showing shared and excluded items. Consents. PDF and JSON export. Submission history with receipts. Encrypted backup and restore. Wipe. |
| Inbox | Listings (VIC/NSW). Public apply endpoint. Applicant portal (status, notices, ID upload when invited, data export, withdraw). Staff UI. Status workflow. ID stage gate. VIC s 439D notice tracking. NSW s 210E intent notice. Envelope encryption (D1 + R2). Audit log. Hourly purge cron. Purge receipts. Settings. Cloudflare Access auth. Dev auth for local use only. |
| Exports | PDF (client-side) and JSON, for renters and agents. |
| Docs | README, CONTRIBUTING, SECURITY, LICENSE (Apache-2.0), NOTICE, content licence, legal questions, privacy design and threat model, deployment guide, how to add a jurisdiction, generated rules table. |
| CI | GitHub Actions: install, lint, typecheck, test, build, generated-files check, placeholder and secret check, dependency denylist. |

**Out of scope**: everything in Non-goals (§3).

---

## 6. Architecture and stack

### 6.1 High-level architecture

```
┌──────────────────────────── Renter's browser ───────────────────────────┐
│ apps/renter (static SPA)                                                │
│  • IndexedDB vault: AES-256-GCM, key = PBKDF2-SHA256(passphrase, 600k)  │
│  • @aurak/rules + @aurak/forms: builds the allowed payload per listing  │
│  • @aurak/pdf: renders PDF locally; JSON export                         │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTPS (direct to the agency, satisfies NSW s 210C "directly")
               ▼
┌──────────────────── Agency's Cloudflare account (self-hosted) ───────────┐
│ apps/inbox-worker (Cloudflare Worker, Hono)                             │
│  /                → renter SPA (static assets)                          │
│  /agent/*         → agent SPA (static assets; Cloudflare Access gated)  │
│  /api/public/*    → listing info + submission (rate limited, Turnstile) │
│  /api/applicant/* → applicant portal (bearer applicant token)           │
│  /api/agent/*     → staff API (Access JWT verified in Worker + roles)   │
│  scheduled()      → hourly purge job (crypto-shred + delete)            │
│                                                                         │
│  D1  (DB):   metadata + AES-GCM ciphertext (no plaintext renter PII)    │
│  R2  (DOCS): encrypted documents      R2 (KEYS): wrapped per-app DEKs   │
│  Secret: DATA_KEK_V{n} (AES-KW key-encryption key)                      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why the renter app is local-first.** NSW s 210A(1)(d) can make a service engaged by a tenant to hold and share their information an APP-bound "residential tenancy entity". Holding nothing server-side removes that exposure for the project, gives the strongest privacy, and costs nothing to run. The renter SPA is static. The same build is served by every agency's inbox at `/` and can also be hosted standalone.

**Why one deployment per agency (self-hosted).** The agency stays the data controller with its own keys, cloud account and retention settings. The project never holds renter data.

### 6.2 Stack choices and reasons

| Choice | Reason | Alternatives considered |
|---|---|---|
| **TypeScript everywhere** | One language for the rules engine, browser and Worker. Shared zod schemas. Easy for contributors. | — |
| **Cloudflare Workers + D1 + R2 + Cron Triggers** | Low cost for small agencies (Workers Paid is USD 5/month minimum; R2 has no egress charges [S-CF-PRICING]). Managed TLS. No servers to patch. Built-in cron for deletion jobs. Cloudflare Access gives SSO and MFA for staff without building auth. Secrets are kept outside the code. | Node + Postgres on a VPS: more operations burden for a small agency. Supabase/Firebase: vendor accounts with broader data access, and APP 8 questions are similar. |
| **Application-level envelope encryption (WebCrypto)** | R2 already encrypts at rest (AES-256-GCM, Cloudflare-managed keys) [S-CF-R2SEC]. App-level encryption adds protection against storage-layer exposure, makes D1 hold no plaintext renter PII, and enables crypto-shredding. Crypto-shredding matters because **D1 Time Travel cannot be turned off and keeps history for 30 days on Paid or 7 days on Free** [S-CF-D1TT]. | R2 SSE-C only: does not cover D1. |
| **Wrapped DEKs stored in a separate R2 bucket (`KEYS`)** | Deleting the key object makes D1 Time Travel copies and any lingering ciphertext undecryptable. D1 is unsuitable for keys because of Time Travel. | Workers KV: eventually consistent and one more product. Note that R2's internal retention after deletion is not documented, so it is **UNVERIFIED** (§22). |
| **Hono** (MIT) | Small, Workers-native router with middleware. | itty-router (thinner, less middleware). |
| **zod 4** (MIT) | Runtime validation. `z.toJSONSchema()` generates the published JSON Schemas. | valibot. |
| **React 19 + Vite** (MIT) for both SPAs | Widely known, good accessibility tooling. Vite builds static assets for Workers static assets. | Preact, Svelte. |
| **pdf-lib** (MIT) + `@pdf-lib/fontkit` (MIT) + Noto Sans TTF (OFL-1.1) | Pure-JS PDF generation that runs **in the browser**, so the Worker never renders PDFs (keeps CPU and bundle small). Noto Sans gives Unicode coverage for Latin, Greek, Cyrillic and Vietnamese. | Headless Chrome (heavy). PDFKit (Node-centric). |
| **jose** (MIT) | Cloudflare Access JWT verification, as Cloudflare's docs recommend [S-CF-ACCESS]. | — |
| **idb** (ISC) | Thin promise wrapper for IndexedDB. | Dexie (heavier). |
| **Vitest 4.1 + `@cloudflare/vitest-plugin`** | Runs Worker tests inside workerd/Miniflare locally with D1/R2 bindings, `applyD1Migrations` and `createScheduledController`. No network. `@cloudflare/vitest-pool-workers` is superseded [S-CF-VITEST]. | — |
| **Biome** (MIT/Apache-2.0) | One fast tool for lint and format. | ESLint + Prettier. |
| **pnpm workspaces** | Monorepo with shared packages. Strict dependency resolution. | npm workspaces. |

**Data residency.** D1 and R2 offer **no Australian jurisdiction**. Location hint `oc` (Oceania) is "best effort and not a guarantee" [S-CF-D1LOC][S-CF-R2LOC]. The deployment guide must tell agencies to create the database and buckets with location hint `oc` and to describe offshore storage in their collection notice and privacy policy (APP 8 question, §23 L21). This is the biggest stack trade-off, and Luke should confirm it (§24 Q2).

### 6.3 Packages (pnpm workspace, scope `@aurak/*`, all `"private": true` in v1)

- `packages/rules`: rule registry, citations, dates, retention, fees, ID gate, notices. Depends only on `zod`.
- `packages/forms`: form definitions (VIC Form 3A, NSW provisional), the payload builder (profile → allowed payload), consent catalogue, official text content, JSON Schema generation. Depends on `@aurak/rules`.
- `packages/crypto`: WebCrypto helpers that work in the browser and in Workers (AES-GCM, AES-KW, PBKDF2, base64url, SHA-256, random tokens).
- `packages/pdf`: PDF renderers built on `@aurak/forms` and pdf-lib. Browser-only usage in v1, but no DOM dependency.
- `apps/renter`: renter SPA.
- `apps/agent-ui`: staff SPA (served at `/agent/`).
- `apps/inbox-worker`: Worker (API, cron, assets).

### 6.4 Versions (npm registry, checked 2026-11-04)

Pin with `^` in the same major unless noted:

| Package | Version | Licence | Note |
|---|---|---|---|
| node | **24 LTS** (`.nvmrc`: `24`) | — | wrangler requires >=22 |
| pnpm | `packageManager: "pnpm@12.16.1"` | MIT | |
| typescript | **~5.9.3** | Apache-2.0 | 7.0.2 is "latest" but stay on 5.9 for v1 compatibility. Upgrade later. |
| wrangler | ^4.157.0 | MIT OR Apache-2.0 | |
| @cloudflare/vitest-plugin | ^1.5.1 | MIT | peer: vitest ^4.1 \|\| ^5 |
| vitest | **^4.1.12** | MIT | |
| hono | ^4.13.16 | MIT | |
| zod | ^4.6.7 | MIT | |
| jose | ^6.2.15 | MIT | |
| pdf-lib | ^1.17.1 | MIT | |
| @pdf-lib/fontkit | ^1.1.1 | MIT | |
| @expo-google-fonts/noto-sans | ^0.4.2 | MIT AND OFL-1.1 | Use `400Regular/NotoSans_400Regular.ttf` and `700Bold/NotoSans_700Bold.ttf`. Copy to `packages/pdf/fonts/` with `OFL.txt` at build via script, or import as asset. |
| react / react-dom | ^19.3.1 | MIT | |
| react-router | **^7** | MIT | Use v7 data-router API (8.x exists; v7 chosen for API stability). |
| vite | ^8.3.5 | MIT | |
| @vitejs/plugin-react | ^6.2.1 | MIT | |
| idb | ^8.0.4 | ISC | |
| @biomejs/biome | ^2.6.4 | MIT OR Apache-2.0 | |
| happy-dom | ^21.0.4 | MIT | UI tests |
| @testing-library/react | ^16.3.3 | MIT | |
| fake-indexeddb | ^6.2.7 | Apache-2.0 | renter vault tests |
| unpdf | ^2.1.0 | MIT | PDF text extraction in tests only |
| axe-core | latest 4.x | MPL-2.0 | dev only, accessibility tests |

---

## 7. Repository layout

```
au-rental-application-kit/
├─ .github/
│  ├─ workflows/ci.yml
│  ├─ ISSUE_TEMPLATE/{bug_report.md, rule_correction.md, new_jurisdiction.md}
│  └─ pull_request_template.md
├─ apps/
│  ├─ renter/
│  │  ├─ index.html
│  │  ├─ vite.config.ts            # base '/', server.host '127.0.0.1'
│  │  ├─ public/_headers           # security headers for static assets (see §14.6)
│  │  └─ src/
│  │     ├─ main.tsx, routes.tsx
│  │     ├─ vault/{vault.ts, keyring.ts, backup.ts, schema.ts}
│  │     ├─ profile/{ProfilePage.tsx, sections/*.tsx}
│  │     ├─ documents/{DocumentsPage.tsx, fileChecks.ts}
│  │     ├─ apply/{ApplyStart.tsx, ApplyFromListing.tsx, ManualListing.tsx, Review.tsx, Done.tsx, submit.ts}
│  │     ├─ portal/{MyApplication.tsx}   # applicant portal (token in URL fragment)
│  │     ├─ history/HistoryPage.tsx
│  │     ├─ settings/SettingsPage.tsx
│  │     ├─ legal/{LegalPage.tsx, Disclaimer.tsx}
│  │     └─ ui/*                    # accessible primitives, plain CSS
│  ├─ agent-ui/
│  │  ├─ index.html, vite.config.ts (base '/agent/')
│  │  └─ src/{main.tsx, routes.tsx, api.ts, pages/*.tsx, ui/*}
│  └─ inbox-worker/
│     ├─ wrangler.jsonc             # placeholders only (§13.2)
│     ├─ .dev.vars.example
│     ├─ migrations/0001_init.sql
│     ├─ scripts/{assemble-assets.mjs, gen-kek.mjs}
│     ├─ worker-configuration.d.ts  # generated by `wrangler types`
│     ├─ src/
│     │  ├─ index.ts                # export default { fetch, scheduled }
│     │  ├─ env.ts                  # Env validation at startup
│     │  ├─ app.ts                  # Hono app wiring
│     │  ├─ auth/{access.ts, dev.ts, roles.ts, applicantToken.ts}
│     │  ├─ routes/{public.ts, applicant.ts, agent/*.ts, health.ts}
│     │  ├─ domain/{stateMachine.ts, listings.ts, applications.ts, documents.ts, notices.ts, retention.ts, audit.ts}
│     │  ├─ storage/{ports.ts, d1Repo.ts, r2Blobs.ts, keyVault.ts}
│     │  ├─ crypto/{envelope.ts}
│     │  ├─ security/{headers.ts, csrf.ts, rateLimit.ts, turnstile.ts, uploads.ts}
│     │  ├─ jobs/purge.ts
│     │  └─ log.ts                  # allowlisted structured logger
│     └─ test/
│        ├─ apply-migrations.ts, env.d.ts, helpers/*.ts
│        └─ *.test.ts
├─ packages/
│  ├─ rules/
│  │  ├─ src/{index.ts, types.ts, registry.ts, dates.ts, penaltyUnits.ts, retention.ts, fees.ts, idGate.ts, notices.ts, citations.ts}
│  │  ├─ src/jurisdictions/{vic/rules.ts, nsw/rules.ts, cth/rules.ts}
│  │  └─ test/{vic.*.test.ts, nsw.*.test.ts, registry.test.ts, ruleCoverage.test.ts, helpers/ruleTest.ts}
│  ├─ forms/
│  │  ├─ src/{index.ts, types.ts, profile.ts, consents.ts, buildPayload.ts, exportJson.ts}
│  │  ├─ src/vic/{form3a.ts, payload.ts}
│  │  ├─ src/nsw/{provisional.ts, payload.ts}
│  │  └─ test/*.test.ts
│  ├─ crypto/{src/*.ts, test/*.test.ts}
│  └─ pdf/{src/{index.ts, layout.ts, vicForm3a.ts, nswProvisional.ts, fonts.ts}, fonts/{NotoSans-Regular.ttf, NotoSans-Bold.ttf, OFL.txt}, test/*.test.ts}
├─ content/
│  ├─ LICENSE.md                    # CC BY 4.0 notice and attribution for government text
│  ├─ vic/{form3a-part-a.md, form3a-part-b.md, form3-statement.md}
│  └─ nsw/README.md                 # "approved form not yet published"
├─ schemas/{application.v1.schema.json, profile-backup.v1.schema.json, listing-public.v1.schema.json}   # generated
├─ fixtures/
│  ├─ profiles/{vic-employed.json, vic-no-regular-income.json, nsw-student.json}
│  ├─ listings/{vic-listing.json, nsw-listing.json}
│  ├─ documents/{sample-payslip.pdf, sample-id.png}   # synthetic, generated by script, contain "SAMPLE – NOT A REAL DOCUMENT"
│  └─ jwt/README.md                 # keys are generated at test time; none committed
├─ docs/
│  ├─ rules.md                      # generated from registry
│  ├─ LEGAL-QUESTIONS.md
│  ├─ PRIVACY-DESIGN.md             # data flows, threat model, retention matrix
│  ├─ DEPLOY-CLOUDFLARE.md
│  ├─ ADDING-A-JURISDICTION.md
│  ├─ ARCHITECTURE.md
│  └─ SOURCES.md                    # all sources with check dates
├─ scripts/{gen-rules-doc.ts, gen-schemas.ts, check-placeholders.mjs, check-deps.mjs, check-generated.mjs, make-fixture-docs.mjs}
├─ biome.json, tsconfig.base.json, tsconfig.json, vitest.config.ts (projects), pnpm-workspace.yaml, package.json
├─ .gitignore, .nvmrc, .editorconfig
├─ README.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, NOTICE, CHANGELOG.md
└─ PLAN.md (this file; keep it)
```

`.gitignore` must include: `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars*` (but **not** `.dev.vars.example`; add `!.dev.vars.example`), `.env*` (with `!.env.example` if one is added), `coverage/`, `*.local`, `apps/inbox-worker/public/` (assembled at build).

Root `package.json` scripts:

```json
{
  "scripts": {
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "pnpm -r --parallel exec tsc --noEmit",
    "test": "vitest run",
    "build": "pnpm -r --filter ./packages/* build && pnpm --filter @aurak/renter build && pnpm --filter @aurak/agent-ui build && pnpm --filter @aurak/inbox-worker build",
    "gen": "tsx scripts/gen-rules-doc.ts && tsx scripts/gen-schemas.ts",
    "check:generated": "node scripts/check-generated.mjs",
    "check:placeholders": "node scripts/check-placeholders.mjs",
    "check:deps": "node scripts/check-deps.mjs",
    "dev:inbox": "pnpm --filter @aurak/inbox-worker dev",
    "dev:renter": "pnpm --filter @aurak/renter dev"
  }
}
```

(`tsx` MIT, dev dependency, runs TS scripts.) `inbox-worker` `build` = `node scripts/assemble-assets.mjs && wrangler types && wrangler deploy --dry-run --outdir dist`. The dry run bundles without deploying. If it needs credentials in CI, use `wrangler build` or an esbuild bundle instead and note it. `dev` = `wrangler dev --ip 127.0.0.1 --port 8787 --env development`.

---

## 7A. Domain vocabulary

- **Listing**: one property offered for rent by the deploying agency or provider.
- **Application**: one adult applicant's submission for one listing. Co-applicants each submit their own, optionally linked by a **group code**.
- **Preferred applicant**: the applicant the landlord intends to enter an agreement with. This is the trigger for the ID stage.
- **Agreement date**: local date the residential rental agreement is entered into. VIC destruction periods count from it.
- **Legal deadline**: the latest destroy time the rules allow (may be `null` if unknown).
- **Policy deadline**: the time the inbox will actually purge. Always ≤ legal deadline − 2 days (§11.4).
- **Purge**: crypto-shred (delete the wrapped DEK) then delete ciphertext and rows, leaving a tombstone and receipt with no personal information.

---

## 8. Rules engine (`@aurak/rules`)

### 8.1 Types

```ts
export type Jurisdiction = "VIC" | "NSW" | "CTH";
export type ISODate = `${number}-${number}-${number}`; // YYYY-MM-DD, local date in the jurisdiction

export interface Citation {
  instrument: string;          // e.g. "Residential Tenancies Act 1997 (Vic)"
  pinpoint: string;            // e.g. "s 505BC(1)(b)(i)"
  url: string;                 // https URL
  checkedOn: ISODate;          // "2026-11-04"
  sourceKind: "legislation" | "bill" | "regulator_guidance" | "regulator_form" | "government_release" | "secondary";
  versionNote?: string;        // e.g. "Authorised version 115, in force from 2026-10-13"
  excerpt?: string;            // ≤ 40 words verbatim, optional
}

export type Confidence = "verified_primary" | "verified_secondary" | "unverified";
export type Commencement =
  | { kind: "fixed"; from: ISODate; to?: ISODate }
  | { kind: "pending_proclamation"; configKey: "NSW_PPI_COMMENCEMENT_DATE" }
  | { kind: "guidance" }; // best-practice guidance, not law

export interface Penalty { individualPU?: number; bodyCorporatePU?: number; otherwisePU?: number }

export type RuleKind =
  | "form" | "collection_limit" | "document_limit" | "id_timing" | "inspection"
  | "purpose_limit" | "security" | "retention" | "disclosure" | "fee"
  | "notice" | "statement" | "informational";

export interface Rule<P = unknown> {
  id: string;                  // stable, e.g. "VIC.RETENTION.UNSUCCESSFUL_30D"
  jurisdiction: Jurisdiction;
  kind: RuleKind;
  title: string;
  summary: string;             // plain English, ≤ 60 words, no advice
  commencement: Commencement;
  params: P;                   // typed per rule
  penalty?: Penalty;
  citations: [Citation, ...Citation[]];  // at least one
  confidence: Confidence;
  notes?: string;              // e.g. "Section numbers from LA second print; final Act UNVERIFIED"
}

export type RuleStatus = "in_force" | "not_yet_in_force" | "pending_commencement" | "guidance" | "expired";
export interface EngineOptions { nswPpiCommencementDate?: ISODate | null }
```

### 8.2 Engine API (pure functions, no I/O)

```ts
getRule(id: string): Rule
listRules(j?: Jurisdiction): Rule[]
ruleStatus(rule: Rule, on: ISODate, opts?: EngineOptions): RuleStatus
activeRules(j: Jurisdiction, on: ISODate, opts?: EngineOptions): Rule[]        // in_force only
policyRules(j: Jurisdiction, on: ISODate, opts?: EngineOptions): Rule[]        // in_force + pending_commencement + guidance (privacy-first defaults)

penaltyUnitValueAUD(j: "VIC" | "NSW", on: ISODate): { value: number; ruleId: string } | null
penaltyToAUD(p: Penalty, j: "VIC" | "NSW", on: ISODate): { individual?: number; bodyCorporate?: number } // display only

validateListingRequest(input: ListingRequestInput, on: ISODate, opts?): Violation[]
  // VIC: ≤2 financial types from allowed 3; ≤2 identity types from allowed 12; ≤3 tenancy databases; jurisdiction exclusions (reg 14A(3)) → error "use not supported"
  // NSW provisional: identity docs not allowed at application stage (identity_stage must be 'preferred'); financial ≤ NSW_PROVISIONAL max

canCollectIdentityDocuments(ctx: { jurisdiction; listingIdentityStage; applicationStatus; intentNoticeRecordedAt?: string }, on, opts?): { allowed: boolean; ruleIds: string[]; reason?: string }

computeRetention(event: RetentionEvent, j, on, opts?, policy: RetentionPolicy): {
  legalDeadline: string | null;  // ISO instant (UTC) or null when law sets no fixed period
  policyDeadline: string;        // ISO instant (UTC), ≤ legalDeadline − 2 days when legalDeadline exists
  ruleIds: string[];
}

evaluateFee(input: { jurisdiction; chargedBy: "third_party" | "agent" | "provider" | "adi"; matter: FeeMatter; on: ISODate }):
  { result: "prohibited" | "not_prohibited_by_encoded_rules" | "unknown"; ruleIds: string[] }

requiredNotices(ctx: NoticeContext, on, opts?): NoticeRequirement[]   // VIC 439D (7 days), NSW 210E (before ID)
excludedInformationCatalogue(j): ExcludedItem[]   // things never asked for, with reasons and rule ids (§9.3)
rulesVersion(): string   // sha256 of canonical JSON of the registry; stamped on every application/export
```

Types used above:

```ts
type RetentionEvent =
  | { kind: "unsuccessful"; agreementDate: ISODate; vicOtherPremisesConsent: boolean }
  | { kind: "listing_withdrawn_no_agreement"; closedOn: ISODate }
  | { kind: "application_withdrawn"; withdrawnAt: string }
  | { kind: "successful"; agreementDate: ISODate; tenancyEndDate?: ISODate }
  | { kind: "identity_document"; uploadedAt: string; verifiedAt?: string; decidedAt?: string }
  | { kind: "improperly_collected"; awareAt: string };

interface RetentionPolicy {   // agency settings, validated against legal caps
  unsuccessfulDays: number;          // default 14
  keepConsentedUnsuccessful: boolean;// default false
  successfulHandoffDays: number;     // default 30
  withdrawnDays: number;             // default 2
  listingWithdrawnDays: number;      // default 14
  identityDocMaxDays: number;        // default 7
}
type FeeMatter = "application" | "background_check" | "tenancy_history_check" | "credit_check" | "database_check" | "identity_verification" | "administrative" | "failed_payment" | "rent_payment";
```

Date semantics: legal dates are local calendar dates. For deadlines, convert `YYYY-MM-DD + N days` to the **start (00:00) of the deadline day in UTC** (conservative, at least 10 hours early for AU time zones), then subtract the 2-day safety margin for policy deadlines. Do not depend on time-zone libraries. Add month arithmetic for "6 months" (clamp to month end). Add "3 years" (clamp 29 Feb → 28 Feb).

### 8.3 VIC rules to encode (ids, params, citations)

All citations: `checkedOn: "2026-11-04"`. Act URL: `https://www.legislation.vic.gov.au/in-force/acts/residential-tenancies-act-1997/115` (versionNote "Authorised version 115, in force from 2026-10-13"). Regs URL: `https://www.legislation.vic.gov.au/in-force/statutory-rules/residential-tenancies-regulations-2021/009` (versionNote "Version 009, in force from 2026-06-30"). CAV URLs from §25.

| Rule id | Kind | Commencement | Params | Penalty | Citations | Confidence |
|---|---|---|---|---|---|---|
| `VIC.FORM.PRESCRIBED_FORM_3A` | form | fixed 2026-03-31 | `{ formId: "VIC-3A-2026-03-31", excludedProviders: ["homes_victoria","registered_agency"], excludedPrograms: ["victorian_affordable_housing_program","specialised_housing_program"] }` | ind 60 / bc 300 | RTA s 30AC; Regs reg 14A; CAV applying page | verified_primary |
| `VIC.FORM.STATEMENT_FORM_3` | statement | fixed 2021-03-29 | `{ contentFile: "content/vic/form3-statement.md" }` | — | RTA s 29C; Regs reg 14; CAV Form 3 docx | verified_primary |
| `VIC.COLLECT.ONLY_FORM_3A_INFO` | collection_limit | fixed 2026-03-31 | `{ allowedFieldPaths: <from forms package> }` | 60 / 300 | RTA s 30C(1); Regs reg 15 | verified_primary |
| `VIC.COLLECT.PRESCRIBED_CATEGORIES` | collection_limit | fixed 2026-03-31 | `{ identityItems: [4,7], financialItems: [6], employmentItems: [5] }` | — | RTA s 30BA; reg 14B | verified_primary |
| `VIC.DOCS.FINANCIAL_MAX_TWO` | document_limit | fixed 2026-03-31 | `{ max: 2, allowed: ["payslip","bank_statement_no_transactions","centrelink_statement_or_letter"] }` | (via s 30C) | Form 3A item 6 | verified_primary |
| `VIC.DOCS.IDENTITY_MAX_TWO` | document_limit | fixed 2026-03-31 | `{ max: 2, allowed: <12 ids, §9.1> }` | (via s 30C) | Form 3A item 7 | verified_primary |
| `VIC.DOCS.BANK_STATEMENT_NO_TRANSACTIONS` | document_limit | fixed 2026-03-31 | `{ uiWarning: true }` | — | Form 3A item 6; CAV applying page | verified_primary |
| `VIC.USE.PURPOSE_LIMIT` | purpose_limit | fixed 2021-03-29 | `{}` | 60 / 300 | RTA s 30B | verified_primary |
| `VIC.SECURITY.REASONABLE_STEPS` | security | fixed 2025-11-25 | `{}` | 60 / 300 | RTA s 505BB; CAV new-changes (date) | verified_primary (date from CAV) |
| `VIC.RETENTION.SUCCESSFUL_3Y` | retention | fixed 2025-11-25 | `{ yearsAfterTermination: 3 }` | 60 / 300 | RTA s 505BC(1)(a) | verified_primary |
| `VIC.RETENTION.UNSUCCESSFUL_30D` | retention | fixed 2025-11-25 | `{ daysAfterAgreement: 30 }` | 60 / 300 | RTA s 505BC(1)(b)(i) | verified_primary |
| `VIC.RETENTION.UNSUCCESSFUL_CONSENT_6M` | retention | fixed 2025-11-25 | `{ monthsAfterAgreement: 6, requiresWrittenConsent: true }` | 60 / 300 | RTA s 505BC(1)(b)(ii) | verified_primary |
| `VIC.RETENTION.EXCEPTIONS` | informational | fixed 2025-11-25 | `{}` | — | RTA s 505BC(2)–(3) | verified_primary |
| `VIC.DISCLOSE.WRITTEN_CONSENT` | disclosure | fixed 2025-11-25 | `{}` | 60 / 300 | RTA s 505BD | verified_primary |
| `VIC.PRIVACY.RELATIONSHIP_OTHER_LAWS` | informational | fixed 2025-11-25 | `{}` | — | RTA s 505BE | verified_primary |
| `VIC.DB.DISCLOSE_IN_FORM` | notice | fixed 2026-03-31 | `{ maxRows: 3 }` | — | Form 3A item 11 | verified_primary |
| `VIC.DB.LISTING_NOTICE_7D` | notice | fixed 2021-03-29 | `{ daysAfterUse: 7 }` | ind 60 | RTA s 439D(2) | verified_primary |
| `VIC.FEES.THIRD_PARTY_BAN` | fee | fixed 2026-03-31 to 2026-10-12 | `{ appliesTo: ["third_party"], matters: <all FeeMatter> }` | — (penalty in the pre-13-Oct s 51A wording not reviewed: UNVERIFIED) | CAV new-changes; reg 21C | verified_primary (dates from CAV; earlier s 51A wording not read, see notes) |
| `VIC.FEES.ALL_PERSONS_EXCEPT_ADI_BAN` | fee | fixed 2026-10-13 | `{ appliesTo: ["third_party","agent","provider"], exempt: ["adi"], matters: <all FeeMatter> }` | 80 / 400 | RTA s 51A (v115); reg 21C; CAV new-changes | verified_primary |
| `VIC.FORM.SEPARATE_FORM_PER_ADULT` | informational | fixed 2026-03-31 | `{ minAge: 18 }` | — | Form 3A preamble | verified_primary |
| `VIC.PENALTY_UNIT.2026_27` | informational | fixed 2026-07-01 to 2027-06-30 | `{ valueAUD: 209.10 }` | — | Vic Gov notice | verified_primary |
| `VIC.PENALTY_UNIT.2025_26` | informational | fixed 2025-07-01 to 2026-06-30 | `{ valueAUD: 203.51 }` | — | Sentencing Advisory Council (secondary, via search) | verified_secondary |

Note on older provisions: s 29C/reg 14, s 30B and s 439D were in force before this research window. The kit uses `2021-03-29` (commencement of Regulations 2021 v001 and the 2018 reforms) as an "in force at least from" date. The exact earlier commencement dates are **UNVERIFIED** and do not affect v1 behaviour. Record this in each rule's `notes`.

Notes for `VIC.FEES.*`: between 2026-03-31 and 2026-10-12, `evaluateFee` returns `prohibited` for third parties. For agents and providers it returns `"unknown"`, with the note "Form 3A Part B item 3 states no application fees; pre-13-Oct s 51A wording not reviewed: UNVERIFIED". On and after 2026-10-13 it returns `prohibited` for everyone except `adi`.

### 8.4 NSW and Commonwealth rules to encode

Bill citation, for all `NSW.PPI.*`:
`{ instrument: "Residential Tenancies Amendment (Protection of Personal Information) Bill 2025 (NSW), Legislative Assembly second print", url: "https://www.parliament.nsw.gov.au/bill/files/18774/Second%20Print.pdf", versionNote: "Archived copy 2026-03-15: http://web.archive.org/web/20260315222908/https://www.parliament.nsw.gov.au/bill/files/18774/Second%20Print.pdf. Final Act text (Legislative Council amendments) UNVERIFIED.", sourceKind: "bill" }`. Add the REINSW and ministerial-release citations as secondary or government_release where they corroborate.

| Rule id | Kind | Commencement | Params | Penalty | Confidence |
|---|---|---|---|---|---|
| `NSW.CURRENT.NO_APPLICATION_FEES_S23` | fee | guidance (law in force; s 23 text UNVERIFIED) | `{ allowedPreAgreement: ["holding_fee","rent","bond","registration_fee"] }` | — | verified_secondary (regulator guidance) |
| `NSW.GUIDANCE.SIGHT_ID_DONT_STORE` | id_timing | guidance | `{ deleteAfterVerification: true }` | — | verified_primary (guidance) |
| `NSW.GUIDANCE.REDACT_BANK_TRANSACTIONS` | document_limit | guidance | `{}` | — | verified_primary (guidance) |
| `NSW.GUIDANCE.MINIMUM_NECESSARY` | collection_limit | guidance | `{ excluded: ["marital_status","bond_claim_history","dispute_history","credit_report","non_lessee_employment"] }` | — | verified_primary (guidance) |
| `NSW.PPI.APPS_APPLY` | security | pending_proclamation | `{}` | ind 100 / otherwise 450 | unverified (second print) |
| `NSW.PPI.ENTITY_DEFINITION` | informational | pending_proclamation | `{ includesTenantEngagedServices: true }` | — | unverified |
| `NSW.PPI.DIRECT_COLLECTION` | collection_limit | pending_proclamation | `{}` | 50 / 200 | unverified |
| `NSW.PPI.APPROVED_FORM` | form | pending_proclamation | `{ formId: null, provisionalFormId: "NSW-PROVISIONAL-2026-11-04" }` | 50 / 300 | unverified |
| `NSW.PPI.INSPECT_BEFORE_APPLY` | inspection | pending_proclamation | `{ writtenStatementExceptions: ["unable","does_not_wish"] }` | 50 / 200 | unverified |
| `NSW.PPI.ID_AFTER_INTENT_NOTICE` | id_timing | pending_proclamation | `{ requiresIntent: true, requiresPriorWrittenNotice: true }` | 50 / 200 | unverified (corroborated by REINSW and ministerial release) |
| `NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD` | retention | pending_proclamation | `{ businessDays: 2 }` | 50 / 200 | unverified (corroborated by REINSW) |
| `NSW.PPI.REGULATIONS_PENDING` | informational | pending_proclamation | `{ topics: ["info_types","documents","doc_count","tenant_choice","digital_id","security","retention_max","access_correction","records"] }` | up to 450 | unverified |
| `NSW.PPI.TRIBUNAL_ORDERS` | informational | pending_proclamation | `{}` | — | unverified |
| `NSW.PENALTY_UNIT` | informational | fixed 1999-01-01 (open-ended) | `{ valueAUD: 110 }` | — | verified_secondary |
| `CTH.PRIVACY.COVERAGE_THRESHOLD` | informational | guidance | `{ turnoverAUD: 3000000, alwaysCovered: ["residential_tenancy_database_operator"] }` | — | verified_primary (OAIC) |
| `CTH.APP.11_2_DESTROY_WHEN_NOT_NEEDED` | retention | guidance | `{}` | — | unverified |

`policyRules()` (privacy-first defaults the inbox and renter app apply) includes `pending_commencement` NSW rules **before** commencement. This is lawful because it is stricter than current NSW practice requirements. The UI labels them "Applied early as best practice; not yet in force". When `NSW_PPI_COMMENCEMENT_DATE` is set and reached, `ruleStatus` returns `in_force` and the label changes.

### 8.5 Extensibility contract

To add a jurisdiction:

1. Create `packages/rules/src/jurisdictions/<code>/rules.ts` exporting `Rule[]`.
2. Add a form in `packages/forms/src/<code>/`.
3. Register both.
4. Add tests through `ruleTest()`.
5. Run `pnpm gen`.

No engine code changes should be needed beyond adding the code to the `Jurisdiction` union. Document this in `docs/ADDING-A-JURISDICTION.md`, using QLD Form 22 as the worked "next" example (marked UNVERIFIED).

### 8.6 Rules tests (the legal rules encoded as tests)

- `test/helpers/ruleTest.ts` exports `ruleTest(ruleId, name, fn)`. It wraps `it()`, records the rule id in a global set, and asserts the rule exists.
- **Every rule has at least one `ruleTest`** asserting its behaviour. `ruleCoverage.test.ts` runs last (use a vitest `sequence` or a separate project with `dependsOn`, or compute coverage by statically scanning test files for `ruleTest("ID"` with a regex). It fails if any registry id lacks a test.
- `registry.test.ts`:
  - ids are unique and match `/^(VIC|NSW|CTH)\.[A-Z0-9_.]+$/`;
  - every citation has an https URL, a `checkedOn` matching `/^\d{4}-\d{2}-\d{2}$/` and a non-empty pinpoint;
  - `confidence: "unverified"` rules carry `notes`;
  - `rulesVersion()` is stable for identical input.
- Required behavioural tests (minimum):
  - VIC fee: third party on 2026-03-30 → not prohibited by encoded rules; on 2026-03-31 → prohibited. Agent on 2026-10-12 → unknown; on 2026-10-13 → prohibited. ADI on 2026-11-04 → not prohibited.
  - VIC retention: agreement 2026-11-10 → unsuccessful legal deadline is the start of 2026-12-10 (UTC), and the policy default (14 days) is ≤ legal − 2 days. With consent and `keepConsentedUnsuccessful: true` → legal is the start of 2027-05-10, policy = legal − 2 days. Successful with tenancy end 2027-11-09 → legal is the start of 2030-11-09. Month-end clamping: 2026-08-31 + 6 months → 2027-02-28.
  - Policy cannot exceed legal: an agency setting of 60 unsuccessful days in VIC → `validateRetentionPolicy` error citing `VIC.RETENTION.UNSUCCESSFUL_30D`.
  - VIC listing validation: 3 identity docs → violation `VIC.DOCS.IDENTITY_MAX_TWO`. "tax_return" requested → violation. 4 databases → violation.
  - NSW ID gate: status `submitted` → not allowed (`NSW.PPI.ID_AFTER_INTENT_NOTICE`). `preferred` without notice → not allowed. `preferred` with notice recorded → allowed.
  - NSW inspection: neither inspected date nor written statement → payload builder rejects (`NSW.PPI.INSPECT_BEFORE_APPLY`).
  - NSW improper collection: event → legal deadline = awareAt + 2 business days (weekends skipped; no holiday list). Policy deadline = immediate (`awareAt`).
  - Status: NSW PPI rules on 2026-11-04 with no config → `pending_commencement`. With config `2027-02-01` on 2027-02-01 → `in_force`.
  - Penalty AUD: VIC 300 PU on 2026-11-04 → 62,730. NSW 450 PU → 49,500.

---

## 9. Form schemas (`@aurak/forms`)

### 9.1 VIC Form 3A, field for field (verified against Regs v009 Sch 1 Form 3A and the CAV docx)

`formId: "VIC-3A-2026-03-31"`. Labels below are verbatim; render them exactly. "Who" = who completes it, per the form's "Who completes this application form?" text: the provider or agent completes item 2, the document requests in items 6–7 and item 11; the applicant completes the rest.

| Item | Path | Verbatim label | Who | Type and validation | Required |
|---|---|---|---|---|---|
| 1 | `item1.premisesAddress` | Address of premises | agent (listing) | string 5–200 | yes |
| 2 | `item2.name` | Full name or company name of rental provider or their agent | agent | string 2–200 | yes |
| 2 | `item2.acnOrAbn` | ACN (or ABN if not a registered company) | agent | digits only, length 9 or 11 | if applicable |
| 2 | `item2.address` | Address | agent | string ≤200 | yes |
| 2 | `item2.phone` | Phone number | agent | AU phone pattern | yes |
| 2 | `item2.email` | Email address | agent | email | yes |
| 2 | `item2.providerStateOrTerritory` | Australian State or Territory in which the rental provider resides | agent | enum `VIC NSW QLD SA WA TAS NT ACT overseas` | yes |
| 3 | `item3.totalOccupants` | Total number of occupants intended to reside on the premises | applicant | integer 1–20 (count only, no names or ages) | yes |
| 4 | `item4.fullName` | Full name | applicant | string 1–150 | yes |
| 4 | `item4.dateOfBirth` | Date of birth | applicant | ISO date, age ≥ 16 (warn if < 18) | yes |
| 4 | `item4.currentAddress` | Current address | applicant | string ≤200 | yes |
| 4 | `item4.postcode` | Postcode | applicant | `^\d{4}$` | yes |
| 4 | `item4.phone` | Phone | applicant | AU phone | yes |
| 4 | `item4.email` | Email | applicant | email | yes |
| 5 | `item5.employer` | Current or most recent employer | applicant | string ≤150 | see rule† |
| 5 | `item5.employerAddress` | Employer address | applicant | string ≤200 | see rule† |
| 5 | `item5.netWeeklyIncomeCents` | Net weekly income | applicant | integer cents ≥0 | see rule† |
| 5 | `item5.employmentEndedOn` | If not currently employed, date on which most recent employment ended: | applicant | ISO date | if not employed |
| 6 | `item6.requested[0..1]` | (a)/(b) [Rental provider or their agent to indicate requested financial document] | agent | enum `payslip`, `bank_statement_no_transactions`, `centrelink_statement_or_letter`; max 2, unique | — |
| 6 | `item6.documents[]` | (one copy of each requested document) | applicant | doc refs matching requested types | as requested |
| 6 | `item6.noRegularIncomeDetails` | (details of previous employment or other documents supporting financial ability to pay rent, such as proof of savings or assets) | applicant | string ≤1000 | optional |
| 7 | `item7.requested[0..1]` | (a)/(b) [Rental provider or their agent to indicate requested identity document] | agent | enum (12 below); max 2, unique | — |
| 7 | `item7.documents[]` | (a copy of each requested document) | applicant | doc refs | as requested **and** stage allows (§11) |
| 8 | `item8.property1.{address, postcode, periodFrom, periodTo?, providerName?, providerEmail?, providerPhone?}` | Current / most recent address · Postcode · Period of residence at address · Rental provider / agent name if applicable · … email if applicable · … phone contact details if applicable | applicant | strings/dates; `periodTo` may be future ("will vacate") | address, postcode, periodFrom required |
| 8 | `item8.property2.{same}` | Previous address · … | applicant | same | optional |
| 9 | `item9.referee1/2.{name, phone, email, connection}` | Name · Phone · Email · Referee's connection to applicant | applicant | strings | **only if `listing.refereesRequested`**; otherwise excluded |
| 10 | `item10.desiredLeaseTerm` | Desired lease term (e.g. 6 months, 12 months, 24 months): | applicant | string ≤40 | yes |
| 10 | `item10.preferredMoveInDate` | Preferred move in date: | applicant | ISO date | yes |
| 11 | `item11.databases[0..2].{name, phone, webAddress}` | Tenancy database name · Phone number · Web address | agent | max 3 rows | if used |
| 12 | `item12.{printName, signature, date}` | Print name · Signature · Date, with ack "I understand that my application may not be processed unless all required documents are submitted." | applicant | `signature` = typed full name + `signatureMethod: "typed"`; must equal `printName` | yes |

† Item 5 rule: either (`employer` and `netWeeklyIncomeCents`) or `employmentEndedOn`. If neither, require `item6.noRegularIncomeDetails` (the form says to give ability-to-pay details under item 6).

**Identity document enum (item 7, exact order):**
`driver_licence` "Driver licence"; `proof_of_age_card` "Proof of age card (government issued)"; `medicare_card` "Medicare card"; `australian_passport` "Australian passport"; `foreign_passport_and_visa` "Foreign passport and Australian visa"; `birth_certificate` "Birth certificate"; `citizenship_certificate` "Certificate of Australian citizenship"; `tertiary_student_id` "Tertiary student identification card"; `centrelink_card` "Centrelink card"; `dva_card` "Department of Veterans' Affairs card"; `utilities_bill_current_address` "Utilities bill at current address"; `government_letter_current_address` "Letter from a government Department addressed to current address".

**Financial enum (item 6):** `payslip` "Pay slips from current or recent employment"; `bank_statement_no_transactions` "Bank statement (without transaction details)"; `centrelink_statement_or_letter` "Centrelink payment statements or letters".

**Rendering order** (web and PDF): heading block ("Residential rental application", "Residential Tenancies Act 1997 Section 30AC", "Residential Tenancies Regulations 2021 Regulation Sections 14A and 14B"), intro paragraphs, "Who completes this application form?", **PART A—GENERAL** items 1–12 in order, **PART B–RIGHTS AND OBLIGATIONS** (Appendix B), then the **Statement of Information for Rental Applicants** (Form 3, Appendix C, required by s 29C). Store the Part A intro and instruction text verbatim in `content/vic/form3a-part-a.md` (Appendix A).

### 9.2 NSW PROVISIONAL schema (UNVERIFIED: the approved form is not yet published)

`formId: "NSW-PROVISIONAL-2026-11-04"`. Every NSW screen, PDF page and JSON export carries this banner:

> **PROVISIONAL — not the NSW approved form.** NSW has passed laws requiring an approved rental application form, but the form and its regulations had not been published when this version was built. This layout follows the Residential Tenancies Act 2010 (NSW) as amended (not yet commenced) and NSW Fair Trading Commissioner's guidance. Check NSW Fair Trading for the current form.

Fields (paths `nsw.*`):

- `premisesAddress`
- `landlordOrAgent.{name, abnOrAcn?, address, phone, email}`
- `occupants.total` (count only)
- `applicant.{fullName, dateOfBirth, currentAddress, postcode, phone, email}`. DOB at application is an open legal question (L12); default is to include it.
- `employment.{employer?, netWeeklyIncomeCents?, employmentEndedOn?}`. Only for applicants who will be on the lease.
- `financialEvidence.documents[]`: tenant-chosen from `payslip`, `bank_statement_transactions_redacted`, `centrelink_statement_or_letter`, `rental_ledger`, `proof_of_savings`. **Default max 1**, configurable to 2 per listing (guidance warns against multiple forms when one is enough).
- `rentalHistory.property1/2` (same shape as VIC item 8).
- `references[0..1]` (only if requested).
- `lease.{desiredTerm, preferredMoveInDate}`
- `inspection`: `{ status: "inspected", inspectedOn: ISODate }` or `{ status: "unable" | "does_not_wish", writtenStatement: true }`. Statement text is in the consent catalogue.
- `tenancyDatabases[0..2]` (agent-provided)
- `declaration.{printName, signature, date}`

No identity documents at application stage, ever. The ID stage (§11) accepts these ID types: `driver_licence`, `photo_card`, `australian_passport`, `foreign_passport_and_visa`, `medicare_card`, `birth_certificate`, `citizenship_certificate`, `centrelink_card`, `student_id`. This list is PROVISIONAL and the default ID-stage request is **one** document. Configurable max is 2.

### 9.3 Never-collected catalogue (both jurisdictions)

The renter profile and the forms **have no fields** for these. Unit tests assert that no schema contains keys matching them.

Photos or selfies; social media accounts; relationship or marital status; children's details (names, ages, schools); physical features or tattoos; protected attributes (ethnicity, religion, gender identity, disability, etc.); tax file number; credit report; bond claim history; tribunal or dispute history; bank statements with daily transactions; employment information of adults not on the lease; pet details (not on VIC Form 3A).

Sources: CAV applying page; NSW Fair Trading guidance; ministerial release; OAIC (TFN).

### 9.4 Consent catalogue (`packages/forms/src/consents.ts`)

Each entry has: `id@version`, `jurisdictions`, `whenShown`, `text` (plain English) and `sha256` (computed and snapshot-tested; changing the text requires a version bump, enforced by the test).

1. `share_with_agency@1` (all): "I am giving this application to {agencyName} so that they and the rental provider can assess whether I am suitable to rent {premisesAddress}. I understand it will be used only for that purpose and destroyed on the schedule shown."
2. `referee_contact@1` (if referees requested): "{agencyName} may contact the referees and previous rental providers I listed to check my application."
3. `tenancy_database_check@1` (if databases listed): "I understand {agencyName} may check the tenancy databases listed in this application."
4. `vic_retain_for_other_premises@1` (VIC, optional, default **unchecked**): "I consent in writing to {agencyName} keeping and using my application to apply for other premises for up to 6 months after an agreement is signed for this property." (s 505BC(1)(b)(ii))
5. `nsw_inspection_statement@1` (NSW, when not inspected): "I state that I am {unable to | do not wish to} inspect the premises before submitting this application." (s 210D(3))

VIC: no declaration other than Form 3A item 12's acknowledgement (legal question L4 covers whether consent checkboxes are "information").

### 9.5 Payload builder (`buildPayload`)

```ts
buildPayload(input: {
  profile: RenterProfile;            // local superset (§10.3)
  listing: ListingPublicV1;          // from inbox or manual entry
  selections: { financialDocIds: string[]; identityDocIds: string[]; historyIds: [string, string?]; refereeIds: string[]; inspection?: NswInspection; consents: Record<string, boolean>; signature: { printName: string; date: ISODate } };
  on: ISODate;
  opts?: EngineOptions;
}): { payload: ApplicationPayloadV1; shared: SharedItem[]; excluded: ExcludedItem[]; errors: Violation[] }
```

- Produces **only** paths defined by the listing's form.
- `excluded[]` lists every profile item not shared, each with a `ruleId` and a human reason (e.g. "Your third previous address is not on Form 3A", "References not requested", "ID documents are requested later, only if you are the preferred applicant (NSW s 210E)", "Document type not requested by this agent").
- Rejects documents not of requested types, more than the max, or files over the limits (§14.7).
- The output is validated by the form's zod schema with `.strict()`, so unknown keys are an error.

### 9.6 JSON export (`application.v1`)

```jsonc
{
  "$schema": "https://github.com/ImLukeF/au-rental-application-kit/blob/main/schemas/application.v1.schema.json",
  "schemaVersion": "aurak.application.v1",
  "formId": "VIC-3A-2026-03-31",
  "jurisdiction": "VIC",
  "rulesVersion": "sha256:…",
  "generatedAt": "2026-11-04T01:23:45.000Z",
  "generator": { "name": "au-rental-application-kit", "version": "0.1.0" },
  "provisional": false,
  "listing": { "item1": {…}, "item2": {…}, "item6Requested": […], "item7Requested": […], "item11": […] },
  "applicant": { "item3": {…}, "item4": {…}, "item5": {…}, "item6": { "documents": [{ "docId": "…", "type": "payslip", "filename": "…", "sha256": "…", "byteLength": 1234 }], "noRegularIncomeDetails": null }, "item7": {…}, "item8": {…}, "item9": null, "item10": {…}, "item12": {…} },
  "consents": [{ "id": "share_with_agency@1", "sha256": "…", "granted": true, "at": "…" }],
  "excluded": [{ "path": "profile.addresses[2]", "ruleId": "VIC.COLLECT.ONLY_FORM_3A_INFO", "reason": "…" }],
  "disclaimer": "Generated by open-source software. Not legal advice. Not an official government document."
}
```

Document **files are not embedded** in the JSON. They are referenced by hash.

---

## 10. Data model and storage

### 10.1 D1 schema: `apps/inbox-worker/migrations/0001_init.sql`

Invariant: **no plaintext renter personal information in any D1 column.** Renter data lives only in `*_ct` ciphertext columns. A test parses the migration and asserts that column names match an allowlist (§18.3).

```sql
CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,                               -- uuid v4
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,         -- staff identity from Cloudflare Access
  role TEXT NOT NULL CHECK (role IN ('admin','agent')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE agency_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  details_json TEXT NOT NULL,          -- {name, acnOrAbn?, address, phone, email, providerStateOrTerritory} — the agency's own business details (VIC item 2), entered at runtime
  collection_notice_md TEXT NOT NULL,  -- APP 5-style notice shown before submit (template in §14.9)
  privacy_policy_url TEXT,
  retention_policy_json TEXT NOT NULL, -- RetentionPolicy, validated by @aurak/rules
  turnstile_required INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES staff_users(id)
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                         -- 12 chars base32 random; never derived from the address
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('VIC','NSW')),
  form_id TEXT NOT NULL,
  premises_address TEXT NOT NULL,                    -- property address (not renter info)
  agent_details_json TEXT NOT NULL,                  -- snapshot of item 2 at publish time
  requested_financial_json TEXT NOT NULL DEFAULT '[]',
  requested_identity_json TEXT NOT NULL DEFAULT '[]',
  identity_stage TEXT NOT NULL CHECK (identity_stage IN ('application','preferred')),
  referees_requested INTEGER NOT NULL DEFAULT 0 CHECK (referees_requested IN (0,1)),
  max_financial_docs INTEGER NOT NULL DEFAULT 2,
  tenancy_databases_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft','open','closed_leased','closed_withdrawn')),
  agreement_date TEXT,                               -- YYYY-MM-DD
  closed_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  group_code TEXT,                                   -- random 8-char code, links co-applicants
  form_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','shortlisted','preferred','id_requested','id_verified','successful','unsuccessful','withdrawn','purged')),
  payload_ct TEXT, payload_iv TEXT,                  -- AES-256-GCM of ApplicationPayloadV1 + doc manifest (filenames); NULL after purge
  applicant_token_hash TEXT,                         -- hex sha256(token); NULL after purge
  inspection_status TEXT CHECK (inspection_status IN ('inspected','unable','does_not_wish')),
  submitted_at TEXT NOT NULL,
  status_changed_at TEXT NOT NULL,
  intent_notice_at TEXT,                             -- NSW s 210E written notice recorded
  id_requested_at TEXT,
  id_verified_at TEXT,
  id_verification_method TEXT CHECK (id_verification_method IN ('sighted_in_person','document_review')),
  db_checked_at TEXT, db_listing_found INTEGER CHECK (db_listing_found IN (0,1)), db_notice_at TEXT, -- VIC s 439D
  tenancy_end_date TEXT,
  legal_deadline_at TEXT, purge_due_at TEXT, purge_rule_id TEXT,
  purged_at TEXT
);
CREATE INDEX idx_app_listing ON applications(listing_id);
CREATE INDEX idx_app_purge ON applications(purge_due_at) WHERE purged_at IS NULL;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  category TEXT NOT NULL CHECK (category IN ('financial','identity')),
  doc_type TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('application','identity_stage')),
  r2_key TEXT NOT NULL,                              -- docs/{applicationId}/{documentId}
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  byte_length INTEGER NOT NULL,
  ct_sha256 TEXT NOT NULL,
  iv TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  legal_deadline_at TEXT, purge_due_at TEXT NOT NULL, purge_rule_id TEXT NOT NULL,
  purged_at TEXT
);
CREATE INDEX idx_doc_purge ON documents(purge_due_at) WHERE purged_at IS NULL;

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  consent_id TEXT NOT NULL,                          -- e.g. 'vic_retain_for_other_premises@1'
  text_sha256 TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0,1)),
  recorded_at TEXT NOT NULL,
  withdrawn_at TEXT
);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  notice_type TEXT NOT NULL CHECK (notice_type IN ('nsw_210e_intent','id_request','vic_439d_database_listing','outcome')),
  body_ct TEXT NOT NULL, body_iv TEXT NOT NULL,      -- encrypted with the application DEK
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_users(id),
  delivery TEXT NOT NULL CHECK (delivery IN ('applicant_portal','manual'))
);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff','applicant','system')),
  actor_id TEXT,                                     -- staff_users.id; NULL for applicant/system
  action TEXT NOT NULL,                              -- AuditAction enum (§14.5)
  target_type TEXT NOT NULL CHECK (target_type IN ('listing','application','document','settings','staff_user','system')),
  target_id TEXT,
  rule_id TEXT,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','denied','error'))
);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

CREATE TABLE purge_receipts (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('application','document')),
  subject_id TEXT NOT NULL,
  listing_id TEXT,
  rule_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  purged_at TEXT NOT NULL,
  r2_objects_deleted INTEGER NOT NULL,
  late INTEGER NOT NULL CHECK (late IN (0,1))
);
```

If D1 rejects `RAISE` triggers or partial indexes in tests, drop those features, enforce append-only in the repository layer instead, and note it in `docs/PRIVACY-DESIGN.md`. Tests running in workerd will show whether they work.

### 10.2 R2 layout

| Bucket binding | Key | Value | Metadata |
|---|---|---|---|
| `KEYS` | `app/{applicationId}` | JSON `{ "v":1, "kekId":"v1", "wrappedDek":"<base64url AES-KW>" }` | none |
| `DOCS` | `docs/{applicationId}/{documentId}` | AES-256-GCM ciphertext (whole file) | `customMetadata: { v:"1", iv, docType, category }`, `httpMetadata.contentType: "application/octet-stream"` |

There are no original filenames in keys or metadata. Filenames are stored inside the encrypted payload manifest.

### 10.3 Renter local storage (IndexedDB `aurak-vault`, version 1)

| Store | Key | Value |
|---|---|---|
| `meta` | `"vault"` | `{ v:1, kdf:{ name:"PBKDF2", hash:"SHA-256", iterations:600000, salt:b64 }, check:{ iv, ct } }`. `check` decrypts to the constant `"aurak-vault-ok"` to validate the passphrase. |
| `records` | `"profile"` | `{ iv, ct }` → `RenterProfile` |
| `documents` | docId | `{ iv, ct, meta: { iv, ct } }`. File bytes and metadata (type, filename, size, sha256, addedAt) are encrypted separately. |
| `submissions` | submissionId | `{ iv, ct }` → `{ listing snapshot, payload, consents, receipt, portalUrl, applicantToken }` |

`RenterProfile` (zod, superset): `personal{fullName, dateOfBirth, phone, email}`, `addresses[]{address, postcode, from, to?, providerName?, providerEmail?, providerPhone?, isCurrent}`, `employment{status:"employed"|"not_employed", employer?, employerAddress?, netWeeklyIncomeCents?, endedOn?}`, `noRegularIncomeDetails?`, `referees[]{name, phone, email, connection}`, `preferences{desiredLeaseTerm, preferredMoveInDate?}`, `occupantsDefault?`. There are **no fields** for anything in §9.3.

Call `navigator.storage.persist()` after vault creation and show the result. Warn that browsers may clear storage, and recommend an encrypted backup.

### 10.4 Encrypted backup file (`*.aurak`)

JSON `{ schemaVersion:"aurak.profile-backup.v1", kdf:{…}, iv, ct }`. The plaintext is all stores except `meta`. The backup passphrase can differ from the vault passphrase. A JSON Schema for it is published.

### 10.5 Public listing shape (`listing-public.v1`)

What `GET /api/public/listings/:slug` returns: `{ schemaVersion, slug, jurisdiction, formId, provisional, status, item1, item2, financialRequested[], identityRequested[], identityStage, maxFinancialDocs, refereesRequested, tenancyDatabases[], collectionNoticeMd, privacyPolicyUrl, retentionSummary{unsuccessfulDays, successfulHandoffDays}, turnstileSiteKey|null, rulesVersion }`.

---

## 11. Application lifecycle

### 11.1 State machine (`domain/stateMachine.ts`, exhaustively tested)

```
submitted ──► shortlisted ──► preferred ──► id_requested ──► id_verified ──► successful
    │              │              │               │                │
    └──────────────┴──────────────┴───────────────┴────────────────┴──► unsuccessful
any non-final ──► withdrawn (applicant)            successful|unsuccessful|withdrawn ──► purged (system)
```

- `preferred → id_requested` requires creating an **intent notice** in the same transaction (`notices.nsw_210e_intent` for NSW, `id_request` for VIC) and sets `intent_notice_at` and `id_requested_at`.
- Identity uploads are accepted only when `canCollectIdentityDocuments()` allows it, i.e. status `id_requested` (or `listing.identity_stage = 'application'` for VIC at submission, §11.2).
- `id_verified` requires `id_verification_method`. **On entering `id_verified`, all identity documents are purged immediately** by default (NSW guidance: sight, don't store). Only `sighted_in_person` or `document_review`, the staff user and the time are kept.
- Closing a listing as leased requires `agreement_date` and one or more `successful` applications. All other non-final applications become `unsuccessful`.
- Closing as withdrawn makes all non-final applications `unsuccessful` with event `listing_withdrawn_no_agreement`.
- Every transition writes an audit event. Invalid transitions return HTTP 409 with `{ error: "invalid_transition", from, to }`.

### 11.2 ID stage defaults

- **NSW:** `identity_stage` is forced to `preferred`. Listing validation rejects `application`.
- **VIC:** default `preferred` (privacy-first). An admin may choose `application` per listing, because VIC law allows requesting up to two ID documents on the form. The UI then shows: "Victorian law allows this, but collecting ID only from the preferred applicant reduces risk." Legal question L1 covers whether two-stage collection fits s 30AC.

### 11.3 Notices

- **NSW s 210E intent notice** template (editable before sending, stored encrypted):
  > "We intend to enter into a residential tenancy agreement with you for {premises}, subject to verifying your identity. Under the Residential Tenancies Act 2010 (NSW) we may collect identity verification information only after giving you this notice. Please provide {n} of the following: {types}. We will sight your document and delete the copy after verification."
- **VIC s 439D tracker.** When staff record `db_checked_at` with `db_listing_found = 1`, the dashboard shows "Notice due by {db_checked_at + 7 days}" and the template fields (database name, information listed, who listed it, how to remove or amend it). Staff send the notice (portal or manual) and record `db_notice_at`.
- **Outcome notice** (optional, both): "Your application for {premises} was not successful. Your information will be destroyed by {date}." VIC: providers need not give reasons (Form 3A Part B). The template contains no reason field.
- **Delivery:** notices appear in the applicant portal. Staff can also mark them "delivered manually" (e.g. by email from their own system). Legal question L19 covers whether portal delivery is "written notice".

### 11.4 Retention matrix (policy defaults; legal caps from §8)

| Event | Legal deadline (rule) | Default policy | Agency can change |
|---|---|---|---|
| Unsuccessful, VIC | agreement + 30 days (`VIC.RETENTION.UNSUCCESSFUL_30D`) | agreement + 14 days | 0 … legal − 2 days |
| Unsuccessful, VIC, consent given | agreement + 6 months (`…_CONSENT_6M`) | same as above unless `keepConsentedUnsuccessful`, then legal − 2 days | — |
| Unsuccessful, NSW | none fixed yet (`NSW.PPI.REGULATIONS_PENDING`, `CTH.APP.11_2`) | agreement + 14 days | 0 … 28 days (kit cap) |
| Listing withdrawn, no agreement | unclear (L5) | closed + 14 days | 0 … 28 days |
| Application withdrawn by applicant | none fixed | withdrawn + 2 days | 0 … 7 days |
| Successful, VIC | tenancy end + 3 years (`VIC.RETENTION.SUCCESSFUL_3Y`) | agreement + 30 days ("handoff": agency moves the file to its tenancy system) | up to legal − 2 days only if `tenancy_end_date` is set |
| Successful, NSW | none fixed yet | agreement + 30 days | 0 … 90 days (kit cap) |
| Identity documents (any) | NSW: regs pending | purge at `id_verified`, or at final decision, or upload + 7 days, whichever is first | 0 … 7 days |
| Improperly collected or unsolicited (staff flag) | NSW: 2 business days (`NSW.PPI.IMPROPER_COLLECTION_DESTROY_2BD`) | **immediate** | no |

Rules:

- The policy deadline is always ≤ legal deadline − 2 days.
- The hourly cron purges anything with `purge_due_at <= now`.
- If a purge ever runs after `legal_deadline_at`, the receipt is marked `late = 1` and the dashboard shows a red banner. Tests cover this.

### 11.5 Purge procedure (`jobs/purge.ts`), idempotent

For each due application (batch ≤ 25 per run to stay under D1 Free's 50 queries per invocation [S-CF-D1LIMITS]):

1. Delete `KEYS app/{id}` (crypto-shred).
2. Delete every `DOCS docs/{id}/*` (list with prefix, delete in batches of ≤1000).
3. In one `db.batch`: delete `documents`, `consents` and `notices` rows for the application; update `applications` to set `payload_ct`, `payload_iv` and `applicant_token_hash` to NULL, `status = 'purged'`, `purged_at = now`; insert `purge_receipts`; insert audit `purge_application` (actor `system`).
4. For document-only purges (ID documents), delete the R2 object and set `documents.purged_at`, then write the receipt and audit event.

If any step fails, log the request id and error code (no data). The next run retries. Tests cover: a partial failure followed by a retry completes; running twice is a no-op; D1 rows of purged applications cannot be decrypted (key gone).

---

## 12. External APIs and data sources

There are **no government APIs** for forms or rules. Legal content is static text that the project versions and cites. All runtime external calls are optional or Cloudflare-internal, and every one goes through an injectable interface.

### 12.1 Cloudflare Access (staff authentication)

- The Worker reads header **`Cf-Access-Jwt-Assertion`**. The `CF_Authorization` cookie is not guaranteed, so do not rely on it.
- Verify with `jose.jwtVerify(token, createRemoteJWKSet(new URL(\`${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs\`)), { issuer: ACCESS_TEAM_DOMAIN, audience: ACCESS_AUD })`.
- The certs endpoint returns `keys` (JWK), `public_cert` and `public_certs`. Keys rotate about every 6 weeks, and old keys stay valid for 7 days.
- Use the claim `email`, then map it to `staff_users` (case-insensitive). Missing or invalid token, or unknown or disabled user → 403 plus audit `auth_denied`.
- Source: [S-CF-ACCESS]. The Zero Trust Free plan covers teams under 50 users (Cloudflare plans page, via search; **UNVERIFIED** detail).
- Interface: `interface StaffAuthenticator { authenticate(req: Request): Promise<{ email: string } | null> }`. Implementations are `AccessAuthenticator` (uses an injectable `JWKSResolver`) and `DevAuthenticator` (§13.4). Tests generate an RS256 keypair with `jose.generateKeyPair` at runtime, sign tokens, and inject a local JWKS. **No network.**

### 12.2 Cloudflare D1 (binding `DB`)

- API: `env.DB.prepare(sql).bind(...).first()/all()/run()` and `env.DB.batch([...])`.
- Limits [S-CF-D1LIMITS]:
  - 500 MB per database on Free, 10 GB on Paid;
  - 50 queries per invocation on Free, 1000 on Paid;
  - 100 bound parameters per query;
  - 2 MB per row or value;
  - 30 s query duration.
- Payload ciphertext must stay well under 2 MB (enforce a ≤256 KB serialized payload limit).
- Time Travel is always on: 7 days (Free) or 30 days (Paid) [S-CF-D1TT].
- Location hint `oc`. No AU jurisdiction exists; jurisdictions are `eu`, `fedramp` and `us` [S-CF-D1LOC].

### 12.3 Cloudflare R2 (bindings `DOCS`, `KEYS`)

- API:
  - `put(key, value, { customMetadata, httpMetadata, onlyIf, sha256 })` → `R2Object | null`;
  - `get(key)` → `R2ObjectBody | null`;
  - `delete(key | key[])` (≤1000 keys);
  - `list({ prefix, cursor, limit ≤ 1000 })`, checking `truncated`.
  - `ssecKey` exists but is not used.
  [S-CF-R2API]
- At-rest encryption: AES-256, GCM [S-CF-R2SEC].
- Location hint `oc` is best effort; jurisdictions are `eu`, `fedramp` and `us` [S-CF-R2LOC].
- Pricing: 10 GB-month free; no egress fees [S-CF-PRICING].

### 12.4 Cron Triggers

- Config: `"triggers": { "crons": ["17 * * * *"] }` (hourly at minute 17, **UTC**). Handler: `async scheduled(controller, env, ctx)`, where `controller.scheduledTime` is epoch milliseconds.
- Changes can take up to 15 minutes to propagate.
- Local manual trigger: `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled?cron=17+*+*+*+*"`.
- CPU limits: 10 ms on Free; on Paid, 30 s for intervals under an hour and 15 min for intervals of an hour or more. Cron triggers per account: Free 5, Paid 250.
- Tests use `createScheduledController({ scheduledTime, cron })` from `cloudflare:test`.
- Sources: [S-CF-CRON][S-CF-LIMITS].

### 12.5 Optional: Cloudflare Turnstile (anti-spam on public submission)

- `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, with body JSON or form `{ secret, response, remoteip?, idempotency_key? }`.
- Response: `{ success, challenge_ts, hostname, "error-codes": [], action, cdata }`.
- Tokens are valid for 300 s and are single-use (`timeout-or-duplicate`). [S-CF-TURNSTILE]
- Enabled only when `TURNSTILE_SECRET_KEY` is set and `agency_settings.turnstile_required = 1`.
- Interface `TurnstileVerifier`; tests mock it. Use the official test keys from Cloudflare's Testing page only in local `.dev.vars.example` comments ("see Cloudflare Turnstile testing docs"). Do not hard-code values you have not verified.

### 12.6 Rate limiting

- Workers Rate Limiting binding:

  ```jsonc
  "ratelimits": [{ "name": "PUBLIC_LIMITER", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }]
  ```

  Call `await env.PUBLIC_LIMITER.limit({ key })` → `{ success }`. The limit is approximate and per location. Requires Wrangler ≥ 4.36.0 [S-CF-RATELIMIT].
- Key: `submit:{slug}` for submissions and `portal:{applicationId}` for portal calls.
- Free-plan availability is **UNVERIFIED**. If the binding is absent, the code must no-op with a startup warning log (not an error).

### 12.7 Data sources (legal content), licence and use

| Source | Licence | Use in repo |
|---|---|---|
| CAV Form 3A docx [S4] and Form 3 docx [S5] | CC BY 4.0 (CAV site), excluding logos and branding [S6] | Text transcribed into `content/vic/*.md` (Appendices A–C) with attribution. **No logos or coat of arms.** The docx files themselves are not committed. |
| Victorian legislation [S7][S8] | Crown copyright, Copyright Act limits [S9] | Cite and link. Short excerpts (≤40 words) in rule citations only. |
| NSW bill (Parliament of NSW) [S13] | Parliament of NSW material reported as CC BY-NC-ND 4.0 (search summary, **UNVERIFIED**) | Cite and link. Short excerpts only. Do not commit the PDF. |
| NSW legislation website | CC BY 4.0 per search summary (**UNVERIFIED**, 403) | Cite and link only. |
| NSW Fair Trading guidance [S18] | nsw.gov.au terms (not checked) | Paraphrase and cite. |
| Noto Sans fonts | SIL OFL 1.1 | Vendored TTF + `OFL.txt` |

### 12.8 Existing open-source projects (GitHub search, 2026-11-04)

- Queries: "rental application australia", "rental application nsw/vic", "tenancy application", "rental applicant", "australian rental", "residential tenancies act", plus code searches for "Residential Tenancies Act 1997" and "Residential Tenancies Act 2010".
- No Australian rental-application kit, Form 3A implementation or NSW privacy implementation was found. Results were student or assignment repos, empty or placeholder repos, market-analytics notebooks, overseas tenancy chatbots, and a generic PHP property manager (`bigprof-software/online-rental-property-manager`, MIT) with no Australian legal rules.
- Nothing is reused. Do not copy code from search results.

---

## 13. Configuration and secrets

### 13.1 Principles

- Secrets are only ever stored in Worker secrets (production) or `.dev.vars` (local, git-ignored).
- The repo contains `.dev.vars.example` with placeholders only.
- `wrangler.jsonc` contains placeholder IDs only. `secrets.required` makes `wrangler deploy` fail if secrets are missing [S-CF-SECRETS].
- `src/env.ts` validates env at the start of every request and cron run (cheap, memoised). On misconfiguration it returns 500 `{ error: "misconfigured", missing: [...] }` with names only, never values.

### 13.2 `apps/inbox-worker/wrangler.jsonc` (commit exactly this shape)

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "aurak-inbox",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-01",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/agent", "/agent/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "aurak", "database_id": "REPLACE_WITH_D1_DATABASE_ID", "migrations_dir": "migrations" }
  ],
  "r2_buckets": [
    { "binding": "DOCS", "bucket_name": "aurak-docs" },
    { "binding": "KEYS", "bucket_name": "aurak-keys" }
  ],
  "triggers": { "crons": ["17 * * * *"] },
  "ratelimits": [
    { "name": "PUBLIC_LIMITER", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }
  ],
  "vars": {
    "ENVIRONMENT": "production",
    "AUTH_MODE": "access",
    "ACTIVE_KEK_ID": "v1",
    "RENTER_APP_ORIGINS": "",
    "NSW_PPI_COMMENCEMENT_DATE": "",
    "TURNSTILE_SITE_KEY": ""
  },
  "secrets": { "required": ["DATA_KEK_V1", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "BOOTSTRAP_ADMIN_EMAIL"] },
  "observability": { "enabled": true },
  "env": {
    "development": {
      "vars": { "ENVIRONMENT": "development", "AUTH_MODE": "dev-insecure", "ACTIVE_KEK_ID": "v1", "RENTER_APP_ORIGINS": "", "NSW_PPI_COMMENCEMENT_DATE": "", "TURNSTILE_SITE_KEY": "" },
      "d1_databases": [{ "binding": "DB", "database_name": "aurak-dev", "database_id": "REPLACE_WITH_D1_DATABASE_ID", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "DOCS", "bucket_name": "aurak-docs-dev" }, { "binding": "KEYS", "bucket_name": "aurak-keys-dev" }],
      "secrets": { "required": ["DATA_KEK_V1"] }
    }
  }
}
```

The Worker handles `/agent/*` itself: it returns the asset if it exists via `env.ASSETS.fetch`, otherwise `/agent/index.html`. Everything else uses SPA fallback to the renter `index.html`. If `run_worker_first` array syntax or per-env `secrets` fails validation with the installed Wrangler, adjust to the documented equivalent and note it in the PR.

### 13.3 Variables and secrets reference

| Name | Kind | Purpose | Example (placeholder) |
|---|---|---|---|
| `DATA_KEK_V1` (… `V2`) | secret | 32-byte base64url AES-KW key-encryption key | output of `node apps/inbox-worker/scripts/gen-kek.mjs` |
| `ACTIVE_KEK_ID` | var | which KEK wraps new DEKs | `v1` |
| `ACCESS_TEAM_DOMAIN` | secret | Access issuer | `https://example.cloudflareaccess.com` |
| `ACCESS_AUD` | secret | Access application AUD tag | `replace-me` |
| `BOOTSTRAP_ADMIN_EMAIL` | secret | the first Access-authenticated user with this email becomes admin if `staff_users` is empty | `admin@example.com` |
| `AUTH_MODE` | var | `access` or `dev-insecure` | `access` |
| `ENVIRONMENT` | var | `production` or `development` | |
| `RENTER_APP_ORIGINS` | var | comma-separated origins allowed for CORS on `/api/public/*` and `/api/applicant/*` (standalone renter app). Empty = same-origin only. | `https://renter.example.com` |
| `NSW_PPI_COMMENCEMENT_DATE` | var | `YYYY-MM-DD` once proclaimed; empty = pending | `` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | var / secret | optional anti-spam | empty |

`.dev.vars.example`:

```
# Copy to .dev.vars (git-ignored). Never commit real values.
DATA_KEK_V1=REPLACE_WITH_OUTPUT_OF_gen-kek
ACCESS_TEAM_DOMAIN=https://example.cloudflareaccess.com
ACCESS_AUD=replace-me
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
TURNSTILE_SECRET_KEY=
```

`scripts/gen-kek.mjs` prints 32 random bytes as base64url to stdout. The docs show piping it: `node scripts/gen-kek.mjs | npx wrangler secret put DATA_KEK_V1`. The kit never echoes keys elsewhere.

### 13.4 Dev auth (local only)

`AUTH_MODE=dev-insecure` is accepted **only if** `ENVIRONMENT === "development"` **and** the request URL hostname is `127.0.0.1` or `localhost`. Otherwise every agent request returns 500 "misconfigured" and the cron refuses to run.

Dev identity comes from header `X-Dev-User: admin@example.com`, which the agent UI dev build sets from a login form that accepts only `@example.com` emails. Tests cover all refusal paths.

### 13.5 `scripts/check-placeholders.mjs` (CI)

Fails if tracked files contain any of:

- a 32-hex Cloudflare account-ID-like string outside the allowlist;
- a D1 UUID other than the all-zero placeholder in `wrangler.jsonc`;
- emails not ending in `@example.com` / `@example.org` / `@example.net`;
- IPv4 addresses other than `127.0.0.1` and `0.0.0.0` (the latter only allowed inside this check's own source and docs warning text);
- `-----BEGIN` private key blocks;
- strings matching common token prefixes (`ghp_`, `github_pat_`, `sk_live_`, `xox`).

Skip `pnpm-lock.yaml` and `content/vic/*.md` for phone-number patterns only (official helpline numbers are allowed there).

---

## 14. Security and privacy design

### 14.1 Principles

Data minimisation by construction (no fields for prohibited data). Local-first for renters. Purpose limitation (no analytics, marketing or scoring). Least privilege for staff. Encryption by default. Deletion by default. Full access logging. No third-party scripts. Honesty about limits.

### 14.2 Threat model (document in `docs/PRIVACY-DESIGN.md`)

| Threat | Mitigation |
|---|---|
| Storage-level exposure (D1/R2 dump, backup, Time Travel) | App-level AES-256-GCM. DEKs wrapped by KEK in a separate bucket. KEK only in Worker secrets. Crypto-shred on purge. |
| Stolen staff session | Cloudflare Access (SSO/MFA set by the agency) plus JWT verification in the Worker. Roles. Audit log of every view and download. No bulk export of documents. |
| Malicious file upload | Size and type limits. Magic-byte checks. Files are never parsed or rendered server-side. Downloads served as `attachment` with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: no-store`. |
| Over-collection by agency | No custom fields. Rules engine validates listing requests. Strict zod schemas reject unknown keys. |
| Application spam or abuse | Rate limiting. Optional Turnstile. Max payload and file sizes. Listing must be `open`. |
| Applicant token leakage | Token is 256-bit random, shown once, stored as SHA-256. Passed in the URL **fragment** and sent as `Authorization: Bearer`. Never in query strings or logs. Rotated on ID-upload invitation. |
| XSS or CSRF in agent UI | React escaping. Strict CSP (no inline scripts). Agent API requires `Content-Type: application/json` and an `Origin` header equal to the request host for state-changing requests. Plus SameSite cookies from Access. |
| Logs leaking PII | Allowlisted structured logger (§14.8). Tests assert no payload keys reach logs. |
| Renter device compromise or shared computer | Passphrase vault. Auto-lock after 15 minutes idle (key cleared from memory). "Wipe all data" button. |
| Lost KEK | Documented: data unrecoverable. Deploy guide requires an offline KEK backup procedure owned by the agency. |
| Supply-chain | Lockfile. `pnpm install --frozen-lockfile`. Pinned action SHAs. Dependency denylist (§19). Minimal dependencies. |

### 14.3 Cryptography (`@aurak/crypto` + `inbox-worker/src/crypto/envelope.ts`)

- **DEK:** per application, random `AES-GCM` 256-bit (`crypto.subtle.generateKey`, extractable only so it can be wrapped).
- **KEK:** `DATA_KEK_V{n}`, imported as raw `AES-KW` 256-bit. Wrap with `crypto.subtle.wrapKey("raw", dek, kek, "AES-KW")` and store in `KEYS`.
- **Encrypt:** AES-GCM with a 12-byte random IV per message. **AAD** = UTF-8 of `aurak:v1:{applicationId}:{purpose}`, where purpose is `payload`, `doc:{documentId}` or `notice:{noticeId}`. This stops ciphertext being swapped between records.
- **Renter vault:** PBKDF2-HMAC-SHA256 with **600,000 iterations** (OWASP recommendation [S-OWASP]) and a 16-byte salt. Derived key is non-extractable AES-GCM 256. AAD = `aurak-vault:v1:{store}:{key}`.
- **Hashes:** SHA-256 for token hashes and file integrity.
- **Random:** `crypto.getRandomValues` only.
- **KEK rotation:** set `DATA_KEK_V2`, set `ACTIVE_KEK_ID=v2`, then run the admin action "Re-wrap keys", which lists `KEYS` and re-wraps any `kekId != active`. Then remove the old secret. Tests cover this.
- No custom crypto primitives. WebCrypto only.

### 14.4 Authorization matrix

| Action | admin | agent | applicant (token) | public |
|---|---|---|---|---|
| Settings, staff users, retention policy, re-wrap keys, purge now | ✓ | — | — | — |
| Listings CRUD, view applications and documents, transitions, notices, exports | ✓ | ✓ | — | — |
| Audit log view | ✓ | ✓ (own actions only) | — | — |
| View own application, notices, export own data, upload ID when invited, withdraw, change consents | — | — | ✓ | — |
| View open listing info, submit application | — | — | — | ✓ |

### 14.5 Audit log

Actions (enum):
`auth_denied`, `list_applications`, `view_application`, `download_document`, `export_application_json`, `export_application_pdf_data`, `transition`, `create_notice`, `record_db_check`, `flag_improper`, `purge_application`, `purge_document`, `settings_update`, `staff_create`, `staff_update`, `listing_create`, `listing_update`, `listing_close`, `rewrap_keys`, `applicant_view`, `applicant_export`, `applicant_upload_identity`, `applicant_withdraw`, `applicant_consent_change`, `submit_application`.

- Rows contain no renter PII (ids only).
- Append-only triggers.
- The agent UI shows audit entries per application. CSV export for admins.
- Audit rows are kept indefinitely in v1 (staff activity, de-identified after purge). Legal question L18.

### 14.6 HTTP security headers

Set on all Worker responses, and via `public/_headers` for assets:

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' {RENTER_APP_ORIGINS for standalone builds}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`. Add `https://challenges.cloudflare.com` to `script-src` and `frame-src` only when Turnstile is enabled.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cache-Control: no-store` on all `/api/*`.

### 14.7 Upload limits

- Per file ≤ **10 MB**. Types are PDF, JPEG and PNG, checked by magic bytes (`%PDF-`, `FF D8 FF`, `89 50 4E 47`).
- Per application: financial ≤ the listing max (≤2); identity ≤ 2 (VIC) or the listing max (NSW default 1).
- Total request ≤ 25 MB.
- Use multipart/form-data with part `application` (JSON) and parts `doc_{n}`. Each doc has a matching manifest entry `{ part, category, type, filename }`.
- Reject with 413 or 415 and a machine-readable error.
- Workers Free CPU (10 ms per request) is likely too low for encrypting multi-MB files. The deploy guide states **Workers Paid is required for production** (§22 R6).

### 14.8 Logging

- `log.ts` exports `log(event: LogEvent)`. `LogEvent` is a closed union: `{ type: "request", requestId, route, status, ms, actorRole? }`, `{ type: "purge", requestId, count, late }` and `{ type: "error", requestId, code }`.
- No free-form fields, no headers, no bodies, no IPs, no emails.
- Runtime check drops unknown keys. Test asserts it.

### 14.9 Transparency and notices

- **Collection notice template** (`agency_settings.collection_notice_md`, pre-filled, agency must review). It covers:
  - who collects;
  - purpose (assessing suitability for this property only);
  - what is collected (Form 3A items);
  - who it may be shared with (rental provider; referees and databases if listed);
  - that storage is with Cloudflare and may be outside Australia;
  - retention schedule;
  - access, correction and withdrawal via the applicant portal;
  - how to complain (the agency, then CAV, NSW Fair Trading or OAIC as applicable).
- Shown before submit. Its SHA-256 is stored with the consent receipt.
- **Disclaimer** (Appendix D) appears in the footer of every page, the README, every PDF footer and every JSON export.
- **Applicant rights:** the portal provides access (view and JSON export), correction requests (free-text message stored encrypted and shown to staff; no in-place edits in v1), withdrawal (purge in ≤7 days) and withdrawing the 6-month consent.

---

## 15. UI and pages

General: English only. WCAG 2.2 AA target (labels, focus order, error summaries, no colour-only status). Plain CSS (CSS variables, no CSS framework). Works at 320 px wide. No external fonts or scripts.

### 15.1 Renter app (`/`)

| Route | Content |
|---|---|
| `/` | What the kit is. "Your information stays on this device." Disclaimer. Buttons: Create vault / Unlock. |
| `/unlock` | Create a passphrase (≥ 12 characters; strength hint) or unlock. Explains that a lost passphrase means lost data. |
| `/profile` | Sections: About you · Contact · Address history · Employment and income · Referees · Lease preferences. Inline note on each section: "Used for VIC Form 3A item N / NSW …". |
| `/documents` | Add or replace or delete encrypted files, choosing a type from the allowed lists. Bank statement warnings ("Remove transaction details (VIC) / redact daily transactions (NSW)"). Size and type checks. |
| `/apply` | Start: paste an apply link (`https://<inbox>/apply/<slug>`), or "Prepare a form for an agent who doesn't use this kit" (manual listing entry with the same validation). |
| `/apply/:slug` | Loads the public listing (same origin, or a cross-origin inbox in `RENTER_APP_ORIGINS`). Shows the agent's requests and any PROVISIONAL banner. |
| `/apply/review` | Two columns: **Will be shared** (by form item) and **Not shared** (with reason and rule link). Document picker limited to requested types. Collection notice. Consents (§9.4). NSW inspection question. Signature (typed name and date). Buttons: Download PDF · Download JSON · Submit. |
| `/apply/done` | Receipt: time, form id, rules version, fields and documents shared, consents. Portal link with token. Save to history. |
| `/my-application` | Applicant portal. Token and id in the fragment (`#id=…&t=…`). Status, notices, ID upload (only when invited), export my data, withdraw, consent toggle (VIC 6-month), correction request. |
| `/history` | Local submission records, portal links, receipts, re-download PDF and JSON. |
| `/settings` | Change passphrase (re-encrypt). Auto-lock minutes. Export or import encrypted backup. Request persistent storage. Wipe all. |
| `/legal` | Disclaimer. Rules table (from the registry, with status badges). Sources. Content and font licences. |

### 15.2 Agent UI (`/agent/`)

| Route | Content |
|---|---|
| `/agent/` | Dashboard: open listings, new applications, purges due in 7 days, overdue items (VIC s 439D notices, late purges), NSW commencement status banner. |
| `/agent/listings` and `/agent/listings/new`, `/agent/listings/:id/edit` | Jurisdiction. Premises. Item 2 auto-filled from settings. Requested financial and identity docs (checkbox lists capped by rules, errors cite rule ids). ID stage (NSW locked to "preferred applicant"). Referees requested. Tenancy databases (≤3). Publish → apply link with a copy button. |
| `/agent/listings/:id` | Applications table: name (decrypted), group code, submitted, status, docs count, purge due. Bulk actions limited to "mark unsuccessful". |
| `/agent/applications/:id` | Form view by item. Documents (download is logged). Consents with text hashes. Timeline (audit). Action panel valid for the current state. Notice composer. Record database check. Flag improper (select documents or "entire application"). Export JSON. Download PDF (generated in the browser from decrypted JSON). |
| `/agent/listings/:id/close` | Leased (agreement date, successful application(s), optional tenancy end date) or withdrawn. Shows the computed purge schedule before confirming. |
| `/agent/retention` | Upcoming purges, receipts, late purges, "Purge now" (admin). |
| `/agent/audit` | Filterable log, CSV export (admin). |
| `/agent/settings` | Agency details. Collection notice editor (with template reset). Privacy policy URL. Retention policy (inputs show legal caps and rule citations). Turnstile toggle. Staff users. KEK re-wrap (admin). |
| `/agent/legal` | Same rules table, plus the legal questions list. |

---

## 16. HTTP API

All JSON. Errors: `{ error: string, details?: unknown, ruleIds?: string[] }`. Every response carries `X-Request-Id`. Times are ISO-8601 UTC. Dates are `YYYY-MM-DD`.

### 16.1 Public

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true, version, rulesVersion }` (no data) |
| GET | `/api/public/listings/:slug` | — | `ListingPublicV1` (404 if draft or unknown; `status` shows closed) |
| POST | `/api/public/listings/:slug/applications` | multipart: `application` = `{ payload: ApplicationPayloadV1, consents: [{id, sha256, granted}], collectionNoticeSha256, groupCode?, turnstileToken? }`, plus `doc_n` files | 201 `{ applicationId, applicantToken, portalPath: "/my-application#id=…&t=…", receipt: { submittedAt, formId, rulesVersion, sharedPaths[], documents[{type, sha256, byteLength}], consents[] } }`. 422 with `ruleIds` on rule violations. 409 if listing not open. 429 if rate limited. |

### 16.2 Applicant (header `Authorization: Bearer <token>`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/applicant/applications/:id` | `{ status, listing:{premises, agency}, notices:[{type, createdAt, body}], identityRequest:{allowed, types[], max} , purgeDueAt, legalDeadlineAt }` |
| GET | `/api/applicant/applications/:id/export` | full decrypted payload + consents + notices (APP 12-style access). Document files are not included; they are listed by hash. |
| POST | `/api/applicant/applications/:id/identity-documents` | multipart; 403 with `ruleIds` unless allowed |
| POST | `/api/applicant/applications/:id/withdraw` | → `withdrawn`, purge scheduled |
| POST | `/api/applicant/applications/:id/consents` | `{ id: "vic_retain_for_other_premises@1", granted: false }` |
| POST | `/api/applicant/applications/:id/messages` | `{ kind: "correction_request", text ≤ 2000 }` stored encrypted |

### 16.3 Agent (Access JWT; JSON; `Origin` check on mutations)

| Method | Path | Role |
|---|---|---|
| GET | `/api/agent/me` | any |
| GET, POST | `/api/agent/listings` | agent |
| GET, PATCH | `/api/agent/listings/:id` | agent |
| POST | `/api/agent/listings/:id/publish` | agent |
| POST | `/api/agent/listings/:id/close` `{ outcome: "leased"\|"withdrawn", agreementDate?, successfulApplicationIds?, tenancyEndDate? }` | agent |
| GET | `/api/agent/listings/:id/applications` | agent |
| GET | `/api/agent/applications/:id` | agent (audited) |
| GET | `/api/agent/applications/:id/documents/:docId` | agent (audited; streamed decrypted) |
| POST | `/api/agent/applications/:id/transition` `{ to, notice?: { body } , verificationMethod? }` | agent |
| POST | `/api/agent/applications/:id/db-check` `{ checkedAt, listingFound }` | agent |
| POST | `/api/agent/applications/:id/notices` `{ type, body, delivery }` | agent |
| POST | `/api/agent/applications/:id/flag-improper` `{ documentIds?: string[], entireApplication?: boolean }` | agent |
| GET | `/api/agent/applications/:id/export` | agent (audited; JSON) |
| POST | `/api/agent/applications/:id/purge` | admin |
| GET | `/api/agent/retention` | agent |
| GET | `/api/agent/audit?from&to&action&targetId&cursor` | admin (agent: own) |
| GET, PUT | `/api/agent/settings` | admin |
| GET, POST, PATCH | `/api/agent/staff` | admin |
| POST | `/api/agent/keys/rewrap` | admin |
| GET | `/api/agent/rules?jurisdiction&on` | any (registry for UI) |

Pagination: `?cursor` (opaque) and `limit ≤ 50`.

### 16.4 MCP / AI tools

None in v1. Applicant personal information must not flow to AI tools, and the kit has no AI features.

**Post-v1 option (do not build now):** a read-only stdio MCP server exposing only the public rules registry, with no personal data:

- `rules.list` `{ jurisdiction?: "VIC"|"NSW"|"CTH", on?: string }` → `Rule[]` with status;
- `rules.get` `{ id: string }` → `Rule`;
- `forms.schema` `{ formId: string }` → JSON Schema;
- `retention.compute` `{ jurisdiction, event }` → `{ legalDeadline, ruleIds }`.

---

## 17. Exports

### 17.1 PDF (`@aurak/pdf`, runs in the browser)

- `renderApplicationPdf(exportJson: ApplicationExportV1, opts: { fonts: { regular: Uint8Array; bold: Uint8Array }; now: Date }): Promise<Uint8Array>`.
- A4 portrait. 15 mm margins. Noto Sans 10 pt body, 14 pt headings.
- Layout follows Form 3A: headings, item numbers and labels verbatim, and values in bordered boxes under each label.
  - Agent-completed items (1, 2, 6/7 requests, 11) are filled from the listing.
  - Unrequested optional items show "Not requested".
  - Item 12 shows the typed name, "Signed electronically (typed name)" and the date.
- Then Part B (Appendix B) and the Form 3 statement (Appendix C) as flowing text with automatic page breaks.
- Footer on every page: "Page X of Y · Generated by au-rental-application-kit {version} · Not an official government document · Not legal advice · Form text © State of Victoria (Consumer Affairs Victoria), CC BY 4.0".
- **No logos, coat of arms or CAV branding.**
- Document attachments are listed (type, filename, SHA-256) and **not embedded**.
- Glyphs missing from Noto Sans (e.g. CJK, Arabic) are replaced with "□", and a note is added: "Some characters could not be displayed; see the JSON export." Detect with `font.getCharacterSet()` / fontkit `hasGlyphForCodePoint`.
- Deterministic output: set `creationDate` and `modDate` from `opts.now`; no random IDs.
- NSW: same engine with the provisional banner on every page and NSW field labels.

### 17.2 JSON

`exportApplicationJson()` produces `application.v1` (§9.6) and validates against the zod schema before returning. JSON Schemas are generated with `z.toJSONSchema()` into `schemas/` by `pnpm gen`. CI fails if they are stale.

### 17.3 Licensing position for PDFs

Recreating the VIC form layout with text taken from CAV's CC BY 4.0 documents is permitted with attribution, excluding logos and branding [S6]. The Regulations themselves are not CC licensed [S9], so the kit sources text from the **CAV documents** and cites the Regulations only. For NSW, no form exists yet. When it is published, check its licence before adding a layout (CONTRIBUTING checklist).

---

## 18. Testing strategy

### 18.1 Tooling

Root `vitest.config.ts` uses `test.projects`:

1. `packages` (node environment): rules, forms, crypto (Node 24 WebCrypto) and pdf (with `unpdf` text extraction).
2. `renter` and `agent-ui` (`happy-dom` environment, `fake-indexeddb/auto`, `@testing-library/react`).
3. `inbox-worker`: `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc", environment: "development" }, miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("migrations"), DATA_KEK_V1: <random at config time>, ... } } })`, with `setupFiles: ["./test/apply-migrations.ts"]` calling `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` (pattern from Cloudflare's `fixtures/vitest-plugin-examples/d1`). Integration tests call `exports.default.fetch(...)` from `cloudflare:workers`, and cron tests use `createScheduledController`.

Vitest workers: `--maxWorkers=2` locally (document it in CONTRIBUTING).

### 18.2 No-network guarantee

- Node and happy-dom projects use a setup file that replaces `globalThis.fetch` with a function that throws `"Network disabled in tests: <url>"`. Tests that need fetch inject a mock.
- Worker code reaches the outside world only via injected `JWKSResolver`, `TurnstileVerifier` and `fetch` parameters. Tests pass fakes. Add a test that asserts the app's default dependencies are not invoked when fakes are provided.
- No test reads `.dev.vars`. Secrets for tests are generated in `vitest.config.ts`.

### 18.3 Required tests (minimum list; each a real assertion, no snapshots of large blobs except stated)

- **rules**: everything in §8.6, plus the coverage meta-test.
- **forms**:
  - The Form 3A definition has items 1–12 in order, with labels exactly matching `content/vic/form3a-part-a.md` (parse headings).
  - Identity enum has 12 entries in the specified order. Financial enum has 3.
  - `buildPayload` cases:
    - VIC employed with 2 requested docs and no referees → item 9 excluded with a reason;
    - a third address excluded;
    - an unrequested document type rejected;
    - a third ID doc rejected;
    - NSW never includes ID docs;
    - NSW missing inspection → error;
    - item 5 alternative rule.
  - `.strict()` rejects unknown keys.
  - Never-collected catalogue: deep-scan all zod schemas and assert no key matches `/photo|selfie|social|marital|relationship|child|tattoo|religion|ethnic|gender|disab|tfn|taxFile|credit|bond(Claim|History)|tribunal|dispute/i`.
  - Consent text sha256 matches the committed snapshot (`consents.snap.json`).
- **crypto**: AES-GCM round trip; wrong AAD fails; wrong key fails; AES-KW wrap/unwrap; PBKDF2 derive is deterministic for a fixed salt; base64url codec edge cases.
- **pdf**:
  - Render the VIC fixture and extract text with `unpdf`. Assert it contains "Residential rental application", "PART A—GENERAL", every item label, the applicant's fixture name, "PART B–RIGHTS AND OBLIGATIONS", "Statement of Information for Rental Applicants", and the attribution line.
  - Assert it does **not** contain unrequested items' values.
  - NSW render contains "PROVISIONAL" on every page (text per page).
  - Determinism: two renders with the same `now` have identical SHA-256.
  - Unsupported glyph replacement note.
- **renter**:
  - vault create, lock and unlock; a wrong passphrase fails;
  - data at rest in fake IndexedDB contains no plaintext fixture names (scan serialized stores);
  - backup export and import round trip;
  - wipe clears all stores;
  - Review page lists excluded items with reasons;
  - Submit calls an injected `submitApplication` with exactly the built payload;
  - axe-core has no serious violations on Home, Profile, Review.
- **inbox-worker (integration in workerd)**:
  1. Migration column allowlist: parse `0001_init.sql` and assert `applications` has no column named like name, email, phone, address or dob; only `*_ct` hold payloads.
  2. Auth: missing JWT → 403; wrong `aud` → 403; valid JWT for an unknown email → 403; bootstrap admin created once; `dev-insecure` refused when `ENVIRONMENT=production` or host is not loopback.
  3. Listings: VIC with 3 ID docs → 422 `VIC.DOCS.IDENTITY_MAX_TWO`; NSW with `identity_stage=application` → 422; publish → public GET works; draft → 404.
  4. Submission happy path: VIC with 2 financial docs. D1 row has a ciphertext payload; R2 `DOCS` holds ciphertext not equal to the input bytes; the `KEYS` object exists; the receipt matches; an audit `submit_application` exists.
  5. Submission rejections: unknown key 422; extra document 422; magic-byte mismatch 415; >10 MB 413; closed listing 409; NSW ID doc at submission 422 (`NSW.PPI.ID_AFTER_INTENT_NOTICE`); Turnstile failure 403 when required (mock verifier).
  6. Staff view and download are audited. Decrypted download equals the original bytes. Headers include `attachment`, `nosniff`, `no-store`.
  7. State machine: every valid transition succeeds and every invalid one returns 409 (table-driven). `preferred→id_requested` creates a notice. ID upload before that → 403. After it → 201. `id_verified` purges ID docs (R2 object gone, `documents.purged_at` set, receipt written).
  8. Close leased (VIC, agreement 2026-11-10): others become unsuccessful with `purge_due_at` = policy (14 days) and `legal_deadline_at` = 30 days; consent-given application gets the 6-month legal deadline.
  9. Purge cron: create due applications, run `scheduled()` with `createScheduledController({ scheduledTime })`. The `KEYS` object is deleted, `DOCS` prefix is empty, the row is tombstoned with NULL ciphertext, the receipt exists, and the audit event exists. Running again is a no-op. Simulated `DOCS.delete` failure → retry completes. Purge after the legal deadline → `late=1`.
  10. Crypto-shred: after purge, decrypting a saved copy of the old `payload_ct` fails (key gone).
  11. Applicant portal: wrong token 401; export returns data; withdraw → status withdrawn and purge in ≤7 days; consent withdrawal changes the retention computation.
  12. KEK rotation: wrap with v1, rotate to v2, rewrap, remove v1 from env, data still decrypts.
  13. Logs: capture `console.log` during a submission and assert no fixture PII strings appear.
  14. Audit append-only: a direct `UPDATE audit_events` via `env.DB` throws (or the repository layer refuses, per §10.1 fallback).
  15. Security headers present on the API and on asset responses served by the Worker.
- **scripts**: `check-placeholders` flags a planted real-looking email in a temp file and passes on the repo. `check-deps` flags a denylisted package in a fake manifest.

### 18.4 Fixtures

`fixtures/profiles/*.json`, `fixtures/listings/*.json`, and `fixtures/documents/*` generated by `scripts/make-fixture-docs.mjs`:

- a tiny PDF made with pdf-lib, text "SAMPLE – NOT A REAL DOCUMENT";
- a tiny PNG of solid colour.

The generated files are committed so tests don't need the script at runtime.

### 18.5 Manual and local checks (not in CI)

`pnpm dev:inbox` (127.0.0.1:8787) plus a browser walkthrough checklist in CONTRIBUTING: create a listing, apply as a renter, shortlist, prefer, request ID, upload, verify, close, trigger cron via `/cdn-cgi/local/scheduled`. Playwright end-to-end tests are out of scope for v1.

### 18.6 Fixture data rules (hard)

- Person names: `Test Applicant One`, `Test Applicant Two`, `Sample Referee`.
- Emails: `applicant1@example.com`, `agent@example.com`.
- Phones: only ACMA fiction-reserved numbers: `0491 570 006`, `0491 570 156`, `0491 570 157` (ACMA list, via search: https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works).
- Addresses: must contain the word `Placeholder`, e.g. `Unit 0, 0 Placeholder Street, Fixtureville`, with postcode `0000`.
- Agency: `Example Agency (fixture)`.
- ABN/ACN: `000000000` / `00000000000`.
- Databases: `Example Tenancy Database (fixture)`, web `https://database.example.com`.

---

## 19. CI (GitHub Actions)

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check:placeholders
      - run: pnpm check:deps
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm check:generated
```

(Action SHAs resolved from the release tags on 2026-11-04. If a SHA cannot be fetched in your environment, keep it. CI will verify it.)

- No secrets are used in CI. No deploy job. No `pull_request_target`.
- `scripts/check-deps.mjs` denylists analytics, tracking and payment SDKs in any workspace `package.json`. Patterns: `stripe`, `@stripe/*`, `posthog*`, `@sentry/*`, `mixpanel*`, `@segment/*`, `google-analytics`, `gtag`, `@datadog/*`, `hotjar`, `amplitude*`. Override only by editing the script with justification.
- `scripts/check-generated.mjs` runs `pnpm gen` into a temp dir and diffs against `docs/rules.md` and `schemas/`.
- Dependabot is **not** configured (it is a repository setting that Luke decides on; mention it in README "Maintainers").

---

## 20. Documentation and licence

### 20.1 Licence: Apache-2.0

Reasons:

- an explicit patent grant and patent-retaliation clause protects agencies and contributors;
- the `NOTICE` mechanism suits the required CC BY 4.0 attribution for government text;
- it is compatible with all chosen dependencies (MIT, ISC, Apache-2.0, OFL fonts, MPL dev-only).

MIT is simpler but has no patent grant.

- `LICENSE`: full standard Apache License 2.0 text.
- `NOTICE`:
  - Project name, copyright "Copyright 2026 au-rental-application-kit contributors".
  - "This product includes text from Consumer Affairs Victoria forms, © State of Victoria (Consumer Affairs Victoria), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Logos and branding are not included."
  - "This product includes Noto Sans fonts licensed under the SIL Open Font License 1.1."
- `content/LICENSE.md`: states that the `content/vic/*` files are CC BY 4.0 (not Apache-2.0), gives the source URLs and check date, and lists the changes made (reformatted as Markdown).

### 20.2 README.md (required sections)

1. One-paragraph description.
2. **Disclaimer** (Appendix D) at the top.
3. Status table per jurisdiction: VIC in force and supported. NSW passed, not commenced, PROVISIONAL form. Others not supported.
4. What it does and doesn't do (no fees, no scoring, local-first).
5. Quick start for developers (Node 24, pnpm, `pnpm i`, `pnpm test`, `pnpm dev:inbox` on 127.0.0.1).
6. Architecture overview (link).
7. For agencies: deploy guide link, with the cost note (Workers Paid USD 5/month minimum at the time of writing) and the data-residency note.
8. For renters: how the vault works and backups.
9. Rules and citations (link to `docs/rules.md`) and legal questions.
10. Contributing, security, licence.
11. No badges that imply endorsement. No statistics.

### 20.3 Other docs

- **CONTRIBUTING.md**:
  - setup;
  - coding standards (Biome, strict TS);
  - test commands (focused first: `pnpm vitest run packages/rules`);
  - **rule change protocol** (primary source URL, pinpoint, `checkedOn`, confidence, a `ruleTest`, regenerate docs; never paraphrase beyond the source; mark UNVERIFIED honestly);
  - adding a jurisdiction;
  - content licensing checklist;
  - fixture data rules (§18.6);
  - "no real personal data in issues or PRs";
  - local servers on 127.0.0.1 only.
- **SECURITY.md**:
  - supported versions (latest `main`);
  - reporting: "Use GitHub's **Report a vulnerability** (private advisory) on this repository if it is enabled. Otherwise open an issue titled 'Security contact request' **without details** and a maintainer will arrange a private channel." No email addresses.
  - scope;
  - self-hoster responsibilities (Access policies, KEK backup, Workers Paid, location hints);
  - crypto overview;
  - known limitations (§22).
- **CODE_OF_CONDUCT.md**: Contributor Covenant 2.1, with enforcement contact "via the private reporting method in SECURITY.md". No email.
- `docs/LEGAL-QUESTIONS.md`: §23 verbatim plus a status column.
- `docs/PRIVACY-DESIGN.md`: data flows (diagrams in Mermaid), threat model, retention matrix, crypto, logging, what the project never receives.
- `docs/DEPLOY-CLOUDFLARE.md`: for agencies. Instructional only; Codex must not run these commands.
  1. Create a Cloudflare account and a Workers Paid plan.
  2. `wrangler d1 create aurak --location oc`. Check `--location` with `wrangler d1 create --help`; the docs show `--location=weur` syntax.
  3. Create R2 buckets with the `oc` hint (dashboard "Location" or `wrangler r2 bucket create --help`; the flag is **UNVERIFIED**).
  4. Put the IDs into a **local, uncommitted** copy of `wrangler.jsonc`, or use `wrangler.local.jsonc`, which is git-ignored.
  5. Generate and set secrets.
  6. Run migrations (`wrangler d1 migrations apply aurak --remote`).
  7. Set up a Cloudflare Access application for `/agent*` and `/api/agent*`, with an MFA policy.
  8. Bootstrap the admin.
  9. Fill in agency settings and the collection notice.
  10. Review legal questions with a lawyer.
  11. Back up the KEK offline.
- `docs/ADDING-A-JURISDICTION.md`, `docs/ARCHITECTURE.md`, `docs/SOURCES.md` (§25), `CHANGELOG.md` (0.1.0 unreleased).

### 20.4 GitHub templates

- Issue templates: bug report (with "do not include personal information"), rule correction (requires a source URL and pinpoint), new jurisdiction.
- PR template: checklist (tests, citations, `pnpm gen`, no secrets, no real data, UNVERIFIED labels kept).

---

## 21. Milestones for the v1 PR (ordered; complete each before the next)

Each milestone ends with `pnpm lint && pnpm typecheck && pnpm test` green for the touched projects.

### M0: Scaffold and tooling

- **Do:** pnpm workspace; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); Biome; Vitest projects; `.gitignore`; `.nvmrc`; `.editorconfig`; LICENSE; NOTICE; empty package skeletons; CI workflow; `check-placeholders`, `check-deps`, `check-generated` scripts with tests.
- **Accept:** `pnpm install` works. CI-equivalent commands pass locally on empty packages. `check-placeholders` passes on the repo and fails on a planted violation in its test.

### M1: Rules engine core and VIC rules

- **Do:** types, registry, dates, penalty units, retention, fees, ID gate, notices; all VIC rules (§8.3); `ruleTest` helper and coverage meta-test; `gen-rules-doc.ts` producing `docs/rules.md`.
- **Accept:** all §8.6 VIC tests pass. Every VIC rule has a citation and a test. `docs/rules.md` is generated and committed.

### M2: NSW and Commonwealth rules

- **Do:** §8.4 rules; commencement option; `policyRules`; business-day helper; UNVERIFIED notes.
- **Accept:** NSW and CTH tests pass. The status flips with `nswPpiCommencementDate`. The coverage meta-test passes for all rules.

### M3: Forms package

- **Do:** VIC Form 3A definition (§9.1); NSW provisional (§9.2); never-collected catalogue; consents with hashes; `buildPayload`; `exportApplicationJson`; `content/vic/*.md` from Appendices A–C; `content/LICENSE.md`; `gen-schemas.ts` producing `schemas/*.json`.
- **Accept:** §18.3 forms tests pass. Schemas generated. Labels match the content files exactly.

### M4: Crypto package

- **Accept:** §18.3 crypto tests pass in the Node project **and** a copy of the round-trip test runs in the workerd project.

### M5: PDF package

- **Do:** fonts vendored with OFL; VIC renderer; NSW provisional renderer; fixture-based tests with `unpdf`.
- **Accept:** §18.3 pdf tests pass. Output is deterministic. No logos.

### M6: Renter app

- **Do:** vault; profile; documents; apply (link and manual); review; consents; PDF and JSON download; submit client (injected fetch); history; settings (backup, import, wipe, auto-lock); portal page; legal page; disclaimer footer; `_headers`.
- **Accept:** §18.3 renter tests pass. `pnpm --filter @aurak/renter build` produces static files. The dev server binds 127.0.0.1.

### M7: Inbox Worker foundation

- **Do:** env validation; Hono app; security headers; logger; auth (Access and dev); roles; bootstrap admin; D1 migration; repositories; envelope crypto with the `KEYS` vault; listings API; public listing and submission; uploads; rate limit and Turnstile adapters; asset routing (`/agent/*` fallback); `assemble-assets.mjs`.
- **Accept:** integration tests 1–6, 13 and 15 pass. `wrangler deploy --dry-run` bundles (or the documented fallback works).

### M8: Workflow, notices, applicant portal, audit

- **Do:** state machine; transitions API; ID gate; notices (NSW 210E, VIC 439D tracker, outcome); flag-improper (immediate purge); applicant portal endpoints; exports; audit queries; KEK rewrap.
- **Accept:** integration tests 7, 11, 12 and 14 pass.

### M9: Retention and purge

- **Do:** retention computation wiring on close, withdraw, verify and flag; cron `scheduled()`; purge job; receipts; late detection; dashboard data endpoint.
- **Accept:** integration tests 8, 9 and 10 pass, including idempotency and partial-failure retry.

### M10: Agent UI

- **Do:** all §15.2 pages against the API; client-side PDF export; PROVISIONAL banners; rule citations in validation errors.
- **Accept:** component tests for the listing form (rule-driven caps), application view (action panel shows only valid transitions), close-listing schedule preview and retention settings (caps enforced); axe-core has no serious violations; build succeeds.

### M11: Documentation and hardening pass

- **Do:** README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, all `docs/*`, issue and PR templates, CHANGELOG.
- **Do:** final security review against §14 (CSP, headers, token handling, logs). `pnpm gen` and commit generated files.
- **Accept:**
  - full CI-equivalent run green locally (`pnpm check:placeholders && pnpm check:deps && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:generated`);
  - no TODOs without an issue reference;
  - disclaimers present in the README, both apps' footers, PDFs and JSON;
  - PR description lists any deviations from this plan.

---

## 22. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | The NSW final Act text differs from the second print (Council amendments), and the regulations and approved form are unknown | Wrong section numbers, penalties or fields | NSW rules marked `unverified` and `pending_commencement`; PROVISIONAL banners; `NSW_PPI_COMMENCEMENT_DATE` config; legal questions L10–L17; update once the Act and regulations are published. |
| R2 | Misreading the law, or users treating the kit as legal advice | Agency non-compliance | Disclaimers everywhere; citations with check dates; legal questions doc; rule correction issue template. |
| R3 | No Australian data residency on Cloudflare | APP 8 or customer concerns | `oc` hints; disclosure in the collection notice; open question Q2; the ports/adapters design allows a future Node/Docker adapter. |
| R4 | KEK loss | All inbox data unrecoverable | Deploy guide KEK backup procedure; admin settings page warning. |
| R5 | Deletion not absolute: D1 Time Travel (≤30 days), R2 internal replication or retention after delete (**UNVERIFIED**), agency downloads and exports | Data retained beyond the schedule | Crypto-shred design; downloads are audited; documented limits; legal question L7. |
| R6 | Workers Free plan CPU (10 ms) too low for encrypting uploads | Failed submissions | Deploy guide requires Workers Paid; tests run under default local limits; README notes it. |
| R7 | Browser storage eviction or forgotten passphrase (renter) | Renter data loss | `navigator.storage.persist()`; encrypted backup prompts; clear warnings. |
| R8 | Spam or abusive submissions | Storage and staff burden | Rate limiting; optional Turnstile; size limits; listing must be open. |
| R9 | PDF fidelity: no CJK or Arabic glyphs | Some names render as □ | Note on the PDF; JSON export carries exact values; add fonts post-v1. |
| R10 | Laws change (VIC regs versions, NSW regs, new states) | Stale rules | `checkedOn` dates; `rulesVersion` stamped on records; CONTRIBUTING protocol; dated rule ranges. |
| R11 | Licensing of official text (Regulations Crown copyright; Parliament NSW CC BY-NC-ND) | Takedown or licence breach | Use only CAV CC BY 4.0 text; cite and link legislation; short excerpts only; legal question L20. |
| R12 | Cloudflare features or limits change (Access free tier, rate-limit binding availability) | Deploy friction | Adapters degrade gracefully; versions pinned; docs mark UNVERIFIED items. |
| R13 | Agencies extend the kit to collect prohibited information | Unlawful collection | No custom fields; strict schemas; never-collected test; CONTRIBUTING policy. |

---

## 23. Legal questions needing a lawyer's or regulator's confirmation

Ship these in `docs/LEGAL-QUESTIONS.md`.

**Victoria**

- **L1** Does requesting identity documents (Form 3A item 7) only from the preferred applicant, via a later request, comply with s 30AC / s 30BA / reg 14B? The form expects the agent to indicate the requested documents when preparing it.
- **L2** Is a web form presenting Form 3A items with identical labels, but with web-style grouping and validation, "in the prescribed form" (s 30AC; Interpretation of Legislation Act 1984 (Vic) s 53 on deviations from forms)? Is the generated PDF the authoritative copy?
- **L3** The Regulations (v009) Part B "Information for the applicant" item 6 says "Item 13", while the CAV-published form says "Item 11". Which text should an electronic form reproduce?
- **L4** Are consent checkboxes (s 505BC(1)(b)(ii) six-month consent; s 505BD disclosure consents; acknowledgement of the collection notice) "information other than the information set out in Form 3A" under s 30C / reg 15?
- **L5** If a listing is withdrawn and no agreement is ever entered into, when must unsuccessful applicants' information be destroyed under s 505BC(1)(b)?
- **L6** Is contacting listed referees or previous rental providers, or forwarding the application to the rental provider (owner), a "disclosure" requiring written consent under s 505BD?
- **L7** Do encrypted copies in provider-controlled backups (D1 Time Travel ≤30 days) count as "holding" renter's information (s 505BA) after the encryption key is destroyed? Is crypto-shredding "destroy or permanently de-identify"?
- **L8** Does a typed name satisfy Form 3A item 12 "Signature" (Electronic Transactions (Victoria) Act 2000)?
- **L9** Fees: confirm that between 31 Mar and 12 Oct 2026 agents and providers were already prohibited from charging application fees (Form 3A Part B item 3), given the pre-13-Oct s 51A wording was not reviewed.

**New South Wales**

- **L10** Confirm the final assented text, Act number and year (reported as Act No 38 of 2026), and the section numbering and penalties of ss 210–210G, 218A after Legislative Council amendments.
- **L11** Commencement dates (proclamation) and any transitional provisions for applications in progress.
- **L12** What will the regulations prescribe as "identity verification information" (s 209)? Is date of birth included? Can DOB be collected at application for tenancy database checks?
- **L13** Is a renter-side app that stores data **only on the renter's device**, served as static files, a "residential tenancy entity" under s 210A(1)(d)? Is the operator of a hosted static site, or of the agency's inbox infrastructure (Cloudflare), one?
- **L14** Does a tenant submitting through the renter app to the agency's inbox satisfy s 210C ("directly from the tenant")? Are reference checks "collection from another person" needing consent under s 210C(3)(a)?
- **L15** Until the regulations set maximum retention periods, is the kit's default (unsuccessful: 14 days after agreement; ID copies deleted on verification, ≤7 days) consistent with APP 11.2 as applied by s 210A?
- **L16** Does s 210A make APP 1 (privacy policy) and APP 12/13 obligations apply to small agencies under the $3M threshold? Confirm that the Notifiable Data Breaches scheme is not applied, given s 210A(4) imports only ss 6, 6A(1), 8 and Part III Div 2.
- **L17** Before commencement, is there any risk in using the kit's provisional form or deferring ID collection under current NSW law? (Expected: none, but confirm.)

**Both and Commonwealth**

- **L18** Is a de-identified audit log (staff ids, random application ids, timestamps) after purge still "renter's information" or personal information?
- **L19** Is a notice made available in an applicant portal "written notice" for VIC s 439D(2) and NSW s 210E(b) (Electronic Transactions Acts)?
- **L20** Copyright: confirm the CAV CC BY 4.0 licence covers the Form 3A and Form 3 texts as reproduced, and the treatment of Regulation text. Confirm the licence of the NSW approved form when published.
- **L21** APP 8 and state law: does storing data with Cloudflare (no AU residency guarantee) require specific disclosure or consent? Is Cloudflare a party to whom information is "disclosed" (VIC s 505BD)?
- **L22** Does applying for several properties through the same agency allow reuse of an application only with the s 505BC(1)(b)(ii) consent, or is fresh submission always required?

---

## 24. Open questions for Luke (defaults Codex implements now)

| # | Question | Default in v1 |
|---|---|---|
| Q1 | Licence: Apache-2.0 OK (vs MIT)? | Apache-2.0 |
| Q2 | Cloudflare acceptable given no Australian data-residency guarantee, or should a Node/Docker + SQLite + local-disk adapter (AU VPS) be in v1? | Cloudflare only; adapter ports in place |
| Q3 | Ship the NSW PROVISIONAL form in v1, or NSW "guidance mode" only until the approved form exists? | Provisional form behind banners |
| Q4 | Retention defaults: unsuccessful 14 days after agreement; successful handoff 30 days; withdrawn 2 days; ID docs deleted on verification (≤7 days). | As listed |
| Q5 | Staff auth via Cloudflare Access acceptable for the first agency (needs a Zero Trust account)? | Yes |
| Q6 | No email or SMS notifications in v1 (agents share links): OK? | No email |
| Q7 | VIC: allow agencies to collect ID at application (law permits), or always force the preferred-applicant stage? | Allowed per listing; default preferred |
| Q8 | Should the project publish the renter app as a public static site (e.g. GitHub Pages)? Deploying is Luke's call; v1 only makes it deployable. | Not deployed |
| Q9 | Co-applicant group codes in v1? | Included (simple code) |
| Q10 | Turnstile optional or required? | Optional, off by default |
| Q11 | Commission a lawyer or regulator review of §23 before any real agency use? | Strongly recommended in README |
| Q12 | Package scope and name (`@aurak/*`, "au-rental-application-kit")? | As listed |

---

## 25. Sources (all checked 2026-11-04 unless stated)

**Victoria**

- [S1] CAV, "Applying for a property" (last updated 14 Oct 2026): https://www.consumer.vic.gov.au/housing/renting/starting-and-changing-rental-agreements/applying-signing-and-moving-in/applying-for-a-property
- [S2] CAV, "New changes to the rental laws" (last updated 14 Oct 2026): https://www.consumer.vic.gov.au/housing/renting/new-changes-to-the-rental-laws
- [S3] CAV, "Protecting a renter's personal information: your responsibilities as a rental provider or agent" (last updated 27 Feb 2026): https://www.consumer.vic.gov.au/housing/renting/legal-and-dispute-support/protecting-a-renters-personal-information-your-responsibilities-as-a-rental-provider-or-agent
- [S4] CAV, Residential rental application form (docx, metadata created 26 Feb 2026): https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/renting/residential-rental-application-31-march-2026.docx
- [S5] CAV, Statement of Information for Rental Applicants (docx): https://www.consumer.vic.gov.au/library/forms/housing-and-accommodation/renting/statement-of-information-for-rental-applicants.docx
- [S6] CAV copyright (CC BY 4.0 with exclusions): https://www.consumer.vic.gov.au/copyright
- [S7] Residential Tenancies Act 1997 (Vic), authorised version 115, in force 13 Oct 2026: https://www.legislation.vic.gov.au/in-force/acts/residential-tenancies-act-1997/115 (PDF: https://content.legislation.vic.gov.au/sites/default/files/2026-10/97-109aa115-authorised.pdf). Sections read: 29C, 30AC, 30B, 30BA, 30C, 51A, 439D, 505BA–505BE.
- [S8] Residential Tenancies Regulations 2021 (Vic), version 009, in force 30 Jun 2026: https://www.legislation.vic.gov.au/in-force/statutory-rules/residential-tenancies-regulations-2021/009 (PDF: https://content.legislation.vic.gov.au/sites/default/files/2026-06/21-3sra009-authorised.pdf). Read: regs 14, 14A, 14B, 15, 21C; Sch 1 Forms 3 and 3A.
- [S9] legislation.vic.gov.au copyright: https://www.legislation.vic.gov.au/copyright
- [S10] Victorian Government, notice fixing the penalty unit value ($209.10 from 1 Jul 2026): https://www.vic.gov.au/notice-under-section-6-fixing-value-fee-unit-and-penalty-unit-5

**New South Wales**

- [S11] LSJ, "Standard rental application to protect privacy, says NSW Government" (25 Sep 2026): https://lsj.com.au/articles/standard-rental-application-to-protect-privacy-says-nsw-government/
- [S12] NSW Parliament bill page (HTTP 403 to automated fetch; status reported by search summary, **UNVERIFIED**): https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18774
- [S13] Bill, Legislative Assembly second print: https://www.parliament.nsw.gov.au/bill/files/18774/Second%20Print.pdf, read via archive http://web.archive.org/web/20260315222908/https://www.parliament.nsw.gov.au/bill/files/18774/Second%20Print.pdf. First print archived at http://web.archive.org/web/20250912225856/https://www.parliament.nsw.gov.au/bill/files/18774/First%20Print.pdf
- [S14] Legislative Assembly amendment sheet c2025-165C, "Agreed amendment 21.10.25" (only No. 4 agreed): http://web.archive.org/web/20260315222911/https://www.parliament.nsw.gov.au/bill/files/18774/Agreed%20amendments%20-%20Residential%20Tenancies%20Amdt%20(Protection%20of%20Personal%20Information)%20Bill.pdf
- [S15] NSW Government ministerial release (25 Sep 2026): https://www.nsw.gov.au/ministerial-releases/renters-get-landmark-protections-against-privacy-breaches-and-misleading-rental-ads
- [S16] NSW Government ministerial release (29 Jun 2025): https://www.nsw.gov.au/ministerial-releases/minns-government-introduces-new-laws-to-protect-personal-data-of-renters-and-penalise-misleading-rental-ads
- [S17] REINSW, "New rental reforms passed: what property managers need to know" (Sep 2026): https://www.reinsw.com.au/Web/News/REINSW_Updates/2026/September/new_rental_reforms_passed_what_property_managers_need_to_know
- [S18] NSW Fair Trading Commissioner's guidance, "When a prospective tenant applies for a property": https://www.nsw.gov.au/housing-and-construction/rental-forms-surveys-and-data/resources/fair-trading-commissioners-guidance/when-a-prospective-tenant-applies-for-a-property
- [S19] Tenants' Union of NSW briefing (Jul 2025): https://files.tenants.org.au/policy/2025-07-RT-Amendment-Bill-Protection-of-Personal-Information-2025-TUNSW-briefing.pdf
- [S20] Real Estate Business (secondary, 29 Sep 2026): https://www.realestatebusiness.com.au/industry/32513-ai-privacy-and-rental-applications-nsw-agents-face-sweeping-new-rules

**Commonwealth and other**

- [S22] OAIC, Tenancy: https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/tenancy
- [S23] Privacy Act 1988 (Cth) (cited, text not fetched): https://www.legislation.gov.au/C2004A03712/latest/text
- [S24] Queensland RTA, rental law changes from 1 May 2025 (search result only, **UNVERIFIED**): https://www.rta.qld.gov.au/news/2025/04/30/new-queensland-rental-laws-in-effect-from-1-may-2025-and-updated-rta-forms
- [S-OWASP] OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA256 600,000 iterations): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- ACMA fiction phone numbers (via search): https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works

**Cloudflare**

- [S-CF-LIMITS] Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- [S-CF-PRICING] Workers/D1/R2 pricing: https://developers.cloudflare.com/workers/platform/pricing/
- [S-CF-D1LIMITS] D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- [S-CF-D1LOC] D1 data location: https://developers.cloudflare.com/d1/configuration/data-location/
- [S-CF-D1TT] D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- [S-CF-R2API] R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- [S-CF-R2SEC] R2 data security: https://developers.cloudflare.com/r2/reference/data-security/
- [S-CF-R2LOC] R2 data location: https://developers.cloudflare.com/r2/reference/data-location/
- [S-CF-CRON] Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- [S-CF-ACCESS] Validating Access JWTs: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- [S-CF-RATELIMIT] Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- [S-CF-SECRETS] Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- [S-CF-TURNSTILE] Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- [S-CF-VITEST] Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/ and https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/ ; D1 test example: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/d1

**Tooling:** npm registry (`https://registry.npmjs.org/<pkg>/latest`) for versions and licences in §6.4. GitHub releases for action SHAs in §19.

---

## Appendix A: VIC Form 3A Part A, verbatim text (store as `content/vic/form3a-part-a.md`)

Source: CAV Residential rental application (31 March 2026) [S4], © State of Victoria (Consumer Affairs Victoria), CC BY 4.0. Item numbers per Regs Sch 1 Form 3A [S8].

```
Residential rental application
Residential Tenancies Act 1997 Section 30AC
Residential Tenancies Regulations 2021 Regulation Sections 14A and 14B

This form must be used for all applications to enter into a residential rental agreement. For more information about your rights and responsibilities, please visit the Consumer Affairs Victoria (CAV) website at consumer.vic.gov.au or call CAV on 1300 55 81 81.

Who completes this application form?
Rental providers or their agents must provide information outlined in item 2, documents requested under items 6 and 7 and information regarding tenancy databases used by the rental provider or their agent under item 11.
The applicant should complete all other items on the form. If 2 or more applicants apply to live together at the same property (e.g. as partners, friends or family), each applicant who is 18 years of age or over may be asked to complete a separate application form.
This form is not to be used to apply for social housing as defined in the Housing Act 1983 or specialised housing program as defined in the Residential Tenancies Regulations 2021.

PART A—GENERAL
1. Premises to which the application applies
   Address of premises
2. Rental provider or agent's details
   Full name or company name of rental provider or their agent
   ACN (or ABN if not a registered company)
   Address
   Phone number
   Email address
   Australian State or Territory in which the rental provider resides
3. Number of occupants
   Total number of occupants intended to reside on the premises
4. Personal details of applicant
   Full name / Date of birth / Current address / Postcode / Phone / Email
5. Employment details
   Current or most recent employer / Employer address / Net weekly income
   If not currently employed, date on which most recent employment ended:
   If you cannot provide details of your current employment or income, please provide other details about your ability to pay rent under item 6 (Financial information).
6. Financial information
   A rental provider or their agent may request no more than two documents from the following list to confirm your capacity to pay the proposed rent:
   • Pay slips from current or recent employment
   • Bank statement (without transaction details)
   • Centrelink payment statements or letters
   If you are not receiving regular income, for example you are self-employed, undertake casual employment, freelance or unemployed, please provide details of previous employment or other documents supporting your financial ability to pay rent, such as proof of savings or assets. Please provide one copy of each of the following requested financial documents to verify your ability to pay rent:
   (a) [Rental provider or their agent to indicate requested financial document]
   (b) [Rental provider or their agent to indicate requested financial document]
7. Verification of identity
   A rental provider or their agent can request no more than two identity documents from the following list:
   Driver licence; Proof of age card (government issued); Medicare card; Australian passport; Foreign passport and Australian visa; Birth certificate; Certificate of Australian citizenship; Tertiary student identification card; Centrelink card; Department of Veterans' Affairs card; Utilities bill at current address; Letter from a government Department addressed to current address
   Please provide a copy of each of the following requested documents to verify your identity. You should discuss with the rental provider or their agent the most suitable method of identity verification if you are unable to provide the requested documents:
   (a) [Rental provider or their agent to indicate requested identity document]
   (b) [Rental provider or their agent to indicate requested identity document]
8. Rental or residential history
   Property 1: Current / most recent address / Postcode / Period of residence at address / Rental provider / agent name if applicable / Rental provider / agent email if applicable / Rental provider / agent phone contact details if applicable
   Property 2: Previous address / Postcode / Period of residence at address / Rental provider/agent name if applicable / Rental provider/agent email if applicable / Rental provider/agent phone contact details if applicable
9. References
   A rental provider or their agent may request the contact details of personal referees.
   If this is requested, please provide contact details of your personal referees.
   Referee 1 / Referee 2: Name / Phone / Email / Referee's connection to applicant
10. Term of rental agreement
   Desired lease term (e.g. 6 months, 12 months, 24 months): / Preferred move in date:
11. Tenancy databases
   Note: A rental provider or their agent can use tenancy databases to check your rental history. If the rental provider or agent uses such databases, the names of the databases used must be disclosed below. The rental provider or their agent must also notify you in writing of certain matters. See item 4 in the "Information for the applicant" in Part B (below).
   The following databases may be used to check your tenancy history. You may contact the tenancy databases using the following details:
   Tenancy database name / Phone number / Web address (up to 3 rows)
12. Signature
   I understand that my application may not be processed unless all required documents are submitted.
   Print name: / Signature: / Date:
For further information, visit the Consumer Affairs Victoria (CAV) website at consumer.vic.gov.au or call CAV on 1300 55 81 81.
```

## Appendix B: VIC Form 3A Part B, verbatim (store as `content/vic/form3a-part-b.md`)

Source and licence as in Appendix A (CAV wording, "Item 11"; see L3).

```
PART B–RIGHTS AND OBLIGATIONS
This is a summary of selected rights and obligations of renters and rental providers in respect of an application to enter into a residential rental agreement under the Residential Tenancies Act 1997 ("the Act").

Information for the rental provider or their agent
1. Application form
Rental providers and agents must use a standardised residential rental application form which complies with the Act and the Residential Tenancies Regulations 2021 ("the Regulations").
2. Rental auctions and bidding
Rental auctions and rental bidding are prohibited under the Act. The rented premises must be advertised or offered for a fixed amount and rental providers and agents must not:
(a) solicit or otherwise invite an offer of an amount of rent that is higher than the fixed amount; or
(b) accept an unsolicited or uninvited offer of an amount of rent that is higher than the fixed amount.
3. No application fees
A rental provider or their agent must not charge the applicant any fees for this application.
4. Request for information from applicants
A rental provider or their agent must only ask applicants for the information set out in this form. Applicants must not be asked to provide information that is not on this application form.
5. Privacy notifications
A rental provider or their agent must provide applicants with all notifications in relation to privacy and personal information as required by law. Such notification must only contemplate use of the personal information for the purposes of processing this rental application.
6. Personal information not to be used for other purposes
The personal information provided in this form is confidential. A rental provider or their agent must not use the applicant's information other than to assess the applicant's suitability as a renter or in accordance with any other requirement of the Act. A rental provider or their agent may commit an offence if they do not take reasonable steps to protect the applicant's information from misuse or loss, and unauthorised access, modification or disclosure.
7. Protection of applicant's information from misuse, interference or loss
A rental provider or their agent must take reasonable steps to protect the applicant's information from misuse or loss and unauthorised access, modification or disclosure.
8. Applicant to discuss alternative documentation if needed
If an applicant does not have documents requested in this form, the applicant may discuss with the rental provider or their agent what other documentation may be suitable.
9. Residential tenancy databases
A rental provider or their agent may use residential tenancy databases to check an applicant's rental history. If a rental provider or their agent uses a residential tenancy database to check an applicant's rental history, the database must be disclosed in this Form.
Under section 439D(2) of the Act, if personal information about the applicant is in the database, the rental provider or their agent must, as soon as possible, but within 7 days after using the database, give the applicant a written notice stating the name of the database, the personal information about the applicant in the database, the name of each person who listed the personal information in the database, and how and in what circumstances the applicant can have the personal information removed or amended.
Failure to comply with section 439D(2) of the Act is an offence.
10. Applicant's information to be destroyed or deidentified
If the application is successful, the rental provider or their agent must destroy or permanently deidentify the applicant's information within 3 years after the applicant's residential rental agreement terminates.
If the application is unsuccessful, the rental provider or their agent must destroy or permanently deidentify the applicant's information within 30 days after the property is leased, or within 6 months if they have received written consent from the applicant to use the information to apply for other premises.

Information for the applicant
1. Each applicant to complete application form
Each prospective renter over the age of 18 may be asked to complete a copy of this application form.
2. Contact rental provider / agent to check the outcome
Applicants should contact the rental provider or their agent after lodging an application to check if the application was successful.
3. Protection of applicant's information from misuse, interference or loss
A rental provider or their agent must take reasonable steps to protect an applicant's information from misuse or loss and unauthorised access, modification or disclosure.
4. Residential tenancy databases
A rental provider or their agent may use residential tenancy databases to check an applicant's rental history. If a rental provider or their agent uses a residential tenancy database to check an applicant's rental history, the database must be disclosed in this Form.
Under section 439D(2) of the Act, if the personal information about the applicant is in the database, the rental provider or their agent must, as soon as possible, but within 7 days after using the database, give the applicant a written notice stating the name of the database, the personal information about the applicant in the database, the name of each person who listed the personal information in the database, and how and in what circumstances the applicant can have the personal information removed or amended.
Failure to comply with the requirements under section 439D(2) of the Act is an offence.
5. Applicant's information to be destroyed or deidentified
If the application is successful, the rental provider or their agent must destroy or permanently deidentify the applicant's information within 3 years after the applicant's residential rental agreement terminates.
If the application is unsuccessful, the rental provider or their agent must destroy or permanently deidentify the applicant's information within 30 days after the property is leased, or within 6 months if they have received written consent from the applicant to use the information to apply for other premises.
6. Application assessment
A rental provider or their agent will assess the applicant's suitability based on the information provided, including checking any residential tenancy database identified in Item 11.
For more information see Information for rental providers or their agents, and Information for renters, above or visit the CAV website.
A rental provider or agent and an applicant should ensure that they complete the application in full using true and correct information.
A rental provider or agent is not required to provide reasons to an applicant for an unsuccessful application.

Help or further information
For further information, visit the renting section – Consumer Affairs Victoria website at www.consumer.vic.gov.au/renting or call the Consumer Affairs Victoria Helpline on 1300 55 81 81.
Telephone interpreter service
If you have difficulty understanding English, contact the Translating and Interpreting Service (TIS) on 131 450 (for the cost of a local call) and ask to be put through to an Information Officer at Consumer Affairs Victoria on 1300 55 81 81.
```

The CAV docx also contains the interpreter notice in ten other languages (Arabic, Turkish, Vietnamese, Somali, Chinese, Serbian, Amharic, Dari, Croatian, Greek, Italian). The regulated Form 3A in the Regulations does **not** include these. v1 includes the English paragraph only and links to the official CAV form for translated notices. Adding scripts like Arabic, Amharic and Chinese needs extra fonts (post-v1).

## Appendix C: VIC Form 3, Statement of Information for Rental Applicants (store as `content/vic/form3-statement.md`)

Source: CAV docx [S5] (CC BY 4.0) and Regs Sch 1 Form 3 [S8]. Required by RTA s 29C.

```
Statement of Information for Rental Applicants
Residential Tenancies Act 1997 Section 29C
Residential Tenancies Regulations 2021 Regulation 14

Information for rental applicants
Discrimination is treating, or proposing to treat, someone unfavourably because of a personal attribute. Discrimination is also imposing an unreasonable requirement, condition or practice that disadvantages persons with a personal attribute.
In Victoria it is unlawful to discriminate against someone in relation to certain personal attributes. This means that residential rental providers (rental providers) and real estate agents cannot refuse you accommodation or discriminate against you during your tenancy on the basis of personal attributes protected by law. The following is a list of some protected attributes that are sometimes discriminated against in the rental market—
• age;
• disability (including physical, sensory, intellectual disability and mental illness);
• employment activity;
• expunged homosexual conviction;
• gender identity;
• industrial activity (including union activity);
• marital status;
• parental status or status as a carer;
• physical features;
• political belief or activity;
• pregnancy or breastfeeding;
• race;
• religious belief or activity;
• lawful sexual activity or sexual orientation;
• sex or intersex status;
• association with someone who has these personal attributes.
These personal attributes are protected by law and extend to agreements under the Residential Tenancies Act 1997 (the Act). It is against the law for a rental provider or their agent to treat you unfavourably or discriminate against you because of these personal attributes when you are applying for a rental property, occupying a rental property or leaving a rental property.
Discrimination on the basis of any of these personal attributes may contravene Victorian laws including the Act, the Equal Opportunity Act 2010 (the Equal Opportunity Act), and a range of Commonwealth Acts including the Age Discrimination Act 2004, the Disability Discrimination Act 1992, the Racial Discrimination Act 1975 and the Sex Discrimination Act 1984.
In some limited circumstances, discrimination may not be unlawful, including accommodation provided for children, shared family accommodation, and student accommodation. For example, a community housing provider who is funded to provide youth housing may positively discriminate to provide accommodation for a young person. For more information, contact the Victorian Equal Opportunity and Human Rights Commission (VEOHRC).

Scenarios and examples of unlawful discrimination in applying for a property
• Refusing or not accepting your application because you have children, unless the premises is unsuitable for occupation by children due to its design or location.
• Processing your application differently to other applicants and not giving your application to the rental provider because you have a disability or because of your race.
• Offering you the property on different terms by requiring more bond or requiring you to have a guarantor because of your age.
• Refusing to provide accommodation because you have an assistance dog.

Scenarios and examples of unlawful discrimination when occupying or leaving a property
• Refusing to agree to you assigning your lease to someone else because of that person's personal attributes.
• Refusing to allow you to make reasonable alterations or modifications to the property to meet your needs if you have a disability.
• Extending or renewing your agreement on less favourable terms than your original agreement based on your protected attributes (e.g. due to a disability).
• Issuing you with a notice to vacate based on your protected attributes.
The examples listed and similar actions could contravene the Act, the Equal Opportunity Act, or the Commonwealth Acts.

Getting help
If a rental provider or a real estate agent has unlawfully discriminated against you and you have suffered loss as a result, you may apply to VCAT for an order for compensation under section 210AA of the Act. VCAT may be contacted online at vcat.vic.gov.au/ or by calling 1300 018 228.
If you would like advice about unlawful discrimination in relation to an application to rent or an existing agreement you may call Victoria Legal Aid on 1300 792 387.
If you feel you have been unlawfully discriminated against when applying to rent, or once you have occupied a property, you or someone on your behalf may make a complaint to VEOHRC at humanrightscommission.vic.gov.au/ or by calling 1300 292 153.
For further information visit the renting section of the Consumer Affairs Victoria website at www.consumer.vic.gov.au/renting or call 1300 55 81 81.
```

## Appendix D: Disclaimer text (use verbatim in README, app footers, PDFs and JSON)

> **Not legal advice.** au-rental-application-kit is free, open-source software provided "as is" under the Apache License 2.0. It summarises Australian rental laws as understood by contributors on the dates shown, and may be incomplete, out of date or wrong. It is not a law firm and is not affiliated with or endorsed by Consumer Affairs Victoria, NSW Fair Trading or any government. Forms it produces are not official government documents. Rental providers and agents remain responsible for their own legal compliance. Get advice from a lawyer or the relevant regulator before relying on it. NSW features are **PROVISIONAL** until the NSW approved form and regulations are published and the law commences.
