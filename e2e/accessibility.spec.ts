/**
 * e2e/accessibility.spec.ts — the automated WCAG gate.
 *
 * Owns: running axe-core against every rendered surface of the site, in both themes and
 * at both ends of the supported viewport range, so that a regression which introduces a
 * machine-detectable WCAG failure turns CI red instead of being found by a human looking
 * at screenshots.
 *
 * WHY THIS FILE EXISTS. During the Phase 5 audit an axe run was reported as "zero
 * violations across three routes and the 404, both themes, 320 and 1440". That run was
 * real, but it was performed by injecting axe into an ad-hoc browser session — axe was
 * not a dependency of this repo and nothing re-ran it. A one-off clean result protects
 * nothing; the next commit could reintroduce a violation and no gate would notice. This
 * file exists to make that zero DURABLE. It is PLANNING.md 6.1.2, pulled forward from
 * Phase 6 because Phase 5 proved the gap was live.
 *
 * ────────────────────────────────────────────────────────────────────────────────────
 * RULESET SCOPE, and why it is exactly this.
 *
 * {@link WCAG_TAGS} is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` — the rules axe maps
 * onto WCAG 2.1 Level A and AA success criteria, which is this project's conformance
 * target. Nothing else is enabled. In particular:
 *
 *   - `best-practice` is DELIBERATELY OFF. Those rules encode reasonable habits
 *     (e.g. "region": all content inside a landmark) that are NOT success criteria.
 *     Turning them on here would mean a red CI run could not be read as "a WCAG failure
 *     shipped", which is the whole value of the gate. A preference and a conformance
 *     failure are different things and this project has been explicit that they must not
 *     be blurred. If a best-practice rule is judged worth enforcing, add it as its own
 *     named check with its own rationale — do not widen this tag set.
 *   - `wcag22aa` is off. The 2.2 additions (notably `target-size`) are not the stated
 *     target, and the touch-target sizes this project does care about are already
 *     measured directly in `e2e/layout.spec.ts` / `support/chrome-geometry.ts`, at a
 *     threshold chosen by this project rather than by axe.
 *   - `experimental` is off: unstable rule IDs make for a flaky gate.
 *
 * ────────────────────────────────────────────────────────────────────────────────────
 * WHAT AXE CANNOT CATCH. A green run here is NOT an accessibility guarantee.
 *
 * Automated tooling detects roughly a third of real accessibility defects, and the third
 * it detects is the mechanical third. Everything below is out of reach of this file and
 * stays with a human — the `QA/` checklists draw the same line:
 *
 *   - Whether an accessible name is CORRECT. axe can prove a button has a name; it
 *     cannot tell that the name describes the wrong action.
 *   - Actual screen-reader output: announcement order, verbosity, whether a live-region
 *     update interrupts usefully or is simply never heard.
 *   - Whether focus ORDER is logical, whether focus is managed sensibly after a
 *     navigation or a state change, and whether a focus indicator is visible enough to
 *     use. (Contrast of the indicator itself is measured in `e2e/contrast.spec.ts`;
 *     whether it reads as focus to a person is not measurable.)
 *   - Meaningful heading structure (axe sees level skips, not whether headings describe
 *     the content), meaningful alt text, meaningful link text in context.
 *   - Colour used as the ONLY carrier of meaning.
 *   - Anything behind an interaction this file does not perform. Every scan below is of
 *     a freshly loaded, un-interacted page: the open state of any future disclosure, and any transient status message are NOT
 *     scanned here. That is a deliberate scope limit, not an oversight — see the
 *     SURFACES note. Adding an interaction-state scan is the natural next extension.
 *   - Real assistive-technology behaviour on real devices, and touch and speech-input interaction.
 *
 * ────────────────────────────────────────────────────────────────────────────────────
 * SCOPE OF THE MATRIX, and what was deliberately dropped.
 *
 * A full cross-product of 5 surfaces × 3 theme states × 2 viewports is 36 tests, doubled
 * to 72 by the two browser projects, on a suite that is already ~2.6 min locally and
 * ~10 min in CI. It was sampled rather than run whole:
 *
 *   - WIDE (1280) × {light, dark} × every surface — the full surface sweep, in both
 *     explicit palettes. Theme is the axis most likely to produce a colour-contrast
 *     violation, so it is the one never sampled down.
 *   - NARROW (390) × dark × the four structurally distinct surfaces. The narrow pass
 *     drops `/projects?tag=…`, whose DOM is a strict subset of `/projects`, and
 *     runs one theme rather than two: layout width changes which elements exist, not
 *     which colours they use, and the colours are already covered at 1280.
 *   - SYSTEM (no `data-theme`) × an emulated dark OS, on `/` and `/projects` only. System
 *     resolves to the same two palettes already swept; what is worth proving is that the
 *     no-attribute state renders a real palette at all rather than an unstyled one.
 *
 * File placement: `*.spec.ts` inside `e2e/` is Playwright's, enforced by `testDir` +
 * `testMatch` in `playwright.config.ts`. A `*.test.ts` here would be collected by
 * NEITHER runner (`vitest.config.mts` excludes `e2e/**`) — that has happened in this
 * repo before.
 *
 * CI: this file needs no CI step of its own. It is `e2e/*.spec.ts`, so
 * `npm run test:e2e` collects it (add that as the last gate when CI is set up). A separate step would re-run the build and duplicate the gate.
 *
 * Runs on Chromium and WebKit.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Result as AxeViolation } from "axe-core";

/**
 * The axe tag set defining this gate's conformance target: WCAG 2.1 A and AA.
 *
 * Do not add `best-practice`, `wcag22aa` or `experimental` here — see the RULESET SCOPE
 * section of the file header for why each is excluded.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/** Storage key shared by `lib/useTheme.ts` and the blocking bootstrap in `app/layout.tsx`. */
