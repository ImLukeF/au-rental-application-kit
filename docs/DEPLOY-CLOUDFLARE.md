# Self-hosting on Cloudflare

These are operator instructions. The v1 implementation did not deploy or create resources. Review [legal questions](LEGAL-QUESTIONS.md), [privacy design](PRIVACY-DESIGN.md) and all notices before handling personal information.

1. Create your own Cloudflare account and enable Workers Paid. The plan’s checked minimum was USD 5/month; confirm current pricing. Free CPU limits are unsuitable for encrypting multi-megabyte uploads.
2. Use a reviewed commit, Node 24 and pnpm 12.16.1. Install with `pnpm install --frozen-lockfile`, then run the project checks and `pnpm build`. Never deploy an uncommitted checkout. Keep local development on loopback.
3. Create resources in your own account, with the **best-effort Oceania hint**. Run the following only when you choose to deploy:

```sh
pnpm --filter @aurak/inbox-worker exec wrangler d1 create aurak --location oc
pnpm --filter @aurak/inbox-worker exec wrangler r2 bucket create aurak-docs --location oc
pnpm --filter @aurak/inbox-worker exec wrangler r2 bucket create aurak-keys --location oc
```

Confirm each installed CLI’s `--help` first; location hints are not jurisdictions. Cloudflare offers **no guaranteed Australian residency**. Disclose possible offshore storage in the collection notice/privacy policy and obtain APP 8 advice. R2 internal retention after deletion remains UNVERIFIED.

4. Copy `apps/inbox-worker/wrangler.jsonc` to ignored `apps/inbox-worker/wrangler.local.jsonc`. Put the real D1 database ID and bucket names only in that local file. Never commit it or use a real value in an example. Preserve the production Access auth mode, separate DOCS/KEYS buckets and hourly `17 * * * *` cron.
5. Set Worker secrets using the ignored config. Do not paste keys into shell history or frontend variables. From the Worker directory, the key generator can pipe directly into Wrangler:

```sh
node scripts/gen-kek.mjs | pnpm exec wrangler secret put DATA_KEK_V1 --config wrangler.local.jsonc
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.local.jsonc
pnpm exec wrangler secret put ACCESS_AUD --config wrangler.local.jsonc
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_EMAIL --config wrangler.local.jsonc
```

Use the Access application’s issuer (`https://example.cloudflareaccess.com` is a placeholder) and audience, and the intended initial administrator. Keep an agency-owned offline backup of the KEK using your secret-management procedure. Losing it destroys access to encrypted applications. Do not run the generator twice expecting the same key.

6. Apply migrations from the Worker directory:

```sh
pnpm exec wrangler d1 migrations apply aurak --remote --config wrangler.local.jsonc
```

7. Create Access applications covering `/agent*` and `/api/agent*`; require the agency’s SSO and MFA. The Worker independently validates the JWT assertion’s signature, issuer and audience, then checks local staff membership. The first matching bootstrap email can create the initial admin only while the staff table is empty. Never enable `dev-insecure` in production.
8. Configure `RENTER_APP_ORIGINS` only for trusted standalone renter origins, if any. Same-origin deployment needs none. For standalone frontend hosting, configure its CSP `connect-src` for the agency origin too. `NSW_PPI_COMMENCEMENT_DATE` stays empty until the actual proclamation is verified; setting it does not supply the still-missing approved form or final-law review.
9. Optional Turnstile needs the site key, secret and agency setting enabled together. Siteverify checks the request hostname. With it disabled, no third-party widget loads. Monitor rate-limiter availability; its absence is logged and the adapter no-ops. Development configuration intentionally has no inherited rate-limit binding.
10. Deploy only the exact committed, pushed, verified revision when you independently authorize release:

```sh
pnpm exec wrangler deploy --config wrangler.local.jsonc
```

11. Sign in via Access, verify bootstrap, add staff with least privilege, complete agency details, review the collection notice/privacy-policy URL and retention settings, then publish a synthetic listing and verify the entire lifecycle. Monitor hourly cron, late receipts and VIC database-notice deadlines. Portal notices require legal review as “written notice”; staff can record manual delivery. There is no outgoing email or SMS.

To rotate keys, add `DATA_KEK_V2`, set `ACTIVE_KEK_ID=v2`, run **Re-wrap keys** as admin, verify encrypted applications still open, then remove the old secret through your approved process. Retain offline keys only as your policy/legal advice permits; restoring old deleted key objects defeats crypto-shredding. Never enable R2 lifecycle policies that silently delete active wrapped keys.
