/**
 * e2e/theme-flash.spec.ts — the flash-of-wrong-theme regression suite.
 *
 * What behaviour this protects: `app/layout.tsx` ships a synchronous inline `<head>`
 * script that reads `localStorage["portfolio-theme"]` and stamps `data-theme` on `<html>`
 * before the body paints. If that script ever loses its race with first paint — moved
 * out of `<head>`, given `defer`, converted to `next/script`, or blocked — a visitor
 * who chose Dark sees a white page for one or more frames on every single navigation.
 * It is the most visible defect this subphase can ship, and three prior review passes
 * called it "correct by reasoning, unobserved". This file observes it.
 *
 * Corresponding manual checklist: `QA/1.1_tests/theme-system.md` section 3.
 *
 * HOW THE RACE IS MADE OBSERVABLE — this is the load-bearing part of the file:
 *
 *   1. SEEDING. The stored preference is written by an init script that runs before any
 *      of the document's own scripts, so the inline bootstrap finds a value already
 *      there — the state a returning visitor actually loads in. The page under test is
 *      therefore reached by ONE navigation, from `about:blank`. See
 *      `seedStoredPreference` for why the more obvious goto-set-reload sequence is
 *      wrong here (it produced a WebKit-only false failure).
 *
 *   2. The OS preference is emulated to the OPPOSITE of the stored one
 *      (`colorScheme: "light"` with `portfolio-theme="dark"`). This matters: with both
 *      agreeing, the page would look right even if the bootstrap script did nothing at
 *      all, and the test would pass while protecting nothing.
 *
 *   3. CPU is throttled 20x over CDP (Chromium only — WebKit exposes no CDP) and the
 *      Next.js JS chunks — but NOT the stylesheet, which shares their URL prefix and is
 *      render-blocking; see `isStylesheetChunk` — are delayed 600ms for both engines.
 *      Together these stretch the window between first paint and hydration from
 *      ~single-digit ms to something a screenshot loop can sample many times over.
 *      Without throttling, a broken bootstrap could flash for one frame and still slip
 *      between two screenshots. The negative control does not use this delay at all: it
 *      parks hydration outright, because a control must not depend on winning a race.
 *
 *   4. Frames are inspected TWO independent ways, because each covers the other's blind
 *      spot:
 *        a. REAL PIXELS. A clipped `page.screenshot()` per iteration, decoded to an RGB
 *           triple by `support/pixels.ts`. This is the only evidence of what was
 *           actually painted. Its blind spot is the very earliest window — a screenshot
 *           taken before anything has been painted returns the engine's blank white
 *           canvas, which is not a flash. That case is distinguishable rather than
 *           ambiguous: blank is pure `#ffffff` while the light theme canvas is
 *           `#fbfaf8`, ~5 luma apart, so the classifier below treats "matches the light
 *           canvas within tolerance" as a failure and pure white as merely "not yet
 *           painted". A run must also capture at least one frame of the CORRECT canvas,
 *           so a test cannot pass by observing nothing at all.
 *        b. PER-FRAME CSSOM SAMPLING. An init script records, on every
 *           `requestAnimationFrame` from document creation until `load`, the value of
 *           `data-theme` and the computed `background-color` of `<body>`. The first rAF
 *           callback of a document runs before that document's first paint, so frame 0
 *           of this record is what the first painted frame was composited from. Its
 *           blind spot is that it describes intent rather than output — hence (a).
 *
 * Both directions are tested (stored dark on a light OS, stored light on a dark OS), on
 * both Chromium and WebKit. WebKit is not decoration here: Safari is the engine where
 * inline-script-before-paint ordering has historically differed, and it is the one this
 * project has no other way to check.
 *
 * WHAT IS PROVEN ON WHICH ENGINE — read this before treating a green run as stronger
 * than it is. Every test in this file runs on both engines EXCEPT the pixel half of the
 * negative control, which is Chromium-only. The reason is a Playwright/WebKit harness
 * limitation, measured on this project on 2026-09-10 and written up in full on the
 * `test.skip` at that test: WebKit does not hand Playwright an intermediate painted
 * frame while a document is still loading. Screenshots taken mid-load return the blank
 * engine canvas, and if a subresource is held open they do not return at all. So on
 * WebKit:
 *
 *   - The FLASH ITSELF is fully covered, in both directions and in the negative
 *     control, through the per-frame CSSOM channel (b) — which is the deterministic
 *     channel, fixed by document order rather than by sampling luck.
 *   - Channel (a)'s WebKit pixels are POST-LOAD evidence. They still prove WebKit ends
 *     up on the right canvas and never lands on the wrong one, but they are not
 *     pre-paint evidence, and no WebKit test in this file should be read as claiming
 *     they are.
 *   - The claim "the pixel detector fires when the protection is removed" is
 *     established on Chromium only. Nothing about the theme bootstrap is engine-specific
 *     on the harness side of that claim: it is a statement about the screenshot loop,
 *     not about the product.
 *
 * Deliberately NOT covered here: the CSP-blocked degraded path (a strict
 * `Content-Security-Policy` without `unsafe-inline`), which stays a manual step. Next
 * serves no CSP header on this project, and injecting one at the proxy layer would test
 * a header this app does not ship — a fabricated scenario whose result would not
 * describe production.
 */

