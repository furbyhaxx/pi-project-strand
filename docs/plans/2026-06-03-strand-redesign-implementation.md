# Strand Redesign (A + B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-sequence, transient knot model with named, slice-embedded strands of *persistent* knot records, a tightened `project_tracker` action surface, a comprehensive one-shot migration, and a `/project:new:slice` funnel that replaces `/project:brainstorm`.

**Architecture:** Pure logic lives in `extensions/project-tracker-core.ts` (no I/O, no pi imports) and a new `extensions/project-tracker-migrate.ts`; the thin wrapper `extensions/project-tracker.ts` does config/file I/O and tool/command registration. Strands in `.pi/project.jsonc` are seed-only templates snapshotted into each slice at creation — slices are self-contained afterward. Each knot is a durable record; nothing is erased on completion.

**Tech Stack:** TypeScript (loaded by pi via jiti, no build step), TypeBox + `StringEnum` for tool params, `jsonc-parser`, Vitest. Verification gate: `npm test`.

**Spec:** `docs/plans/2026-06-03-strand-redesign-design.md` (read it before starting).

**Conventions (from AGENTS.md):**
- Core/wrapper split is mandatory. Never import pi or touch the filesystem in `*-core.ts`.
- Use `StringEnum` from `@earendil-works/pi-ai`, never `Type.Union(Type.Literal(...))`.
- No build artifacts committed. `npm test` must be green before every commit.
- Conventional-commit messages; update `CHANGELOG.md`.

**Out of scope (deferred):** Deliverable **C** (`/project:new:strand` authoring) — design only, not implemented here.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `extensions/project-tracker-core.ts` | New types + pure handlers + `seedStrand` + `DEFAULT_STRANDS` + `computeNext` + formatters | **Rewrite** |
| `extensions/project-tracker-migrate.ts` | Pure `migrateLegacyState` (Pass-1 mechanical transform) | **Create** |
| `extensions/project-tracker.ts` | Config loading (strands), tool params + execute switch, commands, context builder, widget | **Rewrite** |
| `extensions/project-commands.ts` | Remove `brainstorm`; add `new:slice`; update `build`/`onboard`/`change` templates to new model | **Modify** |
| `extensions/superpowers-bootstrap.ts` | Replace hardcoded 7-knot table with strand-aware FRS text | **Modify** |
| `skills/frs-strategy/SKILL.md` | Document configurable strands, persistent knots, goals vs success_criteria | **Modify** |
| `scripts/migrate-state.ts` | Throwaway one-shot runner for Pass-1 transform on `/mnt/Projects` | **Create (throwaway)** |
| `tests/extension/project-tracker-core.test.ts` | Unit tests for new core | **Rewrite** |
| `tests/extension/project-tracker-migrate.test.ts` | Golden migration test | **Create** |
| `tests/extension/project-commands.test.ts` | Update for removed brainstorm + new:slice message | **Modify** |
| `tests/extension/superpowers-bootstrap.test.ts` | Update assertions for new bootstrap text | **Modify** |
| `CHANGELOG.md`, `package.json` | Changelog entry; confirm `files`/`pi.extensions` | **Modify** |

**Phase ordering:** 1 (types) → 2 (seed + defaults) → 3 (slice handlers) → 4 (knot handlers) → 5 (cross-cutting) → 6 (computeNext + formatters) → 7 (migration) → 8 (wrapper: config + tool) → 9 (wrapper: context + bootstrap) → 10 (commands) → 11 (skills audit) → 12 (changelog + final gate).

Phases 1–7 are pure/unit-tested and form deliverable **A**'s core. Phases 8–9 wire it. Phase 10 is deliverable **B**. Phase 11 is the skills audit.

---

## Phase 1 — Core types

### Task 1: Replace core type definitions

**Files:**
- Modify: `extensions/project-tracker-core.ts` (lines 1–127, the type block + `isoNow`)
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Replace the type block.** Replace everything from the top of `extensions/project-tracker-core.ts` through the `isoNow` function (currently lines 1–127) with:

```ts
export type SliceType = "vertical" | "horizontal";
export type SliceStatus = "defined" | "active" | "on_hold" | "complete";
export type KnotStatus = "pending" | "active" | "signed_off" | "fast_forwarded";
export type PlanStatus = "linked" | "complete";
export type ResourceType = "doc" | "file" | "url" | "report" | "memory" | "knowledge";

export interface ProjectInfo {
  name: string;
  description: string;
  updated_at: string;
}

export interface SuccessCriterion {
  text: string;
  met: boolean;
  evidence?: string;
  met_at?: string;
}

export interface Resource {
  type: ResourceType;
  ref: string;
  title?: string;
  note?: string;
}

export interface KnotPlan {
  path: string;
  status: PlanStatus;
}

export interface Knot {
  name: string;
  title: string | null;
  focus: string;
  status: KnotStatus;
  goals: string[];
  success_criteria: SuccessCriterion[];
  plan: KnotPlan | null;
  resources: Resource[];
  started_at: string | null;
  completed_at: string | null;
  signed_off: boolean;
  signed_off_message: string | null;
  validation_evidence_summary: string | null;
  notes: string | null;
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
  pending_fast_forward: PendingFastForward | null;
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
  started_at: string | null;
  completed_at: string | null;
  signed_off: boolean;
  signed_off_message: string | null;
  validation_evidence_summary: string | null;
  notes: string | null;
  resources: Resource[];
  strand: SliceStrand;
}

export interface Milestone {
  name: string;
  description: string;
  reached_at: string;
}

export interface ProjectState {
  project: ProjectInfo;
  slices: Slice[];
  milestones: Milestone[];
}

export interface ProjectTrackerDetails {
  action: string;
  state: ProjectState;
  error?: string;
}

export interface ActionResult {
  text: string;
  state: ProjectState;
  error?: string;
}

export interface StrandKnotTemplate {
  name: string;
  focus: string;
  title?: string;
}

export interface StrandTemplate {
  description: string;
  knots: StrandKnotTemplate[];
}

export interface ProjectConfig {
  project?: {
    name?: string;
    description?: string;
  };
  strands?: Record<string, StrandTemplate>;
}

export function isoNow(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 2: Run the suite to confirm the file no longer compiles cleanly against old tests (expected).**

Run: `npm test`
Expected: FAIL — the existing `project-tracker-core.test.ts` references removed functions/types (`ActiveKnot`, `handleVerifyCriterion`, etc.). This is expected; Phases 1–6 rewrite both sides. Proceed.

- [ ] **Step 3: Commit.**

```bash
git add extensions/project-tracker-core.ts
git commit -m "refactor(tracker): replace state types with persistent strand/knot model"
```

> Note: the test suite stays red until Phase 6 completes. That is acceptable for this rewrite; each phase below adds the matching tests. If you prefer a green-at-every-commit flow, defer the Step-3 commit and accumulate Phases 1–6 into one commit at the end of Phase 6.

---

## Phase 2 — Seeding & default strands

### Task 2: `DEFAULT_STRANDS` and `seedStrand`

**Files:**
- Modify: `extensions/project-tracker-core.ts` (append after `isoNow`)
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/extension/project-tracker-core.test.ts` with this opening (it grows across phases):

```ts
import { describe, expect, test } from "vitest";
import {
  DEFAULT_STRANDS,
  seedStrand,
  createInitialState,
  normalizeState,
  handleSliceCreate,
  handleSliceUpdate,
  handleSliceActivate,
  handleSliceHold,
  handleSliceSignOff,
  handleKnotStart,
  handleKnotUpdate,
  handleKnotSetPlan,
  handleKnotSignOff,
  handleKnotFastForward,
  handleCompleteFastForward,
  handleVerifyCriterion,
  handleAnnotate,
  handleResourceAdd,
  handleResourceRemove,
  handleMilestoneAdd,
  computeNext,
} from "../../extensions/project-tracker-core.js";

const quick = DEFAULT_STRANDS.quick;

function freshState() {
  return normalizeState(
    createInitialState({ project: { name: "EdgeOS", description: "router" } }, "fallback"),
    { project: { name: "EdgeOS" } },
    "fallback"
  );
}

function withSlice() {
  const created = handleSliceCreate(freshState(), {
    id: "dns-cache",
    name: "DNS cache",
    description: "Cache upstream DNS responses",
    type: "vertical",
    goal: "Cut repeat DNS latency without stale answers",
    criteria: ["p99 < 1ms", "respects TTLs"],
    strand: "quick",
  }, quick);
  return created.state;
}

describe("seeding", () => {
  test("DEFAULT_STRANDS ships quick and granular", () => {
    expect(Object.keys(DEFAULT_STRANDS).sort()).toEqual(["granular", "quick"]);
    expect(quick.knots.map((k) => k.name)).toEqual(["Prototype", "Realization", "Finalization"]);
    expect(DEFAULT_STRANDS.granular.knots).toHaveLength(7);
  });

  test("seedStrand instantiates all knots as pending with focus copied", () => {
    const strand = seedStrand("quick", quick);
    expect(strand.name).toBe("quick");
    expect(strand.current_knot).toBeNull();
    expect(strand.pending_fast_forward).toBeNull();
    expect(strand.knots).toHaveLength(3);
    expect(strand.knots[0]).toMatchObject({
      name: "Prototype",
      status: "pending",
      goals: [],
      success_criteria: [],
      plan: null,
      signed_off: false,
    });
    expect(strand.knots[0]!.focus.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t seeding`
Expected: FAIL — `seedStrand`/`DEFAULT_STRANDS` not exported.

- [ ] **Step 3: Implement.** Append to `extensions/project-tracker-core.ts`:

```ts
export const DEFAULT_STRANDS: Record<string, StrandTemplate> = {
  quick: {
    description: "Quick strand for simple, scoped, or smaller work.",
    knots: [
      { name: "Prototype", focus: "Research/prototype approaches and ground the decision on how to build it." },
      { name: "Realization", focus: "Build the final implementation incl. required tests, ready for finalization." },
      { name: "Finalization", focus: "Validation, review, and polishing to finalize the strand." },
    ],
  },
  granular: {
    description: "Granular strand for complex or large-scope work.",
    knots: [
      { name: "Proof-of-Work", focus: "Prove the approach; establish design, API, patterns, and decisions for later knots." },
      { name: "Alpha", focus: "First real, integrated implementation." },
      { name: "Beta", focus: "Ready to show someone else." },
      { name: "Gamma", focus: "Staging-ready, all core features." },
      { name: "RC1", focus: "Feature complete, polishing." },
      { name: "RC2", focus: "Early-adopter ready." },
      { name: "Release", focus: "Production confident." },
    ],
  },
};

export function seedStrand(name: string, template: StrandTemplate): SliceStrand {
  return {
    name,
    description: template.description ?? "",
    current_knot: null,
    pending_fast_forward: null,
    knots: template.knots.map((k) => ({
      name: k.name,
      title: k.title ?? null,
      focus: k.focus ?? "",
      status: "pending",
      goals: [],
      success_criteria: [],
      plan: null,
      resources: [],
      started_at: null,
      completed_at: null,
      signed_off: false,
      signed_off_message: null,
      validation_evidence_summary: null,
      notes: null,
    })),
  };
}
```

