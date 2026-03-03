# Feature Research

**Domain:** AI-powered calorie tracker mobile app
**Researched:** 2026-03-03
**Confidence:** MEDIUM-HIGH (verified across 12+ sources, competitor analysis, academic research)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Food logging via text/search | Every tracker has this; baseline interaction model | LOW | Manual fallback when photo fails — must be fast |
| Barcode scanner | All major apps (MFP, Lose It!, Yazio) have it; users trained to expect it | MEDIUM | Requires food database integration; camera API |
| Daily calorie summary / dashboard | Users need immediate feedback to make decisions | LOW | Day view with calories in, calories remaining, macro rings |
| Macronutrient breakdown (protein, carbs, fat) | Standard since MyFitnessPal popularized it 10+ years ago | LOW | Display as grams and percentages |
| Meal history / food diary | Users need to review and correct past logs | LOW | Per-day view, grouped by meal (breakfast/lunch/dinner/snack) |
| Goal setup (calorie target) | App must know what "success" looks like for the user | LOW | Derived from weight, height, age, activity level, goal (lose/maintain/gain) |
| Onboarding data collection | Weight, height, age, sex, goal — needed to compute TDEE/BMR | LOW | 5-question flow; must feel fast, not clinical |
| Weight tracking | Users track body weight alongside food to see correlation | LOW | Manual entry, optional; simple line chart |
| Water intake tracking | Ubiquitous in all major apps; users expect it | LOW | Simple counter, daily target |
| User authentication (signup/login) | Required to persist data across sessions and devices | MEDIUM | Email/password minimum; social login accelerates onboarding |
| Meal categories | Breakfast / Lunch / Dinner / Snacks — standard taxonomy | LOW | Fixed categories are fine for MVP; custom categories are v2 |
| Calorie goal calculation (BMR/TDEE) | Users don't know their calorie target; app must compute it | LOW | Harris-Benedict or Mifflin-St Jeor formula; well-established |
| Push notifications (log reminder) | Without reminders, users forget and churn | LOW | Daily reminder at meal times; simple but high retention impact |
| Basic progress visualization | Users need to see if they're on track week-over-week | MEDIUM | Weekly calorie totals, weight trend line |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but they win users who comparison shop.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI photo recognition (core differentiator) | Zero-friction logging: photo → macros in seconds, no typing | HIGH | This IS the product's core value. Gemini 3.0 Flash vision API. Must handle Brazilian foods (feijoada, pão de queijo, etc.). Accuracy 60-90% depending on food clarity and lighting |
| AI correction / chat adjustment | "Actually it was almond milk, not regular" — fast fix without re-logging | MEDIUM | Post-recognition edit flow; Gemini can handle this conversationally |
| Portion size estimation from photo | Goes beyond food ID to estimate grams/volume | HIGH | Hardest ML problem in food recognition. Depth sensor helps on newer phones. 15-25% error rate is acceptable if disclosed |
| Brazilian food database priority | Local foods (açaí, coxinha, farofa) are poorly covered by global apps | MEDIUM | MFP's Brazilian database is community-submitted and inaccurate. Seeding with TACO (Tabela de Composição de Alimentos do IBGE) gives structural advantage |
| Instant calorie feedback post-photo | Show result in under 3 seconds; competitive bar is 5-10s | HIGH | UX differentiator; requires optimized API call + aggressive loading states |
| Modern, opinionated UI (not clinical) | Established apps look dated (MFP, FatSecret); users respond to polish | MEDIUM | Use bold typography, dark/gradient themes, motion-forward design |
| Streak system with recovery mechanic | Streaks drive retention; recovery prevents churn after a missed day | MEDIUM | "Streak shield" (like Duolingo) prevents abandonment when streak breaks |
| Contextual paywall (onboarding) | Showing paywall at peak motivation (end of onboarding) drives 50%+ trials | LOW | Mock paywall for MVP; RevenueCat integration post-validation |
| AI confidence indicator | Show "85% confident" on food ID — builds trust, prompts correction | LOW | Surface Gemini's confidence score; users trust calibrated uncertainty more than false certainty |
| Weekly insights / macro patterns | "You've been low on protein every Tuesday" — actionable intelligence | MEDIUM | Requires 2+ weeks of data; defer to v1.x |
| Multi-language food name support | Brazilian users search in Portuguese; global databases return English results | MEDIUM | Map TACO entries with pt-br names; fuzzy search on both |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems — scope creep traps, complexity sinks, or user-hostile patterns.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Recipe builder | Power users want to log homemade dishes | High complexity, database management, ingredient matching — easily 3-4 weeks of work for edge-case use | Allow manual entry of a "custom food" with name + macros. User defines "Feijoada da Minha Mãe" once, reuses it |
| Social feed / friend activity | Cal AI added groups; seems engaging | Adds trust, moderation, and cold-start problems. Users don't want others seeing their diet failures. MyFitnessPal's social features are barely used. | Leaderboard with anonymized challenges; no personal feed |
| Meal plan generator | Users ask "what should I eat?" | Requires dietitian-grade recommendations (liability), personalization engine, and recipes — fundamentally a different product | Calorie budget remaining = implicit meal planning signal |
| Wearable sync (Apple Watch, Garmin) | Fitness-forward users want TDEE adjustment from steps/exercise | OAuth flows per device, API rate limits, sync conflicts. Each integration = ongoing maintenance burden | Manual exercise logging with a simple calorie burn estimate |
| Chat with nutritionist / AI coach | Trendy; Noom does this | Requires guardrails (medical advice liability), moderation, response quality control | Post-meal AI insight ("this meal was 40% of your daily fat target") is enough for MVP |
| Aggressive premium upsell (constant) | Maximizes immediate revenue signal | #1 cause of calorie app churn per user reviews. FatSecret wins by having no paywalls. | Show paywall once at onboarding, once at a "power user" moment (e.g., 7-day streak). Never interrupt logging flow |
| Calorie cycling / advanced diet protocols | Keto, IF timer, carb cycling | Niche features that complicate the core flow and confuse mainstream users | Define a clean daily calorie target. Users who want keto can manually set macro targets |
| Micronutrient tracking (vitamins/minerals) | Cronometer differentiates on this | Requires extensive food database with micronutrient data. 90% of users don't care. Adds UI complexity | Show only: calories, protein, carbs, fat. Hide micronutrients behind a toggle or defer to v2 |
| Real-time collaboration / family tracking | "Track meals for my whole family" | Multi-user complexity, privacy between accounts, different calorie goals | Single user per account in MVP |
| Offline-first full sync | "Works without internet" | Edge sync conflicts with a remote AI API that requires connectivity anyway. Photo recognition requires the network. | Cache last 7 days locally; surface clear "requires connection" messaging for AI features |

