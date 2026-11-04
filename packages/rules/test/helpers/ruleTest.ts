import { expect, it } from "vitest";
import { getRule } from "../../src";
export function ruleTest(id: string, name: string, fn: () => unknown) {
  it(`${id}: ${name}`, async () => {
    expect(getRule(id).id).toBe(id);
    await fn();
  });
}
