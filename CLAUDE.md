# Project instructions

A software-developer portfolio site for Ethan Caldwell. Next.js 16 (App Router), React 19,
Tailwind v4, Vitest for unit tests, Playwright + axe for e2e (Chromium and WebKit).

Content lives in two JSX-free modules: `lib/site.ts` (identity, nav, page copy, headshot)
and `lib/projects.ts` (project entries). Stand-in copy carries the literal `PLACEHOLDER`;
pages show a visible notice until none remains. Routes: `/`, `/projects` (filterable by
`?tag=`), `/about`, plus the custom 404 and error boundary.

## Agent delegation policy

Custom agents live in `.claude/agents/` (see the README there for the full roster).
**Use them without being asked.** The user should be able to describe work in the
prompt bar and have it routed automatically — do not ask which agent to use, and do
not ask permission to delegate. Pick the owner and dispatch.

### Routing

| Work | Agent |
|---|---|
| Anything touching more than one layer, or vague/large enough that the order isn't obvious | `project-coordinator` first, then dispatch its plan |
| Web components, styling, desktop/tablet layout, client state, routing, forms | `frontend-ui` |
| Endpoints, business logic, schema, migrations, auth, integrations | `backend-engineer` |
| Small-viewport layout, touch targets, mobile nav, on-device performance | `mobile-ui` |
| Tests, coverage, regression tests, manual QA checklists | `qa-test-engineer` |
| Pre-merge review, or any change large enough to warrant an independent read | `code-reviewer` |
| Pre-ship UI check, accessibility, visual polish, front-end performance | `design-a11y-auditor` |
| README, specs, API docs, `.env.example`, changelog | `docs-maintainer` |

### When to handle it yourself instead

Delegation costs a fresh context window, so it loses everything we've discussed. Do
the work directly when:

- It's a one-or-two-file change you already have the context for.
- It's a question, an explanation, or a decision rather than a build task.
- The user is mid-iteration on something you just wrote — you have the thread; an
  agent would start cold.
- Briefing an agent would take longer than doing it.

Delegate when the task is substantial, spans a layer you'd have to go read from
scratch, or benefits from an independent read (`code-reviewer` and
`design-a11y-auditor` are more useful *because* they haven't seen the conversation).

### Dispatch rules

- **Write self-contained prompts.** A subagent sees none of the conversation. Include
  the goal, the relevant file paths, the contract it must honor, and the
  done-criteria. Never pass a prompt containing "the thing we discussed."
- **Pin contracts before parallel work.** Do not run `frontend-ui` and
  `backend-engineer` against an unspecified API shape. Get the contract fixed first —
  by `backend-engineer` or by `project-coordinator` — then fan out.
- **Parallelize deliberately.** Launch independent agents in one message so they run
  concurrently. Safe: the three review-stage agents together (none of them write).
  **Not safe: two write-capable agents at the same time, even on disjoint files.**

  Disjoint files are not enough, and assuming they were cost a full afternoon of
  confusion on 2026-09-17. Three agents were dispatched concurrently on genuinely
  separate files — and they share a working tree. Each runs `npm run build` and the
  full Playwright suite, so one agent's rebuild lands underneath another's running
  server: CSS 404s, and ~100 spurious failures clustered in contrast/theme/layout.
  One agent spent a long time proving the failures were not its own change (reverting
  its files, re-running, diffing the failure sets) and still could not get a
  trustworthy baseline. The same stale-build artifact has now confused four separate
  agents in this project.

  So: **run write-capable agents one at a time**, and establish any baseline yourself,
  serially, with a wiped `.next` and no stray servers, before trusting a number.
  Parallelism is for the read-only reviewers.
- **Continue rather than restart.** Follow up with an agent that already ran by
  messaging it, so it keeps its context, instead of spawning a fresh one.
- **Relay the substance.** The user never sees an agent's report. Summarize what
  changed, what was actually verified, and what was skipped — including failures.

### Standing quality gates

Apply these on your own initiative, not on request:

- After any change to a user-facing surface, run `design-a11y-auditor` before calling
  the work done.
- After any multi-file feature lands, run `code-reviewer`.
- When a feature changes documented behavior, run `docs-maintainer`.
- Tests come from `qa-test-engineer` — but never report a test as passing without the
  real output.

## Working agreements

- Stay inside this project root. No paths outside it.
- No `git push`, deploys, or publishing unless explicitly asked. No destructive git.
- Follow the code documentation standard in the global `CLAUDE.md`: a block comment
  opening every file; purpose, parameters, return, side effects, and failure modes on
  every function, component, hook, struct, and type; JSDoc for TS/JS; `///` on Rust
  public items; `// SAFETY:` on every `unsafe`; both sides of every IPC or API
  boundary documented.
- Report honestly. A failing test is reported as failing, with its output. Skipped
  work is named as skipped.

---

## Vendor-managed section

Everything below this line is written by tooling, not by us. `next dev` appends it via
`node_modules/next/dist/server/lib/generate-agent-files.js`, which rewrites the content
between its own `BEGIN`/`END` markers whenever it runs. There is no opt-out flag — it
writes whenever a `CLAUDE.md` or `AGENTS.md` exists.

It is committed deliberately, on the merits rather than on the block's own argument for
itself: the claim is verifiably true. This project runs Next 16.3.4, which postdates most
model training data, and `node_modules/next/dist/docs/` does exist and is versioned with
the installed package. An agent that reads it is better informed than one that does not.
Adopting it also stops it reappearing as an unexplained dirty file after every dev run.

**Do not hand-edit below this line** — `next dev` overwrites it. Project rules belong
above it, where tooling does not reach.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
