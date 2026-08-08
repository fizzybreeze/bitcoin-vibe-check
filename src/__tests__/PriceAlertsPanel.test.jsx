import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import PriceAlertsPanel from '../components/PriceAlertsPanel.jsx'
import { ALERT_METRICS, ALERT_METRIC_IDS, createAlertRule } from '../lib/alertRules.js'

const baseProps = {
  alerts: [],
  currency: 'usd',
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onClearTriggered: vi.fn(),
  notificationPermission: 'granted',
  onRequestPermission: vi.fn(),
  onClose: vi.fn(),
}

// Built by the real rule factory rather than hand-written, so this suite is
// actually coupled to the rule shape the hook produces. A literal fixture would
// keep passing after a rule-shape change that broke every row in the panel —
// which is the opposite of what an untouched display test is supposed to prove.
function makeAlert(overrides = {}) {
  return {
    ...createAlertRule(80000, { metrics: { currency: 'usd', price: 50000 }, id: 'alert-1' }),
    ...overrides,
  }
}

describe('PriceAlertsPanel', () => {
  it('shows "No alerts set" when alerts array is empty', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByText(/no alerts set/i)).toBeInTheDocument()
  })

  it('renders one row per alert', () => {
    const alerts = [
      makeAlert({ id: 'a1', label: '$80,000' }),
      makeAlert({ id: 'a2', label: '$60,000', direction: 'below' }),
    ]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('$80,000')).toBeInTheDocument()
    expect(screen.getByText('$60,000')).toBeInTheDocument()
  })

  it('shows "✓ Triggered" label for alerts where triggered is true', () => {
    const alerts = [makeAlert({ triggered: true })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('✓ Triggered')).toBeInTheDocument()
  })

  it('does not show "✓ Triggered" label for non-triggered alerts', () => {
    const alerts = [makeAlert({ triggered: false })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.queryByText('✓ Triggered')).not.toBeInTheDocument()
  })

  it('shows notification blocked warning when permission is "denied"', () => {
    render(<PriceAlertsPanel {...baseProps} notificationPermission="denied" />)
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument()
  })

  it('does not show notification blocked warning when permission is "granted"', () => {
    render(<PriceAlertsPanel {...baseProps} notificationPermission="granted" />)
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument()
  })

  it('shows the ≈ symbol (up arrow) for "above" direction alerts', () => {
    const alerts = [makeAlert({ direction: 'above' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('↑')).toBeInTheDocument()
  })

  it('shows a down arrow for "below" direction alerts', () => {
    const alerts = [makeAlert({ direction: 'below' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('↓')).toBeInTheDocument()
  })

  it('shows "Clear triggered" button only when there are triggered alerts', () => {
    const { rerender } = render(
      <PriceAlertsPanel {...baseProps} alerts={[makeAlert({ triggered: false })]} />
    )
    expect(screen.queryByText(/clear triggered/i)).not.toBeInTheDocument()

    rerender(
      <PriceAlertsPanel {...baseProps} alerts={[makeAlert({ triggered: true })]} />
    )
    expect(screen.getByText(/clear triggered/i)).toBeInTheDocument()
  })

  it('calls onRemove with the correct id when remove button is clicked', () => {
    const onRemove = vi.fn()
    const alerts = [makeAlert({ id: 'target-id' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText(/remove alert for/i))
    expect(onRemove).toHaveBeenCalledWith('target-id')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<PriceAlertsPanel {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/close alerts/i))
    expect(onClose).toHaveBeenCalled()
  })

  // Not merely accurate — explicit. §4.1 is what makes these push notifications
  // and until then the copy must not let anyone assume they already are.
  it('says outright that these are not push notifications', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByText(/only fire while this tab is open/i)).toBeInTheDocument()
    expect(screen.getByText(/not push notifications/i)).toBeInTheDocument()
  })

  it('shows the currency code beside the input for the price metric', () => {
    render(<PriceAlertsPanel {...baseProps} currency="gbp" />)
    expect(screen.getByText('GBP')).toBeInTheDocument()
  })
})

// ─── §3.4b: the metric picker ────────────────────────────────────────────────

describe('PriceAlertsPanel metric picker', () => {
  function pick(name) {
    fireEvent.click(screen.getByRole('button', { name }))
  }

  it('offers every metric in the registry', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    for (const id of ALERT_METRIC_IDS) {
      expect(screen.getByRole('button', { name: ALERT_METRICS[id].shortName })).toBeInTheDocument()
    }
  })

  it('starts on price, and marks exactly one metric as chosen', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Price' })).toHaveAttribute('aria-pressed', 'true')
    const pressed = ALERT_METRIC_IDS.filter(
      id => screen.getByRole('button', { name: ALERT_METRICS[id].shortName }).getAttribute('aria-pressed') === 'true'
    )
    expect(pressed).toEqual(['price'])
  })

  it('swaps the input copy and the unit slot to the chosen metric', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByPlaceholderText('Target price')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()

    pick('Fees')
    expect(screen.getByPlaceholderText('Fee level')).toBeInTheDocument()
    expect(screen.getByText('sat/vB')).toBeInTheDocument()
    expect(screen.queryByText('USD')).not.toBeInTheDocument()
    expect(screen.getByText(/e\.g\. 5 sat\/vB/)).toBeInTheDocument()
  })

  it('adds the alert against the chosen metric, not against price', () => {
    const onAdd = vi.fn()
    render(<PriceAlertsPanel {...baseProps} onAdd={onAdd} />)
    pick('Fees')
    fireEvent.change(screen.getByPlaceholderText('Fee level'), { target: { value: '5' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    expect(onAdd).toHaveBeenCalledWith(5, 'fee')
  })

  // The panel used to validate with its own hard-coded `> 0`. Reusing the
  // registry's predicate is what lets 0 through here and stops 101.
  it('accepts a Fear & Greed level of 0 and refuses one above 100', () => {
    const onAdd = vi.fn()
    render(<PriceAlertsPanel {...baseProps} onAdd={onAdd} />)
    pick('Fear & Greed')

    fireEvent.change(screen.getByPlaceholderText('Index level'), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    expect(onAdd).toHaveBeenCalledWith(0, 'fng')

    fireEvent.change(screen.getByPlaceholderText('Index level'), { target: { value: '101' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/between 0 and 100/i)).toBeInTheDocument()
  })

  // The regression this suite exists to pin. `handleSubmit` used to await
  // `onRequestPermission()` before `onAdd`, and Chromium leaves a concurrent
  // `Notification.requestPermission()` unsettled — so a Set pressed while an
  // earlier prompt was still open awaited a promise that never arrived and the
  // alert was lost for good. A permission request that never resolves must not
  // be able to swallow an alert.
  it('stores every alert even when the permission prompt never resolves', () => {
    const onAdd = vi.fn()
    const onRequestPermission = vi.fn(() => new Promise(() => {}))
    render(
      <PriceAlertsPanel
        {...baseProps}
        notificationPermission="default"
        onAdd={onAdd}
        onRequestPermission={onRequestPermission}
      />
    )
    for (const v of ['120000', '130000', '140000']) {
      fireEvent.change(screen.getByPlaceholderText('Target price'), { target: { value: v } })
      fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    }
    expect(onAdd).toHaveBeenCalledTimes(3)
    expect(onAdd.mock.calls.map(c => c[0])).toEqual([120000, 130000, 140000])
  })

  it('still asks for permission, just not before storing the alert', () => {
    const calls = []
    const onAdd = vi.fn(() => calls.push('add'))
    const onRequestPermission = vi.fn(() => { calls.push('ask'); return new Promise(() => {}) })
    render(
      <PriceAlertsPanel
        {...baseProps}
        notificationPermission="default"
        onAdd={onAdd}
        onRequestPermission={onRequestPermission}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Target price'), { target: { value: '120000' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    expect(calls).toEqual(['add', 'ask'])
  })

  it('does not ask again once permission is already granted', () => {
    const onRequestPermission = vi.fn()
    render(
      <PriceAlertsPanel
        {...baseProps}
        notificationPermission="granted"
        onRequestPermission={onRequestPermission}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Target price'), { target: { value: '120000' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Set' }))
    expect(onRequestPermission).not.toHaveBeenCalled()
  })

  it('clears a half-typed value when the metric changes', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    fireEvent.change(screen.getByPlaceholderText('Target price'), { target: { value: '80000' } })
    pick('Fees')
    expect(screen.getByPlaceholderText('Fee level')).toHaveValue(null)
  })

  it('names the metric on every row, so 20 is not ambiguous beside $80,000', () => {
    const alerts = [
      makeAlert({ id: 'a1' }),
      { ...createAlertRule(20, { metric: 'fng', metrics: { fng: 45 }, id: 'a2' }) },
    ]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(/Price\s*\$80,000/)
    expect(rows[1]).toHaveTextContent(/Fear & Greed\s*20/)
    expect(screen.getByLabelText('Remove alert for Fear & Greed 20')).toBeInTheDocument()
  })

  it('tints the arrow for a price rule and leaves a fee rule neutral', () => {
    const priceRow = render(<PriceAlertsPanel {...baseProps} alerts={[makeAlert({ direction: 'below' })]} />)
    expect(screen.getByText('↓')).toHaveClass('text-red-400')
    priceRow.unmount()

    render(
      <PriceAlertsPanel
        {...baseProps}
        alerts={[createAlertRule(5, { metric: 'fee', metrics: { fee: 12 }, id: 'f1' })]}
      />
    )
    expect(screen.getByText('↓')).not.toHaveClass('text-red-400')
  })
})

// ─── Push toggle (roadmap §4.1a) ─────────────────────────────────────────────

describe('PriceAlertsPanel push toggle', () => {
  const toggle = () => screen.queryByRole('button', { name: /push to this device/i })

  it('offers the toggle when push is available and off', () => {
    render(<PriceAlertsPanel {...baseProps} pushStatus="off" />)
    expect(toggle()).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the toggle as on once subscribed', () => {
    render(<PriceAlertsPanel {...baseProps} pushStatus="on" />)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('subscribes on tap when off, and unsubscribes when on', () => {
    const onEnablePush = vi.fn()
    const onDisablePush = vi.fn()

    const { unmount } = render(
      <PriceAlertsPanel {...baseProps} pushStatus="off" onEnablePush={onEnablePush} onDisablePush={onDisablePush} />
    )
    fireEvent.click(toggle())
    expect(onEnablePush).toHaveBeenCalledTimes(1)
    expect(onDisablePush).not.toHaveBeenCalled()
    unmount()

    render(
      <PriceAlertsPanel {...baseProps} pushStatus="on" onEnablePush={onEnablePush} onDisablePush={onDisablePush} />
    )
    fireEvent.click(toggle())
    expect(onDisablePush).toHaveBeenCalledTimes(1)
    expect(onEnablePush).toHaveBeenCalledTimes(1)
  })

  it('does not blame the browser for a worker that failed to register', () => {
    // `unsupported` is also what a failed service-worker registration looks
    // like, which is not the browser's fault and not something the visitor can
    // act on by switching browsers.
    render(<PriceAlertsPanel {...baseProps} pushStatus="unsupported" />)
    expect(screen.queryByText(/does not support/i)).not.toBeInTheDocument()
  })

  it('does not offer a toggle that cannot work', () => {
    // A control that reports success and stores nothing is worse than no
    // control. Each of these states has a sentence instead.
    for (const status of ['unsupported', 'unconfigured', 'blocked', 'loading']) {
      const { unmount } = render(<PriceAlertsPanel {...baseProps} pushStatus={status} />)
      expect(toggle()).not.toBeInTheDocument()
      unmount()
    }
  })

  it('never claims a closed tab is covered when it is not', () => {
    // The single most misleading thing this panel could say. Every state that
    // is not PUSH_ON has to keep the old caveat.
    // Every state but "on" says it, in the same words, including the two that
    // mean "we could not find out" — loading and a worker that never
    // registered. A caveat that is only usually present is not a caveat.
    for (const status of ['off', 'unsupported', 'unconfigured', 'blocked', 'loading']) {
      const { unmount } = render(<PriceAlertsPanel {...baseProps} pushStatus={status} />)
      expect(screen.getByText(/only fire while this tab is open/i)).toBeInTheDocument()
      expect(screen.queryByText(/even with the tab closed/i)).not.toBeInTheDocument()
      unmount()
    }

    render(<PriceAlertsPanel {...baseProps} pushStatus="on" />)
    expect(screen.getByText(/even with the tab closed/i)).toBeInTheDocument()
    expect(screen.queryByText(/only fire while this tab is open/i)).not.toBeInTheDocument()
  })

  it('falls back to the tab-only caveat when no push status is given at all', () => {
    // App forgetting to pass the prop must not read as "you are covered".
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByText(/only fire while this tab is open/i)).toBeInTheDocument()
    expect(toggle()).not.toBeInTheDocument()
  })

  it('disables the toggle while a subscribe is in flight', () => {
    render(<PriceAlertsPanel {...baseProps} pushStatus="off" pushBusy />)
    expect(toggle()).toBeDisabled()
  })
})