import { expect, test, type Page } from "@playwright/test";
import { CANVAS, luma, topLeftPixel, type Rgb } from "./support/pixels";

/** Storage key written by `lib/useTheme.ts` and read by the inline bootstrap script. */
const THEME_KEY = "portfolio-theme";

/**
 * Per-channel tolerance when matching a painted pixel against a known canvas colour.
 *
 * 6 is chosen to sit comfortably below the ~5-luma gap between the light canvas
 * (`#fbfaf8`) and an unpainted white viewport (`#ffffff`) being *distinguishable*, while
 * still absorbing colour-profile rounding between engines. Do not raise it: at 8+, the
 * light canvas and blank white start to alias, and the "blank is not a flash" carve-out
 * would begin swallowing real flashes.
 */
const CHANNEL_TOLERANCE = 6;

/** How long the JS chunks are held back, widening the pre-hydration window. */
const CHUNK_DELAY_MS = 600;

/** How many screenshots to take, and how far apart, while the page comes up. */
const FRAME_SAMPLES = 14;
const FRAME_INTERVAL_MS = 25;

/**
 * The 4x4 region every screenshot in this file is clipped to, and the one place to change
 * it. `topLeftPixel` decodes pixel (0,0) OF THE CLIP, so moving this moves the sample.
 *
 * WHY IT IS NOT THE TOP-LEFT CORNER OF THE VIEWPORT — this is the whole of CI failure
 * #2 (run 35242110089), and the constant is worthless without the reason.
 *
 * `components/Nav.tsx` renders a `sticky top-0` header with a translucent `bg-bg/85`
 * background, so the viewport's top-left pixel is inside the header, not on bare page
 * canvas. That was harmless for as long as `bg-bg/85` composited over the page canvas —
 * 85% of a colour over that same colour is that colour, which is why this suite sampled
 * (0,0) happily from Phase 1.1 onwards.
 *
 * On the Linux WebKitGTK build, once the document is TALL ENOUGH TO SCROLL, the sticky
 * header is promoted to its own compositing layer and Playwright's screenshot composites
 * that layer against the base viewport — white, or black under a dark-emulated OS —
 * instead of against the body background propagated to the viewport. The 85% blend then
 * lands on a colour that is neither canvas. Measured in the official
 * `mcr.microsoft.com/playwright:v1.63.0-noble` image on 2026-09-17, stored dark / light
 * OS: (0,0) reads `rgb(51, 51, 55)` = `#101114` at 85% over white, while every sample
 * below the header reads `rgb(16, 17, 20)` exactly. Shortening the document until it no
 * longer scrolls, or making the header `position: static`, makes (0,0) correct again;
 * removing the `<audio>` elements does NOT. Apple's WebKit on macOS does not do it at all,
 * which is why this only ever failed in CI. Full transcript:
 * `QA/1.1_tests/theme-system.md`, run log 2026-09-17.
 *
 * Phase 3.1 is where it started failing because Phase 3.1 is where `/` became taller than
 * the viewport; nothing about the theme bootstrap changed.
 *
 * y = 120 is chosen as: below the header (68px tall at the 1280x720 project viewport),
 * inside `<main>`'s left gutter where the only painted background is the page canvas, and
 * far enough above the fold to be present in every frame. It is not trusted blindly —
 * `assertSampleRegionIsCanvas` re-derives both facts from the live page on every run, so a
 * layout change that invalidates this number fails loudly instead of silently sampling
 * some component's background.
 */
const CANVAS_SAMPLE = { x: 0, y: 120, width: 4, height: 4 } as const;

/** One sampled animation frame, as recorded in-page by the init script. */
type FrameRecord = {
  /** `data-theme` on `<html>`; `null` means the "system" state. */
  theme: string | null;
  /** Computed `background-color` of `<body>` for that frame, e.g. `rgb(16, 17, 20)`. */
  background: string;
};

declare global {
  interface Window {
    /** Frame log installed by `recordFrames`. Test-only; no app code reads this. */
    __frames?: FrameRecord[];
  }
}

/**
 * Whether two colours match within `CHANNEL_TOLERANCE` on every channel.
 *
 * @param a - Colour read from a screenshot.
 * @param b - Reference canvas colour.
 * @returns True when the pixel is that canvas. Side effects: none.
 */
function matches(a: Rgb, b: Rgb): boolean {
  return (
    Math.abs(a.r - b.r) <= CHANNEL_TOLERANCE &&
    Math.abs(a.g - b.g) <= CHANNEL_TOLERANCE &&
    Math.abs(a.b - b.b) <= CHANNEL_TOLERANCE
  );
}

