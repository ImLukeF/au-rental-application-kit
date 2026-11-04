export const CONSENTS = [
  {
    id: "share_with_agency@1",
    text: "I am giving this application to {agencyName} so that they and the rental provider can assess whether I am suitable to rent {premisesAddress}. I understand it will be used only for that purpose and destroyed on the schedule shown.",
    sha256: "d8eb046bb3d9fe32c7c20774116c9ff0ab38efa23b933b3149147e165ed5c5cf",
    jurisdictions: ["VIC", "NSW"],
    whenShown: "always",
  },
  {
    id: "referee_contact@1",
    text: "{agencyName} may contact the referees and previous rental providers I listed to check my application.",
    sha256: "84f712746897768575f1a4e6236291b474d243c662cebbf8038b3774a1b89965",
    jurisdictions: ["VIC", "NSW"],
    whenShown: "referees_requested",
  },
  {
    id: "tenancy_database_check@1",
    text: "I understand {agencyName} may check the tenancy databases listed in this application.",
    sha256: "a0ad73dc7d99ec107dcd680195af9ba361c4ef5afa1e179ba3770d279f4b26de",
    jurisdictions: ["VIC", "NSW"],
    whenShown: "databases_listed",
  },
  {
    id: "vic_retain_for_other_premises@1",
    text: "I consent in writing to {agencyName} keeping and using my application to apply for other premises for up to 6 months after an agreement is signed for this property.",
    sha256: "05d2d0480b66f25e9c4585735ad44c202e192545a264642598003590b72379b4",
    jurisdictions: ["VIC"],
    whenShown: "optional",
  },
  {
    id: "nsw_inspection_statement@1",
    text: "I state that I am {unable to | do not wish to} inspect the premises before submitting this application.",
    sha256: "3bb3beff2117285cba393af18bb0b80ccc9e87445aa7912bf515baaefda3a923",
    jurisdictions: ["NSW"],
    whenShown: "not_inspected",
  },
] as const;
export function consentText(id: string, agencyName: string, premisesAddress: string) {
  const c = CONSENTS.find((c) => c.id === id);
  if (!c) throw new Error("Unknown consent");
  return c.text.replaceAll("{agencyName}", agencyName).replaceAll("{premisesAddress}", premisesAddress);
}
