import { Redirect, Tabs } from 'expo-router'
import { LoadingScreen } from '../../src/components/loading-screen'
import { useAuth } from '../../src/providers/auth-provider'

export default function TabsLayout() {
  const { loading, token, hasCompletedOnboarding, hasSeenPaywall } = useAuth()

  if (loading) {
    return <LoadingScreen text="Validando sessão..." />
  }

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  if (!loading && !hasSeenPaywall) {
    return <Redirect href="/paywall" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#34d399',
        tabBarInactiveTintColor: '#a1a1aa',
        tabBarStyle: {
          backgroundColor: '#090f0d',
          borderTopColor: '#1f2937',
        },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Resumo' }} />
      <Tabs.Screen name="foto" options={{ title: 'Foto' }} />
      <Tabs.Screen name="historico" options={{ title: 'Histórico' }} />
    </Tabs>
  )
}
