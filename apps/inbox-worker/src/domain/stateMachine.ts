export const STATES = [
  "submitted",
  "shortlisted",
  "preferred",
  "id_requested",
  "id_verified",
  "successful",
  "unsuccessful",
  "withdrawn",
  "purged",
] as const;
export type Status = (typeof STATES)[number];
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: ["shortlisted", "unsuccessful", "withdrawn"],
  shortlisted: ["preferred", "unsuccessful", "withdrawn"],
  preferred: ["id_requested", "unsuccessful", "withdrawn"],
  id_requested: ["id_verified", "unsuccessful", "withdrawn"],
  id_verified: ["successful", "unsuccessful", "withdrawn"],
  successful: ["purged"],
  unsuccessful: ["purged"],
  withdrawn: ["purged"],
  purged: [],
};
export const FINAL_STATES: readonly Status[] = ["successful", "unsuccessful", "withdrawn", "purged"];
export function canTransition(from: Status, to: Status) {
  return TRANSITIONS[from].includes(to);
}
