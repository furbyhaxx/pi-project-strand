# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed — BREAKING (project strand redesign; no runtime back-compat — `/mnt/Projects` migrated once)
- **state model rewritten** to be persistent-record-centric: each slice embeds its own named `strand` whose `knots[]` are durable records that accumulate goals, individually-verified `success_criteria` (with per-criterion evidence + `met_at`), an optional per-knot `plan`, and `resources`. Nothing is erased on completion — replaces the old transient `active_knot` + lossy `knot_history` (which discarded criteria) and the per-knot-wiped `active_plan`.
- **config**: `.pi/project.jsonc` now defines named `strands` (templates) instead of a single flat `knots` array. Strands are seed-only — snapshotted onto a slice at creation, with no runtime relation back to config and no default strand. Ships built-in `quick` (Prototype→Realization→Finalization) and `granular` (Proof-of-Work→…→Release) strands.
- **`project_tracker` action surface tightened** to 20 actions sharing a lean param schema: cross-cutting `verify_criterion` / `annotate` / `resource:add` / `resource:remove` use a `target: "slice" | "knot"` discriminator; `knot:sign_off` (lossless) and `slice:sign_off` replace the old advance flow; added `slice:update`, `knot:update`, `knot:set_plan`. Errors stay in-band and name the fix.
- replaced `/project:brainstorm` with `/project:new:slice` — an interactive funnel that captures the slice goal + success criteria, selects a strand via `ask_user_question` (per-option previews + recommendation), and creates the slice as `defined`.
- added `/project:slice:advance` for final slice sign-off; `/project:knot:advance` now signs off the active knot under the new model.

### Added
- persistent per-knot `goals`, verifiable `success_criteria`, `plan`, and `resources`, plus slice-level `goal` + `success_criteria` and `resources` (`doc|file|url|report|memory|knowledge`).
- one-shot legacy state migration: pure `migrateLegacyState` (Pass-1 mechanical transform, unit-tested) + throwaway `scripts/migrate-state.ts` runner; Pass-2 is an interactive per-slice agent backfill that clarifies missing fields with the user (design §9).
- added `ask_user_question` tool (snake_case, shipped with pi-project-strand) replicating the Claude Code AskUserQuestion TUI — bordered box, chip-tab navigation, preview pane, notes mode, multi-select, Other… escape hatch, double-Esc dismiss with `terminate: true`
- added `knot:complete_fast_forward` action to `project_tracker` for agents to close an executed fast-forward plan
- added `/project:knot:fast_forward <slice-id>` slash command — opens an editor where the user picks a target knot and writes instructions; the agent then synthesizes a combined action plan (from squashed knot quality bars + user instructions), presents it for approval, executes it, and records a single `fast-forward` history entry
- added `PendingFastForward` state on slices and `fast_forward` metadata on `KnotRecord` to track in-flight fast-forwards and preserve full audit history
- added persistent `project_knowledge` and `project_tracker` extensions for project-scoped memory, slice/knot state, and FRS criteria tracking
- added `project-commands` extension with `/project:onboard`, `/project:brainstorm`, `/project:build`, `/project:implement`, and `/project:change` slash commands backed by `pi.sendUserMessage(...)`
- added required project file templates and self-documentation files (`PROJECT.md`, `VISION.md`, `ARCHITECTURE.md`, `AGENTS.md`)

### Fixed
- `ask_user_question` no longer crashes the agent on narrow terminals (e.g. a desktop→mobile SSH resize). The dialog forced a 40-column minimum box width and truncated to it, so on a 28-column terminal every rendered line exceeded the terminal width and pi-tui threw `Rendered line exceeds terminal width`. Box layout now clamps to the live terminal width (extracted as tested pure `boxLayoutWidth`), guards `innerWidth`, and the final truncate uses the live width

### Changed
- `buildProjectStrandContext` now returns `{ text, activeSliceId }` and uses a single `loadState` call (was two), eliminating a redundant third call in the bootstrap hook
- `buildProjectStrandContext` emits a `⚡ FAST-FORWARD PENDING` context block when a fast-forward is in-flight, including per-knot focus descriptions and the required 4-step agent instruction (load skill → synthesize plan → get approval → complete)
- `computeNext` now surfaces pending fast-forwards as the top-priority next action ahead of normal knot work
- `superpowers-bootstrap` fixed `ask_user_question` tool name (was referencing `AskUserQuestion` from the external `@mazli/pi-ask-user-question` package) and made `delegate` reference conditional on pi-teammates being installed
- expanded bootstrap context with FRS/MVFoS foundations, collaboration roles, Key Account Manager behavior, project memory usage, and skill routing
- required PROJECT.md to include a high-level Planned Features / Capabilities map so agents understand the user's intended end state
- updated `/project:*` workflows and core planning skills to anchor slices, plans, execution, and verification to PROJECT.md planned capabilities

## [0.3.0] - 2026-05-20

### Changed
- synced core workflow skills with newer upstream superpowers behavior for worktree handling, brainstorming, planning, execution, and review
- added a pi-native `superpowers-bootstrap` extension for skill-first guidance before agent turns
- replaced upstream browser-server visual brainstorming assumptions with pi-native `AskUserQuestion` preview guidance
- added upstream parity regression tests, README parity tests, bootstrap unit tests, and deterministic integration smoke coverage
- hardened verification, testing anti-pattern, and code review guidance with feedback-derived improvements
- documented pi-native provenance and non-ported upstream harness glue

## [0.2.1] - 2026-05-20

### Changed
- renamed the package to `@furbyhaxx/pi-superpowers`
- updated pi peer dependency scopes from `@mariozechner/*` to `@earendil-works/*`
- switched TypeBox usage from `@sinclair/typebox` to `typebox`
- updated repository, homepage, bugs URL, and installation instructions to the `furbyhaxx/pi-superpowers` fork
- added scoped-package publish metadata for public npm publishing
