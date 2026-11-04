import { describe, expect, it } from "vitest";
import {
  base64url,
  decrypt,
  deriveVaultKey,
  encrypt,
  fromBase64url,
  importKek,
  newDataKey,
  randomBytes,
  unwrapKey,
  wrapKey,
} from "../src";

describe("WebCrypto authentication and wrapping", () => {
  it("round-trips ciphertext and rejects the wrong AAD and key", async () => {
    const key = await newDataKey();
    const value = new TextEncoder().encode("synthetic payload");
    const encrypted = await encrypt(key, value, "aurak:v1:application:payload");
    expect(await decrypt(key, encrypted, "aurak:v1:application:payload")).toEqual(value);
    await expect(decrypt(key, encrypted, "aurak:v1:another:payload")).rejects.toThrow();
    await expect(decrypt(await newDataKey(), encrypted, "aurak:v1:application:payload")).rejects.toThrow();
    expect((await encrypt(key, value, "aurak:v1:application:payload")).iv).not.toBe(encrypted.iv);
  });
  it("wraps per-application keys and rejects an incorrect KEK", async () => {
    const dek = await newDataKey(),
      kek = await importKek(randomBytes(32));
    const wrapped = await wrapKey(dek, kek);
    const restored = await unwrapKey(wrapped, kek);
    const ct = await encrypt(dek, new Uint8Array([1, 2]), "test");
    expect(await decrypt(restored, ct, "test")).toEqual(new Uint8Array([1, 2]));
    await expect(unwrapKey(wrapped, await importKek(randomBytes(32)))).rejects.toThrow();
  });
  it("derives deterministic, non-extractable vault keys from a salt", async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await deriveVaultKey("example passphrase", salt),
      b = await deriveVaultKey("example passphrase", salt);
    expect(a.extractable).toBe(false);
    expect(await decrypt(b, await encrypt(a, new Uint8Array([42]), "vault"), "vault")).toEqual(
      new Uint8Array([42]),
    );
  });
  it.each([[], [0], [255, 254], [0, 1, 2, 3, 4]])("base64url round-trips %j", (...bytes) => {
    const b = new Uint8Array(bytes);
    expect(fromBase64url(base64url(b))).toEqual(b);
  });
  it("rejects malformed base64url", () => {
    expect(() => fromBase64url("!")).toThrow();
    expect(() => fromBase64url("a")).toThrow();
  });
});