- [ ] **Step 4: Run it, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t seeding`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): add DEFAULT_STRANDS and seedStrand"
```

---

## Phase 3 — Slice handlers + state scaffolding

### Task 3: `createInitialState`, `normalizeState`, internal helpers

**Files:**
- Modify: `extensions/project-tracker-core.ts`

- [ ] **Step 1: Implement state scaffolding + helpers.** Append:

```ts
export function createInitialState(config: ProjectConfig = {}, cwdName = "Project"): ProjectState {
  return {
    project: {
      name: config.project?.name?.trim() || cwdName,
      description: config.project?.description?.trim() || "",
      updated_at: isoNow(),
    },
    slices: [],
    milestones: [],
  };
}

function compareSlices(a: Slice, b: Slice): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id.localeCompare(b.id);
}

export function normalizeState(state: ProjectState, config: ProjectConfig = {}, cwdName = "Project"): ProjectState {
  const base = state ?? createInitialState(config, cwdName);
  return {
    project: {
      name: config.project?.name?.trim() || base.project?.name || cwdName,
      description: config.project?.description?.trim() ?? base.project?.description ?? "",
      updated_at: base.project?.updated_at || isoNow(),
    },
    slices: [...(base.slices ?? [])].sort(compareSlices),
    milestones: [...(base.milestones ?? [])],
  };
}

function touch(state: ProjectState): ProjectState {
  return { ...state, project: { ...state.project, updated_at: isoNow() } };
}

function cloneState(state: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(state)) as ProjectState;
}

function findSlice(state: ProjectState, sliceId: string | undefined): Slice | undefined {
  if (!sliceId) return undefined;
  return state.slices.find((slice) => slice.id === sliceId);
}

function findKnot(slice: Slice, knotName: string | null | undefined): Knot | undefined {
  if (!knotName) return undefined;
  return slice.strand.knots.find((k) => k.name === knotName);
}

function getActiveKnot(slice: Slice): Knot | undefined {
  return findKnot(slice, slice.strand.current_knot);
}

function firstPendingKnot(slice: Slice): Knot | undefined {
  return slice.strand.knots.find((k) => k.status === "pending");
}

function nextPriority(state: ProjectState): number {
  if (state.slices.length === 0) return 100;
  return Math.max(...state.slices.map((s) => s.priority)) + 10;
}

function criteriaProgress(criteria: SuccessCriterion[]): string {
  const met = criteria.filter((c) => c.met).length;
  return `${met}/${criteria.length}`;
}
```

- [ ] **Step 2: Commit (no test yet — exercised by Task 4).**

```bash
git add extensions/project-tracker-core.ts
git commit -m "feat(tracker): add state scaffolding and slice/knot helpers"
```

### Task 4: `handleSliceCreate`, `handleSliceUpdate`, `handleSliceActivate`, `handleSliceHold`

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append to the test file:

```ts
describe("slice lifecycle", () => {
  test("create seeds strand snapshot and slice-level criteria, status defined", () => {
    const state = withSlice();
    const slice = state.slices[0]!;
    expect(slice.status).toBe("defined");
    expect(slice.goal).toContain("DNS latency");
    expect(slice.success_criteria).toEqual([
      { text: "p99 < 1ms", met: false },
      { text: "respects TTLs", met: false },
    ]);
    expect(slice.strand.name).toBe("quick");
    expect(slice.strand.knots.map((k) => k.name)).toEqual(["Prototype", "Realization", "Finalization"]);
    expect(slice.strand.knots.every((k) => k.status === "pending")).toBe(true);
  });

  test("create rejects duplicate id and missing goal", () => {
    const dup = handleSliceCreate(withSlice(), {
      id: "dns-cache", name: "x", description: "y", type: "vertical", goal: "g", criteria: [], strand: "quick",
    }, quick);
    expect(dup.error).toBe("duplicate slice");

    const noGoal = handleSliceCreate(freshState(), {
      id: "x", name: "x", description: "y", type: "vertical", goal: "", criteria: [], strand: "quick",
    }, quick);
    expect(noGoal.error).toBe("missing fields");
  });

  test("update edits goal and priority; activate and hold switch status", () => {
    let state = withSlice();
    state = handleSliceUpdate(state, "dns-cache", { goal: "New goal", priority: 50 }).state;
    expect(state.slices[0]!.goal).toBe("New goal");
    expect(state.slices[0]!.priority).toBe(50);

    state = handleSliceActivate(state, "dns-cache").state;
    expect(state.slices[0]!.status).toBe("active");
    state = handleSliceHold(state, "dns-cache").state;
    expect(state.slices[0]!.status).toBe("on_hold");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "slice lifecycle"`
Expected: FAIL — handlers undefined.

- [ ] **Step 3: Implement.** Append:

```ts
export interface SliceCreateInput {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority?: number;
  goal: string;
  criteria: string[];
  strand: string;
}

export function handleSliceCreate(state: ProjectState, input: SliceCreateInput, template: StrandTemplate): ActionResult {
  const current = cloneState(state);
  if (!input.id?.trim() || !input.name?.trim() || !input.description?.trim() || !input.goal?.trim()) {
    return { text: "Error: id, name, description, and goal are required", state, error: "missing fields" };
  }
  if (!template || !Array.isArray(template.knots) || template.knots.length === 0) {
    return { text: `Error: strand "${input.strand}" has no knots`, state, error: "invalid strand" };
  }
  if (current.slices.some((s) => s.id === input.id)) {
    return { text: `Error: slice ${input.id} already exists`, state, error: "duplicate slice" };
  }

  current.slices.push({
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    priority: input.priority ?? nextPriority(current),
    status: "defined",
    goal: input.goal.trim(),
    success_criteria: (input.criteria ?? []).map((text) => ({ text, met: false })),
    started_at: null,
    completed_at: null,
    signed_off: false,
    signed_off_message: null,
    validation_evidence_summary: null,
    notes: null,
    resources: [],
    strand: seedStrand(input.strand, template),
  });

  return { text: `Created slice ${input.id} on strand "${input.strand}"`, state: touch(normalizeState(current)) };
}

export interface SliceUpdateInput {
  name?: string;
  description?: string;
  goal?: string;
  priority?: number;
  type?: SliceType;
}

export function handleSliceUpdate(state: ProjectState, sliceId: string | undefined, patch: SliceUpdateInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (patch.name?.trim()) slice.name = patch.name.trim();
  if (patch.description?.trim()) slice.description = patch.description.trim();
  if (patch.goal?.trim()) slice.goal = patch.goal.trim();
  if (typeof patch.priority === "number") slice.priority = patch.priority;
  if (patch.type) slice.type = patch.type;
  return { text: `Updated slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceActivate(state: ProjectState, sliceId: string | undefined): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (slice.status === "complete") return { text: `Error: slice ${slice.id} is already complete`, state, error: "already complete" };
  slice.status = "active";
  if (!slice.started_at) slice.started_at = isoNow();
  return { text: `Activated slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceHold(state: ProjectState, sliceId: string | undefined): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  slice.status = "on_hold";
  return { text: `Put slice ${slice.id} on hold`, state: touch(normalizeState(current)) };
}
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "slice lifecycle"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): slice create/update/activate/hold handlers"
```

---

## Phase 4 — Knot handlers

### Task 5: `handleKnotStart`, `handleKnotUpdate`, `handleKnotSetPlan`

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append:

```ts
describe("knot start/update/plan", () => {
  test("start activates a pending knot and fills goals + criteria", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    const res = handleKnotStart(state, {
      slice_id: "dns-cache", knot: "Prototype",
      goals: ["compare LRU vs TTL-bucket"], criteria: ["benchmark < 1ms"],
    });
    expect(res.error).toBeUndefined();
    const slice = res.state.slices[0]!;
    expect(slice.strand.current_knot).toBe("Prototype");
    const knot = slice.strand.knots[0]!;
    expect(knot.status).toBe("active");
    expect(knot.goals).toEqual(["compare LRU vs TTL-bucket"]);
    expect(knot.success_criteria).toEqual([{ text: "benchmark < 1ms", met: false }]);
    expect(knot.started_at).not.toBeNull();
  });

  test("start rejects an unknown knot, a non-pending knot, and a second active knot", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    expect(handleKnotStart(state, { slice_id: "dns-cache", knot: "Nope", goals: [], criteria: ["c"] }).error).toBe("invalid knot");
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    expect(handleKnotStart(state, { slice_id: "dns-cache", knot: "Realization", goals: [], criteria: ["c"] }).error).toBe("active knot exists");
    expect(handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).error).toBe("knot not pending");
  });

  test("update edits goals/title; set_plan links and completes the active knot plan", () => {
    let state = handleKnotStart(handleSliceActivate(withSlice(), "dns-cache").state, {
      slice_id: "dns-cache", knot: "Prototype", goals: ["g"], criteria: ["c"],
    }).state;
    state = handleKnotUpdate(state, "dns-cache", { goals: ["g1", "g2"], title: "LRU spike" }).state;
    expect(state.slices[0]!.strand.knots[0]!.goals).toEqual(["g1", "g2"]);
    expect(state.slices[0]!.strand.knots[0]!.title).toBe("LRU spike");
    state = handleKnotSetPlan(state, "dns-cache", "docs/plans/p.md", "linked").state;
    expect(state.slices[0]!.strand.knots[0]!.plan).toEqual({ path: "docs/plans/p.md", status: "linked" });
    state = handleKnotSetPlan(state, "dns-cache", "docs/plans/p.md", "complete").state;
    expect(state.slices[0]!.strand.knots[0]!.plan!.status).toBe("complete");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "knot start"`
Expected: FAIL — handlers undefined.

- [ ] **Step 3: Implement.** Append:

```ts
export interface KnotStartInput {
  slice_id?: string;
  knot: string;
  goals: string[];
  criteria: string[];
}

export function handleKnotStart(state: ProjectState, input: KnotStartInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, input.slice_id);
  if (!slice) return { text: `Error: unknown slice ${input.slice_id ?? "<missing>"}`, state, error: "unknown slice" };
  if (!input.knot?.trim()) return { text: "Error: knot is required", state, error: "missing knot" };
  const knot = findKnot(slice, input.knot);
  if (!knot) {
    const valid = slice.strand.knots.map((k) => k.name).join(", ");
    return { text: `Error: invalid knot "${input.knot}". Valid knots: ${valid}`, state, error: "invalid knot" };
  }
  if (slice.strand.current_knot) {
    return { text: `Error: slice ${slice.id} already has active knot ${slice.strand.current_knot}`, state, error: "active knot exists" };
  }
  if (knot.status !== "pending") {
    return { text: `Error: knot ${knot.name} is ${knot.status}, not pending`, state, error: "knot not pending" };
  }
  if (!input.criteria || input.criteria.length === 0) {
    return { text: "Error: at least one success criterion is required", state, error: "missing criteria" };
  }

  knot.status = "active";
  knot.goals = [...(input.goals ?? [])];
  knot.success_criteria = input.criteria.map((text) => ({ text, met: false }));
  knot.started_at = isoNow();
  slice.strand.current_knot = knot.name;
  slice.status = "active";
  if (!slice.started_at) slice.started_at = isoNow();

  return { text: `Started ${slice.id} → ${knot.name}`, state: touch(normalizeState(current)) };
}

export interface KnotUpdateInput {
  goals?: string[];
  title?: string;
}

export function handleKnotUpdate(state: ProjectState, sliceId: string | undefined, patch: KnotUpdateInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (patch.goals) knot.goals = [...patch.goals];
  if (typeof patch.title === "string") knot.title = patch.title.trim() || null;
  return { text: `Updated knot ${slice.id} → ${knot.name}`, state: touch(normalizeState(current)) };
}

export function handleKnotSetPlan(state: ProjectState, sliceId: string | undefined, filePath: string, status: PlanStatus): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (!filePath?.trim()) return { text: "Error: file_path is required", state, error: "missing file_path" };
  knot.plan = { path: filePath.trim(), status };
  return { text: `Plan ${status} for ${slice.id} → ${knot.name}: ${knot.plan.path}`, state: touch(normalizeState(current)) };
}
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "knot start"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): knot start/update/set_plan handlers"
```

### Task 6: `handleKnotSignOff`, `handleSliceSignOff`

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append:

```ts
describe("sign-off (persistent, lossless)", () => {
  function startAndMeet(state: any, knot: string, criteria: string[]) {
    let s = handleKnotStart(state, { slice_id: "dns-cache", knot, goals: ["g"], criteria }).state;
    criteria.forEach((_, i) => {
      s = handleVerifyCriterion(s, "dns-cache", "knot", i, `evidence ${i}`).state;
    });
    return s;
  }

  test("knot sign-off keeps the criteria forever and clears current_knot", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = startAndMeet(state, "Prototype", ["bench < 1ms", "decision made"]);
    const res = handleKnotSignOff(state, "dns-cache", "Prototype looks good", "bench green; LRU chosen");
    expect(res.error).toBeUndefined();
    const knot = res.state.slices[0]!.strand.knots[0]!;
    expect(knot.status).toBe("signed_off");
    expect(knot.signed_off).toBe(true);
    expect(knot.validation_evidence_summary).toBe("bench green; LRU chosen");
    // criteria preserved with their per-criterion evidence — NOT erased:
    expect(knot.success_criteria).toEqual([
      { text: "bench < 1ms", met: true, evidence: "evidence 0", met_at: expect.any(String) },
      { text: "decision made", met: true, evidence: "evidence 1", met_at: expect.any(String) },
    ]);
    expect(res.state.slices[0]!.strand.current_knot).toBeNull();
  });

  test("knot sign-off refuses unmet criteria and names them", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["unmet"] }).state;
    const res = handleKnotSignOff(state, "dns-cache", "m", "e");
    expect(res.error).toBe("unmet criteria");
    expect(res.text).toContain("unmet");
  });

  test("slice sign-off requires all knots signed off, then completes the slice", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    for (const k of ["Prototype", "Realization", "Finalization"]) {
      state = startAndMeet(state, k, ["c"]);
      state = handleKnotSignOff(state, "dns-cache", `${k} done`, `${k} evidence`).state;
    }
    // all knots signed off, current_knot null:
    const early = handleSliceSignOff(state, "dns-cache", "ship it", "all knots green");
    expect(early.error).toBeUndefined();
    const slice = early.state.slices[0]!;
    expect(slice.status).toBe("complete");
    expect(slice.signed_off).toBe(true);
    expect(slice.validation_evidence_summary).toBe("all knots green");
    expect(slice.completed_at).not.toBeNull();
  });

  test("slice sign-off refuses while a knot is still pending", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = startAndMeet(state, "Prototype", ["c"]);
    state = handleKnotSignOff(state, "dns-cache", "p", "e").state;
    const res = handleSliceSignOff(state, "dns-cache", "m", "e");
    expect(res.error).toBe("knots incomplete");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "sign-off"`
Expected: FAIL — handlers undefined (note: `handleVerifyCriterion` is implemented in Task 8; if running this task in isolation it will also be undefined — implement Task 8's `handleVerifyCriterion` first or run the full suite after Phase 5).

- [ ] **Step 3: Implement.** Append:

```ts
export function handleKnotSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  const unmet = knot.success_criteria.filter((c) => !c.met);
  if (unmet.length > 0) {
    return {
      text: `Error: ${slice.id} → ${knot.name} has unmet criteria: ${unmet.map((c) => c.text).join("; ")}`,
      state,
      error: "unmet criteria",
    };
  }
  if (!evidence?.trim()) return { text: "Error: validation evidence is required", state, error: "missing evidence" };

  knot.status = "signed_off";
  knot.signed_off = true;
  knot.signed_off_message = message?.trim() || null;
  knot.validation_evidence_summary = evidence.trim();
  knot.completed_at = isoNow();
  slice.strand.current_knot = null;

  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Signed off ${slice.id} → ${knot.name}. ${tail}`, state: touch(normalizeState(current)) };
}

