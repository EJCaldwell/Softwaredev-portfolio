/**
 * playwright.config.ts — configuration for browser-driven (end-to-end) tests.
 *
 * Owns: how `npm run test:e2e` and `npm run test:e2e:ui` build the site, serve it, and
 * drive real browsers against it. Unit and component tests are a different runner
 * entirely — see `vitest.config.mts`.
 *
 * Non-default choices and why:
 *
 *   - FILE SEPARATION from Vitest. Two runners in one repo will each try to execute the
 *     other's tests unless told not to, and the failure is confusing (Vitest importing
 *     `@playwright/test` blows up with a missing-browser error; Playwright importing a
 *     jsdom test blows up on `document`). The convention, enforced from both sides:
 *
 *         Vitest      →  *.test.ts / *.test.tsx, anywhere except `e2e/`
 *         Playwright  →  *.spec.ts, only inside `e2e/`
 *
 *     Here that is `testDir: "e2e"` plus `testMatch: **\/*.spec.ts`. The `testMatch` is
 *     not redundant with `testDir`: Playwright's default match includes `*.test.ts`, so
 *     without it a future `e2e/helpers.test.ts` would be run as a browser test. The
 *     mirror of this rule is `include`/`exclude` in `vitest.config.mts`. Change one side
 *     and you must change the other.
 *
 *   - `webServer`: Playwright starts the app itself, so a run needs no manually started
 *     server and CI needs no background-process orchestration. Specifics:
 *       * It runs `npm run build && npm run start`, i.e. the PRODUCTION server, not
 *         `next dev`. That matters more than convenience here: static
 *         prerendering, production CSS output, and the real 404 route all behave differently
 *         under dev's on-demand compilation, and dev-mode overlays and HMR sockets add
 *         flake. E2E should test what ships.
 *       * `reuseExistingServer: !process.env.CI` — locally, if something is already
 *         listening on the port, reuse it, which makes iterating on a spec fast. In CI
 *         always build fresh, so a run can never silently pass against a stale server.
 *       * `PORT` is passed explicitly because `next start` reads it from the environment;
 *         the URL and the server must be told the same number, hence the shared constant.
 *       * `timeout` is generous (120s) because the first CI run includes a cold
 *         `next build`, which is far slower than Playwright's 60s default allows.
 *
 *   - PORT 3311, deliberately non-default. Port 3000 is where `next dev` lives. If e2e
 *     used 3000 it would either collide with a running dev server or — much worse —
 *     `reuseExistingServer` would quietly point the whole suite at that dev server,
 *     testing unbuilt code and producing results that do not correspond to any commit.
 *
 *   - Projects: Chromium and WebKit. WebKit is not optional on this project: Safari is a
 *     large share of visitors and its layout/theme behaviour differs from Chromium's in
 *     ways this suite has caught before. Firefox is omitted for
 *     now: it adds runtime without covering a distinct risk this project has identified.
 *
 *   - `forbidOnly: !!process.env.CI` — a stray `test.only` cannot silently reduce CI to
 *     one test.
 *   - `retries: process.env.CI ? 2 : 0` — retries in CI absorb genuine infrastructure
 *     flake; zero locally so a flaky test is visible to the person who wrote it.
 *   - `workers: process.env.CI ? 1 : undefined` — serial in CI. Shared hosted runners
 *     are CPU-starved, and parallel browsers against one Next server is the usual source
 *     of timeout flake.
 *   - `trace: "on-first-retry"` and `screenshot`/`video` on failure — artifacts exist for
 *     exactly the runs that need debugging, without paying for them on green runs.
 *   - Reporter: `html` (never auto-opening, so CI does not hang waiting on a browser)
 *     plus `list` for readable console output. The HTML report directory is what the CI
 *     workflow uploads on failure.
 *
 * Failure modes: if the browser binaries are missing, every project fails immediately
 * with Playwright's "Executable doesn't exist" error — fix with `npx playwright install
 * chromium webkit`. If the port is occupied by a non-Next process, `webServer` fails its
 * health check and the run aborts before any test executes.
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * Port the e2e server binds to, shared by `baseURL` and the `webServer` command so the
 * two cannot disagree. Non-default on purpose — see PORT note in the header.
 */
const PORT = 3311;

/**
 * Origin every relative `page.goto("/")` in a spec resolves against.
 *
 * `E2E_BASE_URL` overrides it so the suite can run against a server this process did not
 * start — specifically, `npm run test:e2e:linux`, which drives browsers inside a Linux
 * container against a production server running on the host. When it is set, `webServer`
 * below is omitted: something else already owns the server, and letting Playwright start
 * a second one on the same port is the stale-server confusion this repo has hit four
 * times.
 */
const EXTERNAL_BASE_URL = process.env["E2E_BASE_URL"];
const BASE_URL = EXTERNAL_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // Not redundant with `testDir` — see FILE SEPARATION in the header.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Stand-in for Safari — see header.
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  // Omitted entirely when `E2E_BASE_URL` is set: the caller already owns a server, and
  // starting a second one on the same port is exactly the stale-build artifact that has
  // confused four agents here — a rebuild landing underneath a running server produces
  // CSS 404s and ~100 spurious failures that look like real defects.
  ...(EXTERNAL_BASE_URL
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run start -- --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { PORT: String(PORT) },
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }),
});
