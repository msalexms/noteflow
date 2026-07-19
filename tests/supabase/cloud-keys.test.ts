import { describe, it, expect } from 'vitest'
import {
  KEY_BYTES,
  toB64Url,
  fromB64Url,
  parseDekParam,
  parseManagedKek,
  wrapDek,
  unwrapDek,
  resolveRoute,
  keysErrorBody,
} from '../../supabase/functions/cloud-keys/logic'
import { unwrapKey as clientUnwrapKey, wrapKey as clientWrapKey } from '../../electron/cloudCrypto'

const B64URL_RE = /^[A-Za-z0-9_-]+$/

function randomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES))
}

describe('base64url (Web-API implementation, no Buffer)', () => {
  it('round-trips arbitrary bytes without padding chars', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = toB64Url(bytes)
    expect(encoded).toMatch(B64URL_RE)
    expect(fromB64Url(encoded)).toEqual(bytes)
  })

  it('rejects non-base64url input instead of throwing', () => {
    expect(fromB64Url('not/base64url+')).toBeNull()
    expect(fromB64Url('has=padding')).toBeNull()
  })
})

describe('parseDekParam', () => {
  it('accepts {dek} with exactly 32 base64url bytes', () => {
    const dek = randomKey()
    expect(parseDekParam({ dek: toB64Url(dek) })).toEqual(dek)
  })

  it('rejects wrong lengths, wrong types and malformed bodies', () => {
    expect(parseDekParam({ dek: toB64Url(new Uint8Array(31)) })).toBeNull()
    expect(parseDekParam({ dek: toB64Url(new Uint8Array(33)) })).toBeNull()
    expect(parseDekParam({ dek: '' })).toBeNull()
    expect(parseDekParam({ dek: 42 })).toBeNull()
    expect(parseDekParam({})).toBeNull()
    expect(parseDekParam(null)).toBeNull()
    expect(parseDekParam([toB64Url(randomKey())])).toBeNull()
    expect(parseDekParam({ dek: '!!!not-base64!!!' })).toBeNull()
  })
})

describe('parseManagedKek', () => {
  it('accepts 32 bytes in standard base64 (openssl rand -base64 32 output)', () => {
    const kek = randomKey()
    const stdB64 = Buffer.from(kek).toString('base64') // padded, may contain +/
    expect(parseManagedKek(stdB64)).toEqual(kek)
    expect(parseManagedKek(` ${stdB64}\n`)).toEqual(kek) // env whitespace tolerated
  })

  it('accepts base64url too', () => {
    const kek = randomKey()
    expect(parseManagedKek(toB64Url(kek))).toEqual(kek)
  })

  it('rejects missing or wrong-size secrets', () => {
    expect(parseManagedKek(undefined)).toBeNull()
    expect(parseManagedKek(null)).toBeNull()
    expect(parseManagedKek('')).toBeNull()
    expect(parseManagedKek('too-short')).toBeNull()
    expect(parseManagedKek(Buffer.from(new Uint8Array(16)).toString('base64'))).toBeNull()
  })
})

describe('wrapDek / unwrapDek', () => {
  it('round-trips a DEK under the operator KEK', async () => {
    const dek = randomKey()
    const kek = randomKey()
    const sealed = await wrapDek(dek, kek)
    expect(sealed).toMatch(B64URL_RE)
    expect(await unwrapDek(sealed, kek)).toEqual(dek)
  })

  it('produces a fresh IV per wrap (same inputs, different blobs)', async () => {
    const dek = randomKey()
    const kek = randomKey()
    expect(await wrapDek(dek, kek)).not.toEqual(await wrapDek(dek, kek))
  })

  it('throws on a wrong KEK or tampered blob', async () => {
    const sealed = await wrapDek(randomKey(), randomKey())
    await expect(unwrapDek(sealed, randomKey())).rejects.toThrow()
    const tampered = (sealed[0] === 'A' ? 'B' : 'A') + sealed.slice(1)
    await expect(unwrapDek(tampered, randomKey())).rejects.toThrow()
  })

  it('rejects wrong-size keys and truncated blobs', async () => {
    await expect(wrapDek(new Uint8Array(16), randomKey())).rejects.toThrow()
    await expect(wrapDek(randomKey(), new Uint8Array(16))).rejects.toThrow()
    await expect(unwrapDek('AAAA', randomKey())).rejects.toThrow()
  })

  it('uses the exact sealed-blob format of electron/cloudCrypto.ts (interop both ways)', async () => {
    const dek = randomKey()
    const kek = randomKey()
    // Server wraps → client unwraps (the electron/cloudKeys.ts unlock path
    // reuses the base64url decoding; here we prove format compatibility).
    const serverSealed = await wrapDek(dek, kek)
    expect(await clientUnwrapKey(serverSealed, kek)).toEqual(dek)
    // Client wraps → server unwraps (future-proofing; same primitive).
    const clientSealed = await clientWrapKey(dek, kek)
    expect(await unwrapDek(clientSealed, kek)).toEqual(dek)
  })
})

describe('resolveRoute', () => {
  it('routes only POST /setup, POST /unlock and POST /downgrade', () => {
    expect(resolveRoute('POST', '/functions/v1/cloud-keys/setup')).toBe('setup')
    expect(resolveRoute('POST', '/functions/v1/cloud-keys/unlock')).toBe('unlock')
    expect(resolveRoute('POST', '/functions/v1/cloud-keys/downgrade')).toBe('downgrade')
    expect(resolveRoute('GET', '/functions/v1/cloud-keys/unlock')).toBeNull()
    expect(resolveRoute('GET', '/functions/v1/cloud-keys/downgrade')).toBeNull()
    expect(resolveRoute('POST', '/functions/v1/cloud-keys')).toBeNull()
    expect(resolveRoute('POST', '/functions/v1/cloud-keys/other')).toBeNull()
  })
})

describe('keysErrorBody', () => {
  it('has the {error: {message, code}} shape the desktop client parses', () => {
    expect(keysErrorBody('Nope.', 'no_keys')).toEqual({
      error: { message: 'Nope.', code: 'no_keys' },
    })
  })
})
