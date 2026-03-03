# Pitfalls Research

**Domain:** AI-powered calorie tracker mobile app (React Native/Expo + Bun/Hono/Cloudflare Workers/D1 + Gemini 2.0 Flash + better-auth)
**Researched:** 2026-03-03
**Confidence:** HIGH (critical pitfalls verified via official docs + multiple sources); MEDIUM (UX/AI accuracy from research studies + community reports)

---

## Critical Pitfalls

### Pitfall 1: Gemini Free Tier Quota Collapse

**What goes wrong:**
In December 2025 Google silently cut the Gemini API free tier RPD from 250 requests/day to 20 — a 92% reduction that broke production apps overnight. An app that worked fine in development or light testing hits quota exhaustion with a handful of real users, returning 429 errors for every AI food scan.

**Why it happens:**
Developers build and test against the free tier (generous during development), ship to production without upgrading to a paid quota tier, and get blindsided when Google adjusts limits without prior notice.

**How to avoid:**
- Never build a production AI feature assuming free-tier quotas will hold — they are a moving target.
- From Phase 1 (AI integration), configure the Gemini API with a paid tier API key and set explicit rate-limit error handling.
- Implement a queue/retry layer: if a 429 is received, queue the request for retry rather than surfacing a hard failure to the user.
- Add cost monitoring from day one: track tokens-per-request for each food scan. Images consume ~258 tokens input on Gemini 2.0 Flash at $0.10/1M tokens — negligible per request, but cost scales linearly with users.
- Current Gemini 2.0 Flash paid pricing: input $0.10/1M tokens, output $0.40/1M tokens. A typical food scan (image + prompt + response) costs ~$0.0002 — plan budget around this.

**Warning signs:**
- AI scans work perfectly in dev/staging but fail for some users in production.
- Logs show 429 responses from Gemini API.
- Error rate spikes after user count crosses ~10-20/day on free tier.

**Phase to address:** Phase 1 (AI food recognition integration) — set up paid tier and error handling before any user testing.

---

### Pitfall 2: AI Portion Size Estimation is Fundamentally Unreliable Without Depth Reference

**What goes wrong:**
The app correctly identifies "frango grelhado" but estimates 150g when the actual portion is 300g. Even state-of-the-art food AI systems show calorie errors of 20-50% on portions. Research shows apps overestimate energy for Western diets by ~1,040 kJ and underestimate for mixed/Asian dishes by ~1,520 kJ. A 20% error on a 1,500-calorie diet is 300 calories — enough to completely negate expected weight loss progress.

**Why it happens:**
2D images contain no depth information. Without a reference object (coin, hand, plate with known diameter), AI cannot determine true volume. AI classifies food correctly (HIGH confidence) but guesses weight from training distribution averages (LOW reliability). The model's confidence score does not reflect portion accuracy.

**How to avoid:**
- Design the UX to explicitly communicate that calorie estimates are approximate ("~" prefix on all AI-generated values, e.g. "~480 kcal").
- In the Gemini prompt, instruct the model to return a confidence range: `{ "calories": 480, "calories_min": 380, "calories_max": 580 }` — display the range to users.
- After the AI scan, always allow users to adjust portion size via a simple slider or quick-edit ("+/-" buttons) before saving. This is the correction loop that makes the product honest.
- For the database schema, store `calories_estimated` and `calories_adjusted` as separate fields so you can track correction rates and improve prompts over time.
- Consider prompting users to place a standard reference (e.g., the phone itself, a fork) in frame — even a soft suggestion improves estimates.

**Warning signs:**
- User feedback says "the calories seem way off."
- Users consistently editing calorie values after AI scans.
- Correction rate (adjusted vs. AI-estimated) exceeds 30% in analytics.

**Phase to address:** Phase 1 (AI integration) — build the correction UX from the start, not as a later patch.

---

### Pitfall 3: Cloudflare Workers 128 MB Memory Limit with Base64 Image Payloads

