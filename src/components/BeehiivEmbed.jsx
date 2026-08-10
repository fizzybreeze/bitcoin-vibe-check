import { useEffect, useRef } from 'react'

// beehiiv's own signup form, injected by their loader.
//
// This is off-brand and always will be: the form is rendered from their origin,
// so it follows neither the palette nor the theme toggle. Roadmap §3.5 is about
// fixing that, and **the obvious fix has already been tried and reverted** —
// read that entry before touching this file.
//
// v1.8.2 replaced this with `BeehiivForm.jsx`, a native `POST` to
// `https://app.beehiiv.com/subscribe`. That is beehiiv's *logged-in dashboard*:
// it answers a subscriber with a redirect to `/login?redirect=/subscribe`, so
// for the life of that release every signup asked the visitor to create a
// beehiiv account. The component had sat unused in the repo since PR #1, which
// is *why* it looked safe to adopt — nothing had ever exercised it, and it had
// never worked.
//
// The lesson worth keeping is about which gate applies. Every unit and e2e
// assertion here can see that a form is *shaped* right; not one of them can see
// whether the endpoint accepts it, and a smoke test that submitted for real
// would add a junk subscriber every day. So a change to how this card submits
// is verified by subscribing once, by hand, on the preview. There is no
// automated substitute, and assuming there was is how this shipped.
export default function BeehiivEmbed() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const script = document.createElement('script')
    script.src = 'https://subscribe-forms.beehiiv.com/v3/loader.js'
    script.async = true
    script.setAttribute('data-beehiiv-form', '2f92f769-e2ce-4532-b1b6-ccd02017b0ec')
    container.appendChild(script)
    return () => {
      if (container.contains(script)) container.removeChild(script)
    }
  }, [])

  return <div ref={containerRef} />
}
