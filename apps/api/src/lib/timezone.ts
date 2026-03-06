const supportedTimezones = (() => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const values = Intl.supportedValuesOf('timeZone')
      if (Array.isArray(values) && values.length > 0) {
        return new Set(values)
      }
    }
  } catch {
    // ignore runtime differences and fallback to DateTimeFormat validation
  }

  return null
})()

export function isValidIanaTimezone(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  if (supportedTimezones) {
    return supportedTimezones.has(trimmed)
  }

  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone
    return resolved === trimmed
  } catch {
    return false
  }
}

function canonicalizeIanaTimezone(value: string) {
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
    return resolved || value
  } catch {
    return value
  }
}

export function normalizeIanaTimezone(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  if (!isValidIanaTimezone(trimmed)) {
    return null
  }

  if (supportedTimezones) {
    return trimmed
  }

  try {
    return canonicalizeIanaTimezone(trimmed)
  } catch {
    return trimmed
  }
}

export function getDateForTimezone(timeZone: string, now: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Não foi possível calcular data para timezone ${timeZone}`)
  }

  return `${year}-${month}-${day}`
}