**What goes wrong:**
A 4MB camera photo encoded as base64 becomes ~5.3MB of text. The Worker receives this in the request body, decodes it, and passes it to Gemini. With concurrent requests, the Worker isolate runs out of its 128 MB memory limit and throws Error 1102. The app crashes for users with high-resolution cameras or multiple simultaneous uploads.

**Why it happens:**
Developers test with small images from the simulator/gallery, never test with full-resolution camera captures (iPhone 15 Pro shoots 48MP RAW, actual JPEGs are 6-12 MB). Base64 adds 33% overhead. Buffering the entire image in Worker memory for processing hits the ceiling fast.

**How to avoid:**
- Compress images on the client BEFORE sending: resize to max 1024px longest edge, JPEG quality 75-80%. This brings a typical food photo under 300KB — well within limits.
- Use `expo-image-manipulator` or `expo-image-compressor` in the mobile app to compress before upload.
- On the Worker, stream the body rather than buffering: use `TransformStream` patterns and avoid `await request.arrayBuffer()` for large payloads.
- Set a server-side max payload size check (reject > 2MB with a 413 error) to prevent abuse and memory exhaustion.
- The correct architecture: mobile compresses → sends compressed image → Worker validates size → passes to Gemini as base64 inline data. This keeps Worker memory usage under 10MB per request.

**Warning signs:**
- Error 1102 (Worker exceeded memory limit) in Cloudflare logs.
- Uploads fail intermittently on physical devices but work in simulator.
- Response times degrade as concurrent users increase.

**Phase to address:** Phase 1 (AI integration) and Phase 2 (image handling) — compression must be built into the upload flow from the start.

---

### Pitfall 4: D1 Sequential Write Bottleneck Under Concurrent Load

**What goes wrong:**
D1 is built on SQLite: single-threaded, one write transaction at a time. At low user counts this is invisible. As concurrent meal-logging increases (breakfast time surge, lunch surge), write queries queue up. A Worker writes a meal entry, another Worker simultaneously logs a different user's meal — they serialize. At 10+ concurrent writes, latency spikes to hundreds of milliseconds; at 100+ concurrent writes, requests time out.

**Why it happens:**
D1's per-database throughput is ~10 queries/second at 100ms query time (or ~1,000/s at 1ms). Meal logging writes are simple inserts, so latency is low — but the single-writer model is the hard ceiling. Developers assume SQLite's distributed edge deployment means horizontal scaling, which it does not at the write layer.

**How to avoid:**
- Keep meal insert queries extremely simple and fast: pre-compute all values (total calories, macros) in the application layer before writing — do NOT compute them in SQL triggers or complex queries.
- Use D1 batch API (`db.batch([...])`) to combine related inserts (meal + food_items) into a single round-trip rather than sequential awaited queries.
- Design the schema to minimize write fan-out: a single meal row should capture all needed data, not require writes to 3-5 related tables per log event.
- For the MVP scale (hundreds of users), this is not a blocking issue. Design the schema correctly from Phase 1 so you are not refactoring under load later.
- If the app reaches thousands of concurrent users, the mitigation is sharding by user (each user gets their own D1 database) — but this requires schema/API changes to implement late.

**Warning signs:**
- P95 API response time > 500ms for meal log endpoints.
- D1 query logs show serialized waits during peak hours.
- Meal save operations succeed but take 2-5 seconds.

**Phase to address:** Phase 1 (database schema design) — get the schema right (minimal writes per log action) before building features on top of it.

---

### Pitfall 5: Cloudflare Workers Global Mutable State — Cross-Request Data Leaks

**What goes wrong:**
A module-level variable (e.g., `let currentUser = null`) is set during Request A's handler. Worker isolates are reused across requests. Request B from a different user reads `currentUser` and gets Request A's user data — a serious security and data integrity bug that is completely invisible in single-user testing.

**Why it happens:**
Developers coming from traditional Node.js/Express assume each request gets a fresh execution context. In Workers, isolates are intentionally reused for performance. Any state stored at module scope persists between requests processed by the same isolate.

