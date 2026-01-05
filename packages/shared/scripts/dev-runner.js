#!/usr/bin/env node

const { spawn } = require("child_process");

const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  // eslint-disable-next-line no-console
  console.error("Usage: dev-runner <command> [args...]");
  process.exit(1);
}
const isWindows = process.platform === "win32";

const child = spawn(cmd, args, {
  stdio: "inherit",
  shell: isWindows,
});

let shuttingDown = false;

function forwardSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal === "SIGINT" || signal === "SIGTERM") {
    process.exit(0);
  }
  if (typeof code === "number") {
    process.exit(code);
  }
  process.exit(1);
});