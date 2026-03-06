# Plano Ultrawork — Versão Elegante (2026-03-03)

## Objetivo
Elevar a implementação para padrão de mercado com foco em correção, idempotência, segurança fail-closed e verificação operacional contínua.

## Abordagem de mercado adotada
- Idempotência em operações de escrita via `Idempotency-Key` + hash de payload.
- Semântica temporal consistente por `localDate` no fluxo de análise.
- Hardening de API e cliente com defaults fail-closed.
- Regressões automatizadas para blindar os riscos críticos.
- Contrato de erro padronizado por `application/problem+json` (RFC 9457) para fluxos críticos.

Referências:
- IETF draft `Idempotency-Key`: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
- Stripe (padrão prático): https://docs.stripe.com/api/idempotent_requests
- RFC 9110 (idempotência): https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
- RFC 9457 (`application/problem+json`): https://www.rfc-editor.org/rfc/rfc9457
- RFC 6585 (`429 Too Many Requests`): https://www.rfc-editor.org/rfc/rfc6585#section-4

## O que foi implementado

### Atualização Elegante v4 (Carmack-grade closure)
1. Replay idempotente estrito em `POST /api/meals/manual`:
- resposta de replay usa **exatamente** `response_status` e `response_body` persistidos;
- remoção de coerção de status (`200|201`) e de reconstrução implícita por `meal_id`;
- registro inconsistente agora falha fechado com `409 IDEMPOTENCY_KEY_STALE`.

2. Contrato `application/problem+json` consumido no mobile:
- parser do cliente agora aceita `application/problem+json` (e demais `*json`);
- `ApiError.body.code` e campos RFC 9457 são preservados para mapeamento seguro de UX.

3. Token de mídia com consumo de uso único:
- validação de `analysisToken` bloqueia status `attached` (além de `pending_delete/delete_failed/deleted`);
- `attachMediaToMeal` só efetiva quando status atual é `uploaded` (fail-closed para replay).

4. Regressões novas adicionadas:
- replay estrito de idempotência + stale inconsistente;
- `problem+json` no cliente mobile + caminho de timeout (`AbortError`);
- branches fail-closed de mídia (`analysisToken` sem `imageKey`, token já anexado);
- dependências críticas de análise (`GEMINI_API_KEY`/`R2`) e falha de reserva idempotente;
- cobertura ampliada de headers globais e HSTS em produção.

### Atualização Elegante v5 (autonomous hardening)
1. Cobertura de segurança/autenticação ampliada:
- teste dedicado de `authMiddleware` para `401` sem sessão e caminho com sessão válida;
- limiter de auth validado também em `POST /api/auth/sign-up/email`.

2. Invariantes operacionais reforçadas:
- smoke local e produção agora validam fail-closed para timezone inválido (`TIMEZONE_INVALID`);
- assert de TTL idempotente (24h) no caminho de reserva em `/api/meals/manual`.

3. Diagnóstico fail-fast em produção:
- `verify-production.sh` valida fail-fast de storage quando aplicável e mantém `/analyze` operando em modo degradado quando `R2` não está disponível.

4. Hardening adicional de lifecycle de mídia:
- `markMealMediaForDeletion` usa fallback com `upsert` (`ON CONFLICT(image_key) DO UPDATE`) para evitar conflito em estado driftado;
- cobertura de GC expandida para reattach, exceção de delete, recuperação de `delete_failed` e fallback de env inválida.

### Atualização Elegante v6 (deterministic auth gate)
1. Verificador de produção reestruturado para regra determinística testável:
- extraído avaliador dedicado em `apps/api/scripts/verify-production-auth-gate.mjs`;
- `verify-production.sh` agora valida stress de auth via artefato de tentativas (`code,retry-after`) e decisão centralizada.

2. Invariante alinhado a padrão HTTP para `429`:
- remoção da suposição frágil de que a **última** tentativa precisa retornar `429`;
- validação robusta passa a exigir o que importa operacionalmente: presença de `401` + `429`, ausência de códigos inesperados e `Retry-After` numérico positivo em pelo menos uma resposta `429`.

3. Regressões adicionadas para o gate:
- novo arquivo `apps/api/scripts/verify-production-auth-gate.test.mjs` cobrindo cenário de recuperação de janela (tentativa final `401`), ausência de `429`, ausência de `401`, códigos inesperados e `Retry-After` inválido.

### Atualização Elegante v7 (artefatos JSON determinísticos)
1. Gate de auth exportável:
- `verify-production-auth-gate.mjs` agora suporta `--json` para saída estruturada e uso em pipeline.

2. Relatório por execução de produção:
- `verify-production.sh` agora gera sumário JSON opcional com:
  - resultado do gate de auth,
  - sequência de códigos do `/api/meals/analyze`,
  - timestamps de início/fim e status final.

3. Relatório agregado por ciclo:
- `verify-production-loop.sh` agrega resultados de todos os ciclos em um JSON único (`status`, `cycles`, `results[]`).

