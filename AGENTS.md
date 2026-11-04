# Project rules

These rules apply to everyone who changes this repository, human or AI agent.

## Setup

- Node 24 (`.nvmrc`) and pnpm 12.16.1 (`packageManager`; Corepack can activate it).
- Install with `corepack pnpm install --frozen-lockfile`. Do not use npm or yarn.
- Local Worker setup (dev vars, local key, D1 migrations) is in the [README](README.md#run-locally).

## Commands

- Lint: `pnpm lint` (fix formatting with `pnpm format`)
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`. Focused: `pnpm exec vitest run <path> --maxWorkers=2 --no-file-parallelism`
- Build: `pnpm build` (Wrangler dry run only; it never deploys)
- Repo checks: `pnpm check:placeholders`, `pnpm check:deps`, `pnpm check:generated`
- After changing rules or schemas, run `pnpm gen` and commit the generated files.

## Workflow

- Work on a feature branch. Never commit or push to `main`.
- Keep each PR small and focused on one change. Use Conventional Commits (`fix(rules): ...`).
- A maintainer reviews and merges every PR.
- Never skip hooks (`--no-verify`) or force-push shared branches.

## Before a PR

- These must pass (CI runs the same list): `pnpm check:placeholders`, `pnpm check:deps`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:generated`.
- Say in the PR what changed and how you checked it.

## Secrets and personal data

- Never commit secrets, real API keys, tokens, account or database IDs, or personal data.
- Use placeholders: `example.com`, `example.org` or `example.net` emails, `.env.example`, `.dev.vars.example`, `REPLACE_WITH_...` IDs in `wrangler.jsonc`.
- Fixture people are Test Applicant One, Test Applicant Two and Sample Referee. Addresses contain "Placeholder" and postcode `0000`.
- Keep real data out of issues, commits, PRs and logs too.

## Tests

- Use synthetic fixtures (`fixtures/`) and local D1/R2. No live network, no real credentials.
- Add or update a test at the owning boundary for each behavior change.

## Dependencies

- Keep dependencies minimal and explain each new one in the PR.
- No payment, analytics, tracking, scoring or AI dependencies.

## Local servers

- Bind dev and test servers to `127.0.0.1` only. Never `0.0.0.0` or a public port.

## Docs and legal rules

- Do not invent statistics, user numbers, quotes, testimonials or endorsements.
- Do not claim legal compliance or certification. This is not legal advice.
- Rule changes need a primary source URL, pinpoint and check date. Keep UNVERIFIED and PROVISIONAL labels honest. See [adding a jurisdiction](docs/ADDING-A-JURISDICTION.md).