**How to avoid:**
- Treat the Worker handler function as the only safe scope for request-scoped state. Never store user ID, session data, or request context in module-level variables.
- Pass all state through function arguments or the Hono `c` (context) object.
- Use Hono's middleware context (`c.set('user', user)`) for request-scoped data, not module globals.
- In code review, flag any `let` or `var` declarations at module scope that could hold request data.

**Warning signs:**
- Users occasionally see another user's meal data (severe — rare but catastrophic).
- Intermittent authorization errors where valid sessions are rejected.
- Bug that only appears under load (multiple concurrent requests to same isolate).

**Phase to address:** Phase 1 (backend setup) — establish the pattern before writing any route handlers.

---

### Pitfall 6: better-auth Session Loss on App Reopen (Expo/React Native)

**What goes wrong:**
User logs in, closes the app, reopens it — and is logged out. Session is not persisted across app restarts. On native platforms, better-auth caches session data in `SecureStore`, but authenticated requests to the server require manually retrieving the session cookie from `SecureStore` and adding it to request headers. Developers who do not implement this step build an app that logs users out on every restart — a retention killer.

**Why it happens:**
better-auth's Expo integration is more manual than its web integration. The session is stored, but the mobile HTTP client must explicitly read it and inject it. The web client handles this automatically via cookies; React Native does not.

**How to avoid:**
- Follow the official better-auth Expo integration guide exactly: use `@better-auth/expo` plugin, configure `SecureStore` as the storage provider.
- Implement a session bootstrap function that runs on app launch: reads from `SecureStore`, validates with the server, sets auth state. If validation fails, redirect to login.
- Use the Expo plugin's `cookieCache` option so the session is available synchronously on app load (eliminates loading spinner on reopen).
- Test session persistence explicitly: log in, force-kill the app (not just background), reopen — the user must be still logged in.
- Requires Expo SDK 55+ and New Architecture (Legacy Architecture is no longer supported by better-auth).

**Warning signs:**
- Users complain about having to log in every time they open the app.
- Auth state is undefined on app cold start.
- Test: kill app in iOS simulator, relaunch — if login screen appears, session persistence is broken.

