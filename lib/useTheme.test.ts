/**
 * lib/useTheme.test.ts — unit tests for the theme cycle order and its accessible contract.
 *
 * What behaviour this protects, and why it is worth protecting:
 *
 *   1. THE CYCLE ORDER ITSELF: System → Light → Dark → System. This is a product decision
 *      recorded in `lib/useTheme.ts` ("ordered so the first press moves *to* an explicit
 *      choice rather than out of one"). The `CYCLE` array is module-private, so nothing
 *      else in the repo can accidentally depend on its literal contents — but nothing
 *      else notices if someone reorders it either. `tsc`, `eslint`, `prettier`, and
 *      `next build` are all perfectly happy with any permutation. This table is the only
 *      thing that fails.
 *
 *   2. THE ACCESSIBLE LABEL CANNOT LIE. `components/ThemeToggle` builds its
 *      `aria-label` ("Activate to switch to X") from `nextPreference`, and `useTheme`'s
 *      `cycle` computes the state it actually moves to from `nextPreference` as well.
 *      The whole point of routing both through one function is that they agree by
 *      construction. The failure this guards is subtle and severe: if someone reorders
 *      `CYCLE` while a second implementation of "what comes next" exists anywhere — a
 *      local ternary in the toggle, a hand-written label map, a copy of the array — then
 *      a screen-reader user is told the button will switch to Light while it actually
 *      switches to Dark. Every existing gate stays green through that regression, which
 *      is exactly why the Phase 1.1 QA pass asked for this test by name.
 *
 *      The second `describe` block below therefore does not re-assert the order. It
 *      asserts the *derivation*: for each starting preference, the value
 *      `ThemeToggle` would announce (`nextPreference(current)`) is compared against the
 *      state the hook's `cycle` actually lands in, observed through the DOM attribute
 *      that CSS reads. If those two ever diverge, the announcement is a lie regardless
 *      of what the order happens to be.
 *
 * Environment notes: runs under jsdom (see `vitest.config.mts`). `useTheme` reads
 * `data-theme` on `<html>` and writes `localStorage`; `vitest.setup.ts` strips the
 * attribute after every test, and each test seeds the starting state explicitly rather
 * than relying on order.
 */

import { act } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  nextPreference,
  THEME_STORAGE_KEY,
  useTheme,
  type ThemePreference,
} from "@/lib/useTheme";

/**
 * The complete, exhaustive cycle contract: every preference and the one press of the
 * toggle is expected to produce.
 *
 * Shaped as a table rather than three separate `it` blocks so that adding a fourth
 * `ThemePreference` (e.g. a high-contrast mode) forces an entry here — the
 * `Record<ThemePreference, ThemePreference>` type makes an omission a compile error under
 * `strict`, which is a stronger guarantee than a runtime count assertion.
 */
const CYCLE_CONTRACT: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

/** Every preference, derived from the contract table so the two cannot drift apart. */
const ALL_PREFERENCES = Object.keys(CYCLE_CONTRACT) as ThemePreference[];

/**
 * Writes a starting preference straight to the DOM, bypassing the hook.
 *
 * @param preference - The state to seed. `"system"` is the *absence* of `data-theme`,
 *                     matching what `app/layout.tsx`'s bootstrap script does.
 *
 * Side effects: sets or removes `data-theme` on `<html>`. Deliberately does not touch
 * `localStorage`: `subscribe`'s first-subscriber reconciliation reads storage and would
 * overwrite the seeded DOM value if the two disagreed, so tests must seed the DOM and
 * storage consistently — see `seedPreference`.
 */
function seedDom(preference: ThemePreference): void {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", preference);
  }
}

/**
 * Seeds both halves of the theme state (DOM and storage) to one coherent preference.
 *
 * @param preference - The state a visitor would be in before pressing the toggle.
 *
 * Side effects: mutates `<html>`'s `data-theme` and the `portfolio-theme` localStorage entry.
 *
 * Why both: `useTheme`'s `subscribe` reconciles the DOM against storage on the first
 * subscriber (the CSP-blocked-bootstrap recovery path). Seeding only the DOM would make
 * that reconciliation fire and reset the test to `"system"` before the press, silently
 * turning every case into the `system → light` case.
 *
 * Failure modes: none — `localStorage` is real and unrestricted in jsdom.
 */
function seedPreference(preference: ThemePreference): void {
  seedDom(preference);
  if (preference === "system") {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }
}

/**
 * Reads the live theme state the way CSS does: off the `data-theme` attribute.
 *
 * @returns The preference currently applied to the document. Absent attribute → `"system"`.
 *
 * Read through the DOM rather than the hook's return value on purpose — this is the state
 * that actually repaints the site, so it is the honest definition of "what the press did".
 */
function readDomPreference(): ThemePreference {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

afterEach(() => {
  // `vitest.setup.ts` clears `data-theme`; storage is this file's own concern.
  window.localStorage.clear();
});

describe("nextPreference — cycle order", () => {
  it.each(ALL_PREFERENCES)(
    "advances %s to the next preference in the documented cycle",
    (current) => {
      expect(nextPreference(current)).toBe(CYCLE_CONTRACT[current]);
    },
  );

  it("returns to the starting preference after one full lap", () => {
    for (const start of ALL_PREFERENCES) {
      const afterFullLap = ALL_PREFERENCES.reduce<ThemePreference>(
        (state) => nextPreference(state),
        start,
      );
      expect(afterFullLap).toBe(start);
    }
  });

  it("visits every preference exactly once per lap, so none is unreachable", () => {
    // Guards a reorder that accidentally drops or duplicates an entry, e.g.
    // ["system", "light", "light"] — which would strand Dark permanently.
    const visited: ThemePreference[] = [];
    let state: ThemePreference = "system";
    for (let step = 0; step < ALL_PREFERENCES.length; step += 1) {
      state = nextPreference(state);
      visited.push(state);
    }
    expect(new Set(visited).size).toBe(ALL_PREFERENCES.length);
  });

  it("is pure — calling it twice on the same input gives the same answer", () => {
    for (const current of ALL_PREFERENCES) {
      expect(nextPreference(current)).toBe(nextPreference(current));
    }
  });
});

describe("useTheme().cycle — announced next state matches the real one", () => {
  it.each(ALL_PREFERENCES)(
    "from %s, the state the toggle announces is the state a press produces",
    (start) => {
      seedPreference(start);

      const { result, unmount } = renderHook(() => useTheme());

      // The hook must first agree about where the visitor currently is, or the
      // comparison below would be against the wrong starting point.
      expect(result.current.preference).toBe(start);

      // This is precisely the value `components/ThemeToggle` interpolates into its
      // `aria-label` ("Activate to switch to ...").
      const announced = nextPreference(result.current.preference);

      act(() => {
        result.current.cycle();
      });

      // ...and this is what the press actually did, read off the attribute CSS uses.
      expect(readDomPreference()).toBe(announced);
      // The hook's own view must match too, so the visible button text cannot drift
      // from the painted theme.
      expect(result.current.preference).toBe(announced);

      unmount();
    },
  );

  it("persists the pressed state so a reload does not lose it", () => {
    seedPreference("system");
    const { result, unmount } = renderHook(() => useTheme());

    act(() => {
      result.current.cycle();
    });

    // "system" is stored as the absence of the key; every explicit choice is written.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(
      nextPreference("system"),
    );
    unmount();
  });
});
