/**
 * lib/projects.ts — the portfolio's project list and the queries over it.
 *
 * Owns: the `PROJECTS` array (the single source of project content), the derived tag list,
 * and small selectors used by `/` and `/projects`. To add a project, append an entry here;
 * no component changes are needed.
 *
 * Invariants (unique slugs, at least one featured project, non-empty tech lists) are
 * asserted by `lib/projects.test.ts` rather than at module load, so a mistake fails the
 * test run with a readable message instead of crashing the build.
 */

import type { Project } from "@/lib/types";

/**
 * Every project shown on the site, in display order (strongest work first).
 *
 * To add one, append an entry. `placeholder: true` marks a stand-in that must be replaced
 * before launch; `wip: true` shows a "Work in progress" badge on the card.
 */
export const PROJECTS: readonly Project[] = [
  {
    slug: "tabletopchaos",
    title: "TableTopChaos",
    summary:
      "A web app for running and storing tabletop RPG campaigns. Game masters keep private organizing tabs and can view every player's character sheet, while each player keeps a free-form character workspace. Data is protected by Postgres row-level security, with no separate app server.",
    tech: ["TypeScript", "React", "Vite", "Supabase", "PostgreSQL", "Vitest"],
    repoUrl: "https://github.com/EJCaldwell/TableTopChaos",
    featured: true,
    wip: true,
    placeholder: false,
  },
  {
    slug: "social-network",
    title: "Social Network API",
    summary:
      "A REST API for a social network: account registration and token-based login, user profiles, posts, comments, likes, following, and a personalized feed. Includes database migrations and a pytest suite covering the full user flow.",
    tech: ["Python", "FastAPI", "SQLModel", "Alembic", "PostgreSQL", "pytest"],
    repoUrl: "https://github.com/EJCaldwell/social-network",
    featured: true,
    placeholder: false,
  },
  {
    slug: "ticket-manager",
    title: "Ticket Manager",
    summary:
      "A campus help-desk app where students and instructors submit, browse, and filter support tickets by status and priority. A Python API backed by PostgreSQL, with a typed React frontend.",
    tech: ["Python", "FastAPI", "PostgreSQL", "TypeScript", "React", "Vite"],
    repoUrl: "https://github.com/EJCaldwell/ticket-manager",
    featured: false,
    placeholder: false,
  },
  {
    slug: "portfolio-site",
    title: "Developer Portfolio",
    summary:
      "This site. A Next.js app with a soft maroon-to-black background, URL-driven project filtering, and automated accessibility, contrast and layout tests run in Chromium and WebKit.",
    tech: [
      "TypeScript",
      "Next.js",
      "React",
      "Tailwind CSS",
      "Playwright",
      "Vitest",
    ],
    featured: false,
    placeholder: false,
  },
];

/**
 * Every distinct technology across all projects, sorted alphabetically
 * (case-insensitive). These are the filter chips on `/projects`.
 */
export const ALL_TAGS: readonly string[] = [
  ...new Set(PROJECTS.flatMap((project) => project.tech)),
].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

/**
 * Projects flagged for the landing page, in `PROJECTS` order.
 *
 * @returns The featured subset; empty only if no entry is featured (which the unit tests
 *   forbid).
 */
export function getFeaturedProjects(): readonly Project[] {
  return PROJECTS.filter((project) => project.featured);
}

/**
 * Whether any project entry is still placeholder content.
 *
 * @param projects - The list to check; defaults to `PROJECTS`. A parameter so tests can
 *   pass fixtures.
 * @returns True if at least one entry has `placeholder: true`.
 */
export function hasPlaceholderProjects(
  projects: readonly Project[] = PROJECTS,
): boolean {
  return projects.some((project) => project.placeholder);
}
