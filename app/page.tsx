/**
 * app/page.tsx — the landing route `/`.
 *
 * Owns: the hero (role, name, positioning line, CTAs) and the featured-projects grid.
 * All copy comes from `lib/site.ts` and all project data from `lib/projects.ts`; this file
 * is layout only.
 *
 * Statically rendered: no request data is read.
 */

import Link from "next/link";
import type { JSX } from "react";
import PlaceholderNotice from "@/components/PlaceholderNotice";
import ProjectCard from "@/components/ProjectCard";
import { containsPlaceholder } from "@/lib/placeholder";
import { getFeaturedProjects } from "@/lib/projects";
import { LANDING_PAGE, SITE } from "@/lib/site";

/**
 * Route metadata. `title` is the FULL title: the root layout's `title.template` applies
 * only to child segments, never to this one.
 */
export const metadata = {
  title: LANDING_PAGE.metaTitle,
  description: SITE.description,
};

/**
 * Shared classes for the two hero CTAs. The primary one is distinguished by an accent
 * border and heavier weight rather than a filled background, so its text stays on the
 * page background and inherits the theme's verified fg/bg contrast in both themes.
 */
const CTA_BASE =
  "inline-flex items-center rounded-md border px-5 py-3 text-sm font-medium no-underline transition-colors";

/**
 * The landing page.
 *
 * @returns The hero `<header>` and the featured-projects `<section>`, inside the page
 *   shell's width container. Heading order: one `<h1>` (name), one `<h2>` (featured),
 *   then `<h3>` per card.
 * Side effects: none.
 */
export default function HomePage(): JSX.Element {
  const featured = getFeaturedProjects();
  const showNotice = containsPlaceholder(SITE.tagline, featured);

  return (
    <section className="max-w-page mx-auto px-6 py-12 md:py-24">
      <div className="flex flex-col gap-24">
        <header className="max-w-measure flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <p className="text-muted text-sm tracking-wider uppercase">
              {SITE.role}
            </p>
            <h1 className="text-2xl font-semibold">{SITE.name}</h1>
            <p className="text-lg text-balance break-words md:text-xl">
              {SITE.tagline}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/projects"
              className={`${CTA_BASE} border-accent text-fg font-semibold`}
            >
              {LANDING_PAGE.projectsCta}
            </Link>
            <a
              href={`mailto:${SITE.email}`}
              className={`${CTA_BASE} border-outline text-fg hover:border-accent`}
            >
              {LANDING_PAGE.contactCta}
            </a>
          </div>
        </header>

        <div className="flex flex-col gap-16">
          <section aria-labelledby="featured" className="flex flex-col gap-6">
            <h2 id="featured" className="text-lg font-semibold">
              {LANDING_PAGE.featuredHeading}
            </h2>
            {/* `md:grid-cols-2`: one column on phones, two from md up. */}
            <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-2">
              {featured.map((project) => (
                <li key={project.slug} className="min-w-0">
                  <ProjectCard project={project} headingLevel={3} />
                </li>
              ))}
            </ul>
            <p>
              <Link
                href="/projects"
                className="text-fg decoration-border hover:decoration-accent text-sm underline underline-offset-4"
              >
                {LANDING_PAGE.allProjectsLink}
              </Link>
            </p>
          </section>

          {showNotice ? <PlaceholderNotice /> : null}
        </div>
      </div>
    </section>
  );
}
