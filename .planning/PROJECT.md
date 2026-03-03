# AI Calories Tracker

## What This Is

Aplicativo mobile de rastreamento de calorias com reconhecimento de alimentos por foto usando IA (Gemini 3.0 Flash). O usuário tira uma foto ou seleciona da galeria, e o app identifica os alimentos e suas informações nutricionais automaticamente. Backend em Bun/Hono para deploy no Cloudflare Workers com banco D1.

## Core Value

O usuário consegue registrar uma refeição tirando uma foto e obtendo as calorias e macros automaticamente — sem digitação manual.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Reconhecimento de alimentos por foto via Gemini 3.0 Flash
- [ ] Captura de foto via câmera ou seleção da galeria
- [ ] Cálculo automático de calorias e macronutrientes
- [ ] Dashboard diário com resumo nutricional
- [ ] Histórico de refeições registradas
- [ ] Autenticação de usuários via better-auth
- [ ] Onboarding moderno para capturar dados do usuário (peso, altura, objetivo)
- [ ] Backend API em Bun/Hono para Cloudflare Workers
- [ ] Banco de dados Cloudflare D1
- [ ] Interface mobile moderna e inovadora (pt-br)
- [ ] Mock de paywall/premium (preparado para RevenueCat futuro)

### Out of Scope

- Pagamentos reais — MVP usa mock (RevenueCat será integrado depois)
- Versão web — mobile-first apenas
- Integração com wearables — complexidade desnecessária para MVP
- Plano alimentar com receitas — fora do escopo inicial
- Chat com nutricionista — não é o foco do produto

## Context

- App mobile usando React Native/Expo (ecossistema do desenvolvedor)
- Backend serverless no Cloudflare Workers (Bun + Hono)
- Banco de dados edge com Cloudflare D1 (SQLite distribuído)
- Autenticação via better-auth (alternativa moderna ao NextAuth)
- IA via Google Gemini 3.0 Flash (melhor custo-benefício para visão computacional)
- UI/UX precisa ser inovadora, moderna, com onboarding que engaja
- Todo o app em português brasileiro (pt-br) com acentos
- Preparado para monetização futura via RevenueCat

## Constraints

- **Tech Stack Backend**: Bun + Hono — deploy no Cloudflare Workers
- **Database**: Cloudflare D1 — SQLite na edge
- **Auth**: better-auth — obrigatório
- **AI Model**: Gemini 3.0 Flash — reconhecimento de alimentos
- **Idioma**: Português brasileiro (pt-br) em toda a interface
- **Pagamentos**: Mock apenas — sem integração real no MVP
- **Mobile**: React Native / Expo — padrão do desenvolvedor

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gemini 3.0 Flash para visão | Melhor custo-benefício para análise de imagens de alimentos | — Pending |
| Cloudflare Workers + D1 | Edge computing, baixa latência, custo previsível | — Pending |
| better-auth | Alternativa moderna, TypeScript-first, extensível | — Pending |
| Mock de pagamentos | MVP foca na funcionalidade core, monetização depois | — Pending |
| UI em pt-br | Público-alvo brasileiro, experiência nativa | — Pending |

---
*Last updated: 2026-03-03 after initialization*
