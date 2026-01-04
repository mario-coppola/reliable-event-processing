/**
 * Registers shutdown handlers for SIGINT/SIGTERM.
 * Useful for both API and worker processes.
 */
export function onShutdown(fn: (signal: NodeJS.Signals) => Promise<void> | void) {
    const handler = async (signal: NodeJS.Signals) => {
      try {
        await fn(signal);
      } finally {
        // Ensure the process exits after cleanup
        process.exit(0);
      }
    };
  
    process.once("SIGINT", handler);
    process.once("SIGTERM", handler);
  }