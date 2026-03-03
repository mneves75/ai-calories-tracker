import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import {
  clearPaywallSeen,
  clearSessionToken,
  getSessionToken,
  hasSeenPaywall,
  markPaywallAsSeen,
  saveSessionToken,
} from '../lib/storage'
import {
  completeOnboarding,
  getMe,
  isSessionInvalidApiError,
  signInEmail,
  signOut,
  signUpEmail,
} from '../lib/api'
import { clearSessionWhenInvalidError } from './session-guards'
import type { AuthUser, UserProfile } from '../types/domain'

type AuthContextValue = {
  loading: boolean
  token: string | null
  user: AuthUser | null
  profile: UserProfile | null
  hasCompletedOnboarding: boolean
  hasSeenPaywall: boolean
  signInWithEmail: (input: { email: string; password: string }) => Promise<void>
  signUpWithEmail: (input: { name: string; email: string; password: string }) => Promise<void>
  completeUserOnboarding: (input: {
    sex: 'male' | 'female'
    birthDate: string
    heightCm: number
    weightKg: number
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
    goalType: 'lose' | 'maintain' | 'gain'
    timezone: string
  }) => Promise<void>
  refreshMe: () => Promise<void>
  logout: () => Promise<void>
  markPaywallSeen: () => Promise<void>
  resetPaywallSeen: () => Promise<void>
  handleSessionInvalidError: (error: unknown) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [paywallSeen, setPaywallSeen] = useState(false)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        const storedToken = await getSessionToken()

        if (!active) {
          return
        }

        if (!storedToken) {
          setLoading(false)
          return
        }

        try {
          await hydrateSession(storedToken)
        } catch (error) {
          if (isSessionInvalidApiError(error)) {
            await clearLocalSession()
            return
          }
          throw error
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [])

  async function clearLocalSession() {
    setToken(null)
    setUser(null)
    setProfile(null)
    setPaywallSeen(false)
    await clearSessionToken()
  }

  async function handleSessionInvalidError(error: unknown) {
    return clearSessionWhenInvalidError(error, clearLocalSession)
  }

  async function hydrateSession(nextToken: string) {
    const me = await getMe(nextToken)
    const paywallFlag = await hasSeenPaywall(me.user.id)
    setToken(nextToken)
    setUser(me.user)
    setProfile(me.profile)
    setPaywallSeen(paywallFlag)
    await saveSessionToken(nextToken)
  }

  async function refreshMe() {
    if (!token) {
      return
    }

    try {
      const me = await getMe(token)
      setUser(me.user)
      setProfile(me.profile)
      setPaywallSeen(await hasSeenPaywall(me.user.id))
    } catch (error) {
      if (await handleSessionInvalidError(error)) {
        throw error
      }
      throw error
    }
  }

  async function signInWithEmail(input: { email: string; password: string }) {
    try {
      const result = await signInEmail(input)
      await hydrateSession(result.token)
    } catch (error) {
      await handleSessionInvalidError(error)
      throw error
    }
  }

  async function signUpWithEmail(input: { name: string; email: string; password: string }) {
    try {
      const result = await signUpEmail(input)
      await hydrateSession(result.token)
    } catch (error) {
      await handleSessionInvalidError(error)
      throw error
    }
  }

  async function completeUserOnboarding(input: {
    sex: 'male' | 'female'
    birthDate: string
    heightCm: number
    weightKg: number
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
    goalType: 'lose' | 'maintain' | 'gain'
    timezone: string
  }) {
    if (!token) {
      throw new Error('Sessão inválida')
    }

    try {
      await completeOnboarding(token, input)
      await refreshMe()
    } catch (error) {
      if (await handleSessionInvalidError(error)) {
        throw error
      }
      throw error
    }
  }

  async function logout() {
    if (token) {
      try {
        await signOut(token)
      } catch {
        // Ignora falha de signout remoto e limpa sessão local.
      }
    }

    await clearLocalSession()
  }

  async function markPaywallSeenAction() {
    if (!user?.id) {
      throw new Error('Sessão inválida')
    }

    setPaywallSeen(true)
    await markPaywallAsSeen(user.id)
  }

  async function resetPaywallSeen() {
    if (!user?.id) {
      setPaywallSeen(false)
      return
    }

    setPaywallSeen(false)
    await clearPaywallSeen(user.id)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token,
      user,
      profile,
      hasCompletedOnboarding: Boolean(profile),
      hasSeenPaywall: paywallSeen,
      signInWithEmail,
      signUpWithEmail,
      completeUserOnboarding,
      refreshMe,
      logout,
      markPaywallSeen: markPaywallSeenAction,
      resetPaywallSeen,
      handleSessionInvalidError,
    }),
    [loading, token, user, profile, paywallSeen]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
