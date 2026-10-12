/**
 * vitest.setup.ts — per-test-file setup, loaded by `setupFiles` in `vitest.config.mts`.
 *
 * Owns: the global test environment every unit and component test can assume. Anything
 * added here applies to every Vitest file in the repo, so it must stay small and
 * uncontroversial — test-specific fixtures belong in the test file, not here.
 *
 * What it currently establishes:
 *   1. `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveAttribute`,
 *      `toHaveAccessibleName`, ...). Imported for its side effect of calling
 *      `expect.extend`; the `/vitest` entry point is the one that registers against
 *      Vitest's `expect` and supplies the matcher types.
 *   2. DOM teardown after every test. React Testing Library's auto-cleanup only runs
 *      when a global `afterEach` exists at import time; with `globals: true` it does,
 *      but registering it explicitly makes the guarantee independent of that setting.
 *      Without it, a component test would leave mounted trees in `document.body` and the
 *      next test's `getByRole` would match an element from the previous test — a failure
 *      mode that looks like flakiness and costs an hour to diagnose.
 *
 * Side effects: mutates global `expect` and registers global `afterEach` hooks. No
 * network or filesystem access. Failure modes: none at import; if this file throws, every
 * test file fails to start, which is loud by design.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