---

## Feature Dependencies

```
[User Authentication]
    └──required by──> [Food Diary / History]
    └──required by──> [Weight Tracking]
    └──required by──> [Streak System]

[Onboarding (height/weight/goal)]
    └──required by──> [Calorie Goal Calculation (BMR/TDEE)]
                          └──required by──> [Daily Dashboard]
                                                └──enhances──> [Progress Visualization]

[AI Photo Recognition]
    └──requires──> [Camera / Gallery Access]
    └──requires──> [Gemini API backend endpoint]
    └──enhances──> [Food Diary]
    └──enables──> [AI Confidence Indicator]
    └──enables──> [AI Correction Flow]

[Food Diary]
    └──required by──> [Daily Calorie Summary]
    └──required by──> [Macro Breakdown]
    └──required by──> [Streak System]
    └──required by──> [Progress Visualization]

[Streak System]
    └──enhances──> [Push Notifications] (streak reminders are higher CTR)

[Contextual Paywall (mock)]
    └──placed after──> [Onboarding completion]
    └──triggered by──> [Streak milestone (7 days)]
```

### Dependency Notes

- **AI Photo Recognition requires backend endpoint**: The Gemini API call cannot happen client-side (API key exposure). Backend must be live before photo logging works.
- **Onboarding required before Dashboard**: Without BMR/TDEE, the calorie target is undefined. Dashboard shows meaningless data without a target.
- **Streak System requires Food Diary**: Streaks are computed from diary entries. No diary = no streak data.
- **Paywall mock is independent**: The paywall UI can be built without RevenueCat. Show the screen, block the action, log the intent. RevenueCat wires in later.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept: "photo → macros in seconds."

