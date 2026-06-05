# Design: Main/Side Slice Tracks + `/project:slice:execute`

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Author:** AI agent (brainstormed with user)

## Problem

`pi-project-strand` tracks features as **slices** that advance through a **strand** of
**knots**. Two gaps surface once a project has more than one slice in flight:

1. **No targeted execution.** `/project:build` has no `slice_id`. It delegates routing to
   `computeNext`, which picks "the first active slice with unmet criteria" by `priority`
   order. There is no way to say *"start / continue / finish slice X now."*

2. **No concept of focus/attention under concurrency.** The data layer *already* permits
   multiple slices with `status: "active"` simultaneously (`computeNext`,
   `formatProjectStatus`, `getActiveSliceIds` all iterate the full active set), but nothing
   models *which* line of work is the primary one. Two places silently paper over this:
   - `buildProjectStrandContext` picks `active[0]` purely for **knowledge scoping** — so
     project_knowledge tagged to other active slices never surfaces. This is a real
     correctness bug under concurrency.
   - `computeNext` resolves order by `priority` then `id` — arbitrary from the user's view.

3. **`priority` is overloaded** — it is the only ordering signal, doing double duty as
   backlog rank *and* de-facto "what's primary."

## Concept: the `track` axis (main quest vs side quests)

Model concurrency as an RPG questline. Each slice belongs to a **track**:

- **main** — the project's spine / main questline.
- **side** — an optional side quest worked in parallel.

`track` is a per-slice property **orthogonal to `status`** (`defined` / `active` /
`on_hold` / `complete`). It is deliberately *not* a transient focus pointer and *not* a new
status value — it describes which line of work the slice belongs to, which is durable.

### Locked decisions

1. **Main-track cardinality:** at most **one** `main` slice may be `active` at a time (the
   spine is sequential). `side` slices: unlimited active in parallel.
2. **Bare `/project:build`** always advances the **main quest** (the active main-track
   slice, or the next defined main-track slice). It **never** picks up side quests.
3. **Targeted command verb:** `execute` → `/project:slice:execute <id>`.
4. **New-slice track choice:** the `/project:new:slice` funnel **always asks** main vs side
   (one `ask_user_question`, with a context-based recommendation).
5. **Switching the main quest:** running `/project:slice:execute` on a `main` slice while a
   *different* main quest is active → **hold-and-switch with confirmation** (agent confirms,
   puts the current main quest `on_hold`, activates the target). The underlying tool still
   hard-blocks silent double-activation; the swap is an explicit, confirmed two-step.

### Out of scope (YAGNI)

Sub-tracks / nested quests; more than two track kinds; per-side-quest ordering beyond
`priority`; reordering the main questline (existing `priority` already covers it).

## Data model changes

`extensions/project-tracker-core.ts`:

```ts
export type SliceTrack = "main" | "side";

export interface Slice {
  // ...existing fields...
  track: SliceTrack;   // NEW
}
```

- **Invariant:** ≤1 `main` slice with `status === "active"`.
- `normalizeState` defaults a missing `track` → `"main"` (faithful to today's single-line
  behavior). The invariant is enforced **only at mutation time** — a loaded file with
  multiple active mains (legacy) is *grandfathered*, never retroactively invalidated. The
  user can re-tag via `slice:set_track`.
- `seedStrand` / knot shape: unchanged.
- `createInitialState`: unchanged (no slices).

Purely additive — no state-format break; atomic write path unchanged.

`extensions/project-tracker-migrate.ts`: legacy→strand migration also stamps
`track: "main"` on every migrated slice.

## Invariant enforcement (the subtle part)

`status` flips to `active` in **two** code paths today:
- `handleSliceActivate`
- `handleKnotStart` (sets `slice.status = "active"` directly — bypasses activate)

Both — plus the new `slice:set_track` — must enforce the single-active-main rule. Extract
one helper to avoid drift:

```ts
/** Returns an error tuple if making `slice` an active main would violate the
 *  single-active-main invariant; otherwise null. */
function assertCanActivateMain(state: ProjectState, slice: Slice): { error: string; text: string } | null;
```

Rule: if `slice.track === "main"` and some **other** slice with `track === "main"` has
`status === "active"`, return
`Error: main quest <X> is already active — hold or finish it first` (`error: "main active"`).
`side` slices are never blocked.

Call sites:
- `handleSliceActivate` — before flipping to active.
- `handleKnotStart` — before `slice.status = "active"`.
- `handleSliceSetTrack` — when the change would make an *already-active* slice the second main.

## Tool actions (`project_tracker`)

| Action | Change |
|---|---|
| `slice:create` | New optional `track` param (default `"main"`). Threaded through `SliceCreateInput` → `handleSliceCreate`. |
| `slice:activate` | Enforces single-active-main via the helper. |
| `knot:start` | Same enforcement (closes the bypass). |
| **`slice:set_track`** | **NEW** — params `slice_id` + `track`; `handleSliceSetTrack` moves a slice between tracks, with the invariant check. |

