import { describe, expect, it } from 'bun:test'
import { getDateForTimezone, isValidIanaTimezone, normalizeIanaTimezone } from './timezone'

describe('timezone utils', () => {
  it('valida timezones IANA', () => {
    expect(isValidIanaTimezone('America/Sao_Paulo')).toBe(true)
    expect(isValidIanaTimezone('Invalid/Timezone')).toBe(false)
  })

  it('normaliza timezone IANA', () => {
    expect(normalizeIanaTimezone('  America/New_York  ')).toBe('America/New_York')
    expect(normalizeIanaTimezone('')).toBeNull()
    expect(normalizeIanaTimezone('Invalid/Timezone')).toBeNull()
  })

  it('calcula data correta por timezone em borda UTC-12 e UTC+14', () => {
    const instant = new Date('2026-03-03T10:30:00.000Z')
    expect(getDateForTimezone('Etc/GMT+12', instant)).toBe('2026-03-02')
    expect(getDateForTimezone('Pacific/Kiritimati', instant)).toBe('2026-03-04')
  })
})
