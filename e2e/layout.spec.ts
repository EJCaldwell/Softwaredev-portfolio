/**
 * e2e/layout.spec.ts — layout integrity of the shell across viewports and at zoom.
 *
 * What behaviour this protects:
 *
 *   1. NO HORIZONTAL OVERFLOW at 320, 375, 414, 768, 1024, and 1440px. Horizontal scroll
 *      on a portfolio site is the defect a recruiter notices on a phone and nobody
 *      notices on a laptop. `app/globals.css` deliberately contains no
 *      `overflow-x: hidden`, so there is nothing masking it — meaning a real overflow
 *      will show up here as a real failure. When it does fail, the offending elements
 *      are named, because "scrollWidth > clientWidth" on its own is unactionable.
 *
 *   2. THE SHARED LEFT EDGE. `--container-page` (68rem / 1088px) and
 *      `--container-measure` (40rem) are two different max-widths. Centring them
 *      independently puts them on the same centre axis but NOT the same left edge, which
 *      above 1088px offsets prose ~200px right of the nav wordmark. A design audit
 *      flagged exactly that misalignment, `frontend-ui` fixed it by nesting the measure
 *      inside the page container, and nobody had seen the result rendered. These tests
 *      measure the actual painted left edges of the nav, the `h1`, and the footer, at
 *      widths both below and above the 1088px threshold where the bug appears.
 *
 *   3. THE CANVAS COVERS THE VIEWPORT. `<html class="h-full">` + `body.min-h-full` +
 *      `main.flex-1` is what stops a short page leaving an unstyled white band under the
 *      footer in dark theme. Asserted on real pixels below the footer, not on classes.
 *
 *   4. 200% ZOOM REFLOWS WITHOUT BREAKING (WCAG 1.4.10 territory), and the fluid
 *      `--text-2xl` clamp is pinned at both of its ends.
 *
 * Corresponding manual checklist: `QA/1.1_tests/layout-and-theme-rendering.md`.
 *
 * NOT covered here, and left to a human on purpose: whether either theme "looks
 * deliberate", whether a surface reads as raised given the 1.04:1 bg/surface step, and
 * over-scroll rubber-banding on a real trackpad or iOS device. Those are aesthetic
 * judgements and a device behaviour respectively; a machine can measure the colours (it
 * does, in `color-contrast.md`) but cannot decide whether the result is good.
 */

import { expect, test, type Page } from "@playwright/test";
import { CANVAS, topLeftPixel } from "./support/pixels";
// The two text-overflow detectors live in support/ so a throwaway script can run the SAME
// code against a deliberately broken page — see that module's header.
import {
  findBoxesWithOverflowingContent,
  findTextPaintingOutsideItsBlock,
} from "./support/text-overflow";
// Pairwise / line-box geometry for the site chrome. Same rationale for living in support/:
// the detectors can be pointed at a deliberately broken DOM from a throwaway script to
// prove they fire. See that module's header for both failure classes.
import {
  findMidWordBreaks,
  findOverlappingTargets,
} from "./support/chrome-geometry";
// `/` renders the owner's name as its h1. Asserted against `SITE.name` rather than a
// literal so renaming is a one-line edit, and so this cannot drift from the page.
import { SITE } from "@/lib/site";

/** Widths under test. 320 is the narrowest phone still worth supporting; 1440 a laptop. */
const WIDTHS = [320, 375, 414, 768, 1024, 1440];

/** `--container-page`, in px: 68rem at the 16px root size. The alignment threshold. */
const PAGE_CONTAINER_PX = 1088;

/**
 * Force a theme before load, so pixel checks are made against a known canvas.
 *
 * @param page - Page to seed; call before `goto`.
 * @param theme - Theme to store under `portfolio-theme`.
 * Side effects: writes `localStorage` for every subsequent document on this page.
 */
async function forceTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ["portfolio-theme", theme],
  );
}

/**
 * Find every element wider than the viewport, or extending past its right edge.
 *
 * @param page - Page to inspect, already laid out.
 * @returns One entry per offender: a CSS-ish description, its width, and its right edge.
 * Side effects: none — measurement only.
 *
 * Why report elements rather than just the document metric: a bare
 * `scrollWidth > clientWidth` failure sends the next person on a bisect hunt. This turns
 * the failure message into the fix.
 */