const THEME_KEY = "portfolio-theme";

/** Wide viewport: a laptop, above the 1088px `--container-page` threshold. */
const WIDE = { width: 1280, height: 900 } as const;

/** Narrow viewport: a common modern phone, comfortably above the 320px floor. */
const NARROW = { width: 390, height: 844 } as const;

/**
 * One scannable surface of the site.
 *
 * Shaped as `{ name, path }` rather than a bare path so the filtered `/projects` variant
 * gets a readable test title.
 */
interface Surface {
  /** Human-readable label used in the test title. */
  name: string;
  /** Path to `page.goto`, relative to `baseURL`. */
  path: string;
}

/**
 * Every surface the site can render today.
 *
 * `/projects` appears twice: unfiltered, and filtered by a tag (a different render — the
 * active chip carries `aria-current` and the accent border). An unknown `?tag=` falls back
 * to the full list, so there is no separate empty state to scan.
 *
 * `/no-such-page` is not a route, so it renders the custom 404 from `app/not-found.tsx`. It is included because a 404 is a page real
 * visitors land on, and error pages are where accessibility regressions hide.
 */
const SURFACES: readonly Surface[] = [
  { name: "home", path: "/" },
  { name: "projects", path: "/projects" },
  { name: "projects, filtered", path: "/projects?tag=TypeScript" },
  { name: "about", path: "/about" },
  { name: "404", path: "/no-such-page" },
] as const;

/**
 * The four structurally distinct surfaces, used for the narrow-viewport pass.
 *
 * `projects, filtered` is omitted: its DOM is a strict subset of the unfiltered listing, so
 * a narrow-width defect it could expose would already have failed on `/projects`.
 */
const NARROW_SURFACES = SURFACES.filter(
  (surface) => surface.name !== "projects, filtered",
);