- [ ] **User authentication (email/password)** — persist data across sessions; without this, nothing is saved
- [ ] **Onboarding flow** (5 questions: goal, sex, age, height, weight) — compute calorie target; first impression of the app's quality
- [ ] **AI photo recognition** (camera + gallery) — this IS the core value proposition; without it, the app is just another MFP clone
- [ ] **Manual food search fallback** — for when photo fails or user prefers typing; also covers barcode scanning as stretch goal
- [ ] **Food diary (today view)** — log meals, see what was eaten today, grouped by meal category
- [ ] **Daily calorie dashboard** — calories consumed vs target, macro rings; the "home screen" users return to daily
- [ ] **Meal history** — at minimum, last 7 days; users need to correct yesterday's log
- [ ] **Basic streak counter** — simple 1-day streak is enough to establish the habit loop; polish later
- [ ] **Push notification (daily reminder)** — "Have you logged lunch?" at 1pm; single highest-retention lever
- [ ] **Paywall mock screen** — shows premium offer, blocks action, records intent; no real payment processing

### Add After Validation (v1.x)

Features to add once core is working and users are returning.

- [ ] **Weight tracking** — add when users ask "is it working?"; requires 2+ weeks of diary data to be meaningful
- [ ] **AI correction flow** — post-recognition text chat to adjust ("it was 2 slices, not 1"); add when photo accuracy complaints emerge
- [ ] **Streak shield / recovery** — add when first users hit streak breaks and churn; Duolingo-proven retention mechanic
- [ ] **Barcode scanner** — add when users request it in reviews; validates food database coverage need
- [ ] **Weekly insights** — "You logged 5/7 days this week" with macro patterns; add after accumulating 2+ weeks of data per user
- [ ] **Water tracking** — low complexity, add to reduce churn from users who expect it

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Micronutrient tracking** — only relevant to users past the "am I hitting calories?" stage; Cronometer owns this niche
- [ ] **Custom foods / recipe builder** — defer; manual "custom food" entry (name + macros) covers 80% of the need
- [ ] **Wearable sync** — per-device API maintenance; add only if users explicitly request it with evidence
- [ ] **Social features / groups** — Cal AI added this; validate if Brazilian users want accountability features before building
- [ ] **AI meal planning** — different product category; requires dietary expertise guardrails

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AI photo recognition | HIGH | HIGH | P1 — core differentiator |
| Daily calorie dashboard | HIGH | LOW | P1 — users return for this |
| Onboarding + calorie goal | HIGH | LOW | P1 — gates entire experience |
| User authentication | HIGH | MEDIUM | P1 — required for everything |
| Food diary (today) | HIGH | LOW | P1 — primary interaction |
| Manual food search | HIGH | MEDIUM | P1 — fallback for AI failures |
| Meal history | MEDIUM | LOW | P1 — correction and review |
| Push notifications | HIGH | LOW | P1 — single best retention lever |
| Paywall mock | MEDIUM | LOW | P1 — validates monetization intent |
| Streak counter | MEDIUM | LOW | P2 — retention mechanic |
| Weight tracking | MEDIUM | LOW | P2 — add post-launch |
| AI correction flow | MEDIUM | MEDIUM | P2 — polish AI experience |
| Barcode scanner | MEDIUM | MEDIUM | P2 — user-requested |
| Water tracking | LOW | LOW | P2 — expected but not critical |
| Weekly insights | MEDIUM | MEDIUM | P2 — needs data accumulation |
| Recipe builder | LOW | HIGH | P3 — scope creep trap |
| Wearable sync | LOW | HIGH | P3 — maintenance burden |
| Social features | LOW | HIGH | P3 — validate need first |
| Micronutrient tracking | LOW | HIGH | P3 — niche, different audience |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | MyFitnessPal | Cal AI | Yazio | FatSecret | Our Approach |
|---------|--------------|--------|-------|-----------|--------------|
| AI photo recognition | Premium only (Meal Scan) | Core feature (free + paid) | Basic AI | None | Core feature, primary interaction |
| Barcode scanner | Premium only (2024 change) | Yes | Yes | Yes | v1.x (after AI validated) |
| Food database | 20M+ items (global) | Global database | Europe-focused | Large, free | TACO (Brazil) + community |
| Portion estimation | No | Yes (depth sensor) | No | No | Yes, via Gemini vision with disclosure |
| Onboarding | Standard | Modern, visual | Good | Minimal | Modern, opinionated, pt-br |
| Paywall model | Freemium (aggressive upsell) | Freemium | Freemium | Fully free | Mock MVP → RevenueCat later |
| Streaks | Yes, with badges | Yes | Yes | No | Yes, with recovery mechanic |
| Social features | Yes (underused) | Groups (2025) | No | Community forums | Defer — validate need first |
| Language | English-first | English | Multi-language | Multi-language | Portuguese (pt-br) native |
| UI quality | Dated (2024 redesign helped) | Modern | Clean | Outdated | Modern, bold, motion-forward |

