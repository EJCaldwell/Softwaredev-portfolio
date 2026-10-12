/**
 * lib/projects.test.ts — invariants over the real project data in `lib/projects.ts`.
 *
 * These run against the live `PROJECTS` array on purpose: they are the checks a content
 * edit must pass (unique slugs, a featured project for the landing page, well-formed
 * links), so a typo in the data fails here with a readable message.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_TAGS,
  getFeaturedProjects,
  hasPlaceholderProjects,
  PROJECTS,
} from "@/lib/projects";
import type { Project } from "@/lib/types";

describe("PROJECTS data", () => {
  it("has at least one project", () => {
    expect(PROJECTS.length).toBeGreaterThan(0);
  });

  it("uses unique, URL-safe slugs (they become element ids and anchors)", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every project a title, summary, and at least one technology", () => {
    for (const p of PROJECTS) {
      expect(p.title.trim(), p.slug).not.toBe("");
      expect(p.summary.trim(), p.slug).not.toBe("");
      expect(p.tech.length, p.slug).toBeGreaterThan(0);
    }
  });

  it("lists each technology at most once per project", () => {
    for (const p of PROJECTS)
      expect(new Set(p.tech).size, p.slug).toBe(p.tech.length);
  });

  it("uses absolute http(s) URLs for every link", () => {
    for (const p of PROJECTS) {
      for (const url of [p.repoUrl, p.liveUrl]) {
        if (url !== undefined) expect(url, p.slug).toMatch(/^https?:\/\//);
      }
    }
  });
});

describe("getFeaturedProjects", () => {
  it("returns at least one project so the landing grid is never empty", () => {
    expect(getFeaturedProjects().length).toBeGreaterThan(0);
  });

  it("returns only featured projects, in PROJECTS order", () => {
    const expected = PROJECTS.filter((p) => p.featured).map((p) => p.slug);
    expect(getFeaturedProjects().map((p) => p.slug)).toEqual(expected);
  });
});

describe("ALL_TAGS", () => {
  it("contains every technology exactly once", () => {
    const all = new Set(PROJECTS.flatMap((p) => p.tech));
    expect(new Set(ALL_TAGS)).toEqual(all);
    expect(ALL_TAGS).toHaveLength(all.size);
  });

  it("is sorted case-insensitively", () => {
    const sorted = [...ALL_TAGS].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    );
    expect(ALL_TAGS).toEqual(sorted);
  });
});

describe("hasPlaceholderProjects", () => {
  /** Minimal fixture; only `placeholder` matters to the function under test. */
  const base: Project = {
    slug: "x",
    title: "x",
    summary: "x",
    tech: ["x"],
    featured: false,
    placeholder: false,
  };

  it("is false when no entry is a placeholder", () => {
    expect(hasPlaceholderProjects([base])).toBe(false);
  });

  it("is true when any entry is a placeholder", () => {
    expect(hasPlaceholderProjects([base, { ...base, placeholder: true }])).toBe(
      true,
    );
  });
});
