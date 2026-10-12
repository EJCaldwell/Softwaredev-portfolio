/**
 * app/error.test.tsx — component tests for the route-level error boundary fallback.
 *
 * Owns: the first actual execution of `app/error.tsx`. Everything previously recorded
 * about that file in `QA/1.1_tests/error-and-404-pages.md` was a source read — the
 * component had never rendered in any environment. These tests render it, and render it
 * the way Next.js does: as the fallback of a real React error boundary whose child
 * throws during render.
 *
 * WHY THIS IS A COMPONENT TEST AND NOT AN E2E TEST — the important caveat, do not lose it:
 *
 *   Three separate attempts were made to induce Next's own boundary in a real browser
 *   without editing application code (the verification gate must not fix or instrument
 *   the product):
 *     1. Poisoning `HTMLElement.prototype.dataset` for `<html>`, which the (since
 *        removed) theme hook read during render. Result: the throw happened during
 *        HYDRATION. React logged it and kept the server-rendered HTML; the boundary did
 *        not render.
 *     2. The same poison armed after load, then activating the (since removed) theme
 *        toggle. Result: the throw landed in the click handler, i.e. outside the render phase, so it became
 *        an uncaught page error rather than a boundary trigger. Error boundaries do not
 *        catch event-handler errors, by design.
 *     3. Corrupting the RSC (`?_rsc=`) payload of a client-side `<Link>` navigation.
 *        Result: Next detected the bad Flight response and fell back to a full document
 *        navigation, rendering the 404 correctly. Robust behaviour, no boundary.
 *
 *   The conclusion is not "this is untestable" but something more specific and worth
 *   recording: the app currently has no render path that can be made to throw from
 *   outside itself. Its one client component's render is pure and takes no poisonable
 *   input. So the boundary's OWN behaviour — what it renders, what it refuses to render,
 *   whether `reset` recovers — is verified here, at the level where a throw can actually
 *   be arranged. What remains unverified by any automation is the FRAMEWORK WIRING: that
 *   Next selects this file as the fallback for a real route error. That is a file-name
 *   convention Next guarantees, `next build` accepts the file, and it stays as one
 *   narrow manual step in the checklist (add a temporary `throw` to a page, look, revert).
 *
 * Runner: Vitest + jsdom (`*.test.tsx`, per the split in `vitest.config.mts`).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

/** The message a thrown error carries; must never reach the rendered output. */
const SECRET_MESSAGE = "connect ECONNREFUSED 10.0.0.5:5432 as user svc_prod";

/** Props for the test-only boundary below. */
type BoundaryProps = {
  /** Tree to render; expected to throw on first render. */
  children: ReactNode;
  /** Digest to pass through to the fallback, mimicking a server-render error. */
  digest?: string;
};

/** State of the test-only boundary: the caught error, if any. */
type BoundaryState = { error: (Error & { digest?: string }) | null };

/**
 * A minimal React error boundary that renders `app/error.tsx` as its fallback.
 *
 * This stands in for Next.js's own boundary. It is deliberately a faithful shape rather
 * than a convenience: it catches during render (`getDerivedStateFromError`), and its
 * `reset` clears the caught error and re-renders the children — exactly the contract
 * `app/error.tsx` documents for the `reset` prop it receives.
 *
 * @param props.children - Subtree to render and to re-render on reset.
 * @param props.digest - Optional digest attached to the caught error before it is handed
 *                       to the fallback, so the digest branch can be exercised.
 * Side effects: none beyond React state. `componentDidCatch` is implemented and silent
 * so React's own "uncaught error" console noise is not mistaken for the component's
 * logging, which is asserted separately.
 * Failure modes: if the child does not throw, the fallback never renders and the
 * assertions in the test fail loudly rather than silently passing.
 */
class TestBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(): void {
    // Intentionally empty, and intentionally parameterless: React only needs the method
    // to exist to consider the error handled, and named-but-unused parameters trip
    // `@typescript-eslint/no-unused-vars`.
  }

  /** Clears the caught error, which is what Next's `reset` does. */
  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.digest !== undefined) error.digest = this.props.digest;
      return <ErrorPage error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

