import { Redirect, router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ApiError } from '../../src/lib/api'
import { birthDateFromAge, getDeviceTimezone } from '../../src/lib/date'
import { useAuth } from '../../src/providers/auth-provider'

const goalOptions = [
  { id: 'lose', title: 'Perder peso', helper: 'Ajusta déficit calórico controlado.' },
  { id: 'maintain', title: 'Manter peso', helper: 'Equilíbrio entre consumo e gasto.' },
  { id: 'gain', title: 'Ganhar massa', helper: 'Superávit calórico com foco em proteína.' },
] as const

const activityOptions = [
  { id: 'sedentary', title: 'Sedentário' },
  { id: 'light', title: 'Leve (1-2x/semana)' },
  { id: 'moderate', title: 'Moderado (3-4x/semana)' },
  { id: 'active', title: 'Ativo (5-6x/semana)' },
  { id: 'very_active', title: 'Muito ativo (diário)' },
] as const

export default function OnboardingScreen() {
  const { token, loading, hasCompletedOnboarding, completeUserOnboarding, logout } = useAuth()

  const [goalType, setGoalType] = useState<(typeof goalOptions)[number]['id']>('maintain')
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState('30')
  const [heightCm, setHeightCm] = useState('175')
  const [weightKg, setWeightKg] = useState('75')
  const [activityLevel, setActivityLevel] = useState<(typeof activityOptions)[number]['id']>('moderate')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && hasCompletedOnboarding) {
    return <Redirect href="/paywall" />
  }

  async function handleSubmit() {
    const parsedAge = Number(age)
    const parsedHeight = Number(heightCm)
    const parsedWeight = Number(weightKg)

    if (!Number.isFinite(parsedAge) || !Number.isFinite(parsedHeight) || !Number.isFinite(parsedWeight)) {
      setError('Preencha idade, altura e peso com números válidos.')
      return
    }

    const birthDate = birthDateFromAge(parsedAge)
    if (!birthDate) {
      setError('Informe uma idade entre 12 e 100 anos.')
      return
    }

    setPending(true)
    setError(null)
    try {
      await completeUserOnboarding({
        sex,
        birthDate,
        heightCm: parsedHeight,
        weightKg: parsedWeight,
        activityLevel,
        goalType,
        timezone: getDeviceTimezone(),
      })
      router.replace('/paywall')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao salvar seus dados. Tente novamente.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-10 pt-14"
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-3xl font-bold text-white">Vamos personalizar sua meta</Text>
        <Pressable
          onPress={() => {
            void logout()
          }}
          className="rounded-lg border border-zinc-700 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-zinc-200">Sair</Text>
        </Pressable>
      </View>
      <Text className="mt-2 text-zinc-300">
        Cada dado abaixo serve para calcular seu gasto energético diário com a fórmula Mifflin-St Jeor.
      </Text>

      <View className="mt-8 gap-5">
        <View className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <Text className="mb-3 text-base font-semibold text-zinc-100">Objetivo</Text>
          <View className="gap-2">
            {goalOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setGoalType(option.id)}
                className={`rounded-xl border px-4 py-3 ${goalType === option.id ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
              >
                <Text className="text-sm font-semibold text-zinc-100">{option.title}</Text>
                <Text className="mt-1 text-xs text-zinc-400">{option.helper}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <Text className="mb-3 text-base font-semibold text-zinc-100">Dados físicos</Text>

          <Text className="mb-2 text-zinc-300">Sexo biológico (impacta cálculo basal)</Text>
          <View className="mb-4 flex-row gap-2">
            <Pressable
              onPress={() => setSex('male')}
              className={`flex-1 rounded-xl border px-3 py-3 ${sex === 'male' ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
            >
              <Text className="text-center font-medium text-zinc-100">Masculino</Text>
            </Pressable>
            <Pressable
              onPress={() => setSex('female')}
              className={`flex-1 rounded-xl border px-3 py-3 ${sex === 'female' ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
            >
              <Text className="text-center font-medium text-zinc-100">Feminino</Text>
            </Pressable>
          </View>

          <View className="gap-3">
            <View>
              <Text className="mb-1 text-zinc-300">Idade (anos)</Text>
              <TextInput
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>

            <View>
              <Text className="mb-1 text-zinc-300">Altura (cm)</Text>
              <TextInput
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="number-pad"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>

            <View>
              <Text className="mb-1 text-zinc-300">Peso atual (kg)</Text>
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>
          </View>
        </View>

        <View className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <Text className="mb-3 text-base font-semibold text-zinc-100">Nível de atividade</Text>
          <View className="gap-2">
            {activityOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setActivityLevel(option.id)}
                className={`rounded-xl border px-4 py-3 ${activityLevel === option.id ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
              >
                <Text className="text-sm text-zinc-100">{option.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error ? <Text className="text-sm text-red-300">{error}</Text> : null}

        <Pressable
          disabled={pending}
          onPress={() => {
            void handleSubmit()
          }}
          className={`rounded-xl px-4 py-4 ${pending ? 'bg-zinc-700' : 'bg-brand-500'}`}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-center text-base font-semibold text-white">Salvar dados</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}
