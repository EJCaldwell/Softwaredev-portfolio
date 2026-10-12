/**
 * eslint.config.mjs — ESLint flat config for the whole repository.
 *
 * Owns: static correctness checking for every `.ts`/`.tsx`/`.mjs` file. `npm run lint`
 * runs this, and `next build` runs it too, so a rule added here can fail CI.
 *
 * Composition, in order (order matters — later entries win):
 *   1. `eslint-config-next/core-web-vitals` — React/Next correctness plus the stricter
 *      Core Web Vitals rules (e.g. no raw `<img>`), which matter because Phase 6.3 has a
 *      performance budget.
 *   2. `eslint-config-next/typescript` — TypeScript-aware rules.
 *   3. `eslint-config-prettier/flat` — MUST be last. It switches OFF every stylistic rule
 *      that Prettier already decides (quotes, semicolons, indentation, line width). This
 *      is the mechanism that stops ESLint and Prettier from fighting: Prettier owns
 *      formatting exclusively, ESLint owns correctness exclusively. Moving this entry
 *      earlier would let a Next preset re-enable a formatting rule and produce lint errors
 *      that `npm run format` cannot satisfy.
 *
 * `globalIgnores` restates eslint-config-next's own default ignores, because supplying a
 * custom flat config replaces those defaults rather than merging with them.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep last: disables formatting rules so Prettier is the sole formatter.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Playwright's generated output. These are already in `.gitignore`, but ESLint does
    // not read `.gitignore`, so without them here `npm run lint` fails for anyone who has
    // run the e2e suite locally — the HTML report bundles minified vendor JS that trips
    // rule after rule, and Babel additionally warns that it exceeds its 500KB codegen
    // limit. The failure is confusing because it points at files nobody wrote and the
    // tempting fix is `rm -rf playwright-report`, which works until the next test run
    // recreates it. That workaround has already been applied twice in this project by
    // people who thought they were removing a stray directory. Ignore the paths instead.
    "playwright-report/**",
    "test-results/**",
    ".playwright/**",
  ]),
]);

export default eslintConfig;