function findOverflowingElements(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return (
      [...document.querySelectorAll<HTMLElement>("body *")]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            selector:
              el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : "") +
              (el.className && typeof el.className === "string"
                ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}`
                : ""),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        // 1px of tolerance absorbs sub-pixel rounding in both engines; a real overflow is
        // never a fraction of a pixel.
        .filter((entry) => entry.right > limit + 1)
    );
  });
}

test.describe("no horizontal overflow", () => {
  for (const width of WIDTHS) {
    test(`at ${width}px the document does not scroll horizontally`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      const offenders = await findOverflowingElements(page);
      expect(
        offenders,
        `elements extend past the viewport at ${width}px`,
      ).toEqual([]);
      expect(
        metrics.scrollWidth,
        `document scrolls horizontally at ${width}px`,
      ).toBeLessThanOrEqual(metrics.clientWidth);
    });
  }

  test("the 404 page also does not overflow at 320px", async ({ page }) => {
    // The 404 is reachable by ordinary clicking during Phases 1-3 (the nav links to
    // routes that do not exist yet), so it gets the narrow-viewport check too.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/no-such-route");
    expect(await findOverflowingElements(page)).toEqual([]);
  });

  test("nothing masks a horizontal overflow with overflow-x: hidden", async ({
    page,
  }) => {
    /**
     * A hidden overflow would make every test above pass while the bug shipped.
     *
     * The condition is deliberately narrow: `overflow-x: hidden` AND content actually
     * wider than the box. A first draft flagged every element with `overflow-x: hidden`
     * and failed on ten legitimate ones — the `sr-only` skip link (the `sr-only`
     * utility clips by design, which is the whole mechanism) among them. Clipping is
     * only a masked bug when there is something being clipped, so the two conditions
     * are checked together.
     */
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");

    const masking = await page.evaluate(() =>
      [
        document.documentElement,
        document.body,
        ...document.querySelectorAll<HTMLElement>("body *"),
      ]
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className:
            typeof el.className === "string" ? el.className.slice(0, 60) : "",
          overflowX: getComputedStyle(el).overflowX,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }))
        .filter(
          (entry) =>
            (entry.overflowX === "hidden" || entry.overflowX === "clip") &&
            entry.scrollWidth > entry.clientWidth + 1 &&
            // `sr-only` clips a 1px box on purpose; it is not masking page overflow.
            !entry.className.includes("sr-only"),
        ),
    );
    expect(
      masking,
      "an element is clipping real horizontal overflow instead of not overflowing",
    ).toEqual([]);
  });

  test("at 320px the nav wraps to two rows instead of clipping the toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");

    const brand = await page
      .getByRole("link", { name: "Ethan Caldwell" })
      .boundingBox();
    const toggle = await page
      .getByRole("button", { name: /^Theme:/ })
      .boundingBox();

    expect(brand).not.toBeNull();
    expect(toggle).not.toBeNull();
    // Wrapped, not compressed: the toggle sits on a row below the wordmark.
    expect(
      toggle!.y,
      "the nav did not wrap at 320px — the toggle is still on the brand row",
    ).toBeGreaterThan(brand!.y + brand!.height - 1);
    // And it is fully inside the viewport, not clipped at the right edge.
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(320);
    // Icon-only below `sm`, but still a real target.
    expect(toggle!.width).toBeGreaterThan(24);
    expect(toggle!.height).toBeGreaterThan(24);
  });
});

/**
 * Routes the enlarged-root-font overflow sweep below visits.
 *
 * WHY THIS LIST EXISTS SEPARATELY FROM `WIDTHS`. Defect 5.2-D1 (a site-wide WCAG 1.4.10
 * reflow failure in the shared `Nav`) was invisible for three phases because every prior
 * overflow sweep in this file ran only against `/` — the same header renders on every
 * route, but nothing had actually visited the other routes at a narrow width to check
 * it. Enumerating every real route here, rather than trusting "the header is shared so one
 * route stands in for all of them", is the fix for that class of gap, not just for the one
 * defect that exposed it. `/no-such-route` (the 404) is deliberately excluded: it is
 * covered by its own dedicated overflow test above, and it does not render `Nav`'s sibling
 * page content, so folding it into this loop would not add coverage, only runtime.
 */
const OVERFLOW_SWEEP_ROUTES = ["/", "/projects", "/about"] as const;

/**
 * Root font sizes the enlarged-text sweep checks, as CSS pixels. 16 is this project's
 * default (100%); 24 and 32 are the computed root sizes browsers use at 150% and 200%
 * text-only zoom, i.e. exactly the WCAG 1.4.4 (Resize Text) conformance target — 200% is
 * the number the success criterion names outright. Checking only the default size is what
 * let defect 5.2-D1 (27px of overflow at 24px, 161px at 32px, on every route) go
 * unmeasured through three phases: the `<ul>` in `Nav` fit at 16px root and only failed to
 * fit once its `rem`-based gaps and link text grew relative to a viewport that does not.
 */
const ENLARGED_ROOT_FONT_SIZES_PX = [16, 24, 32] as const;

/**
 * Viewport widths the enlarged-root-font sweep runs at, as CSS pixels.
 *
 * WHY BOTH, AND WHY THIS IS A FULL CROSS-PRODUCT. Until Phase 5.1's review this sweep
 * pinned one axis each way and therefore never tested its own worst case: the enlarged
 * sweep ran only at 375px, and the default-root `WIDTHS` sweep (320…1440) ran only at the
 * DEFAULT root size and only on `/`. The single nastiest cell — 320px viewport at a 32px
 * root, i.e. the narrowest supported phone at the 200% text size WCAG 1.4.4 names — was
 * consequently never exercised by either. The Nav defect that prompted this sweep measured
 * 161px of overflow at 375px/32px; 320px is strictly narrower and therefore strictly
 * worse, so a regression that only overflows below 375px at 200% text would have shipped
 * green.
 *
 * The two widths × 3 sizes × 3 routes = 18 tests per browser project, which is a full
 * cross-product of THIS sweep's axes rather than a sample — deliberately, because sampling
 * a matrix is exactly the mistake being corrected here, and 18 navigations are cheap.
 * What is NOT folded in is the wider end of `WIDTHS` (414…1440) at enlarged root sizes:
 * overflow from relative-unit growth is a narrow-viewport failure mode by construction
 * (the viewport is the fixed quantity the rem-based layout outgrows), so the extra 36
 * tests would buy runtime rather than coverage. If a wide-viewport enlarged-text defect is
 * ever found, that reasoning is wrong and this list should grow.
 */
const ENLARGED_SWEEP_WIDTHS_PX = [320, 375] as const;

/**
 * Forces the document's root font size for the remainder of the current navigation.
 *
 * @param page - Page to style; call AFTER `goto` (a same-document style tag persists
 *               across `addStyleTag` calls within one navigation, so calling this before
 *               `goto` would apply to whatever page loaded previously, not the one under
 *               test).
 * @param px - Root font size in CSS pixels. `!important` is required: several elements in
 *             this codebase set their own `font-size` via Tailwind utilities that resolve
 *             from the same `rem` base, and without `!important` the injected rule loses
 *             the cascade to any more-specific selector, silently testing the DEFAULT root
 *             size while appearing to test the enlarged one.
 * @returns Nothing. Side effects: injects a `<style>` element into the current document.
 *          Failure modes: none reachable — `addStyleTag` on a loaded document does not
 *          throw for a plain CSS string.
 *
 * WHY THIS AND NOT `page.emulateMedia` OR A BROWSER ZOOM API. Playwright has no first-class
 * "set root font size" primitive, and CSS pixel zoom (as opposed to text-only zoom) also
 * scales images and non-text layout, which is a different WCAG criterion (1.4.10 Reflow at
 * 320 CSS px, already covered by the `WIDTHS` sweep above) from what this sweep targets
 * (1.4.4 Resize Text, where only rem/em-based text and the layout that depends on it
 * should grow). Overriding `html`'s `font-size` directly is what real browsers' text-only
 * zoom setting does under the hood for a page built on relative units, which this site is
 * throughout — see the `rem`-vs-`px` note on `Nav.tsx`'s `<ul>` fix.
 */
async function forceRootFontSize(page: Page, px: number): Promise<void> {
  await page.addStyleTag({
    content: `html { font-size: ${px}px !important; }`,
  });
}

/**
 * Cells of the sweeps below that FAIL TODAY because of a real, unfixed product defect —
 * not because the assertion is wrong.
 *
 * When a real overflow defect is found and cannot be fixed in the same change, record its
 * route and widths here so the cell is marked `test.fixme` rather than loosening a
 * tolerance — a loosened tolerance hides the defect for good, a `fixme` stays visible in
 * every run's output. Delete the entry in the commit that fixes the defect and watch the
 * cell go green; if it does not, the fix is incomplete. Empty today: no known defects.
 */
const KNOWN_UNFIXED_OVERFLOW = {
  /** route → widths at which the BOX-level sweep fails at a 32px root. */
  boxes: {} as Record<string, number[]>,
  /** route → widths at which the TEXT-PAINT check fails at a 32px root. */
  text: {} as Record<string, number[]>,
};

test.describe("no horizontal overflow at an enlarged root font", () => {
  /**
   * The regression test for defect 5.2-D1.
   *
   * Deliberately checks BOTH signals `findOverflowingElements` and the document-level
   * `scrollWidth`/`clientWidth` comparison already used above, for the same reason the
   * default-size sweep checks both: a defect that only trips one of the two has shipped
   * from this file before. Swept over EVERY route in {@link OVERFLOW_SWEEP_ROUTES} at
   * EVERY size in {@link ENLARGED_ROOT_FONT_SIZES_PX} — 3 routes × 3 sizes, all 9
   * combinations exercised, because "the header is shared so one route proves it for all
   * of them" is the exact reasoning that let this defect ship in the first place.
   */
  for (const route of OVERFLOW_SWEEP_ROUTES) {
    for (const rootPx of ENLARGED_ROOT_FONT_SIZES_PX) {
      for (const width of ENLARGED_SWEEP_WIDTHS_PX) {
        test(`${route} does not overflow at a ${rootPx}px root font (${width}px viewport)`, async ({
          page,
        }) => {
          // See KNOWN_UNFIXED_OVERFLOW: a real, measured, unfixed product defect — the
          // assertion below is correct and this cell is pending a fix, not a fix here.
          if (
            rootPx === 32 &&
            KNOWN_UNFIXED_OVERFLOW.boxes[route]?.includes(width)
          ) {
            test.fixme(
              true,
              `known unfixed: ${route} scrolls horizontally at ${width}px / 32px root ` +
                "(see KNOWN_UNFIXED_OVERFLOW)",
            );
          }
          await page.setViewportSize({ width, height: 900 });
          await page.goto(route);
          await forceRootFontSize(page, rootPx);

          const metrics = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          const offenders = await findOverflowingElements(page);

          expect(
            offenders,
            `elements extend past the viewport on ${route} at a ${rootPx}px root font, ${width}px viewport`,
          ).toEqual([]);
          expect(
            metrics.scrollWidth,
            `${route} scrolls horizontally at a ${rootPx}px root font, ${width}px viewport (${metrics.scrollWidth - metrics.clientWidth}px of overflow)`,
          ).toBeLessThanOrEqual(metrics.clientWidth);
        });
      }
    }
  }

  /**
   * A second, narrower check for a failure mode {@link findOverflowingElements} CANNOT
   * see: an element whose own box is correctly sized but whose text PAINTS past the edge
   * of the box that was supposed to wrap it — an email address, a URL, or any long word
   * with no break opportunity in it.
   *
   * WHY `getBoundingClientRect` ON THE ELEMENT MISSES THIS. It reports the laid-out box,
   * which a flex or grid container can size independently of its content when the layout
   * lets it shrink-to-fit rather than stretch — exactly what happened to the contact
   * section's email address (fixed in `app/page.tsx`; that section's `items-start` flex
   * container does not stretch its children to a shared width, so the `<p>` sized itself
   * to its own unbreakable content and neither its own box NOR any ancestor's reported an
   * overflow, even though real pixels painted outside the viewport).
   *
   * HOW IT IS MEASURED, AND THE TRAP THE FIRST VERSION FELL INTO: see the long comment on
   * {@link findTextPaintingOutsideItsBlock}. Short version — `scrollWidth` is 0 on an
   * inline box, so the original `scrollWidth - offsetWidth` formula went NEGATIVE for
   * exactly the `<span>` this test was written for and could never fire. Text geometry is
   * now read from a `Range`, which is defined for inline content, and compared against the
   * content edge of the nearest block-level container.
   *
   * Both mechanisms are asserted, on every route, at BOTH sweep widths and at 200% text:
   * the Range-vs-block-container comparison (catches inline text) and the
   * `scrollWidth`-vs-`offsetWidth` comparison restricted to real non-inline boxes
   * (catches a block whose content is wider than itself). They are separate assertions so
   * a failure says which one fired.
   */
  for (const route of OVERFLOW_SWEEP_ROUTES) {
    for (const width of ENLARGED_SWEEP_WIDTHS_PX) {
      test(`${route} paints no text outside its box at 200% text size (${width}px viewport)`, async ({
        page,
      }) => {
        // See KNOWN_UNFIXED_OVERFLOW.
        if (KNOWN_UNFIXED_OVERFLOW.text[route]?.includes(width)) {
          test.fixme(
            true,
            `known unfixed: text paints outside its column on ${route} at ${width}px / ` +
              "32px root (see KNOWN_UNFIXED_OVERFLOW)",
          );
        }
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await forceRootFontSize(page, 32);

        expect(
          await findTextPaintingOutsideItsBlock(page),
          `text paints outside its block container on ${route} at a 32px root font, ${width}px viewport`,
        ).toEqual([]);
        expect(
          await findBoxesWithOverflowingContent(page),
          `an element's content is wider than its own box on ${route} at a 32px root font, ${width}px viewport`,
        ).toEqual([]);
      });
    }
  }
});

