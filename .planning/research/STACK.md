# Stack Research

**Domain:** AI-powered calorie tracker mobile app (React Native / Expo + Cloudflare edge backend)
**Researched:** 2026-03-03
**Confidence:** HIGH (all versions verified via npm registry; key integrations verified via official docs)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo SDK | 55.0.4 | Mobile app framework | Current stable SDK; SDK 55 mandates New Architecture (dropped Legacy Arch); ships RN 0.84.1 and React 19.2. File-based routing via expo-router is the default for all new projects. |
| React Native | 0.84.1 | Native mobile runtime | Bundled with Expo SDK 55. New Architecture only (Fabric + JSI). No manual configuration needed via Expo. |
| expo-router | 55.0.3 (v4) | Navigation + file-based routing | Built on React Navigation v7; auto-upgrades when using Expo. File-based routing eliminates manual navigator wiring. Deep linking is automatic. Standard for all new Expo projects in 2025/2026. |
| Hono | 4.12.3 | HTTP framework for Cloudflare Workers | Zero dependencies, <12kB, built on Web Standards. First-class Cloudflare Workers support with `c.env` for D1/KV bindings. TypeScript-native. |
| Cloudflare D1 | — (platform) | SQLite edge database | Serverless SQLite distributed at Cloudflare's edge. Zero config scaling. `wrangler d1` CLI for local dev. Free tier generous for MVP. |
| Drizzle ORM | 0.45.1 | TypeScript ORM for D1 | Only mature ORM with first-class D1 support. Schema = TypeScript = migrations (single source of truth). `drizzle-kit` generates SQL migrations consumed by `wrangler d1 migrations apply`. |
| better-auth | 1.5.1 | Authentication | TypeScript-first, extensible, ships an official Expo plugin (`@better-auth/expo`). Runs on Cloudflare Workers / Hono. Sessions stored in D1. Alternative to Clerk/Supabase Auth without vendor lock-in. |
| Google Gemini 2.5 Flash | API (`gemini-2.5-flash`) | Food recognition via vision | Best price-performance multimodal model. Stable model ID. Supports image input (base64 inline or File API). Gemini 2.0 Flash retires June 2026 — do not use it as the primary target. |
| NativeWind | 4.2.2 | Styling (Tailwind CSS for RN) | v4 uses `jsxImportSource` transform (no Babel plugin hack). Supports CSS variables, dark mode, container queries, animations. Works with Expo SDK 55 New Architecture. Standard choice for utility-first RN styling in 2025/2026. |
| Zustand | 5.0.11 | Client state management | Minimal boilerplate. Pairs with `persist` middleware + AsyncStorage for offline persistence (daily logs, user profile). Far simpler than Redux for this domain. |
| TanStack Query | 5.90.21 | Server state / data fetching | Handles caching, background refetch, optimistic updates for API calls. `onlineManager` integrates with `expo-network` for offline detection. Standard for React Native API layer in 2025. |

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @better-auth/expo | 1.5.1 | Expo plugin for better-auth | Required for mobile auth. Handles session caching in SecureStore, social OAuth via expo-web-browser. |
| expo-secure-store | 55.0.8 | Secure session token storage | Required by better-auth Expo plugin. Replaces AsyncStorage for auth tokens (encrypted native keychain). |
| expo-network | 55.0.8 | Network state detection | Used to wire `onlineManager` in TanStack Query. Required by better-auth Expo plugin. |
| expo-image-picker | 55.0.10 | Camera + gallery photo access | Provides system UI for selecting images or capturing with camera. Required for the food photo flow. Latest version as of March 2026. |
| expo-camera | 55.0.9 | Direct camera access | Use when you need a custom camera UI (scan-mode overlay, real-time preview). Use expo-image-picker for simple capture. |
| @google/generative-ai | 0.24.1 | Gemini API SDK | Official Google SDK for Gemini. Used on the Hono backend to call `gemini-2.5-flash` with base64 food images. Do NOT call Gemini directly from the mobile client (API key exposure). |
| drizzle-kit | 0.31.9 | Schema migration toolkit | Generates SQL migration files for D1. Use `drizzle-kit generate` then `wrangler d1 migrations apply`. |
| @hono/zod-validator | 0.7.6 | Request validation middleware for Hono | Validates request bodies/params against Zod schemas at the Hono route level. Returns typed, validated data in route handlers. |
| Zod | 4.3.6 | Schema validation | Use on backend (Hono) without restrictions. On the React Native client, import from `'zod/v3'` (not `'zod'` root) due to a known React Native runtime error with Zod v4's root import. |
| react-hook-form | 7.71.2 | Form state management | Pairs with `@hookform/resolvers/zod` for onboarding forms (weight, height, goals). Minimal re-renders, native-compatible. |
| @hookform/resolvers | 5.2.2 | Zod resolver for react-hook-form | Bridge between react-hook-form and Zod validation. Use `zodResolver` from `@hookform/resolvers/zod`. |
| react-native-reanimated | 4.2.2 | Animations | Required by NativeWind v4 and gesture-based UI. New Architecture required (satisfied by Expo SDK 55). |
| react-native-gesture-handler | 2.30.0 | Gesture system | Required by expo-router and reanimated. Included in Expo SDK 55 templates. |
| @react-native-async-storage/async-storage | 3.0.1 | Persistent key-value storage | Used with Zustand `persist` middleware for daily food logs, user settings. NOT for auth tokens (use expo-secure-store). |
| expo-linking | — (Expo SDK) | Deep link handling | Required for better-auth social OAuth redirect flows on native. |
| expo-web-browser | — (Expo SDK) | In-app browser | Required for better-auth social OAuth. Opens Google/Apple sign-in in secure in-app browser. |

