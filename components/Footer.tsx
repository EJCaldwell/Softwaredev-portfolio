/**
 * components/Footer.tsx — the persistent site footer.
 *
 * Owns: the copyright byline, a repeat of the site's page links (Home / Projects /
 * About, from `NAV_LINKS` — so a visitor who has scrolled to the bottom can move on
 * without scrolling back up), and the contact/profile links (email, GitHub, and LinkedIn
 * when configured). Rendered once by `app/layout.tsx` below `<main>`.
 *
 * Server component: the copyright year is computed at render time on the server, which
 * for statically-generated routes means "at build time".
 */

import Link from "next/link";
import type { JSX } from "react";
import { NAV_LINKS, SITE } from "@/lib/site";

/** Shared underline-link styling for the footer's outbound links. */
const LINK =
  "text-fg decoration-border hover:decoration-accent underline underline-offset-4 transition-colors";

/**
 * The site footer.
 *
 * @returns A `<footer>` landmark with the byline, a `<nav aria-label="Footer">` of page
 *   links, and a list of contact links. LinkedIn is rendered only when `SITE.linkedinUrl`
 *   is set.
 *
 * Page links use `next/link` (client-side navigation, so the page fade in
 * `components/PageTransition.tsx` plays, same as the header). The `aria-label` is what
 * distinguishes this landmark from the header's `<nav aria-label="Primary">` — two
 * unlabelled `<nav>`s would be announced identically by screen readers. No
 * `aria-current` here: the header already marks the current page, once.
 *
 * Side effects: none.
 *
 * Known limitation: the year comes from `new Date()` during the server render, so a build
 * made in December and left undeployed shows last year in January. Accepted rather than
 * paying for a client-side hydration boundary on a footer line.
 */
export default function Footer(): JSX.Element {
  const year = new Date().getFullYear();

  return (
    /* Decorative hairline: stays on the low-contrast `border` token deliberately.
       `outline` is for control boundaries only. */
    <footer className="border-border/70 mt-24 border-t">
      <div className="text-muted max-w-page mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-8 text-sm">
        <p>
          © {year} {SITE.name}
        </p>
        <nav aria-label="Footer">
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
          <li>
            <a href={`mailto:${SITE.email}`} className={LINK}>
              Email
            </a>
          </li>
          <li>
            <a href={SITE.githubUrl} rel="noopener noreferrer" className={LINK}>
              GitHub
            </a>
          </li>
          {SITE.linkedinUrl !== undefined ? (
            <li>
              <a
                href={SITE.linkedinUrl}
                rel="noopener noreferrer"
                className={LINK}
              >
                LinkedIn
              </a>
            </li>
          ) : null}
        </ul>
      </div>
    </footer>
  );
}