/**
 * Put the page into a known theme state BEFORE its first document loads.
 *
 * The theme's source of truth is `<html data-theme>`, written by a blocking bootstrap
 * from `localStorage` and thereafter owned by a `useSyncExternalStore` hook. Seeding
 * storage via `addInitScript` is the only way to drive it that both the bootstrap and
 * React agree on. Setting `data-theme` directly from automation is the trap: it changes
 * the paint but not the store, so React re-renders back over it and the page under test
 * is one no visitor can reach. (`e2e/layout.spec.ts#forceTheme` does the same thing; the
 * mechanism is shared on purpose.)
 *
 * @param page - Page to seed. MUST be called before `page.goto`.
 * @param theme - `"light"` / `"dark"` write the key; `"system"` REMOVES it, because the
 *   System state is represented by the absence of both the key and the attribute — never
 *   by the string `"system"`, which resolves to no CSS rule at all.
 * @returns Nothing.
 * @sideEffects Registers an init script that writes (or clears) `localStorage` for every
 *   document this page subsequently loads, and for `"system"` emulates a dark OS
 *   preference so the System state resolves to a palette that is distinguishable from
 *   the light default.
 * @failureModes None. The init script is wrapped so that a storage access which throws
 *   (Safari private browsing) degrades to the System state rather than aborting the
 *   page's own scripts — the same contract `app/layout.tsx` honours.
 */
async function seedTheme(
  page: Page,
  theme: "light" | "dark" | "system",
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (value === null) window.localStorage.removeItem(key!);
        else window.localStorage.setItem(key!, value);
      } catch {
        /* Storage unavailable: the System state is the correct fallback. */
      }
    },
    [THEME_KEY, theme === "system" ? null : theme] as const,
  );
  if (theme === "system") await page.emulateMedia({ colorScheme: "dark" });
}

/**
 * Render an axe violation list as something a person can act on from a CI log.
 *
 * A raw axe dump is a wall of nested JSON; at a glance it tells a reader neither what
 * broke nor where. This prints one block per violation: the rule id, its impact, the
 * WCAG success criteria it maps to, the human-readable description, the offending
 * selectors, and the docs URL.
 *
 * @param violations - `AxeResults.violations`, exactly as returned by `analyze()`.
 * @returns A multi-line string. Returns `"no violations"` for an empty list, which only
 *   appears if a caller formats a passing result.
 * @sideEffects None.
 * @failureModes None. Every field it reads is optional-guarded, because axe's `impact`
 *   is nullable and a node's `target` can contain nested frame selectors (arrays), which
 *   are flattened rather than stringified as `[object Object]`.
 */
