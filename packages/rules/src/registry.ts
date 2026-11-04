import { parseDate } from "./dates";
import data from "./registry-data.json";
import type { EngineOptions, Jurisdiction, Rule, RuleStatus } from "./types";
import { registryVersion } from "./version";

const registry = data as unknown as Rule[];
export function listRules(j?: Jurisdiction): Rule[] {
  return structuredClone(j ? registry.filter((r) => r.jurisdiction === j) : registry);
}
export function getRule(id: string): Rule {
  const rule = registry.find((r) => r.id === id);
  if (!rule) throw new Error(`Unknown rule: ${id}`);
  return structuredClone(rule);
}
export function ruleStatus(rule: Rule, on: string, opts: EngineOptions = {}): RuleStatus {
  parseDate(on);
  const c = rule.commencement;
  if (c.kind === "guidance") return "guidance";
  if (c.kind === "pending_proclamation") {
    if (!opts.nswPpiCommencementDate) return "pending_commencement";
    parseDate(opts.nswPpiCommencementDate);
    return on >= opts.nswPpiCommencementDate ? "in_force" : "not_yet_in_force";
  }
  if (on < c.from) return "not_yet_in_force";
  if (c.to && on > c.to) return "expired";
  return "in_force";
}
export function activeRules(j: Jurisdiction, on: string, opts?: EngineOptions): Rule[] {
  return listRules(j).filter((r) => ruleStatus(r, on, opts) === "in_force");
}
export function policyRules(j: Jurisdiction, on: string, opts?: EngineOptions): Rule[] {
  return listRules(j).filter(
    (r) =>
      ["in_force", "pending_commencement", "guidance"].includes(ruleStatus(r, on, opts)) ||
      (r.commencement.kind === "pending_proclamation" && ruleStatus(r, on, opts) === "not_yet_in_force"),
  );
}
export function rulesVersion(): string {
  return registryVersion;
}
