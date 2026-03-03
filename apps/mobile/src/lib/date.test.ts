import { describe, expect, it } from 'bun:test'
import { birthDateFromAge, formatDatePtBr, getDeviceTimezone, getLocalDateString } from './date'

describe('date utils', () => {
  it('gera string local YYYY-MM-DD', () => {
    const value = getLocalDateString(new Date('2026-03-03T10:00:00.000Z'))
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('gera datas por timezone em borda UTC-12 e UTC+14', () => {
    const instant = new Date('2026-03-03T10:30:00.000Z')
    expect(getLocalDateString(instant, 'Etc/GMT+12')).toBe('2026-03-02')
    expect(getLocalDateString(instant, 'Pacific/Kiritimati')).toBe('2026-03-04')
  })

  it('converte idade para data de nascimento', () => {
    const birthDate = birthDateFromAge(30, new Date('2026-03-03T00:00:00.000Z'))
    expect(birthDate).toBe('1996-03-03')
  })

  it('formata data para pt-BR', () => {
    expect(formatDatePtBr('2026-03-03')).toBe('03/03/2026')
  })

  it('retorna timezone do dispositivo com fallback seguro', () => {
    expect(getDeviceTimezone().length).toBeGreaterThan(0)
  })
})
