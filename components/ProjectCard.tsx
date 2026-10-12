/**
 * components/ProjectCard.tsx — one project, rendered as a card.
 *
 * Owns: the visual and semantic presentation of a single `Project`: title, summary, tech
 * tags, and outbound links. Used by the featured grid on `/` and the list on `/projects`.
 *
 * Server component: no state, no effects, no client JS.
 */

import type { JSX } from "react";
import type { Project } from "@/lib/types";

/**
 * Props for {@link ProjectCard}.
 */
type ProjectCardProps = {
  /** The project to render. */
  readonly project: Project;
  /**
   * Heading level for the title. `/` nests cards under an `<h2>` section heading, so
   * titles are `h3` there; `/projects` has only the page `<h1>` above, so `h2`. Passed in
   * rather than guessed so heading order never skips a level.
   */
  readonly headingLevel: 2 | 3;
};

/**
 * Renders a project card as an `<article>` labelled by its title.
 *
 * @param props.project - The project data.
 * @param props.headingLevel - `2` or `3`; see {@link ProjectCardProps.headingLevel}.
 * @returns The card. The `id` is the project's slug, so `/projects#<slug>` deep-links to it.
 *
 * The `project-card` class (defined in `app/globals.css`) adds the maroon corner glow and
 * the hover / keyboard-focus state: the glow brightens and the border warms toward gold.
 *
 * Link names: each card has its own "Source"/"Live site" links, so the visible word alone
 * would be ambiguous out of context. An `aria-label` adds the project title and STARTS
 * with the visible text (WCAG 2.5.3 Label in Name, so speech users can say "click
 * Source"). Not an `sr-only` span: its clipped, nowrap text is measured as painting
 * outside the card by the layout suite's text-overflow check at enlarged text sizes.
 *
 * Links open in the same tab (no `target="_blank"`): users choose new-tab themselves, and
 * forcing it breaks the back button. External links carry `rel="noopener noreferrer"`
 * anyway, which is harmless and future-proofs a later switch to new tabs.
 *
 * Side effects: none. Failure modes: none — missing optional links simply aren't rendered.
 */
export default function ProjectCard({
  project,
  headingLevel,
}: ProjectCardProps): JSX.Element {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `${project.slug}-title`;

  return (
    <article
      id={project.slug}
      aria-labelledby={titleId}
      className="project-card border-border bg-surface flex h-full min-w-0 flex-col gap-4 rounded-md border p-6"
    >
      <Heading id={titleId} className="text-lg font-semibold break-words">
        {project.title}
      </Heading>
      {project.wip === true ? (
        // Text, not just a colour, so the status reads the same to everyone. Sits after
        // the heading (not inside it) so the card's accessible name stays the title.
        // `max-w-full wrap-anywhere`: same 200%-text reflow fix as the tech pills below.
        <p className="border-outline text-muted -mt-2 max-w-full self-start rounded-full border px-3 py-1 text-sm wrap-anywhere">
          Work in progress
        </p>
      ) : null}
      <p className="text-muted break-words">{project.summary}</p>

      {/* The tech list is a real list so assistive tech announces its length. */}
      <ul
        aria-label="Technologies"
        className="m-0 flex list-none flex-wrap gap-2 p-0"
      >
        {project.tech.map((tech) => (
          // `min-w-0 max-w-full wrap-anywhere`: at 200% text a single word ("TypeScript")
          // can be wider than a phone-width card. A flex item's default `min-width: auto`
          // floors it at that word's width, and `overflow-wrap: break-word` does not lower
          // min-content — `anywhere` does — so all three are needed to keep the pill
          // inside the card (WCAG 1.4.10 Reflow; covered by e2e/layout.spec.ts).
          <li
            key={tech}
            className="border-outline text-muted max-w-full min-w-0 rounded-full border px-3 py-1 text-sm wrap-anywhere"
          >
            {tech}
          </li>
        ))}
      </ul>

      {project.repoUrl !== undefined || project.liveUrl !== undefined ? (
        // `mt-auto` pins the links to the card bottom so cards in a grid row align.
        <p className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm">
          {project.repoUrl !== undefined ? (
            <a
              href={project.repoUrl}
              rel="noopener noreferrer"
              aria-label={`Source code for ${project.title}`}
              className="text-fg decoration-border hover:decoration-accent underline underline-offset-4"
            >
              Source
            </a>
          ) : null}
          {project.liveUrl !== undefined ? (
            <a
              href={project.liveUrl}
              rel="noopener noreferrer"
              aria-label={`Live site for ${project.title}`}
              className="text-fg decoration-border hover:decoration-accent underline underline-offset-4"
            >
              Live site
            </a>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
