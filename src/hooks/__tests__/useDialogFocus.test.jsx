import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef, useState } from 'react'
import useDialogFocus, { focusableWithin } from '../useDialogFocus.js'

// The keyboard contract three dialogs now share.
//
// Exercised through a harness rather than through the real components on
// purpose: what is being asserted is the *hook's* rules, and running them
// against a fixture whose focusables are visible in the test file is what makes
// a wrapping assertion readable. The three call sites are covered where they
// live — `PriceAlertsPanel.test.jsx` and `ShareModal.test.jsx` — and the one
// thing no jsdom test can see, whether the browser's own Tab actually lands
// where the trap says, is in `e2e/accessibility.spec.js`.

function Dialog({ onClose, trap, open = true, extra = null }) {
  const ref = useRef(null)
  useDialogFocus(ref, { onClose, trap, active: open })
  if (!open) return null
  return (
    <div ref={ref} role="dialog">
      <button>close</button>
      <input aria-label="threshold" />
      <button disabled>disabled action</button>
      <button>last</button>
      {extra}
    </div>
  )
}

function Harness({ trap = false, onClose = () => {}, extra = null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <button>elsewhere</button>
      <Dialog
        open={open}
        trap={trap}
        extra={extra}
        onClose={() => { onClose(); setOpen(false) }}
      />
    </>
  )
}

const tab = (opts = {}) => fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab', ...opts })

describe('focusableWithin', () => {
  it('lists focusable descendants in document order and skips disabled ones', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <input id="c" />
      <div id="d" tabindex="-1"></div>
      <a id="e" href="#x">e</a>
    `
    expect(focusableWithin(root).map(el => el.id)).toEqual(['a', 'c', 'e'])
  })

  it('counts an iframe, because that is how the newsletter form arrives', () => {
    // beehiiv's loader injects the signup as an iframe. It is not itself
    // tabbable, but tabbing into it is the only way to reach the email field —
    // so a trap that did not treat it as a stop would make the modal's one
    // useful control unreachable.
    const root = document.createElement('div')
    root.innerHTML = '<button>x</button><iframe title="signup"></iframe>'
    expect(focusableWithin(root)).toHaveLength(2)
  })

  it('ignores a subtree the accessibility tree has been told to ignore', () => {
    const root = document.createElement('div')
    root.innerHTML = '<button id="real">x</button><div aria-hidden="true"><button id="ghost">y</button></div>'
    expect(focusableWithin(root).map(el => el.id)).toEqual(['real'])
  })

  it('answers an absent root with nothing rather than throwing', () => {
    expect(focusableWithin(null)).toEqual([])
  })
})

describe('useDialogFocus', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    expect(document.activeElement).toBe(screen.getByText('close'))
  })

  it('returns focus to whatever opened it', () => {
    render(<Harness />)
    const trigger = screen.getByText('open')
    // Focused explicitly because jsdom's `click` does not focus its target the
    // way a browser does — and a keyboard visitor, who is the one this is for,
    // has the trigger focused before they press it either way.
    act(() => trigger.focus())
    fireEvent.click(trigger)
    expect(document.activeElement).not.toBe(trigger)
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape from anywhere, including focus that drifted out', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByText('open'))
    // Escape is listened for on the document rather than on the dialog, so a
    // press while focus sits in an injected iframe or on the body still closes.
    act(() => { document.body.focus() })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('holds Tab inside a modal, wrapping past the disabled control', () => {
    render(<Harness trap />)
    fireEvent.click(screen.getByText('open'))
    const first = screen.getByText('close')
    const last = screen.getByText('last')

    act(() => last.focus())
    tab()
    expect(document.activeElement).toBe(first)

    tab({ shiftKey: true })
    // Not the disabled button that sits between them in the DOM.
    expect(document.activeElement).toBe(last)
  })

  it('pulls focus back when Tab is pressed from outside the modal', () => {
    render(<Harness trap />)
    fireEvent.click(screen.getByText('open'))
    act(() => screen.getByText('elsewhere').focus())
    tab()
    expect(document.activeElement).toBe(screen.getByText('close'))
  })

  it('does not trap a non-modal popover', () => {
    // The alerts panel has no scrim and the dashboard behind it stays usable,
    // so Tab has to be able to leave. `preventDefault` is what a trap does, and
    // jsdom does not move focus on Tab by itself — so the honest assertion is
    // that the event was left alone.
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    act(() => screen.getByText('last').focus())
    const handled = !fireEvent.keyDown(document.activeElement, { key: 'Tab' })
    expect(handled).toBe(false)
    expect(document.activeElement).toBe(screen.getByText('last'))
  })

  it('does nothing at all while the dialog is closed', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('survives a trigger that was removed while the dialog was open', () => {
    // Focusing a detached element focuses nothing at all, so the restore is
    // guarded rather than unconditional.
    function Vanishing() {
      const ref = useRef(null)
      const [open, setOpen] = useState(true)
      useDialogFocus(ref, { onClose: () => setOpen(false), active: open })
      return open ? <div ref={ref}><button>close</button></div> : <button>after</button>
    }
    const stray = document.createElement('button')
    document.body.appendChild(stray)
    stray.focus()
    render(<Vanishing />)
    stray.remove()
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
  })
})