/**
 * True for a pixel showing an engine viewport that has not painted the document yet,
 * rather than a themed canvas.
 *
 * @param pixel - Colour read from a screenshot sample.
 * @returns True for pure white or pure black. Side effects: none.
 *
 * Two values, both observed rather than guessed. Chromium and WebKit return pure white
 * (`255,255,255`) for a pre-paint capture on a light-emulated OS, and WebKit returns
 * pure BLACK (`0,0,0`) when the OS is dark-emulated — `color-scheme: dark` darkens the
 * initial viewport before any of the document's styles resolve. WebKit sample 2 of the
 * stored-light-on-dark-OS run hit exactly that and failed the first draft of this suite.
 *
 * Neither value aliases a real canvas: the light canvas is `#fbfaf8` (7 off pure white
 * on the blue channel, above `CHANNEL_TOLERANCE`) and the dark canvas is `#101114` (16+
 * off pure black on every channel). So allowing these two does NOT let a wrong-theme
 * frame through — `matches(pixel, forbidden)` is checked independently and exactly.
 *
 * What allowing pure black could in principle hide is a frame where the themed
 * stylesheet had not yet applied at all. That case is caught by the separate first-frame
 * assertion on `body`'s computed `background-color`, which must already equal the
 * expected canvas on frame 0.
 */
function isUnpainted(pixel: Rgb): boolean {
  const pureWhite = pixel.r === 255 && pixel.g === 255 && pixel.b === 255;
  const pureBlack = pixel.r === 0 && pixel.g === 0 && pixel.b === 0;
  return pureWhite || pureBlack;
}

/**
 * Seed the stored theme preference into the document under test, before it loads.
 *
 * @param page - Page to instrument; must not have navigated to the app yet.
 * @param value - Value to write to `portfolio-theme` (`"dark"` or `"light"`).
 * @returns Promise resolving once the init script is registered.
 *
 * WHY AN INIT SCRIPT AND NOT `goto` + `evaluate` + `reload`: the reload approach was
 * tried first and produced a false failure in WebKit only. WebKit keeps the OUTGOING
 * document composited until the incoming one paints, so screenshots taken at `commit`
 * returned the seeding page's canvas — which, being unstyled by the stored preference,
 * is exactly the "wrong" colour this suite forbids. That is a harness artefact, not a
 * product defect: the pixels were real, but they belonged to the previous page. Seeding
 * in an init script leaves `about:blank` (pure white, classified as "not yet painted")
 * as the only possible predecessor, so every themed pixel captured provably belongs to
 * the document under test. It is also the more faithful scenario — a returning visitor's
 * `localStorage` is populated before the document starts parsing, not mid-session.
 *
 * Side effects: writes `localStorage` in every subsequent document on this page.
 * Failure modes: wrapped in try/catch so a storage-blocked context degrades to the
 * unseeded case instead of throwing inside the init script, where it would abort the
 * rest of the page's scripts.
 */
async function seedStoredPreference(
  page: Page,
  value: "dark" | "light",
): Promise<void> {
  await page.addInitScript(
    ([key, stored]) => {
      try {
        window.localStorage.setItem(key!, stored!);
      } catch {
        // See failure modes above.
      }
    },
    [THEME_KEY, value],
  );
}

/**
 * Install the per-frame CSSOM recorder into the next document this page loads.
 *
 * @param page - Page to instrument. Must be called BEFORE the navigation under test.
 * @returns Promise resolving once the init script is registered.
 * Side effects: adds `window.__frames` to every subsequent document on this page, and
 * schedules a self-perpetuating `requestAnimationFrame` chain that stops at `load`.
 * Failure modes: if the page never fires `load`, the chain keeps sampling — harmless,
 * since the page is closed at test end.
 */
