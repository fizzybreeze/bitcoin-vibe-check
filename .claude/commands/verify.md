---
description: Run every gate (lint, unit tests, build, e2e) and report only what failed
---

Run the project's full verification suite and report the result concisely.

Run all four, in this order, and **do not stop at the first failure** — the point
is one complete picture, not a fast exit:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm run test:e2e`

Then report:

- If everything passed: one line per gate with its headline number
  (e.g. "lint clean · 115 tests · build 0.6s · 17 e2e"). Nothing more.
- If anything failed: name the failing gate, quote the **actual error output**,
  and state the specific file and line. Do not paste passing output.

Two notes specific to this repo:

- If `npm run test:e2e` fails with a missing or mismatched browser, the
  SessionStart hook did not resolve one. Say so explicitly rather than
  reporting it as a test failure — it is an environment problem, not a
  regression.
- The Recharts "width(-1) and height(-1)" warnings during e2e are expected
  noise from off-screen rendering. Ignore them.

$ARGUMENTS
