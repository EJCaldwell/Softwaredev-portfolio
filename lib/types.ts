/**
 * lib/types.ts — the content-model contract for the developer portfolio.
 *
 * Owns: the shapes of every piece of structured content the site renders — projects,
 * skill groups, and experience/education timeline entries. Data-only on purpose: no
 * imports, no runtime values, no framework types, so any module (server component, client
 * component, unit test) can import it without pulling anything else into its bundle.
 *
 * How it fits: `lib/projects.ts` and `lib/site.ts` hold values of these types; the route
 * components under `app/` and `components/ProjectCard.tsx` consume them. If a field is
 * added here, the data modules fail to typecheck until it is filled in, which is the
 * point — the compiler is the checklist.
 */

/**
 * One portfolio project, as shown on a card on `/projects` (and on `/` when featured).
 *
 * Every field is `readonly` because the data is a build-time constant; nothing mutates it.
 * Optional links are optional rather than empty strings so a card can render "no live
 * demo" by omission instead of by an emptiness check scattered through JSX.
 */
export interface Project {
  /**
   * URL-safe unique identifier, e.g. `"task-tracker"`. Used as the React key and as the
   * card's anchor id (`/projects#task-tracker`). Uniqueness is asserted by
   * `lib/projects.test.ts`.
   */
  readonly slug: string;
  /** Display title — the card's heading. */
  readonly title: string;
  /** One or two sentences: what it is and what problem it solves. */
  readonly summary: string;
  /**
   * Technologies used, in the order they should be displayed (most important first).
   * These double as the filter tags on `/projects`, so spell a technology identically
   * across projects ("TypeScript", not "Typescript" in one place and "TS" in another) —
   * `ALL_TAGS` in `lib/projects.ts` is derived from them verbatim.
   */
  readonly tech: readonly string[];
  /** Source repository URL (absolute). Omit for closed-source work. */
  readonly repoUrl?: string;
  /** Deployed/live URL (absolute). Omit when there is nothing to visit. */
  readonly liveUrl?: string;
  /** When true the project also appears in the "Featured" section on `/`. */
  readonly featured: boolean;
  /**
   * When true the card shows a "Work in progress" badge, so an unfinished project can be
   * listed honestly. Optional: omit for finished work.
   */
  readonly wip?: boolean;
  /**
   * When true the entry is stand-in content that must be replaced before launch. Lets the
   * pages show a visible notice while any placeholder remains (see `hasPlaceholders` in
   * `lib/projects.ts`), so a fake project can never ship silently.
   */
  readonly placeholder: boolean;
}

/**
 * A labelled group of skills on `/about`, e.g. `{ area: "Frontend", items: [...] }`.
 *
 * Grouped rather than one flat list because a reader scans by area ("what backend work
 * does this person do?"), and the page renders each group as a `<dt>`/`<dd>` pair.
 */
export interface SkillGroup {
  /** Area label — the `<dt>`. Short noun phrase, no trailing colon. */
  readonly area: string;
  /** Skills within the area, display order. Rendered comma-separated in the `<dd>`. */
  readonly items: readonly string[];
}

/**
 * One row of the experience or education timeline on `/about`.
 *
 * `period` is free text ("2024 – present", "Fall 2025") rather than structured dates:
 * the site only ever displays it, never sorts or computes with it, and free text lets the
 * author phrase ranges naturally.
 */
export interface TimelineEntry {
  /** Role or qualification, e.g. "Software Engineering Intern" or "B.S. Computer Science". */
  readonly title: string;
  /** Employer or institution. */
  readonly organization: string;
  /** Human-readable date range. */
  readonly period: string;
  /** Optional one-line description of what was done or studied. */
  readonly detail?: string;
}
