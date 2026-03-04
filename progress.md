# Progress Log

## 2026-03-04
- Atualização elegante v3 (operability hardening orientado por padrão de mercado):
  - `/health` agora reporta degradado de forma explícita e verificável:
    - checks independentes para `mediaGc` e `idempotency`;
    - `status: degraded` + HTTP `503` quando qualquer check falha.
  - `scheduled` desacoplado por tarefa:
    - falha em idempotência não bloqueia execução de media GC;
    - logs estruturados por tarefa (`MAINTENANCE_TASK_FAILED`) + resumo de ciclo parcial.
  - parsing de env fortalecido (fail-safe):
    - `IDEMPOTENCY_IN_PROGRESS_STALE_MS` e `IDEMPOTENCY_IN_PROGRESS_ALERT_THRESHOLD`;
    - `MEDIA_GC_ALERT_THRESHOLD` com fallback seguro e log `INVALID_ENV_VALUE`.
  - robustez de agregação idempotente:
    - normalização de `staleInProgressMs` inválido;
    - coerção de contadores inválidos/nulos para `0`.
- Regressões adicionais:
  - `apps/api/src/index.test.ts` expandido para:
    - `/health` degradado (`503`) com checks de erro;
    - isolamento de tarefas no `scheduled`;
    - emissão de `IDEMPOTENCY_ALERT`;
    - fallback seguro para env inválida.
  - `apps/api/src/services/idempotency-gc.test.ts` expandido para:
    - `meta.changes` ausente;
    - `staleInProgressMs` inválido com fallback seguro;
    - coerção de campos inválidos para `0`.
- Verificação executada:
  - `bun test apps/api/src/index.test.ts apps/api/src/services/idempotency-gc.test.ts apps/api/src/services/media-gc.test.ts` ✅
  - `bun run check-all` ✅
  - `CYCLES=2 bun run verify:autonomous` ✅
  - evidência: `.planning/evidence/verify-autonomous-20260304T001253Z.log`

## 2026-03-03
- Atualização elegante v2 (baseada em padrão de mercado):
  - idempotência de `/api/meals/manual` evoluída para modelo stateful (`in_progress`/`completed`) com replay exato de status/body e header `Idempotency-Replayed`;
  - conflito de payload idempotente ajustado para `422` com envelope `application/problem+json` (RFC 9457);
  - adicionada expiração de chave idempotente (TTL 24h) com colunas `response_status/response_body/expires_at` (migração `0007`);
  - incluído GC de idempotência expiradas no `scheduled` handler;
  - compatibilidade de UX no mobile mantida por mapeamento de novos códigos de erro.
- Verificação v2:
  - `bun run check-all` aprovado;
  - `CYCLES=2 bun run verify:autonomous` aprovado;
  - evidência: `.planning/evidence/verify-autonomous-20260303T235718Z.log`.

- Fechamento de governança remota:
  - repositório remoto criado: `https://github.com/mneves75/ai-calories-tracker`;
  - branch protection aplicada em `master` com required check `check-all`, strict mode, admins enforced, linear history e conversation resolution;
  - push direto em `master` bloqueado por política (comprovando enforcement);
  - alteração final de CI entregue por PR `#1` com merge sob proteção;
  - revalidação final após governança: `CYCLES=1 bun run verify:autonomous` aprovado;
  - evidência final adicional: `.planning/evidence/verify-autonomous-20260303T234517Z.log`.

- Fechamento autônomo final:
  - migração remota D1 inicialmente falhou em `0005_user_timezone.sql` por `ALTER TABLE ... DEFAULT (unixepoch() * 1000)` (não permitido em SQLite/D1);
  - correção aplicada na migração: default constante `0` + `UPDATE` de backfill para timestamp atual;
  - `bun run db:migrate:remote` reexecutado com sucesso (`0005` e `0006` aplicadas);
  - gate autônomo reforçado com `CYCLES=3 bun run verify:autonomous` aprovado fim-a-fim;
  - evidência final: `.planning/evidence/verify-autonomous-20260303T233528Z.log`.

