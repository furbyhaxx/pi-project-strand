# Design: Named Strands + Persistent Knot Records + Interactive Slice/Strand Creation

- **Date:** 2026-06-03
- **Status:** Draft for review
- **Scope:** Replace the single-sequence, transient knot model with named, slice-embedded strands of **persistent** knot records; add an interactive `/project:new:slice` funnel; design `/project:new:strand` authoring.
- **Implementation phasing:** **A + B now**, **C design-only now** (implement later).
- **Backwards compatibility:** none required at runtime. Only `/mnt/Projects` uses this package; it gets a one-shot comprehensive migration.

---

## 1. Motivation

The current model (`extensions/project-tracker-core.ts`) is **transient-state-centric** and lossy:

1. **Knot criteria are erased on completion.** `advanceKnotForSignoff` (core.ts:639–652) pushes a single freeform `evidence_summary` string to `knot_history`, then sets `slice.active_knot = null`. The criteria array — each criterion's text, per-criterion evidence, and `verified_at` — is discarded. A completed slice cannot tell you *what* was verified at each knot.
2. **Plans are shallow and ephemeral.** A slice has one `active_plan` path + `active_plan_status`. On every knot advance, `slice.active_plan = null` (core.ts:653). Plan links are never recorded in history and there is at most one plan per slice at a time.
3. **Only one global knot sequence.** `project.jsonc` defines a single flat `knots: [...]` array. `runtime.knots: string[]` is loaded once and threaded into every operation. A slice cannot follow a different lifecycle (e.g. a 3-knot "quick" path vs a 7-knot "granular" path).

This redesign flips the model to **persistent-record-centric**: each knot is a durable object embedded in the slice that accumulates data and only changes `status`. Nothing is erased. Strands become **named seed templates** that are snapshotted into a slice at creation.

---

## 2. Deliverables

| ID | Deliverable | Phase |
|----|-------------|-------|
| **A** | Named strands data model + config + new `project_tracker` action surface + comprehensive one-shot migration | Now |
| **B** | `/project:new:slice` interactive funnel (folds in & **replaces** `/project:brainstorm`) with strand selection via `ask_user_question` | Now |
| **C** | `/project:new:strand` interactive custom-strand authoring into `project.jsonc` | Design now, implement later |
| — | Audit & update skills/instructions (frs-strategy, bootstrap, command templates, references) to the new model | Now (after model lands) |

---

## 3. Data Model

### 3.1 `.pi/project.jsonc` — strand templates (seed-only)

Strands are **pure templates** used only to seed a slice. They are copied (snapshotted) into the slice at creation; there is **no runtime relation** back to `project.jsonc`, **no `defaultStrand`**, and the old flat `knots: [...]` field is **removed**.

```jsonc
{
  "project": { "name": "...", "description": "..." },
  "strands": {
    "quick": {
      "description": "Quick strand for simple, scoped or smaller work",
      "knots": [
        { "name": "Prototype",    "focus": "Research/prototype approaches and ground the decision how to build it" },
        { "name": "Realization",  "focus": "Build the final implementation incl. required tests, ready for finalization" },
        { "name": "Finalization", "focus": "Validation, review and polishing to finalize the strand" }
      ]
    },
    "granular": {
      "description": "Granular strand for complex/large-scope work",
      "knots": [
        { "name": "Proof-of-Work", "focus": "Prove the approach; establish design, API, patterns, decisions" },
        { "name": "Alpha", "focus": "First real, integrated implementation" },
        { "name": "Beta",  "focus": "Ready to show someone else" },
        { "name": "Gamma", "focus": "Staging-ready, all core features" },
        { "name": "RC1",   "focus": "Feature complete, polishing" },
        { "name": "RC2",   "focus": "Early-adopter ready" },
        { "name": "Release","focus": "Production confident" }
      ]
    }
  }
}
```

