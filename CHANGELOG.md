# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- added `ask_user_question` tool (snake_case, shipped with pi-project-strand) replicating the Claude Code AskUserQuestion TUI — bordered box, chip-tab navigation, preview pane, notes mode, multi-select, Other… escape hatch, double-Esc dismiss with `terminate: true`
- added `knot:complete_fast_forward` action to `project_tracker` for agents to close an executed fast-forward plan
- added `/project:knot:fast_forward <slice-id>` slash command — opens an editor where the user picks a target knot and writes instructions; the agent then synthesizes a combined action plan (from squashed knot quality bars + user instructions), presents it for approval, executes it, and records a single `fast-forward` history entry
- added `PendingFastForward` state on slices and `fast_forward` metadata on `KnotRecord` to track in-flight fast-forwards and preserve full audit history
- added persistent `project_knowledge` and `project_tracker` extensions for project-scoped memory, slice/knot state, and FRS criteria tracking
- added `project-commands` extension with `/project:onboard`, `/project:brainstorm`, `/project:build`, `/project:implement`, and `/project:change` slash commands backed by `pi.sendUserMessage(...)`
- added required project file templates and self-documentation files (`PROJECT.md`, `VISION.md`, `ARCHITECTURE.md`, `AGENTS.md`)

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
