import { Redirect, router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError, deleteMeal, getHistory, getMealsByDate } from '../../src/lib/api'
import { formatDatePtBr, getLocalDateString } from '../../src/lib/date'
import { MealGroupList } from '../../src/components/meal-group-list'
import { useSubscription } from '../../src/hooks/use-subscription'
import { useAuth } from '../../src/providers/auth-provider'
import type { DailySummary, MealRecord } from '../../src/types/domain'

export default function HistoricoScreen() {
  const { token, loading, hasCompletedOnboarding, logout, handleSessionInvalidError } = useAuth()
  const subscription = useSubscription()

  const [history, setHistory] = useState<DailySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(getLocalDateString())
  const [meals, setMeals] = useState<MealRecord[]>([])
  const [historyPending, setHistoryPending] = useState(true)
  const [mealsPending, setMealsPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canSeeSevenDays = true
  const pending = historyPending || mealsPending
  const historyRequestIdRef = useRef(0)
  const mealsRequestIdRef = useRef(0)
  const selectedDateRef = useRef(selectedDate)
  const initialDateRef = useRef(selectedDate)

  const loadHistory = useCallback(async () => {
    if (!token) return

    const requestId = historyRequestIdRef.current + 1
    historyRequestIdRef.current = requestId
    setHistoryPending(true)
    setError(null)

    try {
      const historyRes = await getHistory(token, canSeeSevenDays ? 7 : 3)
      if (historyRequestIdRef.current !== requestId) {
        return
      }
      setHistory(historyRes.history)
    } catch (err) {
      if (historyRequestIdRef.current !== requestId) {
        return
      }
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao carregar histórico.')
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryPending(false)
      }
    }
  }, [canSeeSevenDays, handleSessionInvalidError, token])

  const loadMealsForDate = useCallback(
    async (date: string) => {
      if (!token) return

      const requestId = mealsRequestIdRef.current + 1
      mealsRequestIdRef.current = requestId
      setMealsPending(true)
      setError(null)

      try {
        const response = await getMealsByDate(token, date)
        if (mealsRequestIdRef.current !== requestId) {
          return
        }
        setMeals(response.meals)
      } catch (err) {
        if (mealsRequestIdRef.current !== requestId) {
          return
        }
        if (await handleSessionInvalidError(err)) {
          return
        }

        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Falha ao carregar refeições da data.')
        }
      } finally {
        if (mealsRequestIdRef.current === requestId) {
          setMealsPending(false)
        }
      }
    },
    [handleSessionInvalidError, token]
  )

  useFocusEffect(
    useCallback(() => {
      const today = getLocalDateString()
      if (selectedDateRef.current === initialDateRef.current && today !== selectedDateRef.current) {
        selectedDateRef.current = today
        initialDateRef.current = today
        setSelectedDate(today)
      }

      void loadHistory()
      void loadMealsForDate(selectedDateRef.current)
    }, [loadHistory, loadMealsForDate])
  )

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  async function selectDate(date: string) {
    if (selectedDateRef.current === date) {
      return
    }

    selectedDateRef.current = date
    setSelectedDate(date)
    await loadMealsForDate(date)
  }

  async function handleDelete(mealId: string) {
    if (!token) return

    try {
      await deleteMeal(token, mealId)
      await Promise.all([loadMealsForDate(selectedDateRef.current), loadHistory()])
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao excluir refeição.')
      }
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-16 pt-12"
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-3xl font-bold text-white">Histórico</Text>
        <Pressable
          onPress={() => {
            void logout()
          }}
          className="rounded-lg border border-zinc-700 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-zinc-200">Sair</Text>
        </Pressable>
      </View>
      <Text className="mt-2 text-zinc-300">Últimos 7 dias com calorias e macros.</Text>

      {pending ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : (
        <>
          <View className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <Text className="mb-3 text-base font-semibold text-zinc-100">Resumo dos últimos dias</Text>
            <View className="gap-2">
              {history.length === 0 ? (
                <Text className="text-sm text-zinc-400">Nenhum resumo disponível nos últimos dias.</Text>
              ) : (
                history.map((item) => (
                  <Pressable
                    key={item.date}
                    onPress={() => {
                      void selectDate(item.date)
                    }}
                    className={`rounded-xl border px-3 py-3 ${selectedDate === item.date ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
                  >
                    <Text className="font-medium text-zinc-100">{formatDatePtBr(item.date)}</Text>
                    <Text className="mt-1 text-xs text-zinc-400">
                      {Math.round(item.totalCalories)} kcal · {item.mealsCount} refeição(ões)
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>

          <View className="mt-6">
            <Text className="mb-3 text-base font-semibold text-zinc-100">Refeições de {formatDatePtBr(selectedDate)}</Text>
            <MealGroupList meals={meals} onDelete={handleDelete} emptyMessage="Nenhuma refeição nessa data." />
          </View>

          <View className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <Text className="text-base font-semibold text-zinc-100">Recursos premium</Text>
            <Text className="mt-2 text-zinc-300">
              Exportar relatório PDF semanal e análises avançadas de tendência.
            </Text>
            <Pressable
              onPress={() => {
                if (!subscription.canAccessPremium) {
                  router.push('/paywall')
                  return
                }

                Alert.alert(
                  'Exportação em desenvolvimento',
                  'O relatório premium estará disponível em breve. Obrigado por testar esta versão.'
                )
              }}
              className={`mt-4 rounded-xl px-4 py-3 ${subscription.canAccessPremium ? 'bg-brand-500' : 'bg-zinc-700'}`}
            >
              <Text className="text-center font-semibold text-white">
                {subscription.canAccessPremium ? 'Exportar relatório' : 'Conhecer plano Pro'}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {error ? (
        <View className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Text className="text-red-200">{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}
