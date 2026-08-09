export default function BeehiivForm() {
  return (
    <form
      method="POST"
      action="https://app.beehiiv.com/subscribe"
      target="_blank"
      className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3"
    >
      <input type="hidden" name="publication_id" value="2f92f769-e2ce-4532-b1b6-ccd02017b0ec" />
      <input type="hidden" name="utm_source" value="bitcoin-vibe-check" />
      <input type="hidden" name="utm_medium" value="dashboard" />
      <input
        type="email"
        name="email"
        required
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
