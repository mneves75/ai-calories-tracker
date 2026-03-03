import { Redirect, router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSubscription } from '../src/hooks/use-subscription'
import { useAuth } from '../src/providers/auth-provider'

const features = [
  'Análises ilimitadas por foto',
  'Histórico completo sem limite de dias',
  'Relatórios avançados de progresso',
]

export default function PaywallScreen() {
  const subscription = useSubscription()
  const { loading, token, hasCompletedOnboarding, hasSeenPaywall, markPaywallSeen, logout } = useAuth()

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  if (!loading && hasSeenPaywall) {
    return <Redirect href="/(tabs)/dashboard" />
  }

  async function handleContinueFree() {
    await markPaywallSeen()
    router.replace('/(tabs)/dashboard')
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-12 pt-16"
    >
      <View className="mb-4 flex-row items-start justify-between">
        <Text className="text-sm font-medium text-zinc-300">Oferta pós-cadastro</Text>
        <Pressable
          onPress={() => {
            void logout()
          }}
          className="rounded-lg border border-zinc-700 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-zinc-200">Sair</Text>
        </Pressable>
      </View>

      <View className="rounded-3xl border border-brand-500/30 bg-brand-900/20 p-6">
        <Text className="text-3xl font-bold text-white">Desbloqueie o plano Pro</Text>
        <Text className="mt-2 text-zinc-200">Acelere seus resultados com recursos premium.</Text>

        <View className="mt-6 gap-2">
          {features.map((feature) => (
            <View key={feature} className="flex-row items-center gap-2">
              <Text className="text-brand-300">●</Text>
              <Text className="text-zinc-100">{feature}</Text>
            </View>
          ))}
        </View>

        <View className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
          <Text className="text-sm text-zinc-400">Plano atual</Text>
          <Text className="mt-1 text-xl font-semibold text-white">
            {subscription.isPremium ? 'Plano Pro' : 'Gratuito'}
          </Text>
          <Text className="mt-2 text-zinc-300">Cobrança real será adicionada em breve. Por enquanto, este plano é demonstrativo.</Text>
        </View>

        <Pressable
          onPress={() => {
            void handleContinueFree()
          }}
          className="mt-6 rounded-xl bg-brand-500 px-4 py-4"
        >
          <Text className="text-center text-base font-semibold text-white">Continuar no plano gratuito</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}
