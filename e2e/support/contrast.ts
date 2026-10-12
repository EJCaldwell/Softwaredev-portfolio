/**
 * e2e/support/contrast.ts — WCAG contrast maths for browser-measured colours.
 *
 * Owns: turning colours READ OUT OF A RUNNING PAGE (computed styles, or pixels decoded
 * by `support/pixels.ts`) into WCAG 2.1 contrast ratios.
 *
 * Why it exists: `QA/1.1_tests/color-contrast.md` computed every palette pairing with a
 * throwaway script and then recorded two items it could not settle — whether the numbers
 * survive the alpha-modified and `backdrop-blur` surfaces the site actually composites
 * (`bg-bg/85`, `border-border/70`), and what `muted` nav links really sit on. Those are
 * questions about composited output, so they need a browser and real pixels, not source
 * hex values. This module supplies the arithmetic; the assertions live in
 * `contrast.spec.ts`.
 *
 * It also lets the palette itself be asserted against the values that REACH the browser
 * rather than the values written in `app/globals.css` — the doc's own standing
 * recommendation ("when a test runner lands, this belongs in it as a real assertion over
 * the palette, so that editing a token can never silently drop a pairing below
 * threshold").
 *
 * Implementation is WCAG 2.1 exactly: per-channel sRGB linearisation, then
 * `0.2126R + 0.7152G + 0.0722B`, then `(L_light + 0.05) / (L_dark + 0.05)`. Do not
 * substitute the Rec. 601 luma in `support/pixels.ts` — that one classifies a frame as
 * light or dark and is not valid for contrast.
 */

import type { Rgb } from "./pixels";

/** WCAG 2.1 thresholds used by the assertions in `contrast.spec.ts`. */
export const THRESHOLD = {
  /** 1.4.3 AA, body text. */
  bodyText: 4.5,
  /** 1.4.3 AA, large text (>=24px, or >=18.66px bold). */
  largeText: 3,
  /** 1.4.11, non-text UI boundaries and focus indicators. */
  nonText: 3,
};

/**
 * Linearise one 8-bit sRGB channel.
 *
 * @param channel - Channel value, 0-255.
 * @returns Linear-light value, 0-1. Side effects: none.
 */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance of a colour.
 *
 * @param color - Opaque sRGB colour. Callers must composite any alpha away first —
 *                a ratio computed against a translucent colour is meaningless, which is
 *                precisely the gap this module exists to close.
 * @returns Relative luminance, 0-1. Side effects: none.
 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Contrast ratio between two opaque colours.
 *
 * @param a - First colour.
 * @param b - Second colour. Order does not matter; the lighter is chosen internally.
 * @returns Ratio from 1 (identical) to 21 (black on white). Side effects: none.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a hex colour, in both the 6-digit and 3-digit forms.
 *
 * @param value - `#rrggbb` or `#rgb`, case-insensitive.
 * @returns The RGB channels, or `null` when the string is not a hex colour (so callers
 *          can fall through to `parseCssColor`).
 * Side effects: none.
 *
 * The 3-digit form is not a theoretical case: Tailwind's build minifies `#ffffff` to
 * `#fff`, and `getComputedStyle().getPropertyValue()` returns a custom property's value
 * VERBATIM — unlike a real colour property, it is not normalised to `rgb()`. A 6-digit
 * only parser therefore threw on `--color-surface` in light theme and took four palette
 * tests down with it.
 */
export function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1]!;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * Parse a CSSOM colour string into an RGB triple.
 *
 * @param value - A computed colour, e.g. `rgb(16, 17, 20)`, `rgba(16, 17, 20, 0.85)`, or
 *                the `color(srgb ...)` / space-separated forms newer engines emit.
 * @returns The RGB channels, plus `alpha` (1 when the colour is opaque).
 * @throws If the string is not a colour this parser understands. Throwing is deliberate:
 *         a silently mis-parsed colour would produce a plausible-looking wrong ratio,
 *         which is worse than no measurement at all.
 *
 * Side effects: none. Note that a colour with `alpha < 1` must be composited by the
 * caller (see `compositeOver`) before any ratio is taken from it.
 */
export function parseCssColor(value: string): Rgb & { alpha: number } {
  const numbers = value.match(/-?\d*\.?\d+/g);
  if (!numbers || numbers.length < 3) {
    throw new Error(`cannot parse colour: ${value}`);
  }
  const [r, g, b, a] = numbers.map(Number) as [
    number,
    number,
    number,
    number | undefined,
  ];
  // `color(srgb 0.06 0.07 0.08)` gives 0-1 channels; `rgb()` gives 0-255. Distinguished
  // by the function name rather than by guessing from magnitude, because `rgb(1, 1, 1)`
  // is a legitimate near-black and must not be read as white.
  const isUnitScale = value.startsWith("color(");
  const scale = isUnitScale ? 255 : 1;
  return {
    r: Math.round(r * scale),
    g: Math.round(g * scale),
    b: Math.round(b * scale),
    alpha: a ?? 1,
  };
}

/**
 * Composite a translucent colour over an opaque backdrop (simple source-over alpha).
 *
 * @param source - Foreground colour with its alpha, e.g. `bg-bg/85`.
 * @param backdrop - The opaque colour behind it.
 * @returns The resulting opaque colour.
 *
 * Side effects: none. Caveat worth knowing: this models alpha blending only, NOT
 * `backdrop-filter: blur()`, which samples and averages neighbouring pixels. Where a
 * blur is involved the honest measurement is a decoded screenshot pixel of the real
 * composited result, which is what `contrast.spec.ts` uses for the header.
 */
export function compositeOver(
  source: Rgb & { alpha: number },
  backdrop: Rgb,
): Rgb {
  const blend = (s: number, d: number) =>
    Math.round(s * source.alpha + d * (1 - source.alpha));
  return {
    r: blend(source.r, backdrop.r),
    g: blend(source.g, backdrop.g),
    b: blend(source.b, backdrop.b),
  };
}

/**
 * Format a ratio the way the checklist records it, e.g. `5.93:1`.
 *
 * @param ratio - A contrast ratio.
 * @returns Two-decimal string with the `:1` suffix. Side effects: none.
 */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
