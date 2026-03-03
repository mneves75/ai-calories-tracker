import { verifyPassword as verifyLegacyScryptPassword } from 'better-auth/crypto'

const PBKDF2_PREFIX = 'pbkdf2_sha256'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const PBKDF2_KEY_BYTES = 32
const textEncoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('hex inválido')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16)
    if (Number.isNaN(value)) {
      throw new Error('hex inválido')
    }
    bytes[index / 2] = value
  }
  return bytes
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }

  return diff === 0
}

async function derivePbkdf2Key(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const importedKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(salt),
      iterations,
    },
    importedKey,
    PBKDF2_KEY_BYTES * 8
  )

  return new Uint8Array(derivedBits)
}

export async function hashPasswordForWorkers(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
  const key = await derivePbkdf2Key(password, salt, PBKDF2_ITERATIONS)

  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`
}

async function verifyPbkdf2Hash(data: { hash: string; password: string }): Promise<boolean> {
  const [prefix, iterationsRaw, saltHex, keyHex] = data.hash.split('$')

  if (prefix !== PBKDF2_PREFIX || !iterationsRaw || !saltHex || !keyHex) {
    return false
  }

  const iterations = Number.parseInt(iterationsRaw, 10)
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 1_000_000) {
    return false
  }

  try {
    const salt = hexToBytes(saltHex)
    const expectedKey = hexToBytes(keyHex)
    const candidate = await derivePbkdf2Key(data.password, salt, iterations)
    return constantTimeEqual(candidate, expectedKey)
  } catch {
    return false
  }
}

function isPbkdf2Hash(hash: string): boolean {
  return hash.startsWith(`${PBKDF2_PREFIX}$`)
}

export async function verifyPasswordForWorkers(data: { hash: string; password: string }): Promise<boolean> {
  if (isPbkdf2Hash(data.hash)) {
    return verifyPbkdf2Hash(data)
  }

  return verifyLegacyScryptPassword(data)
}
