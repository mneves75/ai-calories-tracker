#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://ai-cal-api.moltbotclubbrasil.workers.dev}"
AUTH_ATTEMPTS="${AUTH_ATTEMPTS:-20}"
ANALYZE_RETRIES="${ANALYZE_RETRIES:-5}"
ANALYZE_RETRY_SLEEP_SECONDS="${ANALYZE_RETRY_SLEEP_SECONDS:-2}"
TAIL_ENABLED="${TAIL_ENABLED:-1}"
ANALYZE_IMAGE_BASE64="${ANALYZE_IMAGE_BASE64:-}"
ANALYZE_FALLBACK_IMAGE_URL="${ANALYZE_FALLBACK_IMAGE_URL:-https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=256&q=30}"

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
TAIL_LOG="$TMP_DIR/wrangler-tail.log"
TAIL_PID=""

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
  printf '[verify:production] ERRO: %s\n' "$1" >&2
  exit 1
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

  if rg -n "1102|CPU time limit|Exceeded CPU Limit" "$TAIL_LOG" >/dev/null 2>&1; then
    cat "$TAIL_LOG"
    fail "tail detectou erro de CPU limit (1102)"
  fi

  if rg -n "auth/sign-(in|up).* 500" "$TAIL_LOG" >/dev/null 2>&1; then
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

  local count_401=0
  local count_429=0
  local count_other=0
  local i
  for i in $(seq 1 "$AUTH_ATTEMPTS"); do
    local body_file="$TMP_DIR/auth-login-$i.json"
    local code
    code="$(http_code POST "$BASE_URL/api/auth/sign-in/email" "$body_file" "{\"email\":\"$email\",\"password\":\"wrong-pass\"}")"
    case "$code" in
      401) count_401=$((count_401 + 1)) ;;
      429) count_429=$((count_429 + 1)) ;;
      *) count_other=$((count_other + 1)) ;;
    esac
    printf '[verify:production] auth tentativa %02d -> %s\n' "$i" "$code"
  done

  [ "$count_401" -ge 1 ] || fail "nenhuma resposta 401 recebida no stress de auth"
  [ "$count_429" -ge 1 ] || fail "nenhuma resposta 429 recebida no stress de auth"
  [ "$count_other" -eq 0 ] || fail "respostas inesperadas no stress de auth: $count_other"

  local headers_file="$TMP_DIR/auth-rate-limit-headers.txt"
  curl -sS -D "$headers_file" -o /dev/null -X POST "$BASE_URL/api/auth/sign-in/email" \
    -H 'content-type: application/json' \
    --data "{\"email\":\"$email\",\"password\":\"wrong-pass\"}"

  if ! rg -qi '^retry-after:' "$headers_file"; then
    fail "header Retry-After não encontrado na resposta de bloqueio auth"
  fi

  log "stress de autenticação aprovado (401 + 429 + Retry-After)."
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
  today="$(date -u +%Y-%m-%d)"
  local now_iso
  now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local signup_body="$TMP_DIR/smoke-signup.json"
  local signup_code
  signup_code="$(http_code POST "$BASE_URL/api/auth/sign-up/email" "$signup_body" "{\"email\":\"$email\",\"password\":\"$password\",\"name\":\"Smoke\"}")"
  [ "$signup_code" = "200" ] || fail "smoke sign-up falhou ($signup_code). body=$(cat "$signup_body")"

  local token
  token="$(json_get "$signup_body" "data.token || data.data?.token")"
  [ -n "$token" ] || fail "token ausente no sign-up do smoke"

  local auth_header="authorization: Bearer $token"

  local me_body="$TMP_DIR/smoke-me.json"
  local me_code
  me_code="$(http_code GET "$BASE_URL/api/users/me" "$me_body" "" "$auth_header")"
  [ "$me_code" = "200" ] || fail "/api/users/me falhou ($me_code). body=$(cat "$me_body")"

  local onboarding_body="$TMP_DIR/smoke-onboarding.json"
  local onboarding_code
  onboarding_code="$(http_code POST "$BASE_URL/api/users/onboarding" "$onboarding_body" "{\"sex\":\"male\",\"birthDate\":\"1992-06-10\",\"heightCm\":178,\"weightKg\":82,\"activityLevel\":\"moderate\",\"goalType\":\"maintain\",\"timezone\":\"America/Sao_Paulo\"}" "$auth_header")"
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
    printf '[verify:production] analyze tentativa %02d -> %s\n' "$analyze_i" "$analyze_code"
    if [ "$analyze_code" = "200" ]; then
      analyze_success=1
      break
    fi
    sleep "$ANALYZE_RETRY_SLEEP_SECONDS"
  done

  [ "$analyze_success" = "1" ] || fail "análise IA não retornou 200 após $ANALYZE_RETRIES tentativas"
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
  log "SUCESSO: verificação de produção concluída sem falhas."
}

main "$@"
