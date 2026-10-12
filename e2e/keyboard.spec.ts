/**
 * e2e/keyboard.spec.ts — keyboard operability of the shell: the skip link, focus order,
 * the focus indicator, and the theme toggle's key handling.
 *
 * What behaviour this protects:
 *
 *   1. THE SKIP LINK MOVES FOCUS. Not that it exists, not that it scrolls —
 *      `document.activeElement` must become `#main-content`. A skip link that only
 *      scrolls is the standard broken implementation, it looks fine to a sighted mouse
 *      user, and it is useless to the people it exists for. What makes it work here is
 *      `tabIndex={-1}` on `<main>`; delete that and this suite fails, which is the point.
 *
 *   2. THE FOCUS INDICATOR IS PRESENT AND DOES NOT DEFORM THE CONTROL. `app/globals.css`
 *      defines exactly one `:focus-visible` treatment. It previously ALSO set
 *      `border-radius: var(--radius-sm)`, and because that rule is unlayered it beat
 *      Tailwind's `.rounded-full` in `@layer utilities` — so every pill control
 *      (`components/ThemeToggle.tsx`, the 404 and error page buttons) snapped from a
 *      9999px radius to 4px the instant it took keyboard focus. That was a blocking
 *      defect, `frontend-ui` fixed it by removing the declaration, and the radius
 *      assertions in this file are its regression test. Any future `border-radius` in a
 *      focus rule fails here.
 *
 *   3. THE TOGGLE IS A REAL BUTTON. Enter and Space both activate it, Space does not
 *      scroll the page, and focus stays on it across the state change — the icon subtree
 *      is replaced on every press, so focus loss to `<body>` is a live risk that would
 *      strand a keyboard visitor at the top of the tab order.
 *
 * Corresponding manual checklist: `QA/1.1_tests/keyboard-navigation.md`.
 *
 * WEBKIT CAVEAT, and why the tab-order tests are Chromium-only: Safari (and Playwright's
 * WebKit) does not include links in the sequential focus order unless the user turns on
 * "Press Tab to highlight each item on a webpage" — it is off by default and is not
 * settable from Playwright. So a `Tab`-driven walk of the nav asserts a user preference
 * in WebKit, not the product. Those tests are therefore skipped on WebKit and flagged in
 * the checklist as still needing one human pass in real Safari with that setting on.
 * Everything that uses `.focus()` or `.click()` rather than `Tab` runs on both engines,
 * including the whole focus-indicator and radius-regression set.
 */

import { expect, test, type Page } from "@playwright/test";
// `/` renders the owner's name as its h1. Asserted against `SITE.name` rather than a
// literal so renaming is a one-line edit, and so this cannot drift from the page.
import { LANDING_PAGE, SITE } from "@/lib/site";

/** Storage key used to force a theme, so indicators are checked in both palettes. */
const THEME_KEY = "portfolio-theme";

/** Accent colour per theme — the focus outline is `2px solid var(--color-accent)`. */
const ACCENT = {
  light: "rgb(154, 74, 47)", // #9a4a2f
  dark: "rgb(231, 144, 112)", // #e79070
};

/**
 * Force an explicit theme before the page loads.
 *
 * @param page - Page to seed. Must be called before `goto`.
 * @param theme - `"light"` or `"dark"`; written to `portfolio-theme` so the pre-paint bootstrap
 *                applies it and no mid-test toggling is needed.
 * Side effects: writes `localStorage` in every subsequent document on this page.
 */
async function forceTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [THEME_KEY, theme],
  );
}

/**
 * The computed focus-relevant style of the currently focused element.
 *
 * @param page - Page to inspect.
 * @returns Outline width/style/colour, the element's border radius, and a short
 *          identifier for error messages.
 * Side effects: none. Failure modes: returns the `<body>` values if nothing is focused,
 * which every caller asserts against explicitly rather than trusting.
 */
function activeStyle(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      label: (el.getAttribute("aria-label") ?? el.textContent ?? "")
        .trim()
        .slice(0, 40),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      borderRadius: style.borderRadius,
    };
  });
}

