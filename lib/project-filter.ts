/**
 * lib/project-filter.ts — pure logic for the `/projects` technology filter.
 *
 * Owns: turning the `?tag=` search parameter into a validated tag, filtering projects by
 * it, and building filter URLs. The filter state lives entirely in the URL, so a filtered
 * view is shareable, survives reload, and works with the back button and with JavaScript
 * disabled — the chips are plain links, and `app/projects/page.tsx` reads the param on the
 * server.
 *
 * Kept free of React and Next imports so it is trivially unit-testable
 * (`lib/project-filter.test.ts`).
 */

import type { Project } from "@/lib/types";

/** The search-parameter name carrying the active tag. */
export const TAG_PARAM = "tag" as const;

/**
 * Resolves a raw `?tag=` value to a known tag, or `null` for "show all".
 *
 * Matching is case-insensitive so a hand-typed `?tag=typescript` still works, but the
 * returned value is always the canonical spelling from `knownTags`.
 *
 * @param raw - The param as Next delivers it: a string, an array when the key repeats
 *   (the first value wins), or `undefined` when absent.
 * @param knownTags - The canonical tag list (normally `ALL_TAGS`).
 * @returns The canonical tag, or `null` if the param is absent, empty, or unknown. An
 *   unknown tag deliberately resolves to `null` rather than an empty result, so a stale
 *   shared link degrades to the full list instead of a blank page.
 */
export function parseTag(
  raw: string | string[] | undefined,
  knownTags: readonly string[],
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value.trim() === "") return null;
  const needle = value.trim().toLowerCase();
  return knownTags.find((tag) => tag.toLowerCase() === needle) ?? null;
}

/**
 * Filters projects to those using a tag.
 *
 * @param projects - The full list, in display order.
 * @param tag - A canonical tag, or `null` for no filtering.
 * @returns A new array in the original order; the input is never mutated.
 */
export function filterProjects(
  projects: readonly Project[],
  tag: string | null,
): readonly Project[] {
  if (tag === null) return [...projects];
  return projects.filter((project) => project.tech.includes(tag));
}

/**
 * Builds the URL for a filtered (or unfiltered) projects view.
 *
 * @param tag - A canonical tag, or `null` for the unfiltered list.
 * @returns `/projects` for `null`, otherwise `/projects?tag=<encoded>`. Encoding matters:
 *   tags like "C++" or "C#" contain URL-significant characters.
 */
export function projectsHref(tag: string | null): string {
  if (tag === null) return "/projects";
  return `/projects?${TAG_PARAM}=${encodeURIComponent(tag)}`;
}
