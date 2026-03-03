import * as SecureStore from 'expo-secure-store'

const SESSION_TOKEN_KEY = 'ai_calories_session_token'
const PAYWALL_SEEN_KEY_PREFIX = 'ai_calories_paywall_seen'
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

function getPaywallSeenKey(userId: string) {
  return `${PAYWALL_SEEN_KEY_PREFIX}:${userId}`
}

export async function saveSessionToken(token: string) {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, SECURE_STORE_OPTIONS)
}

export async function getSessionToken() {
  const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY)
  return token && token.length > 0 ? token : null
}

export async function clearSessionToken() {
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY, SECURE_STORE_OPTIONS)
  } catch {
    // fail-closed fallback when delete is unavailable
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, '', SECURE_STORE_OPTIONS)
  }
}

export async function markPaywallAsSeen(userId: string) {
  if (!userId.trim()) {
    return
  }
  await SecureStore.setItemAsync(getPaywallSeenKey(userId), '1', SECURE_STORE_OPTIONS)
}

export async function hasSeenPaywall(userId: string) {
  if (!userId.trim()) {
    return false
  }
  const value = await SecureStore.getItemAsync(getPaywallSeenKey(userId))
  return value === '1'
}

export async function clearPaywallSeen(userId: string) {
  if (!userId.trim()) {
    return
  }
  await SecureStore.deleteItemAsync(getPaywallSeenKey(userId), SECURE_STORE_OPTIONS)
}
