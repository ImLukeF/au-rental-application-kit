export type LogEvent =
  | { type: "request"; requestId: string; route: string; status: number; ms: number; actorRole?: string }
  | { type: "purge"; requestId: string; count: number; late: number }
  | { type: "error"; requestId: string; code: string };
export function log(event: LogEvent) {
  const allowed =
    event.type === "request"
      ? ["type", "requestId", "route", "status", "ms", "actorRole"]
      : event.type === "purge"
        ? ["type", "requestId", "count", "late"]
        : ["type", "requestId", "code"];
  console.log(
    JSON.stringify(Object.fromEntries(Object.entries(event).filter(([key]) => allowed.includes(key)))),
  );
}
