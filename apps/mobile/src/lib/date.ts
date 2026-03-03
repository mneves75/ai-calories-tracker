export function getLocalDateString(input: Date = new Date(), timeZone?: string) {
  if (timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(input)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value

    if (year && month && day) {
      return `${year}-${month}-${day}`
    }
  }

  const year = input.getFullYear()
  const month = String(input.getMonth() + 1).padStart(2, '0')
  const day = String(input.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDeviceTimezone() {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()
  return resolved && resolved.length > 0 ? resolved : 'UTC'
}

export function birthDateFromAge(age: number, referenceDate: Date = new Date()) {
  if (!Number.isFinite(age) || age < 12 || age > 100) {
    return null
  }

  const birthYear = referenceDate.getFullYear() - Math.floor(age)
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  const day = String(referenceDate.getDate()).padStart(2, '0')
  return `${birthYear}-${month}-${day}`
}

export function formatDatePtBr(date: string) {
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) {
    return date
  }
  return `${day}/${month}/${year}`
}
