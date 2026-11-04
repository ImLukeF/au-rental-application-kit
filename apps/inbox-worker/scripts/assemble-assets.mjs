import { cp, mkdir } from "node:fs/promises";

await mkdir("public", { recursive: true });
await cp("../renter/dist", "public", { recursive: true });
await cp("../agent-ui/dist", "public/agent", { recursive: true });
