import { useEffect, useRef } from 'react'

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