**Phase to address:** Phase 2 (authentication) — implement and test session persistence as part of auth setup, not after.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store raw AI response string in DB instead of parsed JSON | Faster MVP | Cannot query, filter, or aggregate nutrition data; requires migration | Never — parse and store structured data from day one |
| Hardcode Gemini API key in Worker source | Simpler setup | Key exposed in version control, no rotation possible | Never — use Cloudflare Worker secrets (`wrangler secret put`) |
| Skip image compression on client | Less code | Memory crashes on Workers, slow uploads on cellular, bad UX | Never — compression is 5 lines of code with major impact |
| Use `calories INTEGER` instead of `REAL` | Simpler | Rounding errors accumulate across daily totals; macro calculations become inaccurate | Never — use `REAL` for all nutrient values |
| Single `meals` table for everything | Fast schema | Cannot store multiple food items per meal, cannot support editing individual items | MVP-only with planned migration; acceptable if schema is designed for extension |
| Skip daily calorie goal validation on server | Less code | Users can set 0-calorie goals, causing division-by-zero in progress calculations | Never — validate all user-entered health data on the server |
| Return raw Gemini JSON to mobile client | Simpler backend | Exposes AI prompt structure, model internals; no validation layer | Never — always validate and normalize AI output before sending to client |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gemini API | Sending full-resolution image as base64 inline | Compress to <300KB on client before encoding; Gemini processes images up to 20MB but Worker memory is the real ceiling |
| Gemini API | Using free-tier key in production | Use paid key from day one; implement 429 retry with exponential backoff |
| Gemini API | Prompting without a strict JSON schema | Use `responseMimeType: "application/json"` with a full `responseSchema` (Zod/JSON Schema) — eliminates parse failures entirely |
| Gemini API | Trusting the model's food identification when image is blurry/dark | Add a `confidence` field to the response schema; if `confidence < 0.7`, show "Could not identify food clearly — please retake photo" |
| Cloudflare D1 | Running `await db.prepare().run()` multiple times sequentially per request | Use `db.batch([stmt1, stmt2])` — single round-trip, atomic, faster |
| Cloudflare D1 | Forgetting that only SELECT queries are auto-retried | Wrap non-idempotent writes in application-level retry logic |
| better-auth + Expo | Not injecting session cookie into fetch headers on native | Use `authClient.getSession()` to retrieve token; add as `Cookie` header to all authenticated requests |
| better-auth + Workers | Using Node.js-specific crypto modules | better-auth on Workers must use Web Crypto API; ensure the adapter uses `crypto.subtle` not `node:crypto` |
| Expo ImagePicker | Using `type` property from ImagePicker result directly on Android | Manually construct MIME type from file extension: `image/${ext}` — the `type` property is unreliable on Android |
| Expo Camera | Checking permissions only once at startup | Use `useCameraPermissions()` hook; re-check before each camera open — users can revoke permissions in iOS Settings between launches |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full meal history on dashboard load | Dashboard slow on users with >30 days of data | Paginate from the start: `LIMIT 7` for dashboard view, lazy-load history | ~30 days of data (hundreds of rows) |
| Storing images in D1 as BLOBs | D1 row size limit is 2MB; image uploads silently fail or corrupt | Never store images in D1. Store in Cloudflare R2 or send directly to Gemini without persistence | First image > 2MB |
| Re-processing AI analysis on every render | UI jank, excessive API calls, runaway costs | Cache AI results in DB immediately after first analysis; never re-call Gemini for the same meal | Immediately — any re-render triggers new API call |
| Computing daily totals with a SUM query on every dashboard load | Slow queries as meal count grows | Maintain a `daily_summary` table updated on each meal insert/delete | ~500 meal entries per user (~1.5 years of daily use) |
| Sending full user meal history as context to Gemini for "personalized" suggestions | Token costs explode with user history | Keep Gemini calls stateless for food recognition; only send the image + structured prompt | Any user with >1 week of data |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hardcoding Gemini API key in Worker code or mobile app bundle | Key extracted from binary/source — attacker runs unlimited AI queries at your cost | Use `wrangler secret put GEMINI_API_KEY`; never in source code; rotate if exposed |
| Storing raw food images on the server after analysis | Privacy liability; LGPD compliance risk (Brazilian users); breach exposes meal photos | Do not persist images at all — send to Gemini, get response, discard image immediately |
| Not validating AI-returned nutrition values server-side | Malicious or hallucinated responses could store `calories: -9999999` or `calories: 999999` in DB | Validate all Gemini response fields: calories must be 0-5000, protein 0-500, fat 0-500, carbs 0-1000 |
| Exposing user meal history via unscoped D1 queries | User A can fetch User B's meals if user_id is not enforced in every query | Every D1 query that reads meal data MUST include `WHERE user_id = ?` with the authenticated user's ID — never trust client-provided user IDs |
| Logging food images or base64 payloads in Worker logs | Meal photos appear in Cloudflare dashboard logs — privacy violation | Sanitize all Worker logs: never log request bodies for image endpoints; log only metadata (file size, content-type) |
| No rate limiting on the AI scan endpoint | Attacker can run unlimited scans, exhausting Gemini quota and costing money | Implement per-user rate limiting: max 50 AI scans/day (Cloudflare Workers KV for rate limit counters) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "480 calories" (exact) from AI | Users trust false precision; feel misled when they discover inaccuracy | Always show "~480 kcal" — the tilde signals AI estimation, sets honest expectations |
| Requiring account creation before showing app value | 60-80% of users abandon at mandatory signup before seeing the product | Show a demo scan or sample dashboard immediately; defer auth to first save action |
| No loading state during AI scan (2-5 second wait) | Users think app is frozen; tap multiple times, duplicate submissions | Show animated food-scanning UI during Gemini call; disable submit button after first tap |
| Logging friction: too many taps to save a meal | Users stop logging after a few days — kills the core retention loop | AI scan → review screen → single tap to confirm. Max 3 taps from photo to logged meal |
| Showing only today's calories without progress context | Users have no sense of whether they are on track | Always show "480 / 2000 kcal" with a visual progress ring on the dashboard — context is everything |
| Onboarding that collects weight/height/goal upfront with no explanation | Users skip or enter fake data | Explain WHY each field matters ("Your weight helps us estimate your daily calorie target") immediately adjacent to each field |
| No correction flow after AI scan | Users stuck with wrong calorie count if AI misidentified food | Post-scan screen must allow: edit food name, edit portion size, edit calories. AI is a starting point, not final truth |
| App in pt-br but error messages in English | Breaks immersion; confuses non-English users | All user-facing strings — including error messages from API — must be in pt-br. Map all error codes to pt-br messages in the mobile app |

