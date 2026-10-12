/**
 * postcss.config.mjs — PostCSS pipeline for the site's stylesheets.
 *
 * Owns: the single CSS transform step Next.js applies to `app/globals.css` and any other
 * imported CSS. Tailwind CSS v4 ships as one PostCSS plugin that handles both the
 * `@import "tailwindcss"` expansion and vendor prefixing, so no separate `autoprefixer`
 * entry is needed (adding one would duplicate work).
 *
 * Note for anyone looking for `tailwind.config.js`: Tailwind v4 is configured in CSS, not
 * JavaScript. Theme tokens live in the `@theme` block in `app/globals.css`, which is
 * where task group 1.1.2 defines the project's palette, spacing, and type scale.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
