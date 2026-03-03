import { describe, expect, it } from 'bun:test'
import { scaleTotalsByCalories } from './meal'

describe('meal utils', () => {
  it('escala macros proporcionalmente às calorias', () => {
    const scaled = scaleTotalsByCalories(
      { calories: 600, protein: 30, carbs: 70, fat: 20 },
      300
    )

    expect(scaled.calories).toBe(300)
    expect(scaled.protein).toBe(15)
    expect(scaled.carbs).toBe(35)
    expect(scaled.fat).toBe(10)
  })
})
