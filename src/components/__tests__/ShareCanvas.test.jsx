import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ShareCanvas from '../ShareCanvas.jsx'

// The exported image outlives the moment it was made and gets posted where
// nobody can check it against the live card, so an MVRV served from the daily
// snapshot has to carry the same caveat there as it does on screen.
function renderCycleCard(mvrv) {
  return render(
    <ShareCanvas
      selectedCards={['cycleIndicators']}
      sentimentSummary=""
      cardData={{ priceUsd: 100_000, ma200: 90_000, chainData: { mvrv } }}
      currency="usd"
      forwardedRef={null}
    />
  )
}

describe('ShareCanvas — Cycle Indicators', () => {
  it('labels an MVRV that came from the daily snapshot', () => {
    renderCycleCard({ value: 2.15, date: '2026-08-05', source: 'snapshot' })
    expect(screen.getByText(/2026-08-05.*daily snapshot/i)).toBeTruthy()
  })

  it('says nothing about snapshots when the MVRV is live', () => {
    renderCycleCard({ value: 2.15, date: '2026-08-05', source: 'live' })
    expect(screen.getByText('2.15')).toBeTruthy()
    expect(screen.queryByText(/snapshot/i)).toBeNull()
  })
})
