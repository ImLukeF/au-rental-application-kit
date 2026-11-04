# Adding a jurisdiction

1. Read the current Act, regulations and regulator form. Record URLs, pinpoints, versions, check dates, commencement and confidence. Check content licensing before transcribing a form.
2. Add `packages/rules/src/jurisdictions/<code>/rules.ts` with `Rule[]`, register the data and add the code to the `Jurisdiction` union. The v1 registry is in `registry-data.json`; a per-jurisdiction module can be concatenated by the generator. Add explicit rule tests and a real behavioral assertion at the owning boundary.
3. Register a strict form schema/definition in `packages/forms`, then update the payload adapter and renderer. Describe unavailable forms as PROVISIONAL. Never create custom questions or extend the reusable profile with protected information.
4. Add synthetic fixtures, validation/retention/fee/ID tests and licence notices. Run focused checks and `pnpm gen`, then commit generated schemas and rules.

QLD Form 22 is a possible next jurisdiction, not supported by v1. The plan’s details/version are **UNVERIFIED** and must be researched before coding. See the source link in SOURCES.md.

Engine policy choices live in `packages/rules/src/policies.ts`: register the new jurisdiction's document types, relevant rule IDs, stage policy and retention parameters there. Registry/status/citation operations and policy algorithms consume those data contracts. The form builder, PDF and Worker/UI adapters still need the new jurisdiction’s actual form, as described above; do not assume VIC or NSW labels are appropriate.
