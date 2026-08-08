import { describe, it, expect } from 'vitest'
import {
  VAPID_KEY_BYTES, isValidVapidPublicKey, readVapidPublicKey, urlBase64ToUint8Array,
} from '../vapid.js'

// A real VAPID public key: 65 bytes, 0x04 prefix, base64url. Built rather than
// pasted so the test says why it is shaped this way.
function makeKey(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const VALID_BYTES = Uint8Array.from({ length: VAPID_KEY_BYTES }, (_, i) => (i === 0 ? 0x04 : i))
const VALID_KEY = makeKey(VALID_BYTES)

describe('urlBase64ToUint8Array', () => {
  it('round-trips a real key', () => {
    expect(Array.from(urlBase64ToUint8Array(VALID_KEY))).toEqual(Array.from(VALID_BYTES))
  })

  it('decodes correctly whatever the padding residue is', () => {
    // A real key is 65 bytes, so length % 4 === 3 — it arrives unpadded and
    // must still decode byte-for-byte. Note this does NOT pin the padding
    // step: `atob` is forgiving-base64 and accepts unpadded input, so
    // removing that line changes nothing. The module says so rather than
    // pretending otherwise.
    expect(VALID_KEY.length % 4).toBe(3)
    for (const length of [3, 4, 5]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i + 1)
      expect(Array.from(urlBase64ToUint8Array(makeKey(bytes)))).toEqual(Array.from(bytes))
    }
  })

  it('translates the two base64url characters', () => {
    // atob speaks standard base64. A key containing - or _ decodes to the
    // wrong bytes, or throws, if these are not swapped back.
    const withBoth = makeKey(Uint8Array.from([0x04, 0xfb, 0xff, 0xbf, 0xfe]))
    expect(withBoth).toMatch(/[-_]/)
    expect(Array.from(urlBase64ToUint8Array(withBoth))).toEqual([0x04, 0xfb, 0xff, 0xbf, 0xfe])
  })

  it('returns null rather than throwing on junk', () => {
    for (const junk of ['', '   ', null, undefined, 42, '!!!not base64!!!']) {
      expect(urlBase64ToUint8Array(junk)).toBeNull()
    }
  })

  it('ignores surrounding whitespace', () => {
    // A key pasted with a trailing newline is present, wrong and invisible —
    // the same shape as the v1.6.7 Supabase trap.
    expect(urlBase64ToUint8Array(`\n  ${VALID_KEY}  \n`)).toEqual(urlBase64ToUint8Array(VALID_KEY))
  })
})

describe('isValidVapidPublicKey', () => {
  it('accepts an uncompressed P-256 point', () => {
    expect(isValidVapidPublicKey(VALID_KEY)).toBe(true)
  })

  it('rejects a key that lost characters to a bad copy-paste', () => {
    // The failure this exists for. The browser answers a short key with a bare
    // InvalidAccessError that says nothing about the environment variable.
    expect(isValidVapidPublicKey(VALID_KEY.slice(0, -4))).toBe(false)
  })

  it('rejects a correctly-sized key that is not an uncompressed point', () => {
    const wrongPrefix = Uint8Array.from(VALID_BYTES)
    wrongPrefix[0] = 0x03
    expect(isValidVapidPublicKey(makeKey(wrongPrefix))).toBe(false)
  })

  it('rejects junk', () => {
    for (const junk of ['', '   ', null, undefined, 'not-a-key']) {
      expect(isValidVapidPublicKey(junk)).toBe(false)
    }
  })
})

describe('readVapidPublicKey', () => {
  it('returns the configured key', () => {
    expect(readVapidPublicKey({ VITE_VAPID_PUBLIC_KEY: VALID_KEY })).toBe(VALID_KEY)
  })

  it('returns the key trimmed, not merely a key that happens to work', () => {
    // A variable pasted with a trailing newline is present, wrong and
    // invisible. `urlBase64ToUint8Array` trims again on the way out, so the
    // subscribe path survives either way — but this function's contract is
    // "the configured key", and handing back leading whitespace makes every
    // other caller responsible for a cleanup this one already claims to do.
    expect(readVapidPublicKey({ VITE_VAPID_PUBLIC_KEY: `\n  ${VALID_KEY}  \n` })).toBe(VALID_KEY)
  })

  it('treats blank as missing', () => {
    // .env.example ships the variable declared and empty, and that is also
    // what a Vercel variable saved empty looks like. `??` would call that
    // configured and hand '' to subscribe().
    expect(readVapidPublicKey({ VITE_VAPID_PUBLIC_KEY: '' })).toBe('')
    expect(readVapidPublicKey({ VITE_VAPID_PUBLIC_KEY: '   ' })).toBe('')
    expect(readVapidPublicKey({})).toBe('')
    expect(readVapidPublicKey(undefined)).toBe('')
  })

  it('refuses a malformed key rather than passing it on', () => {
    // Reporting "unconfigured" is better than a subscribe button that throws.
    expect(readVapidPublicKey({ VITE_VAPID_PUBLIC_KEY: 'obviously-wrong' })).toBe('')
  })
})
