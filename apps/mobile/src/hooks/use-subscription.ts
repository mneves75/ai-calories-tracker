export function useSubscription() {
  return {
    isPremium: false,
    plan: 'free' as const,
    canAccessPremium: false,
  }
}
