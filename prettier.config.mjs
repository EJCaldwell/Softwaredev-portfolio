/**
 * prettier.config.mjs — Prettier formatting configuration.
 *
 * Owns: all code formatting decisions for the repository. ESLint deliberately owns none of
 * them (see the `eslint-config-prettier` note in `eslint.config.mjs`). `npm run format`
 * applies this config in place; `npm run format:check` asserts it without writing.
 *
 * Non-default choice:
 *   - `plugins: ["prettier-plugin-tailwindcss"]` — sorts Tailwind utility classes into
 *     Tailwind's own canonical order and, critically, keeps class lists in a deterministic
 *     order so diffs on a component reflect real changes rather than reshuffled utilities.
 *     This plugin must be the last plugin loaded if others are ever added; it wraps the
 *     printer and other plugins loaded after it will not see its output.
 *
 * Everything else is intentionally Prettier's default. Defaults are cheaper to maintain
 * than preferences, and no house style has been established for this project.
 */

/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
