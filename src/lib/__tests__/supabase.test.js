import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The pure helpers are covered in supabaseEnv.test.js. These cover the wiring —
// that `supabase.js` actually calls them — because a warning nobody emits is
// the exact failure mode #20 is about, and it would pass every test over there.

const createClient = vi.fn(() => ({ from: () => {} }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args) => createClient(...args) }))

const URL_VAR = 'VITE_SUPABASE_URL'
const KEY_VAR = 'VITE_SUPABASE_ANON_KEY'

// Module scope runs once per import, so every case needs a fresh module graph.
async function importSupabase({ url, key }) {
  vi.resetModules()
  vi.stubEnv(URL_VAR, url)
  vi.stubEnv(KEY_VAR, key)
  return (await import('../supabase.js')).supabase
}

let warn

beforeEach(() => {
  createClient.mockClear()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('supabase client', () => {
  it('creates a client and says nothing when both variables are set', async () => {
    const client = await importSupabase({ url: 'https://proj.supabase.co', key: 'anon-key' })

    expect(client).not.toBeNull()
    expect(createClient).toHaveBeenCalledWith('https://proj.supabase.co', 'anon-key')
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps the soft-fail: a missing variable yields null, not a throw', async () => {
    expect(await importSupabase({ url: undefined, key: undefined })).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('warns at startup, naming the variable that is missing', async () => {
    await importSupabase({ url: 'https://proj.supabase.co', key: undefined })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(KEY_VAR)
  })

  // A blank value is what a Vercel variable saved empty looks like, and what
  // `.env.example` ships. Passing it to createClient would produce a client
  // that exists and fails every request — the silent death this replaces.
  it('warns and refuses to build a client from a blank variable', async () => {
    const client = await importSupabase({ url: '', key: 'anon-key' })

    expect(client).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain(URL_VAR)
  })
})
