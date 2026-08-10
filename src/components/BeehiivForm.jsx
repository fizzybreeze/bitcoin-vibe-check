// The newsletter signup, ours rather than beehiiv's.
//
// Their loader injected a form rendered from their origin, which could follow
// neither the palette nor the theme toggle — a form served from somewhere else
// has no idea which theme this document is in. Everything here is a semantic
// token, so it paints in both themes and falls under `palette.test.js` and the
// e2e suite like every other element on the page. It also means the newsletter
// card is finally something the gates can see: `e2e/mocks.js` stubs their
// script to an empty body, correctly, so no test run and no visual baseline has
// ever contained the form production actually drew.
//
// What that costs, paid deliberately rather than discovered: `target="_blank"`
// means the subscription completes on beehiiv's own page, so there is no inline
// success state here, and whatever their form did for double opt-in, captcha
// and conversion analytics went with the loader.
export default function BeehiivForm({ onSubmit }) {
  return (
    <form
      method="POST"
      action="https://app.beehiiv.com/subscribe"
      target="_blank"
      // Modern browsers imply this for `target="_blank"`, older ones do not, and
      // the destination is cross-origin.
      rel="noopener"
      onSubmit={onSubmit}
      className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3"
    >
      <input type="hidden" name="publication_id" value="2f92f769-e2ce-4532-b1b6-ccd02017b0ec" />
      <input type="hidden" name="utm_source" value="bitcoin-vibe-check" />
      <input type="hidden" name="utm_medium" value="dashboard" />
      <input
        type="email"
        name="email"
        required
        aria-label="Email address"
        placeholder="your@email.com"
        className="w-full rounded-xl bg-raised border border-line px-4 py-2.5 text-base text-ink placeholder-quiet outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
      />
      <button
        type="submit"
        className="rounded-full bg-accent-fill px-5 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-fill-hover md:shrink-0"
      >
        Subscribe
      </button>
    </form>
  )
}
