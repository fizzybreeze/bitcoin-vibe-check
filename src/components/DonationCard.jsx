import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function DonationCard() {
  const [name, setName]           = useState('')
  const [validErr, setValidErr]   = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus]       = useState('idle') // idle | loading | success | error

  async function handleSubmit() {
    setSubmitted(true)
    const trimmed = name.trim()
    if (trimmed.length < 2)  { setValidErr('Name must be at least 2 characters.'); return }
    if (trimmed.length > 50) { setValidErr('Name must be 50 characters or less.'); return }
    setValidErr(null)
    setStatus('loading')
    if (!supabase) { setStatus('error'); return }
    const { error } = await supabase.from('donors').insert({ name: trimmed, approved: false })
    if (error) {
      setStatus('error')
    } else {
      setStatus('success')
      setName('')
      setSubmitted(false)
    }
  }

  function handleNameChange(e) {
    setName(e.target.value)
    if (validErr) setValidErr(null)
    if (status !== 'idle') setStatus('idle')
  }

  return (
    <div className="rounded-2xl bg-gray-900 p-6 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Support Bitcoin Vibe Check</p>
      <div className="mt-3 space-y-1">
        <p className="text-sm text-gray-450">
          1. Send any amount to Strike:{' '}
          <a
            href="https://strike.me/fizzybreeze"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300"
          >
            Open Strike to pay ⚡₿
          </a>
        </p>
        <p className="text-sm text-gray-450">2. Enter your name or handle below and click Submit.</p>
        <p className="text-sm text-gray-450">We'll add you to the list once we see your payment come through.</p>
      </div>
      <div className="mt-4">
        <input
          type="text"
          value={name}
          onChange={handleNameChange}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Your name or handle…"
          maxLength={50}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-base text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        {submitted && validErr && <p className="mt-2 text-xs text-red-400">{validErr}</p>}
      </div>
      <div className="mt-3">
        <button
          onClick={handleSubmit}
          disabled={status === 'loading'}
          className="rounded-full border border-orange-500 bg-transparent px-6 py-2 text-sm font-semibold text-orange-500 transition-colors hover:bg-orange-500 hover:text-white disabled:opacity-50"
        >
          Submit my name
        </button>
      </div>
      {status === 'success' && (
        <p className="mt-3 text-xs text-green-400">Thanks! You'll appear in the banner within 24 hours.</p>
      )}
      {status === 'error' && (
        <p className="mt-3 text-xs text-red-400">Something went wrong. Please try again.</p>
      )}
    </div>
  )
}