test.describe("skip link", () => {
  test("Tab reveals it, Enter moves focus into #main-content", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit excludes links from tab order unless the user enables full keyboard " +
        "access; see the WEBKIT CAVEAT in this file's header.",
    );

    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });

    // Before focus it is `sr-only`: in the accessibility tree, but clipped to 1px.
    const hiddenBox = await skipLink.boundingBox();
    expect(hiddenBox, "skip link has no box at all").not.toBeNull();
    expect(
      hiddenBox!.width,
      "skip link should be visually clipped before focus",
    ).toBeLessThan(4);

    // One Tab from the top of the document must land on it — nothing focusable precedes.
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    // `focus:not-sr-only` must actually unclip it into a readable pill.
    const shownBox = await skipLink.boundingBox();
    expect(
      shownBox!.width,
      "skip link did not become visible on focus",
    ).toBeGreaterThan(80);
    expect(shownBox!.height).toBeGreaterThan(20);

    await page.keyboard.press("Enter");

    // THE assertion this file exists for: focus, not just scroll.
    const active = await page.evaluate(() => ({
      id: document.activeElement?.id ?? null,
      tag: document.activeElement?.tagName.toLowerCase() ?? null,
    }));
    expect(
      active,
      "activating the skip link did not move focus to #main-content",
    ).toEqual({ id: "main-content", tag: "main" });

    expect(page.url()).toContain("#main-content");

    // And the next Tab continues from main, not back into the header.
    //
    // The very next stop must be the page's own first control — the hero's primary CTA,
    // which is inside `<main>`.
    await page.keyboard.press("Tab");
    const heroCta = page.getByRole("main").getByRole("link", {
      name: LANDING_PAGE.projectsCta,
    });
    await expect(
      heroCta,
      "focus went backwards into the header instead of forwards from main",
    ).toBeFocused();
  });

  test("loading /#main-content directly does not break the page", async ({
    page,
  }) => {
    await page.goto("/#main-content");
    await expect(
      page.getByRole("heading", { level: 1, name: SITE.name }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("tabbing past it without activating hides it again", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit tab order excludes links by default — see the header caveat.",
    );

    await page.goto("/");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Tab");

    await expect(
      page.getByRole("link", { name: "Ethan Caldwell" }),
      "second Tab should reach the wordmark",
    ).toBeFocused();
    const box = await skipLink.boundingBox();
    expect(
      box!.width,
      "skip link stayed visible after focus left it",
    ).toBeLessThan(4);
  });
});

test.describe("focus order", () => {
  test("Tab walks the document in DOM order and Shift+Tab reverses it exactly", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit tab order excludes links by default — see the header caveat.",
    );

    await page.goto("/");

    /**
     * The expected order, derived from the DOM and asserted as a whole sequence rather
     * than element by element so a reordering shows up as one readable diff. `<main>` is
     * absent because `tabindex="-1"` makes it programmatically focusable only — reaching
     * it by Tab would be a defect.
     */
    /*
      Shell first (skip link, wordmark, nav, theme toggle), then the landing page's own
      controls in DOM order: the two hero CTAs, one "Source" link per featured card that
      has a repo URL (both featured cards do today), the link to the full list, then the
      footer's links. Card links are prefix-matched because their text is
      "Source" plus an sr-only suffix naming the project, and that name is content.
    */
    const expected = [
      "Skip to main content",
      "Ethan Caldwell",
      "Home",
      "Projects",
      "About",
      /^Theme:/,
      LANDING_PAGE.projectsCta,
      LANDING_PAGE.contactCta,
      /^Source/,
      /^Source/,
      LANDING_PAGE.allProjectsLink,
      "Email",
      "GitHub",
    ];

    const forward: string[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      await page.keyboard.press("Tab");
      const style = await activeStyle(page);
      forward.push(style?.label ?? "<nothing focused>");
    }

    for (const [index, want] of expected.entries()) {
      const got = forward[index] ?? "<nothing focused>";
      if (want instanceof RegExp) {
        expect(got, `forward position ${index}`).toMatch(want);
      } else {
        expect(got, `forward position ${index}`).toBe(want);
      }
    }

    // Reverse: Shift+Tab from the last element must retrace the same path.
    const backward: string[] = [];
    for (let i = 0; i < expected.length - 1; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const style = await activeStyle(page);
      backward.push(style?.label ?? "<nothing focused>");
    }
    const wantBackward = forward.slice(0, -1).reverse();
    expect(
      backward,
      "Shift+Tab did not retrace the forward order — something is trapped or skipped",
    ).toEqual(wantBackward);
  });

  test("no positive tabindex anywhere distorts the order", async ({ page }) => {
    await page.goto("/");
    const positive = await page.evaluate(() =>
      [...document.querySelectorAll("[tabindex]")]
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          value: el.getAttribute("tabindex"),
        }))
        .filter((entry) => Number(entry.value) > 0),
    );
    expect(positive, "positive tabindex found").toEqual([]);
  });
});

