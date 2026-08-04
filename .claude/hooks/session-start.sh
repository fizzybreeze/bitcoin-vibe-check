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

echo "[session-start] installing npm dependencies…"
npm install --no-audit --no-fund

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
