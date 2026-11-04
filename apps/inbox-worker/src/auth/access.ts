import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
export interface StaffAuthenticator {
  authenticate(req: Request): Promise<{ email: string } | null>;
}
export class AccessAuthenticator implements StaffAuthenticator {
  private resolver: JWTVerifyGetKey;
  constructor(
    private issuer: string,
    private audience: string,
    resolver?: JWTVerifyGetKey,
  ) {
    this.resolver = resolver ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  }
  async authenticate(req: Request) {
    const token = req.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.resolver, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256"],
      });
      return typeof payload.email === "string" ? { email: payload.email.toLowerCase() } : null;
    } catch {
      return null;
    }
  }
}
export class DevAuthenticator implements StaffAuthenticator {
  async authenticate(req: Request) {
    const email = req.headers.get("X-Dev-User");
    return email && /^[a-z\d._%+-]+@example\.com$/i.test(email) ? { email: email.toLowerCase() } : null;
  }
}
export interface TurnstileVerifier {
  verify(token: string): Promise<boolean>;
}
export class CloudflareTurnstile implements TurnstileVerifier {
  constructor(
    private secret: string,
    private hostname: string,
    private send: typeof fetch = fetch,
  ) {}
  async verify(token: string) {
    try {
      const response = await this.send("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: this.secret, response: token }),
      });
      const result = (await response.json()) as { success?: boolean; hostname?: string };
      return response.ok && result.success === true && result.hostname === this.hostname;
    } catch {
      return false;
    }
  }
}
