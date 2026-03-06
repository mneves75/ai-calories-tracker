#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://ai-cal-api.moltbotclubbrasil.workers.dev}"
AUTH_ATTEMPTS="${AUTH_ATTEMPTS:-20}"
ANALYZE_RETRIES="${ANALYZE_RETRIES:-8}"
ANALYZE_RETRY_SLEEP_SECONDS="${ANALYZE_RETRY_SLEEP_SECONDS:-3}"
TAIL_ENABLED="${TAIL_ENABLED:-1}"
ANALYZE_IMAGE_BASE64="${ANALYZE_IMAGE_BASE64:-}"
ANALYZE_FALLBACK_IMAGE_URL="${ANALYZE_FALLBACK_IMAGE_URL:-https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=256&q=30}"
VERIFY_PRODUCTION_REPORT_PATH="${VERIFY_PRODUCTION_REPORT_PATH:-}"
SMOKE_TIMEZONE="${SMOKE_TIMEZONE:-America/Sao_Paulo}"

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
TAIL_LOG="$TMP_DIR/wrangler-tail.log"
TAIL_PID=""
SCRIPT_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
AUTH_GATE_JSON="{}"
ANALYZE_CODE_SEQUENCE=""
ANALYZE_ATTEMPTS_EXECUTED=0
ANALYZE_SUCCESS=0

cleanup() {
  if [ -n "$TAIL_PID" ] && kill -0 "$TAIL_PID" >/dev/null 2>&1; then
    kill "$TAIL_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '[verify:production] %s\n' "$1"
}

fail() {
  local message="$1"
  maybe_write_report "failed" "$message"
  printf '[verify:production] ERRO: %s\n' "$message" >&2
  exit 1
}