/**
 * A child that throws on its first render and succeeds afterwards.
 *
 * Module-level mutable state is used rather than a prop because the component must
 * behave DIFFERENTLY across two renders of the same element, which is exactly the
 * "transient failure that a retry fixes" case `reset` exists for.
 */
let shouldThrow = true;

/**
 * Test child component.
 *
 * @returns Recovered content once `shouldThrow` is false.
 * @throws `SECRET_MESSAGE` while `shouldThrow` is true.
 */
function Boom(): ReactNode {
  if (shouldThrow) throw new Error(SECRET_MESSAGE);
  return <p>Recovered content</p>;
}

describe("app/error.tsx — the route error boundary fallback", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught errors to console.error itself, and so does the component under
    // test. Silenced so a passing run is quiet, and spied so the component's own log can
    // be asserted rather than assumed.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    shouldThrow = true;
  });

  it("renders the designed error state, not a blank page, when a child throws", () => {
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText(/trying again often\s+works/i)).toBeInTheDocument();
  });

  it("does NOT leak error.message or a stack trace to the page", () => {
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    // The exact message, any fragment of it that would identify infrastructure, and the
    // shape of a stack frame are all checked — a partial leak is still a leak.
    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toContain(SECRET_MESSAGE);
    expect(rendered).not.toContain("ECONNREFUSED");
    expect(rendered).not.toContain("svc_prod");
    expect(rendered).not.toContain("10.0.0.5");
    expect(rendered).not.toMatch(/\bat\s+\w+\s+\(/); // stack frame
    expect(rendered).not.toMatch(/\.tsx?:\d+/); // file:line
  });

  it("offers three exits: retry, home, and a mailto", () => {
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    // A real button and real links, so all three are keyboard-operable without extra work.
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: /^Email / }).getAttribute("href"),
    ).toMatch(/^mailto:.+@.+/);
  });

  it("reset() re-renders the failed subtree, recovering from a transient error", async () => {
    const user = userEvent.setup();
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();

    // Make the next render succeed, i.e. model a transient failure.
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered content")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).not.toBeInTheDocument();
  });

  it("reset() on a persistent error returns to the error page instead of crashing", async () => {
    // The documented failure mode: a non-transient cause lands back here. What must not
    // happen is the app losing its shell or the page going blank.
    const user = userEvent.setup();
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
      "the retry affordance disappeared after one failed retry",
    ).toBeInTheDocument();
  });

  it("shows the digest as a reference code when the error carries one", () => {
    render(
      <TestBoundary digest="a1b2c3d4">
        <Boom />
      </TestBoundary>,
    );

    // Framed as a reference, and it is the ONLY detail shown — still no message.
    expect(screen.getByText("Reference: a1b2c3d4")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(SECRET_MESSAGE);
  });

  it("omits the reference line entirely for a client-side error with no digest", () => {
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );
    expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
  });

  it("logs the error to the console for the operator", () => {
    render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    // The component's own log, identified by its message prefix — React's separate
    // internal error logging also lands on the same spy, so the call is matched rather
    // than counted.
    const logged = vi
      .mocked(console.error)
      .mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("Unhandled error rendering route"),
      );
    expect(
      logged.length,
      "the error was not logged, so a production failure would leave no trace",
    ).toBe(1);
    expect((logged[0]?.[1] as Error | undefined)?.message).toBe(SECRET_MESSAGE);
  });

  it("keeps the page-shell layout classes so it renders inside the site chrome", () => {
    // `app/error.tsx` renders inside the root layout, so it must supply only a section
    // and must use the max-w-page > max-w-measure nesting every page follows — the same
    // pattern whose left-edge alignment is asserted in e2e/layout.spec.ts.
    const { container } = render(
      <TestBoundary>
        <Boom />
      </TestBoundary>,
    );

    const section = container.querySelector("section");
    expect(section, "the fallback does not render a <section>").not.toBeNull();
    expect(section!.className).toContain("max-w-page");
    expect(
      section!.querySelector(".max-w-measure"),
      "the measure column is not nested inside the page container",
    ).not.toBeNull();
    // It must not introduce a second <main>; the root layout owns the only one.
    expect(container.querySelector("main")).toBeNull();
  });
});
