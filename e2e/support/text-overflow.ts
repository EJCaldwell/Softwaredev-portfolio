/**
 * e2e/support/text-overflow.ts — detectors for text that paints outside the box meant to
 * contain it.
 *
 * Owns: the two browser-side measurements behind the "no text paints outside its box"
 * assertions in `e2e/layout.spec.ts` — a `Range`-based comparison of an element's own text
 * against its block container's content edge, and a `scrollWidth`-vs-`offsetWidth`
 * comparison for elements that genuinely have a non-inline layout box.
 *
 * WHY A SUPPORT MODULE RATHER THAN LOCAL HELPERS IN THE SPEC. Two reasons, both practical:
 *   - The inline-`scrollWidth`-is-0 trap documented on the first function below is the kind
 *     of thing that gets re-derived painfully. One home for it, referenced from the spec.
 *   - It makes the detector runnable from a throwaway script that deliberately BREAKS the
 *     page (stripping `break-words`/`w-full` in the live DOM) to prove the check still
 *     fires. A check nobody has watched fail is not evidence of anything, and proving that
 *     against a copy-pasted duplicate of the logic proves nothing about the real one.
 *
 * File placement matters here: `playwright.config.ts` sets `testMatch: **\/*.spec.ts`, so a
 * `.ts` file in `e2e/support/` is importable by specs and never collected as a test. A
 * `*.test.ts` placed under `e2e/` would be collected by NEITHER runner (Vitest excludes
 * `e2e/**`) — that has actually happened in this repo; do not name files here that way.
 */

import { type Page } from "@playwright/test";

/**
 * Find text that PAINTS outside the content box of the block that lays it out.
 *
 * @param page - Page to inspect, already laid out at the viewport and root size under test.
 * @returns One entry per offender: a CSS-ish selector, the offending text (truncated), the
 *   measured overflow in px, and which side it escaped from. `[]` means clean.
 * @sideEffects None — measurement only, no DOM mutation.
 * @failureModes None reachable: every measurement is a synchronous CSSOM read. An element
 *   with no rendered text simply produces no range rects and is skipped.
 *
 * ============================================================================
 * THE TRAP THIS EXISTS TO AVOID — `scrollWidth` IS 0 ON AN INLINE BOX
 * ============================================================================
 * The first version of this check was `el.scrollWidth - el.offsetWidth > 1` over LEAF
 * elements only. Both halves of that are broken, and they compound:
 *
 *   (a) CSSOM View defines `scrollWidth`/`offsetWidth` on elements with a CSS layout box
 *       that is not inline-level. For a non-replaced INLINE element both return 0 (and
 *       `offsetWidth` returns the union of its border boxes in some engines), so the
 *       subtraction is meaningless. Measured here, on `/` at 375px with a 32px root and
 *       the `break-words`/`w-full` fix stripped out of the live DOM:
 *
 *           <span> "EJCaldwell06@gmail.com"
 *             display              inline
 *             scrollWidth          0
 *             offsetWidth          418
 *             scrollWidth - offsetWidth   -418   <-- NEGATIVE, so `> 1` drops it
 *             getBoundingClientRect().width  418
 *             ground truth         the span paints 91px past the document's right edge
 *
 *       A negative number can never trip a `> TOLERANCE` filter, so EVERY inline leaf on
 *       EVERY page was silently unmeasurable — which is most of the prose on `/about` and
 *       `/projects`, all of which wrap `<span>`/`<Link>`/`<em>`/`<strong>` inside paragraphs.
 *
 *   (b) The leaves-only filter excluded the fixed markup outright. It is
 *       `<p class="w-full"><span class="break-words">{email}</span></p>`: the `<p>` has an
 *       element child so it was filtered out, and the `<span>` is the inline box from (a).
 *       The stated rationale ("an ancestor's scrollWidth would just duplicate whatever the
 *       descendant reports") is backwards for inline children — the ancestor is the ONLY
 *       one of the two that can report anything at all. There is no leaves filter now:
 *       duplicate offenders cost nothing in a `toEqual([])` assertion and cost less than a
 *       missed one.
 *
 * ============================================================================
 * WHAT IS MEASURED INSTEAD
 * ============================================================================
 * A `Range` over the element's own child text nodes, whose `getClientRects()` ARE defined
 * for inline content (that is how a browser reports selection geometry), compared against
 * the CONTENT edges of the nearest block-level ancestor-or-self — the box that is actually
 * responsible for wrapping that text. Two notes on why that pairing:
 *
 *   - Comparing an inline element's text against its OWN box is vacuous: an inline box is
 *     defined as the union of its text's line boxes, so the two are equal by construction
 *     and no inline element could ever report an overflow. The block container is the box
 *     whose width the text was supposed to respect.
 *   - The comparison is against the content edge (border-box rect inset by border and
 *     padding), not the border-box edge, because padding is not usable text space; text
 *     sitting in the padding is already escaping.
 *
 * Ranges are used rather than `element.getClientRects()` so that only the element's OWN
 * direct text contributes; a wrapper's descendants are measured when the walk reaches the
 * descendants themselves, and are attributed there.
 *
 * INTENTIONAL CLIPPING IS EXCLUDED BY COMPUTED STYLE, NOT BY CLASS NAME. Any ancestor with
 * a non-`visible` `overflow-x` is clipping on purpose (the `sr-only` skip link is the live
 * example — its 1px box is the whole mechanism), so its subtree is skipped. The previous
 * version pattern-matched on `truncate`/`sr-only` in `className`; there is no
 * `truncate`/`overflow-hidden` in `app/` or `components/` today so it happened to work,
 * but the first one anyone adds would have failed this spuriously. The sibling test
 * "nothing masks a horizontal overflow" already reads `getComputedStyle(el).overflowX`;
 * this now matches it.
 */
