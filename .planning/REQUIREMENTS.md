# Requirements: AI Calories Tracker

**Defined:** 2026-03-03
**Core Value:** O usuario consegue registrar uma refeicao tirando uma foto e obtendo as calorias e macros automaticamente — sem digitacao manual.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infraestrutura Backend

- [ ] **INFRA-01**: Backend Hono funcional no Cloudflare Workers com bindings D1 e R2
- [ ] **INFRA-02**: Schema D1 com Drizzle ORM (users, user_profiles, meals, daily_summaries) com migrations aplicadas
- [ ] **INFRA-03**: Middleware de validacao Zod em todas as rotas
- [ ] **INFRA-04**: Secrets configurados via wrangler (GEMINI_API_KEY, etc) — zero segredos no codigo-fonte
- [ ] **INFRA-05**: Rate limiting por usuario no endpoint de analise AI (max 50 scans/dia)

### Autenticacao

- [ ] **AUTH-01**: Usuario pode criar conta com email e senha via better-auth
- [ ] **AUTH-02**: Usuario pode fazer login e sessao persiste apos fechar e reabrir o app (SecureStore)
- [ ] **AUTH-03**: Usuario pode fazer logout de qualquer tela
- [ ] **AUTH-04**: Middleware de autenticacao valida sessao em todas as rotas protegidas
- [ ] **AUTH-05**: Queries D1 sempre filtram por userId autenticado (zero acesso cross-user)

### Onboarding

- [ ] **ONBD-01**: Fluxo de onboarding coleta: objetivo (perder/manter/ganhar), sexo, idade, altura (cm), peso (kg)
- [ ] **ONBD-02**: Calculo automatico de meta calorica diaria (formula Mifflin-St Jeor + nivel de atividade)
- [ ] **ONBD-03**: UI moderna e engajante com explicacao de por que cada dado e necessario
- [ ] **ONBD-04**: Dados salvos em user_profiles no D1 apos conclusao do onboarding

### Reconhecimento por Foto (Core)

- [ ] **FOTO-01**: Usuario pode tirar foto pela camera ou selecionar da galeria via expo-image-picker
- [ ] **FOTO-02**: Imagem comprimida no cliente (max 1024px, JPEG 80%, <300KB) antes do envio
- [ ] **FOTO-03**: Backend envia imagem ao Gemini 2.5 Flash e recebe JSON estruturado (alimentos, calorias, macros, confianca)
- [ ] **FOTO-04**: Resposta do Gemini validada com Zod no servidor (rejeita valores fora de faixa: calorias 0-5000)
- [ ] **FOTO-05**: Resultado exibido com prefixo "~" indicando estimativa (ex: "~480 kcal")
- [ ] **FOTO-06**: Indicador de confianca da IA visivel ao usuario (alta/media/baixa)
- [ ] **FOTO-07**: Tela de correcao pos-scan: usuario pode editar nome do alimento, porcao e calorias antes de salvar
- [ ] **FOTO-08**: Loading animado durante analise da IA (2-5 segundos) com botao desabilitado para evitar duplicatas
- [ ] **FOTO-09**: Tratamento de erro 429 (quota Gemini) com retry e mensagem em pt-br ao usuario

### Diario Alimentar

- [ ] **DIAR-01**: Usuario pode registrar refeicao (foto ou manual) categorizada como cafe/almoco/janta/lanche
- [ ] **DIAR-02**: Visualizacao do dia atual com refeicoes agrupadas por categoria
- [ ] **DIAR-03**: Usuario pode deletar refeicao (soft delete com deletedAt)
- [ ] **DIAR-04**: Historico dos ultimos 7 dias acessivel

### Dashboard Diario

- [ ] **DASH-01**: Tela principal mostra calorias consumidas vs meta com progress ring visual
- [ ] **DASH-02**: Breakdown de macronutrientes (proteina, carboidratos, gordura) em gramas e porcentagem
- [ ] **DASH-03**: Tabela daily_summaries pre-agregada (atualizada a cada insert/delete de refeicao)
- [ ] **DASH-04**: Data armazenada como string de data local do cliente (YYYY-MM-DD) para evitar bug de timezone

### Interface & UX

- [ ] **UI-01**: Toda interface em portugues brasileiro (pt-br) com acentos corretos
- [ ] **UI-02**: Design moderno e inovador com NativeWind v4 (Tailwind para RN)
- [ ] **UI-03**: Navegacao por tabs (Dashboard, Camera/Foto, Historico) via expo-router
- [ ] **UI-04**: Mensagens de erro da API mapeadas para pt-br (nunca exibir JSON cru ou ingles)
- [ ] **UI-05**: Maximo 3 toques do momento da foto ate refeicao salva

### Paywall Mock

- [ ] **PAY-01**: Tela de paywall/premium com design profissional exibida apos onboarding
- [ ] **PAY-02**: Hook useSubscription() retorna estado mockado (isPremium: false)
- [ ] **PAY-03**: Funcionalidades premium bloqueadas pelo hook (preparado para RevenueCat futuro)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Rastreamento

- **RAST-01**: Rastreamento de peso com grafico de tendencia
- **RAST-02**: Rastreamento de consumo de agua (contador diario)
- **RAST-03**: Streak de dias consecutivos com mecanica de recuperacao
- **RAST-04**: Insights semanais ("Voce ficou abaixo da meta de proteina toda terca")

### Funcionalidades Avancadas

- **AVANC-01**: Fluxo de correcao por chat com IA ("na verdade era leite de amendoas")
- **AVANC-02**: Scanner de codigo de barras
- **AVANC-03**: Push notification de lembrete diario
- **AVANC-04**: Busca manual de alimentos com banco de dados

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Pagamentos reais (RevenueCat) | MVP usa mock — monetizacao apos validacao |
| Versao web | Mobile-first apenas neste milestone |
| Integracao com wearables | Complexidade de manutencao por dispositivo |
| Plano alimentar / receitas | Produto diferente — requer expertise nutricional |
| Chat com nutricionista | Responsabilidade medica, moderacao |
| Funcionalidades sociais / grupos | Validar necessidade antes de construir |
| Rastreamento de micronutrientes | Nicho (Cronometer), complica UI |
| Modo offline completo | AI requer conexao; cache local de 7 dias suficiente |
| Builder de receitas | 3-4 semanas de trabalho para caso de uso de borda |
| Login OAuth/social | Email/senha suficiente para MVP |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| ONBD-01 | Phase 2 | Pending |
| ONBD-02 | Phase 2 | Pending |
| ONBD-03 | Phase 2 | Pending |
| ONBD-04 | Phase 2 | Pending |
| FOTO-01 | Phase 3 | Pending |
| FOTO-02 | Phase 3 | Pending |
| FOTO-03 | Phase 3 | Pending |
| FOTO-04 | Phase 3 | Pending |
| FOTO-05 | Phase 3 | Pending |
| FOTO-06 | Phase 3 | Pending |
| FOTO-07 | Phase 3 | Pending |
| FOTO-08 | Phase 3 | Pending |
| FOTO-09 | Phase 3 | Pending |
| DIAR-01 | Phase 3 | Pending |
| DIAR-02 | Phase 3 | Pending |
| DIAR-03 | Phase 3 | Pending |
| DIAR-04 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 4 | Pending |
| UI-05 | Phase 4 | Pending |
| PAY-01 | Phase 4 | Pending |
| PAY-02 | Phase 4 | Pending |
| PAY-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation — all 39 requirements mapped*
