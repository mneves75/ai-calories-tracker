import { describe, expect, it } from 'bun:test'
import { hashPassword as hashLegacyScryptPassword } from 'better-auth/crypto'
import { hashPasswordForWorkers, verifyPasswordForWorkers } from './password-hash'

describe('password-hash', () => {
  it('gera hash PBKDF2 e valida a mesma senha', async () => {
    const password = 'Senha123!forte'
    const hash = await hashPasswordForWorkers(password)

    expect(hash.startsWith('pbkdf2_sha256$')).toBe(true)
    await expect(verifyPasswordForWorkers({ hash, password })).resolves.toBe(true)
  })

  it('rejeita senha incorreta para hash PBKDF2', async () => {
    const hash = await hashPasswordForWorkers('Senha123!forte')
    await expect(verifyPasswordForWorkers({ hash, password: 'errada' })).resolves.toBe(false)
  })

  it('mantém compatibilidade com hash legado em scrypt', async () => {
    const password = 'Senha123!forte'
    const legacyHash = await hashLegacyScryptPassword(password)

    await expect(verifyPasswordForWorkers({ hash: legacyHash, password })).resolves.toBe(true)
    await expect(verifyPasswordForWorkers({ hash: legacyHash, password: 'errada' })).resolves.toBe(false)
  })

  it('retorna false para hash PBKDF2 malformado', async () => {
    await expect(
      verifyPasswordForWorkers({
        hash: 'pbkdf2_sha256$not-a-number$abc$def',
        password: 'qualquer',
      })
    ).resolves.toBe(false)
  })
})