4. Relatório final autônomo:
- `verify-autonomous.sh` passa a gerar também um JSON de fechamento apontando para o log textual e para o relatório agregado de produção.

### Atualização Elegante v8 (runner iOS determinístico com Metro local)
1. `init.sh` estabilizado para execução não-interativa:
- quando `8081` já está ocupado por Metro do próprio projeto, execução usa `expo run:ios --no-bundler`;
- removida ambiguidade de porta que podia provocar prompt não-interativo.

2. Verificação de regressão pós-ajuste:
- `./init.sh` permanece verde com Metro local ativo;
- `bun run check-all` + `CYCLES=3 bun run verify:autonomous` reexecutados verdes após patch.

### Atualização Elegante v9 (relatórios de falha determinísticos)
1. `verify-autonomous.sh` fail-safe:
- agora gera JSON também em falha, incluindo `status`, `phase`, `error`, `startedAt/finishedAt` e referência condicional ao relatório de produção.

2. `verify-production-loop.sh` fail-safe:
- agora gera relatório agregado mesmo em falha, com `completedCycles`, `failedCycle`, `error` e `results[]` parciais quando aplicável.

3. Validação de caminho de falha:
- `CYCLES=0 bun run verify:autonomous` gera JSON com `status=failed`;
- `BASE_URL=http://127.0.0.1:1` no loop de produção gera JSON com `status=failed` e `failedCycle=1`.

### Atualização Elegante v2 (Carmack-grade)
1. `POST /api/meals/manual` evoluído para **idempotência stateful**:
- estados `in_progress`/`completed`;
- replay exato de status/body original;
- `Idempotency-Replayed: true` em replay;
- conflito de payload com `422` (`problem+json`);
- `Retry-After` para requisição em progresso.

2. Persistência de idempotência reforçada:
- migração `0007_idempotency_response_replay.sql`;
- colunas `state`, `response_status`, `response_body`, `updated_at`, `expires_at`;
- TTL de 24h para chaves de idempotência.

3. Manutenção agendada:
- novo GC de idempotência expiradas no `scheduled` handler (`purgeExpiredMealIdempotencyKeys`).

4. Contrato de erro alinhado a padrão:
- helper `problem()` com `application/problem+json` + campos legados para compatibilidade do app mobile.

### Atualização Elegante v3 (operability hardening)
1. `/health` com semântica operacional explícita:
- checks independentes para `mediaGc` e `idempotency`;
- estado degradado agora retorna `503` com payload estruturado de checks.

2. `scheduled` desacoplado por tarefa:
- manutenção de idempotência e media GC executadas de forma independente;
- falhas pontuais não interrompem o ciclo inteiro;
- logs estruturados por tarefa para diagnóstico (`MAINTENANCE_TASK_FAILED`, `MAINTENANCE_CYCLE_PARTIAL_FAILURE`).

3. Parsing de env robusto/fail-safe:
- thresholds inválidos agora usam fallback seguro com log explícito (`INVALID_ENV_VALUE`);
- aplicado em idempotência e media GC.

4. Robustez de agregação idempotente:
- normalização de janela `staleInProgressMs` inválida;
- coerção de contadores inválidos/nulos para `0`.

### Backend (API)
1. `POST /api/meals/manual` agora exige `Idempotency-Key`:
- replay consistente para mesma chave + mesmo payload;
- `422` para mesma chave + payload diferente (problema semântico);
- reserva/commit de chave com persistência em D1.

2. `/api/meals/analyze` passou a usar `localDate` do cliente (com fallback seguro):
- quota e resposta alinhadas ao dia lógico da refeição.

3. Hardening de headers globais:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

4. Migração D1 adicionada:
- tabela `meal_idempotency_keys`;
- índice composto em `meals(user_id, local_date, deleted_at, logged_at)`.

### Mobile
1. Cliente HTTP fail-closed:
- valida `EXPO_PUBLIC_API_BASE_URL`;
- exige HTTPS fora de hosts locais.

2. Timeout e cancelamento de request:
- `AbortController` + timeout padrão.

3. Gravação de refeição com idempotência:
- `operationId` por ação;
- envio em header `Idempotency-Key`.

4. Correção de UX:
- CTA premium no histórico sem ação nula (feedback explícito de “em desenvolvimento”).

## Testes e evidências

### Local
- `bun run verify`:
  - API: `75` testes, `0` falhas.
  - Mobile: `30` testes, `0` falhas.

### Produção (loop autônomo)
- `CYCLES=1 bun run verify:autonomous`:
  - stress auth com `401` + `429` + `Retry-After`;
  - smoke ponta a ponta aprovado;
  - `/api/meals/analyze` com `200`.
- `CYCLES=3 bun run verify:autonomous`:
  - 3 ciclos consecutivos aprovados em produção;
  - artefatos estruturados JSON gerados com `authGate` + `analyze.codeSequence`.

