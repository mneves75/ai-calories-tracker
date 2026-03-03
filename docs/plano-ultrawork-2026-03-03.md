# Plano Ultrawork — Versão Elegante (2026-03-03)

## Objetivo
Elevar a implementação para padrão de mercado com foco em correção, idempotência, segurança fail-closed e verificação operacional contínua.

## Abordagem de mercado adotada
- Idempotência em operações de escrita via `Idempotency-Key` + hash de payload.
- Semântica temporal consistente por `localDate` no fluxo de análise.
- Hardening de API e cliente com defaults fail-closed.
- Regressões automatizadas para blindar os riscos críticos.

Referências:
- IETF draft `Idempotency-Key`: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
- Stripe (padrão prático): https://docs.stripe.com/api/idempotent_requests
- RFC 9110 (idempotência): https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2

## O que foi implementado

### Backend (API)
1. `POST /api/meals/manual` agora exige `Idempotency-Key`:
- replay consistente para mesma chave + mesmo payload;
- `409` para mesma chave + payload diferente;
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
  - API: `41` testes, `0` falhas.
  - Mobile: `20` testes, `0` falhas.

### Produção (loop autônomo)
- `CYCLES=1 bun run verify:autonomous`:
  - stress auth com `401` + `429` + `Retry-After`;
  - smoke ponta a ponta aprovado;
  - `/api/meals/analyze` com `200`.

Evidências:
- `.planning/evidence/verify-autonomous-20260303T191229Z.log`
- `.planning/evidence/verify-autonomous-20260303T191554Z.log`
- `.planning/evidence/verify-autonomous-20260303T233528Z.log`
- `.planning/evidence/verify-autonomous-20260303T234517Z.log`

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
- Nenhum risco crítico aberto para o escopo deste plano.

## Critério de conclusão 100%
A entrega só é considerada 100% quando:
- requisitos funcionais críticos passam;
- suíte automatizada passa;
- gate operacional em produção passa;
- riscos remanescentes críticos (timezone, mídia, CI fail-closed) são eliminados.
