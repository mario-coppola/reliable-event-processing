#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# M3 Demo / Regression Test Script
# ============================================================================
# This script tests M3 functionality: manual intervention, audit logging,
# and read-only visibility. It also verifies that Sprint 1 refactor did not
# introduce regressions.

# Configuration with defaults
API_BASE="${API_BASE:-http://localhost:3000}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"

# Colors for output (optional, works even without color support)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log() {
  echo -e "${YELLOW}[INFO]${NC} $*" >&2
}

ok() {
  echo -e "${GREEN}[OK]${NC} $*" >&2
}

fail() {
  echo -e "${RED}[FAIL]${NC} $*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    fail "Required command not found: $1"
  fi
}

trim_ws() {
  echo "$1" | tr -d '[:space:]'
}
trim_edges() {
  echo "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}
sql_quote() {
  local s="$1"
  s="${s//\'/\'\'}"      # escape single quotes
  printf "'%s'" "$s"     # wrap in single quotes
}

psql_exec() {
  local query="$1"
  shift
  docker compose -f "$COMPOSE_FILE" exec -T "$PG_SERVICE" \
    psql -U app -d app -t -A -q "$@" -c "$query"
}

# api_curl uses temp files to robustly handle multiline HTTP response bodies.
# curl's -w writes the status code to stdout, which would corrupt multiline bodies
# if we tried to parse it with tail/sed. Using separate files ensures clean separation.
api_curl() {
  local method="$1"
  local path="$2"
  shift 2
  local tmp_body
  local tmp_code
  local code
  tmp_body=$(mktemp)
  tmp_code=$(mktemp)
  curl -s -o "$tmp_body" -w "%{http_code}" -X "$method" "$API_BASE$path" "$@" > "$tmp_code" || {
    rm -f "$tmp_body" "$tmp_code"
    return 1
  }
  code=$(cat "$tmp_code")
  echo "$code"
  cat "$tmp_body"
  rm -f "$tmp_body" "$tmp_code"
}

# ============================================================================
# Main Test Flow
# ============================================================================

main() {
  local ts
  ts=$(date +%s)
  local event_id_ok="evt_demo_ok_$ts"
  local event_id_perm="evt_demo_perm_$ts"
  local subscription_id_ok="sub_demo_ok_$ts"
  local FAILED_JOB_ID
  local QUEUED_JOB_ID
  local audit_count_before

  echo "============================================================================"
  echo "M3 Demo / Regression Test"
  echo "============================================================================"
  echo ""
  echo "This script tests:"
  echo "  - M1/M2: Event ingestion and processing (invariants still work)"
  echo "  - M3-1: Manual requeue of failed jobs"
  echo "  - M3-2: Audit logging for manual interventions"
  echo "  - M3-3: Read-only visibility of interventions"
  echo ""
  echo "Timestamp: $ts"
  echo "API Base: $API_BASE"
  echo ""

  # A) Pre-flight checks
  log "A) Pre-flight checks"
  require_cmd curl docker

  log "  Checking docker compose availability..."
  if ! docker compose -f "$COMPOSE_FILE" ps &>/dev/null; then
    fail "Docker compose is not available or infra is not up. Run: pnpm infra:up"
  fi
  ok "  Docker compose is available"

  log "  Checking API health endpoint..."
  local health_response
  health_response=$(curl -s "$API_BASE/health" || echo "")
  if ! echo "$health_response" | grep -q '"status":"ok"'; then
    fail "API health check failed. Is the API running on $API_BASE?"
  fi
  ok "  API is reachable"

  # A1) Validation negative tests
  log ""
  log "A1) Validation negative tests (Zod validation)"
  log "  Testing GET /admin/jobs?limit=999 (should be 400)"
  local validation_response_1
  validation_response_1=$(
    api_curl GET "/admin/jobs?limit=999"
  )
  local validation_code_1
  validation_code_1=$(echo "$validation_response_1" | head -n1)
  if [ "$validation_code_1" != "400" ]; then
    fail "Expected 400 for limit=999, got $validation_code_1"
  fi
  ok "  limit=999 correctly rejected (400)"

  log "  Testing GET /admin/jobs?status=boh (should be 400)"
  local validation_response_2
  validation_response_2=$(
    api_curl GET "/admin/jobs?status=boh"
  )
  local validation_code_2
  validation_code_2=$(echo "$validation_response_2" | head -n1)
  if [ "$validation_code_2" != "400" ]; then
    fail "Expected 400 for status=boh, got $validation_code_2"
  fi
  ok "  status=boh correctly rejected (400)"

  log "  Testing GET /admin/interventions?job_id=abc (should be 400)"
  local validation_response_3
  validation_response_3=$(
    api_curl GET "/admin/interventions?job_id=abc"
  )
  local validation_code_3
  validation_code_3=$(echo "$validation_response_3" | head -n1)
  if [ "$validation_code_3" != "400" ]; then
    fail "Expected 400 for job_id=abc, got $validation_code_3"
  fi
  ok "  job_id=abc correctly rejected (400)"

  # B) Ingest OK path
  log ""
  log "B) Ingest OK path (M1/M2 invariants)"
  log "  Ingesting event: $event_id_ok"

  local ingest_response
  ingest_response=$(
    api_curl POST /events/ingest \
      -H "Content-Type: application/json" \
      -d "{\"event_id\":\"$event_id_ok\",\"event_type\":\"subscription.paid\",\"payload\":{\"subscription_id\":\"$subscription_id_ok\"}}"
  )
  local ingest_code
  ingest_code=$(echo "$ingest_response" | head -n1)
  if [ "$ingest_code" != "202" ]; then
    fail "Ingest failed with status $ingest_code. Response: $(echo "$ingest_response" | tail -n+2)"
  fi
  ok "  Event ingested (202 Accepted)"

  log "  Checking event_ledger..."
  local ledger_count
  ledger_count=$(psql_exec "SELECT COUNT(*) FROM event_ledger WHERE external_event_id = $(sql_quote "$event_id_ok");")
  ledger_count="$(trim_ws "$ledger_count")"
  if [ "$ledger_count" != "1" ]; then
    fail "Expected 1 row in event_ledger for $event_id_ok, found $ledger_count"
  fi
  ok "  Event found in event_ledger"

  log "  Checking jobs table..."
  local jobs_count
  jobs_count=$(psql_exec "SELECT COUNT(*) FROM jobs WHERE external_event_id = $(sql_quote "$event_id_ok");")
  jobs_count="$(trim_ws "$jobs_count")"
  if [ "$jobs_count" != "1" ]; then
    fail "Expected 1 row in jobs for $event_id_ok, found $jobs_count"
  fi
  ok "  Job created"

  log "  Polling for job completion (max 10s)..."
  local job_status="queued"
  local attempts=0
  while [ "$job_status" != "done" ] && [ $attempts -lt 20 ]; do
    sleep 0.5
    job_status=$(psql_exec "SELECT status FROM jobs WHERE external_event_id = $(sql_quote "$event_id_ok");")
    job_status="$(trim_ws "$job_status")"
    attempts=$((attempts + 1))
  done

  if [ "$job_status" != "done" ]; then
    fail "Job did not complete. Status: $job_status"
  fi
  ok "  Job completed (status: done)"

  log "  Checking subscription_activations..."
  local idempotency_key_ok="activate_subscription:$subscription_id_ok"
  local activation_status
  activation_status=$(psql_exec "SELECT status FROM subscription_activations WHERE idempotency_key = $(sql_quote "$idempotency_key_ok");")
  activation_status="$(trim_ws "$activation_status")"
  if [ "$activation_status" != "succeeded" ]; then
    fail "Expected activation status 'succeeded', found: $activation_status"
  fi
  ok "  Activation succeeded"

  # C) Create permanent failure
  log ""
  log "C) Create permanent failure"
  log "  Ingesting event with missing subscription_id: $event_id_perm"

  local ingest_response_perm
  ingest_response_perm=$(
    api_curl POST /events/ingest \
      -H "Content-Type: application/json" \
      -d "{\"event_id\":\"$event_id_perm\",\"event_type\":\"subscription.paid\",\"payload\":{}}"
  )
  local ingest_code_perm
  ingest_code_perm=$(echo "$ingest_response_perm" | head -n1)
  if [ "$ingest_code_perm" != "202" ]; then
    fail "Ingest failed with status $ingest_code_perm"
  fi
  ok "  Event ingested (202 Accepted)"

  log "  Polling for job failure (max 10s)..."
  local job_status_perm="queued"
  attempts=0
  while [ "$job_status_perm" != "failed" ] && [ $attempts -lt 20 ]; do
    sleep 0.5
    job_status_perm=$(psql_exec "SELECT status FROM jobs WHERE external_event_id = $(sql_quote "$event_id_perm");")
    job_status_perm="$(trim_ws "$job_status_perm")"
    attempts=$((attempts + 1))
  done

  if [ "$job_status_perm" != "failed" ]; then
    fail "Job did not fail. Status: $job_status_perm"
  fi
  ok "  Job failed"

  log "  Verifying failure_type and last_error..."
  local failure_type
  failure_type=$(psql_exec "SELECT failure_type FROM jobs WHERE external_event_id = $(sql_quote "$event_id_perm");")
  failure_type="$(trim_ws "$failure_type")"
  if [ "$failure_type" != "permanent" ]; then
    fail "Expected failure_type 'permanent', found: $failure_type"
  fi
  ok "  Failure type: permanent"

  local last_error
  last_error=$(psql_exec "SELECT last_error FROM jobs WHERE external_event_id = $(sql_quote "$event_id_perm");")
  last_error="$(trim_edges "$last_error")"
  if ! echo "$last_error" | grep -qi "missing subscription_id"; then
    fail "Expected last_error to contain 'missing subscription_id', found: $last_error"
  fi
  ok "  Error message contains 'missing subscription_id'"

  FAILED_JOB_ID=$(psql_exec "SELECT id FROM jobs WHERE external_event_id = $(sql_quote "$event_id_perm");")
  FAILED_JOB_ID="$(trim_ws "$FAILED_JOB_ID")"
  log "  Captured failed job_id: $FAILED_JOB_ID"

  # D) Manual requeue
  log ""
  log "D) Manual requeue (M3-1 + M3-2)"
  log "  Requeuing job $FAILED_JOB_ID"

  local requeue_response
  requeue_response=$(
    api_curl POST "/admin/jobs/$FAILED_JOB_ID/requeue" \
      -H "Content-Type: application/json" \
      -d '{"actor":"demo-script","reason":"m3 demo requeue"}'
  )
  local requeue_code
  requeue_code=$(echo "$requeue_response" | head -n1)
  if [ "$requeue_code" != "200" ]; then
    fail "Requeue failed with status $requeue_code. Response: $(echo "$requeue_response" | tail -n+2)"
  fi
  ok "  Requeue successful (200 OK)"

  log "  Verifying job status changed to queued..."
  local job_status_after
  job_status_after=$(psql_exec "SELECT status FROM jobs WHERE id = $FAILED_JOB_ID;")
  job_status_after="$(trim_ws "$job_status_after")"
  if [ "$job_status_after" != "queued" ]; then
    fail "Expected job status 'queued', found: $job_status_after"
  fi
  ok "  Job status: queued"

  log "  Verifying available_at is recent..."
  local available_at_check
  available_at_check=$(psql_exec "SELECT COUNT(*) FROM jobs WHERE id = $FAILED_JOB_ID AND available_at >= NOW() - interval '2 minutes';")
  available_at_check="$(trim_ws "$available_at_check")"
  if [ "$available_at_check" != "1" ]; then
    fail "available_at is not recent enough"
  fi
  ok "  available_at is recent"

  log "  Verifying audit record..."
  local audit_count
  audit_count=$(
  psql_exec "SELECT COUNT(*) FROM job_intervention_audit
             WHERE job_id = $FAILED_JOB_ID
               AND action = $(sql_quote "manual_requeue")
               AND actor  = $(sql_quote "demo-script")
               AND reason = $(sql_quote "m3 demo requeue");"
)
  audit_count="$(trim_ws "$audit_count")"
  if [ "$audit_count" != "1" ]; then
    fail "Expected 1 audit record, found: $audit_count"
  fi
  ok "  Audit record created"

  # E) Read-only visibility
  log ""
  log "E) Read-only visibility (M3-3)"
  log "  Fetching interventions for job $FAILED_JOB_ID"

  local interventions_response
  interventions_response=$(
    api_curl GET "/admin/interventions?job_id=$FAILED_JOB_ID"
  )
  local interventions_code
  interventions_code=$(echo "$interventions_response" | head -n1)
  if [ "$interventions_code" != "200" ]; then
    fail "Interventions endpoint failed with status $interventions_code"
  fi
  ok "  Interventions endpoint returned 200"

  local interventions_body
  interventions_body=$(echo "$interventions_response" | tail -n+2)
  if ! echo "$interventions_body" | grep -q "manual_requeue"; then
    fail "Response does not contain 'manual_requeue'"
  fi
  ok "  Response contains 'manual_requeue'"

  if ! echo "$interventions_body" | grep -q "demo-script"; then
    fail "Response does not contain 'demo-script'"
  fi
  ok "  Response contains 'demo-script'"

  if ! echo "$interventions_body" | grep -q '"status":"queued"'; then
    fail "Response does not contain job status 'queued'"
  fi
  ok "  Response contains job status 'queued'"

  # F) Negative paths
  log ""
  log "F) Negative paths"

  log "  F1) Requeue non-failed job (should be 409)"
  log "    Creating queued job..."
  local event_id_queued="evt_demo_queued_$ts"
  local ingest_response_queued
  ingest_response_queued=$(
    api_curl POST /events/ingest \
      -H "Content-Type: application/json" \
      -d "{\"event_id\":\"$event_id_queued\",\"event_type\":\"some.other.event\",\"payload\":{\"x\":1}}"
  )
  local ingest_code_queued
  ingest_code_queued=$(echo "$ingest_response_queued" | head -n1)
  if [ "$ingest_code_queued" != "202" ]; then
    fail "Failed to create queued job"
  fi

  sleep 1
  QUEUED_JOB_ID=$(psql_exec "SELECT id FROM jobs WHERE external_event_id = $(sql_quote "$event_id_queued");")
  QUEUED_JOB_ID="$(trim_ws "$QUEUED_JOB_ID")"
  log "    Captured queued job_id: $QUEUED_JOB_ID"

  audit_count_before=$(psql_exec "SELECT COUNT(*) FROM job_intervention_audit WHERE job_id = $QUEUED_JOB_ID;")
  audit_count_before="$(trim_ws "$audit_count_before")"
  log "    Audit count before: $audit_count_before"

  local requeue_response_queued
  requeue_response_queued=$(
    api_curl POST "/admin/jobs/$QUEUED_JOB_ID/requeue" \
      -H "Content-Type: application/json" \
      -d '{"actor":"demo-script","reason":"should fail"}'
  )
  local requeue_code_queued
  requeue_code_queued=$(echo "$requeue_response_queued" | head -n1)
  if [ "$requeue_code_queued" != "409" ]; then
    fail "Expected 409 Conflict, got $requeue_code_queued"
  fi
  ok "    Requeue rejected with 409 Conflict"

  local audit_count_after
  audit_count_after=$(psql_exec "SELECT COUNT(*) FROM job_intervention_audit WHERE job_id = $QUEUED_JOB_ID;")
  audit_count_after="$(trim_ws "$audit_count_after")"
  if [ "$audit_count_after" != "$audit_count_before" ]; then
    fail "Audit count changed from $audit_count_before to $audit_count_after (should be unchanged)"
  fi
  ok "    Audit count unchanged (no audit on failure)"

  log "  F2) Requeue non-existing job (should be 404)"
  local requeue_response_404
  requeue_response_404=$(
    api_curl POST "/admin/jobs/999999999/requeue" \
      -H "Content-Type: application/json" \
      -d '{"actor":"demo-script","reason":"should fail"}'
  )
  local requeue_code_404
  requeue_code_404=$(echo "$requeue_response_404" | head -n1)
  if [ "$requeue_code_404" != "404" ]; then
    fail "Expected 404 Not Found, got $requeue_code_404"
  fi
  ok "    Requeue rejected with 404 Not Found"

  log "  F3) Invalid body (should be 400)"
  local requeue_response_400
  requeue_response_400=$(
    api_curl POST "/admin/jobs/$FAILED_JOB_ID/requeue" \
      -H "Content-Type: application/json" \
      -d '{}'
  )
  local requeue_code_400
  requeue_code_400=$(echo "$requeue_response_400" | head -n1)
  if [ "$requeue_code_400" != "400" ]; then
    fail "Expected 400 Bad Request, got $requeue_code_400"
  fi
  ok "    Requeue rejected with 400 Bad Request"

  # End
  log ""
  echo "============================================================================"
  ok "All demo checks passed"
  echo "============================================================================"
}

main "$@"
