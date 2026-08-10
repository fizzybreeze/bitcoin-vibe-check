import { useEffect, useRef } from 'react'

/**
 * The keyboard half of a dialog: Escape closes it, focus moves into it when it
 * opens, focus returns to whatever opened it when it closes, and — for a modal
 * — Tab cannot walk out of it.
 *
 * All three dialogs in this app were missing every one of those. They could be
 * *opened* from the keyboard, because the trigger is a real `<button>`, and
 * then focus stayed behind on the trigger with a panel on screen that the
 * visitor had no way to reach, no way to dismiss, and — for the newsletter
 * modal, which appears on its own after five seconds — no way to know about.
 *
 * The hook is one module rather than three copies because the alerts panel, the
 * share modal and the newsletter modal differ in exactly one respect (`trap`)
 * and agreeing about the other three by hand is how they would drift.
 */

/**
 * What a keyboard can land on.
 *
 * Two entries here are load-bearing rather than boilerplate. `:not([disabled])`
 * matters because the share modal disables both of its action buttons while no
 * cards are selected, and a trap that wrapped onto a disabled control would
 * strand the visitor on an element that cannot take focus. And `iframe` is in
 * the list because beehiiv's loader injects the signup form as one: an iframe
 * is not itself tabbable, but tabbing *into* it is how the visitor reaches the
 * email field, so a trap that did not treat it as a stop would make the
 * newsletter modal's only useful control unreachable — a worse bug than the one
 * this fixes.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Every focusable descendant of `root`, in document order.
 *
 * Deliberately no visibility filter: `offsetParent` and `getClientRects` both
 * report nothing under jsdom, so a filter written against them would be a
 * no-op in every unit test and a real one in the browser — the two halves of
 * the suite testing different code. Nothing in these three dialogs is hidden
 * while mounted, and the one off-screen subtree that exists (`ShareCanvas`,
 * parked at `left: -9999px` for html2canvas) contains no focusable element at
 * all.
 */
export function focusableWithin(root) {
  if (!root) return []
  return [...root.querySelectorAll(FOCUSABLE)]
    .filter(el => !el.closest('[aria-hidden="true"], [inert]'))
}

/**
 * @param {{current: HTMLElement|null}} ref  the dialog's outermost element
 * @param {object}   options
 * @param {Function} options.onClose  called on Escape
 * @param {boolean}  options.trap     hold Tab inside — true for a modal only
 * @param {boolean}  options.active   false while the dialog is not on screen
 */
export default function useDialogFocus(ref, { onClose, trap = false, active = true } = {}) {
  // Held in a ref so a re-render with a new inline `onClose` — which is how all
  // three call sites pass it — does not tear the listener down and rebuild it,
  // and with it re-run the focus-in and focus-restore either side.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!active) return
    const root = ref.current

    // Whatever had focus at the moment this opened. In every case the app
    // actually has that is the header button that opened it; for the newsletter
    // modal, which nothing opened, it is the body and restoring to it is a
    // no-op. Read here rather than on close because by then it is this dialog.
    const returnTo = document.activeElement

    // The first focusable is the close control in all three, which is the one
    // element guaranteed to be useful: it means a visitor who did not want this
    // dialog can dismiss it with a single press, without hunting.
    focusableWithin(root)[0]?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !trap) return

      const items = focusableWithin(ref.current)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      // Focus outside the dialog entirely — a click on the page behind, or a
      // control that unmounted while focused — is pulled back rather than
      // allowed to continue tabbing through the document under the scrim.
      if (!ref.current?.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    // On the document rather than the dialog, so Escape still closes it when
    // focus has drifted — into an injected iframe, or onto the body after a
    // click on the scrim.
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Only if it is still in the document: a trigger that was itself removed
      // while the dialog was open would otherwise be focused off-screen, and
      // the browser answers that by focusing nothing at all.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus()
    }
  }, [ref, active, trap])
}
