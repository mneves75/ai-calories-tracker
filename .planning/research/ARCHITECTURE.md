# Architecture Research

**Domain:** AI-powered calorie tracker mobile app (food photo recognition)
**Researched:** 2026-03-03
**Confidence:** HIGH (stack is well-documented; patterns verified against official docs)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Camera/Image │  │  Dashboard   │  │  Meal History /      │  │
│  │  Capture     │  │  (Daily Log) │  │  Profile / Onboard   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └─────────────────┴──────────────────────┘             │
│                           │                                     │
│              ┌────────────▼───────────┐                        │
│              │    API Client Layer    │                        │
│              │  (typed Hono RPC/fetch)│                        │
│              └────────────┬───────────┘                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────┐
│                   CLOUDFLARE WORKERS (Hono API)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  /auth/*    │  │  /meals/*    │  │  /users/* /dashboard/ │  │
│  │ better-auth │  │ AI Analysis  │  │  Profile / Goals      │  │
│  │  handler    │  │  + Storage   │  │                       │  │
│  └─────────────┘  └──────┬───────┘  └───────────────────────┘  │
│                           │                                     │
│   ┌───────────────────────▼──────────────────────────────────┐  │
│   │                   Middleware Layer                        │  │
│   │       Auth Session Check │ Zod Validation │ Logging      │  │
│   └───────────────────────┬──────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
          ┌─────────────────┼────────────────────┐
          │                 │                    │
┌─────────▼────┐  ┌─────────▼──────┐  ┌─────────▼──────────┐
│ Cloudflare   │  │ Cloudflare R2  │  │  Google Gemini     │
│     D1       │  │ (Image Store)  │  │  3.0 Flash API     │
│  (SQLite DB) │  │                │  │  (Vision/AI)       │
└──────────────┘  └────────────────┘  └────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Mobile App (Expo/RN)** | UI, camera capture, state, navigation | expo-camera, expo-image-picker, React Navigation, Zustand/Context |
| **API Client Layer** | Typed HTTP calls to backend, auth token handling | Hono RPC client or plain fetch with typed contracts |
| **Hono API (Workers)** | Route handling, request validation, orchestration | Hono routes with Zod validators, c.env bindings |
| **better-auth handler** | Session creation, token validation, user creation | Mounted at `/api/auth/*`, returns session cookies |
| **AI Analysis Route** | Accept image, call Gemini, parse nutrition JSON, persist | POST /meals/analyze — orchestrates R2 upload + Gemini call |
| **Cloudflare D1** | Persist users, meals, daily logs, user goals | SQLite via D1 binding in Worker, migrations with Drizzle ORM |
| **Cloudflare R2** | Store original food images | Presigned PUT URLs or direct Worker upload |
| **Gemini 3.0 Flash** | Food recognition, nutrition estimation from image | Multimodal API call with base64 image + structured prompt |

---

## Recommended Project Structure

```
ai-calories-tracker/
├── apps/
│   ├── mobile/                  # Expo/React Native app
│   │   ├── app/                 # Expo Router file-based navigation
│   │   │   ├── (auth)/          # Auth screens (login, register)
│   │   │   ├── (tabs)/          # Main tab navigation
│   │   │   │   ├── index.tsx    # Dashboard (daily summary)
│   │   │   │   ├── camera.tsx   # Food photo capture
│   │   │   │   └── history.tsx  # Meal log history
│   │   │   └── onboarding/      # Onboarding flow (weight, goal)
│   │   ├── components/          # Reusable UI components
│   │   ├── lib/
│   │   │   ├── api.ts           # Typed API client
│   │   │   └── auth.ts          # better-auth client setup
│   │   └── store/               # State management (Zustand or Context)
│   │
│   └── api/                     # Hono Worker backend
│       ├── src/
│       │   ├── index.ts         # Hono app entry point + Worker export
│       │   ├── routes/
│       │   │   ├── auth.ts      # better-auth handler mount
│       │   │   ├── meals.ts     # POST /meals/analyze, GET /meals
│       │   │   ├── dashboard.ts # GET /dashboard/daily
│       │   │   └── users.ts     # GET/PATCH /users/me (profile, goals)
│       │   ├── middleware/
│       │   │   ├── auth.ts      # Session validation middleware
│       │   │   └── validate.ts  # Zod validation middleware
│       │   ├── services/
│       │   │   ├── gemini.ts    # Gemini API integration
│       │   │   ├── r2.ts        # R2 image storage helpers
│       │   │   └── nutrition.ts # Nutrition calculation helpers
│       │   ├── db/
│       │   │   ├── schema.ts    # Drizzle D1 schema definitions
│       │   │   └── migrations/  # D1 migration files
│       │   └── types.ts         # Shared type bindings (Env, etc.)
│       └── wrangler.toml        # Cloudflare Workers config
```

### Structure Rationale

- **apps/mobile vs apps/api:** Monorepo split keeps concerns separate; mobile and API can evolve independently with a shared types package if needed.
- **routes/ vs services/:** Routes handle HTTP, services handle business logic. Gemini service is isolated so it can be mocked during tests.
- **db/schema.ts:** Single source of truth for D1 schema; Drizzle generates migrations from it.
- **middleware/auth.ts:** Session check runs once per request, injects user into Hono context — routes never re-validate.

---

## Architectural Patterns

### Pattern 1: AI Analysis as Server-Side Orchestration

**What:** Mobile sends image to Worker; Worker orchestrates R2 upload + Gemini call + D1 persistence. Mobile never calls Gemini directly.
**When to use:** Always for this project. Keeps API key server-side, enables caching/retry, allows result validation before storage.
**Trade-offs:** Slightly higher latency than direct client-to-Gemini; worthwhile for security and control.

**Example:**
```typescript
// routes/meals.ts
app.post('/meals/analyze', authMiddleware, async (c) => {
  const { imageBase64, mealType } = await c.req.json()

  // 1. Upload to R2 for permanent storage
  const imageKey = await uploadToR2(c.env.R2, imageBase64)

  // 2. Call Gemini with structured output prompt
  const nutrition = await analyzeWithGemini(c.env.GEMINI_API_KEY, imageBase64)

  // 3. Persist to D1
  const meal = await db.insert(meals).values({
    userId: c.var.user.id,
    imageKey,
    mealType,
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    foodsDetected: JSON.stringify(nutrition.foods),
    loggedAt: new Date().toISOString(),
  }).returning()

  return c.json({ meal })
})
```

### Pattern 2: Structured JSON Output from Gemini

**What:** Prompt Gemini with explicit JSON schema expectation; parse and validate response with Zod before persisting.
**When to use:** Every AI call. Never trust free-form text for nutrition data storage.
**Trade-offs:** Slightly more prompt engineering; eliminates downstream parsing failures.

**Example:**
```typescript
// services/gemini.ts
const prompt = `Analyze this food image and return ONLY valid JSON matching this schema:
{
  "foods": [{ "name": string, "portion": string, "calories": number }],
  "totals": { "calories": number, "protein": number, "carbs": number, "fat": number },
  "confidence": "high" | "medium" | "low"
}`

const response = await gemini.generateContent({
  contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, { text: prompt }] }]
})

// Validate with Zod before trusting
const result = NutritionSchema.parse(JSON.parse(response.text))
```

### Pattern 3: Hono Middleware Auth Guard

**What:** Session validated once in middleware, injected into context. Routes read `c.var.user` without re-querying.
**When to use:** All protected routes. Keeps auth logic in one place.
**Trade-offs:** Middleware must run before route handlers (correct Hono ordering required).

**Example:**
```typescript
// middleware/auth.ts
export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  c.set('user', session.user)
  await next()
})
```

---

## Data Flow

### Primary Flow: Food Photo → Nutrition Log

```
User taps camera
    ↓
expo-camera / expo-image-picker captures image
    ↓
Mobile compresses image (resize to max 1024px, JPEG 80%)
    ↓
POST /meals/analyze  { imageBase64, mealType }
    ↓
Hono: authMiddleware validates session
    ↓
Hono: Zod validates request body
    ↓
services/r2.ts: upload image → R2 bucket (permanent storage)
    ↓
services/gemini.ts: POST to Gemini 3.0 Flash multimodal API
    ↓ (Gemini returns structured JSON: foods[], calories, macros)
services/gemini.ts: Zod validates AI response
    ↓
D1: INSERT into meals table
    ↓
Response: { meal: { id, calories, protein, carbs, fat, foods } }
    ↓
Mobile: updates daily dashboard state
```

### Auth Flow: Login / Session

```
User submits email+password (or OAuth)
    ↓
POST /api/auth/sign-in (handled by better-auth)
    ↓
better-auth validates credentials against D1 users table
    ↓
Creates session record in D1 sessions table
    ↓
Returns Set-Cookie: session_token (httpOnly, Secure)
    ↓
Mobile stores session cookie / token
    ↓
All subsequent API calls include cookie / Authorization header
    ↓
authMiddleware calls auth.api.getSession() per request
```

### Dashboard Data Flow

```
App opens / user navigates to Dashboard
    ↓
GET /dashboard/daily?date=2026-03-03
    ↓
authMiddleware injects user
    ↓
D1 query: SUM(calories/protein/carbs/fat) WHERE userId = ? AND date = ?
    ↓
D1 query: SELECT meals WHERE userId = ? AND date = ? ORDER BY loggedAt
    ↓
Response: { totals: {...}, meals: [...], goals: {...}, remainingCalories: N }
    ↓
Mobile renders circular progress + meal cards
```

### State Management (Mobile)

```
Server state (React Query / SWR):
    GET /dashboard/daily  →  cached, refetched on focus
    GET /meals            →  paginated meal history
    GET /users/me         →  user profile + goals

Local UI state (Zustand or useState):
    Camera capture state (preview image, loading, error)
    Onboarding step progress
    Paywall mock visibility
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Gemini 3.0 Flash** | Server-side HTTP POST from Worker using GEMINI_API_KEY env var | Base64 inline data for images <20MB — food photos qualify easily |
| **Cloudflare R2** | Direct Worker binding via `c.env.R2.put(key, body)` | Use content-addressed keys (hash of image) to deduplicate |
| **better-auth** | Mounted at `/api/auth/*` in Hono, D1 adapter for session persistence | Configure `trustedOrigins` for mobile app scheme |
| **RevenueCat (future)** | Client-side SDK in mobile app, server-side webhook for entitlement sync | Isolate behind a feature flag; mock paywall requires no server changes now |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Mobile ↔ Worker API | HTTPS REST (JSON); Hono RPC client for type safety if desired | Never expose D1 or Gemini credentials to mobile client |
| Hono routes ↔ Services | Direct function call (same Worker process) | No HTTP between them — Workers are single-process |
| Hono ↔ D1 | D1 binding (SQLite); Drizzle ORM for queries | Drizzle generates type-safe queries; no raw SQL in routes |
| Hono ↔ better-auth | `auth.handler(c.req.raw)` for auth routes; `auth.api.getSession()` in middleware | better-auth manages its own D1 tables (users, sessions, accounts) |

---

## Database Schema (Core Tables)

```sql
-- Managed by better-auth (auto-created)
users (id, email, name, emailVerified, image, createdAt, updatedAt)
sessions (id, userId, token, expiresAt, createdAt, updatedAt)
accounts (id, userId, provider, providerAccountId, ...)

-- Application tables
user_profiles (
  id, userId FK, weightKg, heightCm, birthDate,
  goalType ENUM(lose|maintain|gain),
  dailyCalorieGoal, dailyProteinGoal,
  createdAt, updatedAt, deletedAt
)

meals (
  id, userId FK, imageKey,      -- R2 object key
  mealType ENUM(breakfast|lunch|dinner|snack),
  calories, protein, carbs, fat, -- per meal totals
  foodsDetected TEXT,            -- JSON array of identified foods
  aiConfidence ENUM(high|medium|low),
  loggedAt, createdAt, deletedAt -- soft delete
)

daily_summaries (
  id, userId FK, date,           -- YYYY-MM-DD
  totalCalories, totalProtein, totalCarbs, totalFat,
  mealsCount, updatedAt
  -- Materialized for fast dashboard queries; recomputed on meal insert/delete
)
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Single Worker deployment, single D1 database, no caching needed. Gemini free tier covers ~1k analyses/day. |
| 1k–50k users | Add Cloudflare Cache for dashboard responses (short TTL). Consider KV for session caching. Monitor D1 read/write limits. |
| 50k+ users | D1 read replicas across regions. Gemini batch API or self-hosted vision model. R2 with CDN for image delivery. |

### Scaling Priorities

1. **First bottleneck:** Gemini API rate limits and cost. At scale, cache AI results for identical (or near-identical) images using a perceptual hash as R2 key. Deduplication avoids re-analyzing the same banana.
2. **Second bottleneck:** D1 write throughput (D1 SQLite is optimized for reads). Batch daily_summaries updates — update once after meal insert rather than querying SUM on every dashboard load.

---

## Anti-Patterns

### Anti-Pattern 1: Calling Gemini Directly from Mobile

**What people do:** Pass GEMINI_API_KEY to mobile app, call Gemini from the client.
**Why it's wrong:** API key is extractable from the app binary. Any user can drain your quota or access your billing account.
**Do this instead:** Always proxy through the Worker. Mobile sends image to your API; Worker holds the key.

### Anti-Pattern 2: Storing Raw AI Response Without Validation

**What people do:** Save `gemini.response.text` directly to the database.
**Why it's wrong:** Gemini occasionally returns malformed JSON or hallucinated nutrition values (1000g protein). Raw text corrupts downstream calculations.
**Do this instead:** Parse and validate with Zod schema before INSERT. Reject or flag low-confidence responses.

### Anti-Pattern 3: Querying SUM on Every Dashboard Load

**What people do:** `SELECT SUM(calories) FROM meals WHERE userId=? AND date=?` on every dashboard open.
**Why it's wrong:** Fine at 10 meals/user, problematic at scale. D1 SQLite has query time limits.
**Do this instead:** Maintain `daily_summaries` table; update atomically when meals are inserted/deleted. Dashboard reads the pre-aggregated row.

### Anti-Pattern 4: No Soft Delete on Meals

**What people do:** `DELETE FROM meals WHERE id=?` on user correction.
**Why it's wrong:** Destroys audit trail. Users expect to see what they logged and corrected. Breaks `daily_summaries` reconciliation.
**Do this instead:** `UPDATE meals SET deletedAt=NOW() WHERE id=?`. Recompute daily summary. Keep the record.

### Anti-Pattern 5: Sending Full-Resolution Images to Gemini

**What people do:** Upload raw camera image (5–15MB, 4032×3024px) directly.
**Why it's wrong:** Wastes tokens. Gemini tiles large images into 258-token chunks each. A 12MP photo costs dramatically more than a 1024px version. Upload latency also suffers.
**Do this instead:** Resize on mobile before upload (max 1024px on longest edge, JPEG quality 80). Gemini sees enough detail for food recognition at this resolution.

---

### Build Order Implications

Dependencies between components drive this order:

1. **Backend foundation first** — D1 schema + Hono skeleton + better-auth. Nothing else can be built without auth working and the database migrated.
2. **Auth flow** (mobile login/register screens + session handling) — required before any protected route works on mobile.
3. **Core AI meal analysis** — the product's central value. Worker route + Gemini integration + D1 meal insert + R2 image storage. Can be tested via curl/Postman before mobile UI.
4. **Dashboard + history screens** — reads from D1, no AI needed. Once data exists from step 3, these screens can be built and iterated.
5. **Onboarding + user profile** — user_profiles table, goal setup. Informs daily calorie targets shown on dashboard.
6. **Polish: paywall mock, UI refinement, pt-br copy** — no dependencies on core systems; can be done last.

---

## Sources

- [Hono on Cloudflare Workers — Official Docs](https://hono.dev/docs/getting-started/cloudflare-workers) — HIGH confidence
- [better-auth Hono Integration — Official Docs](https://www.better-auth.com/docs/integrations/hono) — HIGH confidence
- [better-auth on Cloudflare — Hono Examples](https://hono.dev/examples/better-auth-on-cloudflare) — HIGH confidence
- [Gemini Vision API — Google AI Docs](https://ai.google.dev/gemini-api/docs/vision) — HIGH confidence
- [Cloudflare R2 Upload Patterns — CF Docs](https://developers.cloudflare.com/workers/tutorials/upload-assets-with-r2/) — HIGH confidence
- [Gemini 3 Flash Vision Capabilities](https://getstream.io/blog/gemini-vision-ai-capabilities/) — MEDIUM confidence
- [Build Scalable Cloudflare Workers with Hono, D1, KV](https://medium.com/@jleonro/build-scalable-cloudflare-workers-with-hono-d1-and-kv-a-complete-guide-to-serverless-apis-and-2c217a4a4afe) — MEDIUM confidence
- [SnapCalorie Computer Vision Architecture — TechCrunch](https://techcrunch.com/2023/06/26/snapcalorie-computer-vision-health-app-raises-3m/) — MEDIUM confidence (2023, pattern still applies)
- [better-auth + Cloudflare Workers community discussion](https://github.com/better-auth/better-auth/discussions/7963) — MEDIUM confidence

---
*Architecture research for: AI-powered calorie tracker mobile app*
*Researched: 2026-03-03*
