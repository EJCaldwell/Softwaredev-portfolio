/**
 * app/projects/page.tsx — the `/projects` route: every project, filterable by technology.
 *
 * Owns: the page heading, the tag filter, and the project list. Filter state is the
 * `?tag=` search parameter, resolved on the server by `lib/project-filter.ts`; reading
 * `searchParams` makes this route dynamically rendered, which is cheap here (no data
 * fetching — the project list is a module constant).
 */

import type { JSX } from "react";
import PageTransition from "@/components/PageTransition";
import PlaceholderNotice from "@/components/PlaceholderNotice";
import ProjectCard from "@/components/ProjectCard";
import TagFilter from "@/components/TagFilter";
import { containsPlaceholder } from "@/lib/placeholder";
import { filterProjects, parseTag, TAG_PARAM } from "@/lib/project-filter";
import { ALL_TAGS, hasPlaceholderProjects, PROJECTS } from "@/lib/projects";
import { PROJECTS_PAGE } from "@/lib/site";

/** Route metadata; the root layout's template appends the site owner's name. */
export const metadata = {
  title: PROJECTS_PAGE.metaTitle,
  description: PROJECTS_PAGE.metaDescription,
};

/**
 * The projects page.
 *
 * @param props.searchParams - Promise of the query params (Next 16 delivers them async).
 *   Only `tag` is read; anything else is ignored.
 * @returns The page heading, filter nav, and the (possibly filtered) project list.
 *   An unknown `?tag=` resolves to the full list rather than an empty page.
 * Side effects: none. Failure modes: none — invalid input degrades to "All".
 */
export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">): Promise<JSX.Element> {
  const activeTag = parseTag((await searchParams)[TAG_PARAM], ALL_TAGS);
  const visible = filterProjects(PROJECTS, activeTag);
  const showNotice =
    hasPlaceholderProjects() || containsPlaceholder(PROJECTS_PAGE.intro);

  return (
    // Fades this page's content out/in on navigation — see components/PageTransition.tsx.
    <PageTransition>
      <section className="max-w-page mx-auto px-6 py-12 md:py-24">
        <div className="flex flex-col gap-12">
          <header className="max-w-measure flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">{PROJECTS_PAGE.heading}</h1>
            <p className="text-muted text-lg break-words">
              {PROJECTS_PAGE.intro}
            </p>
          </header>

          <TagFilter
            tags={ALL_TAGS}
            active={activeTag}
            label={PROJECTS_PAGE.filterLabel}
            allLabel={PROJECTS_PAGE.allLabel}
          />

          {visible.length === 0 ? (
            // Reachable only if the data changes so a known tag has no projects; kept so the
            // page never renders as a silent blank.
            <p className="text-muted">{PROJECTS_PAGE.emptyMessage}</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-2">
              {visible.map((project) => (
                <li key={project.slug} className="min-w-0">
                  <ProjectCard project={project} headingLevel={2} />
                </li>
              ))}
            </ul>
          )}

          {showNotice ? <PlaceholderNotice /> : null}
        </div>
      </section>
    </PageTransition>
  );
}
