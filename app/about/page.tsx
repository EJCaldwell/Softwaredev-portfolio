/**
 * app/about/page.tsx — the `/about` route: who the developer is.
 *
 * Owns: the page header with headshot, the background (bio) section, the grouped skills
 * list, and the experience and education timelines. All copy and structured content comes
 * from `ABOUT_PAGE` / `HEADSHOT` in `lib/site.ts`; this file is layout only.
 *
 * Heading order: one `<h1>`, then one `<h2>` per section, no skipped levels.
 * Statically rendered: no request data is read.
 */

import Image from "next/image";
import type { JSX } from "react";
import PageTransition from "@/components/PageTransition";
import PlaceholderNotice from "@/components/PlaceholderNotice";
import { containsPlaceholder } from "@/lib/placeholder";
import { ABOUT_PAGE, HEADSHOT } from "@/lib/site";
import type { TimelineEntry } from "@/lib/types";

/** Route metadata; the root layout's template appends the site owner's name. */
export const metadata = {
  title: ABOUT_PAGE.metaTitle,
  description: ABOUT_PAGE.metaDescription,
};

/**
 * The about page.
 *
 * @returns Header (h1, intro, headshot) followed by bio, skills, experience and education
 *   sections, and the placeholder notice while any stand-in copy remains.
 * Side effects: none.
 */
export default function AboutPage(): JSX.Element {
  return (
    // Glitches this page's content out/in on navigation — see components/PageTransition.tsx.
    <PageTransition>
      <section className="max-w-page mx-auto px-6 py-12 md:py-16">
        <div className="flex flex-col gap-12">
          {/* Intro + Background in the left column, headshot to the right spanning both,
            from md up. A grid rather than a flex row so Background sits directly under
            the intro instead of below the (taller) photo — a flex row left a large empty
            gap there. DOM order stays header → photo → Background, so on phones (one
            column) and for screen readers the order is unchanged.
            `md:grid-rows-[auto_1fr]`: row 1 hugs the intro; the 1fr row 2 absorbs any
            extra height from the row-spanning photo, so it never opens a gap between
            the intro and Background. */}
          <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[minmax(0,1fr)_auto] md:grid-rows-[auto_1fr]">
            <header className="max-w-measure flex flex-col gap-4 md:col-start-1 md:row-start-1">
              <h1 className="text-2xl font-semibold">{ABOUT_PAGE.heading}</h1>
              <p className="text-muted text-lg break-words">
                {ABOUT_PAGE.intro}
              </p>
            </header>

            {/* The headshot never shrinks (`shrink-0` on the figure), so its reserved
              box is stable. */}
            <div className="md:col-start-2 md:row-span-2 md:row-start-1">
              <Headshot />
            </div>

            <section
              aria-labelledby="background"
              className="max-w-measure flex flex-col gap-3 md:col-start-1 md:row-start-2"
            >
              <h2 id="background" className="text-lg font-semibold">
                {ABOUT_PAGE.bioHeading}
              </h2>
              {ABOUT_PAGE.bio.map((paragraph, index) => (
                // Index key is safe: the list is a static constant, never reordered.
                <p key={index} className="text-muted break-words">
                  {paragraph}
                </p>
              ))}
            </section>
          </div>

          <section aria-labelledby="skills" className="flex flex-col gap-4">
            <h2 id="skills" className="text-lg font-semibold">
              {ABOUT_PAGE.skillsHeading}
            </h2>
            {/* A <dl>: each group is a label (area) with a value (its skills), which is
              exactly what description lists exist to mark up. */}
            <dl className="border-border/70 max-w-measure m-0 flex flex-col border-t">
              {ABOUT_PAGE.skills.map((group) => (
                <div
                  key={group.area}
                  className="border-border/70 grid grid-cols-1 gap-x-8 gap-y-1 border-b py-4 last:border-b-0 sm:grid-cols-3"
                >
                  <dt className="text-muted text-sm font-medium tracking-wider uppercase">
                    {group.area}
                  </dt>
                  <dd className="m-0 break-words sm:col-span-2">
                    {group.items.join(", ")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <Timeline
            id="experience"
            heading={ABOUT_PAGE.experienceHeading}
            entries={ABOUT_PAGE.experience}
          />
          <Timeline
            id="education"
            heading={ABOUT_PAGE.educationHeading}
            entries={ABOUT_PAGE.education}
          />

          {containsPlaceholder(ABOUT_PAGE) ? <PlaceholderNotice /> : null}
        </div>
      </section>
    </PageTransition>
  );
}

/**
 * The headshot in a fixed, reserved box.
 *
 * @returns A `<figure>` sized from {@link HEADSHOT} with a `next/image` inside it. The
 *   CSS `aspect-ratio` reserves the box before the image loads (no layout shift);
 *   `max-w-full` + `h-auto w-full` let it shrink proportionally at an enlarged root font.
 *   No `priority`: the image is server-rendered into the initial HTML and is not the LCP
 *   element (the text beside it is larger), so a preload would only compete with fonts/CSS.
 */
function Headshot(): JSX.Element {
  return (
    <figure
      className="m-0 w-[256px] max-w-full min-w-0 shrink-0 overflow-hidden rounded-md"
      style={{ aspectRatio: `${HEADSHOT.width} / ${HEADSHOT.height}` }}
    >
      <Image
        src={HEADSHOT.src}
        alt={HEADSHOT.alt}
        width={HEADSHOT.width}
        height={HEADSHOT.height}
        className="h-auto w-full"
      />
    </figure>
  );
}

/**
 * A titled list of timeline entries (experience or education).
 *
 * @param props.id - Heading id, used for `aria-labelledby`; must be unique on the page.
 * @param props.heading - Visible `<h2>` text.
 * @param props.entries - Entries to list, already in display order.
 * @returns A labelled `<section>` with an `<ol>` (order is meaningful: most recent first).
 *   Each entry's title is an `<h3>` so screen-reader users can jump between entries.
 *   Returns `null` when `entries` is empty, so a section with nothing to list (e.g.
 *   experience before a first job) disappears instead of rendering a bare heading; adding
 *   an entry in `lib/site.ts` brings it back with no code change.
 */
function Timeline({
  id,
  heading,
  entries,
}: {
  readonly id: string;
  readonly heading: string;
  readonly entries: readonly TimelineEntry[];
}): JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={id} className="max-w-measure flex flex-col gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      <ol className="border-border/70 m-0 flex list-none flex-col border-t p-0">
        {entries.map((entry, index) => (
          <li
            key={index}
            className="border-border/70 flex flex-col gap-1 border-b py-4 last:border-b-0"
          >
            <h3 className="font-semibold break-words">{entry.title}</h3>
            <p className="text-muted text-sm break-words">
              {entry.organization} · {entry.period}
            </p>
            {entry.detail !== undefined ? (
              <p className="text-muted break-words">{entry.detail}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
