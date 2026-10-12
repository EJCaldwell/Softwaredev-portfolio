/**
 * components/NavLink.test.tsx — unit tests for the current-route rule. Phase 3.2.2.
 *
 * What behaviour this protects, and why it is worth protecting:
 *
 *   1. THE `"/"` EXCEPTION IS THE WHOLE REASON `isCurrentRoute` IS A NAMED, EXPORTED
 *      FUNCTION. Every other href can use a prefix match; `"/"` is a prefix of every route
 *      on the site, so the same rule would mark Home current on `/projects`, `/about`, and
 *      the 404 page simultaneously. That regression is a one-character edit away
 *      (`pathname.startsWith(href)`), it typechecks, and on screen it looks like a styling
 *      quirk rather than a bug — a sighted visitor sees two underlined nav links; a screen
 *      reader hears two "current page" announcements.
 *
 *   2. A QUERY STRING MUST NOT MOVE THE MARKER. `/projects?tag=React` is a VIEW of
 *      `/projects`, not another destination. `usePathname()` already excludes the query, so
 *      this is really a test that nothing downstream reintroduces it (e.g. by passing
 *      `window.location.pathname + search`). Asserted here at unit level and again against
 *      a real browser in `e2e/projects.spec.ts`.
 *
 *   3. NESTED ROUTES. `/projects/some-project` should keep Projects marked. The site ships no
 *      nested project route, so this rule is currently unexercised by the app — which is
 *      exactly when a rule silently rots.
 *
 * SCOPE AND ITS LIMIT — read this before adding an assertion here. `aria-current`
 * UNIQUENESS IS NOT TESTABLE IN THIS FILE, and must not be claimed to be. This component
 * renders one link; a test here can only ever prove that link's own attribute. The Phase
 * 3.2 defect (the nav link and the filter row's "All" chip both claiming
 * `aria-current="page"` for the same URL) is a property of the whole DOCUMENT, and the
 * only assertion that can see it is the document-wide one in `e2e/projects.spec.ts`. A
 * component-scoped uniqueness test here would read as coverage while proving nothing.
 *
 * Runner: Vitest (`npm test`).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NavLink, { isCurrentRoute } from "@/components/NavLink";
import { NAV_LINKS } from "@/lib/site";

/**
 * The pathname `usePathname()` reports to the component under test.
 *
 * A module-level mutable rather than a per-test `vi.mock` factory argument because the
 * mock factory is hoisted above every `const` in this file; the factory closes over this
 * binding and reads it at call time, which is the only ordering that works.
 */
let mockPathname = "/";

// `next/navigation`'s `usePathname` requires an App Router context that RTL does not
// provide. Mocking it is mocking a real framework boundary — the router — rather than
// mocking away the logic under test, which stays the real `isCurrentRoute`.
vi.mock("next/navigation", () => ({
  usePathname: (): string => mockPathname,
}));

describe("isCurrentRoute — exact matches", () => {
  it("marks a route current on itself", () => {
    expect(isCurrentRoute("/projects", "/projects")).toBe(true);
    expect(isCurrentRoute("/about", "/about")).toBe(true);
    expect(isCurrentRoute("/", "/")).toBe(true);
  });

  it("does not mark an unrelated route current", () => {
    expect(isCurrentRoute("/projects", "/about")).toBe(false);
    expect(isCurrentRoute("/about", "/projects")).toBe(false);
  });
});

describe('isCurrentRoute — the "/" exception', () => {
  it('does NOT mark "/" current on /projects', () => {
    // THE CASE THAT BITES. A prefix match would return true here, and Home would be
    // marked current on every page of the site.
    expect(isCurrentRoute("/projects", "/")).toBe(false);
  });

  it('does not mark "/" current on any other route on the site', () => {
    for (const { href } of NAV_LINKS) {
      if (href === "/") continue;
      expect(isCurrentRoute(href, "/")).toBe(false);
    }
  });

  it('does not mark "/" current on a nested route', () => {
    expect(isCurrentRoute("/projects/portfolio-site", "/")).toBe(false);
    expect(isCurrentRoute("/this-route-does-not-exist", "/")).toBe(false);
  });

  it('marks "/" current only on exactly "/"', () => {
    expect(isCurrentRoute("/", "/")).toBe(true);
  });
});

describe("isCurrentRoute — a filter query is still the same route", () => {
  it("marks /projects current on /projects?tag=x", () => {
    // `usePathname()` strips the query, so what actually arrives is "/projects". This pins
    // the contract that the query is never part of the comparison — if a future change
    // fed in a search-bearing string, this is what fails.
    expect(isCurrentRoute("/projects", "/projects")).toBe(true);
    // And, defensively, a pathname that wrongly carried the query must not match either,
    // rather than accidentally matching via the prefix rule.
    expect(isCurrentRoute("/projects?tag=React", "/projects")).toBe(false);
  });
});

describe("isCurrentRoute — nested routes", () => {
  it("marks a parent current on its child route", () => {
    expect(isCurrentRoute("/projects/portfolio-site", "/projects")).toBe(true);
  });

  it("does not match a sibling route that merely shares a prefix", () => {
    // `/projects-archive` starts with `/projects` as a STRING but is a different destination.
    // The trailing slash in the implementation is what prevents this; without it the test
    // fails and the nav marks Projects current on an unrelated page.
    expect(isCurrentRoute("/projects-archive", "/projects")).toBe(false);
  });

  it("is total over odd input rather than throwing", () => {
    expect(() => isCurrentRoute("", "/projects")).not.toThrow();
    expect(isCurrentRoute("", "/projects")).toBe(false);
    expect(isCurrentRoute("/projects", "")).toBe(true);
  });
});

describe("NavLink rendering", () => {
  it('carries aria-current="page" when it is the current route', () => {
    // "page" and not "true" here, deliberately: this is a set of links to PAGES, and the
    // page-level claim belongs to the nav. The filter chips use "true" — see
    // `components/TagFilter.tsx` (`aria-current="true"`) for the other half of that contract.
    mockPathname = "/projects";
    render(<NavLink href="/projects" label="Projects" />);

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("omits aria-current entirely when it is not the current route", () => {
    // Omitted rather than set to "false": valid, but noise in the accessibility tree.
    mockPathname = "/projects";
    render(<NavLink href="/about" label="About" />);

    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("stays current while a tag filter is applied", () => {
    // The pathname `usePathname()` reports for `/projects?tag=React`.
    mockPathname = "/projects";
    render(<NavLink href="/projects" label="Projects" />);

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark Home current while on /projects", () => {
    mockPathname = "/projects";
    render(<NavLink href="/" label="Home" />);

    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("distinguishes the current link by more than colour", () => {
    // WCAG 1.4.1. The underline is not decoration — it is the non-colour half of the
    // active state. A restyle that dropped it would leave hue as the only signal.
    mockPathname = "/projects";
    const { container } = render(<NavLink href="/projects" label="Projects" />);
    const current = container.querySelector("a");

    expect(current?.className).toContain("underline");

    mockPathname = "/about";
    const { container: other } = render(
      <NavLink href="/projects" label="Projects" />,
    );
    expect(other.querySelector("a")?.className).toContain("no-underline");
  });
});
