// Which environment variables the Supabase client needs, whether they are
// there, and what to say when they are not.
//
// Pure, and separate from `supabase.js`, on the `mvrvFallback.js` precedent:
// that module creates its client at module scope, so a test of the warning text
// would otherwise have to reason about import order and a real `createClient`
// call. The path this describes is invisible until someone mistypes a variable
// in Vercel, which is exactly the kind of code that needs to be exercisable
// without reproducing the outage.

export const SUPABASE_ENV_VARS = Object.freeze({
  url: 'VITE_SUPABASE_URL',
  key: 'VITE_SUPABASE_ANON_KEY',
})

// `.env.example` ships both of these declared and empty, so "declared but
// blank" is the shape a half-finished setup actually has — it counts as
// missing, not as present. (The `??`-versus-`||` trap recorded in v1.6.5 and
// v1.6.6 is the same mistake seen from the other side.)
const value = (env, name) => {
  const raw = env?.[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

/** The configured var names that are absent or blank, in declaration order. */
export function missingSupabaseEnv(env) {
  return Object.values(SUPABASE_ENV_VARS).filter((name) => value(env, name) === '')
}

/** Trimmed `{ url, key }`, or `null` when either is missing. */
export function supabaseCredentials(env) {
  if (missingSupabaseEnv(env).length > 0) return null
  return {
    url: value(env, SUPABASE_ENV_VARS.url),
    key: value(env, SUPABASE_ENV_VARS.key),
  }
}

/**
 * The console warning for an unconfigured client, or `null` when it is
 * configured. Names the specific variable, because "Supabase is not
 * configured" sends you to check both of them and the dashboard.
 */
export function supabaseConfigWarning(env) {
  const missing = missingSupabaseEnv(env)
  if (missing.length === 0) return null
  const [subject, verb, object] = missing.length === 1
    ? [missing[0], 'is', 'it']
    : [missing.join(' and '), 'are', 'them']
  return `[bitcoin-vibe-check] ${subject} ${verb} missing or empty, so Supabase is disabled: ` +
    'donations cannot be submitted and the supporter list will be empty. The rest of the ' +
    `dashboard is unaffected. Set ${object} in the Vercel project's environment variables ` +
    'and redeploy.'
}
