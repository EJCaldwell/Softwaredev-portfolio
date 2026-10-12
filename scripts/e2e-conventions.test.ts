/**
 * scripts/e2e-conventions.test.ts — lessons this project keeps re-learning, made executable.
 *
 * Owns: enforcing, as tests, the mistakes that have recurred most here. This is a Vitest
 * file, not a Playwright spec, so it runs in the fast unit suite and never needs a browser
 * — it reads the spec files as text.
 *
 * WHY IT LIVES IN `scripts/` AND NOT `e2e/`. `vitest.config.mts` excludes `e2e/**`
 * wholesale, which is the runner split that keeps Vitest from trying to execute Playwright
 * specs. A guard placed inside `e2e/` is therefore never collected and silently never
 * runs — which is how a guard becomes a comforting no-op. It sits here instead, and the
 * first assertion below checks it can still see the specs at all.
 *
 * WHY THIS FILE EXISTS RATHER THAN A PARAGRAPH IN A DOC. The rule below was written down
 * in detail and then broken again by a later author who had access to that write-up. The
 * document was not ignored — it simply was not in the path of the person making the
 * mistake.
 *
 * A test is in that path. That is the whole argument for this file.
 *
 * Adding a rule here is appropriate when a mistake has been made TWICE and has a
 * mechanical signature. A rule with no such signature belongs in prose, not here — a
 * fuzzy guard that misfires teaches people to route around guards.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Absolute path to the e2e directory, resolved from this file rather than from cwd. */
const E2E_DIR = join(import.meta.dirname, "..", "e2e");

/**
 * Every Playwright spec, as `[filename, source]`. Excludes `support/`, which holds the
 * shared helpers the rules below exist to push people toward — a helper is allowed to do
 * the low-level thing it encapsulates.
 *
 * @returns One entry per `*.spec.ts` directly under `e2e/`.
 */
function specSources(): ReadonlyArray<readonly [string, string]> {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .map(
      (name) =>
        [
          name,
          stripComments(readFileSync(join(E2E_DIR, name), "utf8")),
        ] as const,
    );
}

/**
 * Remove block and line comments, so the rules below match CODE rather than prose.
 *
 * @param source - A TypeScript source file.
 * @returns The same source with comment bodies blanked out (newlines preserved, so any
 *   future line-number reporting still lines up).
 *
 * Not cosmetic. The first version of this file matched raw text and immediately flagged
 * two specs whose only offence was a comment *explaining why not to do the thing* — the
 * guard failing in precisely the sloppy way it exists to prevent. A rule that cannot tell
 * code from a warning about code teaches people to route around rules.
 *
 * Deliberately naive: it does not understand comment-like sequences inside string or
 * regex literals. That is acceptable here because the inputs are this repo's own specs and
 * a false positive is loud and immediate rather than silent — but it is the reason this
 * must never be reused as a general-purpose parser.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_match, prefix: string) => prefix);
}

describe("e2e conventions — mistakes this project has made more than once", () => {
  it("has specs to check at all", () => {
    // Guards the guard. If the glob breaks, every rule below passes vacuously and this
    // file becomes a comforting no-op — which is worse than not having it.
    expect(specSources().length).toBeGreaterThan(5);
  });

  it("document-scoped properties are asserted document-wide, not within a subtree", () => {
    // THE RULE: `aria-current="page"` identifies THE current page, so its uniqueness is a
    // property of the document. Assert it against the page, not against one landmark.
    //
    // WHY: a nav-scoped assertion passed while the filter row's "All" chip ALSO claimed
    // `aria-current="page"` — two elements each announcing themselves as the current page,
    // in a suite of 333 green tests. A scoped assertion structurally cannot see that. The
    // same shape then recurred scoped by STATE (checked on two of eight URLs) and by ROUTE
    // (checked on one route but never on /).
    //
    // Mechanical signature: counting `[aria-current="page"]` off a locator that is itself
    // scoped to a role/landmark. A `page.locator(...)` count is fine; a
    // `someNav.locator(...)` count is not, unless it is counting something other than the
    // page-level claim.
    const offenders: string[] = [];
    for (const [name, source] of specSources()) {
      const scopedCount =
        /\b(?!page)[A-Za-z_$][\w$]*\s*\n?\s*\.locator\(\s*['"`]\[aria-current="page"\]/.test(
          source,
        );
      if (scopedCount) offenders.push(name);
    }

    expect(
      offenders,
      `These specs count [aria-current="page"] within a scoped locator. Uniqueness of the ` +
        `current-page claim is a property of the DOCUMENT — assert it with ` +
        `page.locator('[aria-current="page"]'). A nav-scoped version of this assertion ` +
        `passed while a second element elsewhere on the page also claimed it.`,
    ).toEqual([]);
  });
});
