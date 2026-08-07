import { useState, useEffect, useRef } from 'react'

const QUOTES = [
  { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "The root problem with conventional currency is all the trust that's required to make it work.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "It might make sense just to get some in case it catches on.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Writing a description for this thing for general audiences is bloody hard. There's nothing to relate it to.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "In a few decades when the reward gets too small, the transaction fee will become the main compensation for nodes.", attribution: 'Satoshi Nakamoto, Bitcoin Whitepaper' },
  { text: "The nature of Bitcoin is such that once version 0.1 was released, the core design was set in stone for the rest of its lifetime.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Governments are good at cutting off the heads of centrally controlled networks like Napster, but pure P2P networks like Gnutella and Tor seem to be holding their own.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
]

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
        <p className="text-sm italic text-white">"{quote.text}"</p>
        <p className="mt-2 text-xs text-orange-400">— {quote.attribution}</p>
        {showGenesis && (
          // `break-all` is load-bearing: this is one 64-character unbroken
          // string, and without it the whole dashboard scrolls sideways on a
          // phone. `responsive.spec.js` asserts the document never overflows.
          <a
            href="https://bitcoin.org/bitcoin.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block font-mono text-xs text-gray-600 hover:text-gray-400 transition-colors max-w-full px-4 break-all overflow-x-auto"
          >
            {GENESIS_HASH}
          </a>
        )}
      </div>
    </footer>
  )
}
