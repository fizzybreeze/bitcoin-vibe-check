import { createClient } from '@supabase/supabase-js'
import { supabaseCredentials, supabaseConfigWarning } from './supabaseEnv.js'

// Soft-fail by design: without these two variables the dashboard still renders
// in full, and only donations and the supporter list go quiet. #20: soft must
// not mean *silent*. A mistyped variable in Vercel used to kill donations with
// no error, no warning and a green build — the same shape as every other bug
// that survived weeks here, minus even a visual cue.
//
// Module scope, so it warns exactly once per page load: this module is imported
// once and evaluated once, and a warning repeated on every render is one people
// filter out. Console only — a visitor should not be shown infrastructure
// warnings, so the other half of the signal is the smoke check in
// `smoke/production.spec.js`, which catches this within a day.
const warning = supabaseConfigWarning(import.meta.env)
if (warning) console.warn(warning)

const credentials = supabaseCredentials(import.meta.env)

export const supabase = credentials ? createClient(credentials.url, credentials.key) : null

// A second client, carrying the browser's push secret as a request header.
//
// It needs to be a separate instance because supabase-js takes headers at
// construction, not per call — and the header is the whole authorisation story
// for writing rules: the RLS policy on `push_subscriptions` hashes
// `x-push-secret` and matches it against the row, so a request without it
// matches nothing. Memoised on the secret, since the secret is per browser and
// constant for its lifetime; building a client per sync would be wasteful and
// would churn the connection pool.
let pushRulesClient = null
let pushRulesSecret = null

export function pushRulesClientFor(secret) {
  if (!credentials || typeof secret !== 'string' || !secret) return null
  if (pushRulesClient && pushRulesSecret === secret) return pushRulesClient
  pushRulesSecret = secret
  pushRulesClient = createClient(credentials.url, credentials.key, {
    global: { headers: { 'x-push-secret': secret } },
  })
  return pushRulesClient
}
