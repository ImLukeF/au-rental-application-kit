import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { Vault } from "../src/vault";

afterEach(async () => {
  await Vault.wipe();
});
describe("encrypted vault", () => {
  it("locks, rejects a wrong passphrase, and keeps records encrypted at rest", async () => {
    const vault = await Vault.create("correct horse battery");
    await vault.put("records", "profile", { name: "Test Applicant One" });
    const db = await openDB("aurak-vault", 1);
    expect(JSON.stringify(await db.getAll("records"))).not.toContain("Test Applicant One");
    await expect(Vault.unlock("incorrect passphrase")).rejects.toThrow();
    expect(await (await Vault.unlock("correct horse battery")).get("records", "profile")).toEqual({
      name: "Test Applicant One",
    });
  });
  it("invalidates the locked instance while allowing a fresh unlock", async () => {
    const vault = await Vault.create("correct horse battery");
    await vault.put("records", "profile", { name: "Test Applicant One" });
    vault.lock();
    await expect(vault.get("records", "profile")).rejects.toThrow("locked");
    const fresh = await Vault.unlock("correct horse battery");
    expect(await fresh.get("records", "profile")).toEqual({ name: "Test Applicant One" });
  });
  it("changes the passphrase without losing records", async () => {
    const vault = await Vault.create("correct horse battery");
    await vault.put("records", "profile", { name: "Test Applicant One" });
    await vault.changePassphrase("new vault passphrase");
    await expect(vault.get("records", "profile")).rejects.toThrow("locked");
    await expect(Vault.unlock("correct horse battery")).rejects.toThrow();
    expect(await (await Vault.unlock("new vault passphrase")).get("records", "profile")).toEqual({
      name: "Test Applicant One",
    });
  });
  it("restores an encrypted backup and wipes the vault", async () => {
    const vault = await Vault.create("correct horse battery");
    await vault.put("records", "profile", { name: "Test Applicant One" });
    const backup = await vault.backup("different backup passphrase");
    expect(JSON.stringify(backup)).not.toContain("Test Applicant One");
    await Vault.wipe();
    const restored = await Vault.create("new vault passphrase");
    await restored.restore(backup, "different backup passphrase");
    expect(await restored.get("records", "profile")).toEqual({ name: "Test Applicant One" });
    await Vault.wipe();
    expect(await Vault.exists()).toBe(false);
  });
});
