import { View, Text } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

type ProgressRingProps = {
  value: number
  goal: number
}

export function ProgressRing({ value, goal }: ProgressRingProps) {
  const normalizedGoal = Math.max(goal, 1)
  const progress = Math.min(value / normalizedGoal, 1)

  const size = 190
  const strokeWidth = 16
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <View className="items-center justify-center">
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#183327"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#22c55e"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>

      <View className="absolute items-center">
        <Text className="text-3xl font-bold text-white">{Math.round(value)}</Text>
        <Text className="mt-1 text-sm text-zinc-300">de {Math.round(goal)} kcal</Text>
      </View>
    </View>
  )
}
