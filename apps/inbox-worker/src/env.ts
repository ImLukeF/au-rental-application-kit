import { fromBase64url } from "@aurak/crypto";
import { parseDate } from "@aurak/rules";
import type { D1Database, Fetcher, R2Bucket, RateLimit } from "@cloudflare/workers-types";
export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  KEYS: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_LIMITER?: RateLimit;
  ENVIRONMENT: string;
  AUTH_MODE: string;
  ACTIVE_KEK_ID: string;
  DATA_KEK_V1: string;
  DATA_KEK_V2?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  RENTER_APP_ORIGINS: string;
  NSW_PPI_COMMENCEMENT_DATE: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  [key: string]: unknown;
}
export function validateEnv(env: Env, hostname?: string): string[] {
  const missing: string[] = [];
  for (const name of ["DB", "DOCS", "KEYS", "ACTIVE_KEK_ID"]) if (!env[name]) missing.push(name);
  if (!["production", "development"].includes(env.ENVIRONMENT)) missing.push("ENVIRONMENT");
  if (!/^v[1-9]\d*$/.test(env.ACTIVE_KEK_ID)) missing.push("ACTIVE_KEK_ID");
  const keyName = `DATA_KEK_${env.ACTIVE_KEK_ID.toUpperCase()}`;
  try {
    if (fromBase64url(String(env[keyName] ?? "")).length !== 32) missing.push(keyName);
  } catch {
    missing.push(keyName);
  }
  if (env.AUTH_MODE === "dev-insecure") {
    if (
      env.ENVIRONMENT !== "development" ||
      (hostname !== undefined && !["127.0.0.1", "localhost"].includes(hostname))
    )
      missing.push("AUTH_MODE");
  } else if (env.AUTH_MODE === "access") {
    for (const n of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "BOOTSTRAP_ADMIN_EMAIL"])
      if (!env[n]) missing.push(n);
    try {
      const u = new URL(env.ACCESS_TEAM_DOMAIN ?? "");
      if (
        u.protocol !== "https:" ||
        u.origin !== env.ACCESS_TEAM_DOMAIN ||
        !u.hostname.endsWith(".cloudflareaccess.com")
      )
        missing.push("ACCESS_TEAM_DOMAIN");
    } catch {
      missing.push("ACCESS_TEAM_DOMAIN");
    }
  } else missing.push("AUTH_MODE");
  if (env.NSW_PPI_COMMENCEMENT_DATE)
    try {
      parseDate(env.NSW_PPI_COMMENCEMENT_DATE);
    } catch {
      missing.push("NSW_PPI_COMMENCEMENT_DATE");
    }
  for (const o of (env.RENTER_APP_ORIGINS ?? "").split(",").filter(Boolean))
    try {
      const u = new URL(o);
      if (u.origin !== o || u.protocol !== "https:") missing.push("RENTER_APP_ORIGINS");
    } catch {
      missing.push("RENTER_APP_ORIGINS");
    }
  return [...new Set(missing)];
}
