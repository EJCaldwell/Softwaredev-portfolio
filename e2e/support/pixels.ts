/**
 * e2e/support/pixels.ts — decode the top-left pixel of a PNG screenshot buffer.
 *
 * Owns: turning a `page.screenshot()` buffer into an actual RGB triple, so that
 * "no frame of the wrong theme was ever painted" can be asserted against real
 * painted output rather than against DOM/CSSOM state that merely predicts paint.
 *
 * Why this exists at all: the anti-flash bootstrap in `app/layout.tsx` is a race
 * between an inline `<head>` script and first paint. Reading
 * `getComputedStyle(document.body).backgroundColor` proves what the engine *would*
 * paint; only a screenshot proves what it *did*. Playwright has no pixel-reading
 * API and this repo may not add dependencies, so the PNG is decoded here with
 * Node's built-in `zlib` only.
 *
 * Scope of the decoder, deliberately narrow — it handles exactly the PNG subset
 * Chromium and WebKit emit for a screenshot: 8-bit colour depth, colour type 2
 * (RGB) or 6 (RGBA), no interlacing, no palette. Anything else throws rather than
 * returning a wrong answer, because a silently misdecoded pixel would turn this
 * suite into a rubber stamp. Screenshots passed in are clipped to a few pixels, so
 * only the first scanline is ever inflated in practice.
 *
 * Filtering: PNG filter type 0 (None) and 1 (Sub) both leave the FIRST pixel of a
 * scanline unfiltered, and filter types 2/3/4 reference the previous scanline,
 * which for scanline 0 is treated as all zeroes — so for the first pixel of the
 * first row, Up (2) is also identity, and Average (3) / Paeth (4) reduce to
 * identity too when both the left and upper neighbours are absent/zero. That is
 * why reading byte-for-byte works here without a full unfiltering pass, and it is
 * only valid for pixel (0,0). Do not extend this helper to other coordinates
 * without implementing real unfiltering.
 */

import { inflateSync } from "node:zlib";

/** An 8-bit-per-channel colour read out of a screenshot. */
export type Rgb = { r: number; g: number; b: number };

/** PNG magic bytes; every screenshot must start with these eight. */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode the colour of the top-left pixel of a PNG.
 *
 * @param png - Raw bytes of a PNG, as returned by `page.screenshot()`.
 * @returns The `{ r, g, b }` of pixel (0,0), each channel 0-255.
 * @throws If the buffer is not a PNG, is interlaced, is not 8-bit RGB/RGBA, or
 *         contains no IDAT data. Throwing is intended: a caller must never receive
 *         a guessed colour.
 * Side effects: none (pure; inflates in memory).
 */
export function topLeftPixel(png: Buffer): Rgb {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG buffer");
  }

  let offset = 8;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idatParts: Buffer[] = [];

  // Walk the chunk stream: [length:4][type:4][data:length][crc:4].
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;

    if (type === "IHDR") {
      bitDepth = png.readUInt8(dataStart + 8);
      colorType = png.readUInt8(dataStart + 9);
      interlace = png.readUInt8(dataStart + 12);
    } else if (type === "IDAT") {
      idatParts.push(png.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4;
  }

  if (interlace !== 0) throw new Error("interlaced PNG is unsupported here");
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`unsupported colour type ${colorType}`);
  }
  if (idatParts.length === 0) throw new Error("PNG contained no IDAT data");

  const raw = inflateSync(Buffer.concat(idatParts));
  // Byte 0 of a scanline is its filter type; pixel (0,0) starts at byte 1. See the
  // filtering note in the header for why no unfiltering pass is needed here.
  if (raw.length < 4) throw new Error("inflated IDAT too short for one pixel");

  return {
    r: raw.readUInt8(1),
    g: raw.readUInt8(2),
    b: raw.readUInt8(3),
  };
}

/**
 * Perceived luminance of a colour, on the same 0-255 scale as its channels.
 *
 * Used only to classify a painted frame as "light" or "dark" — this is the cheap
 * Rec. 601 luma, NOT WCAG relative luminance, and must not be used for contrast
 * maths (contrast lives in `QA/1.1_tests/color-contrast.md`).
 *
 * @param color - The colour to measure.
 * @returns Luma, 0 (black) to 255 (white). Side effects: none.
 */
export function luma({ r, g, b }: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * The two theme canvas colours, from `--theme-bg` in `app/globals.css`.
 * Duplicated here on purpose: a test that read the values out of the running
 * page's CSS could not detect the page painting the *other* theme's canvas.
 */
export const CANVAS = {
  /** `#fbfaf8` — light `--theme-bg`. Luma ~250. */
  light: { r: 251, g: 250, b: 248 } satisfies Rgb,
  /** `#101114` — dark `--theme-bg`. Luma ~17. */
  dark: { r: 16, g: 17, b: 20 } satisfies Rgb,
};

/**
 * Midpoint luma between the two canvases (~134). Any painted frame above this is
 * unambiguously the light canvas; below it, the dark one. The two are ~233 luma
 * apart, so no realistic anti-aliasing or colour-profile drift can push a frame
 * across this line — which is what makes a threshold test here non-flaky.
 */
export const LUMA_MIDPOINT = (luma(CANVAS.light) + luma(CANVAS.dark)) / 2;
