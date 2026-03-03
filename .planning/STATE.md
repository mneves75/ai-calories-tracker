# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Usuário tira foto de uma refeição e obtém calorias e macros automaticamente — sem digitação manual.
**Current focus:** Entrega final validada ponta a ponta (backend + mobile + produção)

## Current Position

Phase: 4 of 4 (Dashboard + Polish)
Plan: 4 of 4 phases implementadas localmente
Status: Implementado, validado localmente e validado em produção
Last activity: 2026-03-03 — Gate `verify:autonomous` executado com sucesso (local + produção em 2 ciclos) e evidência persistida

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 1 sessão/fase (execução contínua)
- Total execution time: 1 dia

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2 | 2 | 1 sessão |
| 2 | 3 | 3 | 1 sessão |
| 3 | 3 | 3 | 1 sessão |
| 4 | 3 | 3 | 1 sessão |

**Recent Trend:**
- Last 5 plans: backend hardening, auth/onboarding, IA+diário, dashboard+polish
- Trend: positiva (verify estável)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: Gemini 2.5 Flash (not 2.0) — 2.0 retires June 2026
- [Pre-Phase 1]: R2 for image storage (not D1 BLOBs) — D1 row limit 2MB
- [Pre-Phase 1]: Import Zod from `zod/v3` on mobile — Zod v4 root crashes in RN
- [2026-03-03]: Rate limit de análise usa data do servidor (não data do cliente) — evita bypass por payload
- [2026-03-03]: Upload em R2 só após análise IA válida — evita lixo de storage em falha de IA
- [2026-03-03]: API mobile nunca repassa mensagem técnica crua — erros mapeados para pt-BR
- [2026-03-03]: Registro manual de refeição habilitado no app mobile
- [2026-03-03]: Rate limit de auth por IP/rota em janela de 60s (anti brute force)
- [2026-03-03]: R2 removido como dependência obrigatória de deploy para suportar contas sem R2 habilitado
- [2026-03-03]: Rate limit de auth endurecido com path canônico, IP confiável por ambiente e header `Retry-After` em `429`
- [2026-03-03]: Reserva de cota de análise IA é liberada em falhas (`422/429/503`) para evitar consumo indevido
- [2026-03-03]: Session invalid detection no mobile cobre `401` e `403` com códigos explícitos de sessão inválida
- [2026-03-03]: Histórico no app passa a expor 7 dias no plano atual, mantendo upsell para recursos avançados
- [2026-03-03]: Hash de senha no auth migra para PBKDF2 (Web Crypto, 100k iterações) com fallback de verificação para hash legado scrypt, eliminando CPU-limit intermitente (`1102`) em Workers
- [2026-03-03]: Padronizado gate operacional com script `verify:production` (stress auth + tail + smoke) para revalidação contínua e evidência reprodutível
- [2026-03-03]: Adicionado `verify:production:loop` para executar múltiplos ciclos consecutivos do gate de produção com fail-fast
- [2026-03-03]: Adicionado `verify:autonomous` na raiz para orquestrar validação local + produção e gerar log de evidência versionável

### Pending Todos

- Nenhum pendente crítico de implementação para o escopo v1.

### Blockers/Concerns

- Sem bloqueios atuais.

## Session Continuity

Last session: 2026-03-03
Stopped at: Monorepo com `verify:autonomous` verde (`CYCLES=2`), incluindo correção do parser de `Retry-After` e evidência em `.planning/evidence/verify-autonomous-20260303T082501Z.log`
Resume file: None
