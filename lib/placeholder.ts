/**
 * lib/placeholder.ts — detects whether rendered content still contains placeholder copy.
 *
 * Owns: one predicate the pages use to decide whether to show the placeholder notice.
 * Lives apart from `lib/site.ts` so the copy module stays pure data.
 */

import { PLACEHOLDER_MARKER } from "@/lib/site";

/**
 * Whether any string anywhere inside the given values contains {@link PLACEHOLDER_MARKER}.
 *
 * @param values - Any mix of strings, arrays and plain objects (e.g. `ABOUT_PAGE`, `SITE`).
 *   Walked recursively; non-string leaves (numbers, booleans, `undefined`) are ignored.
 * @returns True if the marker appears in at least one string.
 *
 * Failure modes: none for the plain-data inputs this is used with. Cyclic objects would
 * recurse forever, but the site's copy is acyclic `as const` literals.
 */
export function containsPlaceholder(...values: readonly unknown[]): boolean {
  return values.some((value) => {
    if (typeof value === "string") return value.includes(PLACEHOLDER_MARKER);
    if (Array.isArray(value)) return containsPlaceholder(...value);
    if (value !== null && typeof value === "object") {
      return containsPlaceholder(...Object.values(value));
    }
    return false;
  });
}
