/**
 * e2e/smoke.spec.ts — the harness's own proof of life.
 *
 * What behaviour this protects, and why it is worth protecting:
 *
 *   1. THE APP BOOTS AND SERVES A REAL PAGE. Everything else in this directory is
 *      worthless if `webServer` cannot build and start the site, so the cheapest useful
 *      assertion is "`/` responded 200 and rendered". If this file fails, the problem is
 *      almost never the assertion — it is the build, the port, or the browser install.
 *
 *   2. THE TITLE IS NOT THE SCAFFOLD DEFAULT. `"Create Next App"` is what `next build`
 *      emits when nobody has set `metadata.title`, and it is the single most common
 *      thing to ship by accident. It costs nothing to detect and looks unprofessional to
 *      anyone who bookmarks the page or shares the tab. Asserted as a
 *      negative rather than against an exact string on purpose: the real title is
 *      copy that will legitimately be rewritten, and a test that
 *      breaks on every copy edit gets deleted. The scaffold default never becomes
 *      correct, so only that is forbidden.
 *
 *   3. THE CUSTOM 404 IS WIRED UP, STATUS AND ALL. Stale external links are how real
 *      visitors reach it. Two separate things must hold and they fail independently: the HTTP status must
 *      be 404 (a soft 404 returning 200 is an SEO defect that no visual check catches),
 *      and `app/not-found.tsx`'s own content must be what renders (a framework fallback
 *      would also be a 404 but would look like a crash).
 *
 * SCOPE — deliberately minimal. This is harness verification only. The full verification suite (flash of the wrong theme before paint, focus-ring behaviour, the
 * error boundary firing, breakpoint layout) lives in sibling spec files. Do not grow this file into that suite; add siblings instead.
 *
 * Runs against every project in `playwright.config.ts` (Chromium and WebKit).
 */

import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("the home page loads and does not ship the scaffold title", async ({
    page,
  }) => {
    const response = await page.goto("/");

    // `goto` returns null only for non-navigation requests; a real load always resolves.
    expect(response, "no navigation response for /").not.toBeNull();
    expect(response?.status()).toBe(200);

    // The scaffold default must never be what a visitor sees. See point 2 above.
    await expect(page).not.toHaveTitle("Create Next App");

    // And the title must be non-empty — an empty <title> would also "not be"
    // "Create Next App" while being just as broken.
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);

    // REGRESSION: the root title must NAME the site's owner. A role-only title ("Software
    // Developer") passes both assertions above while naming nobody, and the root title is
    // what a shared link previews as.
    //
    // The cause is a Next subtlety worth pinning rather than re-deriving: the root layout's
    // `title.template` applies to CHILD segments only, not to the segment that defines it.
    // `/projects` is a child and renders "Projects — Ethan Caldwell"; `app/page.tsx` is not,
    // so it must supply the full title itself.
    // Hard-coded rather than imported from `@/lib/site`: importing the module under test would make this assert only that
    // the page agrees with itself, and this name changing is precisely the event that should
    // require a human to look at this assertion.
    expect(title).toContain("Ethan Caldwell");
  });

  test("an unknown route returns a real 404 rendering the custom page", async ({
    page,
  }) => {
    // A path that is unknown by construction, so no future route can turn this into an
    // assertion about a real page.
    const response = await page.goto("/no-such-page");

    expect(response, "no navigation response for /no-such-page").not.toBeNull();
    // Status and content are asserted separately: a soft 404 (status 200) is invisible
    // to the eye and to every other gate in this repo.
    expect(response?.status()).toBe(404);

    // Content check: the custom page's own heading, not a framework fallback. Matched by
    // role with a loose regex so it survives copy-level restyling but still proves
    // `app/not-found.tsx` is the file that rendered (Next's built-in 404 renders a plain
    // "404 | This page could not be found." with different wording and no <h1> of ours).
    // The regex tolerates the typographic apostrophe in "doesn’t".
    await expect(
      page.getByRole("heading", { level: 1, name: /doesn.t exist/i }),
    ).toBeVisible();

    // The "404" eyebrow above the heading is part of the custom page too.
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
});
