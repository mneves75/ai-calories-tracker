#!/usr/bin/env bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
CYCLES="${CYCLES:-3}"
SLEEP_BETWEEN_CYCLES_SECONDS="${SLEEP_BETWEEN_CYCLES_SECONDS:-2}"

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]] || [ "$CYCLES" -lt 1 ]; then
  echo "[verify:production:loop] ERRO: CYCLES inválido: $CYCLES" >&2
  exit 1
fi

for cycle in $(seq 1 "$CYCLES"); do
  echo "[verify:production:loop] ciclo $cycle/$CYCLES iniciado."
  (
    cd "$WORKDIR"
    bash ./scripts/verify-production.sh
  )
  echo "[verify:production:loop] ciclo $cycle/$CYCLES concluído."
  if [ "$cycle" -lt "$CYCLES" ]; then
    sleep "$SLEEP_BETWEEN_CYCLES_SECONDS"
  fi
done

echo "[verify:production:loop] SUCESSO: $CYCLES ciclos concluídos sem falhas."
