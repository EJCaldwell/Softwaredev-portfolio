#!/usr/bin/env bash
#
# scripts/e2e-linux.sh — run the e2e suite against the SAME browser build CI uses.
#
# Owns: closing the one gap that local verification structurally cannot see. Everything
# else in this repo can be checked on this machine; the browser cannot. `npm run test:e2e`
# drives Playwright's macOS WebKit. CI drives Linux WebKitGTK. They are different engines
# with the same name, and three defects have now lived in the space between them:
#
#   1. Phantom request events (Phase 2.1) — Linux WebKit reports `play`-adjacent requests
#      with status 0, zero headers and zero bytes, that never reach the origin. A test
#      counting request events rather than real transfers passed on macOS and failed on CI.
#   2. The Node 20 / jsdom break (Phase 2.1) — different axis, same shape: the first Linux
#      run was the first time anyone learned.
#   3. Sticky-header layer promotion (Phase 3.1) — once the document scrolls, Linux
#      WebKitGTK promotes a `position: sticky` header to its own compositing layer, and a
#      screenshot then composites that layer against the base viewport instead of the page
#      canvas. A pixel sampler reading the top-left corner silently sampled the header.
#
# Each cost a ~10-minute CI round trip to discover and a second one to confirm the fix.
# This script makes that a local check.
#
# HOW IT WORKS. The app is built and served on the HOST, because the host has the
# node_modules and the build toolchain. The BROWSERS run in the official Playwright Linux
# image — the same image family CI's runner uses — and reach the host server through
# `host.docker.internal`. `E2E_BASE_URL` tells `playwright.config.ts` a server already
# exists, which suppresses its own `webServer` block; starting a second server on one port
# is the stale-build artifact that has confused four agents in this project.
#
# WHAT IT DOES NOT COVER. Neither Playwright build IS Safari. This closes the
# macOS-vs-Linux gap, not the Playwright-vs-real-Safari one, which stays a human check
# on a real Safari.
#
# Usage:
#   npm run test:e2e:linux                     # whole suite, both engines
#   npm run test:e2e:linux -- --project=webkit # the engine that actually differs
#   npm run test:e2e:linux -- e2e/landing.spec.ts -g "cold cache"
#
# Requires Docker. If Docker is not running the script says so and exits non-zero rather
# than falling back to the local browsers, because a silent fallback would defeat the
# entire purpose — you would believe you had checked Linux when you had not.

set -euo pipefail

PORT="${E2E_LINUX_PORT:-3312}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pinned to the Playwright version in package.json. A mismatch between the client library
# and the browser build fails in confusing ways, so this is derived rather than hardcoded.
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version" 2>/dev/null || true)"
if [[ -z "$PW_VERSION" ]]; then
  echo "error: could not read the installed @playwright/test version. Run npm ci first." >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker is not running." >&2
  echo "       This script exists to run the CI browser build; there is no useful" >&2
  echo "       fallback, because the local browsers are the ones it is checking against." >&2
  exit 1
fi

cleanup() {
  local status=$?
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # Belt and braces: a server surviving this script is the exact condition that produces
  # the stale-build failures this repo keeps rediscovering.
  local stragglers
  stragglers="$(lsof -ti ":$PORT" 2>/dev/null || true)"
  if [[ -n "$stragglers" ]]; then
    echo "$stragglers" | xargs kill 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

echo "==> Building (host)"
npm run build

echo "==> Serving on host :$PORT"
npx next start --port "$PORT" >/tmp/e2e-linux-server.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "error: server exited during startup. Log:" >&2
    tail -20 /tmp/e2e-linux-server.log >&2
    exit 1
  fi
  sleep 1
done

echo "==> Running Playwright in $IMAGE"
# `--ipc=host` because Chromium's default 64MB /dev/shm in a container causes unrelated
# crashes that look like test failures. `--add-host` makes host.docker.internal resolve on
# Linux hosts as it already does on macOS, so this works in both places.
docker run --rm \
  --ipc=host \
  --add-host=host.docker.internal:host-gateway \
  -v "$REPO_ROOT":/work \
  -w /work \
  -e "E2E_BASE_URL=http://host.docker.internal:$PORT" \
  -e CI=1 \
  "$IMAGE" \
  npx playwright test "$@"
