/**
 * lib/useTheme.ts — client-side theme state: read, cycle, persist, sync across tabs.
 *
 * Owns: the browser half of the theming system. The CSS half lives in
 * `app/globals.css` (which resolves `data-theme` on `<html>` into token values) and the
 * anti-flash half lives in the inline bootstrap script in `app/layout.tsx`, which sets
 * `data-theme` before first paint. All three must agree on the storage key and on the
 * meaning of each `ThemePreference` value.
 *
 * Design decisions:
 *   - No React context and no provider. Exactly one component (`components/ThemeToggle`)
 *     consumes this, so a hook over a tiny module-level store is strictly less machinery.
 *   - The **DOM is the source of truth**, not React state: `data-theme` on `<html>` is
 *     already set before hydration by the bootstrap script, and it is what CSS reads.
 *     React merely subscribes to it. That is why this is built on
 *     `useSyncExternalStore` rather than `useState` + `useEffect` — the latter would mean
 *     setting state inside an effect on mount, which cascades an extra render and is
 *     flagged by `react-hooks/set-state-in-effect`.
 *   - `useSyncExternalStore`'s `getServerSnapshot` is what makes this hydration-safe: the
 *     server renders the `"system"` snapshot, and React re-reads the client snapshot after
 *     hydration without a mismatch warning.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The three theme states the site supports.
 *
 * - `"system"` — no explicit choice; `prefers-color-scheme` decides. Represented by the
 *   *absence* of the `data-theme` attribute, because `globals.css` scopes its dark media
 *   query to `:root:not([data-theme])`.
 * - `"light"` / `"dark"` — an explicit choice that overrides the OS setting.
 *
 * Modelled as a string union rather than a boolean because "follow the system" is a real,
 * distinct, and default state — a boolean would force a lie on first visit.
 */
export type ThemePreference = "system" | "light" | "dark";

/**
 * `localStorage` key holding the persisted `ThemePreference`.
 *
 * MUST stay in sync with the inline bootstrap script in `app/layout.tsx`. Changing it
 * silently resets every existing visitor's choice.
 */
export const THEME_STORAGE_KEY = "portfolio-theme";

/**
 * Cycle order used by the toggle button: System → Light → Dark → System.
 * Ordered so the first press moves *to* an explicit choice rather than out of one.
 */
const CYCLE: readonly ThemePreference[] = ["system", "light", "dark"];

/**
 * Returns the preference one step further along {@link CYCLE}.
 *
 * @param preference - The current preference.
 * @returns The preference a single press of the toggle would produce. Wraps around, so
 *          the result is always a valid `ThemePreference`.
 *
 * Side effects: none — pure. Failure modes: none; a value not present in `CYCLE`
 * (impossible for a well-typed argument) falls back to the first entry.
 *
 * ACCESSIBILITY: `components/ThemeToggle` derives **both** its press behaviour and its
 * `aria-label` ("Activate to switch to X") from this single function. That is deliberate —
 * they must agree by construction. Reordering `CYCLE` must not require touching the
 * toggle, and nothing may reimplement this ternary-style locally, or a screen-reader user
 * gets told the wrong next state while the button does something else.
 */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = CYCLE.indexOf(preference);
  // `?? CYCLE[0] ?? "system"` satisfies `noUncheckedIndexedAccess`; the `-1` case
  // (value absent from CYCLE) lands on the first entry.
  return CYCLE[(index + 1) % CYCLE.length] ?? CYCLE[0] ?? "system";
}

/** Subscribers to notify when the preference changes. Module-scoped: one store per tab. */
const listeners = new Set<() => void>();

/** Notifies every subscriber. Called after any change to `data-theme`. */
function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Narrows an arbitrary string to a `ThemePreference`.
 *
 * @param value - Raw value from storage or the DOM; may be `null`, `""`, `undefined`, or
 *                garbage left by an older version of the site.
 * @returns The matching preference, or `"system"` for anything unrecognized.
 *
 * Side effects: none. Failure modes: none — unknown input is coerced, never thrown on.
 */
function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Reads the persisted preference.
 *
 * @returns The stored preference, or `"system"` when nothing usable is stored.
 *
 * Failure modes: `localStorage.getItem` **throws** — it does not return an error — in
 * Safari private browsing (quota 0), when a browser is configured to block site data, and
 * in a cross-origin iframe without storage access. It also legitimately returns `null` on
 * a first visit or `""` after a partial clear. All of those collapse to `"system"`, so the
 * page renders correctly with no stored value.
 */
