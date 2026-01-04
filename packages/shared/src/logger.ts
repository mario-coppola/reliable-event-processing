import pino from "pino";

/**
 * Minimal structured logger for the whole system.
 * Do not put domain-specific logging helpers here.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined
});