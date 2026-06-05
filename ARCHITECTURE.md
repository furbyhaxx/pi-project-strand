# Architecture: pi-project-strand

## Overview

A pi package structured as TypeScript extension modules (loaded by jiti, no build step) plus skills (Markdown), registered slash commands, and reference docs. All state is persisted to project-scoped JSON files under `.pi/project/`.

## Structure

```
pi-project-strand/
├── extensions/                    # Pi extension modules (TypeScript, auto-discovered)
│   ├── plan-tracker-core.ts       # Pure functions for session plan tracking
│   ├── plan-tracker.ts            # Pi wrapper: registerTool("plan_tracker")
│   ├── project-tracker-core.ts    # Pure functions for FRS slice/knot state
│   ├── project-tracker.ts         # Pi wrapper: registerTool("project_tracker")
│   ├── project-knowledge-core.ts  # Pure functions: CRUD, graph traversal, glob matching
│   ├── project-knowledge.ts       # Pi wrapper: registerTool("project_knowledge")
│   ├── project-commands.ts        # Pi wrapper: registerCommand("project:*") + pi.sendUserMessage
│   └── superpowers-bootstrap.ts   # before_agent_start hook: injects context per turn
├── skills/                        # Pi skills (SKILL.md directories)
├── references/                    # Reference docs loaded by skills/commands on demand
├── tests/                         # Vitest tests
│   ├── extension/                 # Unit tests for core modules
│   ├── package/                   # Package manifest + README parity tests
│   └── skills/                    # Skill validation tests
└── package.json                   # pi-package manifest
```

## Key Design Decisions

### Core/Wrapper Split

| Decision | Each tool module has a `*-core.ts` (pure functions, no I/O) and a `*.ts` wrapper (pi tool registration + file I/O) |
|----------|---|
| **Rationale** | Pure core functions are fast, deterministic, and fully unit-testable without mocking the filesystem. Wrappers stay thin. |

### Atomic Writes

State files use write-tmp-rename: write to `.json.tmp`, then `fs.rename`. This prevents corrupted state on crash or SIGKILL.

### Preferred Plan Artifacts

Implementation plans are project artifacts, not session-local task state. The preferred location is `.pi/project/plans/<slice-id>/<knot-slug>.md`, matching the tracker hierarchy and giving each active knot one obvious plan file. `project_tracker action=knot:set_plan` still accepts any `file_path`; the convention is a default and discovery aid, not a hard validator.

### Main/Side Slice Tracks

Slices carry a durable `track` axis independent from `status`:

- `main` — the project's spine / main quest
- `side` — optional parallel work / side quest

The invariant is enforced only at mutation time: **at most one `main` slice may be `active` at once**. `side` slices may be active in parallel. Existing state files are normalized by defaulting missing `track` fields to `main`, but legacy multi-active-main states are deliberately grandfathered until the user re-tags them.

Enforcement lives in one shared helper in `project-tracker-core.ts`, called from:

- `handleSliceActivate`
- `handleKnotStart` (because starting a knot implicitly activates the slice)
- `handleSliceSetTrack` (because retagging an already-active slice to `main` could otherwise create a second active main)

### Bootstrap Injection

`superpowers-bootstrap.ts` hooks `before_agent_start` (fires before every LLM call) to inject:
1. Static foundational text (FRS concepts, roles, collaboration model, skill routing)
2. Project tracker context (main quest, active side quests, knots, criteria progress)
3. Knowledge context (all active slice ids, path-triggered entries, constraints, warnings)

Every agent turn starts with full project context — no need to re-read files or re-explain the project.

### Context Scoping in Knowledge Graph

Knowledge entries are surfaced selectively to avoid context bloat:
- `slice_id`-tagged entries appear only when that slice is active; bootstrap now passes **all** active slice ids, with the main quest first so its knowledge wins ordering inside the existing limit
- `path_triggers` (glob patterns) appear when the working path matches
- `constraint` and `warning` category entries always appear
- Recent `decision` and `rejected` entries appear (bounded)

### Glob Matching Limitation

`matchesGlob` in `project-knowledge-core.ts` converts `**` → `.*` and `*` → `[^/]*`, anchored `(^|/)pattern($|/)`. **Mid-segment wildcards like `**/prefix*` will NOT match `segment-prefix`.** Use explicit patterns: `**/edge-recoveryd/**` instead of `**/edge-recov*`.

## Technology Stack

| Technology | Role | Why |
|------------|------|-----|
| TypeScript | Extension modules | Pi loads via jiti — no build step required |
| `node:fs/promises` | State file I/O | Standard Node, no extra deps |
| `jsonc-parser` | JSON parsing | Handles JSON with comments; used for reading config files |
| Vitest | Testing | Fast, ESM-native test runner; matches the project's TypeScript setup |

## Constraints

- **No build step:** Extensions must load as-is via jiti. No TypeScript compilation, no bundling, no generated outputs committed.
- **No circular imports:** `superpowers-bootstrap.ts` imports from `project-tracker.ts` and `project-knowledge.ts`. Those must not import from bootstrap.
- **`peerDependencies` only for pi cores:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox` are peers — never bundled.
- **`StringEnum` required for string enums:** `Type.Union(Type.Literal(...))` breaks Google AI APIs. Always use `StringEnum` from `@earendil-works/pi-ai`.
- **State files are not user-editable:** `.pi/project/state.json` and `.pi/project/knowledge.json` are managed by the tools only. Format can change between versions.
- **Plan files are user/project artifacts:** `.pi/project/plans/<slice-id>/<knot-slug>.md` is the preferred plan location, but project-specific paths are allowed when explicitly linked.
- **Single-active-main invariant:** only one `track: "main"` slice may be active at once; side slices are unlimited. Bare `/project:build` advances only the main quest, while `/project:slice:execute <id>` targets a specific slice.

## Known Issues / Tech Debt

| Issue | Impact | Plan |
|-------|--------|------|
| Legacy state can still contain multiple active main slices | Grandfathered by design, but mutation-time invariant checks block further silent double-activation until the user re-tags or holds one of them | Low priority — compatibility beats surprise data rejection |
| `frs-strategy` skill contains EdgeOS-specific deployment model content | Makes the skill non-generic for other projects | Generalize when publishing to npm; project-specific stuff moves to AGENTS.md |
| Knowledge glob matching doesn't handle mid-segment wildcards | Documented limitation; use explicit full-segment patterns | Low priority — documented workaround exists |
