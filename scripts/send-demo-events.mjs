#!/usr/bin/env node

/**
 * Demo hammer: sends events to the ingestion endpoint.
 * - Sends N valid events
 * - Sends duplicates (same external_event_id, same payload)
 * - Optionally sends 1 invalid payload (to show 400)
 *
 * Non-goals:
 * - No DB reads
 * - No complex assertions
 * - No domain semantics
 */

const DEFAULT_URL = "http://localhost:3000/events/ingest";

function parseArgs(argv) {
  const args = {
    url: process.env.API_URL || DEFAULT_URL,
    count: 5,
    duplicates: 2,
    invalid: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) {
      args.url = argv[++i];
    } else if (a === "--count" && argv[i + 1]) {
      args.count = Number(argv[++i]);
    } else if (a === "--duplicates" && argv[i + 1]) {
      args.duplicates = Number(argv[++i]);
    } else if (a === "--invalid") {
      args.invalid = true;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.count) || args.count < 0) {
    throw new Error("--count must be a non-negative number");
  }
  if (!Number.isFinite(args.duplicates) || args.duplicates < 0) {
    throw new Error("--duplicates must be a non-negative number");
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/send-demo-events.mjs [--url <endpoint>] [--count N] [--duplicates N] [--invalid]

Defaults:
  --url         ${DEFAULT_URL}
  --count       5
  --duplicates  2

Examples:
  node scripts/send-demo-events.mjs
  node scripts/send-demo-events.mjs --count 10 --duplicates 3
  node scripts/send-demo-events.mjs --invalid
  API_URL=http://localhost:3000/events/ingest node scripts/send-demo-events.mjs
`.trim());
}

function makeValidEvent(i) {
  // Deterministic IDs for reproducible output
  const id = `evt_demo_${String(i).padStart(3, "0")}`;
  return {
    event_id: id,
    event_type: i % 2 === 0 ? "invoice.paid" : "invoice.failed",
    payload: {
      amount: 100 + i,
      currency: "EUR",
      demo: true,
    },
  };
}

function makeDuplicateEvent(dupIndex) {
  // Intentional duplicates: same event_id, same payload
  const id = "evt_demo_DUPLICATE";
  return {
    event_id: id,
    event_type: "invoice.paid",
    payload: {
      amount: 999,
      currency: "EUR",
      demo: true,
      duplicate_index: dupIndex,
    },
  };
}

function makeInvalidEvent() {
  // Triggers 400 (missing/invalid fields)
  return {
    event_id: "",
    event_type: 123,
    payload: "not-an-object",
  };
}

async function sendOne(url, body) {
  const startedAt = Date.now();
  let res;
  let text = "";

  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (err) {
    return {
      ok: false,
      status: "ERR",
      ms: Date.now() - startedAt,
      response: String(err?.message ?? err),
    };
  }

  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - startedAt,
    response: text,
  };
}

function line({ ok, status, ms, label, event_id, event_type }) {
  const badge = ok ? "OK " : "FAIL";
  const st = String(status).padEnd(4, " ");
  const t = String(ms).padStart(4, " ");
  const id = (event_id ?? "-").padEnd(18, " ");
  const ty = (event_type ?? "-").padEnd(14, " ");
  return `${badge}  ${st}  ${t}ms  ${id}  ${ty}  ${label}`;
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`Target: ${args.url}`);
  console.log(
    `Plan: ${args.count} valid + ${args.duplicates} duplicates${args.invalid ? " + 1 invalid" : ""}`
  );
  console.log("----");

  const results = [];

  for (let i = 1; i <= args.count; i++) {
    const ev = makeValidEvent(i);
    const r = await sendOne(args.url, ev);
    results.push({
      ...r,
      label: "valid",
      event_id: ev.event_id,
      event_type: ev.event_type,
    });
    console.log(line(results[results.length - 1]));
  }

  for (let i = 1; i <= args.duplicates; i++) {
    const ev = makeDuplicateEvent(i);
    const r = await sendOne(args.url, ev);
    results.push({
      ...r,
      label: "duplicate",
      event_id: ev.event_id,
      event_type: ev.event_type,
    });
    console.log(line(results[results.length - 1]));
  }

  if (args.invalid) {
    const ev = makeInvalidEvent();
    const r = await sendOne(args.url, ev);
    results.push({
      ...r,
      label: "invalid",
      event_id: String(ev.event_id ?? "-"),
      event_type: String(ev.event_type ?? "-"),
    });
    console.log(line(results[results.length - 1]));
  }

  console.log("----");
  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;
  console.log(`Summary: ${okCount} ok, ${failCount} fail`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});