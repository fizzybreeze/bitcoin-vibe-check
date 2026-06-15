import { useState } from 'react'

export function useShareImage(ref) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function generateImage(forceDownload = false) {
    if (!ref.current) return
    setIsGenerating(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(ref.current, {
        backgroundColor: '#030712',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      const file = new File([blob], 'bitcoin-vibe-check.png', { type: 'image/png' })
      if (!forceDownload && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Bitcoin Vibe Check' })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bitcoin-vibe-check-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsGenerating(false)
    }
  }

  return { generateImage, isGenerating }
}