test.describe("focus indicator", () => {
  /**
   * Every focusable element in the shell, located the way a user perceives it. Driven by
   * `.focus()` rather than `Tab` so the set runs on WebKit too — `:focus-visible` matches
   * a programmatic focus on an element that was not clicked, which is the same state Tab
   * produces. The mouse-click case is asserted separately below.
   */
  const targets = [
    { role: "link" as const, name: "Skip to main content" },
    { role: "link" as const, name: "Ethan Caldwell" },
    { role: "link" as const, name: "Home" },
    { role: "link" as const, name: "Projects" },
    { role: "link" as const, name: "About" },
    { role: "button" as const, name: /^Theme:/ },
    { role: "link" as const, name: "GitHub" },
    // The landing page's own controls. The focus ring is a global rule, so a page-level
    // control that misses it is exactly the regression worth catching.
    { role: "link" as const, name: LANDING_PAGE.projectsCta },
    { role: "link" as const, name: LANDING_PAGE.contactCta },
    { role: "link" as const, name: LANDING_PAGE.allProjectsLink },
  ];

  for (const theme of ["light", "dark"] as const) {
    test(`every focusable element shows the accent outline in ${theme} theme`, async ({
      page,
    }) => {
      await forceTheme(page, theme);
      await page.goto("/");

      for (const target of targets) {
        const locator = page.getByRole(target.role, { name: target.name });
        await locator.focus();

        const described = `${theme} / ${String(target.name)}`;
        const immediate = await activeStyle(page);

        // Geometry first — a ring that is present but mis-coloured is a very different
        // finding from no ring at all, so they are asserted separately.
        expect(immediate, `${described}: nothing focused`).not.toBeNull();
        expect(
          immediate!.outlineStyle,
          `${described}: outline-style on focus`,
        ).toBe("solid");
        expect(
          parseFloat(immediate!.outlineWidth),
          `${described}: outline-width on focus`,
        ).toBeGreaterThanOrEqual(2);
        // Offset is what keeps the ring legible against a pill border; 0 would collapse
        // the ring onto the border and read as a thicker border rather than a ring.
        expect(
          parseFloat(immediate!.outlineOffset),
          `${described}: outline-offset`,
        ).toBeGreaterThanOrEqual(2);

        /**
         * Then the colour, AFTER transitions settle. The wait is not padding — it is
         * the finding this loop turned up. `components/Nav.tsx` and
         * `components/Footer.tsx` put `transition-colors` on their links, and in
         * Tailwind v4 that shorthand's property list INCLUDES `outline-color`. So on
         * those five elements the ring interpolates from `currentColor` to the accent
         * over 150ms: measured at focus+0ms the nav links report `rgb(93, 98, 110)`
         * (`--theme-muted`) and only reach `rgb(154, 74, 47)` by ~200ms. The ring is
         * full width and solid the whole time, and the intermediate colour is the muted
         * token at 5.86:1 against the canvas, so it is never invisible or below the 3:1
         * non-text threshold — this is cosmetic, logged for `frontend-ui`, not a gate
         * failure. Asserting the settled colour is the correct thing to gate on;
         * asserting it at 0ms would encode the transition as desired behaviour.
         */
        await page.waitForFunction(
          (expectedColor) => {
            const el = document.activeElement;
            if (!el) return false;
            return getComputedStyle(el).outlineColor === expectedColor;
          },
          ACCENT[theme],
          { timeout: 2000 },
        );

        const settled = await activeStyle(page);
        expect(
          settled!.outlineColor,
          `${described}: settled outline-color`,
        ).toBe(ACCENT[theme]);
      }
    });
  }

  test("REGRESSION — focus does not change any pill's border-radius", async ({
    page,
  }) => {
    /**
     * The fixed blocking defect. `:focus-visible` in `app/globals.css` is unlayered, so
     * a `border-radius` there outranks `.rounded-full` from `@layer utilities` and
     * squared off every pill on focus. Measured before and during focus and compared, so
     * this fails on ANY radius change rather than on one hard-coded expected value.
     */
    await page.goto("/");

    const pill = page.getByRole("button", { name: /^Theme:/ });
    const atRest = await pill.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    // A pill: `rounded-full` resolves to 9999px, so any collapse to `--radius-sm` (4px)
    // is unmistakable. Asserted so a future restyle to a square button cannot make this
    // test vacuous.
    expect(
      parseFloat(atRest),
      "the theme toggle is no longer a pill, so this regression test needs revisiting",
    ).toBeGreaterThan(100);

    await pill.focus();
    const focused = await activeStyle(page);
    expect(
      focused!.borderRadius,
      "focus changed the theme toggle's border-radius — the unlayered border-radius " +
        "in the :focus-visible rule has come back",
    ).toBe(atRest);

    // Same check on the 404 page's pill, which carries the same treatment.
    await page.goto("/no-such-route");
    const notFoundPill = page.getByRole("link", { name: "Back to home" });
    const nfRest = await notFoundPill.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(parseFloat(nfRest)).toBeGreaterThan(100);
    await notFoundPill.focus();
    const nfFocused = await activeStyle(page);
    expect(
      nfFocused!.borderRadius,
      "focus changed the 404 pill's border-radius",
    ).toBe(nfRest);

    // And the skip link, whose focus styles are the most heavily conditional.
    await page.goto("/");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    const skipRest = await skip.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    await skip.focus();
    const skipFocused = await activeStyle(page);
    expect(
      skipFocused!.borderRadius,
      "the skip link's radius is expected to come from focus:rounded-md by design; " +
        "it must be that value and not --radius-sm imposed by the focus rule",
    ).toBe(skipRest === "0px" ? "8px" : skipRest);
  });

  test("nothing in the shell removes the outline", async ({ page }) => {
    // Guards against a future `outline: none` / `outline-none` shipping on any element:
    // asserted against the rendered document rather than by grepping source.
    await page.goto("/");
    const suppressed = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "a, button, input, select, textarea, [tabindex]",
        ),
      ]
        .map((el) => ({
          label: (el.getAttribute("aria-label") ?? el.textContent ?? "")
            .trim()
            .slice(0, 30),
          // Read the *declared* suppression, i.e. an author `outline: none`. An element
          // not currently focused legitimately computes `outlineStyle: none`, so the
          // inline/declared value is what is inspected here.
          declared: el.style.outline || null,
        }))
        .filter((entry) => entry.declared === "none" || entry.declared === "0"),
    );
    expect(suppressed, "an element declares outline: none inline").toEqual([]);
  });

  test("the outline does not appear on a mouse click", async ({
    page,
    browserName,
  }) => {
    // `:focus-visible`, not `:focus`. A click must not ring the control.
    await page.goto("/");
    const pill = page.getByRole("button", { name: /^Theme:/ });
    await pill.click();

    // Engine difference, not a defect: Chromium focuses a clicked button, WebKit
    // (following the macOS convention Safari implements) does not. Asserting
    // `toBeFocused()` unconditionally failed on WebKit with "unexpected value
    // inactive". What both engines must agree on is the absence of a ring, so the
    // focus half of the assertion is scoped to the engine that has the behaviour.
    if (browserName === "chromium") {
      await expect(pill).toBeFocused();
    }

    const ringed = await pill.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        matchesFocusVisible: el.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
      };
    });
    expect(
      ringed.matchesFocusVisible,
      "a mouse click matched :focus-visible — the heuristic is being defeated by " +
        "something in the markup (a tabindex on a wrapper, or a manual .focus() call)",
    ).toBe(false);
    expect(
      ringed.outlineStyle,
      "a mouse click produced a focus ring — the rule has been changed from " +
        ":focus-visible to :focus",
    ).toBe("none");
  });
});