async function recordFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__frames = [];
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    window.addEventListener("load", stop, { once: true });

    const tick = () => {
      // Sampling inside rAF is what ties a record to a frame: the callback runs before
      // that frame is painted, so what is read here is what gets composited.
      const body = document.body;
      window.__frames?.push({
        theme: document.documentElement.getAttribute("data-theme"),
        background: body
          ? getComputedStyle(body).backgroundColor
          : "no-body-yet",
      });
      if (!stopped) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * True for a `/_next/static/chunks/**` URL that is the render-blocking STYLESHEET rather
 * than a hydration script.
 *
 * @param url - Full request URL from a Playwright route.
 * @returns True for the compiled CSS bundle. Side effects: none.
 *
 * WHY THIS DISTINCTION IS LOAD-BEARING — it is the root cause of a real flake, see the
 * WIDENING note in `widenTheRace`. Next 16 with Turbopack emits the stylesheet under the
 * SAME `/_next/static/chunks/` prefix as the JS:
 *
 *     <link rel="stylesheet" href="/_next/static/chunks/1f7mqt3w8khow.css" ...>
 *     <script src="/_next/static/chunks/turbopack-....js" async>
 *
 * so a glob on that prefix catches both. Matching on the `.css` extension rather than on
 * a path segment is deliberate: the hashed basename changes on every build, and the
 * directory does not distinguish them at all.
 */
function isStylesheetChunk(url: string): boolean {
  return new URL(url).pathname.endsWith(".css");
}

/**
 * Slow the page down so the pre-hydration window is wide enough to sample.
 *
 * @param page - Page to slow.
 * @param browserName - Playwright project name; CPU throttling is Chromium-only.
 * Side effects: registers a route handler that delays the JS chunks under
 * `/_next/static/chunks/**` (never the stylesheet), and on Chromium opens a CDP session
 * to set a 20x CPU throttle. Both persist for the test.
 * Failure modes: if CDP is unavailable the throttle is skipped and the chunk delay alone
 * carries the test — noted rather than silently ignored, see the inline comment.
 *
 * WIDENING — WHY THE STYLESHEET MUST BE EXEMPT. The window this suite samples is the gap
 * between FIRST PAINT and HYDRATION. First paint waits on the stylesheet; hydration waits
 * on the JS. An earlier draft delayed everything under `/_next/static/chunks/**`, which
 * because of `isStylesheetChunk` above meant the CSS and the JS were both held back by the
 * same `CHUNK_DELAY_MS`. That does not widen the window — it TRANSLATES it, releasing
 * paint and hydration at the same instant and leaving a gap of approximately zero. It is
 * the direct cause of the intermittent WebKit failure of the negative control recorded in
 * `QA/1.1_tests/theme-system.md` (2026-09-10): under CPU contention WebKit had not yet
 * pushed its first painted frame to the compositor when the corrected theme arrived, so
 * the pre-paint samples read pure white and the very next one already read the corrected
 * dark canvas. Delaying only the JS puts the delay entirely inside the window, which is
 * where it was always meant to be.
 */
async function widenTheRace(page: Page, browserName: string): Promise<void> {
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (isStylesheetChunk(route.request().url())) {
      // Render-blocking: delaying it delays first paint, not hydration. See above.
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    await route.continue();
  });

  await throttleCpu(page, browserName);
}

/**
 * Apply a 20x CPU throttle where the engine supports it.
 *
 * @param page - Page to slow.
 * @param browserName - Playwright project name.
 * @returns Promise resolving once the throttle is set, or immediately on a non-Chromium
 *          engine.
 * Side effects: opens a CDP session that persists for the page's lifetime.
 * Failure modes: none raised — WebKit exposes no CDP equivalent in Playwright, so there
 * the call is a documented no-op rather than an error. Extracted from `widenTheRace` so
 * the negative control can keep the identical CPU conditions while using a different
 * (gated, not delayed) mechanism for holding hydration back.
 */
async function throttleCpu(page: Page, browserName: string): Promise<void> {
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  }
  // WebKit: no CDP equivalent exists in Playwright. For the two positive tests the 600ms
  // chunk delay is the whole widening there; for the negative control the hydration gate
  // removes the need for any widening at all.
}

/**
 * Hold every hydration script indefinitely, so nothing client-side can run until the test
 * explicitly allows it.
 *
 * @param page - Page to instrument. Must be called BEFORE the navigation under test. If
 *               any other handler is registered for the same chunk glob, this one must be
 *               installed LAST: Playwright dispatches routes most-recently-registered
 *               first, so the last matching handler registered is the one that runs. An
 *               earlier draft installed this gate first and it was silently inert — the
 *               `widenTheRace` handler took every request and the control kept failing
 *               with the same symptom it was supposed to have fixed.
 * @returns A gate: `release()` serves every held and future JS chunk, and
 *          `heldCount()` reports how many are currently parked.
 *
 * WHY: the negative control must observe a painted frame that provably PRECEDES
 * hydration. A wall-clock delay can only make that likely; parking the scripts until the
 * frame is in hand makes it causal. The stylesheet is exempt for the reason given in
 * `isStylesheetChunk`, so first paint is not blocked — only the correction is.
 *
 * Side effects: registers a route handler and retains pending route objects.
 * Failure modes: if `release()` is never called the parked requests never settle and the
 * page never fires `load`, which would hang teardown — every caller MUST release in a
 * `finally`.
 */
function gateHydration(page: Page): {
  install: () => Promise<unknown>;
  release: () => Promise<void>;
  heldCount: () => number;
} {
  const held: (() => Promise<void>)[] = [];
  let open = false;

  return {
    // Returns whatever `page.route` returns (a `Disposable` on current Playwright);
    // callers only await it, and the handler is torn down with the page.
    install: () =>
      page.route("**/_next/static/chunks/**", async (route) => {
        if (isStylesheetChunk(route.request().url())) {
          await route.continue();
          return;
        }
        if (open) {
          await route.continue();
          return;
        }
        // Park it. Resolving the handler's promise is what actually serves the request,
        // so the request stays in flight for as long as this closure is uncalled.
        await new Promise<void>((resolve) => {
          held.push(async () => {
            resolve();
          });
        });
        await route.continue();
      }),
    release: async () => {
      open = true;
      const pending = held.splice(0);
      for (const serve of pending) await serve();
    },
    heldCount: () => held.length,
  };
}

