// Structured logging so a hosted log viewer (or Sentry breadcrumbs) can
// filter/search on jobId. Swap the console calls for a real logger
// (pino, Sentry) without touching call sites once one is wired up.
type Fields = Record<string, unknown>;

function log(level: "info" | "warn" | "error", message: string, fields?: Fields) {
  const entry = { level, message, time: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: Fields) => log("info", message, fields),
  warn: (message: string, fields?: Fields) => log("warn", message, fields),
  error: (message: string, fields?: Fields) => log("error", message, fields),
};