Wrapper (`project-tracker.ts`): add `"slice:set_track"` to the `action` `StringEnum`, add a
`track` param to `ProjectTrackerParams` (`StringEnum(["main","side"])`), and a `case`.

## New command: `/project:slice:execute <id>`

LLM-driven, same pattern as `/project:build` (deterministic `auditProject` →
`sendProjectCommand`). It is `build`'s routing **parameterized by an explicit slice id and
track-aware**. Routing the agent must follow, keyed on the target slice's `status`:

- `complete` → report done; nothing to do.
- `defined` → activate + start its first knot (frs-strategy). **If target is `main` and a
  different main quest is active → confirm hold-and-switch** (hold current main, activate
  target), then proceed.
- `active` + active knot + linked plan → resume (executing-plans / subagent-driven-development).
- `active` + active knot, no plan → writing-plans first.
- `active`, no active knot, pending knots remain → frs-strategy `knot:start` the next knot.
- `active`, all knots signed off → prompt `/project:slice:advance`.
- `on_hold` → reactivate (same main-switch rule if `main`) + continue.
- unknown id → report it (agent reads `slice:get` and surfaces the error).

Keep all user gates (design approval, spec review, knot sign-off, deployment approval).

Refactor `buildProjectCommandMessage` so `build` and `slice:execute` share **one** routing
block: `build` = "the main quest (no id)"; `slice:execute` = "this id from `User arguments`."
Add `"slice:execute"` to the `ProjectCommand` union and register the command.

## Read-path reworks

- **`/project:build` message:** explicitly scoped — *"advance the **main quest**: the single
  active main-track slice, or the next defined main-track slice. Never pick up side quests
  here; use `/project:slice:execute <id>` for those."*
- **`computeNext`:** becomes **main-quest-focused** — its result drives `build` and the
  bootstrap "Next up." Resolution order: active main slice's next step (continue knot →
  ready-for-sign-off knot → start next pending knot → ready-for-slice-sign-off); else next
  defined main slice to activate; else fall back to messaging side quests / "no obvious
  next." A separate helper summarizes active side quests (not the headline next step).
- **`/project:new:slice` funnel** (`project-commands.ts` message): add one
  `ask_user_question` for **main vs side**, recommending based on whether a main quest
  already exists, then pass `slice:create track=<choice>`.
- **Bootstrap `buildProjectStrandContext`** (`project-tracker.ts`): present the **Main quest**
  prominently, then an **Active side quests** list. Return **all** active slice ids (main
  first) instead of `active[0]`; the per-knot `advance_by`/judge context loop stays but
  orders the main quest first.
- **Knowledge scoping** (`project-knowledge-core.ts` `handleContext` +
  `project-knowledge.ts` `buildKnowledgeContext`): accept `slice_ids: string[]` (keep the
  single `slice_id` path for back-compat). Surface **main-quest entries first, then
  side-quest entries**, within the existing `limit`. Bootstrap passes all active slice ids.
- **TUI widget** (`renderProjectWidgetText`): render `main-quest[knot] · +N side` instead of
  the arbitrary first-3.

## Testing

- **`tests/extension/project-tracker.test.ts`** (core):
  - single-active-main enforced in `slice:activate` **and** `knot:start`; `side` unlimited.
  - `slice:set_track` moves tracks; blocks making a 2nd active main; allows side↔main on
    non-active slices.
  - `slice:create` honors `track` (and defaults to `main`).
  - `computeNext` is main-quest-focused (ignores side quests for the headline).
  - `normalizeState` defaults missing `track` → `main`; grandfathers legacy multi-active.
- **`tests/extension/project-commands.test.ts`:** `buildProjectCommandMessage("slice:execute", id)`
  carries the id + routing; `build` message is scoped to the main quest.
- **`tests/extension/project-knowledge.test.ts`:** multi-slice `handleContext` ordering
  (main entries before side entries; respects `limit`).
- **`tests/extension/project-tracker-migrate.test.ts`:** migrated slices get `track: "main"`.

`npm test` is the only verification gate; all tests must pass.

## Docs to update

- `ARCHITECTURE.md` — the `track` axis + single-active-main invariant + enforcement points.
- `PROJECT.md` — capability row + command table (`/project:slice:execute`).
- `README.md` — command table parity (a package test checks README/command parity).
- `CHANGELOG.md` — conventional-commits entry (minor bump).
- `superpowers-bootstrap.ts` — explain main/side tracks, the single-active-main rule, and
  the new targeted command.
- `frs-strategy` skill / command help — reference tracks where it explains slices.

## Backward compatibility

Additive field with a `normalizeState` default; no format break. Existing state files load
unchanged (every slice becomes `main`). Legacy states with multiple active slices are
grandfathered and surface a single main quest plus extras the user can re-tag with
`slice:set_track`. No data migration command required.