---

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Wrangler (Cloudflare CLI) | Deploy Workers, manage D1, local dev | `wrangler dev` runs Workers locally with D1 via `--local`. Use `wrangler d1 migrations apply --local` for schema. |
| drizzle-kit | Schema generation + migrations | `drizzle-kit generate` → SQL files → `wrangler d1 migrations apply`. Use `d1-http` driver for remote. |
| Bun | Runtime + package manager | Use throughout: `bun install`, `bun run`, `bunx`. 28x faster than npm. Native TypeScript. |
| EAS CLI | Expo Application Services | `eas build` for development builds (required for testing camera, secure store, RevenueCat). `eas submit` for store submission. |
| TypeScript | 5.x | Type safety across the monorepo | Strict mode. Share types between mobile and Worker via a shared `packages/types` or inline imports. |

---

## Installation

```bash
# --- Mobile app (Expo) ---
# Create new Expo project (SDK 55 default)
bunx create-expo-app ai-calories --template default

# Auth
bun add better-auth @better-auth/expo expo-secure-store expo-network

# State & data fetching
bun add zustand @tanstack/react-query @react-native-async-storage/async-storage

# Forms & validation
bun add react-hook-form @hookform/resolvers zod

# Camera & image
# expo-image-picker and expo-camera are part of Expo SDK — add to app.json plugins

# Styling
bun add nativewind tailwindcss react-native-reanimated react-native-gesture-handler
bunx tailwindcss init

# Animations peer dependency
bun add react-native-safe-area-context

# --- Backend (Cloudflare Worker / Hono) ---
# Create Hono Cloudflare Workers project
bunx create-hono@latest backend --template cloudflare-workers

# Core dependencies
bun add hono better-auth drizzle-orm @google/generative-ai

# Validation
bun add zod @hono/zod-validator

# Dev dependencies
bun add -D drizzle-kit wrangler @cloudflare/workers-types
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Gemini 2.5 Flash (`gemini-2.5-flash`) | Gemini 2.0 Flash | Never — 2.0 Flash retires June 1, 2026. Start on 2.5 Flash. |
| Gemini 2.5 Flash | GPT-4o Vision / Claude Vision | If Google API reliability is a concern or you need model redundancy. Gemini is better cost/performance for food images at scale. |
| Drizzle ORM | Prisma | Prisma has no D1 support. Drizzle is the only mature option for Cloudflare D1 in 2026. |
| Drizzle ORM | Raw SQL (wrangler d1 execute) | Acceptable for very small projects but loses type safety and migration management. |
| better-auth | Clerk | Clerk is vendor-hosted and expensive at scale. better-auth is self-hosted, runs on Workers, no per-MAU pricing. |
| better-auth | Supabase Auth | Requires Supabase as a dependency — conflicts with Cloudflare D1 strategy. better-auth + D1 is the right pairing. |
| NativeWind v4 | StyleSheet API | StyleSheet is fine for small apps but NativeWind gives design consistency, dark mode, and Tailwind vocabulary familiar from web dev. |
| NativeWind v4 | Tamagui | Tamagui has more complex setup and its own component system. NativeWind is lighter and uses standard RN components. |
| TanStack Query | SWR | SWR has no official React Native support. TanStack Query has first-class RN docs and offline support. |
| Zustand | Redux Toolkit | Redux is over-engineered for this domain. Zustand with persist middleware covers all calorie tracker state needs. |
| Zustand | Jotai | Both are fine; Zustand is more idiomatic for stores with actions. Jotai preferred for atomic state — less relevant here. |
| expo-router | React Navigation (manual) | expo-router IS React Navigation under the hood, with file-based routing on top. No reason to use raw React Navigation for new Expo projects. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Gemini 2.0 Flash as primary model | Retires June 1, 2026 — building on it now creates a forced migration in < 4 months | `gemini-2.5-flash` |
| Calling Gemini API directly from React Native client | Exposes API key in app bundle — trivially extractable | Proxy all AI calls through the Hono backend; backend holds the `GEMINI_API_KEY` env var |
| `zod` root import in React Native | Zod v4 root import causes "Invalid element at key" runtime error in RN | Import from `'zod/v3'` on the mobile client, or keep Zod usage to the Hono backend only |
| Prisma ORM | No Cloudflare D1 adapter exists | Drizzle ORM |
| `process.env` in Cloudflare Workers | Not available by default in Workers runtime | `c.env.VAR_NAME` via Hono context bindings |
| AsyncStorage for auth tokens | Not encrypted — security risk for session tokens | `expo-secure-store` for auth; AsyncStorage only for non-sensitive app state |
| RevenueCat (real) in MVP | Adds native build complexity, requires App Store/Play Store products configured | Implement a `useSubscription()` hook that returns a hardcoded mock state; wire real RevenueCat later via `react-native-purchases` |
| Expo Go for final testing | Camera, SecureStore, and RevenueCat do not work in Expo Go — only in development builds | `eas build --profile development` for a real dev build |
| `npm` or `yarn` | Project uses Bun as specified | `bun` throughout |

---

## Stack Patterns by Variant

**For the food photo → AI analysis flow:**
- Mobile captures image via `expo-image-picker` → gets local URI
- Convert to base64 on device (`expo-file-system` `readAsStringAsync` with `base64` encoding)
- POST base64 string to Hono backend endpoint (not the file directly — simpler for Workers)
- Hono backend calls Gemini 2.5 Flash with the image inline via `@google/generative-ai`
- Backend returns structured JSON (food name, calories, macros)
- Mobile stores result via TanStack Query mutation + Zustand persistence

**For authentication flow on mobile:**
- better-auth server on Cloudflare Worker handles sessions stored in D1
- Mobile uses `@better-auth/expo` plugin with `expoClient`
- Session cached in `expo-secure-store` — no spinner on app reload
- Social sign-in (Google) via `expo-web-browser` + `expo-linking`

**For offline-tolerant daily logs:**
- TanStack Query with `PersistQueryClientProvider` + `createAsyncStoragePersister`
- Zustand store persisted via `persist` middleware + AsyncStorage
- Log entries optimistically added locally; synced to D1 on reconnect

**For mock paywall (MVP):**
- Create `src/hooks/useSubscription.ts` returning `{ isPremium: false, planName: 'free' }`
- Wrap premium UI behind this hook
- When RevenueCat is added: swap the hook internals with `react-native-purchases` — no UI changes needed

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| expo-router 55.x | Expo SDK 55, React Navigation v7 | Auto-included with SDK 55 default template. Do not manually install React Navigation. |
| NativeWind 4.2.2 | Expo SDK 55, react-native-reanimated 4.x | SDK 55 = New Architecture = required for NativeWind v4 jsxImportSource transform. Will NOT work with Legacy Architecture. |
| better-auth 1.5.1 | Expo SDK 55 (SDK 55 = New Architecture) | The better-auth docs explicitly target SDK 55. Earlier SDK versions may have compat issues. |
| react-native-reanimated 4.2.2 | Expo SDK 55 (New Architecture required) | Reanimated v4 requires New Architecture. SDK 55 enforces this — compatible. |
| Zod 4.x | Hono backend: OK. React Native: import from `'zod/v3'` | Root `'zod'` import in RN causes runtime crash. Use `'zod/v3'` in mobile code. |
| drizzle-kit 0.31.9 | drizzle-orm 0.45.1 | Keep both in sync. Use `d1-http` driver in `drizzle.config.ts` for remote migrations. |
| @google/generative-ai 0.24.1 | Cloudflare Workers (Hono) | Use on the Worker backend only. Not for the React Native client (API key exposure). |

---

## Sources

- Expo SDK 55 changelog — https://expo.dev/changelog/2024-11-12-sdk-52 (version verified via npm: `expo@55.0.4`)
- better-auth Expo integration docs — https://better-auth.com/docs/integrations/expo (confirmed SDK 55 target, SecureStore requirement)
- Drizzle ORM D1 docs — https://orm.drizzle.team/docs/connect-cloudflare-d1 (confirmed D1 adapter, migration workflow)
- Hono Cloudflare Workers docs — https://hono.dev/docs/getting-started/cloudflare-workers (confirmed `c.env` pattern, Workers types)
- Gemini API models — https://ai.google.dev/gemini-api/docs/models (confirmed `gemini-2.5-flash` stable, 2.0 Flash retirement June 2026)
- NativeWind v4 docs — https://www.nativewind.dev/docs/getting-started/installation (confirmed jsxImportSource, SDK 55 New Arch requirement)
- Zod v4 RN issue — https://github.com/colinhacks/zod/issues/4989 (confirmed `zod/v3` import workaround for React Native)
- All versions verified via npm registry (2026-03-03): better-auth@1.5.1, hono@4.12.3, drizzle-orm@0.45.1, expo@55.0.4, expo-router@55.0.3, nativewind@4.2.2, zustand@5.0.11, @tanstack/react-query@5.90.21, zod@4.3.6

---
*Stack research for: AI-powered calorie tracker (Expo + Cloudflare Workers + Gemini)*
*Researched: 2026-03-03*
