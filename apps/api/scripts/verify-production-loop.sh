#!/usr/bin/env bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
CYCLES="${CYCLES:-3}"
SLEEP_BETWEEN_CYCLES_SECONDS="${SLEEP_BETWEEN_CYCLES_SECONDS:-2}"
VERIFY_PRODUCTION_LOOP_REPORT_PATH="${VERIFY_PRODUCTION_LOOP_REPORT_PATH:-}"
TMP_REPORT_DIR="$(mktemp -d)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMPLETED_CYCLES=0

write_loop_report() {
  local status="$1"
  local error_message="${2:-}"
  local failed_cycle="${3:-}"
  if [ -z "$VERIFY_PRODUCTION_LOOP_REPORT_PATH" ]; then
    return
  fi
  REPORT_STATUS="$status" \
  REPORT_ERROR_MESSAGE="$error_message" \
  REPORT_FAILED_CYCLE="$failed_cycle" \
  REPORT_STARTED_AT="$STARTED_AT" \
  REPORT_FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  REPORT_CYCLES_TARGET="$CYCLES" \
  REPORT_CYCLES_COMPLETED="$COMPLETED_CYCLES" \
  REPORT_DIR="$TMP_REPORT_DIR" \
  REPORT_OUTPUT="$VERIFY_PRODUCTION_LOOP_REPORT_PATH" \
  node -e '
const fs = require("fs");
const path = require("path");
const dir = process.env.REPORT_DIR;
const files = fs
  .readdirSync(dir)
  .filter((name) => /^cycle-\d+\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const results = files.map((name) => {
  const cycle = Number(name.match(/\d+/)[0]);
  const report = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  return { cycle, ...report };
});
const payload = {
  generatedAt: new Date().toISOString(),
  startedAt: process.env.REPORT_STARTED_AT,
  finishedAt: process.env.REPORT_FINISHED_AT,
  cycles: Number(process.env.REPORT_CYCLES_TARGET),
  completedCycles: Number(process.env.REPORT_CYCLES_COMPLETED),
  status: process.env.REPORT_STATUS,
  failedCycle: process.env.REPORT_FAILED_CYCLE ? Number(process.env.REPORT_FAILED_CYCLE) : null,
  error: process.env.REPORT_ERROR_MESSAGE || null,
  results,
};
fs.writeFileSync(process.env.REPORT_OUTPUT, JSON.stringify(payload, null, 2));
'
}

cleanup() {
  rm -rf "$TMP_REPORT_DIR"
}
trap cleanup EXIT

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]] || [ "$CYCLES" -lt 1 ]; then
  echo "[verify:production:loop] ERRO: CYCLES inválido: $CYCLES" >&2
  write_loop_report "failed" "CYCLES inválido: $CYCLES"
  exit 1
fi

for cycle in $(seq 1 "$CYCLES"); do
  echo "[verify:production:loop] ciclo $cycle/$CYCLES iniciado."
  cycle_report="$TMP_REPORT_DIR/cycle-$cycle.json"
  if ! (
    cd "$WORKDIR"
    VERIFY_PRODUCTION_REPORT_PATH="$cycle_report" bash ./scripts/verify-production.sh
  ); then
    COMPLETED_CYCLES=$((cycle - 1))
    write_loop_report "failed" "ciclo $cycle falhou na execução de produção" "$cycle"
    exit 1
  fi
  if [ ! -s "$cycle_report" ]; then
    echo "[verify:production:loop] ERRO: relatório ausente para ciclo $cycle" >&2
    write_loop_report "failed" "relatório ausente para ciclo $cycle" "$cycle"
    exit 1
  fi
  COMPLETED_CYCLES="$cycle"
  echo "[verify:production:loop] ciclo $cycle/$CYCLES concluído."
  if [ "$cycle" -lt "$CYCLES" ]; then
    sleep "$SLEEP_BETWEEN_CYCLES_SECONDS"
  fi
done

if [ -n "$VERIFY_PRODUCTION_LOOP_REPORT_PATH" ]; then
  write_loop_report "passed"
  echo "[verify:production:loop] relatório JSON gerado em $VERIFY_PRODUCTION_LOOP_REPORT_PATH"
fi

echo "[verify:production:loop] SUCESSO: $CYCLES ciclos concluídos sem falhas."
