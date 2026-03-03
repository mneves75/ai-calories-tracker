import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

const FoodItemSchema = z.object({
  name: z.string(),
  portion: z.string(),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
})

const NutritionResultSchema = z.object({
  foods: z.array(FoodItemSchema).min(1),
  totals: z.object({
    calories: z.number().min(0).max(5000),
    protein: z.number().min(0).max(500),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(500),
  }),
  confidence: z.enum(['high', 'medium', 'low']),
  mealName: z.string(),
})

export type NutritionResult = z.infer<typeof NutritionResultSchema>

const ANALYSIS_PROMPT = `Você é um nutricionista especialista em comida brasileira. Analise esta imagem de comida e retorne APENAS JSON válido (sem markdown, sem backticks) no formato:

{
  "foods": [
    { "name": "Nome do alimento", "portion": "quantidade estimada", "calories": número, "protein": gramas, "carbs": gramas, "fat": gramas }
  ],
  "totals": { "calories": total, "protein": total, "carbs": total, "fat": total },
  "confidence": "high" | "medium" | "low",
  "mealName": "Nome resumido da refeição"
}

Regras:
- Valores em números (não strings)
- Calorias entre 0-5000 por refeição
- Se não conseguir identificar a comida, retorne confidence "low"
- Nomes dos alimentos em português brasileiro
- Considere porções típicas brasileiras
- Se for comida brasileira (feijoada, coxinha, pão de queijo, açaí, etc.), use valores da tabela TACO/IBGE`

export async function analyzeFood(apiKey: string, imageBase64: string): Promise<NutritionResult> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const result = await model.generateContent([
    { text: ANALYSIS_PROMPT },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64,
      },
    },
  ])

  const text = result.response.text().trim()

  // Clean potential markdown wrapping
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')

  const parsed = JSON.parse(cleaned) as unknown
  return NutritionResultSchema.parse(parsed)
}
