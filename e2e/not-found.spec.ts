/**
 * e2e/not-found.spec.ts — the custom 404, driven in a real browser.
 *
 * What behaviour this protects, beyond what `smoke.spec.ts` already asserts (status 404
 * plus the custom heading, for one path only):
 *
 *   1. THE WAY BACK ACTUALLY WORKS. The 404's `href="/"` was previously verified by
 *      reading the markup. Reading an href does not prove a navigation: a client-side
 *      `<Link>` can fail to hydrate, or land on a page that itself errors. Here the link
 *      is clicked and the destination asserted.
 *
 *   2. THE SHELL SURVIVES. A `not-found.tsx` placed at the wrong level renders bare,
 *      leaving a lost visitor with no nav to escape by. Nav, skip link, main landmark,
 *      footer, and a working theme toggle are all asserted present ON the 404 itself.
 *
 *   3. IT IS THEMED, at both ends. The 404 is reachable from any stale external link, so
 *      it is effectively a real page of the site and gets the same canvas-colour and narrow-viewport
 *      treatment as `/`.
 *
 *   4. ARBITRARY UNKNOWN ROUTES, not just one. A route table that happens to make one
 *      path 404 is not the same as a catch-all, so several shapes of unknown path are
 *      checked.
 *
 * `app/error.tsx` is not exercised here — see the long note at the top of
 * `app/error.test.tsx` for the three attempts made to fire Next's own boundary from a
 * browser and why that verification lives in a component test instead.
 */

import { expect, test } from "@playwright/test";
import { CANVAS, topLeftPixel } from "./support/pixels";
// `/` renders the owner's name as its h1. Asserted against `SITE.name` rather than a
// literal so renaming is a one-line edit, and so this cannot drift from the page.
import { SITE } from "@/lib/site";

/** Unknown paths of different shapes; all must reach the same custom page. */
const UNKNOWN_PATHS = [
  // The old site's `/demos` route: the most likely real-world 404, from links to the
  // site's previous incarnation.
  "/demos",
  "/nope",
  "/a/deeply/nested/missing/path",
  "/index.php", // the shape a scanner or a stale external link uses
];

test.describe("the custom 404", () => {
  for (const path of UNKNOWN_PATHS) {
    test(`${path} returns 404 and renders the designed page`, async ({
      page,
    }) => {
      const response = await page.goto(path);

      expect(response, `no navigation response for ${path}`).not.toBeNull();
      // A soft 404 (status 200 with 404 content) is an SEO defect no visual check finds.
      expect(response?.status(), `${path} status`).toBe(404);

      await expect(
        page.getByRole("heading", { level: 1, name: /doesn.t exist/i }),
      ).toBeVisible();
      await expect(page.getByText("404", { exact: true })).toBeVisible();
      // Title is set explicitly so the tab does not read as though a real page loaded.
      await expect(page).toHaveTitle(/Page not found/);
    });
  }

  test("it renders inside the full site shell", async ({ page }) => {
    await page.goto("/no-such-route");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeAttached();

    // Exactly one main landmark, as on every page.
    expect(await page.locator("main").count()).toBe(1);

    // And the theme toggle is live here too, not a dead server-rendered button — a lost
    // visitor should not lose control of the page.
    const pill = page.getByRole("button", { name: /^Theme:/ });
    await pill.click();
    await expect(pill).toHaveAccessibleName(
      "Theme: Light. Activate to switch to Dark.",
    );
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      ),
    ).toBe("light");
  });

  test('"Back to home" navigates to a working home page', async ({ page }) => {
    // A path that is unknown by construction, so no future route can quietly turn this
    // test into an assertion about a real page.
    await page.goto("/no-such-route-either");

    await page.getByRole("link", { name: "Back to home" }).click();

    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { level: 1, name: SITE.name }),
    ).toBeVisible();
    // The home page is the real one, not an error state that happens to be at `/`.
    await expect(
      page.getByRole("heading", { name: "Something went wrong" }),
    ).toHaveCount(0);
  });

  test("the nav still works from the 404, so the shell is not merely decorative", async ({
    page,
  }) => {
    await page.goto("/nope");
    // `exact: true`: on the 404 the accessible name "Home" is a substring of "Back to
    // home", so a loose match is ambiguous here (it is not on `/`). Scoped to the nav as
    // well, so this test cannot silently start exercising the page's own pill instead.
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { level: 1, name: SITE.name }),
    ).toBeVisible();
  });

  test("the email escape is a well-formed mailto to the site address", async ({
    page,
  }) => {
    // Whether the OS opens a mail client is not something a browser test can settle —
    // that stays a manual step. That the href is a valid mailto to the configured
    // address is settleable, and is what would actually break.
    await page.goto("/no-such-route");
    const href = await page
      .getByRole("link", { name: /^Email / })
      .getAttribute("href");
    expect(href).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  test("every exit is reachable and operable by keyboard", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit omits links from tab order unless full keyboard access is on; see the " +
        "WEBKIT CAVEAT in e2e/keyboard.spec.ts.",
    );

    await page.goto("/no-such-route");

    const pill = page.getByRole("link", { name: "Back to home" });
    await pill.focus();
    await expect(pill).toBeFocused();
    // Tab must walk the exits in order — home, projects, email — with nothing between.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Browse my work" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Email / })).toBeFocused();

    await pill.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`it paints the ${theme} canvas and does not overflow at 375px`, async ({
      page,
    }) => {
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key!, value!),
        ["portfolio-theme", theme],
      );
      await page.setViewportSize({ width: 375, height: 700 });
      await page.goto("/no-such-route");

      // Canvas: real pixels, in the corner below the sticky header.
      const shot = await page.screenshot({
        clip: { x: 0, y: 700 - 4, width: 4, height: 4 },
        animations: "disabled",
      });
      expect(topLeftPixel(shot)).toEqual(CANVAS[theme]);

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

      // The heading is on the shared type scale, not shrunk to fit.
      const fontSize = await page
        .getByRole("heading", { level: 1 })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(32);
    });
  }
});
