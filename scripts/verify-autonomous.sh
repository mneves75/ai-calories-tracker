#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CYCLES="${CYCLES:-3}"
EVIDENCE_DIR="$ROOT_DIR/.planning/evidence"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$EVIDENCE_DIR/verify-autonomous-$TIMESTAMP.log"

mkdir -p "$EVIDENCE_DIR"

log() {
  printf '[verify:autonomous] %s\n' "$1" | tee -a "$LOG_FILE"
}

run_logged() {
  local description="$1"
  shift
  log "$description"
  "$@" 2>&1 | tee -a "$LOG_FILE"
}

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]] || [ "$CYCLES" -lt 1 ]; then
  echo "[verify:autonomous] ERRO: CYCLES inválido: $CYCLES" >&2
  exit 1
fi

log "início do gate autônomo (cycles=$CYCLES)"
run_logged "fase 1/2: verificação local (api + mobile)" bun run verify
run_logged "fase 2/2: loop de produção" bash -lc "cd \"$ROOT_DIR/apps/api\" && CYCLES=$CYCLES bun run verify:production:loop"
log "SUCESSO: gate autônomo concluído. evidência=$LOG_FILE"