export function findTextPaintingOutsideItsBlock(page: Page) {
  return page.evaluate(() => {
    // Sub-pixel rounding, plus a little glyph overhang (italics and some script faces
    // paint a fraction past their advance width). Matches the 1px tolerance used
    // elsewhere in this file, widened by 1px for overhang; a real overflow is tens of px.
    const TOLERANCE_PX = 2;

    /** Display values that generate a block-level box able to constrain text width. */
    const BLOCK_DISPLAYS = new Set([
      "block",
      "flow-root",
      "list-item",
      "flex",
      "grid",
      "table",
      "table-cell",
      "table-caption",
      "inline-block",
      "inline-flex",
      "inline-grid",
    ]);

    /** True when this element or any ancestor deliberately clips horizontally. */
    const isInsideClippedSubtree = (el: Element): boolean => {
      for (
        let node: Element | null = el;
        node && node !== document.documentElement;
        node = node.parentElement
      ) {
        if (getComputedStyle(node).overflowX !== "visible") return true;
      }
      return false;
    };

    /**
     * The TIGHTEST width constraint applying to this element's text.
     *
     * Not "the nearest block ancestor" — that was the first attempt and it failed to
     * catch the very defect this exists for, which is worth writing down because it is
     * subtle. The broken markup is `<p><span>{email}</span></p>` with no width
     * constraint on either: the `<p>` is a flex ITEM in an `items-start` column, so it
     * SHRINK-TO-FITS around its own unbreakable content. Its content edge therefore sits
     * exactly on the span's text, reports zero overflow, and the escape is invisible —
     * the `w-full` in the shipped markup exists precisely to stop that shrink-wrap
     * (`app/page.tsx`, contact section).
     *
     * So every block-level ancestor is consulted and the NARROWEST content box among
     * them wins, plus the viewport as a final bound. A shrink-wrapped intermediate box
     * simply contributes a loose constraint and some ancestor further up — the section,
     * the page container, the viewport — supplies the real one. This is what makes the
     * check independent of the surrounding markup rather than accidentally dependent on
     * which particular wrapper happens to be block-level today.
     */
    const constraintFor = (el: Element): { left: number; right: number } => {
      let left = 0;
      let right = document.documentElement.clientWidth;
      for (
        let node: Element | null = el;
        node && node !== document.documentElement;
        node = node.parentElement
      ) {
        const cs = getComputedStyle(node);
        if (!BLOCK_DISPLAYS.has(cs.display)) continue;
        // An absolutely positioned box is laid out against a different containing block
        // than its DOM ancestors, so ancestors above it do not constrain it. Stop there.
        const positioned =
          cs.position === "absolute" || cs.position === "fixed";
        const rect = node.getBoundingClientRect();
        left = Math.max(
          left,
          rect.left +
            parseFloat(cs.borderLeftWidth) +
            parseFloat(cs.paddingLeft),
        );
        right = Math.min(
          right,
          rect.right -
            parseFloat(cs.borderRightWidth) -
            parseFloat(cs.paddingRight),
        );
        if (positioned) break;
      }
      return { left, right };
    };

    const describe = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === "string" && el.className
        ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}`
        : "");

    const offenders: {
      selector: string;
      constrainedTo: string;
      text: string;
      overflowPx: number;
      side: "right" | "left";
    }[] = [];

    for (const el of document.querySelectorAll("body *")) {
      // Only elements that directly own rendered text; a pure wrapper is measured through
      // whichever descendant actually holds the characters.
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (!ownText) continue;
      if (isInsideClippedSubtree(el)) continue;

      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter(
        (r) => r.width > 0 && r.height > 0,
      );
      range.detach();
      if (rects.length === 0) continue;

      const { left: contentLeft, right: contentRight } = constraintFor(el);

      const rightOverflow =
        Math.max(...rects.map((r) => r.right)) - contentRight;
      const leftOverflow = contentLeft - Math.min(...rects.map((r) => r.left));
      const worst = Math.max(rightOverflow, leftOverflow);
      if (worst <= TOLERANCE_PX) continue;

      offenders.push({
        selector: describe(el),
        constrainedTo: `${Math.round(contentLeft)}..${Math.round(contentRight)}px`,
        text: ownText.slice(0, 60),
        overflowPx: Math.round(worst),
        side: rightOverflow >= leftOverflow ? "right" : "left",
      });
    }
    return offenders;
  });
}

/**
 * The block-level half of the same question: content wider than the box that holds it.
 *
 * @param page - Page to inspect, already laid out.
 * @returns One entry per element whose `scrollWidth` exceeds its `offsetWidth`.
 * @sideEffects None.
 * @failureModes None; elements without a layout box report 0 for both and are skipped.
 *
 * Kept ALONGSIDE {@link findTextPaintingOutsideItsBlock} rather than replaced by it,
 * because the two catch different shapes of the same class of bug and a bisection benefits
 * from knowing which fired. This one is restricted to elements that genuinely have a
 * non-inline layout box (`offsetWidth > 0`), which is exactly the population for which
 * `scrollWidth` is meaningful — see the inline-`scrollWidth`-is-0 trap documented above.
 * Intentional clipping is excluded by computed `overflow-x`, not by class name.
 */
export function findBoxesWithOverflowingContent(page: Page) {
  return page.evaluate(() => {
    const TOLERANCE_PX = 1;
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.offsetWidth > 0)
      .filter((el) => {
        for (
          let node: Element | null = el;
          node && node !== document.documentElement;
          node = node.parentElement
        ) {
          if (getComputedStyle(node).overflowX !== "visible") return false;
        }
        return true;
      })
      .map((el) => ({
        selector:
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === "string"
            ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}`
            : ""),
        text: el.textContent?.trim().slice(0, 60) ?? "",
        overflowPx: el.scrollWidth - el.offsetWidth,
      }))
      .filter((entry) => entry.overflowPx > TOLERANCE_PX);
  });
}
