import { useState, useEffect, useRef } from 'react'
import BeehiivForm from './BeehiivForm.jsx'

// Dismissal is remembered here rather than in component state so it survives a
// reload. The e2e suite sets the same key to suppress the modal instead of
// racing its 5-second timer.
const PROMPTED_KEY = 'btc-vibe-newsletter-prompted'

export default function NewsletterModal() {
  const [show, setShow] = useState(false)
  const dismissTimer = useRef(null)

  useEffect(() => {
    if (localStorage.getItem(PROMPTED_KEY)) return
    const id = setTimeout(() => setShow(true), 5000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => () => clearTimeout(dismissTimer.current), [])

  function dismiss() {
    localStorage.setItem(PROMPTED_KEY, 'true')
    setShow(false)
  }

  // The modal used to close on a `beehiiv:subscribe` window event, which *their
  // loader* emitted; a native form emits nothing, so without this the modal
  // would sit open behind the new tab the subscription completes in.
  //
  // The deferral is a correctness rule, not a pause for effect. `dismiss`
  // unmounts the form, and a form removed from the document during its own
  // submit event does not navigate — measured in Chromium, both synchronously
  // and from a microtask, which is exactly when React flushes a state update
  // made in a discrete event handler. Dismissing inline would therefore swallow
  // the subscription silently: the modal would close and nothing would be sent.
  function dismissAfterSubmit() {
    dismissTimer.current = setTimeout(dismiss, 0)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 p-4">
      <div className="relative w-full max-w-[480px] rounded-2xl bg-surface border border-accent/30 p-6">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-4 right-4 text-sm text-quiet hover:text-ink-dim"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-ink">Satoshi's Weekly Brief</h2>
        <p className="mt-2 text-sm text-muted">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
        <div className="mt-4">
          <BeehiivForm onSubmit={dismissAfterSubmit} />
        </div>
        <button
          onClick={dismiss}
          className="mt-4 text-xs text-quiet underline hover:text-muted"
        >
          No thanks, I'll stick to the dashboard
        </button>
      </div>
    </div>
  )
}