test.describe("theme toggle key handling", () => {
  test("Enter activates it and focus stays on the button", async ({ page }) => {
    await page.goto("/");
    const pill = page.getByRole("button", { name: /^Theme:/ });
    await pill.focus();

    await page.keyboard.press("Enter");
    await expect(pill).toHaveAccessibleName(
      "Theme: Light. Activate to switch to Dark.",
    );
    await expect(
      pill,
      "focus was lost across the state change — the icon subtree is replaced on every " +
        "press, so this strands a keyboard visitor at the top of the tab order",
    ).toBeFocused();
  });

  test("Space activates it and does not scroll the page", async ({ page }) => {
    // A `div role="button"` would scroll on Space; a real `<button>` must not. The page
    // is made deliberately scrollable first, otherwise a scroll bug has nowhere to show.
    await page.setViewportSize({ width: 900, height: 300 });
    await page.goto("/");

    const pill = page.getByRole("button", { name: /^Theme:/ });
    await pill.focus();
    const before = await page.evaluate(() => window.scrollY);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight,
      ),
      "viewport is not scrollable, so the no-scroll assertion would be vacuous",
    ).toBe(true);

    await page.keyboard.press("Space");

    await expect(pill).toHaveAccessibleName(
      "Theme: Light. Activate to switch to Dark.",
    );
    expect(
      await page.evaluate(() => window.scrollY),
      "Space scrolled the page as well as activating the control",
    ).toBe(before);
    await expect(pill).toBeFocused();
  });

  test("the accessible name is the only announcement, and it tracks state", async ({
    page,
  }) => {
    // The visible label and the icon are both `aria-hidden`, so the name must come
    // solely from `aria-label` — otherwise a screen reader says the state twice.
    await page.goto("/");
    const pill = page.getByRole("button", { name: /^Theme:/ });

    for (const [current, next] of [
      ["System", "Light"],
      ["Light", "Dark"],
      ["Dark", "System"],
    ]) {
      await expect(pill).toHaveAccessibleName(
        `Theme: ${current}. Activate to switch to ${next}.`,
      );
      await pill.click();
    }

    const hidden = await pill.evaluate((el) => ({
      icon: el.querySelector("svg")?.getAttribute("aria-hidden"),
      label: el.querySelector("span")?.getAttribute("aria-hidden"),
    }));
    expect(hidden).toEqual({ icon: "true", label: "true" });
  });
});