---

## "Looks Done But Isn't" Checklist

- [ ] **AI food scan:** Shows a result — but is the result validated? Verify that out-of-range values (calories > 5000, negative macros) are rejected server-side, not just displayed.
- [ ] **Authentication:** Login works — but does session persist after force-killing the app? Test: log in, kill app from app switcher, relaunch. Must still be logged in.
- [ ] **Meal logging:** Save button works — but is `user_id` enforced in the DB query? Test: try fetching `/api/meals?userId=OTHER_USER_ID` — must return 403, not their data.
- [ ] **Daily dashboard:** Shows today's calories — but what happens on day 2? Verify the date filtering uses the user's local timezone, not UTC (a UTC meal at 11 PM in Brazil is the next day in UTC).
- [ ] **Onboarding:** User completes onboarding — but is their TDEE/calorie goal calculated and stored? Check DB: `daily_calorie_goal` must be set after onboarding, not null.
- [ ] **Image upload:** Works on simulator — but tested on a real iPhone with full-resolution camera capture? Verify compressed image size < 300KB before upload.
- [ ] **Error handling:** Happy path works — but what does the user see when Gemini returns a 429 or 500? There must be a pt-br user-facing message, not a raw JSON error or blank screen.
- [ ] **Paywall mock:** Premium screen appears — but does it gate any actual functionality? The mock must block the correct features so RevenueCat integration requires no schema changes.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Gemini free tier quota exhausted in production | LOW | Upgrade to paid tier in Google AI Studio; add retry logic; no schema changes needed |
| Images stored in D1 as BLOBs | HIGH | Migrate to R2; update all image references in DB; rewrite upload/retrieval logic |
| Raw AI strings stored instead of parsed nutrition JSON | HIGH | Write migration script to re-parse stored strings; add new structured columns; backfill; risky if AI responses varied |
| Session persistence not implemented | MEDIUM | Add `SecureStore` integration + session bootstrap; requires auth flow refactor but no DB changes |
| Global mutable state in Workers discovered in production | MEDIUM | Audit all module-level vars; refactor to function-scope; deploy; no DB changes |
| Calories stored as INTEGER instead of REAL | MEDIUM | D1 `ALTER TABLE` to change column type (SQLite is flexible with type affinity); recalculate stored totals |
| No rate limiting on AI endpoint | LOW | Add KV-based rate limiter middleware in Hono; deploy; no DB changes |
| Timezone bug (UTC vs local) corrupting daily totals | HIGH | Requires data audit and potential backfill; store `meal_date` as explicit local date string (`YYYY-MM-DD`) from client, never derive from UTC timestamp |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Gemini quota exhaustion | Phase 1: AI integration | Paid tier key configured; 429 handler tested with mock; cost monitoring in place |
| AI portion size inaccuracy | Phase 1: AI integration | Response schema includes `calories_min/max`; correction UX exists on scan result screen |
| Workers 128MB memory limit | Phase 1: image handling | End-to-end test with full-res iPhone photo confirms <300KB upload after compression |
| D1 sequential write bottleneck | Phase 1: database schema | Schema designed for single-insert-per-meal; `db.batch()` used for multi-table writes |
| Workers global mutable state | Phase 1: backend setup | Code review checklist: zero module-level mutable vars in route handlers |
| better-auth session loss | Phase 2: authentication | Manual test: kill app, relaunch, verify authenticated state preserved |
| Nutrition values not validated | Phase 1: API design | Server-side validation rejects out-of-range values; tested with adversarial inputs |
| Missing user_id scoping in queries | Phase 1: database schema | Security test: authenticated user cannot access other users' data |
| Timezone bug in daily totals | Phase 1: database schema | `meal_date` stored as local date string from client; dashboard verified at 11:30 PM local time |
| Hardcoded API keys | Phase 1: backend setup | `wrangler secret list` shows all keys; zero secrets in source code |
| No pt-br error messages | Phase 3: UI polish | All API error codes map to pt-br strings; tested by triggering every error path |
| Onboarding without calorie goal | Phase 2: onboarding | After onboarding, DB row shows non-null `daily_calorie_goal` |

