/**
 * e2e/support/chrome-geometry.ts — geometric detectors for two failure classes in the site
 * chrome that every per-element assertion in this suite is structurally blind to.
 *
 * Owns the browser-side measurements behind the two regression describes at the end of
 * `e2e/layout.spec.ts`:
 *
 *   1. {@link findMidWordBreaks} — a word broken ACROSS LINES inside a box that was sized
 *      for one line. This became possible site-wide in Phase 5 when `body` gained
 *      `overflow-wrap: break-word` (a correct fix for long strings painting outside their
 *      column). That declaration converts every zero-slack fixed-width text box in the
 *      codebase from "fits exactly" into "breaks mid-word", and it does so silently: the
 *      document does not scroll, no text paints outside anything, and axe-core is clean,
 *      so NONE of the existing detectors in `text-overflow.ts` can see it. Defect 5.3-D1
 *      (`ThemeToggle`'s `w-12` label rendering "Syste / m", button 44px → 56px) was found
 *      by a human looking at screenshots, which is the evidence that automation had no
 *      path to it.
 *
 *   2. {@link findOverlappingTargets } — two interactive elements whose hit areas overlap.
 *      This is a PAIRWISE property. Every per-element assertion in this suite passed while
 *      defect 5.3-D2 was live (nav links with 26px of shared clickable area between rows),
 *      because no single element was wrong — only the relationship between two of them.
 *      Per-element checks cannot express that no matter how many of them you add.
 *
 * File placement: `playwright.config.ts` sets `testMatch: **\/*.spec.ts`, so a `.ts` file
 * in `e2e/support/` is importable by specs and never collected as a test. A `*.test.ts`
 * under `e2e/` would be collected by NEITHER runner (`vitest.config.mts` excludes
 * `e2e/**`). That has actually happened in this repo — do not name files here that way.
 */

import { type Page } from "@playwright/test";

/** One text node that wrapped across lines despite containing no break opportunity. */
export interface MidWordBreak {
  /** CSS-ish path to the element that directly contains the offending text node. */
  selector: string;
  /** The unbroken word that was split, truncated for readability in failure output. */
  text: string;
  /** How many line boxes it occupied. Anything above 1 is the defect. */
  lines: number;
  /** Rendered width of the element's box, px — usually the fixed width that caused it. */
  boxWidthPx: number;
}

/** Two interactive elements whose padding boxes intersect. */
export interface TargetOverlap {
  /** Accessible-ish description of the first element (tag + text). */
  a: string;
  /** Accessible-ish description of the second element. */
  b: string;
  /** Width of the intersecting region, px. */
  overlapXPx: number;
  /** Height of the intersecting region, px. This is the number that was 26 in 5.3-D2. */
  overlapYPx: number;
}

/**
 * Find single-word text that the layout broke across more than one line.
 *
 * @param page - Page to inspect, already laid out at the viewport, root font size and
 *   theme state under test. Measurement is a snapshot; call it again after any state
 *   change (cycling the theme changes the label text AND its width).
 * @param rootSelector - Subtree to scan. Defaults to the site chrome (`header, footer`),
 *   which is where fixed-width labels live; pass `"body"` to sweep the whole page.
 * @returns One {@link MidWordBreak} per offender, `[]` when clean.
 * @sideEffects None — CSSOM reads only, no DOM mutation.
 * @failureModes None reachable. Every call is synchronous geometry; an element with no
 *   text nodes or zero rects is skipped rather than throwing.
 *
 * HOW IT MEASURES, AND WHY IT IS A `Range` AND NOT A HEIGHT COMPARISON.
 * A `Range` over a text node returns one client rect PER LINE BOX the text occupies. For a
 * text node with no whitespace in it — a single unbreakable word — the correct answer is
 * always exactly 1. Two rects means the word itself was split, which is the defect.
 *
 * The obvious alternative, `offsetHeight <= lineHeight`, is weaker in two ways: it needs a
 * `line-height` lookup that resolves to the string `"normal"` in some cascades, and it
 * cannot distinguish a two-line break from a box that is simply taller than its text. The
 * rect count is the direct observation. (`e2e/layout.spec.ts` still asserts the height as
 * well for the one label defect 5.3-D1 hit, because the button's 44px → 56px growth is a
 * separately meaningful symptom — alignment with the nav — not just a proxy for the break.)
 *
 * WHY ONLY WHITESPACE-FREE TEXT NODES. Multi-word text SHOULD wrap; that is not a defect
 * and flagging it would make this detector useless. Restricting to text with no space in
 * it isolates exactly the class `overflow-wrap: break-word` created: a string with no legal
 * break opportunity being broken anyway.
 *
 * KNOWN LIMIT, stated so nobody mistakes this for more than it is: a word containing a
 * hyphen or slash has a legal break opportunity and may wrap to two lines legitimately.
 * Nothing in the current chrome does, so no exclusion list exists yet. If one is ever
 * added, exclude it explicitly here with a comment rather than loosening the rect count —
 * a loosened threshold is how this project has lost defects to green suites before.
 */
