/**
 * lib/project-filter.test.ts — unit tests for the `/projects` tag-filter logic.
 *
 * Covers the URL trust boundary (`parseTag`), the filter itself, and URL construction.
 * Uses fixtures rather than `PROJECTS` so the tests don't change when content does.
 */

import { describe, expect, it } from "vitest";
import { filterProjects, parseTag, projectsHref } from "@/lib/project-filter";
import type { Project } from "@/lib/types";

/** Canonical tag fixture, including one with URL-significant characters. */
const TAGS = ["C++", "React", "TypeScript"] as const;

/**
 * Builds a minimal project fixture.
 *
 * @param slug - Unique id.
 * @param tech - Technologies for the project.
 * @returns A non-placeholder, non-featured `Project`.
 */
function project(slug: string, tech: string[]): Project {
  return {
    slug,
    title: slug,
    summary: "",
    tech,
    featured: false,
    placeholder: false,
  };
}

describe("parseTag", () => {
  it("returns null when the param is absent or blank", () => {
    expect(parseTag(undefined, TAGS)).toBeNull();
    expect(parseTag("", TAGS)).toBeNull();
    expect(parseTag("   ", TAGS)).toBeNull();
  });

  it("returns the canonical spelling, matching case-insensitively", () => {
    expect(parseTag("typescript", TAGS)).toBe("TypeScript");
    expect(parseTag(" REACT ", TAGS)).toBe("React");
    expect(parseTag("C++", TAGS)).toBe("C++");
  });

  it("resolves an unknown tag to null so stale links show everything", () => {
    expect(parseTag("Cobol", TAGS)).toBeNull();
  });

  it("uses the first value when the key is repeated", () => {
    expect(parseTag(["React", "TypeScript"], TAGS)).toBe("React");
  });
});

describe("filterProjects", () => {
  const list = [
    project("a", ["React", "TypeScript"]),
    project("b", ["C++"]),
    project("c", ["TypeScript"]),
  ];

  it("returns every project, in order, for a null tag", () => {
    expect(filterProjects(list, null).map((p) => p.slug)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps only projects using the tag, preserving order", () => {
    expect(filterProjects(list, "TypeScript").map((p) => p.slug)).toEqual([
      "a",
      "c",
    ]);
  });

  it("does not mutate or alias the input", () => {
    const result = filterProjects(list, null);
    expect(result).not.toBe(list);
    expect(list).toHaveLength(3);
  });
});

describe("projectsHref", () => {
  it("is the bare route when unfiltered", () => {
    expect(projectsHref(null)).toBe("/projects");
  });

  it("encodes URL-significant characters in the tag", () => {
    expect(projectsHref("C++")).toBe("/projects?tag=C%2B%2B");
    expect(projectsHref("C#")).toBe("/projects?tag=C%23");
  });

  it("round-trips through URLSearchParams and parseTag", () => {
    const query = projectsHref("C++").split("?")[1];
    expect(
      parseTag(new URLSearchParams(query).get("tag") ?? undefined, TAGS),
    ).toBe("C++");
  });
});
