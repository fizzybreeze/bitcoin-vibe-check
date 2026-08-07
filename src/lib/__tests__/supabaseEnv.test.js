import { describe, it, expect } from 'vitest'
import {
  SUPABASE_ENV_VARS, missingSupabaseEnv, supabaseCredentials, supabaseConfigWarning,
} from '../supabaseEnv.js'

// #20: the Supabase client fails soft, which is right, but it used to fail
// silently, which is not. These pin the half of that signal that runs in the
// browser — what gets named, and when nothing is said at all.

const CONFIGURED = {
  [SUPABASE_ENV_VARS.url]: 'https://proj.supabase.co',
  [SUPABASE_ENV_VARS.key]: 'anon-key',
}

describe('missingSupabaseEnv', () => {
  it('finds nothing missing when both are set', () => {
    expect(missingSupabaseEnv(CONFIGURED)).toEqual([])
  })

  it('names both when neither is set', () => {
    expect(missingSupabaseEnv({})).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
  })

  it('names only the one that is missing', () => {
    expect(missingSupabaseEnv({ ...CONFIGURED, [SUPABASE_ENV_VARS.key]: undefined }))
      .toEqual(['VITE_SUPABASE_ANON_KEY'])
  })

  // `.env.example` ships both declared and empty, so this is the shape a
  // half-finished setup actually has — and a Vercel variable saved blank looks
  // identical. Treating it as present would hand `createClient` an empty URL.
  it('treats a declared-but-blank variable as missing', () => {
    expect(missingSupabaseEnv({ ...CONFIGURED, [SUPABASE_ENV_VARS.url]: '   ' }))
      .toEqual(['VITE_SUPABASE_URL'])
  })

  it('survives being handed no environment at all', () => {
    expect(missingSupabaseEnv(undefined)).toHaveLength(2)
  })
})

describe('supabaseCredentials', () => {
  it('returns the pair when both are set', () => {
    expect(supabaseCredentials(CONFIGURED))
      .toEqual({ url: 'https://proj.supabase.co', key: 'anon-key' })
  })

  // A value pasted into the Vercel dashboard with a trailing newline is a real
  // way to get a URL that is present, wrong, and hard to see.
  it('trims surrounding whitespace off both values', () => {
    expect(supabaseCredentials({
      [SUPABASE_ENV_VARS.url]: '  https://proj.supabase.co\n',
      [SUPABASE_ENV_VARS.key]: ' anon-key ',
    })).toEqual({ url: 'https://proj.supabase.co', key: 'anon-key' })
  })

  it('returns null when either half is missing', () => {
    expect(supabaseCredentials({ [SUPABASE_ENV_VARS.url]: 'https://proj.supabase.co' })).toBeNull()
    expect(supabaseCredentials({ [SUPABASE_ENV_VARS.key]: 'anon-key' })).toBeNull()
  })
})

describe('supabaseConfigWarning', () => {
  it('says nothing when the client is configured', () => {
    expect(supabaseConfigWarning(CONFIGURED)).toBeNull()
  })

  // The whole point of the issue: "Supabase is not configured" sends you to
  // check both variables and the dashboard. Naming the one that is wrong is
  // the difference between a warning and a lead.
  it('names the missing variable, not just the feature', () => {
    const warning = supabaseConfigWarning({ ...CONFIGURED, [SUPABASE_ENV_VARS.key]: '' })
    expect(warning).toContain('VITE_SUPABASE_ANON_KEY')
    expect(warning).not.toContain('VITE_SUPABASE_URL')
  })

  it('names both when both are missing', () => {
    const warning = supabaseConfigWarning({})
    expect(warning).toContain('VITE_SUPABASE_URL')
    expect(warning).toContain('VITE_SUPABASE_ANON_KEY')
  })

  // Whoever reads this in a console is looking at a dashboard that appears
  // fine, so it has to say which feature is dead and that the rest is not.
  it('says what stopped working and where to fix it', () => {
    const warning = supabaseConfigWarning({})
    expect(warning).toMatch(/donations/i)
    expect(warning).toMatch(/supporter/i)
    expect(warning).toMatch(/vercel/i)
  })
})
