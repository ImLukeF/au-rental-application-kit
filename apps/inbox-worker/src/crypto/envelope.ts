import { decryptJson, encryptJson, importKek, newDataKey, unwrapKey, wrapKey } from "@aurak/crypto";
import type { Env } from "../env";

interface KeyEnvelope {
  v: 1;
  kekId: string;
  wrappedDek: string;
}
export function aad(applicationId: string, purpose: string) {
  return `aurak:v1:${applicationId}:${purpose}`;
}
async function kek(env: Env, id: string) {
  const raw = env[`DATA_KEK_${id.toUpperCase()}`];
  if (typeof raw !== "string") throw new Error("key_unavailable");
  return importKek(raw);
}
export async function createApplicationKey(env: Env, id: string): Promise<CryptoKey> {
  const dek = await newDataKey();
  await env.KEYS.put(
    `app/${id}`,
    JSON.stringify({
      v: 1,
      kekId: env.ACTIVE_KEK_ID,
      wrappedDek: await wrapKey(dek, await kek(env, env.ACTIVE_KEK_ID)),
    }),
  );
  return dek;
}
export async function applicationKey(env: Env, id: string): Promise<CryptoKey> {
  const object = await env.KEYS.get(`app/${id}`);
  if (!object) throw new Error("key_destroyed");
  const value = await object.json<KeyEnvelope>();
  return unwrapKey(value.wrappedDek, await kek(env, value.kekId));
}
export async function seal(env: Env, id: string, purpose: string, value: unknown) {
  return encryptJson(await applicationKey(env, id), value, aad(id, purpose));
}
export async function open<T>(
  env: Env,
  id: string,
  purpose: string,
  value: { iv: string; ct: string },
): Promise<T> {
  return decryptJson<T>(await applicationKey(env, id), value, aad(id, purpose));
}
export async function rewrapKeys(env: Env): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  do {
    const page = await env.KEYS.list({ prefix: "app/", limit: 100, ...(cursor ? { cursor } : {}) });
    for (const item of page.objects) {
      const object = await env.KEYS.get(item.key);
      if (!object) continue;
      const envelope = await object.json<KeyEnvelope>();
      if (envelope.kekId === env.ACTIVE_KEK_ID) continue;
      const dek = await unwrapKey(envelope.wrappedDek, await kek(env, envelope.kekId));
      const saved = await env.KEYS.put(
        item.key,
        JSON.stringify({
          v: 1,
          kekId: env.ACTIVE_KEK_ID,
          wrappedDek: await wrapKey(dek, await kek(env, env.ACTIVE_KEK_ID)),
        }),
        { onlyIf: { etagMatches: object.etag } },
      );
      if (!saved) throw new Error("key_rotation_conflict");
      count++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return count;
}
