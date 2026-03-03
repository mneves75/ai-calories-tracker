import { Redirect, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, deleteMeal, getDashboard } from '../../src/lib/api'
import { getLocalDateString } from '../../src/lib/date'
import { MealGroupList } from '../../src/components/meal-group-list'
import { ProgressRing } from '../../src/components/progress-ring'
import { useAuth } from '../../src/providers/auth-provider'
import type { DashboardResponse } from '../../src/types/domain'

export default function DashboardScreen() {
  const { token, loading, hasCompletedOnboarding, logout, handleSessionInvalidError } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!token) return
    setPending(true)
    setError(null)

    try {
      const date = getLocalDateString()
      const result = await getDashboard(token, date)
      setData(result)
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao carregar painel diário.')
      }
    } finally {
      setPending(false)
    }
  }, [token])

  useFocusEffect(
    useCallback(() => {
      void loadDashboard()
    }, [loadDashboard])
  )

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  async function handleDelete(mealId: string) {
    if (!token) return

    try {
      await deleteMeal(token, mealId)
      await loadDashboard()
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Não foi possível excluir a refeição.')
      }
    }
  }

  const goalCalories = data?.goals?.calories ?? data?.profile?.dailyCalorieGoal ?? 2000
  const consumedCalories = data?.summary?.totalCalories ?? 0
  const consumedProtein = data?.summary?.totalProtein ?? 0
  const consumedCarbs = data?.summary?.totalCarbs ?? 0
  const consumedFat = data?.summary?.totalFat ?? 0
  const goalProtein = data?.goals?.protein ?? 0
  const goalCarbs = data?.goals?.carbs ?? 0
  const goalFat = data?.goals?.fat ?? 0
  const proteinPct = goalProtein > 0 ? Math.min(100, Math.round((consumedProtein / goalProtein) * 100)) : 0
  const carbsPct = goalCarbs > 0 ? Math.min(100, Math.round((consumedCarbs / goalCarbs) * 100)) : 0
  const fatPct = goalFat > 0 ? Math.min(100, Math.round((consumedFat / goalFat) * 100)) : 0

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-16 pt-12"
    >
      <View className="mb-6 flex-row items-center justify-between">
        <View>
          <Text className="text-sm text-zinc-400">Hoje</Text>
          <Text className="text-2xl font-bold text-white">Seu progresso</Text>
        </View>

        <Pressable
          onPress={() => {
            void logout()
          }}
          className="rounded-lg border border-zinc-700 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-zinc-200">Sair</Text>
        </Pressable>
      </View>

      {pending ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : error ? (
        <View className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <Text className="text-red-200">{error}</Text>
        </View>
      ) : (
        <>
          <View className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
            <ProgressRing value={consumedCalories} goal={goalCalories} />
          </View>

          <View className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <Text className="mb-3 text-base font-semibold text-zinc-100">Macros do dia</Text>
            <View className="gap-2">
              <Text className="text-zinc-300">
                Proteína: {Math.round(consumedProtein)}g / {Math.round(goalProtein)}g ({proteinPct}%)
              </Text>
              <Text className="text-zinc-300">
                Carboidratos: {Math.round(consumedCarbs)}g / {Math.round(goalCarbs)}g ({carbsPct}%)
              </Text>
              <Text className="text-zinc-300">
                Gorduras: {Math.round(consumedFat)}g / {Math.round(goalFat)}g ({fatPct}%)
              </Text>
            </View>
          </View>

          <View className="mt-6">
            <Text className="mb-3 text-base font-semibold text-zinc-100">Refeições de hoje</Text>
            <MealGroupList meals={data?.meals ?? []} onDelete={handleDelete} />
          </View>
        </>
      )}
    </ScrollView>
  )
}