test.describe("shared left edge", () => {
  /**
   * Above `--container-page` the two max-widths stop growing, which is precisely where
   * an unnested `max-w-measure mx-auto` would visibly drift right of the nav. Below it,
   * both fill the viewport and the bug is invisible — which is why it survived review.
   */
  for (const width of [1024, PAGE_CONTAINER_PX, 1200, 1440, 1920]) {
    test(`nav, h1, and footer share a left edge at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const edges = await page.evaluate(() => {
        const left = (selector: string) => {
          const el = document.querySelector(selector);
          return el ? Math.round(el.getBoundingClientRect().left) : null;
        };
        return {
          brand: left("header a"),
          heading: left("main h1"),
          footerText: left("footer p"),
        };
      });

      expect(edges.brand, "no nav wordmark found").not.toBeNull();
      expect(edges.heading, "no h1 found in main").not.toBeNull();
      expect(edges.footerText, "no footer paragraph found").not.toBeNull();

      expect(
        edges.heading,
        `h1 left edge ${edges.heading}px vs nav ${edges.brand}px at ${width}px — the ` +
          "measure column is not nested inside the page container (see the " +
          "layout-widths note in app/globals.css)",
      ).toBe(edges.brand);
      expect(
        edges.footerText,
        `footer left edge ${edges.footerText}px vs nav ${edges.brand}px at ${width}px`,
      ).toBe(edges.brand);
    });
  }

  test("the 404 page's prose aligns to the nav too", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/no-such-route");

    const edges = await page.evaluate(() => ({
      brand: Math.round(
        document.querySelector("header a")!.getBoundingClientRect().left,
      ),
      heading: Math.round(
        document.querySelector("main h1")!.getBoundingClientRect().left,
      ),
    }));
    expect(edges.heading).toBe(edges.brand);
  });

  test("the page container caps at 68rem and stays centred", async ({
    page,
  }) => {
    // Confirms the measured alignment above is the *intended* geometry rather than a
    // coincidence of a container that never stops growing.
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/");

    const container = await page.evaluate(() => {
      const el = document.querySelector("header > div")!;
      const rect = el.getBoundingClientRect();
      return { width: Math.round(rect.width), left: Math.round(rect.left) };
    });
    expect(container.width).toBe(PAGE_CONTAINER_PX);
    expect(container.left).toBe((1920 - PAGE_CONTAINER_PX) / 2);
  });
});

test.describe("canvas coverage", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`in ${theme} theme the canvas covers a tall viewport with short content`, async ({
      page,
    }) => {
      /**
       * The classic `min-h-screen`-on-the-wrong-element bug: a short page leaving an
       * unstyled white band under the footer, visible only in dark theme and only on a
       * real paint. Read as pixels, not classes.
       *
       * An earlier draft asserted the footer ended ABOVE the viewport bottom and then
       * sampled below it. That guard was inverted and failed on correct behaviour:
       * `<html class="h-full">` + `body.min-h-full` + `main.flex-1` make the shell fill
       * the viewport exactly, so the footer's box bottom IS the viewport bottom (1600px
       * measured, on a 1600px viewport) and there is no "below the footer" to sample.
       * That is the passing state. What matters is therefore asserted directly: the
       * shell fills the viewport, and the last row of pixels is the themed canvas.
       */
      await forceTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 1600 });
      /**
       * ROUTE CHANGED IN PHASE 3.1, PREMISE UNCHANGED. This test needs a page whose
       * content is SHORTER than the viewport — that is the only situation in which the
       * bug it guards (an unstyled band under the footer) can appear at all. `/` was that
       * page while it was a scaffold placeholder; the real landing page is taller than
       * 1600px, which makes it useless as a subject here rather than making the shell
       * wrong. The custom 404 renders through the same root layout and is genuinely
       * short, so it is now the subject. No assertion below was relaxed.
       */
      await page.goto("/no-such-route");

      const geometry = await page.evaluate(() => ({
        footerBottom: Math.round(
          document.querySelector("footer")!.getBoundingClientRect().bottom,
        ),
        bodyHeight: Math.round(document.body.getBoundingClientRect().height),
        viewport: window.innerHeight,
        documentScrolls:
          document.documentElement.scrollHeight > window.innerHeight,
      }));

      expect(
        geometry.bodyHeight,
        "the shell does not fill a tall viewport, so an unstyled band is possible",
      ).toBeGreaterThanOrEqual(geometry.viewport);
      expect(
        geometry.documentScrolls,
        "the 404 page should not scroll at 1600px tall — content grew or the " +
          "shell is over-tall, and this test's premise no longer holds",
      ).toBe(false);
      expect(geometry.footerBottom).toBeGreaterThanOrEqual(geometry.viewport);

      // Pixels: the bottom-left corner and the mid-left edge must both be the canvas.
      for (const y of [1600 - 4, 1200]) {
        const shot = await page.screenshot({
          clip: { x: 0, y, width: 4, height: 4 },
          animations: "disabled",
        });
        const pixel = topLeftPixel(shot);
        expect(
          pixel,
          `pixel at y=${y} in ${theme} theme is rgb(${pixel.r}, ${pixel.g}, ${pixel.b}), ` +
            `not the ${theme} canvas — an unstyled band is painting`,
        ).toEqual(CANVAS[theme]);
      }
    });
  }

  test("html carries a per-theme color-scheme so browser UI matches", async ({
    page,
  }) => {
    // `color-scheme` is what keeps scrollbars, form controls, and over-scroll gutters
    // from painting light against a dark page. The rubber-band check itself stays
    // manual (it needs a real trackpad); this asserts the property that fixes it.
    await forceTheme(page, "dark");
    await page.goto("/");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    ).toBe("dark");
  });
});

test.describe("zoom and fluid type", () => {
  test("200% zoom reflows without introducing horizontal scroll", async ({
    page,
  }) => {
    /**
     * Modelled by HALVING the CSS-pixel viewport (1280x800 at 200% zoom presents the
     * same 640x400 CSS-pixel viewport to layout). That equivalence is exact for reflow,
     * which is what WCAG 1.4.10 is about and what can actually break here. It is not
     * a test of the browser's own zoom rasterisation — Playwright cannot drive real
     * browser zoom on both engines — so raster artefacts at zoom remain a human check.
     */
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto("/");

    expect(await findOverflowingElements(page)).toEqual([]);

    // Content must still be reachable and readable, not collapsed to nothing.
    await expect(
      page.getByRole("heading", { level: 1, name: SITE.name }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Theme:/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  });

  test("the --text-2xl clamp sits on its floor at 320px and its ceiling at 1440px", async ({
    page,
  }) => {
    // clamp(2rem, 1.4rem + 2.4vw, 2.75rem): 30.08px computed at 320px so the 32px floor
    // holds; 56.96px at 1440px so the 44px ceiling holds. A clamp with a vw term is
    // worth measuring rather than trusting.
    const heading = page.getByRole("heading", { level: 1 });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "32px",
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "44px",
    );

    // And mid-range it is genuinely between the two, i.e. the vw term is live.
    await page.setViewportSize({ width: 800, height: 900 });
    const mid = parseFloat(
      await heading.evaluate((el) => getComputedStyle(el).fontSize),
    );
    expect(mid).toBeGreaterThan(32);
    expect(mid).toBeLessThan(44);
  });

  test("h1 is the same size on / and on the 404 at the same width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/");
    const home = await page
      .getByRole("heading", { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontSize);

    await page.goto("/no-such-route");
    const notFound = await page
      .getByRole("heading", { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontSize);

    expect(notFound, "the two pages' h1 sizes have drifted apart").toBe(home);
  });

  test("there is exactly one h1 and exactly one main landmark", async ({
    page,
  }) => {
    for (const path of ["/", "/no-such-route"]) {
      await page.goto(path);
      expect(
        await page.locator("h1").count(),
        `${path} does not have exactly one h1`,
      ).toBe(1);
      expect(
        await page.locator("main").count(),
        `${path} does not have exactly one main`,
      ).toBe(1);
    }
  });
});

/**
 * ===========================================================================
 * Phase 5.3 regression coverage — two defects that shipped through a green suite.
 * ===========================================================================
 *
 * Both were found by a human-directed audit, not by this file, and both are geometric
 * properties that no existing assertion here could express. They are grouped at the end
 * rather than folded into the sweeps above because each needs a specific state the sweeps
 * do not set up: the theme label needs all THREE toggle states, and the nav overlap needs
 * a WRAPPED nav (320px at an enlarged root font). See `e2e/support/chrome-geometry.ts` for
 * the measurement details and the two traps involved.
 */

/**
 * The three theme preferences in cycle order, with the label each renders.
 *
 * Enumerated rather than sampled, deliberately. Only "System" was affected by defect
 * 5.3-D1 ("Light" is 31.9px and "Dark" 30.7px in a box that was 48px; "System" is 48.0px —
 * an exact fit with zero slack), but this repo has already shipped a defect that survived
 * because an assertion covered two of eight states. A future label change could put any of
 * the three over the box, so all three are asserted. The cycle is System → Light → Dark,
 * and the toggle starts on System in a fresh context — the source of truth for state is
 * `<html data-theme>` (absent = System), matching `e2e/theme-system.spec.ts`.
 */
const THEME_STATES = [
  { attribute: null, label: "System" },
  { attribute: "light", label: "Light" },
  { attribute: "dark", label: "Dark" },
] as const;

test.describe("theme toggle label geometry", () => {
  /**
   * Regression test for defect 5.3-D1.
   *
   * THE PROPERTY: the toggle's visible label occupies exactly one line, in every theme
   * state. Measured at 1024px because the label is `hidden sm:inline` — below 640px there
   * is no label to break, so the defect only exists at >= 640px, where it affected every
   * visitor.
   *
   * WHAT WENT WRONG AND WHY NOTHING CAUGHT IT: the label box was `w-12` (48px) and "System"
   * at `text-sm` in Geist measures 48.0px. Zero slack, harmless — until this phase added a
   * site-wide `overflow-wrap: break-word` to `body`, which turned the exact fit into a
   * mid-word break. The pill read "Syste / m", the label went 21px → 42px and the button
   * 44px → 56px, breaking its alignment with the nav, identically in Chromium and WebKit.
   * The document did not scroll, no text painted outside any box, and axe-core was clean
   * (it is not an accessibility violation), so every detector this file already had was
   * structurally blind to it.
   *
   * Both symptoms are asserted, not just one: the line count (the cause) and the button
   * height (the consequence that was actually visible). A future regression that broke the
   * label without growing the button, or grew the button for some other reason, should each
   * fail with a message naming which.
   */
  for (const [index, state] of THEME_STATES.entries()) {
    test(`the "${state.label}" label stays on one line and the pill stays 44px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto("/");

      const toggle = page.getByRole("button", { name: /^Theme:/ });
      // Cycle into the state under test. Index 0 is System, which a fresh context is
      // already in, so it costs zero clicks. Driving the store through real clicks rather
      // than writing `data-theme` directly is deliberate: `lib/useTheme.ts` uses
      // `useSyncExternalStore` with the attribute as its source of truth, so a direct
      // attribute write would change the CSS without changing the React-rendered LABEL —
      // and the label is the thing under test.
      for (let i = 0; i < index; i++) await toggle.click();

      // Guard: prove we are measuring the state we think we are before asserting anything
      // about it. Without this, a broken cycle would silently measure "System" three times
      // and the test would pass while covering one state — the exact failure this
      // enumeration exists to prevent.
      // The label is the React-rendered half of the state, and it settles asynchronously
      // after the click; awaiting it here is what makes the attribute read below race-free.
      const label = page.locator("header button span[aria-hidden='true']");
      await expect(label).toHaveText(state.label);
      // `<html data-theme>` is the store's source of truth (absent = System). Read as a
      // plain attribute so "absent" is expressible as `null` — `toHaveAttribute` cannot
      // assert absence.
      expect(
        await page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        ),
        `the toggle is not in the ${state.label} state after ${index} click(s)`,
      ).toBe(state.attribute);

      const metrics = await label.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const parsed = Number.parseFloat(style.lineHeight);
        return {
          height: (el as HTMLElement).offsetHeight,
          // `line-height: normal` does not resolve to a px value in every engine. Falling
          // back to the font size × 1.5 keeps the assertion meaningful rather than NaN —
          // an unusable threshold is worse than an approximate one.
          lineHeight: Number.isFinite(parsed)
            ? parsed
            : Number.parseFloat(style.fontSize) * 1.5,
        };
      });

      expect(
        metrics.height,
        `the "${state.label}" label wrapped to more than one line ` +
          `(${metrics.height}px tall against a ${metrics.lineHeight}px line-height) — ` +
          "its fixed-width box is too narrow and body's overflow-wrap:break-word split the word",
      ).toBeLessThanOrEqual(metrics.lineHeight + 1);

      // The visible consequence: the pill must stay on its 44px floor, aligned with the
      // nav. 56px was what the two-line label produced. A small upper tolerance, because
      // `min-h-11` is a floor and sub-pixel/font differences between engines are real.
      const box = await page
        .getByRole("button", { name: /^Theme:/ })
        .boundingBox();
      expect(box).not.toBeNull();
      expect(
        box!.height,
        `the theme pill grew to ${box!.height}px in the ${state.label} state — ` +
          "it should stay at its 44px floor and aligned with the nav",
      ).toBeLessThan(48);
    });
  }

  /**
   * The GENERAL guard for the same hazard, and the more valuable of the two.
   *
   * WHY IT IS WORTH HAVING ALONGSIDE THE SPECIFIC ONE: the underlying hazard is not about
   * this label. A site-wide `overflow-wrap: break-word` means ANY fixed-width box holding
   * text in the chrome is now capable of breaking mid-word, and the failure is silent in
   * every existing detector. This asserts the class — no unbreakable word in the header or
   * footer is split across lines — so the NEXT fixed-width label, in any state, is covered
   * the day it is added rather than after an audit finds it.
   *
   * Swept across all three theme states and at 640px (the breakpoint where the label first
   * appears — the tightest width at which it is under test) as well as 1024px.
   */
  for (const width of [640, 1024]) {
    test(`no word in the site chrome breaks mid-word at ${width}px, in any theme state`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const toggle = page.getByRole("button", { name: /^Theme:/ });

      for (const state of THEME_STATES) {
        await expect(
          page.locator("header button span[aria-hidden='true']"),
        ).toHaveText(state.label);

        expect(
          await findMidWordBreaks(page),
          `a word in the site chrome was split across lines in the ${state.label} theme ` +
            `state at ${width}px — a fixed-width box is too narrow for its text and ` +
            "body's overflow-wrap:break-word broke the word rather than overflowing",
        ).toEqual([]);

        // Advance to the next state. After the third iteration this returns to System,
        // leaving the page as it was found.
        await toggle.click();
      }
    });
  }
});