- Iteração Ultrawork (elegância + padrão de mercado) concluída:
  - idempotência server-side em `POST /api/meals/manual` com `Idempotency-Key` obrigatório, hash de payload e replay determinístico;
  - migração D1 adicionada para `meal_idempotency_keys` + índice composto em `meals(user_id, local_date, deleted_at, logged_at)`;
  - `/api/meals/analyze` ajustado para usar `localDate` do cliente (fallback seguro), alinhando quota/resposta ao dia local;
  - hardening backend com headers de segurança globais (`nosniff`, `DENY`, `no-referrer`, `Permissions-Policy`);
  - mobile atualizado para:
    - validar `EXPO_PUBLIC_API_BASE_URL` fail-closed (HTTPS fora de host local),
    - aplicar timeout/cancelamento em requests,
    - enviar `Idempotency-Key` nas gravações de refeição,
    - corrigir CTA premium sem ação em `histórico` (feedback explícito ao usuário).
- Regressões adicionadas:
  - API: `/manual` exige idempotency key, conflito por payload diferente e replay por mesma chave/payload;
  - API: `/analyze` validado para usar `localDate` cliente;
  - API: headers de segurança validados em `/health`;
  - Mobile: validação de `API_BASE_URL` para HTTPS/local.
- Verificação executada:
  - `bun run verify` verde (`API 32 testes`, `mobile 17 testes`);
  - `CYCLES=1 bun run verify:autonomous` verde (local + loop produção), evidências em:
    - `.planning/evidence/verify-autonomous-20260303T191229Z.log`
    - `.planning/evidence/verify-autonomous-20260303T191554Z.log`

- Concluído hardening backend:
  - validação de payload base64/2MB em `/api/meals/analyze`;
  - mapeamento robusto de erro IA (`422/429/503`);
  - rate-limit por data do servidor;
  - soft-delete escopado por `user_id`;
  - validação fail-closed de `BETTER_AUTH_*`;
  - logging sanitizado com `requestId`.
- Concluído hardening mobile:
  - sessão inválida limpa token e estado;
  - anti-duplicata em análise/salvar;
  - histórico/dash estáveis;
  - mensagens pt-BR sem erro técnico cru;
  - registro manual de refeição.
- Concluído auth brute-force guard:
  - middleware D1 em `/api/auth/sign-in/email` e `/api/auth/sign-up/email`;
  - migração `0002_auth_rate_limits.sql`;
  - testes de regressão adicionados.
- Concluído provisionamento/deploy remoto:
  - D1 remoto `ai-cal-db` criado e migrado;
  - Worker `ai-cal-api` publicado em `https://ai-cal-api.moltbotclubbrasil.workers.dev`;
  - smoke remoto de auth/onboarding/diário validado.
- Verificação final:
  - `bun run verify` verde (API 24 testes, mobile 15 testes);
  - smoke E2E local verde em wrangler dev;
  - bloqueio 429 de brute-force validado com `retry-after`;
  - análise IA em produção validada com `200` em imagem real.

- Iteração de endurecimento final aplicada:
  - correção de regressão em produção no auth-rate-limit (remoção de `RETURNING` para caminho estável em D1 remoto);
  - fallback fail-closed em limpeza de sessão local (`SecureStore`);
  - detecção de sessão inválida ampliada (`401` e `403` com código explícito);
  - tratamento de permissão câmera/galeria + mensagens pt-BR seguras;
  - histórico ajustado para 7 dias no plano atual (MVP), mantendo upsell de recursos avançados.