---

## Sources

- [How Accurate Are AI Calorie Counters?](https://whatthefood.io/blog/how-accurate-are-ai-calorie-counters) — accuracy error rates, portion size limitations
- [AI food tracking apps need improvement to address accuracy, cultural diversity — University of Sydney](https://www.sydney.edu.au/news-opinion/news/2024/08/29/ai-food-tracking-apps-need-improvement-to-address-cultural-diversity.html) — research on calorie estimation errors by diet type
- [Cloudflare Workers Limits (official)](https://developers.cloudflare.com/workers/platform/limits/) — 128MB memory, CPU limits, request size limits
- [Cloudflare D1 Limits (official)](https://developers.cloudflare.com/d1/platform/limits/) — 10GB max, sequential writes, 30s query limit
- [Cloudflare Workers Best Practices (Feb 2026)](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) — global mutable state, floating promises, cross-request leaks
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) — token costs per image
- [Gemini API Rate Limits 2026 — Complete Guide](https://blog.laozhang.ai/en/posts/gemini-api-rate-limits-guide) — free tier 92% quota cut in Dec 2025
- [Gemini Structured Output (official)](https://ai.google.dev/gemini-api/docs/structured-output) — JSON schema, responseMimeType, responseSchema
- [better-auth Expo Integration (official)](https://better-auth.com/docs/integrations/expo) — SecureStore session, native cookie handling
- [better-auth React Native reload issue #4570](https://github.com/better-auth/better-auth/issues/4570) — session loss on app reopen
- [Expo ImagePicker — Android type property issue](https://bmsptra.medium.com/resolving-network-request-failed-error-in-expo-app-when-uploading-images-to-server-931f5cb6bfe6) — FormData MIME type bug
- [Cal AI Security Analysis — NowSecure](https://www.nowsecure.com/marc-app/cal-ai-food-calorie-tracker-android/) — hardcoded credentials in calorie tracker binaries
- [Calorie Tracking Apps: Why Hackers Are Hungry for Your Data — Bitdefender](https://www.bitdefender.com/en-us/blog/hotforsecurity/calorie-tracking-apps-why-hackers-are-hungry-for-your-data) — health data privacy risks
- [Scaling Cloudflare D1 from 10GB — DEV Community](https://dev.to/araldhafeeri/scaling-your-cloudflare-d1-database-from-the-10-gb-limit-to-tbs-4a16) — D1 architecture and write throughput limits
- [Mobile App Retention: Fitness App UX patterns](https://www.uxmatters.com/mt/archives/2025/01/mobile-ux-design-patterns-and-their-impacts-on-user-retention.php) — onboarding friction, logging friction
- [Automated Food Weight Estimation Using Computer Vision — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11644939/) — portion estimation error rates (MAPE, RMSE benchmarks)
- [Bypassing Cloudflare Upload Limit](https://tpetrina.com/til/2025-01-02-cloudflare-upload-limit) — workarounds for request size limits

---
*Pitfalls research for: AI-powered calorie tracker (React Native/Expo + Cloudflare Workers/D1 + Gemini 2.0 Flash + better-auth)*
*Researched: 2026-03-03*
