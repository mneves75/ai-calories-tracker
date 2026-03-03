import { Redirect } from 'expo-router'
import { LoadingScreen } from '../src/components/loading-screen'
import { useAuth } from '../src/providers/auth-provider'

export default function IndexScreen() {
  const { loading, token, hasCompletedOnboarding, hasSeenPaywall } = useAuth()

  if (loading) {
    return <LoadingScreen text="Preparando seu app..." />
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  if (!hasSeenPaywall) {
    return <Redirect href="/paywall" />
  }

  return <Redirect href="/(tabs)/dashboard" />
}
