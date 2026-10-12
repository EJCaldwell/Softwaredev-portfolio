/**
 * lib/placeholder.test.ts — unit tests for `containsPlaceholder`, which decides whether
 * pages show the placeholder notice.
 */

import { describe, expect, it } from "vitest";
import { containsPlaceholder } from "@/lib/placeholder";
import { PLACEHOLDER_MARKER } from "@/lib/site";

describe("containsPlaceholder", () => {
  it("finds the marker in a plain string", () => {
    expect(containsPlaceholder(`${PLACEHOLDER_MARKER}: todo`)).toBe(true);
    expect(containsPlaceholder("real copy")).toBe(false);
  });

  it("walks nested arrays and objects", () => {
    expect(
      containsPlaceholder({
        a: "real",
        b: [{ c: `x ${PLACEHOLDER_MARKER} y` }],
      }),
    ).toBe(true);
    expect(containsPlaceholder({ a: "real", b: [{ c: "also real" }] })).toBe(
      false,
    );
  });

  it("ignores non-string leaves", () => {
    expect(containsPlaceholder(1, true, null, undefined, { n: 2 })).toBe(false);
  });

  it("returns false for no input", () => {
    expect(containsPlaceholder()).toBe(false);
  });
});
