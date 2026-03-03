import { Link, Redirect, router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ApiError } from '../../src/lib/api'
import { useAuth } from '../../src/providers/auth-provider'

export default function RegisterScreen() {
  const { token, loading, signUpWithEmail } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!loading && token) {
    return <Redirect href="/" />
  }

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Preencha nome, e-mail e senha.')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setPending(true)
    setError(null)
    try {
      await signUpWithEmail({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      router.replace('/(onboarding)')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Não foi possível criar sua conta agora.')
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
        <Text className="text-3xl font-bold text-white">Criar conta</Text>
        <Text className="mt-2 text-zinc-300">Leva menos de um minuto.</Text>

        <View className="mt-8 gap-4">
          <View>
            <Text className="mb-2 text-zinc-300">Nome</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor="#737373"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
            />
          </View>

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
              placeholder="No mínimo 8 caracteres"
              placeholderTextColor="#737373"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
            />
          </View>

          {error ? <Text className="text-sm text-red-300">{error}</Text> : null}

          <Pressable
            disabled={pending}
            onPress={() => {
              void handleRegister()
            }}
            className={`mt-2 rounded-xl px-4 py-4 ${pending ? 'bg-zinc-700' : 'bg-brand-500'}`}
          >
            {pending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-center text-base font-semibold text-white">Criar conta</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View className="mt-6 flex-row justify-center">
        <Text className="text-zinc-400">Já tem conta? </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable>
            <Text className="font-semibold text-brand-400">Entrar</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  )
}
