# Agents

Eight custom subagents for this project. Each is a single self-contained Markdown
file: YAML frontmatter declaring its name, description, tool access, and model,
followed by the system prompt it runs under.

This README has no frontmatter, so Claude Code ignores it when discovering agents.

## Roster

| File | Agent | Owns | Writes files? |
|---|---|---|---|
| `project-coordinator.md` | `project-coordinator` | Decomposition, sequencing, contracts, delegation plans | Yes (plans/docs) |
| `frontend-ui.md` | `frontend-ui` | Web components, styling, client state, routing, forms | Yes |
| `backend-engineer.md` | `backend-engineer` | Endpoints, business logic, schema, migrations, auth | Yes |
| `mobile-ui.md` | `mobile-ui` | Small-viewport layout, touch, mobile nav, on-device perf | Yes |
| `qa-test-engineer.md` | `qa-test-engineer` | Automated tests and manual QA checklists | Yes |
| `code-reviewer.md` | `code-reviewer` | Independent review of a diff for bugs and risk | **No — read-only** |
| `design-a11y-auditor.md` | `design-a11y-auditor` | Visual quality, accessibility, front-end performance | **No — read-only** |
| `docs-maintainer.md` | `docs-maintainer` | README, specs, API docs, `.env.example`, changelog | Yes (docs only) |

---

## project-coordinator

Turns a fuzzy or large request into an ordered, assignable plan. It reads the repo
first, then outputs: the goal, the current state, **the contracts to pin**, phases
and subphases split by owner, numbered task groups with dependencies and
done-criteria, the parallel-safe set, and open questions with a recommendation.

Pinning contracts is the point. Two agents building opposite halves of an interface
that was never specified is the main failure mode of a multi-agent setup, and this
agent exists to settle the API shape and data model *before* parallel work starts.

**Structural limit worth remembering:** subagents cannot spawn subagents. The
coordinator is not a live manager of the others — it hands back a plan naming which
agent takes what, including a draft prompt per dispatch, and you or the main session
fires them.

*Use it for:* anything touching more than one layer, a vague or oversized request,
or when you want to know what can safely run in parallel.

## frontend-ui

The web surface: component structure, styling, layout at desktop and tablet widths,
client state, routing, and forms. It's required to design all four states of every
async surface — loading, empty, error, success — because a screen missing its empty
and error states is unfinished rather than nearly done. It writes accessible markup
as it goes and treats any existing design system or token file as the authority.

It does **not** own the API contract. If the contract is missing or wrong it proposes
the shape it needs instead of reaching into server code.

*Use it for:* new screens, component refactors, responsive desktop layout, wiring UI
to an existing API.

## backend-engineer

Everything behind the API boundary: routes, business logic, data models, migrations,
auth, background jobs, external integrations. Validates at every trust boundary
(including input from your own frontend), keeps internals out of error responses,
and enforces authorization on every protected path rather than only the ones a UI
currently calls.

It must state the contract explicitly for anything a client consumes — method, path,
auth requirement, request payload, response payload, every error case. That block is
the handoff to the UI agents.

*Use it for:* endpoints, schema changes, authorization rules, and defining the
contracts `frontend-ui` and `mobile-ui` build against.

## mobile-ui

The phone and tablet experience, whether that's responsive web or a native/hybrid
surface — it determines which before choosing an approach. Covers small-viewport
layout, 44×44pt minimum touch targets, mobile-appropriate navigation (bottom tabs,
sheets, drawers) rather than a desktop nav crammed narrower, safe areas and notches,
on-screen keyboard behavior, and perceived performance on a mid-range device.

Told to adapt shared components rather than fork them, to justify any duplication,
and to confirm a mobile fix didn't regress desktop.

*Use it for:* mobile-specific bugs, adapting a desktop-first UI to small screens.

## qa-test-engineer

Unit, integration, and end-to-end tests, plus manual checklists for what automation
can't judge — visual correctness, feel, device behavior, third-party interactions.
It's required to be explicit about the automated-versus-manual split so nobody reads
a green suite as full verification.

It tests behavior rather than implementation, covers unhappy paths deliberately
(empty input, missing auth, network failure, malformed payloads, boundary values),
mocks only at real boundaries, and **runs every test it writes**, reporting the real
result. A failure gets reported as a failure with its output.

*Use it for:* coverage after a feature lands, a regression test for a bug, or an
honest account of what is actually verified.

## code-reviewer

Read-only. No edits, no fixes — the value is an independent read. Priority order:
correctness, security, data integrity, reuse and simplification, efficiency, then
missing documentation.

