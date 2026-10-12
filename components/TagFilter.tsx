/**
 * components/TagFilter.tsx — the technology filter chips on `/projects`.
 *
 * Owns: rendering one link per tag plus an "All" link, and marking the active one.
 *
 * How it fits: `app/projects/page.tsx` resolves the active tag from `?tag=` (via
 * `lib/project-filter.ts`) and passes it in. Each chip is a plain `<Link>` to a filter URL,
 * so filtering needs no client state, works without JavaScript, and every filtered view is
 * shareable and back-button friendly.
 *
 * Server component: nothing here runs in the browser.
 */

import Link from "next/link";
import type { JSX } from "react";
import { projectsHref } from "@/lib/project-filter";

/** Props for {@link TagFilter}. */
type TagFilterProps = {
  /** Every selectable tag, display order. */
  readonly tags: readonly string[];
  /** The currently active canonical tag, or `null` when unfiltered. */
  readonly active: string | null;
  /** Accessible name for the `<nav>` landmark. */
  readonly label: string;
  /** Visible text of the unfiltered chip. */
  readonly allLabel: string;
};

/**
 * Base chip classes. `py-3` gives a ≥44px touch target at the default font size.
 * The active chip swaps to the accent border and full-strength text (see `chipClass`).
 */
const CHIP =
  "inline-flex items-center rounded-full border px-4 py-3 text-sm no-underline transition-colors";

/**
 * Returns the classes for a chip in the given state.
 *
 * @param isActive - Whether this chip represents the current filter.
 * @returns Tailwind classes; active state is ALSO conveyed by `aria-current`, never by
 *   colour alone.
 */
function chipClass(isActive: boolean): string {
  return isActive
    ? `${CHIP} border-accent text-fg font-medium`
    : `${CHIP} border-outline text-muted hover:text-fg`;
}

/**
 * The filter navigation.
 *
 * @param props - See {@link TagFilterProps}.
 * @returns A labelled `<nav>` containing a list of links. The active link carries
 *   `aria-current="true"` (not `"page"` — the nav's own `/projects` link already owns
 *   `"page"`, and exactly one element site-wide may claim it).
 *
 * `scroll={false}` keeps the reader's place when switching filters instead of jumping
 * to the top of the page.
 */
export default function TagFilter({
  tags,
  active,
  label,
  allLabel,
}: TagFilterProps): JSX.Element {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        <li>
          <Link
            href={projectsHref(null)}
            scroll={false}
            aria-current={active === null ? "true" : undefined}
            className={chipClass(active === null)}
          >
            {allLabel}
          </Link>
        </li>
        {tags.map((tag) => (
          <li key={tag}>
            <Link
              href={projectsHref(tag)}
              scroll={false}
              aria-current={active === tag ? "true" : undefined}
              className={chipClass(active === tag)}
            >
              {tag}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