Evidências:
- `.planning/evidence/verify-autonomous-20260303T191229Z.log`
- `.planning/evidence/verify-autonomous-20260303T191554Z.log`
- `.planning/evidence/verify-autonomous-20260303T233528Z.log`
- `.planning/evidence/verify-autonomous-20260303T234517Z.log`
- `.planning/evidence/verify-autonomous-20260303T235718Z.log`
- `.planning/evidence/verify-autonomous-20260304T001253Z.log`
- `.planning/evidence/verify-autonomous-20260304T150915Z.log`
- `.planning/evidence/verify-autonomous-20260304T151327Z.log`
- `.planning/evidence/verify-autonomous-20260304T152651Z.log`
- `.planning/evidence/verify-autonomous-20260304T155017Z.log`
- `.planning/evidence/verify-autonomous-20260304T160051Z.log`
- `.planning/evidence/verify-autonomous-20260304T160952Z.log`
- `.planning/evidence/verify-autonomous-20260304T161348Z.log`
- `.planning/evidence/verify-autonomous-20260304T161814Z.log`
- `.planning/evidence/verify-autonomous-20260304T162342Z.log`
- `.planning/evidence/verify-autonomous-20260304T163602Z.log`
- `.planning/evidence/verify-autonomous-20260304T164036Z.log`
- `.planning/evidence/verify-autonomous-20260304T165147Z.log`
- `.planning/evidence/verify-autonomous-20260304T165147Z.json`
- `.planning/evidence/verify-production-loop-20260304T165147Z.json`
- `.planning/evidence/verify-autonomous-20260304T170035Z.log`
- `.planning/evidence/verify-autonomous-20260304T170035Z.json`
- `.planning/evidence/verify-production-loop-20260304T170035Z.json`
- `.planning/evidence/verify-autonomous-20260304T170554Z.json` (falha controlada, validação de relatório)
- `.planning/evidence/verify-autonomous-20260304T170623Z.log`
- `.planning/evidence/verify-autonomous-20260304T170623Z.json`
- `.planning/evidence/verify-production-loop-20260304T170623Z.json`

Nota de rastreabilidade:
- `.planning/evidence/verify-autonomous-20260304T150554Z.log` registra uma falha intermediária por falso positivo de regex no parser de tail; a correção no `verify-production.sh` foi validada pelos ciclos subsequentes verdes.
- `.planning/evidence/verify-autonomous-20260304T160014Z.log` registra falha intermediária de quoting no parser `awk` do `Retry-After`; corrigido e validado no ciclo subsequente verde.
- `.planning/evidence/verify-autonomous-20260304T162238Z.log` registra falha intermediária por suposição rígida de que a tentativa final de auth deveria ser `429`; o verificador foi ajustado para validar o invariante robusto (presença de `401` + `429` e `Retry-After` válido em resposta `429`) e o ciclo seguinte ficou verde.

## Fases executadas nesta iteração ultrawork
1. **Fase 1 — Timezone canônico**
- `user_timezone` + `timezone_updated_at` adicionados ao perfil;
- onboarding passa a validar e persistir timezone IANA;
- fallback de data em `/users/dashboard` e `/meals/analyze` agora usa timezone do usuário;
- regressões de borda UTC-12/UTC+14 adicionadas.

2. **Fase 2 — Retenção/privacidade de mídia**
- tabela `media_objects` adicionada para ownership/lifecycle;
- `/meals/analyze` registra upload e retorna `analysisToken`;
- `/meals/manual` valida token de mídia de forma fail-closed;
- `DELETE /meals/:id` marca mídia para deleção;
- GC agendado por cron + métricas (`pending/failed`) + alerta básico (`MEDIA_GC_ALERT`).

3. **Fase 3 — Gate de engenharia 100% fail-closed**
- `check-all` único implementado: lint + verify + build + smoke local;
- smoke local automatizado com bootstrap de migrações D1;
- workflows CI/deploy adicionados com deploy condicionado ao gate verde.

## Fechamento de governança (GitHub)
- Repositório remoto criado e publicado: `https://github.com/mneves75/ai-calories-tracker`.
- Branch protection habilitada em `master` com:
  - required status checks: `check-all` (`strict=true`);
  - `enforce_admins=true`;
  - `required_linear_history=true`;
  - `required_conversation_resolution=true`;
  - force-push e deletions desabilitados.
- Validação prática: push direto em `master` foi bloqueado por política; alteração subsequente foi entregue via PR com check obrigatório verde.

## Riscos remanescentes (prioridade)
- **Sem bloqueador crítico aberto** no gate atual.
- Tradeoff operacional conhecido:
  - quando `R2` está ausente, `/api/meals/analyze` permanece disponível em modo degradado (`imageKey=null`, sem `analysisToken`);
  - para persistência completa de mídia em produção, ainda é recomendável habilitar/bindar `R2`.

## Critério de conclusão 100%
A entrega só é considerada 100% quando:
- requisitos funcionais críticos passam;
- suíte automatizada passa;
- gate operacional em produção passa;
- riscos remanescentes críticos (timezone, idempotência, CI fail-closed) são eliminados.
