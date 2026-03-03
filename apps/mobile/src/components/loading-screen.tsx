import { ActivityIndicator, Text, View } from 'react-native'

type LoadingScreenProps = {
  text?: string
}

export function LoadingScreen({ text = 'Carregando...' }: LoadingScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-[#0b1512] px-6">
      <ActivityIndicator size="large" color="#22c55e" />
      <Text className="mt-4 text-base text-zinc-200">{text}</Text>
    </View>
  )
}
