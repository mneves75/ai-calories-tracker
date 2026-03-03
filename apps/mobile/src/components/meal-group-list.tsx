import { Pressable, Text, View } from 'react-native'
import type { MealRecord } from '../types/domain'
import { groupMealsByType, mealTypeLabels } from '../lib/meal'

type MealGroupListProps = {
  meals: MealRecord[]
  onDelete?: (mealId: string) => Promise<void>
  emptyMessage?: string
}

export function MealGroupList({ meals, onDelete, emptyMessage = 'Nenhuma refeição registrada.' }: MealGroupListProps) {
  if (meals.length === 0) {
    return <Text className="text-zinc-400">{emptyMessage}</Text>
  }

  const grouped = groupMealsByType(meals)
  const order: Array<keyof typeof grouped> = ['breakfast', 'lunch', 'dinner', 'snack']

  return (
    <View className="gap-5">
      {order.map((mealType) => {
        const items = grouped[mealType]
        if (items.length === 0) return null

        return (
          <View key={mealType} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <Text className="mb-3 text-base font-semibold text-zinc-100">{mealTypeLabels[mealType]}</Text>

            <View className="gap-2">
              {items.map((meal) => (
                <View key={meal.id} className="flex-row items-center justify-between rounded-xl bg-zinc-800/80 px-3 py-3">
                  <View className="mr-3 flex-1">
                    <Text className="text-sm font-medium text-zinc-100">{meal.name}</Text>
                    <Text className="mt-1 text-xs text-zinc-400">
                      {Math.round(meal.calories)} kcal · P {Math.round(meal.protein)}g · C {Math.round(meal.carbs)}g · G {Math.round(meal.fat)}g
                    </Text>
                  </View>

                  {onDelete ? (
                    <Pressable
                      onPress={() => {
                        void onDelete(meal.id)
                      }}
                      className="rounded-lg border border-red-500/30 px-3 py-2"
                    >
                      <Text className="text-xs font-semibold text-red-300">Excluir</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}