test.describe("nav link hit areas", () => {
  /**
   * Regression test for defect 5.3-D2.
   *
   * THE PROPERTY: no two nav links' hit areas overlap. This is PAIRWISE — it is a
   * relationship between two elements, not a fact about either one. Every per-element
   * assertion in this suite passed while the defect was live, and always would: each link
   * was individually fine.
   *
   * WHERE IT IS CHECKED, AND WHY ONLY THERE: rows can only overlap where rows exist, and
   * the nav is a single row until it wraps. 320px at a 24/32px root font is where that
   * happens, which is why this reuses {@link ENLARGED_SWEEP_WIDTHS_PX} and
   * {@link ENLARGED_ROOT_FONT_SIZES_PX} rather than the default-root `WIDTHS` sweep. The
   * 16px root cells are still run: they are cheap, and a future change that wraps the nav
   * at the default size must not reintroduce the overlap either.
   *
   * THE TRAP, stated here as well as in the detector because it is the whole defect:
   * vertical padding on a `display: inline` box does not contribute to line-box height. It
   * paints — and receives clicks — OUTSIDE the line. `next/link` renders a bare `<a>`, so
   * `py-3` alone made the target 84px tall with 26px of clickable area shared between
   * adjacent rows, while document overflow stayed 0px and nothing on screen showed it.
   * `inline-block` is the fix and is load-bearing, not cosmetic.
   */
  for (const rootPx of ENLARGED_ROOT_FONT_SIZES_PX) {
    for (const width of ENLARGED_SWEEP_WIDTHS_PX) {
      test(`no two nav links overlap at ${width}px / ${rootPx}px root font`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await forceRootFontSize(page, rootPx);

        const links = page.locator("header nav a");
        // Guard against the test quietly measuring nothing: if the selector ever stops
        // matching (a markup change), an empty set trivially has no overlapping pairs and
        // this would pass forever while covering nothing.
        expect(
          await links.count(),
          "no nav links matched — this test would pass vacuously",
        ).toBeGreaterThan(1);

        expect(
          await findOverlappingTargets(page, "header nav a"),
          `two nav links share clickable area at ${width}px / ${rootPx}px root font. ` +
            "If padding was just added to the link, check it is not on a display:inline " +
            "box — vertical padding there paints outside the line box and overlaps the " +
            "adjacent row (see components/NavLink.tsx and support/chrome-geometry.ts)",
        ).toEqual([]);
      });
    }
  }

  /**
   * A precondition check, not a product assertion: it proves the cell above actually
   * exercises the multi-row case. If the nav ever stops wrapping at 320px/32px — a layout
   * change that is not itself a defect — the overlap test silently degrades to a
   * single-row check that can never fail, and this test is the alarm for that. It asserts
   * the TEST'S validity, so it deliberately fails loudly rather than being folded into the
   * assertion above with a skip.
   */
  test("the nav does wrap to multiple rows at 320px / 32px root (validity of the overlap check)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await forceRootFontSize(page, 32);

    const tops = await page
      .locator("header nav a")
      .evaluateAll((els) =>
        Array.from(
          new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))),
        ),
      );

    expect(
      tops.length,
      "the nav no longer wraps at 320px / 32px root, so the overlap test above is now " +
        "checking a single row and cannot detect the row-overlap defect it exists for",
    ).toBeGreaterThan(1);
  });
});
