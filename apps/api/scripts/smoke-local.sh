#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PORT="${PORT:-8799}"
BASE_URL="http://127.0.0.1:${PORT}"
DEV_LOG="$TMP_DIR/wrangler-dev.log"
DEV_PID=""
TEMP_DEV_VARS_CREATED=0

cleanup() {
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
  if [ "$TEMP_DEV_VARS_CREATED" = "1" ] && [ -f "$ROOT_DIR/.dev.vars" ]; then
    rm -f "$ROOT_DIR/.dev.vars"
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '[smoke:local] %s\n' "$1"
}

fail() {
  printf '[smoke:local] ERRO: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: $1"
}

json_get() {
  local file="$1"
  local expression="$2"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const value=(function(){ return ${expression}; })(); process.stdout.write(value == null ? '' : String(value));" "$file"
}

http_code() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  local data="${4:-}"
  local auth_header="${5:-}"
  local extra_header="${6:-}"

  local cmd=(curl -sS -o "$body_file" -w '%{http_code}' -X "$method" "$url")
  if [ -n "$auth_header" ]; then
    cmd+=(-H "$auth_header")
  fi
  if [ -n "$extra_header" ]; then
    cmd+=(-H "$extra_header")
  fi
  if [ -n "$data" ]; then
    cmd+=(-H 'content-type: application/json' --data "$data")
  fi

  "${cmd[@]}"
}

wait_for_server() {
  local retries=60
  local i
  for i in $(seq 1 "$retries"); do
    if curl -sS "$BASE_URL/health" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  tail -n 120 "$DEV_LOG" || true
  fail "servidor local não respondeu em ${retries}s"
}

ensure_dev_vars() {
  if [ -f "$ROOT_DIR/.dev.vars" ]; then
    return
  fi

  TEMP_DEV_VARS_CREATED=1
  cat > "$ROOT_DIR/.dev.vars" <<'VARS'
GEMINI_API_KEY=test-key
BETTER_AUTH_SECRET=test-secret-local-123456
VARS
}

require_cmd bunx
require_cmd curl
require_cmd node

ensure_dev_vars

log "aplicando migrações D1 local"
(
  cd "$ROOT_DIR"
  bunx wrangler d1 migrations apply ai-cal-db --local >/dev/null
)

log "subindo worker local na porta ${PORT}"
(
  cd "$ROOT_DIR"
  bunx wrangler dev --local --port "$PORT" --ip 127.0.0.1 >"$DEV_LOG" 2>&1 &
  echo $! > "$TMP_DIR/dev.pid"
)
DEV_PID="$(cat "$TMP_DIR/dev.pid")"

wait_for_server

log "executando smoke ponta a ponta local"
email="smoke.local.$(date +%s)@example.com"
password='Smoke123!'
today="$(date -u +%Y-%m-%d)"

signup_body="$TMP_DIR/signup.json"
signup_code="$(http_code POST "$BASE_URL/api/auth/sign-up/email" "$signup_body" "{\"email\":\"$email\",\"password\":\"$password\",\"name\":\"Smoke Local\"}")"
[ "$signup_code" = "200" ] || fail "sign-up falhou ($signup_code). body=$(cat "$signup_body")"

token="$(json_get "$signup_body" "data.token || data.data?.token")"
[ -n "$token" ] || fail "token ausente no sign-up"

auth_header="authorization: Bearer $token"

onboarding_body="$TMP_DIR/onboarding.json"
onboarding_code="$(http_code POST "$BASE_URL/api/users/onboarding" "$onboarding_body" "{\"sex\":\"male\",\"birthDate\":\"1992-06-10\",\"heightCm\":178,\"weightKg\":82,\"activityLevel\":\"moderate\",\"goalType\":\"maintain\",\"timezone\":\"America/Sao_Paulo\"}" "$auth_header")"
[ "$onboarding_code" = "200" ] || fail "onboarding falhou ($onboarding_code). body=$(cat "$onboarding_body")"

manual_body="$TMP_DIR/manual.json"
manual_code="$(http_code POST "$BASE_URL/api/meals/manual" "$manual_body" "{\"name\":\"Frango e arroz\",\"mealType\":\"lunch\",\"calories\":620,\"protein\":42,\"carbs\":58,\"fat\":18,\"localDate\":\"$today\"}" "$auth_header" "Idempotency-Key: smoke-local-manual-$(date +%s)")"
[ "$manual_code" = "201" ] || fail "manual falhou ($manual_code). body=$(cat "$manual_body")"

meal_id="$(json_get "$manual_body" "data.meal?.id")"
[ -n "$meal_id" ] || fail "meal.id ausente na criação manual"

dash_body="$TMP_DIR/dashboard.json"
dash_code="$(http_code GET "$BASE_URL/api/users/dashboard" "$dash_body" "" "$auth_header")"
[ "$dash_code" = "200" ] || fail "dashboard falhou ($dash_code). body=$(cat "$dash_body")"

delete_body="$TMP_DIR/delete.json"
delete_code="$(http_code DELETE "$BASE_URL/api/meals/$meal_id" "$delete_body" "" "$auth_header")"
[ "$delete_code" = "200" ] || fail "delete falhou ($delete_code). body=$(cat "$delete_body")"

log "smoke local aprovado"
