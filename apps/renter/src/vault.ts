import { openDB } from "idb";

const enc = new TextEncoder();
const dec = new TextDecoder();
type Cipher = { iv: string; ct: string };
type Kdf = { name: "PBKDF2"; hash: "SHA-256"; iterations: 600000; salt: string };
const b64 = (b: Uint8Array) => {
  let raw = "";
  for (let i = 0; i < b.length; i += 8192) raw += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const un64 = (s: string) =>
  Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const db = () =>
  openDB("aurak-vault", 1, {
    upgrade(d) {
      d.createObjectStore("meta");
      d.createObjectStore("records");
      d.createObjectStore("documents");
      d.createObjectStore("submissions");
    },
  });
async function derive(passphrase: string, kdf: Kdf) {
  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: kdf.iterations, salt: un64(kdf.salt) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function newKdf(): Kdf {
  return { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: b64(random(16)) };
}
async function seal(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<Cipher> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    bytes as BufferSource,
  );
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
async function open(key: CryptoKey, c: Cipher, aad: string) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: un64(c.iv), additionalData: enc.encode(aad) },
      key,
      un64(c.ct),
    ),
  );
}
export class Vault {
  private constructor(private currentKey: CryptoKey | null) {}
  private get key(): CryptoKey {
    if (!this.currentKey) throw Error("Vault is locked.");
    return this.currentKey;
  }
  lock() {
    this.currentKey = null;
  }
  assertUnlocked() {
    void this.key;
  }
  static async exists() {
    return !!(await (await db()).get("meta", "vault"));
  }
  static async create(passphrase: string) {
    if (passphrase.length < 12) throw Error("Use at least 12 characters.");
    if (await Vault.exists()) throw Error("A vault already exists.");
    const kdf = newKdf(),
      key = await derive(passphrase, kdf);
    await (await db()).put(
      "meta",
      { v: 1, kdf, check: await seal(key, enc.encode("aurak-vault-ok"), "aurak-vault:v1:meta:vault") },
      "vault",
    );
    return new Vault(key);
  }
  static async unlock(passphrase: string) {
    const m = await (await db()).get("meta", "vault");
    if (!m) throw Error("Create a vault first.");
    try {
      const key = await derive(passphrase, m.kdf);
      if (dec.decode(await open(key, m.check, "aurak-vault:v1:meta:vault")) !== "aurak-vault-ok")
        throw Error();
      return new Vault(key);
    } catch {
      throw Error("Could not unlock vault. Check your passphrase.");
    }
  }
  async put(store: "records" | "submissions", id: string, value: unknown) {
    await (await db()).put(
      store,
      await seal(this.key, enc.encode(JSON.stringify(value)), `aurak-vault:v1:${store}:${id}`),
      id,
    );
  }
  async get<T>(store: "records" | "submissions", id: string): Promise<T | undefined> {
    this.key;
    const c = await (await db()).get(store, id);
    return c ? JSON.parse(dec.decode(await open(this.key, c, `aurak-vault:v1:${store}:${id}`))) : undefined;
  }
  async list<T>(store: "records" | "submissions"): Promise<T[]> {
    this.key;
    const d = await db();
    return Promise.all((await d.getAllKeys(store)).map((id) => this.get<T>(store, String(id)) as Promise<T>));
  }
  async addDocument(file: File, type: string) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
      throw Error("Files must be between 1 byte and 10 MB.");
    const pdf = dec.decode(bytes.slice(0, 5)) === "%PDF-",
      jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    const contentType = pdf ? "application/pdf" : jpg ? "image/jpeg" : png ? "image/png" : "";
    if (!contentType) throw Error("Choose a valid PDF, JPEG or PNG file.");
    const docId = crypto.randomUUID(),
      sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
    const meta = {
      docId,
      type,
      filename: file.name,
      byteLength: bytes.length,
      contentType,
      sha256,
      addedAt: new Date().toISOString(),
    };
    await (await db()).put(
      "documents",
      {
        ...(await seal(this.key, bytes, `aurak-vault:v1:documents:${docId}`)),
        meta: await seal(
          this.key,
          enc.encode(JSON.stringify(meta)),
          `aurak-vault:v1:documents:${docId}:meta`,
        ),
      },
      docId,
    );
    return meta;
  }
  async documents() {
    this.key;
    const d = await db();
    return Promise.all(
      (await d.getAllKeys("documents")).map(async (id) => {
        const v = await d.get("documents", id);
        return JSON.parse(dec.decode(await open(this.key, v.meta, `aurak-vault:v1:documents:${id}:meta`)));
      }),
    );
  }
  async document(id: string) {
    const v = await (await db()).get("documents", id);
    return open(this.key, v, `aurak-vault:v1:documents:${id}`);
  }
  async deleteDocument(id: string) {
    this.key;
    await (await db()).delete("documents", id);
  }
  async backup(passphrase: string) {
    this.key;
    if (passphrase.length < 12) throw Error("Use at least 12 characters.");
    const d = await db(),
      data: { records: unknown[]; documents: unknown[]; submissions: unknown[] } = {
        records: [],
        documents: [],
        submissions: [],
      };
    for (const store of ["records", "submissions"] as const)
      for (const id of await d.getAllKeys(store)) data[store].push([id, await this.get(store, String(id))]);
    for (const meta of await this.documents())
      data.documents.push([meta, b64(await this.document(meta.docId))]);
    const kdf = newKdf(),
      key = await derive(passphrase, kdf);
    return {
      schemaVersion: "aurak.profile-backup.v1",
      kdf,
      ...(await seal(key, enc.encode(JSON.stringify(data)), "aurak-vault:v1:backup:profile")),
    };
  }
  async restore(backup: any, passphrase: string) {
    this.key;
    if (
      backup?.schemaVersion !== "aurak.profile-backup.v1" ||
      backup.kdf?.name !== "PBKDF2" ||
      backup.kdf?.hash !== "SHA-256" ||
      backup.kdf?.iterations !== 600000
    )
      throw Error("Invalid backup.");
    let data: any;
    try {
      data = JSON.parse(
        dec.decode(await open(await derive(passphrase, backup.kdf), backup, "aurak-vault:v1:backup:profile")),
      );
    } catch {
      throw Error("Could not open backup. Check the passphrase.");
    }
    if (!Array.isArray(data.records) || !Array.isArray(data.documents) || !Array.isArray(data.submissions))
      throw Error("Invalid backup contents.");
    for (const store of ["records", "submissions"] as const)
      for (const [id, value] of data[store]) await this.put(store, id, value);
    for (const [meta, bytes] of data.documents) {
      const v = un64(bytes);
      await (await db()).put(
        "documents",
        {
          ...(await seal(this.key, v, `aurak-vault:v1:documents:${meta.docId}`)),
          meta: await seal(
            this.key,
            enc.encode(JSON.stringify(meta)),
            `aurak-vault:v1:documents:${meta.docId}:meta`,
          ),
        },
        meta.docId,
      );
    }
  }
  async changePassphrase(passphrase: string) {
    if (passphrase.length < 12) throw Error("Use at least 12 characters.");
    const d = await db(),
      kdf = newKdf(),
      key = await derive(passphrase, kdf);
    const entries: {
      records: [IDBValidKey, unknown][];
      submissions: [IDBValidKey, unknown][];
      documents: [IDBValidKey, unknown][];
    } = { records: [], submissions: [], documents: [] };
    for (const store of ["records", "submissions"] as const)
      for (const id of await d.getAllKeys(store)) {
        const value = await this.get(store, String(id));
        entries[store].push([
          id,
          await seal(key, enc.encode(JSON.stringify(value)), `aurak-vault:v1:${store}:${id}`),
        ]);
      }
    for (const meta of await this.documents()) {
      const bytes = await this.document(meta.docId);
      entries.documents.push([
        meta.docId,
        {
          ...(await seal(key, bytes, `aurak-vault:v1:documents:${meta.docId}`)),
          meta: await seal(
            key,
            enc.encode(JSON.stringify(meta)),
            `aurak-vault:v1:documents:${meta.docId}:meta`,
          ),
        },
      ]);
    }
    const check = await seal(key, enc.encode("aurak-vault-ok"), "aurak-vault:v1:meta:vault");
    const tx = d.transaction(["meta", "records", "documents", "submissions"], "readwrite");
    for (const store of ["records", "documents", "submissions"] as const)
      for (const [id, value] of entries[store]) await tx.objectStore(store).put(value, id);
    await tx.objectStore("meta").put({ v: 1, kdf, check }, "vault");
    await tx.done;
    this.lock();
    return new Vault(key);
  }

  static async wipe() {
    const d = await db();
    for (const store of ["meta", "records", "documents", "submissions"]) await d.clear(store);
    d.close();
  }
}
