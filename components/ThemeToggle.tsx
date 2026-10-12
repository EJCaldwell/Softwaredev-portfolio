/**
 * components/ThemeToggle.tsx — the single control for switching theme.
 *
 * Owns: the presentation and accessible labelling of the theme control. All state,
 * persistence, and DOM mutation live in `lib/useTheme.ts`; this file is deliberately just
 * the button. It is rendered inside `components/Nav.tsx` and is the only client component
 * in the site chrome, which keeps the JS shipped for the header to a minimum.
 */

"use client";

import type { JSX } from "react";
import { nextPreference, useTheme, type ThemePreference } from "@/lib/useTheme";

/**
 * Human-readable name for each preference, used in the button's accessible label.
 * Keyed by `ThemePreference` so adding a state to the union is a compile error here.
 */
const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * The icon shown for each preference.
 *
 * @param preference - Which theme state to depict.
 * @returns A decorative 16px SVG. `aria-hidden` because the button's `aria-label`
 *          already carries the meaning; announcing the icon too would be duplication.
 *
 * Side effects: none. Failure modes: none.
 */
function ThemeIcon({
  preference,
}: {
  preference: ThemePreference;
}): JSX.Element {
  const common = {
    "aria-hidden": true,
    focusable: "false" as const,
    viewBox: "0 0 16 16",
    className: "size-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (preference === "light") {
    // Sun: filled core plus four rays. Four rather than eight keeps it quiet at 16px.
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6" />
      </svg>
    );
  }

  if (preference === "dark") {
    // Crescent moon.
    return (
      <svg {...common}>
        <path d="M13 9.8A5.8 5.8 0 0 1 6.2 3a5.8 5.8 0 1 0 6.8 6.8Z" />
      </svg>
    );
  }

  // System: a circle split light/dark, i.e. "whatever the device says".
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 2.4v11.2" />
      <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Button that cycles the theme preference: System → Light → Dark → System.
 *
 * @returns A real `<button type="button">` (never a clickable `div`), so it is focusable,
 *          Enter/Space-activated, and announced as a button without extra ARIA.
 *
 * Props: none — the control is self-contained by design; there is exactly one instance.
 *
 * Accessibility notes:
 *   - `aria-label` states the current theme and what pressing will do, because the icon
 *     alone is ambiguous (a moon could mean "currently dark" or "switch to dark").
 *   - The visible text label is `aria-hidden` so the label is not announced twice.
 *   - Before hydration the control renders its "System" state, because the stored
 *     preference is unreadable during a server render. `useTheme` re-reads the real value
 *     immediately on hydration via `useSyncExternalStore`, so the label is correct from
 *     the first client render onward and no hydration mismatch is possible.
 *
 * Styling notes:
 *   - The rest border is `border-outline`, not `border-border`. `outline` is the
 *     control-boundary token (>=3:1 against both `bg` and `surface`); `border` is the
 *     decorative page hairline at ~1.3:1 and cannot delineate a button. See the token
 *     note in `app/globals.css`.
 *   - Hover goes to `border-fg` outright rather than a translucent `border-fg/25`, which
 *     measured 1.71:1 against the canvas — under half a ratio point from the rest state,
 *     i.e. a state change nobody could see. Full `fg` is an unmistakable jump.
 *
 * Side effects: pressing it mutates `data-theme` on `<html>` and writes `localStorage`
 * (both via `useTheme`).
 *
 * Failure modes: if `localStorage` is unavailable the theme still changes for the current
 * page view but is not remembered — see the failure-modes note in `lib/useTheme.ts`.
 */
export default function ThemeToggle(): JSX.Element {
  const { preference, cycle } = useTheme();
  // The label names the *next* state so the button says what pressing it will do.
  // It MUST come from `nextPreference` — the same helper `cycle` uses — so the
  // announcement and the actual behaviour cannot drift. Do not re-derive the cycle order
  // here; reordering `CYCLE` in `lib/useTheme.ts` has to keep these two in agreement.
  const nextLabel = LABELS[nextPreference(preference)];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[preference]}. Activate to switch to ${nextLabel}.`}
      /*
        `min-h-11` (44px) — Phase 5.2 review. `px-3 py-1.5 text-sm` plus a 1px border
        alone rendered at ~35px tall (12px padding + 20px `text-sm` line + 2px border),
        80% of the 44px touch-target floor, sitting directly beside a seek slider and a
        transport button this same phase brought to 44px on that exact floor. `min-h-11`
        raises it to 44px without changing the padding that shapes its RESTING look —
        `min-height` is a floor, not a fixed height, so if a future label or icon change
        ever needs more than 44px this still grows to fit rather than clipping.
      */
      className="text-muted hover:text-fg border-outline hover:border-fg inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
    >
      <ThemeIcon preference={preference} />
      {/*
        Width is fixed so cycling states does not reflow the nav — that intent is right and
        predates this comment. The VALUE was wrong, and the way it failed is worth recording.

        `w-12` is 48px. "System" at `text-sm` in Geist measures 48.0px: an exact fit with
        zero slack. That was harmless until Phase 5 added a site-wide
        `overflow-wrap: break-word` to `body` (globals.css) to stop long strings painting
        outside their column — a correct fix that turned this zero-slack box into a
        mid-word break. The pill rendered "Syste / m" across two lines, growing the button
        from 44px to 56px and breaking its alignment with the nav, in BOTH Chromium and
        WebKit, at every width >= 640px where the label is shown.

        It only ever hit "System", because "Light" (31.9px) and "Dark" (30.7px) have slack —
        and "System" is the DEFAULT, so it was the one state every first-time visitor saw.

        `w-16` (64px) clears the longest label with 16px to spare. Keep slack here: any
        future label longer than the box will break mid-word again rather than overflow
        visibly, which is a quieter and therefore worse failure.
      */}
      <span aria-hidden="true" className="hidden w-16 text-left sm:inline">
        {LABELS[preference]}
      </span>
    </button>
  );
}
