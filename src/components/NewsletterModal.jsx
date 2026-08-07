import { useState, useEffect } from 'react'
import BeehiivEmbed from './BeehiivEmbed.jsx'

// Dismissal is remembered here rather than in component state so it survives a
// reload. The e2e suite sets the same key to suppress the modal instead of
// racing its 5-second timer.
const PROMPTED_KEY = 'btc-vibe-newsletter-prompted'

export default function NewsletterModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(PROMPTED_KEY)) return
    const id = setTimeout(() => setShow(true), 5000)
    return () => clearTimeout(id)
  }, [])

  function dismiss() {
    localStorage.setItem(PROMPTED_KEY, 'true')
    setShow(false)
  }

  useEffect(() => {
    let timerId
    function handleSubscribe() {
      timerId = setTimeout(dismiss, 2500)
    }
    window.addEventListener('beehiiv:subscribe', handleSubscribe)
    return () => {
      window.removeEventListener('beehiiv:subscribe', handleSubscribe)
      clearTimeout(timerId)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-[480px] rounded-2xl bg-gray-900 border border-orange-500/30 p-6">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-4 right-4 text-sm text-gray-500 hover:text-gray-300"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-white">Satoshi's Weekly Brief</h2>
        <p className="mt-2 text-sm text-gray-400">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
        <div className="mt-4">
          <BeehiivEmbed />
        </div>
        <button
          onClick={dismiss}
          className="mt-4 text-xs text-gray-500 underline hover:text-gray-400"
        >
          No thanks, I'll stick to the dashboard
        </button>
      </div>
    </div>
  )
}
