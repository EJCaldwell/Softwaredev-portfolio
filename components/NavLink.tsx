/**
 * components/NavLink.tsx — one primary-navigation link, and the only part of the header
 * that knows which route is current.
 *
 * Owns: the active/inactive presentation of a single nav destination, and the
 * `aria-current="page"` attribute that tells assistive technology where the visitor is.
 *
 * WHY THIS FILE EXISTS AT ALL — it is deliberately a leaf.
 *
 * `aria-current` was deferred out of Phase 1.1.2 with the reasoning that wiring it needs
 * `usePathname()`, which "would make the header a client component for a cosmetic gain".
 * That framing was wrong on both halves, and this file is the correction:
 *
 *   - It is not cosmetic. Without it a screen-reader user hears four identical links with
 *     nothing distinguishing the one they are standing on, and (before this change) a
 *     sighted user got no visual active state either — so neither audience had any
 *     location feedback at all.
 *   - It does not require a client `Nav`. `"use client"` marks a MODULE boundary, not a
 *     subtree: `components/Nav.tsx` stays a server component and simply renders this leaf,
 *     so the brand, the `<nav>` landmark, the `<ul>`, and the link labels are all still
 *     server-rendered. What ships to the browser is this component and the pathname it
 *     reads — a few hundred bytes, not the header.
 *
 * The alternative considered and rejected: passing the active href down as a prop from
 * `app/layout.tsx`. A layout cannot read the pathname in the App Router (it is not given
 * `params` for the child route and re-rendering it per route is exactly what layouts avoid),
 * so that would mean threading the value from every page — four pages that must each
 * remember to do it, with a silent failure when one forgets. Reading it at the point of use
 * cannot be forgotten.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

/** Props for {@link NavLink}. */
export interface NavLinkProps {
  /** Root-relative destination, e.g. `"/projects"`. Comes from `NAV_LINKS` in `lib/site.ts`. */
  href: string;
  /** Visible link text. */
  label: string;
  /**
   * Whether to let `next/link` prefetch this destination.
   *
   * Passed straight through to `Link`'s `prefetch` prop. Omitted means Next's default
   * (prefetch on), which is what `components/Nav.tsx` uses since every nav route exists.
   *
   * This affects performance only. Navigation works identically either way.
   */
  prefetch?: boolean;
}

/**
 * Decide whether a nav href is the route the visitor is currently on.
 *
 * @param pathname - The current pathname from `usePathname()`. Never includes the query
 *   string, which is what makes `/projects?tag=React` correctly count as "on /projects" —
 *   a filter is a view of the page, not a different destination.
 * @param href - The nav destination to test.
 * @returns `true` when the link should be marked current.
 *
 * Matching rule: exact match, plus prefix match on a nested route (`/projects/anything`
 * marks `/projects` current) — but NEVER for `"/"`, which would otherwise match every route
 * on the site and mark Home current everywhere. That single exception is the whole reason
 * this is a named function with a test-shaped signature rather than an inline `===`.
 *
 * Side effects: none. Failure modes: none — total over any two strings.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A single primary-navigation link that marks itself when it is the current route.
 *
 * @param props - See {@link NavLinkProps}.
 * @returns A `next/link` anchor carrying `aria-current="page"` and an underline treatment
 *          when current, and the muted resting style otherwise.
 *
 * ACCESSIBILITY CONTRACT — both halves are required, and neither substitutes for the other:
 *   - `aria-current="page"` is the machine-readable half. `"page"` (not `"true"`) is the
 *     correct token: this is a set of links to pages, and screen readers announce it as
 *     "current page".
 *   - The visual half is a colour change to `fg` plus a 2px underline offset clear of the
 *     text. Colour alone would fail WCAG 1.4.1 (use of colour), which is why the underline
 *     is there and is not decoration.
 *
 * `transition-colors` is kept identical to the treatment the header already used, rather
 * than narrowed here. It carries a known cosmetic defect (Tailwind v4 includes
 * `outline-color` in that list, so the global focus ring interpolates from `currentColor`
 * over 150ms — PLANNING.md 1.1 gate note 2), but that defect belongs to every link in the
 * chrome and fixing it in one component would leave the nav internally inconsistent. It is
 * still open and still owned by that note.
 *
 * Side effects: none of its own; `usePathname()` subscribes this component to route
 * changes, so it re-renders on navigation. Failure modes: none — outside a router context
 * `usePathname()` would throw, but the App Router always provides one.
 */
export default function NavLink({
  href,
  label,
  prefetch,
}: NavLinkProps): JSX.Element {
  const pathname = usePathname();
  const current = isCurrentRoute(pathname, href);

  return (
    <Link
      href={href}
      // `undefined` leaves Next's default in place; `false` suppresses the prefetch for a
      // route that does not exist yet. See {@link NavLinkProps.prefetch}.
      prefetch={prefetch}
      // Omitted entirely rather than set to "false" when inactive: `aria-current="false"`
      // is valid but noisier in the accessibility tree than simply not being present.
      aria-current={current ? "page" : undefined}
      // `py-3` takes the link from an 18px-tall hit area to ~42px. This is NOT a
      // conformance fix: the links measure 38-51px wide by 18px tall, which fails the 44pt
      // platform guidance but PASSES WCAG 2.5.8 (Target Size (Minimum), AA) via its spacing
      // exception — centres are 65.5px apart horizontally and >=41px from the toggle and
      // wordmark, comfortably over the 24px threshold. So this is ergonomics, plus margin
      // on an exception the nav would otherwise depend on: any future change that tightens
      // nav spacing would silently turn a passing layout into a failing one.
      //
      // `inline-block` is REQUIRED here, not cosmetic. `Link` renders a bare `<a>`, which
      // is display:inline, and vertical padding on an inline box does not contribute to
      // line-box height — it paints OUTSIDE the line and overlaps whatever is above and
      // below. Measured with `py-3` on the bare inline `<a>`, at a 320px viewport and a
      // 32px root font where the nav wraps to multiple rows: links rendered 84px tall and
      // the padding boxes of adjacent ROWS overlapped by 26px. That is an invisible
      // mis-tap hazard — two links stacked with 26px of shared clickable area, and nothing
      // on the rendered page showing it — and it is strictly worse than the 18px targets
      // this padding exists to fix. `inline-block` makes the padding affect layout, so the
      // rows separate properly.
      //
      // Also deliberately NOT paired with a negative `-my-3` to keep the header's resting
      // height unchanged: that re-creates the same overlap by another route, because the
      // `<ul>`'s `gap-y-2` is smaller than the padding being cancelled.
      className={
        current
          ? "text-fg decoration-accent inline-block py-3 underline decoration-2 underline-offset-4 transition-colors"
          : "text-muted hover:text-fg inline-block py-3 no-underline transition-colors"
      }
    >
      {label}
    </Link>
  );
}