/**
 * Navigate to `/` and screenshot in a tight loop until the viewport has actually PAINTED
 * the document, or a deadline passes.
 *
 * @param page - Instrumented page, already seeded, emulated and gated.
 * @param deadlineMs - Upper bound on how long to wait for a painted frame.
 * @returns `{ pixels, painted, navigation }` — every decoded sample in order, the first
 *          sample that was not an unpainted viewport (`null` if the deadline passed with
 *          nothing painted), and the still-pending navigation promise for the caller to
 *          await after it releases its gates.
 *
 * WHY NOT `loadAndSample`: that helper takes a FIXED number of samples at a fixed cadence,
 * so the pre-paint white frames eat the budget whenever the machine is loaded — which is
 * exactly how the negative control came to miss a flash that did happen. This one is
 * driven by the observation it needs rather than by the clock, and it does not await the
 * navigation, so the caller can hold hydration back until the paint is in hand.
 *
 * Side effects: navigates the page. Failure modes: a screenshot mid-navigation can throw;
 * as in `loadAndSample` a missed sample is recorded as nothing rather than failing the
 * run. If the deadline passes with no painted frame, `painted` is `null` and the CALLER
 * must assert on that — this function does not itself fail the test.
 */
async function loadUntilPainted(
  page: Page,
  deadlineMs: number,
): Promise<{
  pixels: Rgb[];
  painted: Rgb | null;
  navigation: Promise<unknown>;
}> {
  const pixels: Rgb[] = [];
  const navigation = page.goto("/", { waitUntil: "commit" });
  const expiry = Date.now() + deadlineMs;
  let painted: Rgb | null = null;

  while (Date.now() < expiry) {
    try {
      const shot = await page.screenshot({
        clip: CANVAS_SAMPLE,
        animations: "disabled",
      });
      const pixel = topLeftPixel(shot);
      pixels.push(pixel);
      if (!isUnpainted(pixel)) {
        painted = pixel;
        break;
      }
    } catch {
      // Capture races the navigation; a missed sample is not a signal either way.
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }

  return { pixels, painted, navigation };
}

/**
 * Prove, from the live page, that {@link CANVAS_SAMPLE} still points at bare page canvas.
 *
 * @param page - A loaded page at `/`.
 * @param expected - The canvas colour this run's theme should be painting.
 * @sideEffects None — reads layout and computed style only.
 * @failureModes Fails the calling test if the sample region overlaps the sticky header, or
 *   if the element under the sample point paints a background of its own that is not the
 *   expected canvas.
 *
 * WHY THIS EXISTS: `CANVAS_SAMPLE.y` is a hard-coded number, and a hard-coded number about
 * someone else's layout rots. Without this check, a taller header or a hero with its own
 * background would turn every pixel assertion in this file into a comparison against some
 * component's colour — which could silently PASS (if that colour happened to match) or
 * fail with a message pointing at the theme bootstrap, which would be the wrong culprit.
 * Called after load, because that is when the layout it describes exists.
 */
async function assertSampleRegionIsCanvas(
  page: Page,
  expected: Rgb,
): Promise<void> {
  const probe = await page.evaluate(
    ([x, y, width, height]) => {
      const header = document.querySelector("header");
      const element = document.elementFromPoint(
        x! + width! / 2,
        y! + height! / 2,
      );
      return {
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
        insideHeader: !!(header && element && header.contains(element)),
        // The nearest ancestor chain's own painted background. `rgba(0, 0, 0, 0)` means
        // the element paints nothing and the canvas shows through, which is the case this
        // sample point is chosen for.
        elementBackground: element
          ? getComputedStyle(element).backgroundColor
          : "no-element",
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      };
    },
    [
      CANVAS_SAMPLE.x,
      CANVAS_SAMPLE.y,
      CANVAS_SAMPLE.width,
      CANVAS_SAMPLE.height,
    ] as const,
  );

  const expectedRgb = `rgb(${expected.r}, ${expected.g}, ${expected.b})`;

  expect(
    probe.headerBottom,
    `CANVAS_SAMPLE.y (${CANVAS_SAMPLE.y}) must clear the sticky header; probe: ` +
      JSON.stringify(probe),
  ).toBeLessThan(CANVAS_SAMPLE.y);
  expect(
    probe.insideHeader,
    `the sample region is inside the sticky header, whose translucent background does ` +
      `not composite over the page canvas on Linux WebKit; probe: ${JSON.stringify(probe)}`,
  ).toBe(false);
  expect(
    ["rgba(0, 0, 0, 0)", "transparent", expectedRgb],
    `the element under the sample point paints its own background, so this region is no ` +
      `longer page canvas; probe: ${JSON.stringify(probe)}`,
  ).toContain(probe.elementBackground);
  expect(probe.bodyBackground, `probe: ${JSON.stringify(probe)}`).toBe(
    expectedRgb,
  );
}

/**
 * Load `/` under the widened race and report every painted frame plus every recorded
 * animation frame.
 *
 * @param page - Instrumented page, already seeded and emulated.
 * @returns `{ pixels, frames }` — one decoded top-left pixel per screenshot sample, and
 *          the in-page rAF record.
 * Side effects: navigates the page. Failure modes: a screenshot can throw if the page
 * navigates away mid-capture; the loop tolerates that by recording nothing for that
 * iteration rather than failing the whole test on a timing artefact.
 */
async function loadAndSample(
  page: Page,
): Promise<{ pixels: Rgb[]; frames: FrameRecord[] }> {
  const pixels: Rgb[] = [];

  // `waitUntil: "commit"` returns as soon as the response starts, i.e. before paint, so
  // sampling begins at the earliest moment the harness can observe.
  const navigation = page.goto("/", { waitUntil: "commit" });

  for (let i = 0; i < FRAME_SAMPLES; i += 1) {
    try {
      // A 4x4 clip of bare page canvas, below the sticky header. See CANVAS_SAMPLE for
      // why the header region cannot be used and what happens on Linux WebKit if it is.
      const shot = await page.screenshot({
        clip: CANVAS_SAMPLE,
        animations: "disabled",
      });
      pixels.push(topLeftPixel(shot));
    } catch {
      // Capture races the navigation; a missed sample is not a signal either way.
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
  }

  await navigation;
  await page.waitForLoadState("load");
  const frames = (await page.evaluate(() => window.__frames ?? [])) ?? [];

  return { pixels, frames };
}

test.describe("no flash of the wrong theme before first paint", () => {
  // Each direction seeds storage, then reloads under the widened race. The seeding
  // navigation itself is unthrottled — only the measured load is slowed.
  for (const direction of [
    {
      stored: "dark" as const,
      os: "light" as const,
      expected: CANVAS.dark,
      forbidden: CANVAS.light,
      forbiddenName: "light canvas #fbfaf8",
    },
    {
      stored: "light" as const,
      os: "dark" as const,
      expected: CANVAS.light,
      forbidden: CANVAS.dark,
      forbiddenName: "dark canvas #101114",
    },
  ]) {
    test(`stored "${direction.stored}" on a ${direction.os} OS never paints the ${direction.forbiddenName}`, async ({
      page,
      browserName,
    }) => {
      // Two navigations, a throttled screenshot loop, and a 600ms chunk delay: the
      // default 30s can be tight on a cold WebKit.
      test.slow();

      await page.emulateMedia({ colorScheme: direction.os });

      // Seed BEFORE the only navigation — see the SEEDING note in the header. Registered
      // ahead of `recordFrames` so it runs first; init scripts execute in registration
      // order, and the recorder must not observe an unseeded document.
      await seedStoredPreference(page, direction.stored);
      await recordFrames(page);
      await widenTheRace(page, browserName);

      const { pixels, frames } = await loadAndSample(page);

      // Before reading anything into the pixels: prove they were taken from bare page
      // canvas. See CANVAS_SAMPLE — a sample point that has drifted under a component
      // would make every assertion below describe the wrong thing.
      await assertSampleRegionIsCanvas(page, direction.expected);

      // --- Evidence (a): real painted pixels ------------------------------------
      const offending = pixels
        .map((pixel, index) => ({ pixel, index }))
        .filter(({ pixel }) => matches(pixel, direction.forbidden));

      expect(
        offending,
        `painted the ${direction.forbiddenName} on sample(s) ${offending
          .map((o) => o.index)
          .join(", ")}; full pixel log: ${JSON.stringify(pixels)}`,
      ).toHaveLength(0);

      // A run that painted nothing recognisable must not count as a pass.
      const correctFrames = pixels.filter((pixel) =>
        matches(pixel, direction.expected),
      );
      expect(
        correctFrames.length,
        `never captured the expected canvas; pixel log: ${JSON.stringify(pixels)}`,
      ).toBeGreaterThan(0);

      // Everything captured is either the right canvas or a not-yet-painted viewport.
      for (const [index, pixel] of pixels.entries()) {
        expect(
          matches(pixel, direction.expected) || isUnpainted(pixel),
          `sample ${index} was rgb(${pixel.r}, ${pixel.g}, ${pixel.b}), luma ${luma(
            pixel,
          ).toFixed(
            1,
          )} — neither the expected canvas nor an unpainted viewport`,
        ).toBe(true);
      }

      // --- Evidence (b): the first composited frame -----------------------------
      expect(
        frames.length,
        "the rAF recorder captured no frames at all",
      ).toBeGreaterThan(0);

      const expectedAttribute = direction.stored;
      const wrongThemeFrames = frames
        .map((frame, index) => ({ frame, index }))
        .filter(({ frame }) => frame.theme !== expectedAttribute);

      expect(
        wrongThemeFrames,
        `data-theme was not "${expectedAttribute}" on frame(s) ${wrongThemeFrames
          .map((f) => f.index)
          .join(
            ", ",
          )} — the bootstrap script lost its race with paint. First five ` +
          `frames: ${JSON.stringify(frames.slice(0, 5))}`,
      ).toHaveLength(0);

      // The attribute being right is necessary but not sufficient: the CSS has to have
      // resolved it too by that frame.
      const expectedBackground = `rgb(${direction.expected.r}, ${direction.expected.g}, ${direction.expected.b})`;
      expect(
        frames[0]?.background,
        `first composited frame's body background; full first-frame record: ${JSON.stringify(
          frames[0],
        )}`,
      ).toBe(expectedBackground);
    });
  }

  /**
   * Serve `/` with the inline bootstrap IIFE neutralised, so the document arrives with
   * the script present but inert.
   *
   * @param page - Page to instrument. Must be called BEFORE the navigation under test.
   * @returns Promise resolving once the route handler is registered.
   *
   * The bootstrap is removed at the PROXY, so no application file is touched: this is the
   * verification gate, not a place to edit `app/layout.tsx`. It doubles as the closest
   * automatable analogue of the CSP-without-`unsafe-inline` degradation described in
   * `QA/1.1_tests/theme-system.md` — the script is in the document but never takes
   * effect before paint.
   *
   * Side effects: registers a route handler on `**\/` for the page's lifetime.
   * Failure modes: FAILS THE TEST LOUDLY if the pattern no longer matches the served
   * HTML. A silent no-match would leave the control asserting a flash against an intact
   * bootstrap, i.e. inverted and permanently red — but worse, a future refactor of the
   * bootstrap's source formatting could make it no-match while the control still looked
   * meaningful, so the mismatch is checked rather than assumed.
   */
  async function stripBootstrap(page: Page): Promise<void> {
    await page.route("**/", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      // Neutralise the IIFE without changing the document's byte-length semantics or
      // any other script: only the bootstrap's own source is replaced.
      const stripped = body.replace(
        /\(function\(\)\{try\{var t=localStorage\.getItem\("portfolio-theme"\);[^<]*?\}catch\(e\)\{\}\}\)\(\);/,
        "/* bootstrap removed by QA negative control */",
      );
      expect(
        stripped,
        "the bootstrap script was not found in the served HTML — this control is no " +
          "longer testing anything, so the pattern above needs updating",
      ).not.toBe(body);
      await route.fulfill({ response, body: stripped });
    });
  }

  /**
   * NEGATIVE CONTROL, evidence channel (b) — runs on BOTH engines.
   *
   * Proves this suite can fail. A green anti-flash test is worthless unless the detector
   * demonstrably fires when the protection is removed, and the two tests above cannot
   * show that on their own — they would also pass if the instrumentation were silently
   * recording nothing.
   *
   * This one is the exact inverse of the positive tests' first-frame assertions: with the
   * bootstrap stripped, frame 0 must have NO `data-theme` and must be composited from the
   * LIGHT canvas even though the stored preference is dark. That is the flash, observed
   * at the frame the positive tests declare clean.
   *
   * WHY THIS CHANNEL AND NOT PIXELS: it is deterministic on every engine. Frame 0 of the
   * rAF record is fixed by document order, not by when a screenshot happens to land, so
   * there is no window to miss. The pixel half of the control lives in the next test and
   * is Chromium-only for the reason documented there.
   */
  test("NEGATIVE CONTROL — with the bootstrap stripped, the first composited frame is the wrong theme", async ({
    page,
    browserName,
  }) => {
    test.slow();

    await page.emulateMedia({ colorScheme: "light" });
    await seedStoredPreference(page, "dark");
    await stripBootstrap(page);
    await recordFrames(page);
    await widenTheRace(page, browserName);

    const { frames } = await loadAndSample(page);

    expect(
      frames.length,
      "the rAF recorder captured no frames at all, so this control observed nothing",
    ).toBeGreaterThan(0);

    // The mechanism of the flash: no attribute on the first frame.
    expect(
      frames[0]?.theme,
      `first composited frame's data-theme; full record: ${JSON.stringify(frames[0])}`,
    ).toBeNull();

    // And the consequence: that frame was composited from the WRONG canvas. Asserting
    // this and not just the missing attribute is what makes the control the true inverse
    // of the positive tests, which assert this same field equals the RIGHT canvas.
    expect(
      frames[0]?.background,
      `first composited frame's body background with the bootstrap stripped; full ` +
        `record: ${JSON.stringify(frames[0])} — if this is already the dark canvas the ` +
        `detector is not sensitive and the passing tests above cannot be trusted`,
    ).toBe(`rgb(${CANVAS.light.r}, ${CANVAS.light.g}, ${CANVAS.light.b})`);

    // Degradation is a flash, not a stuck page: the client store corrects it on mount.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        ),
      )
      .toBe("dark");
  });

  /**
   * NEGATIVE CONTROL, evidence channel (a) — Chromium only, see the skip below.
   *
   * The companion to the test above. That one proves the CSSOM channel fires; this one
   * proves the PIXEL channel fires — that when the protection is removed, the wrong
   * canvas genuinely reaches the compositor and `loadAndSample`'s screenshots see it.
   * Without this, a regression that broke the screenshot decoding would leave the two
   * positive tests passing on half the evidence they claim.
   *
   * WHY THIS IS CAUSAL RATHER THAN TIMED. Hydration is PARKED at the proxy — the JS
   * chunks are held until a painted frame is in hand — so the frame asserted on provably
   * precedes the client-side correction. The assertion is therefore the strongest form
   * available: not "some sample was light" but "the first frame this document painted was
   * the wrong theme". An earlier draft used the same 600ms delay as the positive tests
   * and asserted the weaker form; that is the flake this replaces, recorded in
   * `QA/1.1_tests/theme-system.md` (2026-09-10).
   */
  test("NEGATIVE CONTROL — with the bootstrap stripped, the wrong canvas is really painted", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit cannot be observed mid-load by Playwright's screenshot API, so a " +
        "pre-hydration painted frame is not capturable there. Two measurements, both " +
        "taken on this project (2026-09-10, see QA/1.1_tests/theme-system.md): (1) with " +
        "a subresource held open, every page.screenshot() call times out rather than " +
        "returning a frame — Chromium returns one in ~30ms under the identical setup; " +
        "(2) with the JS merely delayed 600ms, a 20-sample loop returns blank canvas " +
        "(pure white, or pure black under a dark-emulated OS) for the whole pre-load " +
        "period and then exactly ONE light sample at the load boundary before hydration " +
        "corrects it — WebKit does not hand back an intermediate frame, so there is no " +
        "window to sample, only a coin flip at the boundary. That coin flip is what made " +
        "this control intermittently fail on WebKit. It is a harness limitation, not a " +
        "product one: the flash itself IS still proven on WebKit by the CSSOM control " +
        "above, and WebKit's pixel evidence in the two positive tests is post-load, " +
        "which is exactly why those tests assert both channels.",
    );

    test.slow();

    await page.emulateMedia({ colorScheme: "light" });
    await seedStoredPreference(page, "dark");
    await stripBootstrap(page);
    await recordFrames(page);

    // Same CPU conditions as the positive tests, but hydration is held by the gate
    // rather than by a wall-clock delay, so `widenTheRace` is deliberately NOT used
    // here: its chunk handler would shadow the gate (see the ordering note on
    // `gateHydration`) and its delay would be redundant with parking the requests.
    await throttleCpu(page, browserName);
    const gate = gateHydration(page);
    await gate.install();

    let pixels: Rgb[] = [];
    let painted: Rgb | null = null;
    let navigation: Promise<unknown> | undefined;

    try {
      // 4s is far more than a painted frame needs on a throttled Chromium (observed
      // worst case ~400ms); it exists only so a genuinely stuck page fails on the
      // assertion below, with its pixel log, rather than by bare test timeout.
      ({ pixels, painted, navigation } = await loadUntilPainted(page, 4_000));

      expect(
        painted,
        `no painted frame appeared within the deadline; pixel log ${JSON.stringify(
          pixels,
        )}. Hydration was parked (${gate.heldCount()} request(s) held), so this is a ` +
          `harness or first-paint problem, not a theme one`,
      ).not.toBeNull();

      expect(
        painted !== null && matches(painted, CANVAS.light),
        `the first painted frame was rgb(${painted?.r}, ${painted?.g}, ${painted?.b}) ` +
          `but with the bootstrap stripped and hydration parked it must be the light ` +
          `canvas #fbfaf8. Full pixel log: ${JSON.stringify(pixels)} — the pixel ` +
          `detector is not sensitive enough and the passing tests above cannot be ` +
          `trusted`,
      ).toBe(true);
    } finally {
      // MUST run, on the failure path too: parked requests otherwise never settle, the
      // page never fires `load`, and teardown hangs instead of reporting the assertion.
      await gate.release();
    }

    await navigation;
    await page.waitForLoadState("load");

    // Degradation is a flash, not a stuck page: the client store corrects it on mount.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        ),
      )
      .toBe("dark");

    // The same sample-region guard the positive tests apply, run after the correction has
    // landed so the canvas to compare against is the dark one. Without it, a control that
    // stopped biting because it was sampling some component's background would read as a
    // real product failure.
    await assertSampleRegionIsCanvas(page, CANVAS.dark);
  });

  test("with no stored preference the page follows the OS on the first frame", async ({
    page,
    browserName,
  }) => {
    // The third state. `data-theme` must be ABSENT (not the string "system"), because
    // `globals.css` resolves the system case through `:root:not([data-theme])`. A
    // bootstrap that wrote "system" would break dark-OS visitors silently.
    test.slow();

    await page.emulateMedia({ colorScheme: "dark" });
    // Nothing to seed: a fresh Playwright context has empty storage, which IS the
    // no-stored-value case. Asserted below rather than assumed.
    await recordFrames(page);
    await widenTheRace(page, browserName);

    const { pixels, frames } = await loadAndSample(page);

    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY),
      "context was not storage-clean, so this is not the no-stored-value case",
    ).toBeNull();

    expect(frames[0]?.theme).toBeNull();
    expect(frames[0]?.background).toBe(
      `rgb(${CANVAS.dark.r}, ${CANVAS.dark.g}, ${CANVAS.dark.b})`,
    );
    for (const [index, pixel] of pixels.entries()) {
      expect(
        !matches(pixel, CANVAS.light),
        `sample ${index} painted the light canvas on a dark OS`,
      ).toBe(true);
    }
  });
});