function readStored(): ThemePreference {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/**
 * Applies a preference to the DOM only. Performs **no** storage write.
 *
 * @param preference - The preference to make visually current.
 *
 * Side effects: sets or removes `data-theme` on `<html>`. That attribute is what
 * `globals.css` resolves into token values, so this call is what actually repaints the
 * theme. Nothing else is touched.
 *
 * Failure modes: none — `document.documentElement` always exists once this module's
 * client code can run, and both attribute operations are non-throwing.
 *
 * Exists separately from {@link applyPreference} so the cross-tab `storage` handler has a
 * write-free path: a receiving tab needs the repaint but already holds the value in its
 * own storage area, so writing it back would only risk an echo between tabs. See the
 * comment on {@link subscribe}.
 */
function applyPreferenceToDom(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

/**
 * Writes the preference to the DOM and then to storage. The user-initiated path.
 *
 * @param preference - The preference to make current.
 *
 * Side effects: everything {@link applyPreferenceToDom} does, plus writing/removing the
 * `localStorage` entry.
 *
 * ORDERING REQUIREMENT: the DOM mutation happens first and the storage write second, and
 * the write is wrapped in try/catch for the reasons listed on {@link readStored}
 * (`setItem` throws under the same conditions, plus at quota). With this order a storage
 * failure degrades to "theme works for this session but is not remembered" instead of
 * "the toggle appears broken". The catch is intentionally silent: a visitor cannot act on
 * it and the visible behaviour is already correct.
 *
 * Call this only for changes *originating* in this tab (the toggle, and the first-subscribe
 * reconciliation). Changes arriving from another tab must use
 * {@link applyPreferenceToDom} instead.
 */
function applyPreference(preference: ThemePreference): void {
  applyPreferenceToDom(preference);

  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage unavailable, blocked, or full — see the note above.
  }
}

/**
 * Current preference, read from the DOM attribute the bootstrap script already set.
 *
 * @returns The live preference. Returns a primitive, so `useSyncExternalStore`'s identity
 *          check is stable without memoization.
 *
 * Side effects: none (read-only DOM access). Failure modes: none.
 */
function getSnapshot(): ThemePreference {
  return parsePreference(document.documentElement.dataset.theme);
}

/**
 * Snapshot used during server render and hydration.
 *
 * @returns Always `"system"` — `localStorage` and the DOM are both unavailable on the
 *          server, and `"system"` is the correct neutral default.
 */
function getServerSnapshot(): ThemePreference {
  return "system";
}

/**
 * Subscribes a React component to preference changes.
 *
 * @param listener - Called whenever the preference changes in this tab or another one.
 * @returns An unsubscribe function that also detaches the `storage` listener.
 *
 * Side effects: on the first subscriber, reconciles `data-theme` against storage. That
 * matters when a strict CSP blocked the inline bootstrap script — this is the correction
 * path that keeps CSS and storage from diverging. Also attaches a `storage` listener so
 * changing the theme in one tab updates the others.
 *
 * LOOP SAFETY: the `storage` handler cannot start a cross-tab echo because it performs no
 * storage write at all — it only mutates the DOM via `applyPreferenceToDom`. That is the
 * whole reason the DOM half of `applyPreference` is split out. Do not "simplify" it back
 * to `applyPreference`: with a write in the handler, tab A's write notifies tab B, whose
 * handler writes and notifies tab A, and so on. (What would happen to break that chain in
 * practice is `setItem`'s spec'd early return when the new value equals the old, which
 * suppresses the event — but that is an engine detail with weaker guarantees for
 * `removeItem` on an absent key, and not something the design should lean on.) The
 * receiving tab gains nothing from writing anyway: the value that triggered the event is
 * already in its storage area.
 */
function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // NOT REDUNDANT with the key check below. `sessionStorage` mutations also dispatch
    // `storage` events to other documents sharing that session-storage area (same-origin
    // iframes), and the intentional `key === null` pass-through — which exists so
    // `localStorage.clear()` is honoured — would let a `sessionStorage.clear()` anywhere
    // in that set reset the visitor to `"system"`, silently discarding an explicit choice
    // mid-session. Scope the handler to the area we actually persist to.
    if (event.storageArea !== window.localStorage) return;
    // `key === null` means the whole area was cleared; treat it as a change to our key.
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    // DOM only — see LOOP SAFETY above.
    applyPreferenceToDom(readStored());
    emit();
  };

  if (listeners.size === 0) {
    const stored = readStored();
    if (stored !== getSnapshot()) applyPreference(stored);
  }

  listeners.add(listener);
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Return shape of {@link useTheme}.
 */
export type UseThemeResult = {
  /** The current preference. `"system"` during server render and hydration. */
  preference: ThemePreference;
  /** Advances System → Light → Dark → System, applying and persisting the result. */
  cycle: () => void;
};

/**
 * Reads, exposes, and advances the visitor's theme preference.
 *
 * @returns {@link UseThemeResult} — the current preference and a `cycle` callback.
 *
 * Side effects: subscribes to cross-tab `storage` events; `cycle` mutates `<html>`'s
 * `data-theme` and writes `localStorage`.
 *
 * Failure modes:
 *   - `localStorage` throws or is empty → treated as `"system"`; see {@link readStored}.
 *   - Bootstrap script blocked by CSP → reconciled on first subscribe, costing at most one
 *     frame of the wrong theme rather than a wrong theme for the whole session.
 *   - Server-render safe: every `window`/`document` access is inside a
 *     `useSyncExternalStore` callback that only runs on the client, or inside `cycle`.
 */
export function useTheme(): UseThemeResult {
  const preference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const cycle = useCallback(() => {
    // Reads the live DOM value rather than the render-time `preference` so a cross-tab
    // update that landed since the last render is not clobbered. Cycle order comes from
    // `nextPreference` alone — see its accessibility note.
    applyPreference(nextPreference(getSnapshot()));
    emit();
  }, []);

  return { preference, cycle };
}
