/**
 * e2e/theme-system.spec.ts — the three-state theme cycle, persistence, cross-tab sync,
 * and every degraded-storage path.
 *
 * What behaviour this protects:
 *
 *   1. THE CYCLE IS EXACTLY System → Light → Dark → System, and the DOM contract for
 *      each state is honoured: `data-theme` ABSENT for System, `"light"`, `"dark"`. The
 *      absent-attribute case is the one most likely to be broken by a well-meaning
 *      refactor writing `data-theme="system"`, which `app/globals.css` cannot resolve
 *      (its system rule is `:root:not([data-theme])`), silently stranding every
 *      dark-OS visitor on the light palette.
 *
 *   2. PERSISTENCE. An explicit choice survives a reload; System REMOVES the storage key
 *      rather than writing the string `"system"`. Same reasoning as above, from the
 *      storage side.
 *
 *   3. CROSS-TAB SYNC. `lib/useTheme.ts` subscribes to `storage` events, which fire only
 *      in OTHER documents of the same storage area, so this needs two real pages.
 *
 *   4. DEGRADED STORAGE. Absent, empty, corrupt, and THROWING `localStorage` must all
 *      land on System with a working toggle and no console error. The code try/catches
 *      all four; this executes them.
 *
 * Corresponding manual checklist: `QA/1.1_tests/theme-system.md` sections 1, 2, 4, 5.
 * First-paint timing is a separate concern and lives in `theme-flash.spec.ts`.
 *
 * A note on scoping: cross-tab sync uses two PAGES IN ONE CONTEXT, not two contexts.
 * Two Playwright contexts are separate storage partitions and no `storage` event crosses
 * between them, so a two-context version of this test would pass or fail for reasons
 * unrelated to the product. One context, two pages, is the faithful model of two tabs.
 *
 * Runs on Chromium and WebKit.
 */

import { expect, test, type Page } from "@playwright/test";
// `/` renders the owner's name as its h1. Asserted against `SITE.name` rather than a
// literal so renaming is a one-line edit, and so this cannot drift from the page.
import { SITE } from "@/lib/site";

/** Storage key shared by `lib/useTheme.ts` (`THEME_STORAGE_KEY`) and the bootstrap. */
const THEME_KEY = "portfolio-theme";

/**
 * The toggle button, located by role and by the stable half of its accessible name.
 *
 * @param page - Page to query.
 * @returns A locator for the single theme toggle in the nav.
 *
 * Matched on `/^Theme:/` rather than a full string because the name intentionally
 * changes with state ("Theme: Light. Activate to switch to Dark."). Asserting the whole
 * name here would make every state transition need a different locator.
 */
function toggle(page: Page) {
  return page.getByRole("button", { name: /^Theme:/ });
}

/**
 * Read `data-theme` off `<html>`.
 *
 * @param page - Page to read from.
 * @returns The attribute value, or `null` for the System state. Side effects: none.
 */
function themeAttribute(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

/**
 * Read the persisted preference.
 *
 * @param page - Page to read from.
 * @returns The stored string, or `null` when the key is absent (the System state).
 * Side effects: none. Failure modes: throws if storage itself throws — callers in the
 * degraded-storage tests therefore do not use this helper.
 */
function storedValue(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY);
}

