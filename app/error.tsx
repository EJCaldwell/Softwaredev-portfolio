/**
 * app/error.tsx — the route-level error boundary for the whole app.
 *
 * Owns: what a visitor sees when a render or data error escapes a route segment. Next.js
 * requires this file to be a client component, because it receives a `reset` callback and
 * must re-render on the client. It renders inside the root layout, so nav, footer, and
 * theme survive the error — only the page body is replaced.
 *
 * Deliberate choice: the visitor is never shown `error.message`. A stack trace or an
 * internal message tells a visitor nothing and reads as a broken site; the real
 * detail goes to the console (and, from Phase 7.1, to the platform's logs). The recovery
 * affordances are what matter: retry, go home, or email directly.
 *
 * Note: this boundary does NOT catch errors thrown in `app/layout.tsx` itself — that
 * requires `app/global-error.tsx`, which is out of scope for this task group.
 */

"use client";

import Link from "next/link";
import { useEffect, type JSX } from "react";
import { SITE } from "@/lib/site";

/**
 * Props Next.js passes to an error boundary file.
 *
 * Typed locally rather than imported because Next does not export a public type for it.
 * The `digest` field is present on errors thrown during a server render — it is the hash
 * Next logs server-side, and it is the only identifier that can correlate what the
 * visitor saw with a server log line.
 */
type ErrorPageProps = {
  /** The thrown error. `digest` is set for server-render errors, absent for client ones. */
  error: Error & { digest?: string };
  /** Re-runs the failed render. Fixes transient failures; a persistent one just re-throws. */
  reset: () => void;
};

/**
 * The app-wide error page.
 *
 * @param props.error - The thrown error; logged, never displayed.
 * @param props.reset - Next.js-provided callback that retries the failed render.
 * @returns An intentional error state with three exits: retry, home, and email.
 *
 * Side effects: logs the error to the console once per distinct error, via an effect keyed
 * on the error object.
 *
 * Failure modes: if the underlying cause is not transient, pressing "Try again" will land
 * back on this page. That is acceptable and expected — the home link and the mailto are
 * the guaranteed-working exits, which is why a retry is not the only affordance offered.
 *
 * Styling notes: the "Try again" pill uses `border-outline` (control-boundary token,
 * >=3:1 against both `bg` and `surface`) at rest and `border-fg` on hover. `border-border`
 * is the ~1.3:1 page hairline and cannot bound a control; the old `hover:border-fg/30`
 * measured 1.94:1, an imperceptible delta from rest. The "Error" eyebrow dropped
 * `font-mono` — `--font-mono` is reset to `initial` in `globals.css` because the system
 * documents one typeface; `tracking-wider uppercase` carries the texture instead.
 */
export default function Error({ error, reset }: ErrorPageProps): JSX.Element {
  useEffect(() => {
    // Console is the only sink available in Phase 1. Phase 7.1 may route this to a real
    // error reporter; keep the digest in the payload if so — it is the server-log key.
    console.error("Unhandled error rendering route:", error);
  }, [error]);

  return (
    /* max-w-page outer / max-w-measure inner: see the layout-widths note in globals.css.
       Nesting is what puts the prose column's left edge on the nav's left edge. */
    <section className="max-w-page mx-auto px-6 py-24">
      <div className="max-w-measure flex flex-col gap-6">
        <p className="text-muted text-sm tracking-wider uppercase">Error</p>
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted text-lg break-words">
          This page failed to load. It is usually temporary — trying again often
          works. If it doesn&rsquo;t, email works regardless.
        </p>
        <p className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <button
            type="button"
            onClick={reset}
            className="border-outline hover:border-fg text-fg inline-flex items-center rounded-full border px-4 py-2 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-muted hover:text-fg decoration-border hover:decoration-accent underline underline-offset-4 transition-colors"
          >
            Back to home
          </Link>
          <a
            href={`mailto:${SITE.email}`}
            className="text-muted hover:text-fg decoration-border hover:decoration-accent underline underline-offset-4 transition-colors"
          >
            Email {SITE.email}
          </a>
        </p>
        {error.digest ? (
          /* Shown only when present, and framed as a reference code rather than an
             error: it is the one piece of detail that helps if a visitor does report
             the problem. */
          <p className="text-muted text-sm">Reference: {error.digest}</p>
        ) : null}
      </div>
    </section>
  );
}
