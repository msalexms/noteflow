import type { NoteEncryption, NoteSection } from '../types'

const DEFAULT_ITERATIONS = 310_000
const DEFAULT_SALT_BYTES = 16
const DEFAULT_HASH_ALG = 'SHA-256' as const
const IV_BYTES = 12

export interface EncryptionOptions {
  iterations?: number              // default: 310_000, min: 100_000, max: 2_000_000
  saltBytes?: number               // default: 16, min: 16, max: 32
  hashAlg?: 'SHA-256' | 'SHA-512' // default: 'SHA-256'
}

function toB64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function fromB64Url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return bytes.buffer as ArrayBuffer
}

async function deriveKey(
  password: string,
  salt: ArrayBuffer,
  usage: 'encrypt' | 'decrypt',
  iterations: number,
  hash: 'SHA-256' | 'SHA-512'
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

export async function encryptSections(
  sections: NoteSection[],
  password: string,
  options?: EncryptionOptions
): Promise<NoteEncryption> {
  const iterations = options?.iterations ?? DEFAULT_ITERATIONS
  const saltBytes  = options?.saltBytes  ?? DEFAULT_SALT_BYTES
  const hashAlg    = options?.hashAlg    ?? DEFAULT_HASH_ALG

  const saltBuf = crypto.getRandomValues(new Uint8Array(saltBytes)).buffer as ArrayBuffer
  const ivBuf   = crypto.getRandomValues(new Uint8Array(IV_BYTES)).buffer as ArrayBuffer
  const key     = await deriveKey(password, saltBuf, 'encrypt', iterations, hashAlg)
  const plaintext     = new TextEncoder().encode(JSON.stringify(sections))
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, plaintext)

  const enc: NoteEncryption = {
    alg:        'aes-256-gcm+pbkdf2',
    salt:       toB64Url(saltBuf),
    iv:         toB64Url(ivBuf),
    ciphertext: toB64Url(ciphertextBuf),
  }
  // Only store non-default values to keep YAML clean
  if (iterations !== DEFAULT_ITERATIONS) enc.iterations = iterations
  if (hashAlg    !== DEFAULT_HASH_ALG)   enc.hashAlg    = hashAlg
  return enc
}

export async function decryptSections(
  enc: NoteEncryption,
  password: string
): Promise<NoteSection[]> {
  const iterations = enc.iterations ?? DEFAULT_ITERATIONS
  const hashAlg    = enc.hashAlg    ?? DEFAULT_HASH_ALG

  const saltBuf       = fromB64Url(enc.salt)
  const ivBuf         = fromB64Url(enc.iv)
  const ciphertextBuf = fromB64Url(enc.ciphertext)
  const key           = await deriveKey(password, saltBuf, 'decrypt', iterations, hashAlg)
  // Throws DOMException on wrong password (AES-GCM auth tag mismatch)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, ciphertextBuf)
  return JSON.parse(new TextDecoder().decode(plainBuf)) as NoteSection[]
}
