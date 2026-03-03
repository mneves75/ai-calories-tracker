# Phase 1: Backend Foundation - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

API Hono funcional no Cloudflare Workers com D1 schema, validacao Zod, secrets configurados e rate limiting. Nenhuma UI mobile nesta fase — somente backend testavel via curl/Postman.

Requirements: INFRA-01 through INFRA-05.

</domain>

<decisions>
## Implementation Decisions

### Estrutura do Projeto
- Monorepo com `apps/mobile` (Expo) e `apps/api` (Hono Worker)
- Backend em `apps/api/src/` com: routes/, middleware/, services/, db/
- Schema Drizzle em `apps/api/src/db/schema.ts` — single source of truth
- Migrations via `drizzle-kit generate` → `wrangler d1 migrations apply`

### Schema D1
- Tabelas better-auth auto-gerenciadas: users, sessions, accounts
- Tabelas da aplicacao: user_profiles, meals, daily_summaries
- Todos os valores nutricionais como REAL (nao INTEGER) — evitar acumulo de arredondamento
- Soft delete em todas as tabelas (`deletedAt TEXT` nullable)
- `meal_date` armazenado como string de data local (YYYY-MM-DD) do cliente — prevenir bug de timezone
- `foodsDetected` como TEXT (JSON stringified array)
- `calories_estimated` e `calories_adjusted` como campos separados em meals

### Hono API Design
- Entry point: `apps/api/src/index.ts` exporta Worker default
- Rotas: /api/auth/* (better-auth), /api/meals/*, /api/dashboard/*, /api/users/*
- Middleware auth valida sessao via `auth.api.getSession()` e injeta user em `c.set('user', ...)`
- Validacao Zod via `@hono/zod-validator` em todas as rotas
- Zero variaveis mutaveis em escopo de modulo (prevenir leak cross-request)
- Max payload 2MB no endpoint de imagem (413 se exceder)

### Secrets e Seguranca
- Todos os secrets via `wrangler secret put` — zero no codigo-fonte
- GEMINI_API_KEY, BETTER_AUTH_SECRET como secrets obrigatórios
- Bindings D1 e R2 via wrangler.toml
- Acesso a env via `c.env.VAR_NAME` (nunca `process.env`)

### Rate Limiting
- Endpoint /api/meals/analyze: max 50 scans/dia por usuario
- Implementar contador de análise por userId+date (no código atual via D1)
- Retornar 429 com mensagem em pt-br quando exceder

### Gemini Integration
- Modelo: `gemini-2.5-flash` (NAO 2.0 — retira junho 2026)
- SDK: `@google/generative-ai` somente no backend
- Prompt com schema JSON explicito + `responseMimeType: "application/json"`
- Validacao Zod da resposta: calorias 0-5000, proteina 0-500, carbs 0-1000, gordura 0-500
- Campo `confidence` (high/medium/low) obrigatorio na resposta
- Rejeitar e retornar erro amigavel se confianca < threshold

### Claude's Discretion
- Implementação exata do rate limiter (D1 query vs outra estratégia persistente)
- Estrutura interna do prompt Gemini (desde que retorne schema definido)
- Estrategia de retry para 429 do Gemini (exponential backoff recomendado)
- Naming conventions de rotas (kebab-case vs camelCase)

</decisions>

<specifics>
## Specific Ideas

- Arquitetura de research: ARCHITECTURE.md define pattern "AI Analysis as Server-Side Orchestration"
- Nao persistir imagens no D1 (usar R2 ou descartar apos analise — decisao de privacidade/LGPD)
- daily_summaries pre-agregada — atualizar atomicamente no insert/delete de meal
- Usar `db.batch()` para writes multi-tabela em single round-trip
- better-auth configurado com D1 adapter e `trustedOrigins` para mobile app scheme

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Já existe base backend implementada (auth, users, meals, gemini) e em hardening

### Established Patterns
- Bun como package manager e runtime (obrigatorio por CLAUDE.md)
- TypeScript strict mode
- Soft delete pattern (deletedAt) obrigatorio por CLAUDE.md

### Integration Points
- wrangler.toml configura bindings D1 e R2
- better-auth monta em /api/auth/* e gerencia suas proprias tabelas
- Drizzle schema gera migrations para D1

</code_context>

<deferred>
## Deferred Ideas

- R2 para storage de imagens — avaliar se vale persistir ou descartar pos-analise (decisao LGPD)
- Push notifications setup — Phase 4 ou v2
- Cloudflare Cache para dashboard responses — otimizacao futura

</deferred>

---

*Phase: 01-backend-foundation*
*Context gathered: 2026-03-03*
