# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.6.1] - 2026-06-04

### Fixed
- onboarding/instructions listed only `quick` and `granular` as built-in strands (stale since the v0.5.0 expansion to five). The `superpowers-bootstrap` built-in-defaults list is now **generated from `DEFAULT_STRANDS`** (name, knot sequence, and `advance_by` posture) so it can never drift again; `frs-strategy` and the `/project:new:slice` / `/project:new:strand` command templates now list all five defaults (spike, quick, deep-research, change, granular). Added a bootstrap test asserting every `DEFAULT_STRANDS` key appears.

## [0.6.0] - 2026-06-04

### Added
- **Knot judge (Phase B)** — enforces `advance_by: ["judge"]`. A knot can be advanced by an independent auditor agent running in its own clean-room pi session (`noExtensions`/`noSkills`, focused judge system prompt, in the project cwd). It inspects the repo read-only, runs verification-only `bash`, and consults `project_knowledge` (read-only), then **approves** (advances the knot, evidence `judge(<model>): …`) or **rejects** (records `knot.last_verdict` + a note, returns reasons).
- `knot:judge` `project_tracker` action (agent) and `/project:knot:judge <slice>` command (user) trigger the audit; `/project:knot:advance` remains a human override.
- Judge model config: `judge.model` (fixed `provider/model[:thinking]`), `judge.models` (a map of glob-pattern-on-the-current-session-model → judge model, first match wins, for conditional/cross-model judging), and `judge.tools` (extra tools appended to the default `read/grep/find/ls/bash/project_knowledge`), resolved knot→strand→project; falls back to the calling session's model+thinking (with a warning) when unset.
- `judge_timeout_seconds` project config (default 600); `knot.last_verdict` record.
- new pure module `extensions/judge-core.ts` (model parse/glob/config/model/tool resolution, preflight, prompt builders) and SDK runner `extensions/judge.ts`.

## [0.5.0] - 2026-06-04

### Added
- per-knot `advance_by` (`human`/`agent`/`judge`) authorization on strands/knots — any listed actor may advance, and the user can always override via `/project:knot:advance`. Absent/empty defaults to `["human"]`; `normalizeState` backfills it on pre-0.5.0 state files.
- agent two-phase **armed confirmation** for self-advance (`handleAgentSignOff`): the agent's first `knot:sign_off` arms and returns the criteria checklist (does NOT advance); a second `knot:sign_off` with an evidence summary + all criteria met, within `agent_signoff_window_seconds` (default 300), confirms and advances; past the window it re-arms. Deterministic (clock injected).
- `project_strand` `define` now accepts per-knot `advance_by` (validated against the enum).
- `agent_signoff_window_seconds` project config (default 300); `judge` config (`provider/model:thinking`) parsed at knot/strand/project level — accepted now, enforced in Phase B (judge sub-session).

### Changed
- **Default strands expanded** from `quick`/`granular` to five generic strands — `spike`, `quick`, `deep-research`, `change`, `granular` — each carrying a per-knot `advance_by` posture ("human at the bookends, agent in the middle"; `deep-research` + `spike` run autonomously). Domain-specific strands (`automation`/`integration`) intentionally remain project-local.
- the agent `knot:sign_off` tool action now enforces `advance_by` (previously unconditional) — by default an agent can no longer silently self-advance a knot. The human `/project:knot:advance` override is unchanged.

### Fixed
- `project_strand` no longer corrupts `.pi/project.jsonc` when invoked in parallel. It now serializes the read-modify-write via `withFileMutationQueue` (so concurrent `define` calls can't read the same base and clobber each other's strands) and writes through a per-write unique temp file (eliminating the shared `*.tmp` rename race that produced `ENOENT` + truncated/garbage JSON).

### Removed
- stray `references/extended-project.json` (a truncated terminal paste; the strand definitions now live in `DEFAULT_STRANDS`).

## [0.4.0] - 2026-06-03

### Changed — BREAKING (project strand redesign; no runtime back-compat — `/mnt/Projects` migrated once)
- **state model rewritten** to be persistent-record-centric: each slice embeds its own named `strand` whose `knots[]` are durable records that accumulate goals, individually-verified `success_criteria` (with per-criterion evidence + `met_at`), an optional per-knot `plan`, and `resources`. Nothing is erased on completion — replaces the old transient `active_knot` + lossy `knot_history` (which discarded criteria) and the per-knot-wiped `active_plan`.
- **config**: `.pi/project.jsonc` now defines named `strands` (templates) instead of a single flat `knots` array. Strands are seed-only — snapshotted onto a slice at creation, with no runtime relation back to config and no default strand. Ships built-in `quick` (Prototype→Realization→Finalization) and `granular` (Proof-of-Work→…→Release) strands.
- **`project_tracker` action surface tightened** to 20 actions sharing a lean param schema: cross-cutting `verify_criterion` / `annotate` / `resource:add` / `resource:remove` use a `target: "slice" | "knot"` discriminator; `knot:sign_off` (lossless) and `slice:sign_off` replace the old advance flow; added `slice:update`, `knot:update`, `knot:set_plan`. Errors stay in-band and name the fix.
- replaced `/project:brainstorm` with `/project:new:slice` — an interactive funnel that captures the slice goal + success criteria, selects a strand via `ask_user_question` (per-option previews + recommendation), and creates the slice as `defined`.
- added `/project:slice:advance` for final slice sign-off; `/project:knot:advance` now signs off the active knot under the new model.

### Added
- `/project:new:strand` slash command + focused `project_strand` tool to interactively author custom named strands into `.pi/project.jsonc` (validated, comment-preserving JSONC writes via `jsonc-parser`).
- `/project:migrate` slash command: interactive one-shot migration of a legacy `state.json` to the strand model — deterministic Pass-1 mechanical transform (`migrateLegacyState`, unit-tested; prefers the project's old `knots` sequence so knot names map exactly, else `granular`) writing a `.bak` backup, followed by an LLM-driven Pass-2 per-slice backfill of goal/success_criteria/resources that clarifies unknowns with the user instead of guessing.
- `slice:update` now accepts `criteria` to (re)set slice-level success criteria (also used by the migration backfill).
- persistent per-knot `goals`, verifiable `success_criteria`, `plan`, and `resources`, plus slice-level `goal` + `success_criteria` and `resources` (`doc|file|url|report|memory|knowledge`).
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
