/**
 * app/not-found.tsx — the site's 404 page.
 *
 * Owns: what a visitor sees when a route does not exist. Next.js renders this for any
 * unmatched path and for any explicit `notFound()` call, inside the root layout — so the
 * nav, footer, and theme are already present and this file supplies only the page body.
 *
 * It has to look deliberate, not like a crash, and it must always offer a route back to
 * something useful — stale links to old project URLs are the likely way visitors land here.
 *
 * Server component, statically rendered at build time.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { JSX } from "react";
import { SITE } from "@/lib/site";

/**
 * Metadata for the 404 route. Set explicitly so the tab does not inherit the site
 * default and read as though a real page loaded.
 */
export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The 404 page body.
 *
 * @returns A short explanation plus exits: home, the projects list (what most visitors
 *          came for), and a direct email link.
 *
 * Props: none. Side effects: none. Failure modes: none — fully static, no data access.
 *
 * Styling notes: the pill's rest border is `border-outline` (the control-boundary token,
 * >=3:1 against both `bg` and `surface`) rather than `border-border`, which is the ~1.3:1
 * decorative page hairline and cannot delineate a control. Hover goes to `border-fg`
 * outright; the previous `border-fg/30` measured 1.94:1, a change too small to perceive.
 * The eyebrow above the heading carries no `font-mono` — the system documents a single
 * typeface, and `--font-mono` is now reset to `initial` in `app/globals.css`, so the
 * eyebrow's texture comes from `text-sm tracking-wider uppercase` alone.
 */
export default function NotFound(): JSX.Element {
  return (
    /* max-w-page outer / max-w-measure inner: see the layout-widths note in globals.css.
       The measure must nest inside the page container so its left edge lands on the
       nav's left edge; centering 40rem on its own would offset it ~200px at wide sizes. */
    <section className="max-w-page mx-auto px-6 py-24">
      <div className="max-w-measure flex flex-col gap-6">
        <p className="text-muted text-sm tracking-wider uppercase">404</p>
        <h1 className="text-2xl font-semibold">
          This page doesn&rsquo;t exist
        </h1>
        <p className="text-muted text-lg break-words">
          The link may be out of date, or the page may have moved. The projects
          page is the best place to pick things back up.
        </p>
        <p className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <Link
            href="/"
            className="border-outline hover:border-fg text-fg inline-flex items-center rounded-full border px-4 py-2 no-underline transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/projects"
            className="border-outline hover:border-fg text-fg inline-flex items-center rounded-full border px-4 py-2 no-underline transition-colors"
          >
            Browse my work
          </Link>
          <a
            href={`mailto:${SITE.email}`}
            className="text-muted hover:text-fg decoration-border hover:decoration-accent underline underline-offset-4 transition-colors"
          >
            Email {SITE.email}
          </a>
        </p>
      </div>
    </section>
  );
}
