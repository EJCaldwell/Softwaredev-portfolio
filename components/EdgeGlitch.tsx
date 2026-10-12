"use client";

/**
 * components/EdgeGlitch.tsx — the decorative "glitch" around the edges of the screen.
 *
 * Owns: every few seconds, a short burst of small boxes popping in and out at random
 * spots along the LEFT and RIGHT edges of the browser window, like a monitor glitching.
 * (Top and bottom were tried and removed by the owner's choice — sides only.) Purely
 * decorative: no content, no interaction, invisible to assistive technology.
 *
 * How it fits: rendered once by `app/layout.tsx`, as the last child of `<body>`, so it
 * persists across page navigations and never re-mounts. Its box styling lives in
 * `app/globals.css` under "SCREEN-EDGE GLITCH"; this file only decides WHERE and WHEN
 * boxes appear. CSS alone could not do that — keyframes repeat the same pattern every
 * cycle, and the point of the effect is that every burst looks different.
 *
 * TO REMOVE: delete `<EdgeGlitch />` (and its import) from `app/layout.tsx`, then this
 * file and the "SCREEN-EDGE GLITCH" block in `app/globals.css`.
 *
 * Why direct DOM writes instead of React state: a burst creates and removes ~10 short-lived
 * boxes in under a second. Doing that through state would re-render the component for
 * every box; appending/removing plain `<span>`s inside a container React never re-renders
 * is cheaper and keeps the effect entirely off React's render path.
 */

import { useEffect, useRef, type JSX } from "react";

/** Gap between bursts, in ms, picked at random in this range so the rhythm never feels mechanical. */
const BURST_GAP_MS: readonly [number, number] = [6000, 10000];
/** Delay before the very first burst after the page loads. */
const FIRST_BURST_MS = 2000;
/** How many boxes one burst shows. */
const BOXES_PER_BURST: readonly [number, number] = [26, 40];
/** Window over which a burst's boxes are spread, in ms. */
const BURST_SPREAD_MS = 800;
/** How long each box stays visible, in ms. */
const BOX_LIFETIME_MS: readonly [number, number] = [70, 220];
/** Box size along the edge (px) — boxes are wider than they are deep, like torn scanlines. */
const BOX_LENGTH_PX: readonly [number, number] = [4, 26];
/** Box size away from the edge (px). */
const BOX_DEPTH_PX: readonly [number, number] = [2, 10];
/**
 * How far in from the LEFT/RIGHT edge a box may sit, as a fraction of the empty margin
 * between the screen edge and where the page content starts. 0.3 = boxes appear anywhere
 * in the outer 30% of that margin (about 60px on a 1440px-wide screen, where text starts
 * ~200px in; about 7px on a phone, where the margin is only 24px). Because it is relative
 * to the real margin, side boxes never reach the text on any screen size.
 */
const SIDE_REACH = 0.3;
/** Margin assumed if the content edge cannot be measured (see {@link contentMargin}). */
const FALLBACK_MARGIN_PX = 24;

/**
 * Distance in px from the left edge of the viewport to where page content starts.
 *
 * @returns The left edge of the first `.max-w-page` container (the shared page-width
 *   wrapper used by the nav, every page section and the footer) plus its left padding —
 *   i.e. where the text actually begins. Falls back to {@link FALLBACK_MARGIN_PX} if no
 *   such element exists. The layout is symmetric, so the right margin is the same.
 *
 * Measured at the moment a box spawns, so it tracks window resizes with no listener.
 * Coupling note: if `max-w-page` is ever renamed, this falls back silently to the small
 * margin — the effect shrinks, nothing breaks.
 */
function contentMargin(): number {
  const page = document.querySelector<HTMLElement>(".max-w-page");
  if (!page) return FALLBACK_MARGIN_PX;
  const padding = parseFloat(getComputedStyle(page).paddingLeft) || 0;
  return Math.max(0, page.getBoundingClientRect().left + padding);
}
/**
 * Box color variants; each maps to a `.edge-glitch-box--<name>` class in globals.css.
 * Red and cyan are the classic RGB-split pair; maroon ties it to the site's palette.
 */
const VARIANTS = ["red", "cyan", "maroon"] as const;

/**
 * Random number in a range.
 *
 * @param range - `[min, max]`, inclusive of min, exclusive of max.
 * @returns A float in that range. Pure apart from `Math.random`.
 */
function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

/**
 * Places one box at a random spot on the left or right edge.
 *
 * @param container - The fixed, full-viewport layer the box is appended to.
 * @returns The box, so the caller can schedule its removal.
 *
 * Side effects: appends a `<span>` to `container`. The distance in from the edge is in px
 * (via `left`/`right`), anywhere up to {@link SIDE_REACH} of the way toward the content;
 * the vertical position is a percentage so boxes spread over the whole height.
 */
function spawnBox(container: HTMLElement): HTMLSpanElement {
  const box = document.createElement("span");
  const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  box.className = `edge-glitch-box edge-glitch-box--${variant}`;

  const side = Math.random() < 0.5 ? "left" : "right";
  const inset = Math.round(Math.random() * contentMargin() * SIDE_REACH);

  // Tall, narrow boxes — like torn vertical scanlines along the side of the screen.
  box.style.width = `${Math.round(between(BOX_DEPTH_PX))}px`;
  box.style.height = `${Math.round(between(BOX_LENGTH_PX))}px`;
  box.style.top = `${(Math.random() * 96 + 2).toFixed(2)}%`;
  box.style[side] = `${inset}px`;

  container.appendChild(box);
  return box;
}

/**
 * Decorative edge-glitch layer. Renders one empty, fixed, full-viewport container and
 * drives random bursts of boxes into it.
 *
 * @returns An `aria-hidden` `<div>` with `pointer-events: none` (via the `edge-glitch`
 *   class), so it never blocks clicks, scrolling, or text selection and is skipped by
 *   screen readers.
 *
 * Side effects (in an effect, client only): timers that add/remove `<span>`s. All timers
 * are cleared on unmount.
 *
 * Reduced motion: if the visitor has `prefers-reduced-motion: reduce`, no burst is ever
 * scheduled. The preference is re-checked live, so turning it on stops the effect without
 * a reload.
 *
 * Failure modes: none user-visible — with JavaScript disabled the container is simply
 * empty, and the site is unaffected.
 */
export default function EdgeGlitch(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Every PENDING timer (burst schedule, box spawns, box removals). Each timer removes
    // its own id when it fires, so the set holds only a handful of ids at any moment —
    // it does not grow on a page left open for hours — and unmount can cancel them all.
    const timers = new Set<number>();

    /** `setTimeout` that registers itself in `timers` and deregisters when it fires. */
    const later = (fn: () => void, ms: number): void => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    /** Schedules the next burst after `delay`; a burst spreads its boxes over BURST_SPREAD_MS. */
    const scheduleBurst = (delay: number): void => {
      later(() => {
        // Skip bursts while the tab is hidden (nobody sees them) or motion is reduced.
        if (!document.hidden && !motion.matches) {
          const count = Math.round(between(BOXES_PER_BURST));
          for (let i = 0; i < count; i++) {
            later(() => {
              const box = spawnBox(container);
              later(() => box.remove(), between(BOX_LIFETIME_MS));
            }, Math.random() * BURST_SPREAD_MS);
          }
        }
        scheduleBurst(between(BURST_GAP_MS));
      }, delay);
    };

    scheduleBurst(FIRST_BURST_MS);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      container.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} className="edge-glitch" aria-hidden="true" />;
}
