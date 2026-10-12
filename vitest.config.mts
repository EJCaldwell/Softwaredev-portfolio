/**
 * vitest.config.mts — Vitest configuration for unit and component tests.
 *
 * Owns: how `npm run test` and `npm run test:watch` discover, transform, and run
 * non-browser tests. Playwright's browser-driven tests are configured separately in
 * `playwright.config.ts`; the two runners share this repo and must never try to execute
 * each other's files (see FILE SEPARATION below).
 *
 * Why `.mts` rather than `.ts`: this repo has no `"type": "module"` in package.json, so a
 * plain `vitest.config.ts` would be read as CommonJS by Node while its contents are ESM.
 * The `.mts` extension forces ESM unambiguously. `tsconfig.json` already includes
 * `**\/*.mts`, so this file is type-checked by `npm run typecheck` like everything else.
 *
 * Non-default choices and why:
 *
 *   - FILE SEPARATION (`include` / `exclude`). This is the load-bearing part of this file.
 *     Vitest's stock `include` is `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, which would happily
 *     pick up `e2e/*.spec.ts` and then fail at import time, because those files import
 *     `@playwright/test` and expect a real browser and a running server. The convention
 *     enforced here is therefore a hard split on BOTH axes — directory and filename:
 *
 *         Vitest      →  *.test.ts / *.test.tsx, anywhere except `e2e/`
 *         Playwright  →  *.spec.ts, only inside `e2e/`
 *
 *     Vitest's `include` below matches only `.test.*`, and `exclude` additionally blocks
 *     the whole `e2e/` directory, so even a stray `e2e/foo.test.ts` stays out. The mirror
 *     of this rule is `testMatch` + `testDir` in `playwright.config.ts`. Change one side
 *     and you must change the other, or a runner starts executing tests it cannot run.
 *
 *   - `environment: "jsdom"`. The component tests render React trees into
 *     `document` and drive them with Testing Library, so a `node` environment cannot
 *     host them. jsdom is chosen over happy-dom because Testing
 *     Library and React 19 are best-tested against it.
 *
 *   - `globals: true`. Lets test files use `describe`/`it`/`expect` without importing
 *     them, matching the ambient style `@testing-library/jest-dom`'s matcher types
 *     expect. `vitest/globals` is added to `tsconfig.json`'s `types` so this stays
 *     type-safe under `strict`.
 *
 *   - `react()` plugin. Needed to transform JSX/TSX for component tests. It is configured
 *     with no options: the automatic JSX runtime it defaults to matches
 *     `"jsx": "react-jsx"` in `tsconfig.json`.
 *
 *   - `resolve.tsconfigPaths: true`. Resolves the `@/*` → repo-root alias by reading
 *     `tsconfig.json`, rather than duplicating the alias here where it could drift from
 *     what `tsc` uses. This is Vite's native support (Vite 8+); the older
 *     `vite-tsconfig-paths` plugin does the same job but now emits a deprecation notice
 *     on every run, so do not reintroduce it.
 *
 *   - `setupFiles`. Registers the jest-dom matchers and per-test DOM cleanup once for
 *     every test file — see `vitest.setup.ts`.
 *
 *   - `restoreMocks` / `clearMocks`. Spies are reset between tests automatically, so a
 *     `vi.spyOn(window.localStorage, ...)` in one test cannot leak into the next. Cheap
 *     insurance against order-dependent test suites.
 *
 * Failure modes: if `next typegen` has never run, imports from `next/*` generated types
 * are unavailable — but unit tests here deliberately target framework-free modules under
 * `lib/` and `components/`, so that does not affect this runner.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Reads `paths` from tsconfig.json — see header.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // See FILE SEPARATION in the header: Vitest owns `.test.*` only.
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      // Playwright's territory. Excluded by directory as well as by the `include`
      // filename rule, so a misnamed e2e file still cannot be picked up here.
      "e2e/**",
      "playwright-report/**",
      "test-results/**",
    ],
    restoreMocks: true,
    clearMocks: true,
  },
});