**Built-in defaults:** if `project.jsonc` defines no `strands`, the package ships `quick` and `granular` as the defaults (replacing today's single `DEFAULTS.knots`).

A strand knot template field set: `{ name: string, focus: string, title?: string }`. (`title` rarely set in templates; usually filled per-slice.)

### 3.2 `.pi/project/state.json` — slices with embedded persistent strands

```jsonc
{
  "project": { "name": "EdgeOS", "description": "router", "updated_at": "ISO" },
  "milestones": [ { "name": "...", "description": "...", "reached_at": "ISO" } ],
  "slices": [
    {
      "id": "dns-cache",
      "name": "DNS cache",
      "description": "Cache upstream DNS responses at the edge",
      "type": "vertical",                 // vertical | horizontal
      "priority": 100,
      "status": "defined",                // defined | active | on_hold | complete
      "goal": "Cut repeat DNS latency to near-zero without stale answers",
      "success_criteria": [               // slice-level, verifiable
        { "text": "p99 cached lookup < 1ms", "met": false },
        { "text": "respects upstream TTLs", "met": false }
      ],
      "started_at": null, "completed_at": null,
      "signed_off": false,
      "signed_off_message": null,
      "validation_evidence_summary": null,
      "notes": null,
      "resources": [                      // pointers; see 3.4
        { "type": "knowledge", "ref": "dec-004", "title": "Chose LRU over TTL-bucket" }
      ],
      "strand": {
        "name": "quick",
        "description": "Quick strand for simple, scoped work",   // snapshotted
        "current_knot": null,             // name of the active knot, or null
        "pending_fast_forward": null,     // transient FF state; see 3.5
        "knots": [                        // ORDERED; full sequence instantiated at creation
          {
            "name": "Prototype",
            "title": null,                // optional human title for this slice's instance of the knot
            "focus": "Research/prototype approaches and ground the decision",  // snapshotted from template
            "status": "pending",          // pending | active | signed_off | fast_forwarded
            "goals": [],                  // specific goals for this knot (filled at knot:start)
            "success_criteria": [],       // [{ text, met, evidence?, met_at? }]
            "plan": null,                 // { path: string, status: "linked" | "complete" }
            "resources": [],
            "started_at": null, "completed_at": null,
            "signed_off": false,
            "signed_off_message": null,
            "validation_evidence_summary": null,
            "notes": null
          },
          { "name": "Realization",  "title": null, "focus": "...", "status": "pending", "goals": [], "success_criteria": [], "plan": null, "resources": [], "started_at": null, "completed_at": null, "signed_off": false, "signed_off_message": null, "validation_evidence_summary": null, "notes": null },
          { "name": "Finalization", "title": null, "focus": "...", "status": "pending", "goals": [], "success_criteria": [], "plan": null, "resources": [], "started_at": null, "completed_at": null, "signed_off": false, "signed_off_message": null, "validation_evidence_summary": null, "notes": null }
        ]
      }
    }
  ]
}
```

### 3.3 Type definitions (core)

```ts
export type SliceType = "vertical" | "horizontal";
export type SliceStatus = "defined" | "active" | "on_hold" | "complete";
export type KnotStatus = "pending" | "active" | "signed_off" | "fast_forwarded";
export type PlanStatus = "linked" | "complete";
export type ResourceType = "doc" | "file" | "url" | "report" | "memory" | "knowledge";

export interface SuccessCriterion {
  text: string;
  met: boolean;
  evidence?: string;
  met_at?: string;
}

export interface Resource {
  type: ResourceType;
  ref: string;        // path, URL, knowledge id, or memory slug
  title?: string;
  note?: string;
}

export interface KnotPlan { path: string; status: PlanStatus; }

export interface Knot {
  name: string;
  title?: string | null;
  focus: string;
  status: KnotStatus;
  goals: string[];
  success_criteria: SuccessCriterion[];
  plan?: KnotPlan | null;
  resources: Resource[];
  started_at?: string | null;
  completed_at?: string | null;
  signed_off: boolean;
  signed_off_message?: string | null;
  validation_evidence_summary?: string | null;
  notes?: string | null;
}

export interface PendingFastForward {
  target_knot: string;
  user_instructions: string;
  initiated_at: string;
}

export interface SliceStrand {
  name: string;
  description: string;
  current_knot: string | null;
  pending_fast_forward?: PendingFastForward | null;
  knots: Knot[];
}

export interface Slice {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority: number;
  status: SliceStatus;
  goal: string;
  success_criteria: SuccessCriterion[];
  started_at?: string | null;
  completed_at?: string | null;
  signed_off: boolean;
  signed_off_message?: string | null;
  validation_evidence_summary?: string | null;
  notes?: string | null;
  resources: Resource[];
  strand: SliceStrand;
}
```

### 3.4 Resources

A lightweight pointer list at **both** slice and knot level. `knowledge.json` remains the structured decision graph; `resources` are just typed references into docs/files/URLs/reports/memories/knowledge entries. Managed via dedicated tool actions (`resource:add` / `resource:remove`).

### 3.5 Status & lifecycle semantics

- **Knot sequence order** is the array order. `next = knots[idx+1]`. There is exactly **zero or one** `active` knot per slice (`strand.current_knot` points to it).
- **Knot statuses:** `pending` → `active` → `signed_off`. `fast_forwarded` marks a knot that was squashed into a later knot's combined sign-off.
- **Slice completion:** when the final knot is signed off, slice `status = complete`, `completed_at`, and the slice-level `signed_off` / `signed_off_message` / `validation_evidence_summary` are set.
- **Fast-forward:** while in-flight, `strand.pending_fast_forward = { target_knot, user_instructions, initiated_at }`. On completion: every knot from the current active knot up to (but excluding) the target is marked `status = "fast_forwarded"` and given a `validation_evidence_summary` (synthesized from the combined plan); the target knot becomes `active`. Per-knot records are preserved — no synthetic collapsed history entry.

---

## 4. `project_tracker` tool — new action surface

Single tool with an `action` enum (the existing, established pattern). The core functions already take the knot sequence as a parameter, so most logic stays pure; the wrapper resolves the sequence from `slice.strand.knots` instead of a global `runtime.knots`.

**Design goals (LLM-facing):** keep the action list small enough to pick reliably, keep the flat param schema lean (it's shared across all actions, so each extra param costs tokens on every call), and make operations *predictable*. Three deliberate moves:

1. **Unify cross-cutting operations behind a `target: "slice" | "knot"` discriminator.** Criteria, notes, and resources all exist at both slice and knot level. Instead of parallel `slice:*` / `knot:*` verbs, the model learns **one** verb and flips `target`. (`target:"knot"` always means the slice's *active* knot.)
2. **Reuse generic params** across actions rather than action-specific names — e.g. one `criteria: string[]` serves both `slice:create` and `knot:start`; `name`/`description` serve slices and milestones.
3. **Drop redundant actions.** No `knot:get` (covered by `slice:get`), no `plan:list` (covered by `status`/`slice:get`), no `request_signoff` (readiness is surfaced by `next` and returned as a structured error from `knot:sign_off` itself).

This lands at **20 actions** sharing **~22 params**, down from ~24/27.

### 4.1 Queries (read-only, concurrency-safe)
- `status` — project + active slices overview.
- `slice:list` — optional `status` filter.
- `slice:get` — `slice_id`; full slice detail incl. the active knot and all signed-off knots (everything is persistent now).
- `next` — recommended next action (see §5); surfaces sign-off readiness and pending fast-forwards.

### 4.2 Slice mutations
- `slice:create` — `id, name, description, type, priority?, goal, criteria[], strand` (strand **name**). The wrapper loads `project.jsonc`, resolves the named strand template, and **snapshots** its knots (name + focus) into a fully-instantiated `strand.knots` array (all `pending`). `criteria[]` seed the slice-level `success_criteria`. Slice is created `status = "defined"`.
- `slice:update` — `slice_id` + any of `name? / description? / goal? / priority? / type?`.
- `slice:activate` / `slice:hold` — `slice_id` (zero extra params; explicit intent).
- `slice:sign_off` — `slice_id, message, evidence`. Final slice completion; allowed only when the last knot is signed off. Sets `signed_off`, `signed_off_message`, `validation_evidence_summary`, `completed_at`, `status = complete`.

### 4.3 Knot mutations
- `knot:start` — `slice_id, knot (name), goals[], criteria[]`. Validates the knot exists in `strand.knots`, is `pending`, and no other knot is `active`. Sets it `active`, fills `goals` + `success_criteria` (from `criteria[]`, `met=false`), `started_at`, `strand.current_knot`.
- `knot:update` — `slice_id` + any of `goals? / title?` for the active knot.
- `knot:set_plan` — `slice_id, file_path, plan_status` (`linked|complete`) for the active knot's `plan`.
- `knot:sign_off` — `slice_id, message, evidence`. Marks the active knot `signed_off` (+ `completed_at`), advances `strand.current_knot` to the next `pending` knot (or completes the slice). Returns a structured error if any criterion is unmet. **Replaces** today's `advanceKnotForSignoff`.
- `knot:fast_forward` — `slice_id, knot (target), notes (instructions)`. Sets `strand.pending_fast_forward`.
- `knot:complete_fast_forward` — `slice_id, evidence`. Marks squashed knots `fast_forwarded` with synthesized evidence, activates the target knot, clears `pending_fast_forward`. (Name kept for continuity with the existing action.)

### 4.4 Cross-cutting (shared `target` discriminator)
- `verify_criterion` — `slice_id, target, index, evidence`. Marks a `success_criteria[index]` entry `met` (on the slice or the active knot).
- `annotate` — `slice_id, target, notes, notes_mode?` (`set|append`). Set/append `notes`.
- `resource:add` — `slice_id, target, resource` (object `{ type, ref, title?, note? }`).
- `resource:remove` — `slice_id, target, index`.

### 4.5 Misc
- `milestone:add` — `name, description`.

### 4.6 Result & error contract
Handlers stay pure functions in `project-tracker-core.ts` (`{ text, state, error? }`), returning **in-band structured errors** that never crash the turn and always name the fix — e.g. an invalid knot lists the valid knot names, an unmet-criteria sign-off lists the outstanding criteria. The wrapper continues to attach `details = { action, state, error? }`. Every handler is unit-tested.

> Final param-name bikeshedding happens in the implementation plan, but the action set and `target` pattern above are the agreed design.

---

## 5. `computeNext` and progress

`computeNext` priority order in the new model:

1. Any slice with `strand.pending_fast_forward` → "Execute fast-forward plan for `<id>` → `<target>`".
2. Active slice with an `active` knot that has unmet criteria → "Continue `<id>` → `<knot>` (`m/n` criteria met)".
3. Active slice with an `active` knot, all criteria met → "`<id>` → `<knot>` ready for sign-off".
4. Active slice, no `active` knot, a `pending` knot remains → "Start `<id>` → `<next pending knot>`".
5. `defined` slice → "Activate `<id>`".
6. Otherwise → "No obvious next slice."

Progress signal = count of `success_criteria.met` / total on the active knot (preserved from today, now durable).

---

## 6. A — Named strands seeding

- `loadProjectConfig` returns `strands: Record<string, StrandTemplate>` (built-in `quick`+`granular` when absent) instead of a flat `knots[]`.
- A pure `seedStrand(template, name)` builds the instantiated `SliceStrand` (all knots `pending`, focus copied).
- `slice:create` consumes a strand **name**, resolves the template, and snapshots. After creation the slice is self-contained — editing or deleting the template in `project.jsonc` never affects existing slices.

---

## 7. B — `/project:new:slice` funnel (replaces `/project:brainstorm`)

`/project:brainstorm` is **removed**. `/project:new:slice <request>` is the single design-to-slice entry point.

**Command handler** (`extensions/project-commands.ts`): runs `auditProject`, then `pi.sendUserMessage(...)` with a workflow message (same deterministic-audit + LLM-driven pattern as existing commands).

**Funnel workflow (LLM-driven):**
1. Load `/skill:brainstorming`. Surface PROJECT.md Planned Features, `project_tracker` status, and relevant `project_knowledge` (decisions/constraints/rejected) up front.
2. One question at a time: clarify purpose, scope, constraints, complexity. Research as needed (web/local) and persist findings as `project_knowledge` entries + slice `resources`.
3. Converge on the slice's **`goal`** and slice-level **`success_criteria`** ("what done means").
4. **Strand selection via `ask_user_question`:** present the available strands (from `project.jsonc`) as a single-select question — each option carries a `description` (when to use / pros & cons) and a `preview` (the knot sequence with focus). The agent assesses complexity and marks the recommended strand first with "(Recommended)".
5. Create the slice via `project_tracker action=slice:create` with the chosen strand name, `goal`, and `success_criteria`. Slice lands as **`defined`** with the full knot sequence `pending`.
6. End with a summary and point the user at `/project:build` to activate and start the first knot. (Per-knot `goals`/`success_criteria` are defined at `knot:start` time via `frs-strategy`, not in the funnel.)

**Strand-selection question shape (example):**
```
ask_user_question:
  question: "Which strand should this slice follow?"
  header: "Strand"
  options:
    - label: "quick (Recommended)"
      description: "Small, well-scoped work. 3 knots. Pro: fast. Con: thin staging/RC gates."
      preview: "Prototype → Realization → Finalization\n- Prototype: research/prototype...\n- ..."
    - label: "granular"
      description: "Complex/large scope. 7 knots. Pro: strong gates. Con: heavier process."
      preview: "PoW → Alpha → Beta → Gamma → RC1 → RC2 → Release\n..."
```

---

## 8. C — `/project:new:strand` authoring (design only; implement later)

`/project:new:strand <request>` runs an interactive, LLM-driven workflow that designs a custom strand and writes it into `.pi/project.jsonc` under `strands`.

- Because `project.jsonc` is **user config** (not tool-managed state like `state.json`/`knowledge.json`), the agent edits it directly (Read + Edit/Write of the JSONC), preserving comments where practical.
- A deterministic, **exported + unit-tested** helper validates a proposed strand (unique name, ≥1 knot, unique ordered knot names, each knot has `focus`) and produces the JSONC insertion. The command handler follows the standard `auditProject` + `pi.sendUserMessage` pattern.
- Workflow: clarify the use case → propose knot sequence with focus per knot (one step at a time) → confirm → validate → write to `project.jsonc` → confirm availability for future `/project:new:slice` runs.
- Implementation deferred; this section is the agreed spec.

---

## 9. Migration (`/mnt/Projects`, one-shot, comprehensive)

Throwaway code, run once, then removed. **Two passes:**

**Pass 1 — mechanical transform** (pure, unit-tested):
- `project.project` → carried over.
- Each old `Slice`:
  - `id/name/description/type/priority/status` → carried over.
  - `notes` → `slice.notes`.
  - Build `slice.strand` from the project's old global knot sequence: instantiate all knots (`focus` from old config), then replay:
    - Old `knot_history[]` records → matching knots set `status = "signed_off"`, `signed_off = true`, `completed_at`, `validation_evidence_summary = evidence_summary`. Old `fast_forward` history → squashed knots set `status = "fast_forwarded"`.
    - Old `active_knot` → matching knot `status = "active"`, `started_at`, and each old `Criterion` → `SuccessCriterion { text, met: verified, evidence, met_at: verified_at }`. Set `strand.current_knot`.
    - Old `active_plan`/`active_plan_status` → active knot `plan`.
  - `strand.name` defaults to `"granular"` (or `"quick"` if the old sequence matches), `description` from the matched template.

**Pass 2 — agent-assisted backfill** (the "comprehensive" part — old format lacks: slice `goal`, slice `success_criteria`, per-knot `goals`, durable per-knot `success_criteria` for already-completed knots, `resources`):
- After the mechanical transform, an agent pass reconstructs the missing fields from available evidence: `knot_history` evidence summaries, linked plan files, `knowledge.json` entries, PROJECT.md/VISION.md, and `git log`. It proposes `goal` + `success_criteria` per slice and per signed-off knot, and attaches relevant `resources` (knowledge ids, plan paths, reports).
- **Clarify, don't guess.** Whenever a field cannot be confidently derived from the available evidence — an ambiguous goal, a knot whose criteria can't be reconstructed, an unclear strand mapping — the agent **asks the user during the migration** rather than fabricating a value or leaving it silently empty. Reconstruction proceeds one slice at a time, each confirmed with the user before it is written.
- Output validated against the new schema before replacing `state.json` (atomic write, `.bak` kept).

---

## 10. Skills & instructions audit (after model lands)

Touch-points to review/update for the new model (tracked as a task; exact edits during implementation):
- **`skills/frs-strategy`** — currently presents a fixed 7-knot table; update to explain configurable **strands** (templates), the `quick`/`granular` defaults, knots as **persistent records**, and the `goals` vs `success_criteria` distinction at slice and knot level.
- **`extensions/superpowers-bootstrap.ts`** — FRS foundations text + injected project context must reference the new fields (`slice.goal`, `strand.name`, `current_knot`, met/total criteria, `pending_fast_forward`).
- **`extensions/project-tracker.ts` `buildProjectStrandContext`** — rebuild around per-slice strand resolution and the new fast-forward shape.
- **`extensions/project-commands.ts`** — remove `/project:brainstorm`; add `/project:new:slice` (and later `/project:new:strand`); update `/project:build` routing to the new fields; update `/project:onboard`/`/project:change` references.
- **`references/required-project-files.md`** — mention strands where relevant.
- **`writing-plans` / `executing-plans`** — plans are now per-knot artifacts.
- **`README.md` / `CHANGELOG.md` / `package.json`** — document new config shape and commands; ensure `files` array still correct.

---

## 11. Testing strategy

- **Core unit tests** (`tests/extension/project-tracker-core.test.ts`): seeding from template; `knot:start`/`verify_criterion`/`sign_off` lifecycle with persistence (assert nothing is erased); slice completion; fast-forward squashing; `computeNext` for each priority branch; resource add/remove.
- **Migration tests**: golden old-format fixtures → expected new-format output (Pass 1 mechanical only; Pass 2 is interactive/throwaway).
- **Package/skill parity tests**: existing suites under `tests/package` and `tests/skills` stay green; update for removed `/project:brainstorm`.
- Gate: `npm test` fully green before commit; `CHANGELOG.md` updated (conventional commits); no build artifacts committed.

---

## 12. Open items for reviewer

1. ~~Confirm the action names in §4.~~ **Resolved** — §4 finalized: 19 actions, unified `target` discriminator, lean shared schema, in-band structured errors. Param names get final bikeshedding in the implementation plan.
2. ~~Confirm Pass 2 migration is interactive per-slice vs autonomous.~~ **Resolved** — interactive per-slice, and the agent clarifies with the user whenever anything is unclear (§9).
3. Confirm `resources.type` enum values (§3.3: `doc | file | url | report | memory | knowledge`) are sufficient.
```
