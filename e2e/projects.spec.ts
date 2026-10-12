/**
 * e2e/projects.spec.ts — the `/projects` route and its technology filter, in a real browser.
 *
 * What behaviour this protects:
 *
 *   1. FILTERING IS URL STATE. Clicking a chip changes `?tag=`, narrows the list, and marks
 *      the chip active; the filtered URL loaded directly renders the same view; Back
 *      returns to the unfiltered list. This is the whole contract of
 *      `lib/project-filter.ts`, which unit tests can only check in isolation.
 *
 *   2. ONE CURRENT PAGE. The nav's Projects link carries `aria-current="page"` and the
 *      active chip carries `aria-current="true"`. Exactly one element may claim "page",
 *      asserted document-wide (see `scripts/e2e-conventions.test.ts` for why scoped
 *      counts are forbidden).
 *
 *   3. BAD INPUT DEGRADES. An unknown `?tag=` shows the full list with "All" active rather
 *      than an empty page.
 *
 * Counts are derived from `PROJECTS` rather than hard-coded so content edits don't break
 * the suite; the behaviour, not the data, is under test.
 */

import { expect, test } from "@playwright/test";
import { ALL_TAGS, PROJECTS } from "@/lib/projects";

/** A tag used by some but not all projects, so filtering visibly narrows the list. */
const NARROWING_TAG = ALL_TAGS.find((tag) => {
  const n = PROJECTS.filter((p) => p.tech.includes(tag)).length;
  return n > 0 && n < PROJECTS.length;
});

/** Number of projects using {@link NARROWING_TAG}. */
const NARROWED_COUNT = PROJECTS.filter((p) =>
  NARROWING_TAG === undefined ? false : p.tech.includes(NARROWING_TAG),
).length;

test.describe("/projects", () => {
  test("lists every project and marks the nav link current", async ({
    page,
  }) => {
    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(PROJECTS.length);

    // Document-wide, not nav-scoped: exactly one element claims to be the current page.
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('[aria-current="page"]')).toHaveText("Projects");
    await expect(page.locator('[aria-current="true"]')).toHaveText("All");
  });

  test("a chip filters the list via the URL, and Back restores it", async ({
    page,
  }) => {
    test.skip(
      NARROWING_TAG === undefined,
      "every tag is used by every project; nothing can narrow",
    );
    const tag = NARROWING_TAG!;

    await page.goto("/projects");
    await page
      .getByRole("navigation", { name: "Filter projects by technology" })
      .getByRole("link", { name: tag, exact: true })
      .click();

    await expect(page).toHaveURL((url) => url.searchParams.get("tag") === tag);
    await expect(page.getByRole("article")).toHaveCount(NARROWED_COUNT);
    await expect(page.locator('[aria-current="true"]')).toHaveText(tag);
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL((url) => !url.searchParams.has("tag"));
    await expect(page.getByRole("article")).toHaveCount(PROJECTS.length);
  });

  test("a filtered URL loaded directly renders the filtered view", async ({
    page,
  }) => {
    test.skip(NARROWING_TAG === undefined, "no narrowing tag");
    await page.goto(`/projects?tag=${encodeURIComponent(NARROWING_TAG!)}`);
    await expect(page.getByRole("article")).toHaveCount(NARROWED_COUNT);
  });

  test("an unknown tag falls back to the full list with All active", async ({
    page,
  }) => {
    const response = await page.goto("/projects?tag=not-a-real-technology");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("article")).toHaveCount(PROJECTS.length);
    await expect(page.locator('[aria-current="true"]')).toHaveText("All");
  });
});

test.describe("/about", () => {
  test("renders the headshot at its reserved size and one h1", async ({
    page,
  }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const img = page.getByRole("img");
    await expect(img).toBeVisible();
    // The image actually decoded (a broken src renders a 0-width natural size).
    expect(
      await img.evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
  });
});