export async function findMidWordBreaks(
  page: Page,
  rootSelector = "header, footer",
): Promise<MidWordBreak[]> {
  return page.evaluate((selector) => {
    /**
     * Build a short, human-recognisable path for failure output.
     * Not a valid querySelector in every case by design — it is diagnostic, not a locator.
     */
    function describe(el: Element): string {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && parts.length < 3) {
        const cls = node.className;
        const classPart =
          typeof cls === "string" && cls.trim()
            ? `.${cls.trim().split(/\s+/).slice(0, 2).join(".")}`
            : "";
        parts.unshift(`${node.tagName.toLowerCase()}${classPart}`);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    const offenders: {
      selector: string;
      text: string;
      lines: number;
      boxWidthPx: number;
    }[] = [];

    for (const root of Array.from(document.querySelectorAll(selector))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (
        let textNode = walker.nextNode();
        textNode;
        textNode = walker.nextNode()
      ) {
        const raw = textNode.nodeValue ?? "";
        const word = raw.trim();
        // Empty, or contains a space: either nothing to measure, or wrapping is legal.
        if (!word || /\s/.test(word)) continue;

        const parent = textNode.parentElement;
        if (!parent) continue;
        // An invisible element (e.g. the `hidden sm:inline` label below the `sm`
        // breakpoint) has no boxes at all. `display: none` cannot break mid-word, so it
        // is not an offender — it is simply not under test at this viewport.
        if (parent.getClientRects().length === 0) continue;

        const range = document.createRange();
        // Select the trimmed word, not the raw node: leading/trailing whitespace in the
        // source can sit on its own line box and inflate the count with a false positive.
        const start = raw.indexOf(word);
        range.setStart(textNode, start);
        range.setEnd(textNode, start + word.length);
        const lines = range.getClientRects().length;
        range.detach();

        if (lines > 1) {
          offenders.push({
            selector: describe(parent),
            text: word.slice(0, 60),
            lines,
            boxWidthPx:
              Math.round(parent.getBoundingClientRect().width * 10) / 10,
          });
        }
      }
    }
    return offenders;
  }, rootSelector);
}

/**
 * Find pairs of elements whose hit areas (padding boxes) intersect.
 *
 * @param page - Page to inspect, already laid out at the viewport and root font size under
 *   test. Overlap only exists where the nav actually WRAPS, so the caller must set up a
 *   layout with more than one row — at 16px root and 320px the nav is one row and this
 *   returns `[]` for a genuinely broken build.
 * @param selector - Elements to compare pairwise. Callers pass `"header nav a"`.
 * @param tolerancePx - Intersections smaller than this are ignored. Defaults to 0.5px to
 *   absorb sub-pixel layout rounding, which differs between Chromium and WebKit. Anything
 *   at or below a rounding error is not a mis-tap hazard; 5.3-D2 measured 26px.
 * @returns One {@link TargetOverlap} per offending pair, `[]` when clean. Pairs are
 *   reported once (i < j), not twice.
 * @sideEffects None. @failureModes None reachable — pure geometry.
 *
 * THE TRAP THIS EXISTS TO CATCH, written out because it will otherwise be re-derived the
 * hard way: VERTICAL PADDING ON A `display: inline` BOX DOES NOT CONTRIBUTE TO LINE-BOX
 * HEIGHT. It paints outside the line and overlaps whatever sits above and below.
 * `next/link` renders a bare `<a>`, which is `display: inline`, so adding `py-3` to a nav
 * link to enlarge its touch target enlarged the PAINTED and CLICKABLE area without moving
 * any layout: at 320px with a 32px root font, where the nav wraps, links measured 84px
 * tall and the padding boxes of adjacent ROWS overlapped by 26px. Document overflow stayed
 * 0px throughout, so no existing overflow assertion could see it, and nothing on the
 * rendered page showed it. The fix is `inline-block`, which makes the padding affect
 * layout so the rows separate.
 *
 * `getBoundingClientRect` is the right measurement here precisely BECAUSE it reports the
 * border box including padding, i.e. the region that actually receives the pointer event —
 * which is the property under test. A layout-position check (`offsetTop`) would have been
 * satisfied by the broken build.
 */
export async function findOverlappingTargets(
  page: Page,
  selector: string,
  tolerancePx = 0.5,
): Promise<TargetOverlap[]> {
  return page.evaluate(
    ({ selector: sel, tolerancePx: tol }) => {
      const elements = Array.from(document.querySelectorAll(sel)).filter(
        // Skip anything not rendered: a zero-area box cannot be tapped and its rect at the
        // origin would produce meaningless intersections with other hidden elements.
        (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
      );

      const label = (el: Element): string =>
        `${el.tagName.toLowerCase()}[${(el.textContent ?? "").trim().slice(0, 24)}]`;

      const overlaps: {
        a: string;
        b: string;
        overlapXPx: number;
        overlapYPx: number;
      }[] = [];

      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const a = elements[i]!.getBoundingClientRect();
          const b = elements[j]!.getBoundingClientRect();
          // Standard axis-aligned rectangle intersection. An overlap exists only when BOTH
          // axes overlap — two links side by side on one row share a y-range, and two
          // links stacked in a column share an x-range; neither is a defect on its own.
          const overlapX =
            Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY =
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > tol && overlapY > tol) {
            overlaps.push({
              a: label(elements[i]!),
              b: label(elements[j]!),
              overlapXPx: Math.round(overlapX * 10) / 10,
              overlapYPx: Math.round(overlapY * 10) / 10,
            });
          }
        }
      }
      return overlaps;
    },
    { selector, tolerancePx },
  );
}
