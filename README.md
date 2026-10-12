# Ethan Caldwell — Developer Portfolio

Personal portfolio site: a landing page, a filterable project list, and an about page.

Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS v4. Tested with
Vitest (unit) and Playwright + axe-core (end-to-end, accessibility, contrast, layout) in
Chromium and WebKit.

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:3000
```

No environment variables are needed; see `.env.example`.

## Editing content

All content lives in two files. Neither one contains JSX.

| What                                                                  | Where                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Name, role, tagline, email, GitHub/LinkedIn links                     | `lib/site.ts` → `SITE`                                                                |
| Landing, projects, and about page copy; skills; experience; education | `lib/site.ts`                                                                         |
| Projects (title, summary, tech tags, repo/live links, featured)       | `lib/projects.ts` → `PROJECTS`                                                        |
| Headshot                                                              | `public/images/headshot.jpg` (update `HEADSHOT` in `lib/site.ts` if the size changes) |

Stand-in text contains the word `PLACEHOLDER`. Run `grep -rn PLACEHOLDER lib/` to list
what's left to write. Each page shows a "placeholder content" notice until none remains.

Project tech tags double as the filter chips on `/projects`. Spell each technology the
same way in every project.

## Routes

| Route       | What it shows                                                                  |
| ----------- | ------------------------------------------------------------------------------ |
| `/`         | Hero, call-to-action links, featured projects                                  |
| `/projects` | All projects; `?tag=<Technology>` filters the list (shareable, no JS required) |
| `/about`    | Headshot, background, skills, experience, education                            |

## Scripts

| Command                           | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                     | Development server                                              |
| `npm run build` / `npm start`     | Production build / serve                                        |
| `npm run lint`                    | ESLint                                                          |
| `npm run typecheck`               | `tsc --noEmit` (generates route types first)                    |
| `npm run format` / `format:check` | Prettier                                                        |
| `npm test`                        | Vitest unit tests                                               |
| `npm run test:e2e`                | Playwright suite. It builds and serves the app itself.          |
| `npm run test:e2e:linux`          | Same suite against Linux WebKit in Docker, matching CI browsers |
| `npm run e2e:reset`               | Kill stray e2e servers. Run this first if e2e fails en masse.   |
| `npm run hooks:install`           | Enable the pre-push gate in `scripts/hooks/`                    |