---

## Brazilian Market Considerations

This app targets Brazilian users specifically (pt-br). Several features become more important or require localization:

- **TACO database integration** (Tabela de Composição de Alimentos — IBGE): Free, authoritative Brazilian nutritional data. MFP's Brazilian food data is community-contributed and error-prone. This is a structural differentiator.
- **Common Brazilian meals**: AI must recognize feijoada, coxinha, pão de queijo, açaí bowl, brigadeiro, arroz e feijão, tapioca. Gemini's training data likely under-represents these vs. pizza or hamburgers.
- **Portion sizes**: Brazilian serving conventions differ from US/European apps. A "prato feito" (PF) is not in any global database.
- **Metric units only**: Grams, kg, cm — no lb/ft confusion. Brazilian users don't toggle between unit systems.

---

## Sources

- [MyFitnessPal 2025 Winter Release](https://blog.myfitnesspal.com/winter-release/) — feature roadmap and free vs premium breakdown
- [MyFitnessPal Premium features](https://support.myfitnesspal.com/hc/en-us/articles/360032625951-What-are-the-features-of-MyFitnessPal-Premium) — official feature list
- [Cal AI App Store listing](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616) — AI photo tracker feature set
- [Cal AI CNBC profile](https://www.cnbc.com/2025/09/06/cal-ai-how-a-teenage-ceo-built-a-fast-growing-calorie-tracking-app.html) — product differentiation and growth
- [Garage Gym Reviews: Best Calorie Counter Apps](https://www.garagegymreviews.com/best-calorie-counter-apps) — expert comparison 2026
- [Fitia: Best Calorie Counter Apps 2025](https://fitia.app/learn/article/best-calorie-counter-apps-2025-rd-reviewed/) — RD-reviewed feature comparison
- [Foodvisor vs MyFitnessPal](https://www.oreateai.com/blog/foodvisor-vs-myfitnesspal-choosing-your-ideal-nutrition-companion/863d87ecbb895e7cf8e233228c793655) — AI food recognition differentiators
- [PMC: AI food recognition accuracy study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11314244/) — academic accuracy benchmarks
- [PMC: Food volume estimation challenges](https://pmc.ncbi.nlm.nih.gov/articles/PMC8115205/) — portion size estimation limitations
- [MyFitnessPal gamification case study](https://trophy.so/blog/myfitnesspal-gamification-case-study) — streak and badge retention data
- [RevenueCat: Guide to mobile paywalls](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps/) — paywall best practices
- [RevenueCat: 2025 monetization trends](https://www.revenuecat.com/blog/growth/2025-app-monetization-trends/) — contextual paywall timing
- [Medium: Fitness and Calorie Tracker Trends 2025](https://medium.com/predict/fitness-and-calorie-tracker-app-features-and-trends-to-look-for-2025-55c33d34a440) — feature trend analysis
- [Kimola: User feedback analysis on calorie apps](https://kimola.com/blog/understanding-calorie-tracking-and-nutrition-apps-through-customer-feedback-analysis) — churn and complaint patterns
- [PMC: User perspectives on diet-tracking apps](https://pmc.ncbi.nlm.nih.gov/articles/PMC8103297/) — academic user study on churn factors

---
*Feature research for: AI-powered calorie tracker mobile app (pt-br, Brazilian market)*
*Researched: 2026-03-03*
