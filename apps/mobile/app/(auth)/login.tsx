import { Link, Redirect, router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ApiError } from '../../src/lib/api'
import { useAuth } from '../../src/providers/auth-provider'

export default function LoginScreen() {
  const { token, loading, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!loading && token) {
    return <Redirect href="/" />
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Informe e-mail e senha para entrar.')
      return
    }

    setPending(true)
    setError(null)
    try {
      await signInWithEmail({ email: email.trim().toLowerCase(), password })
      router.replace('/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao fazer login. Tente novamente.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-12 pt-16"
    >
      <View className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
        <Text className="text-3xl font-bold text-white">Rastreador de Calorias IA</Text>
        <Text className="mt-2 text-zinc-300">Entre para continuar seu diário alimentar.</Text>

        <View className="mt-8 gap-4">
          <View>
            <Text className="mb-2 text-zinc-300">E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="você@email.com"
              placeholderTextColor="#737373"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
            />
          </View>

          <View>
            <Text className="mb-2 text-zinc-300">Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#737373"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
            />
          </View>

          {error ? <Text className="text-sm text-red-300">{error}</Text> : null}

          <Pressable
            disabled={pending}
            onPress={() => {
              void handleLogin()
            }}
            className={`mt-2 rounded-xl px-4 py-4 ${pending ? 'bg-zinc-700' : 'bg-brand-500'}`}
          >
            {pending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-center text-base font-semibold text-white">Entrar</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View className="mt-6 flex-row justify-center">
        <Text className="text-zinc-400">Ainda não tem conta? </Text>
        <Link href="/(auth)/register" asChild>
          <Pressable>
            <Text className="font-semibold text-brand-400">Criar conta</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  )
}
