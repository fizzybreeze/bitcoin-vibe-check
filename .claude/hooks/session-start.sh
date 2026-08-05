#!/bin/bash
# SessionStart hook — prepares a fresh Claude Code on the web container so that
# lint, unit tests, build and e2e all work from the very first message.
#
# Without this, every remote session starts with no node_modules and no usable
# browser, so `npm run test:e2e` fails outright and Claude cannot verify its own
# work before pushing.
set -euo pipefail

# Local machines already have a working setup; only remote containers need this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm ci` rather than `npm install`, because install rewrites package-lock.json
# whenever the local npm differs from the one that generated it — silently
# dirtying the working tree on every session and leaking unrelated lockfile
# churn into whatever PR is open. `npm ci` never writes to the lockfile.
#
# The tradeoff is that `npm ci` deletes node_modules and reinstalls from
# scratch, which is wasteful on a resumed session where nothing changed. So it
# runs only when the lockfile has actually moved since the last install. The
# stamp lives in .git/ so it can never itself be committed.
STAMP=".git/.session-start-deps"

if [ ! -f package-lock.json ]; then
  # No lockfile means npm ci cannot run at all. Should not happen here, but a
  # hook that runs on every session must not hard-fail under `set -e`.
  echo "[session-start] no package-lock.json — falling back to npm install"
  npm install --no-audit --no-fund
else
  LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [ -d node_modules ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$LOCK_HASH" ]; then
    echo "[session-start] dependencies already match package-lock.json"
  else
    echo "[session-start] installing npm dependencies…"
    npm ci --no-audit --no-fund
    printf '%s' "$LOCK_HASH" > "$STAMP"
  fi
fi

# Playwright pins an exact chromium build. Some containers ship a different
# build and block cdn.playwright.dev, so the download cannot always succeed.
# Try it first, and fall back to whatever chromium the image already provides.
echo "[session-start] resolving Playwright chromium…"
if npx --no-install playwright install chromium >/dev/null 2>&1; then
  echo "[session-start] chromium: pinned build installed"
else
  # Look for any chromium shipped with the image, newest first.
  CHROME=""
  for root in "${PLAYWRIGHT_BROWSERS_PATH:-}" "$HOME/.cache/ms-playwright" /opt/pw-browsers; do
    [ -n "$root" ] && [ -d "$root" ] || continue
    CHROME=$(find "$root" -maxdepth 3 -type f \
      \( -path '*/chrome-linux/chrome' -o -path '*/chrome-linux64/chrome' \) \
      2>/dev/null | sort -V | tail -1)
    [ -n "$CHROME" ] && break
  done

  if [ -n "$CHROME" ] && [ -x "$CHROME" ]; then
    # playwright.config.js reads this and sets launchOptions.executablePath.
    # Unset in CI, where the pinned download works normally.
    echo "export PLAYWRIGHT_CHROMIUM_PATH=\"$CHROME\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
    export PLAYWRIGHT_CHROMIUM_PATH="$CHROME"
    echo "[session-start] chromium: pinned build unavailable, falling back to $CHROME"
  else
    echo "[session-start] chromium: UNAVAILABLE — 'npm run test:e2e' will not run in this session"
  fi
fi

echo "[session-start] ready"
