# Changelog

## 1.0.1 - 2026-03-06

- Hardened autonomous verification so the shipped gate now runs the full local `check-all` path before production loops.
- Fixed production/local smoke drift by deriving `localDate` from the same IANA timezone used during onboarding.
- Made dashboard summaries derive from `meals` instead of trusting stale `daily_summaries`, and tightened `user_profiles` soft-delete handling.
- Improved production loop reporting with correct `completedCycles` semantics and JSON evidence artifacts.
- Added regression coverage for autonomous scripts, production loop reporting, timezone date derivation, auth middleware, and user route edge cases.
- Aligned Expo SDK 55 patch dependencies (`expo-image-picker`, `expo-router`) and regenerated the iOS Pod workspace to clear the stale native duplicate-header failure.
