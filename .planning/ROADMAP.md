# Roadmap: AI Calories Tracker

## Overview

Quatro fases que entregam o MVP de um rastreador de calorias com IA: começa com a fundação backend no Cloudflare Workers, sobe para autenticação e onboarding, implementa o core de reconhecimento por foto com o diário alimentar, e finaliza com dashboard, UI polish e paywall mock. Cada fase entrega uma capacidade completa e verificável.

## Phases

- [x] **Phase 1: Backend Foundation** - API Hono no Cloudflare Workers com D1, schema, validação e secrets
- [x] **Phase 2: Auth + Onboarding** - Usuário pode criar conta, fazer login persistente e completar onboarding com meta calórica
- [x] **Phase 3: AI Core + Diário** - Usuário tira foto, recebe análise nutricional automática e gerencia refeições no diário
- [x] **Phase 4: Dashboard + Polish** - Dashboard visual com progresso calórico, UI pt-br completa e paywall mock

## Phase Details

### Phase 1: Backend Foundation
**Goal**: API backend funcional e segura no Cloudflare Workers, pronta para receber autenticação e chamadas de IA
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Um request HTTP para qualquer rota retorna resposta válida do Cloudflare Worker (não 500 ou timeout)
  2. O schema D1 com tabelas users, user_profiles, meals, daily_summaries existe e migrations foram aplicadas
  3. Rotas sem token válido retornam 401; rotas com dados inválidos retornam 422 com mensagem clara
  4. Nenhum segredo (API keys, tokens) está no código-fonte — tudo em wrangler secrets
  5. O endpoint de análise AI rejeita requests após 50 scans/dia por usuário com erro legível
**Plans**: TBD

Plans:
- [x] 01-01: Monorepo setup, Hono worker, D1 schema com Drizzle e migrations
- [x] 01-02: Middleware Zod, rate limiting, wrangler secrets, testes de integração

### Phase 2: Auth + Onboarding
**Goal**: Usuário pode criar conta, fazer login com sessão persistente e completar onboarding que calcula sua meta calórica diária
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, ONBD-01, ONBD-02, ONBD-03, ONBD-04
**Success Criteria** (what must be TRUE):
  1. Usuário pode criar conta com email e senha e receber sessão ativa
  2. Usuário fecha e reabre o app e continua logado (sessão via SecureStore persiste)
  3. Usuário pode fazer logout de qualquer tela e é redirecionado para login
  4. Usuário completa onboarding fornecendo objetivo, sexo, idade, altura e peso — dados salvos no D1
  5. App calcula e exibe a meta calórica diária personalizada ao final do onboarding
**Plans**: TBD

Plans:
- [x] 02-01: better-auth no backend (rotas, middleware, isolamento por userId)
- [x] 02-02: Telas de login/registro no mobile com sessão persistente via SecureStore
- [x] 02-03: Fluxo de onboarding (UI moderna, cálculo Mifflin-St Jeor, save user_profiles)

### Phase 3: AI Core + Diário
**Goal**: Usuário tira foto de uma refeição, recebe calorias e macros automaticamente via Gemini, e gerencia seu diário alimentar do dia
**Depends on**: Phase 2
**Requirements**: FOTO-01, FOTO-02, FOTO-03, FOTO-04, FOTO-05, FOTO-06, FOTO-07, FOTO-08, FOTO-09, DIAR-01, DIAR-02, DIAR-03, DIAR-04
**Success Criteria** (what must be TRUE):
  1. Usuário tira foto ou seleciona da galeria e em 2-5 segundos vê calorias e macros estimados com prefixo "~"
  2. Indicador de confiança (alta/média/baixa) é exibido junto ao resultado da IA
  3. Usuário pode editar nome do alimento, porção e calorias antes de salvar a refeição
  4. Refeição salva aparece no diário do dia, agrupada por categoria (café/almoço/janta/lanche)
  5. Usuário pode deletar uma refeição do diário (soft delete — não some do banco)
  6. Histórico dos últimos 7 dias está acessível
**Plans**: TBD

Plans:
- [x] 03-01: Endpoint de análise AI (upload → Gemini 2.5 Flash → Zod validate → D1), rate limit 429 handler
- [x] 03-02: Tela de câmera/galeria, compressão de imagem, loading animado, tela de correção pós-scan
- [x] 03-03: Diário alimentar (tela do dia, agrupamento por categoria, delete, histórico 7 dias)

### Phase 4: Dashboard + Polish
**Goal**: Dashboard visual com progresso calórico do dia, interface completa em pt-br e paywall mock preparado para RevenueCat
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, UI-01, UI-02, UI-03, UI-04, UI-05, PAY-01, PAY-02, PAY-03
**Success Criteria** (what must be TRUE):
  1. Tela principal exibe calorias consumidas vs meta com progress ring visual e breakdown de macros em gramas e porcentagem
  2. Toda a interface está em português brasileiro com acentos corretos — nenhuma string em inglês visível ao usuário
  3. Navegação por tabs (Dashboard, Foto, Histórico) funciona e a tela de câmera está a no máximo 2 toques da tela principal
  4. Mensagens de erro da API são exibidas em pt-br — nunca JSON cru ou texto em inglês
  5. Tela de paywall mock com design profissional é exibida após onboarding; hook useSubscription() retorna isPremium: false
**Plans**: TBD

Plans:
- [x] 04-01: Dashboard (progress ring, macro breakdown, daily_summaries aggregation, timezone fix)
- [x] 04-02: UI polish (NativeWind v4, tabs navigation, error messages pt-br, max 3 toques para salvar refeição)
- [x] 04-03: Paywall mock (tela premium, useSubscription hook, feature gating preparado para RevenueCat)

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Foundation | 2/2 | Done (local) | 2026-03-03 |
| 2. Auth + Onboarding | 3/3 | Done (local) | 2026-03-03 |
| 3. AI Core + Diário | 3/3 | Done (local) | 2026-03-03 |
| 4. Dashboard + Polish | 3/3 | Done (local) | 2026-03-03 |
