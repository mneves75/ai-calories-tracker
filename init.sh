#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/apps/mobile"
SIM_DEVICE="${SIM_DEVICE:-iPhone 16}"
SKIP_APP_RUN="${SKIP_APP_RUN:-0}"

log() {
  printf '[init] %s\n' "$1"
}

fail() {
  printf '[init] ERRO: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: $1"
}

require_cmd bun
require_cmd node
require_cmd open
require_cmd xcrun

[ -d "$APP_DIR" ] || fail "diretório do app não encontrado: $APP_DIR"

log "abrindo iOS Simulator..."
open -a Simulator

DEVICE_JSON="$(xcrun simctl list devices --json)"

BOOTED_UDID="$(printf '%s' "$DEVICE_JSON" | node -e '
  const fs = require("fs");
  const raw = fs.readFileSync(0, "utf8");
  const data = JSON.parse(raw);
  const devices = Object.values(data.devices ?? {}).flat();
  const booted = devices.find((d) => d.state === "Booted");
  process.stdout.write(booted?.udid ?? "");
')"

TARGET_UDID="$BOOTED_UDID"
TARGET_NAME=""

if [ -z "$TARGET_UDID" ]; then
  TARGET_INFO="$(printf '%s' "$DEVICE_JSON" | node -e '
    const fs = require("fs");
    const wanted = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    const data = JSON.parse(raw);
    const devices = Object.values(data.devices ?? {}).flat();
    const available = devices.filter((d) => d.isAvailable !== false && !d.availabilityError);
    const exact = available.find((d) => d.name === wanted);
    const firstIphone = available.find((d) => d.name.includes("iPhone"));
    const selected = exact ?? firstIphone ?? available[0];
    if (!selected) process.exit(1);
    process.stdout.write(`${selected.udid}|${selected.name}`);
  ' "$SIM_DEVICE")" || fail "nenhum simulador iOS disponível"

  TARGET_UDID="${TARGET_INFO%%|*}"
  TARGET_NAME="${TARGET_INFO#*|}"

  log "bootando simulador: $TARGET_NAME ($TARGET_UDID)"
  xcrun simctl boot "$TARGET_UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$TARGET_UDID" -b
else
  TARGET_NAME="$(printf '%s' "$DEVICE_JSON" | node -e '
    const fs = require("fs");
    const wanted = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    const data = JSON.parse(raw);
    const devices = Object.values(data.devices ?? {}).flat();
    const device = devices.find((d) => d.udid === wanted);
    process.stdout.write(device?.name ?? "Booted Device");
  ' "$TARGET_UDID")"
  log "simulador já bootado: $TARGET_NAME ($TARGET_UDID)"
fi

if [ "$SKIP_APP_RUN" = "1" ]; then
  log "SKIP_APP_RUN=1 definido; pulando execução do app."
  exit 0
fi

log "iniciando app no simulador..."
cd "$APP_DIR"
bun run ios
