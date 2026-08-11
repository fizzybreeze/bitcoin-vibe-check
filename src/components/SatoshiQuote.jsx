import { useState, useEffect, useRef } from 'react'
// Shared with the weekly brief, which signs off with one of these. Two copies
// of the list would be two Satoshis.
import { SATOSHI_QUOTES as QUOTES } from '../lib/quotes.js'

const GENESIS_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'

export default function SatoshiQuote() {
  const timeoutRef        = useRef(null)
  const genesisTimeoutRef = useRef(null)
  const incrementRef      = useRef(0)
  const [index, setIndex]             = useState(() => Math.floor(Math.random() * QUOTES.length))
  const [visible, setVisible]         = useState(true)
  const [showGenesis, setShowGenesis] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      timeoutRef.current = setTimeout(() => {
        incrementRef.current += 1
        setIndex(i => (i + 1) % QUOTES.length)
        setVisible(true)
        if (incrementRef.current % QUOTES.length === 0) {
          setShowGenesis(true)
          genesisTimeoutRef.current = setTimeout(() => setShowGenesis(false), 12000)
        }
      }, 500)
    }, 12000)
    return () => {
      clearInterval(id)
      clearTimeout(timeoutRef.current)
      clearTimeout(genesisTimeoutRef.current)
    }
  }, [])

  const quote = QUOTES[index]
  return (
    <footer className="py-10 text-center">
      <div className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-sm italic text-ink">"{quote.text}"</p>
        <p className="mt-2 text-xs text-accent">— {quote.attribution}</p>
        {showGenesis && (
          // `break-all` is load-bearing: this is one 64-character unbroken
          // string, and without it the whole dashboard scrolls sideways on a
          // phone. `responsive.spec.js` asserts the document never overflows.
          <a
            href="https://bitcoin.org/bitcoin.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block font-mono text-xs text-quiet hover:text-muted transition-colors max-w-full px-4 break-all overflow-x-auto"
          >
            {GENESIS_HASH}
          </a>
        )}
      </div>
    </footer>
  )
}