test.describe("theme cycle and DOM contract", () => {
  test("System → Light → Dark → System, with the attribute and storage matching each state", async ({
    page,
  }) => {
    await page.goto("/");

    // Fresh context: no stored value, so the initial state is System.
    await expect(toggle(page)).toHaveAccessibleName(
      "Theme: System. Activate to switch to Light.",
    );
    expect(await themeAttribute(page)).toBeNull();
    expect(await storedValue(page)).toBeNull();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName(
      "Theme: Light. Activate to switch to Dark.",
    );
    expect(await themeAttribute(page)).toBe("light");
    expect(await storedValue(page)).toBe("light");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName(
      "Theme: Dark. Activate to switch to System.",
    );
    expect(await themeAttribute(page)).toBe("dark");
    expect(await storedValue(page)).toBe("dark");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName(
      "Theme: System. Activate to switch to Light.",
    );
    // The two System assertions that matter most: attribute REMOVED, key REMOVED.
    expect(
      await themeAttribute(page),
      'System must remove data-theme, not set it to "system"',
    ).toBeNull();
    expect(
      await storedValue(page),
      'System must removeItem, not persist the string "system"',
    ).toBeNull();
  });

  test("each state actually repaints the canvas", async ({ page }) => {
    // The attribute contract above is necessary but not sufficient — it would still hold
    // if the CSS stopped resolving. This asserts the resolved colour per state, with the
    // OS emulated LIGHT so an explicit Dark choice has to override it.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const canvas = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(await canvas(), "System on a light OS").toBe("rgb(251, 250, 248)");

    await toggle(page).click(); // Light
    expect(await canvas(), "explicit Light").toBe("rgb(251, 250, 248)");

    await toggle(page).click(); // Dark
    expect(await canvas(), "explicit Dark must beat a light OS").toBe(
      "rgb(16, 17, 20)",
    );

    await toggle(page).click(); // System
    expect(await canvas(), "back to System").toBe("rgb(251, 250, 248)");
  });

  test("the nav does not reflow as the state label changes", async ({
    page,
  }) => {
    // The label span is fixed-width (`w-12`) at `sm` and up precisely so cycling does
    // not shift the header. Measured on the toggle's own box: if the label were
    // auto-width, "System" and "Dark" would give different widths.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const widths: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const box = await toggle(page).boundingBox();
      expect(box, "toggle has no layout box").not.toBeNull();
      widths.push(Math.round(box!.width));
      await toggle(page).click();
    }

    expect(
      new Set(widths).size,
      `toggle width changed across states: ${widths.join(", ")}px — the nav reflows`,
    ).toBe(1);
  });
});

test.describe("persistence across reload", () => {
  for (const state of ["light", "dark"] as const) {
    test(`an explicit ${state} choice survives a hard reload`, async ({
      page,
    }) => {
      // Emulate the OPPOSITE OS preference so a reload that lost the stored value would
      // visibly land on the other palette rather than coincidentally look correct.
      await page.emulateMedia({
        colorScheme: state === "dark" ? "light" : "dark",
      });
      await page.goto("/");

      // Cycle until the wanted state is current, rather than assuming a click count.
      const wantedName = new RegExp(
        `^Theme: ${state === "dark" ? "Dark" : "Light"}\\.`,
        "i",
      );
      for (let i = 0; i < 3; i += 1) {
        if (
          await toggle(page).evaluate(
            (el, re) =>
              new RegExp(re, "i").test(el.getAttribute("aria-label") ?? ""),
            wantedName.source,
          )
        )
          break;
        await toggle(page).click();
      }
      await expect(toggle(page)).toHaveAccessibleName(wantedName);

      await page.reload();

      expect(await themeAttribute(page)).toBe(state);
      expect(await storedValue(page)).toBe(state);
      await expect(toggle(page)).toHaveAccessibleName(wantedName);
      expect(
        await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        ),
      ).toBe(state === "dark" ? "rgb(16, 17, 20)" : "rgb(251, 250, 248)");
    });
  }

  test("System survives a reload as the OS theme, with the key still absent", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // Go all the way round so System is reached by an explicit choice, not by default —
    // this is the path where `removeItem` has to run.
    await toggle(page).click();
    await toggle(page).click();
    await toggle(page).click();
    expect(await storedValue(page)).toBeNull();

    await page.reload();

    expect(await themeAttribute(page)).toBeNull();
    expect(await storedValue(page)).toBeNull();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
      "System on a dark OS must follow the OS",
    ).toBe("rgb(16, 17, 20)");
  });
});

