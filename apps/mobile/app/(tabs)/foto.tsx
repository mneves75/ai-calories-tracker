import { Redirect } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, analyzeMeal, createMealFromAnalysis } from '../../src/lib/api'
import { getLocalDateString } from '../../src/lib/date'
import {
  confidenceClassName,
  confidenceLabel,
  mealTypeLabels,
  scaleTotalsByCalories,
} from '../../src/lib/meal'
import { useAuth } from '../../src/providers/auth-provider'
import type { AnalysisResponse, MealType } from '../../src/types/domain'

const mealTypeOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

function generateOperationId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${uuid}`
}

export default function FotoScreen() {
  const { token, loading, hasCompletedOnboarding, logout, handleSessionInvalidError } = useAuth()
  const [selectedMealType, setSelectedMealType] = useState<MealType>('lunch')
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResponse['analysis'] | null>(null)
  const [portion, setPortion] = useState('1 porção')
  const [editedName, setEditedName] = useState('')
  const [editedCalories, setEditedCalories] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualCalories, setManualCalories] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const analyzingLockRef = useRef(false)
  const savingLockRef = useRef(false)
  const manualSavingLockRef = useRef(false)
  const lastSavedSignatureRef = useRef<string | null>(null)
  const pendingOperationIdsRef = useRef<Record<string, string>>({})
  const pendingManualOperationIdsRef = useRef<Record<string, string>>({})

  if (!loading && !token) {
    return <Redirect href="/(auth)/login" />
  }

  if (!loading && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />
  }

  async function prepareImage(asset: ImagePicker.ImagePickerAsset) {
    let quality = 0.8
    let width = 1024
    let currentUri = asset.uri

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ resize: { width } }],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      )

      if (!result.base64) {
        continue
      }

      const estimatedBytes = Math.floor((result.base64.length * 3) / 4)
      if (estimatedBytes <= 300 * 1024) {
        return {
          uri: result.uri,
          base64: result.base64,
          estimatedBytes,
        }
      }

      currentUri = result.uri
      quality = Math.max(0.45, quality - 0.2)
      width = Math.max(720, width - 140)
    }

    throw new Error('Não foi possível comprimir a imagem para menos de 300KB. Tente outra foto.')
  }

  async function pickImage(source: 'camera' | 'gallery') {
    setError(null)
    setSuccess(null)
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) {
          setError('Permissão de câmera negada. Ative a câmera nas configurações do aparelho.')
          return
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permission.granted) {
          setError('Permissão da galeria negada. Ative o acesso às fotos nas configurações.')
          return
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false, mediaTypes: ['images'] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: false, mediaTypes: ['images'] })

      if (result.canceled) {
        return
      }

      const prepared = await prepareImage(result.assets[0])
      setPreviewUri(prepared.uri)
      setImageBase64(prepared.base64)
      setAnalysis(null)
      setEditedName('')
      setEditedCalories('0')
      lastSavedSignatureRef.current = null
      pendingOperationIdsRef.current = {}
    } catch (err) {
      if (err instanceof Error && err.message.includes('comprimir')) {
        setError(err.message)
      } else if (source === 'camera') {
        setError('Não foi possível abrir a câmera agora.')
      } else {
        setError('Não foi possível abrir a galeria agora.')
      }
    }
  }

  async function analyzeCurrentImage() {
    if (
      !token ||
      !imageBase64 ||
      analyzingLockRef.current ||
      savingLockRef.current ||
      manualSavingLockRef.current
    ) {
      return
    }

    analyzingLockRef.current = true
    setAnalyzing(true)
    setError(null)
    setSuccess(null)

    try {
      const localDate = getLocalDateString()
      let response: AnalysisResponse | null = null

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await analyzeMeal(token, {
            imageBase64,
            mealType: selectedMealType,
            localDate,
          })
          break
        } catch (err) {
          if (err instanceof ApiError && err.status === 429 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200))
            continue
          }
          throw err
        }
      }

      if (!response) {
        throw new Error('Falha na análise')
      }

      setAnalysis(response.analysis)
      setEditedName(response.analysis.mealName)
      setEditedCalories(String(Math.round(response.analysis.totals.calories)))
      setPortion(response.analysis.foods[0]?.portion ?? '1 porção')
      lastSavedSignatureRef.current = null
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao analisar imagem.')
      }
    } finally {
      analyzingLockRef.current = false
      setAnalyzing(false)
    }
  }

  async function saveMeal() {
    if (!token || !analysis || savingLockRef.current || analyzingLockRef.current || manualSavingLockRef.current) {
      return
    }

    const parsedCalories = Number(editedCalories)
    if (!Number.isFinite(parsedCalories) || parsedCalories < 0 || parsedCalories > 5000) {
      setError('Informe calorias válidas entre 0 e 5000.')
      return
    }
    if (!editedName.trim()) {
      setError('Informe o nome da refeição.')
      return
    }
    if (!portion.trim()) {
      setError('Informe a porção da refeição.')
      return
    }

    const localDate = getLocalDateString()

    const saveSignature = JSON.stringify({
      imageKey: analysis.imageKey,
      mealType: selectedMealType,
      localDate,
      name: editedName.trim(),
      portion: portion.trim(),
      calories: parsedCalories,
    })
    const operationId = pendingOperationIdsRef.current[saveSignature] ?? generateOperationId('meal')
    pendingOperationIdsRef.current[saveSignature] = operationId
    if (lastSavedSignatureRef.current === saveSignature) {
      setError(null)
      setSuccess('Essa refeição já foi salva.')
      return
    }

    savingLockRef.current = true
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const scaled = scaleTotalsByCalories(analysis.totals, parsedCalories)

      const payload: Parameters<typeof createMealFromAnalysis>[1] = {
        name: `${editedName} (${portion})`,
        mealType: selectedMealType,
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
        localDate,
        foodsDetected: analysis.foods,
        aiConfidence: analysis.confidence,
        isManualEntry: false,
        operationId,
      }

      if (analysis.imageKey) {
        payload.imageKey = analysis.imageKey
        payload.analysisToken = analysis.analysisToken
      }

      await createMealFromAnalysis(token, payload)

      delete pendingOperationIdsRef.current[saveSignature]
      lastSavedSignatureRef.current = saveSignature
      setSuccess('Refeição salva com sucesso!')
      setAnalysis(null)
      setPreviewUri(null)
      setImageBase64(null)
      setEditedName('')
      setEditedCalories('0')
      setPortion('1 porção')
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Não foi possível salvar a refeição.')
      }
    } finally {
      savingLockRef.current = false
      setSaving(false)
    }
  }

  function parseManualNumber(value: string, label: string, max: number) {
    const normalized = Number(value)
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > max) {
      throw new Error(`Informe ${label} válido(a) entre 0 e ${max}.`)
    }
    return normalized
  }

  async function saveManualMeal() {
    if (!token || manualSavingLockRef.current || analyzingLockRef.current || savingLockRef.current) {
      return
    }

    if (!manualName.trim()) {
      setError('Informe o nome da refeição manual.')
      return
    }

    let calories = 0
    let protein = 0
    let carbs = 0
    let fat = 0

    try {
      calories = parseManualNumber(manualCalories, 'calorias', 5000)
      protein = parseManualNumber(manualProtein, 'proteína', 500)
      carbs = parseManualNumber(manualCarbs, 'carboidratos', 1000)
      fat = parseManualNumber(manualFat, 'gordura', 500)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Dados manuais inválidos.')
      }
      return
    }

    manualSavingLockRef.current = true
    setManualSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const localDate = getLocalDateString()
      const manualSignature = JSON.stringify({
        name: manualName.trim(),
        mealType: selectedMealType,
        calories,
        protein,
        carbs,
        fat,
        localDate,
      })
      const operationId = pendingManualOperationIdsRef.current[manualSignature] ?? generateOperationId('manual')
      pendingManualOperationIdsRef.current[manualSignature] = operationId

      await createMealFromAnalysis(token, {
        name: manualName.trim(),
        mealType: selectedMealType,
        calories,
        protein,
        carbs,
        fat,
        localDate,
        isManualEntry: true,
        operationId,
      })

      delete pendingManualOperationIdsRef.current[manualSignature]
      setSuccess('Refeição manual salva com sucesso!')
      setManualName('')
      setManualCalories('')
      setManualProtein('')
      setManualCarbs('')
      setManualFat('')
    } catch (err) {
      if (await handleSessionInvalidError(err)) {
        return
      }

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Não foi possível salvar a refeição manual.')
      }
    } finally {
      manualSavingLockRef.current = false
      setManualSaving(false)
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-[#08110f]"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-6 pb-16 pt-12"
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-3xl font-bold text-white">Escanear refeição</Text>
        <Pressable
          onPress={() => {
            void logout()
          }}
          className="rounded-lg border border-zinc-700 px-3 py-2"
        >
          <Text className="text-xs font-semibold text-zinc-200">Sair</Text>
        </Pressable>
      </View>
      <Text className="mt-2 text-zinc-300">Tire foto, revise os dados e salve em até 3 toques.</Text>

      <View className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <Text className="mb-2 text-sm text-zinc-400">Tipo de refeição</Text>
        <View className="flex-row flex-wrap gap-2">
          {mealTypeOrder.map((mealType) => (
            <Pressable
              key={mealType}
              onPress={() => setSelectedMealType(mealType)}
              className={`rounded-xl border px-3 py-2 ${selectedMealType === mealType ? 'border-brand-400 bg-brand-500/20' : 'border-zinc-700 bg-zinc-900'}`}
            >
              <Text className="text-xs text-zinc-100">{mealTypeLabels[mealType]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Pressable
          disabled={analyzing || saving || manualSaving}
          onPress={() => {
            void pickImage('camera')
          }}
          className={`flex-1 rounded-xl px-4 py-4 ${analyzing || saving || manualSaving ? 'bg-zinc-700' : 'bg-brand-600'}`}
        >
          <Text className="text-center font-semibold text-white">Tirar foto</Text>
        </Pressable>

        <Pressable
          disabled={analyzing || saving || manualSaving}
          onPress={() => {
            void pickImage('gallery')
          }}
          className={`flex-1 rounded-xl px-4 py-4 ${analyzing || saving || manualSaving ? 'bg-zinc-700' : 'bg-zinc-800'}`}
        >
          <Text className="text-center font-semibold text-white">Galeria</Text>
        </Pressable>
      </View>

      {previewUri ? (
        <View className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
          <Image source={{ uri: previewUri }} className="h-64 w-full rounded-xl" resizeMode="cover" />

          <Pressable
            disabled={analyzing || saving || manualSaving}
            onPress={() => {
              void analyzeCurrentImage()
            }}
            className={`mt-3 rounded-xl px-4 py-4 ${analyzing || saving || manualSaving ? 'bg-zinc-700' : 'bg-brand-500'}`}
          >
            {analyzing ? (
              <View className="flex-row items-center justify-center gap-2">
                <ActivityIndicator color="#fff" />
                <Text className="font-semibold text-white">Analisando (2-5s)...</Text>
              </View>
            ) : (
              <Text className="text-center font-semibold text-white">Analisar com IA</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {analysis ? (
        <View className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-zinc-100">Resultado estimado</Text>
            <Text className={`rounded-full px-3 py-1 text-xs font-semibold ${confidenceClassName(analysis.confidence)}`}>
              Confiança {confidenceLabel(analysis.confidence)}
            </Text>
          </View>

          <Text className="text-3xl font-bold text-brand-300">~{Math.round(analysis.totals.calories)} kcal</Text>

          <View className="mt-4 gap-3">
            <View>
              <Text className="mb-1 text-zinc-300">Nome da refeição</Text>
              <TextInput
                value={editedName}
                onChangeText={setEditedName}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>

            <View>
              <Text className="mb-1 text-zinc-300">Porção</Text>
              <TextInput
                value={portion}
                onChangeText={setPortion}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>

            <View>
              <Text className="mb-1 text-zinc-300">Calorias corrigidas</Text>
              <TextInput
                value={editedCalories}
                onChangeText={setEditedCalories}
                keyboardType="numeric"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              />
            </View>
          </View>

          <Pressable
            disabled={saving || manualSaving}
            onPress={() => {
              void saveMeal()
            }}
            className={`mt-4 rounded-xl px-4 py-4 ${saving || manualSaving ? 'bg-zinc-700' : 'bg-brand-500'}`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-center font-semibold text-white">Salvar refeição</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <Text className="text-lg font-semibold text-zinc-100">Registro manual</Text>
        <Text className="mt-1 text-zinc-300">Sem foto agora? Registre a refeição manualmente.</Text>

        <View className="mt-4 gap-3">
          <View>
            <Text className="mb-1 text-zinc-300">Nome da refeição</Text>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              placeholder="Ex.: Omelete com salada"
              placeholderTextColor="#737373"
            />
          </View>

          <View>
            <Text className="mb-1 text-zinc-300">Calorias</Text>
            <TextInput
              value={manualCalories}
              onChangeText={setManualCalories}
              keyboardType="numeric"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
              placeholder="Ex.: 450"
              placeholderTextColor="#737373"
            />
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="mb-1 text-zinc-300">Proteína (g)</Text>
              <TextInput
                value={manualProtein}
                onChangeText={setManualProtein}
                keyboardType="numeric"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
                placeholder="0"
                placeholderTextColor="#737373"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-zinc-300">Carboidratos (g)</Text>
              <TextInput
                value={manualCarbs}
                onChangeText={setManualCarbs}
                keyboardType="numeric"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
                placeholder="0"
                placeholderTextColor="#737373"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-zinc-300">Gordura (g)</Text>
              <TextInput
                value={manualFat}
                onChangeText={setManualFat}
                keyboardType="numeric"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"
                placeholder="0"
                placeholderTextColor="#737373"
              />
            </View>
          </View>
        </View>

        <Pressable
          disabled={manualSaving || saving || analyzing}
          onPress={() => {
            void saveManualMeal()
          }}
          className={`mt-4 rounded-xl px-4 py-4 ${manualSaving ? 'bg-zinc-700' : 'bg-zinc-800'}`}
        >
          {manualSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-center font-semibold text-white">Salvar refeição manual</Text>
          )}
        </Pressable>
      </View>

      {error ? (
        <View className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Text className="text-red-200">{error}</Text>
        </View>
      ) : null}

      {success ? (
        <View className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <Text className="text-emerald-200">{success}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}