The discipline that keeps it useful: every finding must be verified by tracing the
real code path and constructing a concrete failure scenario — specific inputs or
state producing a specific wrong result. If it can't construct one, the finding is a
style opinion and gets dropped or clearly labeled. It reads surrounding code rather
than judging a diff in isolation, and if nothing survives verification it says so
instead of padding.

*Use it for:* pre-merge review, or after a large change.

## design-a11y-auditor

Read-only. Findings go to `frontend-ui` or `mobile-ui` to fix. Three areas:

- **Visual quality** — spacing on a real scale, limited type scale, small palette,
  clear hierarchy, alignment, theme correctness in both light and dark, and polish
  details like focus rings and designed empty states.
- **Accessibility** — contrast computed rather than eyeballed (4.5:1 body, 3:1 large
  text and UI boundaries), real semantics, full keyboard reachability, accessible
  names, reduced-motion, forms with associated labels and errors, survival at 200%
  zoom.
- **Performance** — unsized images, layout shift, blocking resources, bundle weight,
  fetch waterfalls, long main-thread tasks.

Findings are graded blocking / significant / polish, each with the file, the problem,
the specific fix including the actual value, and the agent who should apply it.

*Use it for:* pre-ship UI checks, accessibility compliance, or a screen that feels
off in a way you can't name.

## docs-maintainer

README, specs, architecture notes, API docs, `.env.example`, changelog, and the
`CLAUDE.md`-style agent-instruction files. Its governing principle: documentation
that contradicts the code is worse than none, because it's trusted. So every
statement is verified against actual code, every printed command is run, and when
docs and code disagree the code wins — the docs get fixed and the discrepancy gets
flagged in case the code is what's actually wrong.

Docs only. If application code is wrong it reports it and hands it off.

*Use it for:* drifted docs, setup that needs to work from a clean clone, or standing
up agent-instruction files.

---

## Using them

Ask for one by name, or describe the work and let the descriptions route it:

```
have backend-engineer add a contact-form endpoint
```
```
use project-coordinator to plan the contact form end to end
```

A typical multi-layer feature runs:

```
project-coordinator  →  plan, contracts pinned
        ↓
backend-engineer     →  contract implemented and documented
        ↓
frontend-ui  +  mobile-ui        (parallel, once the contract is fixed)
        ↓
qa-test-engineer  +  design-a11y-auditor  +  code-reviewer   (parallel)
        ↓
docs-maintainer
```

Independent agents launched in one message run concurrently. The three review-stage
agents don't write files, so they never conflict with each other.

Each agent's final message is all you see of its run, so every one ends with the same
four-part report: **what changed**, **what I verified** (real commands, real output),
**what I did not do**, and **handoff**.

## Portability

Nothing here references this project or any particular stack. Each agent is told to
detect the stack from the files present and to follow existing repo conventions over
its own preferences. Copy any single `.md` into another project's `.claude/agents/`
and its rules travel with it — the shared boundary block is appended to every file
rather than shared between them, which costs some duplication and buys you
single-file portability.

To make one available everywhere instead, put it in `~/.claude/agents/`. Project
files win over user files when names collide.

## Shared rules

Appended identically to all eight:

- **Stay inside the project root** — no `../` escapes, no absolute paths into `$HOME`
  or sibling repos. A task that appears to need something outside the root gets
  reported, not reached for.
- **No outbound side effects** unless asked — no `git push`, no deploys, no publishing.
- **No destructive git** — no `reset --hard`, force-push, branch deletion, or history
  rewriting. Commits only on request.
- **Portable by design** — detect the stack, follow repo conventions.
- **The code documentation standard** from the global `CLAUDE.md`: a block comment
  opening every file, comments on every function/component/hook/struct/type covering
  purpose, parameters, return, side effects, and failure modes, JSDoc for TS/JS,
  `///` on Rust public items, `// SAFETY:` on every `unsafe`, and both sides of every
  IPC or API boundary documented.
- **The four-part report format.**

### One caveat, stated plainly

The folder boundary is a strong instruction, not a sandbox. The two auditors have no
write tools at all, which is real enforcement. The five that write have `Bash`, so
for them the constraint rests on instruction-following. Hard enforcement means `deny`
rules in `.claude/settings.json` — not currently configured.

## Considered and left out

- **devops/release** (build, CI, env, deploy) — genuinely useful once there's
  somewhere to deploy.
- **db/schema specialist** — folded into `backend-engineer`, because splitting schema
  from the code that queries it creates exactly the handoff problem the coordinator
  exists to prevent.
