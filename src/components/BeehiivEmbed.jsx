import { useEffect, useRef } from 'react'
import useTheme from '../hooks/useTheme.js'
import { BEEHIIV_LOADER_SRC, beehiivFormId } from './beehiivForms.js'

// beehiiv's own signup form, injected by their loader — one form per theme.
//
// **Read this before replacing it with markup of ours.** That has been tried
// and it broke the newsletter. v1.8.2 swapped this for `BeehiivForm.jsx`, a
// native `POST` to `https://app.beehiiv.com/subscribe`, which is beehiiv's
// *logged-in dashboard*: it answers a subscriber with a redirect to
// `/login?redirect=/subscribe`, so for the life of that release every signup
// asked the visitor to create a beehiiv account. The component had sat unused
// since PR #1, which is *why* it looked safe to adopt — nothing had ever
// exercised it, and it had never worked.
//
// **The real endpoint has since been captured, and it settles the question
// permanently.** The form posts to `subscribe-forms.beehiiv.com/api/submit`
// carrying an `authenticity_token` (Rails CSRF, minted for that iframe's own
// session), behind a PerimeterX token minted by their sensor script, behind
// Cloudflare bot management, with `origin` and `sec-fetch-site: same-origin`
// checked — every one of those from *their* origin, and all of them on
// third-party cookies our visitors' browsers increasingly refuse. Four
// independent walls, each fatal on its own, and they are anti-automation
// controls rather than accidents. Posting to it from our markup is not a thing
// that can be built. Do not spend another release finding that out.
//
// So the theme problem is solved the only way left: **two forms, styled in
// beehiiv's designer to each half of the palette**, with the id swapped here.
// See `beehiivForms.js` for what that does and does not buy.
//
// **How a change to this card is verified.** Every unit and e2e assertion here
// can see that the right form is *requested*; not one can see whether beehiiv
// accepts a submission or what the form looks like once it renders, and a smoke
// test that subscribed for real would add a junk subscriber every day. So a
// change to how this card submits is verified by subscribing once, by hand, on
// the preview, in both themes. There is no automated substitute, and assuming
// there was is how v1.8.2 shipped.
function FormLoader({ formId }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const script = document.createElement('script')
    script.src = BEEHIIV_LOADER_SRC
    script.async = true
    script.setAttribute('data-beehiiv-form', formId)
    container.appendChild(script)
    return () => {
      if (container.contains(script)) container.removeChild(script)
    }
  }, [formId])

  return <div ref={containerRef} />
}

export default function BeehiivEmbed() {
  const { theme } = useTheme()

  // **Keyed, and the key is the mechanism rather than a hint.** Their loader
  // inserts its iframe beside the script, inside the container, and that iframe
  // is not React's to remove because React never created it — so re-running the
  // effect in place would stack the new theme's form under the old one's. The
  // key throws the whole container away instead, injected iframe and all.
  //
  // A cleanup that cleared the container by hand was written first and deleted:
  // with the key in place nothing could tell it apart, in a test or in a
  // browser. Belt-and-braces that no gate can see is decoration, and this file
  // has a history of decoration being mistaken for evidence.
  return <FormLoader key={theme} formId={beehiivFormId(theme)} />
}
