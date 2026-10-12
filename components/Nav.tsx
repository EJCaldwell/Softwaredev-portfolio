/**
 * components/Nav.tsx — the persistent site header.
 *
 * Owns: the brand wordmark, the primary navigation landmark, and the slot the theme
 * toggle sits in. Rendered once by `app/layout.tsx` above `<main>`, so it appears on
 * every route.
 *
 * Scope: applies at every width. Phase 5.2 (`mobile-ui`) fixed a WCAG 1.4.10 reflow
 * failure here — the outer row already wrapped the nav group under the brand below
 * ~640px, but the link `<ul>` itself did not wrap, so at an enlarged root font (150%,
 * 200% text-size zoom) it overflowed the viewport horizontally on every route. See the
 * comment on the `<ul>`'s `flex-wrap` below for the full mechanism. Deliberately still
 * no hamburger button and no drawer: reflow (links wrapping to a second line under the
 * brand) is legible and needs no open/close state, focus trap, or Escape-key contract,
 * which a disclosure menu would add for a four-link nav that does not need one.
 *
 * Server component (no "use client"): only the nested `ThemeToggle` needs the client
 * runtime, so the header itself ships zero JS.
 */

import Link from "next/link";
import type { JSX } from "react";
import NavLink from "@/components/NavLink";
import ThemeToggle from "@/components/ThemeToggle";
import { NAV_LINKS, SITE } from "@/lib/site";

/**
 * The site header: brand link, primary nav, theme toggle.
 *
 * @returns A `<header>` containing a real `<nav>` landmark whose links are a `<ul>`, so
 *          assistive technology announces the list length.
 *
 * Props: none. The link list comes from `NAV_LINKS` in `lib/site.ts` so nav and footer
 * cannot drift apart.
 *
 * Notes:
 *   - `aria-current` AND the visual active state are wired as of Phase 3.2, and this
 *     component is STILL a server component. The earlier note here claimed the feature
 *     required making the header a client component; that was wrong, and the correction is
 *     documented at length in `components/NavLink.tsx`. `"use client"` marks a module
 *     boundary, so only the individual link reads `usePathname()` — the landmark, the list,
 *     and the labels are still rendered on the server.
 *   - Every `NAV_LINKS` entry is a real route, so all of them are prefetched (Next's
 *     default). Never add a nav entry for a route that does not exist yet.
 *
 * Side effects: none. Failure modes: none — no data fetching, no client state.
 */
export default function Nav(): JSX.Element {
  return (
    /* `border-border/70` is correct here and must NOT be changed to `border-outline`.
       This is a decorative full-width hairline, not a control boundary: the 3:1 UI
       boundary requirement applies to components a visitor has to identify and operate,
       and a 3:1 rule spanning the page under a sticky nav reads as a heavy slab against
       this paper-and-ink palette. See the `border` vs `outline` note in globals.css. */
    <header className="border-border/70 bg-bg/85 sticky top-0 z-10 border-b backdrop-blur">
      <div className="max-w-page mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4">
        <Link
          href="/"
          className="text-fg text-lg font-semibold tracking-tight no-underline"
        >
          {SITE.name}
        </Link>

        {/*
          `gap-x-8`, NOT `gap-x-6` — Phase 5.2 review. `gap-x-6` (24px) is the SAME
          horizontal gap the `<ul>` below uses BETWEEN its own links, so the toggle read
          as a fifth nav item rather than a separate control grouped apart from the
          links. `gap-x-8` (32px) matches the OUTER row's own `gap-x-8` (line 57, between
          the wordmark and this whole group), giving this header exactly two grouping
          distances: 24px within a group (links to each other), 32px between groups
          (wordmark to nav+toggle, and now nav to toggle).

          `items-start`, NOT `items-center` — same review. Once the `<ul>` wraps to a
          second row (an enlarged root font, or a narrow viewport — see the `<ul>`'s own
          `flex-wrap` comment below), `items-center` centres the toggle against the
          NAV'S WHOLE STACK, so it sits at no row's baseline: not the first row's, not
          the second's, just the midpoint between them. `items-start` glues the toggle to
          the TOP of the group, which is the first link row's baseline whether the list
          wraps or not — the one alignment that stays correct in both states, rather than
          only being correct in the single-row case.
        */}
        <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
          <nav aria-label="Primary">
            {/*
              `flex-wrap` HERE, ON THE `<ul>` ITSELF, IS DEFECT 5.2-D1's FIX.

              WHY THE OUTER `<div>`'s `flex-wrap` (line 53/61) DID NOT ALREADY COVER THIS.
              That wrap only ever operates on its own direct children — the wordmark
              `<Link>`, and this `<div>` holding nav+toggle. Once the viewport is too
              narrow for everything, that outer wrap correctly drops the nav+toggle group
              to its own row under the wordmark (see the 320px test in e2e/layout.spec.ts).
              But the `<ul>` inside is a SEPARATE flex formatting context with its own
              children (the four `<li>`s), and without `flex-wrap` here, a flex item's
              default `min-width` is `auto`, not `0` — meaning the browser will not shrink
              the `<ul>` below the combined min-content width of its four links plus five
              `gap-6` gaps. At the default 16px root that min-content width already fits
              375px; it does not need to shrink. At an enlarged root it does, and instead of
              shrinking, the `<ul>` was rendered at its full intrinsic width and pushed the
              whole document wider than the viewport — two-dimensional scrolling, a WCAG
              1.4.10 (Reflow) failure. Confirmed by measurement, not assumed: 27px of
              horizontal overflow at a 24px (150%) root, 161px at 32px (200%), identically
              on `/`, `/projects`, and `/about` (all three render this same header). See
              e2e/layout.spec.ts's "enlarged root font" sweep for the regression coverage.

              WHY WRAPPING RATHER THAN A HAMBURGER MENU. The brief for this fix prefers
              reflow over a disclosure pattern unless a menu is genuinely necessary. A menu
              would introduce open/close state, focus trapping, and an Escape-key contract
              — none of which this four-link nav needs, and the visual cost of a link
              wrapping to a second line under the brand is small and legible. Wrapping also
              cannot duplicate the `<nav>` landmark or the `aria-current="page"` element,
              which a hidden-mobile-menu-plus-hidden-desktop-menu pattern risks doing (this
              repo has shipped that exact duplicate-landmark defect once already — see the
              e2e assertion that exactly one element site-wide carries
              `aria-current="page"`). Semantics are completely unchanged here: still
              `<header>` > `<nav>` > `<ul>` > `<li>` > link, one copy, always rendered.

              `gap-x-6 gap-y-2`, NOT a single `gap-6` — Phase 5.2 review. `gap-6` set 24px
              on BOTH axes, and a `text-sm` link is a ~21px line box, so once this list
              actually wraps, the vertical gap between rows (24px) exceeded the height of
              the text itself and equalled the horizontal gap between links on the SAME
              row exactly — nothing distinguished "these two links are a row" from "these
              two rows are separate", and the whole block read as scattered words rather
              than grouped navigation. `gap-y-2` (8px) is comfortably less than the 24px
              horizontal gap, so a row of links now reads as a row, and rows read as
              stacked, separate lines. Byte-identical to `gap-6` at the default root font,
              where this list never wraps — `gap-y-*` only has anything to apply to once
              there is more than one row.
            */}
            <ul className="flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  {/* The one client leaf in the header — see components/NavLink.tsx. */}
                  <NavLink href={link.href} label={link.label} />
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