maybe_write_report() {
  local status="$1"
  local error_message="${2:-}"
  if [ -z "$VERIFY_PRODUCTION_REPORT_PATH" ]; then
    return
  fi
  REPORT_STATUS="$status" \
  REPORT_ERROR_MESSAGE="$error_message" \
  SCRIPT_STARTED_AT="$SCRIPT_STARTED_AT" \
  BASE_URL="$BASE_URL" \
  AUTH_ATTEMPTS="$AUTH_ATTEMPTS" \
  ANALYZE_RETRIES="$ANALYZE_RETRIES" \
  ANALYZE_RETRY_SLEEP_SECONDS="$ANALYZE_RETRY_SLEEP_SECONDS" \
  AUTH_GATE_JSON="$AUTH_GATE_JSON" \
  ANALYZE_ATTEMPTS_EXECUTED="$ANALYZE_ATTEMPTS_EXECUTED" \
  ANALYZE_SUCCESS="$ANALYZE_SUCCESS" \
  ANALYZE_CODE_SEQUENCE="$ANALYZE_CODE_SEQUENCE" \
  VERIFY_PRODUCTION_REPORT_PATH="$VERIFY_PRODUCTION_REPORT_PATH" \
  node -e '
const fs = require("fs");
const report = {
  generatedAt: new Date().toISOString(),
  startedAt: process.env.SCRIPT_STARTED_AT,
  finishedAt: new Date().toISOString(),
  status: process.env.REPORT_STATUS,
  baseUrl: process.env.BASE_URL,
  authAttempts: Number(process.env.AUTH_ATTEMPTS),
  analyzeRetries: Number(process.env.ANALYZE_RETRIES),
  analyzeRetrySleepSeconds: Number(process.env.ANALYZE_RETRY_SLEEP_SECONDS),
  authGate: (() => {
    try { return JSON.parse(process.env.AUTH_GATE_JSON || "{}"); }
    catch { return { parseError: "invalid_auth_gate_json" }; }
  })(),
  analyze: {
    attemptsExecuted: Number(process.env.ANALYZE_ATTEMPTS_EXECUTED || "0"),
    success: process.env.ANALYZE_SUCCESS === "1",
    codeSequence: (process.env.ANALYZE_CODE_SEQUENCE || "")
      .split(",")
      .map((part) => Number(part))
      .filter((n) => Number.isInteger(n)),
  },
  error: process.env.REPORT_ERROR_MESSAGE || null,
};
fs.writeFileSync(process.env.VERIFY_PRODUCTION_REPORT_PATH, JSON.stringify(report, null, 2));
' || true
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: $1"
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

json_get() {
  local file="$1"
  local expression="$2"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const value=(function(){ return ${expression}; })(); process.stdout.write(value == null ? '' : String(value));" "$file"
}

start_tail() {
  if [ "$TAIL_ENABLED" != "1" ]; then
    return
  fi
  if ! command -v bunx >/dev/null 2>&1; then
    log "bunx não encontrado; tail desabilitado."
    return
  fi

  (
    cd "$WORKDIR"
    bunx wrangler tail ai-cal-api --format=pretty >"$TAIL_LOG" 2>&1 &
    echo $! >"$TMP_DIR/tail.pid"
  )
  sleep 5
  TAIL_PID="$(cat "$TMP_DIR/tail.pid")"
  log "tail iniciado (pid=$TAIL_PID)"
}

stop_tail() {
  if [ -n "$TAIL_PID" ] && kill -0 "$TAIL_PID" >/dev/null 2>&1; then
    kill "$TAIL_PID" >/dev/null 2>&1 || true
    sleep 1
    log "tail encerrado."
  fi
}

assert_tail_clean() {
  if [ "$TAIL_ENABLED" != "1" ] || [ ! -f "$TAIL_LOG" ]; then
    return
  fi

  local sanitized_tail="$TMP_DIR/wrangler-tail-sanitized.log"
  sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' "$TAIL_LOG" >"$sanitized_tail"

  if rg -n "1102|CPU time limit|Exceeded CPU Limit" "$sanitized_tail" >/dev/null 2>&1; then
    cat "$TAIL_LOG"
    fail "tail detectou erro de CPU limit (1102)"
  fi

  if rg -n --pcre2 "(--> POST /api/auth/sign-(in|up)/email\\s+500(?:\\s|$))|(POST https://[^ ]+/api/auth/sign-(in|up)/email - (?:500|Internal Server Error))" "$sanitized_tail" >/dev/null 2>&1; then
    cat "$TAIL_LOG"
    fail "tail detectou HTTP 500 em endpoints de autenticação"
  fi
}

run_auth_stability() {
  log "fase 1/2: stress de autenticação"

  local email="stability.$(date +%s)@example.com"
  local password='Stable123!'
  local signup_body="$TMP_DIR/auth-signup.json"
  local signup_code
  signup_code="$(http_code POST "$BASE_URL/api/auth/sign-up/email" "$signup_body" "{\"email\":\"$email\",\"password\":\"$password\",\"name\":\"Stability\"}")"

  [ "$signup_code" = "200" ] || fail "sign-up de estabilidade falhou (esperado 200, recebido $signup_code). body=$(cat "$signup_body")"

  local auth_attempts_file="$TMP_DIR/auth-attempts.csv"
  : >"$auth_attempts_file"
  local i
  for i in $(seq 1 "$AUTH_ATTEMPTS"); do
    local headers_file="$TMP_DIR/auth-login-$i.headers"
    local body_file="$TMP_DIR/auth-login-$i.json"
    local code
    code="$(curl -sS -D "$headers_file" -o "$body_file" -w '%{http_code}' -X POST "$BASE_URL/api/auth/sign-in/email" \
      -H 'content-type: application/json' \
      --data "{\"email\":\"$email\",\"password\":\"wrong-pass\"}")"
    local retry_after_candidate=""
    retry_after_candidate="$(awk 'tolower($1)=="retry-after:"{print $2}' "$headers_file" | tr -d '\r' | head -n 1)"
    printf '%s,%s\n' "$code" "$retry_after_candidate" >>"$auth_attempts_file"
    printf '[verify:production] auth tentativa %02d -> %s\n' "$i" "$code"
  done

  local gate_json
  if ! gate_json="$(node "$WORKDIR/scripts/verify-production-auth-gate.mjs" --json "$auth_attempts_file" 2>&1)"; then
    fail "stress de autenticação inválido: $gate_json"
  fi
  AUTH_GATE_JSON="$gate_json"

  local gate_summary
  gate_summary="$(node -e 'const r=JSON.parse(process.argv[1]); process.stdout.write(String(r.summary || ""));' "$AUTH_GATE_JSON")"

  log "stress de autenticação aprovado ($gate_summary)."
}

wait_auth_window_if_needed() {
  local probe_email="probe.$(date +%s)@example.com"
  local probe_body="$TMP_DIR/auth-window-probe.json"
  local headers_file="$TMP_DIR/auth-window-probe-headers.txt"
  local code

  code="$(curl -sS -D "$headers_file" -o "$probe_body" -w '%{http_code}' -X POST "$BASE_URL/api/auth/sign-in/email" \
    -H 'content-type: application/json' \
    --data "{\"email\":\"$probe_email\",\"password\":\"wrong-pass\"}")"

  if [ "$code" != "429" ]; then
    return
  fi

  local retry_after
  retry_after="$(awk 'tolower($1)=="retry-after:"{print $2}' "$headers_file" | tr -d '\r' | head -n 1)"
  if [ -z "$retry_after" ]; then
    retry_after=5
  fi

  log "janela de auth ainda bloqueada por execução anterior; aguardando ${retry_after}s."
  sleep $((retry_after + 1))
}

load_analyze_image_base64() {
  if [ -n "$ANALYZE_IMAGE_BASE64" ]; then
    printf '%s' "$ANALYZE_IMAGE_BASE64"
    return
  fi

  local fixture_file="$WORKDIR/scripts/fixtures/food-sample.base64"
  if [ -f "$fixture_file" ] && [ -s "$fixture_file" ]; then
    tr -d '\n' <"$fixture_file"
    return
  fi

  local image_path="$TMP_DIR/food.jpg"
  curl -sS -L "$ANALYZE_FALLBACK_IMAGE_URL" -o "$image_path"
  base64 <"$image_path" | tr -d '\n'
}

run_smoke() {
  log "fase 2/2: smoke ponta a ponta"

  local email="smoke.$(date +%s)@example.com"
  local password='Smoke123!'
  local today
  today="$(node "$WORKDIR/scripts/local-date-by-timezone.mjs" "$SMOKE_TIMEZONE")"
  local now_iso
  now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local signup_body="$TMP_DIR/smoke-signup.json"
  local signup_code
  signup_code="$(http_code POST "$BASE_URL/api/auth/sign-up/email" "$signup_body" "{\"email\":\"$email\",\"password\":\"$password\",\"name\":\"Smoke\"}")"
  [ "$signup_code" = "200" ] || fail "smoke sign-up falhou ($signup_code). body=$(cat "$signup_body")"

  local unauth_me_body="$TMP_DIR/smoke-me-unauth.json"
  local unauth_me_code
  unauth_me_code="$(http_code GET "$BASE_URL/api/users/me" "$unauth_me_body")"
  [ "$unauth_me_code" = "401" ] || fail "/api/users/me sem auth deveria retornar 401 ($unauth_me_code). body=$(cat "$unauth_me_body")"

  local token
  token="$(json_get "$signup_body" "data.token || data.data?.token")"
  [ -n "$token" ] || fail "token ausente no sign-up do smoke"

  local auth_header="authorization: Bearer $token"

  local me_body="$TMP_DIR/smoke-me.json"
  local me_code
  me_code="$(http_code GET "$BASE_URL/api/users/me" "$me_body" "" "$auth_header")"
  [ "$me_code" = "200" ] || fail "/api/users/me falhou ($me_code). body=$(cat "$me_body")"

  local onboarding_invalid_body="$TMP_DIR/smoke-onboarding-invalid.json"
  local onboarding_invalid_code
  onboarding_invalid_code="$(http_code POST "$BASE_URL/api/users/onboarding" "$onboarding_invalid_body" "{\"sex\":\"male\",\"birthDate\":\"1992-06-10\",\"heightCm\":178,\"weightKg\":82,\"activityLevel\":\"moderate\",\"goalType\":\"maintain\",\"timezone\":\"Invalid/Timezone\"}" "$auth_header")"
  [ "$onboarding_invalid_code" = "400" ] || fail "/api/users/onboarding inválido deveria retornar 400 ($onboarding_invalid_code). body=$(cat "$onboarding_invalid_body")"
  local onboarding_invalid_reason
  onboarding_invalid_reason="$(json_get "$onboarding_invalid_body" "data.code")"
  [ "$onboarding_invalid_reason" = "TIMEZONE_INVALID" ] || fail "/api/users/onboarding inválido deveria retornar TIMEZONE_INVALID, recebido=$onboarding_invalid_reason"

  local onboarding_body="$TMP_DIR/smoke-onboarding.json"
  local onboarding_code
  onboarding_code="$(http_code POST "$BASE_URL/api/users/onboarding" "$onboarding_body" "{\"sex\":\"male\",\"birthDate\":\"1992-06-10\",\"heightCm\":178,\"weightKg\":82,\"activityLevel\":\"moderate\",\"goalType\":\"maintain\",\"timezone\":\"$SMOKE_TIMEZONE\"}" "$auth_header")"
  [ "$onboarding_code" = "200" ] || fail "/api/users/onboarding falhou ($onboarding_code). body=$(cat "$onboarding_body")"

  local manual_body="$TMP_DIR/smoke-manual.json"
  local manual_code
  manual_code="$(http_code POST "$BASE_URL/api/meals/manual" "$manual_body" "{\"name\":\"Frango e arroz\",\"mealType\":\"lunch\",\"calories\":620,\"protein\":42,\"carbs\":58,\"fat\":18,\"localDate\":\"$today\",\"loggedAt\":\"$now_iso\"}" "$auth_header" "Idempotency-Key: smoke-manual-$(date +%s)")"
  [ "$manual_code" = "201" ] || fail "/api/meals/manual falhou ($manual_code). body=$(cat "$manual_body")"

  local meal_id
  meal_id="$(json_get "$manual_body" "data.meal && data.meal.id")"
  [ -n "$meal_id" ] || fail "meal.id ausente no cadastro manual"

  local dash1_body="$TMP_DIR/smoke-dash1.json"
  local dash1_code
  dash1_code="$(http_code GET "$BASE_URL/api/users/dashboard" "$dash1_body" "" "$auth_header")"
  [ "$dash1_code" = "200" ] || fail "dashboard (após insert) falhou ($dash1_code). body=$(cat "$dash1_body")"

  local dash1_meals
  dash1_meals="$(json_get "$dash1_body" "data.summary && data.summary.mealsCount")"
  local dash1_calories
  dash1_calories="$(json_get "$dash1_body" "data.summary && data.summary.totalCalories")"
  [ "$dash1_meals" = "1" ] || fail "dashboard mealsCount esperado=1, recebido=$dash1_meals"
  [ "${dash1_calories:-0}" != "0" ] || fail "dashboard totalCalories esperado>0, recebido=$dash1_calories"

  local history_body="$TMP_DIR/smoke-history.json"
  local history_code
  history_code="$(http_code GET "$BASE_URL/api/meals/history" "$history_body" "" "$auth_header")"
  [ "$history_code" = "200" ] || fail "/api/meals/history falhou ($history_code). body=$(cat "$history_body")"

  local delete_body="$TMP_DIR/smoke-delete.json"
  local delete_code
  delete_code="$(http_code DELETE "$BASE_URL/api/meals/$meal_id" "$delete_body" "" "$auth_header")"
  [ "$delete_code" = "200" ] || fail "delete meal falhou ($delete_code). body=$(cat "$delete_body")"

  local dash2_body="$TMP_DIR/smoke-dash2.json"
  local dash2_code
  dash2_code="$(http_code GET "$BASE_URL/api/users/dashboard" "$dash2_body" "" "$auth_header")"
  [ "$dash2_code" = "200" ] || fail "dashboard (após delete) falhou ($dash2_code). body=$(cat "$dash2_body")"

  local dash2_meals
  dash2_meals="$(json_get "$dash2_body" "data.summary && data.summary.mealsCount")"
  local dash2_calories
  dash2_calories="$(json_get "$dash2_body" "data.summary && data.summary.totalCalories")"
  [ "$dash2_meals" = "0" ] || fail "dashboard mealsCount esperado=0 após delete, recebido=$dash2_meals"
  [ "${dash2_calories:-1}" = "0" ] || fail "dashboard totalCalories esperado=0 após delete, recebido=$dash2_calories"

  local image_b64
  image_b64="$(load_analyze_image_base64)"

  local analyze_success=0
  local analyze_i
  for analyze_i in $(seq 1 "$ANALYZE_RETRIES"); do
    local analyze_body="$TMP_DIR/smoke-analyze-$analyze_i.json"
    local analyze_code
    analyze_code="$(http_code POST "$BASE_URL/api/meals/analyze" "$analyze_body" "{\"imageBase64\":\"$image_b64\",\"mealType\":\"lunch\",\"localDate\":\"$today\"}" "$auth_header")"
    ANALYZE_ATTEMPTS_EXECUTED="$analyze_i"
    if [ -z "$ANALYZE_CODE_SEQUENCE" ]; then
      ANALYZE_CODE_SEQUENCE="$analyze_code"
    else
      ANALYZE_CODE_SEQUENCE="$ANALYZE_CODE_SEQUENCE,$analyze_code"
    fi
    printf '[verify:production] analyze tentativa %02d -> %s\n' "$analyze_i" "$analyze_code"
    if [ "$analyze_code" = "200" ]; then
      analyze_success=1
      break
    fi

    local analyze_error_code
    analyze_error_code="$(json_get "$analyze_body" "data.code || null")"
    if [ "$analyze_error_code" = "MEDIA_STORAGE_UNAVAILABLE" ]; then
      fail "análise IA bloqueada por MEDIA_STORAGE_UNAVAILABLE; verifique binding R2 no Worker/conta Cloudflare"
    fi

    if [ "$analyze_i" -lt "$ANALYZE_RETRIES" ]; then
      local backoff_seconds=$((ANALYZE_RETRY_SLEEP_SECONDS * analyze_i))
      if [ "$backoff_seconds" -gt 20 ]; then
        backoff_seconds=20
      fi
      sleep "$backoff_seconds"
    fi
  done

  if [ "$analyze_success" != "1" ]; then
    local last_analyze_body="$TMP_DIR/smoke-analyze-$ANALYZE_RETRIES.json"
    fail "análise IA não retornou 200 após $ANALYZE_RETRIES tentativas. body=$(cat "$last_analyze_body")"
  fi
  ANALYZE_SUCCESS=1
  log "smoke ponta a ponta aprovado."
}

main() {
  require_cmd curl
  require_cmd node
  require_cmd rg
  require_cmd base64

  log "iniciando verificação de produção em $BASE_URL"
  start_tail
  wait_auth_window_if_needed
  run_auth_stability
  run_smoke
  stop_tail
  assert_tail_clean
  maybe_write_report "passed" ""
  if [ -n "$VERIFY_PRODUCTION_REPORT_PATH" ]; then
    log "relatório JSON gerado em $VERIFY_PRODUCTION_REPORT_PATH"
  fi
  log "SUCESSO: verificação de produção concluída sem falhas."
  if [ -n "$VERIFY_PRODUCTION_REPORT_PATH" ]; then
    printf 'VERIFY_PRODUCTION_SUMMARY_JSON=%s\n' "$(node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(JSON.stringify(data));' "$VERIFY_PRODUCTION_REPORT_PATH")"
  fi
}

main "$@"
