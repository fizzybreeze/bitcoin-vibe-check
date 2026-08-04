## What changed

<!-- One or two sentences. What does this do, and why? -->

## Verification

CI runs lint, unit tests, build and Playwright automatically — no need to paste
their output. Confirm the parts CI cannot check:

- [ ] Opened the **Vercel preview URL on a phone** and the change looks right
      <!-- This is the check that replaces "run the dev server and look at it".
           Tick n/a for docs, CI or tooling changes. -->
- [ ] Behaviour changes have a test covering them
- [ ] No gate was silenced to get to green
      <!-- A targeted eslint-disable is fine when the rule is genuinely wrong
           there, but it must carry a comment saying why. -->

## Notes

<!-- Anything a reviewer on a small screen would otherwise miss: a judgement
     call you made, something deliberately left out, a follow-up needed, or a
     schema change (which must be a migration in supabase/migrations/). -->
