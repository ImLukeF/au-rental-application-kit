import { createApp } from "./app";
import { type Env, validateEnv } from "./env";
import { runPurge } from "./jobs/purge";
import { log } from "./log";

const app = createApp();
export default {
  fetch: (request: Request, env: Env) => app.fetch(request, env),
  async scheduled(controller: { scheduledTime: number }, env: Env) {
    if (validateEnv(env).length) {
      log({ type: "error", requestId: crypto.randomUUID(), code: "misconfigured" });
      throw new Error("misconfigured");
    }
    await runPurge(env, new Date(controller.scheduledTime));
  },
};