- Fechamento autônomo adicional de produção (loop correção+evidência):
  - identificado e reproduzido erro intermitente `1102` (CPU limit) em `/api/auth/sign-up/email` e `/api/auth/sign-in/email`;
  - causa raiz tratada em auth: hash de senha customizado para Workers com `PBKDF2-SHA256` (`100000` iterações, Web Crypto) e fallback compatível para hash legado scrypt;
  - desabilitado rate-limit interno do Better Auth (mantendo middleware dedicado em D1 como fonte única);
  - adicionados testes de regressão para hash/verify (`password-hash.test.ts`) cobrindo formato novo + legado;
  - novo deploy remoto concluído (`Current Version ID: 0df1f482-1d16-4be1-b14b-10cde57e6b31`);
  - stress remoto de auth (20 tentativas): `signup=200`, `sign-in` inválido `401` nas primeiras tentativas e `429` após limite, sem `1102`;
  - smoke remoto fim-a-fim revalidado: `me/onboarding/manual/dashboard/delete/history` verdes e `/api/meals/analyze` validado com `200` (após retry de timeout transitório).

- Fortalecimento de operação contínua:
  - criado script reutilizável `apps/api/scripts/verify-production.sh` com critérios fail-closed;
  - novo comando `bun run verify:production` no `apps/api/package.json`;
  - script valida automaticamente: stress de auth (`401/429` + `Retry-After`), ausência de `1102`/`500` via `wrangler tail`, smoke completo de produto e retry controlado para `/api/meals/analyze`;
  - execução real do script concluída com sucesso em produção.

- Endurecimento adicional do loop autônomo:
  - adicionado fixture local `apps/api/scripts/fixtures/food-sample.base64` para reduzir dependência externa durante verificação de análise;
  - script `verify-production.sh` atualizado para:
    - aguardar janela de auth quando necessário (`Retry-After`) antes do stress;
    - aceitar imagem via env (`ANALYZE_IMAGE_BASE64`) e priorizar fixture local;
    - manter fallback remoto apenas quando fixture não existir;
  - novo script `apps/api/scripts/verify-production-loop.sh` + comando `bun run verify:production:loop`;
  - loop executado em produção com `2` ciclos completos, ambos aprovados, sem `1102` e sem `500` em auth.

- Orquestração final de fechamento autônomo:
  - novo script raiz `scripts/verify-autonomous.sh` + comando `bun run verify:autonomous`;
  - fluxo automatizado em 2 fases: `bun run verify` (local) + `verify:production:loop` (produção);
  - corrigido bug de parsing `Retry-After` no gate (`awk`) após uma falha intermediária detectada em execução real;
  - `CYCLES=2 bun run verify:autonomous` aprovado fim-a-fim, com evidência persistida em `.planning/evidence/verify-autonomous-20260303T082501Z.log`.

## Ultrawork 2026-03-03 (phase closure)
- Implemented **Phase 1 (timezone canônico)**:
  - Added `user_timezone` + `timezone_updated_at` in API profile schema/migration.
  - `/api/users/onboarding` now validates and persists IANA timezone.
  - `/api/users/dashboard` now derives date from user timezone when `date` is omitted (fail-closed with `TIMEZONE_REQUIRED` when missing).
  - `/api/meals/analyze` fallback now uses persisted user timezone instead of UTC fallback.
- Implemented **Phase 2 (mídia/GC)**:
  - Added `media_objects` table + migration.
  - Analyze flow now returns `analysisToken` and persists uploaded-media ownership.
  - Manual save now requires `analysisToken` when `imageKey` is present.
  - Meal delete now queues media for deletion.
  - Added scheduled media GC cycle + metrics/alert (`MEDIA_GC_ALERT`) + health surface (`mediaGc`).
- Implemented **Phase 3 (gate fail-closed)**:
  - Added root `check-all` pipeline (`lint + verify + build + smoke:local`).
  - Added API local smoke script with D1 local migrations bootstrap.
  - Added CI/deploy workflows under `.github/workflows` with gated deploy.
- Hardening extras:
  - Global security headers expanded and applied preflight-safe.
  - `ENVIRONMENT` validation hardened (supports `development/local/test/staging/production`).

## Validation summary (latest)
- `bun run check-all` ✅
- `CYCLES=1 bun run verify:autonomous` ✅
  - Evidence log: `.planning/evidence/verify-autonomous-20260303T212711Z.log`