test.describe("cross-tab sync", () => {
  test("changing the theme in one tab updates the other without a reload", async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto("/");
    await tabB.goto("/");

    expect(await themeAttribute(tabB)).toBeNull();

    // A → Light. B must follow purely from the `storage` event.
    await toggle(tabA).click();
    await expect
      .poll(() => themeAttribute(tabB), {
        message: "tab B did not pick up Light from tab A",
      })
      .toBe("light");
    await expect(toggle(tabB)).toHaveAccessibleName(
      "Theme: Light. Activate to switch to Dark.",
    );

    // A → Dark.
    await toggle(tabA).click();
    await expect.poll(() => themeAttribute(tabB)).toBe("dark");

    // A → System. B must go back to the attribute being absent, which is the case a
    // naive implementation gets wrong (it needs the `key === null` / removal path).
    await toggle(tabA).click();
    await expect
      .poll(() => themeAttribute(tabB), {
        message: "tab B did not return to the System state",
      })
      .toBeNull();
    await expect(toggle(tabB)).toHaveAccessibleName(
      "Theme: System. Activate to switch to Light.",
    );

    await tabA.close();
    await tabB.close();
  });

  test("rapid cycling in one tab leaves both tabs on the same state, with no loop", async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto("/");
    await tabB.goto("/");

    // Six clicks = two full laps, ending back on System.
    for (let i = 0; i < 6; i += 1) await toggle(tabA).click();

    await expect.poll(() => themeAttribute(tabA)).toBeNull();
    await expect
      .poll(() => themeAttribute(tabB), {
        message: "tab B did not converge on tab A's final state",
      })
      .toBeNull();

    // Loop check: `applyPreferenceToDom` (not `applyPreference`) is what the storage
    // handler calls, so a receiving tab must not write back to storage and re-trigger
    // the originator. If it did, the two tabs would keep flipping; settle and re-read.
    await tabB.waitForTimeout(300);
    expect(await themeAttribute(tabA)).toBeNull();
    expect(await themeAttribute(tabB)).toBeNull();

    await tabA.close();
    await tabB.close();
  });
});

test.describe("degraded storage", () => {
  /**
   * Values that are present but not a valid preference. `parsePreference` must coerce
   * every one of these to System — i.e. no attribute — rather than stamping them onto
   * `<html>`, where `data-theme="purple"` would match no CSS rule at all.
   */
  for (const garbage of ["purple", "", "Dark", "system", "null"]) {
    test(`a stored value of ${JSON.stringify(garbage)} falls back to System without crashing`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key!, value!),
        [THEME_KEY, garbage],
      );
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/");

      expect(
        await themeAttribute(page),
        `"${garbage}" must not be written to data-theme`,
      ).toBeNull();
      await expect(toggle(page)).toHaveAccessibleName(
        "Theme: System. Activate to switch to Light.",
      );
      // Still on the OS palette, and still operable.
      expect(
        await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        ),
      ).toBe("rgb(16, 17, 20)");
      await toggle(page).click();
      expect(await themeAttribute(page)).toBe("light");

      expect(errors, "uncaught page error").toEqual([]);
    });
  }

  test("localStorage throwing on every access still renders and still toggles for the session", async ({
    page,
  }) => {
    /**
     * The Safari-private-browsing / blocked-site-data path. Real Safari private mode is
     * not reachable from Playwright, so the THROW is reproduced directly: `getItem`,
     * `setItem`, and `removeItem` are replaced with functions that throw, before any of
     * the document's own scripts run. That is the exact failure the try/catch blocks in
     * `app/layout.tsx` and `lib/useTheme.ts` exist for, and reproducing the throw is a
     * more precise test than reproducing the browser mode — the mode has other
     * differences irrelevant to this behaviour.
     *
     * What must hold: no uncaught page error (an uncaught throw in the blocking head
     * script would abort the rest of it), the page renders on the OS theme, and the
     * toggle still works for the session even though nothing can be remembered.
     */
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      };
      // Patch the prototype rather than the `localStorage` property itself: replacing
      // `window.localStorage` wholesale is blocked in WebKit, and patching methods is
      // also closer to the real failure, where the object exists but access throws.
      Object.defineProperty(Storage.prototype, "getItem", { value: boom });
      Object.defineProperty(Storage.prototype, "setItem", { value: boom });
      Object.defineProperty(Storage.prototype, "removeItem", { value: boom });
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // The page rendered, on the OS theme, with no attribute.
    await expect(
      page.getByRole("heading", { level: 1, name: SITE.name }),
    ).toBeVisible();
    expect(await themeAttribute(page)).toBeNull();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(16, 17, 20)");

    // And the toggle still drives the DOM, session-only.
    await toggle(page).click();
    expect(await themeAttribute(page)).toBe("light");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(251, 250, 248)");
    await toggle(page).click();
    expect(await themeAttribute(page)).toBe("dark");

    expect(
      errors,
      "storage throwing must be swallowed, not surfaced as a page error",
    ).toEqual([]);

    // Nothing was remembered, which is the accepted degradation — a reload returns to
    // the OS theme rather than the session choice.
    await page.reload();
    expect(await themeAttribute(page)).toBeNull();
  });
});
