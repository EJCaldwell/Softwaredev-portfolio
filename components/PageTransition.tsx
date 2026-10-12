/**
 * components/PageTransition.tsx — the quick fade-out / fade-in between top-level pages.
 *
 * Owns: wrapping one route's content in React's `<ViewTransition>` so that navigating
 * between `/`, `/projects` and `/about` crossfades the page body instead of swapping it
 * instantly. The nav, footer and background stay put; only what is inside `<main>` fades.
 *
 * How it fits: each `page.tsx` (and `not-found.tsx`) wraps its returned markup in this
 * component. It must live in the PAGES, not in `app/layout.tsx`: layouts persist across
 * navigations, so a `<ViewTransition>` there never sees an enter or exit (see
 * `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`, Step 3). Next.js
 * route navigations are React transitions, which is what activates the animation — no
 * client code or config is needed, so this stays a Server Component.
 *
 * The animation itself is the `page-fade` view-transition class, defined in
 * `app/globals.css` (fade-out ~120ms, then fade-in ~200ms). Reduced-motion users get an
 * instant swap via the reduced-motion block there.
 *
 * Browser support: Chromium 125+ and recent Safari/Firefox. Elsewhere the API is absent
 * and pages simply swap instantly, which is the old behavior — nothing breaks.
 */

import type { JSX, ReactNode } from "react";
import { ViewTransition } from "react";

/**
 * Fades its children out when the route is left and in when the route is entered.
 *
 * @param props.children - The page's full content (everything the page renders inside
 *   the layout's `<main>`).
 * @returns The children wrapped in a `<ViewTransition>`. Adds no DOM element of its own,
 *   so it cannot affect layout, landmarks, or the keyboard tab order.
 *
 * `default="none"` matters: without it this boundary would also animate on any other
 * transition that touches the page — notably the `/projects?tag=` filter, which is a
 * same-route navigation and should update in place, not fade the whole page.
 *
 * Side effects: none. Failure modes: none — if the browser lacks the View Transitions
 * API, React renders the children with no animation.
 */
export default function PageTransition({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}