function formatViolations(violations: readonly AxeViolation[]): string {
  if (violations.length === 0) return "no violations";

  return violations
    .map((violation) => {
      // axe tags carry both rule categories (`wcag2aa`) and criterion ids (`wcag143`).
      // Only the criterion ids are useful in a failure message, so they are extracted
      // and rewritten into dotted form: `wcag143` → `1.4.3`.
      const criteria = violation.tags
        .filter((tag) => /^wcag\d{3,}$/.test(tag))
        .map((tag) => tag.slice(4).split("").join("."))
        .join(", ");

      const nodes = violation.nodes
        .map((node) => {
          const selector = node.target.flat(Infinity).join(" >>> ");
          // `failureSummary` is axe's own one-line explanation of why THIS node failed,
          // which is usually more specific than the rule-level description.
          const why = (node.failureSummary ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" / ");
          return `      - ${selector}${why ? `\n        ${why}` : ""}`;
        })
        .join("\n");

      return [
        `  [${violation.impact ?? "unknown impact"}] ${violation.id}${
          criteria ? ` (WCAG ${criteria})` : ""
        }`,
        `    ${violation.help}`,
        `    ${violation.helpUrl}`,
        `    ${violation.nodes.length} element(s):`,
        nodes,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * Scan the currently loaded page and return its WCAG 2.1 A/AA violations.
 *
 * @param page - A page that has already finished loading the surface under test.
 * @returns The violations array — empty when clean.
 * @sideEffects Injects axe-core into the page under test. The injection is
 *   non-destructive (axe does not mutate the DOM it inspects), but the page should be
 *   treated as instrumented afterwards; every test here scans last.
 * @failureModes Throws if the page navigates away mid-analysis, or if a frame is
 *   detached. Both surface as an ordinary Playwright error rather than a silent pass.
 */
async function scan(page: Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  return results.violations;
}

/**
 * The single assertion every test in this file ends with.
 *
 * Asserts on the FORMATTED string rather than on `violations.length`, so the failure
 * output contains the full diagnosis: a length assertion would print
 * `expected 3 to be 0` and nothing else.
 *
 * @param page - The loaded page to scan.
 * @param label - Describes the matrix cell, e.g. `home / dark / 1280px`, so a failure in
 *   a parameterised test names the exact combination that broke.
 * @returns Nothing.
 * @sideEffects Runs {@link scan}; fails the current test on any violation.
 */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  const violations = await scan(page);
  expect(
    formatViolations(violations),
    `axe found ${violations.length} WCAG 2.1 A/AA violation(s) on ${label}`,
  ).toBe("no violations");
}

test.describe("WCAG 2.1 A/AA — wide viewport, both explicit themes", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const surface of SURFACES) {
      test(`${surface.name} is clean in ${theme} theme at ${WIDE.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ ...WIDE });
        await seedTheme(page, theme);
        await page.goto(surface.path);
        // The attribute is the theme's source of truth; if the seed did not take, the
        // scan below would silently be testing the wrong palette.
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoViolations(
          page,
          `${surface.name} / ${theme} / ${WIDE.width}px`,
        );
      });
    }
  }
});

test.describe("WCAG 2.1 A/AA — narrow viewport", () => {
  for (const surface of NARROW_SURFACES) {
    test(`${surface.name} is clean in dark theme at ${NARROW.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ ...NARROW });
      await seedTheme(page, "dark");
      await page.goto(surface.path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoViolations(
        page,
        `${surface.name} / dark / ${NARROW.width}px`,
      );
    });
  }
});

test.describe("WCAG 2.1 A/AA — System theme (no data-theme attribute)", () => {
  for (const surface of SURFACES.slice(0, 2)) {
    test(`${surface.name} is clean with no data-theme on a dark OS`, async ({
      page,
    }) => {
      await page.setViewportSize({ ...WIDE });
      await seedTheme(page, "system");
      await page.goto(surface.path);
      // The System contract: the attribute is ABSENT, and the palette still resolves.
      // Asserting absence matters here — if a refactor wrote `data-theme="system"` the
      // page would fall back to the light palette on a dark OS and this cell would be
      // scanning a combination no visitor sees.
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
      await expectNoViolations(page, `${surface.name} / system (dark OS)`);
    });
  }
});

test.describe("the surfaces under test are the ones we think they are", () => {
  /**
   * A guard against the whole matrix quietly going vacuous.
   *
   * Every scan above would pass on a blank page, a redirect, or a 404 served where a
   * real page was expected — axe reports no violations on markup that is not there. This
   * pins the assumptions the matrix is built on that could change without anyone
   * touching this file: that `/no-such-page` really is the 404, and that the filtered
   * `/projects` view really is a filtered render (a recognised tag, with an active chip).
   */
  test("/no-such-page serves the custom 404 and ?tag=TypeScript is a real filter", async ({
    page,
  }) => {
    const notFound = await page.goto("/no-such-page");
    expect(notFound?.status(), "/no-such-page must be a 404").toBe(404);

    await page.goto("/projects?tag=TypeScript");
    await expect(
      page.locator('[aria-current="true"]'),
      "TypeScript is no longer a known tag — pick another, or the filtered cell of the " +
        "axe matrix is scanning the unfiltered listing instead",
    ).toHaveText("TypeScript");
  });
});
