const encoder = new TextEncoder();
export function randomBytes(size: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(size));
}
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) throw new Error("Invalid base64url");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
export const encode = base64url;
export const decode = fromBase64url;
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}
export async function sha256(value: Uint8Array | string): Promise<string> {
  const data = typeof value === "string" ? encoder.encode(value) : copy(value);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function newDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
export async function importKek(raw: string | Uint8Array): Promise<CryptoKey> {
  const bytes = typeof raw === "string" ? fromBase64url(raw) : copy(raw);
  if (bytes.byteLength !== 32) throw new Error("Invalid KEK length");
  return crypto.subtle.importKey("raw", bytes, "AES-KW", false, ["wrapKey", "unwrapKey"]);
}
export async function wrapKey(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, "AES-KW")));
}
export async function unwrapKey(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64url(wrapped),
    kek,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}
export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: copy(salt), iterations: 600000 },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export interface Encrypted {
  iv: string;
  ct: string;
}
export async function encrypt(key: CryptoKey, value: Uint8Array, aad: string): Promise<Encrypted> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    copy(value),
  );
  return { iv: base64url(iv), ct: base64url(new Uint8Array(ct)) };
}
export async function decrypt(
  key: CryptoKey,
  value: Encrypted,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(value.iv), additionalData: encoder.encode(aad) },
      key,
      fromBase64url(value.ct),
    ),
  );
}
export function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<Encrypted> {
  return encrypt(key, encoder.encode(JSON.stringify(value)), aad);
}
export async function decryptJson<T>(key: CryptoKey, value: Encrypted, aad: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decrypt(key, value, aad))) as T;
}
export function randomToken(): string {
  return base64url(randomBytes(32));
}
