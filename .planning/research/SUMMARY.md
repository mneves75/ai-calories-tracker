# Research Summary

**Domain:** AI-powered calorie tracker mobile app (pt-br)
**Synthesized:** 2026-03-03

---

## Stack Consensus

| Layer | Technology | Version | Confidence |
|-------|-----------|---------|------------|
| Mobile Framework | Expo SDK 55 + React Native 0.84.1 | 55.0.4 | HIGH |
| Navigation | expo-router v4 (file-based) | 55.0.3 | HIGH |
| Styling | NativeWind v4 (Tailwind for RN) | 4.2.2 | HIGH |
| State (client) | Zustand + persist middleware | 5.0.11 | HIGH |
| State (server) | TanStack Query | 5.90.21 | HIGH |
| Backend | Hono on Cloudflare Workers | 4.12.3 | HIGH |
| Database | Cloudflare D1 + Drizzle ORM | 0.45.1 | HIGH |
| Auth | better-auth + @better-auth/expo | 1.5.1 | HIGH |
| AI Vision | Gemini 2.5 Flash (NOT 2.0) | API | HIGH |
| Image Storage | Cloudflare R2 | platform | HIGH |
| Validation | Zod (use `zod/v3` on mobile) | 4.3.6 | HIGH |
| Forms | react-hook-form + @hookform/resolvers | 7.71.2 | HIGH |

**Critical version note:** Gemini 2.0 Flash retires June 2026 — use `gemini-2.5-flash` from day one.

---

## Table Stakes Features (Must Ship)

1. AI photo recognition (camera + gallery) — core differentiator
2. Daily calorie dashboard with macro rings
3. Onboarding (goal, sex, age, height, weight) → TDEE calculation
4. User authentication (email/password via better-auth)
5. Food diary (today view, grouped by meal)
6. Manual food entry fallback
7. Meal history (last 7 days minimum)
8. Paywall mock screen (prepared for RevenueCat)
9. All UI in pt-br with proper accents

---

## Architecture Summary

```
Mobile (Expo) → HTTPS → Cloudflare Worker (Hono)
                              ├── D1 (SQLite)
                              ├── R2 (images)
                              └── Gemini 2.5 Flash (AI)
```

- **Monorepo:** `apps/mobile` + `apps/api`
- **AI calls server-side only** — never expose Gemini API key to client
- **Image compression on client** — max 1024px, JPEG 80%, <300KB
- **Structured JSON from Gemini** — validate with Zod before storing
- **Soft delete everywhere** — `deletedAt` column on all tables
- **daily_summaries table** — pre-aggregated, not computed per request

### Build Order (dependency-driven):
1. Backend foundation (D1 schema + Hono + better-auth)
2. Auth flow (mobile login/register + session persistence)
3. Core AI meal analysis (photo → Gemini → D1)
4. Dashboard + history screens
5. Onboarding + user profile + TDEE
6. Polish (paywall mock, UI refinement, pt-br copy)

---

## Top 5 Pitfalls to Prevent

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| 1 | Gemini free tier quota collapse (92% cut Dec 2025) | Use paid tier key from day one; implement 429 retry | Phase 1 |
| 2 | AI portion estimates unreliable (20-50% error) | Show "~" prefix; add correction UX; store estimated vs adjusted | Phase 1 |
| 3 | Workers 128MB memory with base64 images | Compress on client <300KB before upload | Phase 1 |
| 4 | better-auth session loss on app restart | SecureStore + session bootstrap on cold start | Phase 2 |
| 5 | Global mutable state in Workers (cross-request leak) | Zero module-level mutable vars; use Hono context only | Phase 1 |

---

## Key Decisions Required

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Gemini model | 2.5 Flash (not 2.0) | 2.0 retires June 2026 |
| Image persistence | R2 (not D1 BLOBs) | D1 row limit 2MB; R2 is purpose-built |
| Zod on mobile | Import from `zod/v3` | Zod v4 root crashes in RN |
| Calorie values | REAL not INTEGER | Prevent rounding error accumulation |
| Timezone handling | Store local date string from client | Avoid UTC/local mismatch at 11pm |
| Image storage post-MVP | Consider NOT persisting (privacy/LGPD) | Discard after Gemini analysis |

---

## Brazilian Market Differentiators

- **TACO database** (Tabela de Composicao de Alimentos — IBGE) for Brazilian food nutrition data
- **Brazilian food recognition**: feijoada, coxinha, pao de queijo, acai, brigadeiro, arroz e feijao
- **Metric units only** (grams, kg, cm) — no imperial toggle needed
- **pt-br native** — all strings, errors, and AI prompts in Portuguese

---

*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
*Date: 2026-03-03*
