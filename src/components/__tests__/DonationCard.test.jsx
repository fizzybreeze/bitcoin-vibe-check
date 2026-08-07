// The donation card was the last thing in App.jsx that talked to a backend,
// and #22 named it and the supporter cards as a cluster to move together. It is
// also the only user input the app has, so its validation and its insert shape
// are worth pinning now that they can be imported at all.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Hoisted so the mock factory below can close over it, and reassigned per test.
const state = vi.hoisted(() => ({ client: null }))
vi.mock('../../lib/supabase.js', () => ({
  get supabase() { return state.client },
}))

const { default: DonationCard } = await import('../DonationCard.jsx')

/** A minimal stand-in for the query builder DonationCard reaches for. */
function stubSupabase(result = { error: null }) {
  const insert = vi.fn(() => Promise.resolve(result))
  state.client = { from: vi.fn(() => ({ insert })) }
  return { insert }
}

function submit(name) {
  fireEvent.change(screen.getByPlaceholderText(/Your name or handle/), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: /Submit my name/ }))
}

beforeEach(() => { state.client = null })
afterEach(cleanup)

describe('DonationCard', () => {
  it('rejects a name shorter than two characters without calling Supabase', async () => {
    const { insert } = stubSupabase()
    render(<DonationCard />)
    submit('a')
    expect(await screen.findByText(/at least 2 characters/)).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('counts the trimmed length, so whitespace is not a name', async () => {
    const { insert } = stubSupabase()
    render(<DonationCard />)
    submit('     ')
    expect(await screen.findByText(/at least 2 characters/)).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects a name over 50 characters', async () => {
    // `maxLength` on the input is a UI courtesy, not a guarantee — the value can
    // arrive by paste or autofill, and the column is the thing with the limit.
    const { insert } = stubSupabase()
    render(<DonationCard />)
    submit('x'.repeat(51))
    expect(await screen.findByText(/50 characters or less/)).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('inserts the trimmed name as unapproved', async () => {
    // `approved: false` is not cosmetic: the RLS policy on `donors` only permits
    // an anonymous insert with that value, so sending anything else is a 403 —
    // and names go live on the site without review if it ever became true.
    const { insert } = stubSupabase()
    render(<DonationCard />)
    submit('  Alice  ')
    await waitFor(() => expect(insert).toHaveBeenCalledWith({ name: 'Alice', approved: false }))
  })

  it('confirms success and clears the field', async () => {
    stubSupabase()
    render(<DonationCard />)
    submit('Alice')
    expect(await screen.findByText(/Thanks!/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Your name or handle/)).toHaveValue('')
  })

  it('reports a failed insert rather than claiming success', async () => {
    stubSupabase({ error: { message: 'permission denied' } })
    render(<DonationCard />)
    submit('Alice')
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('reports an error when Supabase is not configured at all', async () => {
    // `src/lib/supabase.js` returns null when its env vars are missing. The card
    // must say so rather than sit on "loading" forever — the failure v1.6.7 made
    // audible in the console needs to be visible here too.
    state.client = null
    render(<DonationCard />)
    submit('Alice')
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('clears a previous error as soon as the name is edited', async () => {
    stubSupabase({ error: { message: 'nope' } })
    render(<DonationCard />)
    submit('Alice')
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Your name or handle/), { target: { value: 'Alicia' } })
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument()
  })

  it('submits on Enter as well as on the button', async () => {
    const { insert } = stubSupabase()
    render(<DonationCard />)
    const input = screen.getByPlaceholderText(/Your name or handle/)
    fireEvent.change(input, { target: { value: 'Alice' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(insert).toHaveBeenCalled())
  })
})
