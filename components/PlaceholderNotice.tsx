/**
 * components/PlaceholderNotice.tsx — the visible "this content isn't real yet" banner.
 *
 * Owns: rendering `PLACEHOLDER_NOTICE` from `lib/site.ts`. Pages render it only while
 * `containsPlaceholder(...)` (lib/placeholder.ts) reports stand-in copy, so it disappears on
 * its own once the real content lands. Server component; no interactivity.
 */

import type { JSX } from "react";
import { PLACEHOLDER_NOTICE } from "@/lib/site";

/**
 * The notice panel.
 *
 * @returns A labelled `<aside>` with a badge line and one sentence naming what to replace.
 *   An `<aside>` (complementary landmark) because it is tangential to the page's content.
 * Side effects: none.
 */
export default function PlaceholderNotice(): JSX.Element {
  return (
    <aside
      aria-label="Placeholder content notice"
      className="border-accent max-w-measure flex flex-col gap-2 rounded-md border px-6 py-4"
    >
      <p className="text-accent text-sm font-semibold tracking-wider break-words uppercase">
        {PLACEHOLDER_NOTICE.label}
      </p>
      <p className="text-muted text-sm">{PLACEHOLDER_NOTICE.body}</p>
    </aside>
  );
}
