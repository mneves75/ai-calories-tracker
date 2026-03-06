#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CYCLES="${CYCLES:-3}"
EVIDENCE_DIR="$ROOT_DIR/.planning/evidence"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_FILE="$EVIDENCE_DIR/verify-autonomous-$TIMESTAMP.log"
LOOP_JSON_FILE="$EVIDENCE_DIR/verify-production-loop-$TIMESTAMP.json"
JSON_FILE="$EVIDENCE_DIR/verify-autonomous-$TIMESTAMP.json"
CURRENT_PHASE="bootstrap"

mkdir -p "$EVIDENCE_DIR"

log() {
  printf '[verify:autonomous] %s\n' "$1" | tee -a "$LOG_FILE"
}

write_report() {
  local status="$1"
  local error_message="${2:-}"
  AUTONOMOUS_STATUS="$status" \
  AUTONOMOUS_ERROR="$error_message" \
  AUTONOMOUS_STARTED_AT="$STARTED_AT" \
  AUTONOMOUS_FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  AUTONOMOUS_PHASE="$CURRENT_PHASE" \
  CYCLES="$CYCLES" \
  LOG_FILE="$LOG_FILE" \
  LOOP_JSON_FILE="$LOOP_JSON_FILE" \
  JSON_FILE="$JSON_FILE" \
  node -e '
const fs = require("fs");
const loopFile = process.env.LOOP_JSON_FILE;
const report = {
  generatedAt: new Date().toISOString(),
  startedAt: process.env.AUTONOMOUS_STARTED_AT,
  finishedAt: process.env.AUTONOMOUS_FINISHED_AT,
  status: process.env.AUTONOMOUS_STATUS,
  cycles: Number(process.env.CYCLES),
  phase: process.env.AUTONOMOUS_PHASE,
  logFile: process.env.LOG_FILE,
  productionLoopReportFile: fs.existsSync(loopFile) ? loopFile : null,
  localVerifyCommand: "bun run check-all",
  productionLoopCommand: "cd apps/api && CYCLES=<n> bun run verify:production:loop",
  error: process.env.AUTONOMOUS_ERROR || null,
};
fs.writeFileSync(process.env.JSON_FILE, JSON.stringify(report, null, 2));
'
}

fail() {
  local message="$1"
  log "ERRO: $message"
  write_report "failed" "$message"
  log "ERRO: relatório JSON autônomo gerado em $JSON_FILE"
  exit 1
}

run_logged() {
  local description="$1"
  shift
  CURRENT_PHASE="$description"
  log "$description"
  if ! "$@" 2>&1 | tee -a "$LOG_FILE"; then
    fail "falha na etapa: $description"
  fi
}

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]] || [ "$CYCLES" -lt 1 ]; then
  fail "CYCLES inválido: $CYCLES"
fi

log "início do gate autônomo (cycles=$CYCLES)"
run_logged "fase 1/2: verificação local completa (lint + verify + doctor + build + smoke)" bun run check-all
run_logged "fase 2/2: loop de produção" bash -lc "cd \"$ROOT_DIR/apps/api\" && CYCLES=$CYCLES VERIFY_PRODUCTION_LOOP_REPORT_PATH=\"$LOOP_JSON_FILE\" bun run verify:production:loop"
CURRENT_PHASE="completed"
write_report "passed"
log "SUCESSO: gate autônomo concluído. evidência=$LOG_FILE"
log "SUCESSO: relatório JSON autônomo gerado em $JSON_FILE"