export function handleSliceSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const incomplete = slice.strand.knots.filter((k) => k.status !== "signed_off" && k.status !== "fast_forwarded");
  if (incomplete.length > 0) {
    return {
      text: `Error: ${slice.id} has knots not yet signed off: ${incomplete.map((k) => k.name).join(", ")}`,
      state,
      error: "knots incomplete",
    };
  }
  if (!evidence?.trim()) return { text: "Error: validation evidence is required", state, error: "missing evidence" };

  slice.status = "complete";
  slice.signed_off = true;
  slice.signed_off_message = message?.trim() || null;
  slice.validation_evidence_summary = evidence.trim();
  slice.completed_at = isoNow();
  slice.strand.current_knot = null;
  return { text: `Slice ${slice.id} signed off and complete.`, state: touch(normalizeState(current)) };
}
```

- [ ] **Step 4: Run the full core suite, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "sign-off"`
Expected: PASS (run after Task 8 if `handleVerifyCriterion` is not yet present).

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): lossless knot and slice sign-off"
```

### Task 7: `handleKnotFastForward`, `handleCompleteFastForward`

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append:

```ts
describe("fast-forward", () => {
  test("init records pending_fast_forward; complete squashes the range and lands at target pending", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    // current_knot is null (nothing started). from = first pending = Prototype.
    const init = handleKnotFastForward(state, "dns-cache", "Finalization", "skip ahead, integrate everything in Finalization");
    expect(init.error).toBeUndefined();
    expect(init.state.slices[0]!.strand.pending_fast_forward).toMatchObject({ target_knot: "Finalization" });

    const done = handleCompleteFastForward(init.state, "dns-cache", "combined work done");
    expect(done.error).toBeUndefined();
    const knots = done.state.slices[0]!.strand.knots;
    expect(knots[0]!.status).toBe("fast_forwarded"); // Prototype
    expect(knots[1]!.status).toBe("fast_forwarded"); // Realization
    expect(knots[0]!.validation_evidence_summary).toBe("combined work done");
    expect(knots[2]!.status).toBe("pending");        // Finalization is the target, ready to start
    expect(done.state.slices[0]!.strand.current_knot).toBeNull();
    expect(done.state.slices[0]!.strand.pending_fast_forward).toBeNull();
  });

  test("init rejects a target that is not after the current position", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    // current = Prototype (idx 0); target Prototype is not after it
    expect(handleKnotFastForward(state, "dns-cache", "Prototype", "x").error).toBe("invalid target");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "fast-forward"`
Expected: FAIL — handlers undefined.

- [ ] **Step 3: Implement.** Append:

```ts
function fastForwardFromIndex(slice: Slice): number {
  if (slice.strand.current_knot) {
    return slice.strand.knots.findIndex((k) => k.name === slice.strand.current_knot);
  }
  return slice.strand.knots.findIndex((k) => k.status === "pending");
}

export function handleKnotFastForward(state: ProjectState, sliceId: string, targetKnot: string, instructions: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  if (slice.status !== "active") return { text: `Error: slice ${sliceId} is not active`, state, error: "not active" };
  if (slice.strand.pending_fast_forward) return { text: `Error: slice ${sliceId} already has a pending fast-forward`, state, error: "pending fast-forward exists" };
  if (!instructions?.trim()) return { text: "Error: fast-forward instructions are required", state, error: "missing instructions" };

  const fromIndex = fastForwardFromIndex(slice);
  const targetIndex = slice.strand.knots.findIndex((k) => k.name === targetKnot);
  if (fromIndex === -1) return { text: `Error: slice ${sliceId} has no pending knot to fast-forward from`, state, error: "no from knot" };
  if (targetIndex === -1) return { text: `Error: target knot "${targetKnot}" not in strand`, state, error: "invalid target" };
  if (targetIndex <= fromIndex) return { text: `Error: target must come after the current position`, state, error: "invalid target" };

  slice.strand.pending_fast_forward = {
    target_knot: targetKnot,
    user_instructions: instructions.trim(),
    initiated_at: isoNow(),
  };
  const squashed = slice.strand.knots.slice(fromIndex, targetIndex).map((k) => k.name).join(", ");
  return { text: `Fast-forward initiated for ${sliceId} → ${targetKnot} (squashing: ${squashed}). Synthesize and execute a combined plan, then call knot:complete_fast_forward.`, state: touch(normalizeState(current)) };
}

export function handleCompleteFastForward(state: ProjectState, sliceId: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const pff = slice.strand.pending_fast_forward;
  if (!pff) return { text: `Error: slice ${sliceId} has no pending fast-forward`, state, error: "no pending fast-forward" };
  if (!evidence?.trim()) return { text: "Error: evidence summary is required", state, error: "missing evidence" };

  const fromIndex = fastForwardFromIndex(slice);
  const targetIndex = slice.strand.knots.findIndex((k) => k.name === pff.target_knot);
  const now = isoNow();
  for (let i = fromIndex; i < targetIndex; i++) {
    const knot = slice.strand.knots[i]!;
    if (knot.status === "signed_off" || knot.status === "fast_forwarded") continue;
    knot.status = "fast_forwarded";
    knot.signed_off = true;
    knot.started_at = knot.started_at ?? pff.initiated_at;
    knot.completed_at = now;
    knot.validation_evidence_summary = evidence.trim();
    knot.signed_off_message = `Fast-forwarded into ${pff.target_knot}: ${pff.user_instructions}`;
  }
  slice.strand.current_knot = null;
  slice.strand.pending_fast_forward = null;
  const squashed = slice.strand.knots.slice(fromIndex, targetIndex).map((k) => k.name).join(", ");
  return { text: `Fast-forward complete: squashed ${squashed}. ${pff.target_knot} is pending — start it with knot:start.`, state: touch(normalizeState(current)) };
}
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "fast-forward"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): persistent fast-forward squashing"
```

---

## Phase 5 — Cross-cutting handlers

### Task 8: `handleVerifyCriterion`, `handleAnnotate`, `handleResourceAdd`, `handleResourceRemove`, `handleMilestoneAdd`

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append:

```ts
describe("cross-cutting (target discriminator)", () => {
  test("verify_criterion marks slice- and knot-level criteria met with evidence", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleVerifyCriterion(state, "dns-cache", "slice", 0, "p99 measured").state;
    expect(state.slices[0]!.success_criteria[0]).toMatchObject({ met: true, evidence: "p99 measured" });

    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c0"] }).state;
    state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "done").state;
    expect(state.slices[0]!.strand.knots[0]!.success_criteria[0]).toMatchObject({ met: true, evidence: "done" });
  });

  test("verify_criterion rejects out-of-range index", () => {
    const state = handleSliceActivate(withSlice(), "dns-cache").state;
    expect(handleVerifyCriterion(state, "dns-cache", "slice", 9, "x").error).toBe("criterion out of range");
  });

  test("annotate sets/append notes on slice and active knot", () => {
    let state = handleAnnotate(withSlice(), "dns-cache", "slice", "first", "set").state;
    state = handleAnnotate(state, "dns-cache", "slice", "second", "append").state;
    expect(state.slices[0]!.notes).toBe("first\n\nsecond");
  });

  test("resource add/remove on slice", () => {
    let state = handleResourceAdd(withSlice(), "dns-cache", "slice", { type: "report", ref: "docs/b.md", title: "bench" }).state;
    expect(state.slices[0]!.resources).toHaveLength(1);
    state = handleResourceRemove(state, "dns-cache", "slice", 0).state;
    expect(state.slices[0]!.resources).toHaveLength(0);
  });

  test("milestone add", () => {
    const res = handleMilestoneAdd(freshState(), { name: "PoW core ready", description: "spike landed" });
    expect(res.state.milestones).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "cross-cutting"`
Expected: FAIL — handlers undefined.

- [ ] **Step 3: Implement.** Append:

```ts
export type Target = "slice" | "knot";

function targetCriteria(slice: Slice, target: Target): { ok: true; list: SuccessCriterion[] } | { ok: false; error: string } {
  if (target === "slice") return { ok: true, list: slice.success_criteria };
  const knot = getActiveKnot(slice);
  if (!knot) return { ok: false, error: "no active knot" };
  return { ok: true, list: knot.success_criteria };
}

export function handleVerifyCriterion(state: ProjectState, sliceId: string | undefined, target: Target, index: number, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const sel = targetCriteria(slice, target);
  if (!sel.ok) return { text: `Error: ${sel.error}`, state, error: sel.error };
  if (index < 0 || index >= sel.list.length) return { text: `Error: criterion index ${index} out of range`, state, error: "criterion out of range" };
  const c = sel.list[index]!;
  c.met = true;
  c.evidence = evidence.trim();
  c.met_at = isoNow();
  return { text: `Verified ${target} criterion [${index}] for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleAnnotate(state: ProjectState, sliceId: string | undefined, target: Target, notes: string, mode: "set" | "append"): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!notes?.trim()) return { text: "Error: notes content is required", state, error: "empty notes" };
  const apply = (prev: string | null) => (mode === "append" && prev ? `${prev}\n\n${notes.trim()}` : notes.trim());
  if (target === "slice") {
    slice.notes = apply(slice.notes);
  } else {
    const knot = getActiveKnot(slice);
    if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
    knot.notes = apply(knot.notes);
  }
  return { text: `Updated ${target} notes for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleResourceAdd(state: ProjectState, sliceId: string | undefined, target: Target, resource: Resource): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!resource?.ref?.trim()) return { text: "Error: resource.ref is required", state, error: "missing resource" };
  const entry: Resource = { type: resource.type, ref: resource.ref.trim(), ...(resource.title ? { title: resource.title } : {}), ...(resource.note ? { note: resource.note } : {}) };
  if (target === "slice") {
    slice.resources.push(entry);
  } else {
    const knot = getActiveKnot(slice);
    if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
    knot.resources.push(entry);
  }
  return { text: `Added ${target} resource ${entry.ref} to ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleResourceRemove(state: ProjectState, sliceId: string | undefined, target: Target, index: number): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const list = target === "slice" ? slice.resources : getActiveKnot(slice)?.resources;
  if (!list) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (index < 0 || index >= list.length) return { text: `Error: resource index ${index} out of range`, state, error: "resource out of range" };
  list.splice(index, 1);
  return { text: `Removed ${target} resource [${index}] from ${slice.id}`, state: touch(normalizeState(current)) };
}

export interface MilestoneInput {
  name: string;
  description: string;
}

export function handleMilestoneAdd(state: ProjectState, input: MilestoneInput): ActionResult {
  const current = cloneState(state);
  if (!input.name?.trim() || !input.description?.trim()) {
    return { text: "Error: milestone name and description are required", state, error: "missing milestone fields" };
  }
  current.milestones.push({ name: input.name.trim(), description: input.description.trim(), reached_at: isoNow() });
  return { text: `Added milestone ${input.name}`, state: touch(normalizeState(current)) };
}
```

- [ ] **Step 4: Run, expect pass** (and run the Task-6 sign-off block now that `handleVerifyCriterion` exists).

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "cross-cutting"` then `npx vitest run tests/extension/project-tracker-core.test.ts -t "sign-off"`
Expected: PASS for both.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): verify_criterion/annotate/resource/milestone via target discriminator"
```

---

## Phase 6 — `computeNext` + formatters + query handlers

### Task 9: `computeNext` and query/format helpers

**Files:**
- Modify: `extensions/project-tracker-core.ts`
- Test: `tests/extension/project-tracker-core.test.ts`

- [ ] **Step 1: Write the failing test.** Append:

```ts
describe("computeNext", () => {
  test("walks the lifecycle", () => {
    // defined slice
    let state = withSlice();
    expect(computeNext(state)).toContain("Activate dns-cache");

    state = handleSliceActivate(state, "dns-cache").state;
    expect(computeNext(state)).toContain("Start dns-cache → Prototype");

    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c1", "c2"] }).state;
    expect(computeNext(state)).toContain("Continue dns-cache → Prototype");
    expect(computeNext(state)).toContain("0/2");

    state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "e").state;
    state = handleVerifyCriterion(state, "dns-cache", "knot", 1, "e").state;
    expect(computeNext(state)).toContain("ready for sign-off");

    state = handleKnotSignOff(state, "dns-cache", "m", "e").state;
    expect(computeNext(state)).toContain("Start dns-cache → Realization");
  });

  test("pending fast-forward is top priority", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotFastForward(state, "dns-cache", "Finalization", "go").state;
    expect(computeNext(state)).toContain("fast-forward");
  });

  test("all knots signed off → ready for slice sign-off", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    for (const k of ["Prototype", "Realization", "Finalization"]) {
      state = handleKnotStart(state, { slice_id: "dns-cache", knot: k, goals: [], criteria: ["c"] }).state;
      state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "e").state;
      state = handleKnotSignOff(state, "dns-cache", "m", "e").state;
    }
    expect(computeNext(state)).toContain("slice sign-off");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts -t "computeNext"`
Expected: FAIL — `computeNext` undefined.

- [ ] **Step 3: Implement.** Append `computeNext`, the query handlers, and the formatters:

```ts
export function computeNext(state: ProjectState): string {
  const active = state.slices.filter((s) => s.status === "active").sort(compareSlices);

  const ff = active.find((s) => s.strand.pending_fast_forward);
  if (ff) return `Execute fast-forward plan for ${ff.id} → ${ff.strand.pending_fast_forward!.target_knot}`;

  for (const slice of active) {
    const knot = getActiveKnot(slice);
    if (knot && knot.success_criteria.some((c) => !c.met)) {
      return `Continue ${slice.id} → ${knot.name} (${criteriaProgress(knot.success_criteria)} criteria met)`;
    }
  }
  for (const slice of active) {
    const knot = getActiveKnot(slice);
    if (knot && knot.success_criteria.every((c) => c.met)) {
      return `${slice.id} → ${knot.name} is ready for sign-off (/project:knot:advance ${slice.id})`;
    }
  }
  for (const slice of active) {
    if (slice.strand.current_knot) continue;
    const pending = firstPendingKnot(slice);
    if (pending) return `Start ${slice.id} → ${pending.name}`;
    return `${slice.id} is ready for slice sign-off (/project:slice:advance ${slice.id})`;
  }

  const defined = state.slices.filter((s) => s.status === "defined").sort(compareSlices);
  if (defined.length > 0) return `Activate ${defined[0]!.id} (${defined[0]!.type}, priority ${defined[0]!.priority})`;

  return "No obvious next slice.";
}

export function handleStatus(state: ProjectState): ActionResult {
  return { text: formatProjectStatus(state), state };
}
export function handleSliceList(state: ProjectState, status?: SliceStatus): ActionResult {
  return { text: formatSliceList(state, status), state };
}
export function handleSliceGet(state: ProjectState, sliceId?: string): ActionResult {
  const slice = findSlice(state, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  return { text: formatSliceDetail(slice), state };
}
export function handleNext(state: ProjectState): ActionResult {
  return { text: computeNext(state), state };
}

export function formatProjectStatus(state: ProjectState): string {
  const by = (s: SliceStatus) => state.slices.filter((x) => x.status === s);
  const lines: string[] = [];
  lines.push(state.project.name + (state.project.description ? ` — ${state.project.description}` : ""));
  lines.push(`Slices: ${state.slices.length} total (${by("active").length} active, ${by("defined").length} defined, ${by("on_hold").length} on hold, ${by("complete").length} complete)`);
  const active = by("active").sort(compareSlices);
  if (active.length > 0) {
    lines.push("", "Active slices:");
    for (const slice of active) {
      const knot = getActiveKnot(slice);
      const prog = knot ? ` [${knot.name} ${criteriaProgress(knot.success_criteria)}]` : ` [${slice.strand.current_knot ?? "no knot"}]`;
      lines.push(`- ${slice.id} (${slice.strand.name})${prog}${slice.strand.pending_fast_forward ? " ⚡FF" : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatSliceList(state: ProjectState, status?: SliceStatus): string {
  const slices = (status ? state.slices.filter((s) => s.status === status) : state.slices).sort(compareSlices);
  if (slices.length === 0) return status ? `No slices with status ${status}.` : "No slices defined.";
  return slices.map((s) => `- [${s.priority}] ${s.id} (${s.type}, ${s.strand.name}) — ${s.status}, knot=${s.strand.current_knot ?? "none"}`).join("\n");
}

export function formatSliceDetail(slice: Slice): string {
  const lines: string[] = [];
  lines.push(`${slice.id} — ${slice.name}`);
  lines.push(slice.description);
  lines.push(`type=${slice.type}, priority=${slice.priority}, status=${slice.status}, strand=${slice.strand.name}`);
  lines.push(`goal: ${slice.goal}`);
  if (slice.success_criteria.length > 0) {
    lines.push(`success criteria (${criteriaProgress(slice.success_criteria)}):`);
    slice.success_criteria.forEach((c, i) => lines.push(`  ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
  }
  if (slice.resources.length > 0) {
    lines.push("resources:");
    slice.resources.forEach((r, i) => lines.push(`  [${i}] ${r.type}:${r.ref}${r.title ? ` (${r.title})` : ""}`));
  }
  if (slice.notes) lines.push("", "Slice notes:", slice.notes);
  if (slice.strand.pending_fast_forward) {
    const pff = slice.strand.pending_fast_forward;
    lines.push("", `⚡ Pending fast-forward → ${pff.target_knot}: ${pff.user_instructions}`);
  }
  lines.push("", "Knots:");
  for (const k of slice.strand.knots) {
    const marker = k.status === "signed_off" ? "✓" : k.status === "fast_forwarded" ? "»" : k.status === "active" ? "▶" : "○";
    lines.push(`  ${marker} ${k.name} [${k.status}] — ${k.focus}`);
    if (k.goals.length > 0) lines.push(`      goals: ${k.goals.join("; ")}`);
    if (k.success_criteria.length > 0) {
      lines.push(`      criteria (${criteriaProgress(k.success_criteria)}):`);
      k.success_criteria.forEach((c, i) => lines.push(`        ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
    }
    if (k.plan) lines.push(`      plan: ${k.plan.path} (${k.plan.status})`);
    if (k.validation_evidence_summary) lines.push(`      evidence: ${k.validation_evidence_summary}`);
    if (k.notes) lines.push(`      notes: ${k.notes}`);
  }
  return lines.join("\n");
}

export function formatCriteria(slice: Slice): string {
  const knot = getActiveKnot(slice);
  if (!knot) return `${slice.id} has no active knot.`;
  const lines = [`${slice.id} → ${knot.name} criteria (${criteriaProgress(knot.success_criteria)})`];
  knot.success_criteria.forEach((c, i) => lines.push(`${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
  return lines.join("\n");
}

export function getActiveSliceIds(state: ProjectState): string[] {
  return state.slices.filter((s) => s.status === "active").map((s) => s.id);
}
```

- [ ] **Step 4: Run the full core suite, expect all pass.**

Run: `npx vitest run tests/extension/project-tracker-core.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker-core.test.ts
git commit -m "feat(tracker): computeNext, query handlers, and formatters for new model"
```

---

## Phase 7 — Migration (Pass-1 mechanical transform)

### Task 10: `migrateLegacyState`

**Files:**
- Create: `extensions/project-tracker-migrate.ts`
- Test: `tests/extension/project-tracker-migrate.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/extension/project-tracker-migrate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { migrateLegacyState } from "../../extensions/project-tracker-migrate.js";
import { DEFAULT_STRANDS } from "../../extensions/project-tracker-core.js";

const legacy = {
  project: { name: "EdgeOS", description: "router", updated_at: "2026-01-01T00:00:00.000Z" },
  milestones: [{ name: "m", description: "d", reached_at: "2026-01-01T00:00:00.000Z" }],
  slices: [{
    id: "dns-cache", name: "DNS cache", description: "cache", type: "vertical", priority: 100,
    status: "active", current_knot: "Alpha", notes: "slice notes",
    active_knot: { knot: "Alpha", started_at: "2026-01-02T00:00:00.000Z",
      criteria: [{ text: "works", verified: true, evidence: "tests green", verified_at: "2026-01-03T00:00:00.000Z" }, { text: "todo", verified: false }] },
    active_plan: "docs/plans/alpha.md", active_plan_status: "linked",
    knot_history: [{ knot: "PoW", started_at: "2026-01-01T00:00:00.000Z", completed_at: "2026-01-02T00:00:00.000Z", evidence_summary: "spike ok", signed_off: true }],
  }],
};

describe("migrateLegacyState (Pass 1 mechanical)", () => {
  const migrated = migrateLegacyState(legacy, DEFAULT_STRANDS.granular, "granular");
  const slice = migrated.slices[0]!;

  test("carries project + milestones + slice identity", () => {
    expect(migrated.project.name).toBe("EdgeOS");
    expect(migrated.milestones).toHaveLength(1);
    expect(slice.id).toBe("dns-cache");
    expect(slice.strand.name).toBe("granular");
    expect(slice.strand.knots.map((k) => k.name)).toEqual(DEFAULT_STRANDS.granular.knots.map((k) => k.name));
  });

  test("replays knot_history into signed_off knots", () => {
    const pow = slice.strand.knots.find((k) => k.name === "Proof-of-Work")!;
    // legacy used "PoW"; mechanical match falls back to index 0 when names differ
    expect(["signed_off"]).toContain(slice.strand.knots[0]!.status);
    expect(slice.strand.knots[0]!.validation_evidence_summary).toBe("spike ok");
  });

  test("maps active_knot criteria into SuccessCriterion (met preserved) and active plan", () => {
    const alpha = slice.strand.knots.find((k) => k.name === "Alpha")!;
    expect(alpha.status).toBe("active");
    expect(slice.strand.current_knot).toBe("Alpha");
    expect(alpha.success_criteria).toEqual([
      { text: "works", met: true, evidence: "tests green", met_at: "2026-01-03T00:00:00.000Z" },
      { text: "todo", met: false },
    ]);
    expect(alpha.plan).toEqual({ path: "docs/plans/alpha.md", status: "linked" });
  });

  test("leaves goal/success_criteria empty for Pass-2 backfill", () => {
    expect(slice.goal).toBe("");
    expect(slice.success_criteria).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker-migrate.test.ts`
Expected: FAIL — file/function missing.

- [ ] **Step 3: Implement.** Create `extensions/project-tracker-migrate.ts`:

```ts
import { seedStrand, isoNow } from "./project-tracker-core.js";
import type { ProjectState, Slice, StrandTemplate, SuccessCriterion } from "./project-tracker-core.js";

/**
 * Pass-1 mechanical migration from the legacy (transient) state shape to the new
 * persistent strand/knot model. THROWAWAY: used once on /mnt/Projects then removed.
 * Missing rich fields (slice goal/success_criteria, per-knot goals) are left empty
 * for the interactive Pass-2 agent backfill (see design §9).
 */
export function migrateLegacyState(legacy: any, strandTemplate: StrandTemplate, strandName: string): ProjectState {
  const slices: Slice[] = (legacy.slices ?? []).map((old: any) => {
    const strand = seedStrand(strandName, strandTemplate);
    const byName = new Map(strand.knots.map((k) => [k.name, k]));

    // Replay completed history → signed_off knots. Match by name; fall back to ordinal.
    (old.knot_history ?? []).forEach((rec: any, ordinal: number) => {
      const knot = byName.get(rec.knot) ?? strand.knots[ordinal];
      if (!knot) return;
      const fastForwarded = !!rec.fast_forward;
      knot.status = fastForwarded ? "fast_forwarded" : "signed_off";
      knot.signed_off = true;
      knot.started_at = rec.started_at ?? null;
      knot.completed_at = rec.completed_at ?? null;
      knot.validation_evidence_summary = rec.evidence_summary ?? null;
    });

    // Replay the active knot.
    if (old.active_knot) {
      const knot = byName.get(old.active_knot.knot) ?? strand.knots.find((k) => k.status === "pending");
      if (knot) {
        knot.status = "active";
        knot.started_at = old.active_knot.started_at ?? null;
        knot.success_criteria = (old.active_knot.criteria ?? []).map((c: any): SuccessCriterion => ({
          text: c.text,
          met: !!c.verified,
          ...(c.evidence ? { evidence: c.evidence } : {}),
          ...(c.verified_at ? { met_at: c.verified_at } : {}),
        }));
        if (old.active_plan) knot.plan = { path: old.active_plan, status: old.active_plan_status ?? "linked" };
        strand.current_knot = knot.name;
      }
    }

    return {
      id: old.id,
      name: old.name ?? old.id,
      description: old.description ?? "",
      type: old.type === "horizontal" ? "horizontal" : "vertical",
      priority: typeof old.priority === "number" ? old.priority : 100,
      status: old.status ?? "defined",
      goal: "",                 // Pass-2 backfill
      success_criteria: [],     // Pass-2 backfill
      started_at: old.active_knot?.started_at ?? null,
      completed_at: old.status === "complete" ? (old.project?.updated_at ?? isoNow()) : null,
      signed_off: old.status === "complete",
      signed_off_message: null,
      validation_evidence_summary: null,
      notes: old.notes ?? null,
      resources: [],
      strand,
    };
  });

  return {
    project: {
      name: legacy.project?.name ?? "Project",
      description: legacy.project?.description ?? "",
      updated_at: isoNow(),
    },
    slices,
    milestones: (legacy.milestones ?? []).map((m: any) => ({ name: m.name, description: m.description, reached_at: m.reached_at })),
  };
}
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker-migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the throwaway runner.** Create `scripts/migrate-state.ts`:

```ts
// THROWAWAY: run once against /mnt/Projects, then delete this file.
// Usage: npx jiti scripts/migrate-state.ts <path-to-old-state.json> <strand-name>
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { migrateLegacyState } from "../extensions/project-tracker-migrate.js";
import { DEFAULT_STRANDS } from "../extensions/project-tracker-core.js";

const [, , statePath, strandName = "granular"] = process.argv;
if (!statePath) { console.error("usage: migrate-state.ts <state.json> [strand]"); process.exit(1); }
const template = DEFAULT_STRANDS[strandName];
if (!template) { console.error(`unknown strand ${strandName}; have: ${Object.keys(DEFAULT_STRANDS).join(", ")}`); process.exit(1); }

const legacy = JSON.parse(readFileSync(statePath, "utf-8"));
copyFileSync(statePath, `${statePath}.bak`);
const migrated = migrateLegacyState(legacy, template, strandName);
writeFileSync(statePath, `${JSON.stringify(migrated, null, 2)}\n`, "utf-8");
console.log(`Pass-1 migration written. Backup at ${statePath}.bak. Now run the interactive Pass-2 backfill (design §9).`);
```

- [ ] **Step 6: Commit.**

```bash
git add extensions/project-tracker-migrate.ts tests/extension/project-tracker-migrate.test.ts scripts/migrate-state.ts
git commit -m "feat(tracker): one-shot legacy state migration (Pass-1 mechanical)"
```

> `scripts/` is NOT added to `package.json` `pi.extensions` or `files` — it is throwaway. After migrating `/mnt/Projects` and running the interactive Pass-2 backfill, delete `scripts/migrate-state.ts` (and optionally `project-tracker-migrate.ts` + its test) in a follow-up commit.

---

## Phase 8 — Wrapper: config loading + tool registration

### Task 11: Strand-aware config loading

**Files:**
- Modify: `extensions/project-tracker.ts` (lines 43–146: `DEFAULTS`, `ProjectStrandConfig`, `loadProjectConfig`)

- [ ] **Step 1: Replace `DEFAULTS` and config loading.** Replace the `DEFAULTS` const (lines 43–54) and `loadProjectConfig` (lines 122–146) so config merges `strands` against `DEFAULT_STRANDS` and exposes a strand resolver. New `DEFAULTS`:

```ts
const DEFAULTS = { stateFile: ".pi/project/state.json" } as const;

type ProjectStrandConfig = ProjectConfig & { stateFile?: string };
```

New `loadProjectConfig` (replace the function body):

```ts
async function loadProjectConfig(cwd: string): Promise<{ root: string; configPath: string; config: ProjectStrandConfig; strands: Record<string, StrandTemplate>; statePath: string }> {
  const root = await findProjectRoot(cwd);
  const configPath = join(root, ".pi", "project.jsonc");

  let config: ProjectStrandConfig = {};
  if (await exists(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    const parsed = parse(raw);
    if (parsed && typeof parsed === "object") config = parsed as ProjectStrandConfig;
  }

  const strands = config.strands && Object.keys(config.strands).length > 0 ? config.strands : DEFAULT_STRANDS;
  const merged: ProjectStrandConfig = {
    ...config,
    project: { name: config.project?.name, description: config.project?.description },
    strands,
    stateFile: config.stateFile?.trim() || DEFAULTS.stateFile,
  };

  const statePath = resolve(root, merged.stateFile!);
  return { root, configPath, config: merged, strands, statePath };
}
```

Update the imports at the top of `project-tracker.ts` to pull `DEFAULT_STRANDS`, `StrandTemplate`, and the new handler/format function names from core (remove references to deleted symbols like `advanceKnotForSignoff`, `handleVerifyCriterion` old signature, `handleKnotCriteria`, `formatCriteria` stays, `handleSliceAnnotate`, `handleKnotAnnotate`, `handleInitFastForward`, `handleCompleteFastForward` old). Replace the import block (lines 9–41) with:

```ts
import {
  DEFAULT_STRANDS,
  type ProjectConfig,
  type ProjectState,
  type ProjectTrackerDetails,
  type SliceStatus,
  type SliceType,
  type StrandTemplate,
  type Target,
  type ResourceType,
  createInitialState,
  normalizeState,
  computeNext,
  formatProjectStatus,
  formatSliceList,
  formatSliceDetail,
  formatCriteria,
  handleStatus,
  handleSliceList,
  handleSliceGet,
  handleNext,
  handleSliceCreate,
  handleSliceUpdate,
  handleSliceActivate,
  handleSliceHold,
  handleSliceSignOff,
  handleKnotStart,
  handleKnotUpdate,
  handleKnotSetPlan,
  handleKnotSignOff,
  handleKnotFastForward,
  handleCompleteFastForward,
  handleVerifyCriterion,
  handleAnnotate,
  handleResourceAdd,
  handleResourceRemove,
  handleMilestoneAdd,
  getActiveKnotName,
} from "./project-tracker-core.js";
```

> `getActiveKnotName` is a tiny helper used by the widget/context — add it to core if you reference it; otherwise compute inline. To avoid an extra export, the context/widget code below reads `slice.strand.current_knot` directly, so you may omit `getActiveKnotName` from the import.

- [ ] **Step 2: Commit (compiles after Task 12 wires the switch).**

```bash
git add extensions/project-tracker.ts
git commit -m "feat(tracker): strand-aware config loading with DEFAULT_STRANDS"
```

### Task 12: Tool params + execute switch

**Files:**
- Modify: `extensions/project-tracker.ts` (lines 60–98 params; 294–424 execute switch)

- [ ] **Step 1: Replace `ProjectTrackerParams`** (lines 60–98) with the tightened schema:

```ts
const ResourceParam = Type.Object({
  type: StringEnum(["doc", "url", "file", "report", "memory", "knowledge"] as const, { description: "Resource kind" }),
  ref: Type.String({ description: "Path, URL, knowledge id, or memory slug" }),
  title: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
}, { additionalProperties: false });

const ProjectTrackerParams = Type.Object({
  action: StringEnum([
    "status", "slice:list", "slice:get", "next",
    "slice:create", "slice:update", "slice:activate", "slice:hold", "slice:sign_off",
    "knot:start", "knot:update", "knot:set_plan", "knot:sign_off", "knot:fast_forward", "knot:complete_fast_forward",
    "verify_criterion", "annotate", "resource:add", "resource:remove",
    "milestone:add",
  ] as const, { description: "Project tracker action" }),
  slice_id: Type.Optional(Type.String({ description: "Slice id" })),
  id: Type.Optional(Type.String({ description: "New slice id (slice:create)" })),
  name: Type.Optional(Type.String({ description: "Name for slice or milestone" })),
  description: Type.Optional(Type.String({ description: "Description for slice or milestone" })),
  type: Type.Optional(StringEnum(["vertical", "horizontal"] as const, { description: "Slice type" })),
  priority: Type.Optional(Type.Integer({ description: "Slice priority" })),
  status: Type.Optional(StringEnum(["defined", "active", "on_hold", "complete"] as const, { description: "Status filter (slice:list)" })),
  strand: Type.Optional(Type.String({ description: "Strand name to seed (slice:create); must exist in project.jsonc strands" })),
  goal: Type.Optional(Type.String({ description: "Slice goal (slice:create/update)" })),
  criteria: Type.Optional(Type.Array(Type.String(), { description: "Success criteria text (slice:create seeds slice-level; knot:start seeds knot-level)" })),
  goals: Type.Optional(Type.Array(Type.String(), { description: "Knot goals (knot:start/update)" })),
  title: Type.Optional(Type.String({ description: "Knot title (knot:update)" })),
  knot: Type.Optional(Type.String({ description: "Knot name (knot:start) or fast-forward target (knot:fast_forward)" })),
  target: Type.Optional(StringEnum(["slice", "knot"] as const, { description: "Whether verify_criterion/annotate/resource targets the slice or its active knot" })),
  index: Type.Optional(Type.Integer({ minimum: 0, description: "Criterion or resource index" })),
  evidence: Type.Optional(Type.String({ description: "Verification/sign-off evidence" })),
  message: Type.Optional(Type.String({ description: "Sign-off message (knot:sign_off, slice:sign_off)" })),
  file_path: Type.Optional(Type.String({ description: "Plan file path (knot:set_plan)" })),
  plan_status: Type.Optional(StringEnum(["linked", "complete"] as const, { description: "Plan status (knot:set_plan)" })),
  notes: Type.Optional(Type.String({ description: "Notes (annotate) or fast-forward instructions (knot:fast_forward)" })),
  notes_mode: Type.Optional(StringEnum(["set", "append"] as const, { description: "annotate: set (replace) or append" })),
  resource: Type.Optional(ResourceParam),
}, { additionalProperties: false });
```

- [ ] **Step 2: Replace the execute switch** (the `switch (params.action)` body, lines ~302–408) with handlers wired to the new core. A query-vs-mutation split:

```ts
switch (params.action) {
  case "status": { const { state } = await loadState(ctx.cwd); result = handleStatus(state); break; }
  case "slice:list": { const { state } = await loadState(ctx.cwd); result = handleSliceList(state, params.status as SliceStatus | undefined); break; }
  case "slice:get": { const { state } = await loadState(ctx.cwd); result = handleSliceGet(state, params.slice_id); break; }
  case "next": { const { state } = await loadState(ctx.cwd); result = handleNext(state); break; }

  case "slice:create": {
    result = await mutateState(ctx.cwd, (state, runtime) => {
      const strandName = params.strand ?? "";
      const template = runtime.strands[strandName];
      if (!template) {
        return { text: `Error: unknown strand "${strandName}". Available: ${Object.keys(runtime.strands).join(", ")}`, state, error: "unknown strand" };
      }
      return handleSliceCreate(state, {
        id: params.id ?? "", name: params.name ?? "", description: params.description ?? "",
        type: (params.type as SliceType) ?? "vertical", priority: params.priority,
        goal: params.goal ?? "", criteria: params.criteria ?? [], strand: strandName,
      }, template);
    });
    break;
  }
  case "slice:update": {
    result = await mutateState(ctx.cwd, (state) => handleSliceUpdate(state, params.slice_id, {
      name: params.name, description: params.description, goal: params.goal, priority: params.priority, type: params.type as SliceType | undefined,
    }));
    break;
  }
  case "slice:activate": { result = await mutateState(ctx.cwd, (s) => handleSliceActivate(s, params.slice_id)); break; }
  case "slice:hold": { result = await mutateState(ctx.cwd, (s) => handleSliceHold(s, params.slice_id)); break; }
  case "slice:sign_off": { result = await mutateState(ctx.cwd, (s) => handleSliceSignOff(s, params.slice_id ?? "", params.message ?? "", params.evidence ?? "")); break; }

  case "knot:start": {
    result = await mutateState(ctx.cwd, (s) => handleKnotStart(s, { slice_id: params.slice_id, knot: params.knot ?? "", goals: params.goals ?? [], criteria: params.criteria ?? [] }));
    break;
  }
  case "knot:update": { result = await mutateState(ctx.cwd, (s) => handleKnotUpdate(s, params.slice_id, { goals: params.goals, title: params.title })); break; }
  case "knot:set_plan": { result = await mutateState(ctx.cwd, (s) => handleKnotSetPlan(s, params.slice_id, params.file_path ?? "", (params.plan_status ?? "linked"))); break; }
  case "knot:sign_off": { result = await mutateState(ctx.cwd, (s) => handleKnotSignOff(s, params.slice_id ?? "", params.message ?? "", params.evidence ?? "")); break; }
  case "knot:fast_forward": { result = await mutateState(ctx.cwd, (s) => handleKnotFastForward(s, params.slice_id ?? "", params.knot ?? "", params.notes ?? "")); break; }
  case "knot:complete_fast_forward": { result = await mutateState(ctx.cwd, (s) => handleCompleteFastForward(s, params.slice_id ?? "", params.evidence ?? "")); break; }

  case "verify_criterion": { result = await mutateState(ctx.cwd, (s) => handleVerifyCriterion(s, params.slice_id, (params.target ?? "knot") as Target, params.index ?? -1, params.evidence ?? "")); break; }
  case "annotate": { result = await mutateState(ctx.cwd, (s) => handleAnnotate(s, params.slice_id, (params.target ?? "slice") as Target, params.notes ?? "", params.notes_mode ?? "set")); break; }
  case "resource:add": { result = await mutateState(ctx.cwd, (s) => handleResourceAdd(s, params.slice_id, (params.target ?? "slice") as Target, { type: (params.resource?.type ?? "doc") as ResourceType, ref: params.resource?.ref ?? "", title: params.resource?.title, note: params.resource?.note })); break; }
  case "resource:remove": { result = await mutateState(ctx.cwd, (s) => handleResourceRemove(s, params.slice_id, (params.target ?? "slice") as Target, params.index ?? -1)); break; }

  case "milestone:add": { result = await mutateState(ctx.cwd, (s) => handleMilestoneAdd(s, { name: params.name ?? "", description: params.description ?? "" })); break; }

  default: { const { state } = await loadState(ctx.cwd); result = { text: `Error: unknown action ${params.action}`, state, error: "unknown action" }; break; }
}
```

Also update the `mutateState` mutator type and `loadState` to thread `runtime.strands` (the `runtime` object already flows through `mutateState`; just ensure its type includes `strands`). Update the tool `description` to:

```ts
description: "Persistent, project-scoped FRS tracking. Slices follow a named strand of durable knots; query and mutate slices, knots, success criteria, plans, resources, and milestones.",
```

- [ ] **Step 3: Run the full suite.**

Run: `npm test`
Expected: core + migrate tests PASS; wrapper compiles. (The wrapper has no direct unit tests; compilation under jiti is exercised by the package/integration tests in Phase 12.)

- [ ] **Step 4: Commit.**

```bash
git add extensions/project-tracker.ts
git commit -m "feat(tracker): tightened action surface wired to persistent model"
```

---

## Phase 9 — Wrapper: context builder, widget, advance commands

### Task 13: `buildProjectStrandContext`, widget, and sign-off commands

**Files:**
- Modify: `extensions/project-tracker.ts` (lines 180–285 widget/context; 478–609 advance + fast_forward commands)

- [ ] **Step 1: Replace `renderProjectWidgetText`** (lines 180–187) to read the new shape:

```ts
function renderProjectWidgetText(state: ProjectState): string {
  const active = state.slices.filter((s) => s.status === "active").slice(0, 3);
  if (active.length === 0) return `${state.project.name}: no active slices`;
  const summary = active.map((s) => `${s.id}[${s.strand.current_knot ?? "-"}]`).join(" · ");
  return `${state.project.name}: ${summary}`;
}
```

- [ ] **Step 2: Replace `buildProjectStrandContext`** (lines 237–285) so it resolves per-slice strands and the new fast-forward shape:

```ts
export async function buildProjectStrandContext(cwd: string): Promise<{ text: string; activeSliceId?: string } | undefined> {
  const { state, runtime } = await loadState(cwd);
  if (!(await exists(runtime.statePath)) && !(await exists(runtime.configPath))) return undefined;

  const active = state.slices.filter((s) => s.status === "active");
  const activeSliceId = active[0]?.id;
  const summary = active.length > 0
    ? active.map((s) => {
        const knot = s.strand.knots.find((k) => k.name === s.strand.current_knot);
        const prog = knot ? `${knot.success_criteria.filter((c) => c.met).length}/${knot.success_criteria.length}` : "0/0";
        return `${s.id} (${s.strand.name}) → ${s.strand.current_knot ?? "no knot"} (${prog} criteria)`;
      }).join(" · ")
    : "none";

  const parts: string[] = [[
    `[pi-project-strand] ${state.project.name}`,
    `Active: ${summary}`,
    `Next up: ${computeNext(state)}`,
  ].join("\n")];

  for (const slice of active.filter((s) => s.strand.pending_fast_forward)) {
    const pff = slice.strand.pending_fast_forward!;
    const fromName = slice.strand.current_knot ?? slice.strand.knots.find((k) => k.status === "pending")?.name ?? "?";
    const targetIndex = slice.strand.knots.findIndex((k) => k.name === pff.target_knot);
    const fromIndex = slice.strand.knots.findIndex((k) => k.name === fromName);
    const squashed = slice.strand.knots.slice(Math.max(fromIndex, 0), targetIndex);
    const focusLines = squashed.map((k) => `  - ${k.name}: ${k.focus}`).join("\n");
    parts.push([
      `⚡ FAST-FORWARD PENDING — ${slice.id}`,
      `Target: ${pff.target_knot}  |  Squashing: ${squashed.map((k) => k.name).join(", ")}`,
      `User instructions: "${pff.user_instructions}"`,
      ``,
      `Squashed knot focus areas:`,
      focusLines,
      ``,
      `REQUIRED BEFORE ACTING:`,
      `1. Load /skill:frs-strategy for the quality bars of each squashed knot.`,
      `2. Synthesize one action plan covering every squashed knot's focus + quality bars + the user instructions.`,
      `3. Present the plan for approval — do NOT start before approval.`,
      `4. Execute, then call project_tracker action=knot:complete_fast_forward slice_id=${slice.id} evidence=<summary>.`,
    ].join("\n"));
  }

  return { text: parts.join("\n\n"), activeSliceId };
}
```

- [ ] **Step 3: Update the `/project:knot:advance` command** (lines 478–514) to call `knot:sign_off` via core. Replace its `mutateState` call:

```ts
// inside the handler, after the unverified-criteria guard (use new shape):
if (!slice.strand.current_knot) { ctx.ui.notify(`Slice ${sliceId} has no active knot`, "warning"); return; }
const activeKnot = slice.strand.knots.find((k) => k.name === slice.strand.current_knot)!;
if (activeKnot.success_criteria.some((c) => !c.met)) { ctx.ui.notify(`Slice ${sliceId} still has unmet criteria`, "warning"); return; }
const evidence = await promptForEvidence(ctx, sliceId, activeKnot.name);
if (!evidence) { ctx.ui.notify("Knot advancement cancelled", "info"); return; }
const result = await mutateState(ctx.cwd, (fresh) => handleKnotSignOff(fresh, sliceId, `Signed off via /project:knot:advance`, evidence));
```

- [ ] **Step 4: Add a `/project:slice:advance` command** (final slice sign-off) right after `/project:knot:advance`:

```ts
pi.registerCommand("project:slice:advance", {
  description: "User sign-off: finalize a slice once all its knots are signed off",
  handler: async (args, ctx) => {
    const sliceId = args.trim();
    if (!sliceId) { ctx.ui.notify("Usage: /project:slice:advance <slice-id>", "warning"); return; }
    const evidence = await (ctx.hasUI ? ctx.ui.editor(`Final validation evidence for ${sliceId}`, "Slice-level validation summary:\n") : Promise.resolve(undefined));
    if (!evidence) { ctx.ui.notify("Slice sign-off cancelled", "info"); return; }
    const result = await mutateState(ctx.cwd, (fresh) => handleSliceSignOff(fresh, sliceId, "Signed off via /project:slice:advance", evidence));
    await updateWidget(ctx);
    await showText(ctx, "Slice sign-off", result.text);
  },
});
```

- [ ] **Step 5: Update the `/project:knot:fast_forward` command** (lines 516–609) to use the new shape — replace `runtime.knots` with the slice's strand knots and call `handleKnotFastForward`:

```ts
// replace currentIndex/availableTargets computation:
const knotNames = slice.strand.knots.map((k) => k.name);
const fromName = slice.strand.current_knot ?? slice.strand.knots.find((k) => k.status === "pending")?.name;
const fromIndex = fromName ? knotNames.indexOf(fromName) : -1;
if (fromIndex === -1 || fromIndex >= knotNames.length - 1) { ctx.ui.notify(`Slice ${sliceId} cannot fast-forward (no later knot)`, "warning"); return; }
const availableTargets = knotNames.slice(fromIndex + 1);
const focusMap = Object.fromEntries(slice.strand.knots.map((k) => [k.name, k.focus]));
// ... build the same editor template using availableTargets/focusMap ...
// then validate targetKnot ∈ availableTargets, parse instructions, and:
const result = await mutateState(ctx.cwd, (fresh) => handleKnotFastForward(fresh, sliceId, targetKnot, instructions));
```

Also update `slice.pending_fast_forward` checks in this command to `slice.strand.pending_fast_forward`.

- [ ] **Step 6: Run the suite + sanity-check load.**

Run: `npm test`
Expected: PASS. Then `npx jiti -e "import('./extensions/project-tracker.ts').then(()=>console.log('loads ok'))"` (or load the extension in a scratch pi session) to confirm no import/runtime errors.
Expected: "loads ok".

- [ ] **Step 7: Commit.**

```bash
git add extensions/project-tracker.ts
git commit -m "feat(tracker): context builder, widget, and knot/slice sign-off commands for new model"
```

---

## Phase 10 — Deliverable B: `/project:new:slice` (and remove brainstorm)

### Task 14: Replace `brainstorm` with `new:slice` in project-commands

**Files:**
- Modify: `extensions/project-commands.ts`
- Test: `tests/extension/project-commands.test.ts`

- [ ] **Step 1: Write the failing test.** Open `tests/extension/project-commands.test.ts`, find the `buildProjectCommandMessage` tests, and replace any `brainstorm` assertions with `new:slice`. Add:

```ts
test("new:slice message drives the funnel and ends by creating a defined slice", () => {
  const msg = buildProjectCommandMessage("new:slice", "DNS caching", undefined);
  expect(msg).toContain('name="/project:new:slice"');
  expect(msg).toContain("/skill:brainstorming");
  expect(msg).toContain("ask_user_question");
  expect(msg).toContain("strand");
  expect(msg).toContain("slice:create");
  expect(msg).toContain("defined");
});

test("brainstorm is no longer a supported command type", () => {
  // @ts-expect-error brainstorm removed from ProjectCommand union
  expect(() => buildProjectCommandMessage("brainstorm", "", undefined)).not.toThrow();
});
```

(The `@ts-expect-error` line documents the type removal; the runtime fallback returns the generic `change` template, which is acceptable — remove that second test if you prefer a hard removal.)

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-commands.test.ts`
Expected: FAIL — `new:slice` not handled; `brainstorm` assertions removed.

- [ ] **Step 3: Implement.** In `extensions/project-commands.ts`:

3a. Change the type (line 7):
```ts
type ProjectCommand = "onboard" | "new:slice" | "build" | "change";
```

3b. In `buildProjectCommandMessage`, replace the `if (command === "brainstorm")` block with:
```ts
if (command === "new:slice") {
  return `${header}

Run the pi-project-strand new-slice funnel: an interactive, LLM-driven workflow that turns a feature request into a fully-specified, tracked slice.

Requirements:
1. Load /skill:brainstorming and follow it. Surface PROJECT.md Planned Features / Capabilities, project_tracker status, and relevant project_knowledge (decisions, constraints, rejected approaches) BEFORE asking design questions.
2. Ask focused questions one at a time to establish purpose, scope, constraints, and complexity. Research (web/local) where it changes the decision; persist findings as project_knowledge entries and attach them as slice resources.
3. Converge with the user on the slice GOAL and slice-level SUCCESS CRITERIA ("what done means").
4. Strand selection: call ask_user_question with one single-select question. Offer each strand defined in .pi/project.jsonc (or the built-in quick/granular) as an option — each option's description states when to use it (pros/cons), and its preview shows the knot sequence with focus. Assess complexity and mark your recommended strand first with "(Recommended)".
5. Create the slice: project_tracker action=slice:create with id, name, description, type, the chosen strand name, goal, and criteria (the slice-level success criteria). The slice is created status=defined with the full knot sequence pending.
6. Do NOT start a knot here. End with a summary (goal, success criteria, chosen strand + why) and tell the user to run /project:build to activate the slice and start its first knot.

Do not dump all questions at once. Do not ask the user to implement anything. Respect the design-approval gate before any implementation work.`;
}
```

3c. Remove the `pi.registerCommand("project:brainstorm", ...)` block and add:
```ts
pi.registerCommand("project:new:slice", {
  description: "Interactive funnel: turn a feature request into a fully-specified, tracked slice with a chosen strand",
  handler: async (args, ctx) => {
    const audit = await auditProject(ctx.cwd);
    sendProjectCommand(pi, ctx, buildProjectCommandMessage("new:slice", args, audit));
  },
});
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-commands.ts tests/extension/project-commands.test.ts
git commit -m "feat(commands): replace /project:brainstorm with /project:new:slice funnel"
```

### Task 15: Update `build`/`onboard`/`change` templates for the new model

**Files:**
- Modify: `extensions/project-commands.ts`

- [ ] **Step 1: Update the `build` template** routing to the new fields/commands. Replace the routing bullets in the `build` branch with:
```
3. Route based on state:
   - Active slice with an active knot + linked plan: resume with /skill:executing-plans or /skill:subagent-driven-development.
   - Active slice with an active knot but no plan: use /skill:writing-plans first.
   - Active slice, no active knot, pending knots remain: use /skill:frs-strategy to knot:start the next pending knot (define its goals + success_criteria).
   - Active slice, all knots signed off: prompt the user for final /project:slice:advance sign-off.
   - Defined slice: ask the user to activate it (slice:activate), or run /project:new:slice for a new feature.
   - No project files/tracker state: run /project:onboard first.
```

- [ ] **Step 2: Update `onboard` and `change` templates**: replace any "slices/knots" wording that implies the old single global sequence with strand-aware wording (a slice carries its own strand; knots are persistent records; brainstorm is now /project:new:slice). Specifically in `onboard` step 7 and `change` steps 1/4, mention `/project:new:slice` instead of `/project:brainstorm`.

- [ ] **Step 3: Run the suite.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add extensions/project-commands.ts
git commit -m "docs(commands): align build/onboard/change workflows with strand model"
```

---

## Phase 11 — Skills & instructions audit

### Task 16: Update `superpowers-bootstrap.ts`

**Files:**
- Modify: `extensions/superpowers-bootstrap.ts` (lines 26–60)
- Test: `tests/extension/superpowers-bootstrap.test.ts`

- [ ] **Step 1: Update the test** to assert the new strand-aware text. Replace assertions that check for the fixed 7-knot table (e.g. expecting "PoW", "Release" in a `| Knot |` table) with:

```ts
test("bootstrap explains configurable strands and persistent knots", () => {
  const text = buildProjectStrandBootstrap();
  expect(text).toContain("strand");
  expect(text).toContain("Strands are named knot sequences");
  expect(text).toContain("/project:new:slice");
  expect(text).not.toContain("/project:brainstorm");
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Replace the FRS section (lines 26–43) of `buildProjectStrandBootstrap` with:

```
### FRS (Feature Realization Strand) — Development Methodology
Every feature is a **slice** that advances through an ordered **strand** of **knots** (quality stages). **Never skip a knot without explicit user approval** (use /project:knot:fast_forward).

Strands are named knot sequences defined per project in \`.pi/project.jsonc\` and snapshotted onto each slice at creation. Built-in defaults:
- **quick** — Prototype → Realization → Finalization (small, scoped work).
- **granular** — Proof-of-Work → Alpha → Beta → Gamma → RC1 → RC2 → Release (complex/large work).

Each knot is a **persistent record**: it carries its own goals, success criteria (individually verified with evidence), an optional linked plan, resources, and a sign-off summary. Nothing is erased when a knot completes.

**MVFoS (Minimum Viable Feature or Slice):** the smallest real, observable, testable unit of work. No stubs or placeholders.

**Starting new work:** run \`/project:new:slice <request>\` — an interactive funnel that captures the goal + success criteria, picks a strand, and creates the slice. Load \`/skill:frs-strategy\` for quality bars per knot.
```

Then update the "Skill Routing" bullet (line 65) from `/skill:brainstorming` entry to reference `/project:new:slice` for new feature work, and update the `project_tracker` usage bullets (lines 58–62) to:

```
**\`project_tracker\` tool — FRS slice/strand/knot state:**
- Check the active slice, its strand, and the active knot before starting work.
- Define each knot's goals + success_criteria at knot:start; verify_criterion with evidence as work progresses.
- Request knot sign-off (/project:knot:advance) before the next knot; finalize with /project:slice:advance.
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/superpowers-bootstrap.ts tests/extension/superpowers-bootstrap.test.ts
git commit -m "docs(bootstrap): strand-aware FRS methodology and routing"
```

### Task 17: Update `skills/frs-strategy/SKILL.md`

**Files:**
- Modify: `skills/frs-strategy/SKILL.md`

- [ ] **Step 1: Read the skill.** Run: `cat skills/frs-strategy/SKILL.md` and locate the fixed-knot table and any "criteria" language.

- [ ] **Step 2: Edit the body** (NOT the `description` frontmatter — keep that as triggering conditions only, per AGENTS.md) to:
  - Explain strands are configurable named sequences (templates in `project.jsonc`), snapshotted per slice; document the `quick` and `granular` defaults.
  - Reframe knots as persistent records that accumulate goals, individually-verified success criteria (with evidence), plans, resources, and a sign-off summary.
  - Distinguish slice-level `goal` + `success_criteria` from per-knot `goals` + `success_criteria`.
  - Reference `/project:new:slice` (creation), `/project:knot:advance` (knot sign-off), `/project:slice:advance` (slice sign-off), and `/project:knot:fast_forward`.
  - Keep the per-knot quality-bar guidance, but present it as guidance applicable to whichever strand's knots are in play, with the `granular` knots as the worked example. The EdgeOS deployment section may stay (per AGENTS.md).

- [ ] **Step 3: Validate skills.**

Run: `npm test -- tests/skills`
Expected: PASS (skill-validation checks SKILL.md format + referenced files exist; ensure any links you add resolve).

- [ ] **Step 4: Commit.**

```bash
git add skills/frs-strategy/SKILL.md
git commit -m "docs(frs-strategy): document configurable strands and persistent knots"
```

---

## Phase 12 — Changelog, manifest, final gate

### Task 18: CHANGELOG + manifest check + full verification

**Files:**
- Modify: `CHANGELOG.md`
- Verify: `package.json`

- [ ] **Step 1: Add a CHANGELOG entry** under `## [Unreleased]` (conventional-commit-style bullets) describing: persistent strand/knot state model; named strands with `quick`/`granular` defaults (replaces the flat `knots` config — **breaking** config change); tightened `project_tracker` action surface (`target` discriminator; `knot:sign_off`/`slice:sign_off`; `verify_criterion`/`annotate`/`resource:*`); `/project:new:slice` replacing `/project:brainstorm`; `/project:slice:advance`; one-shot legacy migration. Put the breaking config change under a `### Changed` / "BREAKING" note.

- [ ] **Step 2: Verify the manifest.** Confirm `package.json` `pi.extensions` still lists the existing files (no new extension module was added — `project-tracker-migrate.ts` is imported only by the throwaway script and the test, not registered). Confirm `files` does not need `scripts/` (throwaway). No change expected; if you registered anything new, add it here.

Run: `npm test -- tests/package`
Expected: PASS (package-metadata parity).

- [ ] **Step 3: Full gate.**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 4: Integration smoke (optional but recommended).**

Run: `npm run test:integration`
Expected: the bash workflow completes without error (update the script if it references removed actions/commands like `/project:brainstorm` or the old `knot:verify_criterion` signature).

- [ ] **Step 5: Commit.**

```bash
git add CHANGELOG.md package.json tests/integration/pi-superpowers-workflow.sh
git commit -m "chore(release): changelog + manifest for strand redesign"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §3 data model → Tasks 1–2 (types, seed/defaults).
- §3.5 statuses/lifecycle/fast-forward → Tasks 4–7.
- §4 action surface (20 actions, `target` discriminator, in-band errors) → Tasks 11–12.
- §5 computeNext/progress → Task 9.
- §6 strand seeding → Tasks 2, 11.
- §7 `/project:new:slice` + brainstorm removal → Task 14 (+ build/onboard/change in 15).
- §8 `/project:new:strand` → **intentionally deferred** (C, not in this plan).
- §9 migration (Pass-1 mechanical + throwaway runner; Pass-2 is interactive, executed by the agent following design §9) → Task 10.
- §10 skills/instructions audit → Tasks 13 (context/commands), 15, 16, 17.
- §11 testing → tests in every phase + Task 18 gate.

**Known gaps surfaced (not silently dropped):**
- **Pass-2 backfill is not code** — it is an interactive agent procedure (design §9). After running Task 10's Pass-1 script on `/mnt/Projects`, perform the per-slice backfill conversation, asking the user whenever a goal/criterion can't be confidently reconstructed.
- The wrapper (`project-tracker.ts`) has no direct unit tests today; this plan keeps that convention and relies on compilation + package/integration tests. If you want wrapper coverage, add a `loadProjectConfig` strand-merge test as a bonus task.
- `tests/integration/pi-superpowers-workflow.sh` may reference removed actions/commands; Task 18 Step 4 flags updating it.

**Type consistency:** handler names and signatures used in wrapper Tasks 11–13 match those defined in core Tasks 2–9 (`handleSliceSignOff`, `handleKnotSignOff`, `handleKnotFastForward`, `handleCompleteFastForward`, `handleVerifyCriterion(state, sliceId, target, index, evidence)`, `handleAnnotate(... target ...)`, `handleResourceAdd/Remove(... target ...)`). `Target` type is exported from core and imported by the wrapper.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows real assertions and the exact `vitest`/`npm` command with expected result.
