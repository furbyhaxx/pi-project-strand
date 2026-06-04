# Advancement Policy (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-knot `advance_by` authorization (`human`/`agent`/`judge`) with any-of + always-available human override, a deterministic agent two-phase "armed confirmation" sign-off, and an expanded set of five generic default strands carrying a "human-at-the-bookends" posture.

**Architecture:** Pure logic stays in `extensions/project-tracker-core.ts`; the thin wrapper `extensions/project-tracker.ts` injects `now` + the configurable window and routes the agent `knot:sign_off` tool action to the two-phase handler while `/project:knot:advance` keeps calling the unconditional primitive. `advance_by` is snapshotted onto each knot at slice creation (same pattern as the rest of the strand model). Judge config is parsed/stored but not enforced (Phase B).

**Tech Stack:** TypeScript (jiti, no build), TypeBox + `StringEnum`, `jsonc-parser`, Vitest. Gate: `npm test`.

**Spec:** `docs/plans/2026-06-03-knot-advancement-policy-design.md` (read it first).

**Conventions (AGENTS.md):** core/wrapper split (no pi imports / no I/O in `*-core.ts`; `jsonc-parser` is allowed); `StringEnum` not `Type.Union`; throw-or-in-band errors; `npm test` green before every commit; conventional commits; CHANGELOG updated; no build artifacts.

**Out of scope (Phase B):** the `judge` sub-session. This plan parses/stores `judge` config and accepts `judge` in `advance_by` (human-override-only until B) but implements no judge runtime.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `extensions/project-tracker-core.ts` | New types (`AdvanceActor`, `JudgeConfig`, `SignoffArm`); `advance_by`/`judge`/`signoff_arm` on `Knot`; expanded `DEFAULT_STRANDS`; `seedStrand`/`normalizeState` updates; `signOffActiveKnotInPlace` + `handleAgentSignOff` | **Modify** |
| `extensions/project-tracker.ts` | Read `agent_signoff_window_seconds`; route `knot:sign_off` → `handleAgentSignOff(... now, window)`; advance_by line in context builder | **Modify** |
| `extensions/strand-authoring-core.ts` | Validate `advance_by` enum; carry `advance_by` into the JSONC insert | **Modify** |
| `extensions/project-strand.ts` | `define` knots accept optional `advance_by` | **Modify** |
| `extensions/superpowers-bootstrap.ts` | Short advance_by + two-phase paragraph | **Modify** |
| `skills/frs-strategy/SKILL.md` | advance_by section (body only) | **Modify** |
| `references/extended-project.json` | Stray truncated terminal paste | **Delete** |
| `tests/extension/project-tracker.test.ts` | advance_by snapshot/normalize, two-phase, default-strands shape | **Modify** |
| `tests/extension/strand-authoring-core.test.ts` | advance_by validation | **Modify** |
| `tests/extension/superpowers-bootstrap.test.ts` | advance_by text assertion | **Modify** |
| `CHANGELOG.md`, `package.json` | Changelog + minor bump (0.4.0 → 0.5.0) | **Modify** |

**Phase ordering:** 1 (types) → 2 (defaults + seed/normalize) → 3 (two-phase sign-off) → 4 (wrapper wiring) → 5 (strand authoring) → 6 (bootstrap/skill) → 7 (cleanup + changelog + gate). Tasks 1–4 are the inline spine; 5–6 are independent leaves (subagents); 7 finalizes.

---

## Phase 1 — Core types

### Task 1: Add advancement types and config fields

**Files:** Modify `extensions/project-tracker-core.ts`

- [ ] **Step 1: Add the new types.** After the existing `export type ResourceType = ...` / `export type Target = ...` lines, add:

```ts
export type AdvanceActor = "human" | "agent" | "judge";

export interface JudgeConfig {
  model: string; // "provider/model:thinking"; enforced in Phase B
}

export interface SignoffArm {
  armed_at: string; // ISO; set in agent two-phase phase-1, cleared on advance/expiry
}
```

- [ ] **Step 2: Extend `Knot`.** Add three fields to the `Knot` interface:

```ts
  advance_by: AdvanceActor[];
  judge: JudgeConfig | null;
  signoff_arm: SignoffArm | null;
```

- [ ] **Step 3: Extend templates + config.** Update these interfaces:

```ts
export interface StrandKnotTemplate {
  name: string;
  focus: string;
  title?: string;
  advance_by?: AdvanceActor[];   // default ["human"]
  judge?: JudgeConfig;           // Phase B; per-knot override
}

export interface StrandTemplate {
  description: string;
  knots: StrandKnotTemplate[];
  judge?: JudgeConfig;           // Phase B; strand default
}

export interface ProjectConfig {
  project?: { name?: string; description?: string };
  strands?: Record<string, StrandTemplate>;
  judge?: JudgeConfig;                     // Phase B; project default
  agent_signoff_window_seconds?: number;   // default 300
}
```

- [ ] **Step 4: Confirm the suite still loads** (no behavior yet; existing tests may fail only where `DEFAULT_STRANDS` keys are asserted — fixed in Task 2).

Run: `npx vitest run tests/extension/project-tracker.test.ts -t seeding`
Expected: the "seedStrand" test passes; the "ships quick and granular" test FAILS (expected — Task 2 updates it).

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts
git commit -m "feat(tracker): advancement-policy types (AdvanceActor, JudgeConfig, SignoffArm)"
```

---

## Phase 2 — Default strands + seeding/normalization

### Task 2: Expanded `DEFAULT_STRANDS` with advance_by

**Files:** Modify `extensions/project-tracker-core.ts`, `tests/extension/project-tracker.test.ts`

- [ ] **Step 1: Update the failing test first.** In `tests/extension/project-tracker.test.ts`, replace the "DEFAULT_STRANDS ships quick and granular" test with:

```ts
  test("DEFAULT_STRANDS ships the five generic strands with bookend advance_by", () => {
    expect(Object.keys(DEFAULT_STRANDS).sort()).toEqual(["change", "deep-research", "granular", "quick", "spike"]);
    expect(quick.knots.map((k) => k.name)).toEqual(["Prototype", "Realization", "Finalization"]);
    expect(DEFAULT_STRANDS.granular.knots).toHaveLength(7);
    // bookend posture
    expect(quick.knots.map((k) => k.advance_by)).toEqual([["human"], ["agent"], ["human"]]);
    expect(DEFAULT_STRANDS["deep-research"].knots.every((k) => k.advance_by?.[0] === "agent")).toBe(true);
    expect(DEFAULT_STRANDS.spike.knots.map((k) => k.advance_by![0])).toEqual(["agent", "agent", "human"]);
    expect(DEFAULT_STRANDS.granular.knots.map((k) => k.advance_by![0])).toEqual(["human", "agent", "agent", "agent", "agent", "human", "human"]);
  });
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "five generic strands"`
Expected: FAIL — `DEFAULT_STRANDS` still has 2 keys.

- [ ] **Step 3: Replace `DEFAULT_STRANDS`.** Replace the entire `export const DEFAULT_STRANDS = {...}` block with:

```ts
export const DEFAULT_STRANDS: Record<string, StrandTemplate> = {
  spike: {
    description: "Throwaway experiments to explore and decide on a direction before committing to real implementation.",
    knots: [
      { name: "Setup", focus: "Frame the question/hypothesis, define what a useful answer looks like, and prepare a disposable experiment environment.", advance_by: ["agent"] },
      { name: "Experiment", focus: "Run the fastest experiments that produce real signal; optimize for learning, not production quality.", advance_by: ["agent"] },
      { name: "Decision", focus: "Capture findings and make a clear recommendation; record what to keep, discard, or follow up with a real slice.", advance_by: ["human"] },
    ],
  },
  quick: {
    description: "Small, well-scoped slices that need a compact path from proof to implementation.",
    knots: [
      { name: "Prototype", focus: "Establish a minimal, observable proof of the slice direction and de-risk the core approach.", advance_by: ["human"] },
      { name: "Realization", focus: "Implement the slice completely enough to satisfy its success criteria with real behavior and tests.", advance_by: ["agent"] },
      { name: "Finalization", focus: "Verify, document, clean up, and prepare the slice for sign-off.", advance_by: ["human"] },
    ],
  },
  "deep-research": {
    description: "Substantial research slices where a broad question must be scoped, sourced, analyzed, and synthesized into a cited answer.",
    knots: [
      { name: "Preparation", focus: "Broad source scouting and scope shaping: collect high-value sources, record decision points, and frame the research question.", advance_by: ["agent"] },
      { name: "DeepResearch", focus: "Targeted deep analysis of the selected sources: extract evidence, compare claims, and probe for gaps and contradictions.", advance_by: ["agent"] },
      { name: "Synthesis", focus: "Aggregate research outputs into the relevant findings: reconcile conflicts, separate signal from noise, and structure conclusions.", advance_by: ["agent"] },
      { name: "Finalization", focus: "Produce the final answer/report package with citations, reproducibility notes, and a confidence assessment.", advance_by: ["agent"] },
    ],
  },
  change: {
    description: "A scoped change to something that already exists: a targeted edit to existing components, patches, or configuration.",
    knots: [
      { name: "Scope", focus: "Pin down exactly what changes, why, the blast radius, and how the change will be verified.", advance_by: ["human"] },
      { name: "Patch", focus: "Make the focused change with minimal collateral impact and clear, reviewable diffs.", advance_by: ["agent"] },
      { name: "Verify", focus: "Confirm the change works and nothing relevant regressed, with evidence appropriate to the change.", advance_by: ["human"] },
    ],
  },
  granular: {
    description: "Complex or high-risk slices that benefit from multiple quality gates before release.",
    knots: [
      { name: "Proof-of-Work", focus: "Demonstrate feasibility, identify constraints, and prove the core work can be done.", advance_by: ["human"] },
      { name: "Alpha", focus: "Build the first functional implementation covering the main path with known gaps explicitly noted.", advance_by: ["agent"] },
      { name: "Beta", focus: "Harden behavior, cover important edge cases, and validate against realistic usage.", advance_by: ["agent"] },
      { name: "Gamma", focus: "Stabilize the slice, resolve remaining major issues, and prepare release-candidate quality.", advance_by: ["agent"] },
      { name: "RC1", focus: "Run release-candidate validation, catch regressions, and verify readiness against success criteria.", advance_by: ["agent"] },
      { name: "RC2", focus: "Perform final regression checks and polish after RC1 fixes, with no known critical blockers.", advance_by: ["human"] },
      { name: "Release", focus: "Finalize documentation, evidence, cleanup, and sign-off for production-ready completion.", advance_by: ["human"] },
    ],
  },
};
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "five generic strands"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker.test.ts
git commit -m "feat(tracker): expand DEFAULT_STRANDS to five generic strands with bookend advance_by"
```

### Task 3: `seedStrand` + `normalizeState` carry advance_by/judge/signoff_arm

**Files:** Modify `extensions/project-tracker-core.ts`, `tests/extension/project-tracker.test.ts`

- [ ] **Step 1: Write the failing test.** Append to the "seeding" describe block:

```ts
  test("seedStrand copies advance_by (default human) + judge + null signoff_arm", () => {
    const s = seedStrand("quick", quick);
    expect(s.knots.map((k) => k.advance_by)).toEqual([["human"], ["agent"], ["human"]]);
    expect(s.knots.every((k) => k.signoff_arm === null && k.judge === null)).toBe(true);

    const noAdvance = seedStrand("x", { description: "d", knots: [{ name: "K", focus: "f" }] });
    expect(noAdvance.knots[0]!.advance_by).toEqual(["human"]); // default
  });

  test("normalizeState backfills advance_by/signoff_arm on legacy-shaped knots", () => {
    const base = withSlice();
    // simulate a v0.4.0 knot lacking the new fields
    delete (base.slices[0]!.strand.knots[0] as any).advance_by;
    delete (base.slices[0]!.strand.knots[0] as any).signoff_arm;
    const norm = normalizeState(base, { project: { name: "EdgeOS" } }, "fallback");
    expect(norm.slices[0]!.strand.knots[0]!.advance_by).toEqual(["human"]);
    expect(norm.slices[0]!.strand.knots[0]!.signoff_arm).toBeNull();
  });
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "seedStrand copies"`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `seedStrand`, set each seeded knot's new fields:

```ts
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
      advance_by: k.advance_by && k.advance_by.length > 0 ? [...k.advance_by] : ["human"],
      judge: k.judge ?? null,
      signoff_arm: null,
    })),
```

Add a `normalizeKnot` helper and call it from `normalizeState`. Define near the other helpers:

```ts
function normalizeKnot(k: Knot): Knot {
  return {
    ...k,
    advance_by: Array.isArray(k.advance_by) && k.advance_by.length > 0 ? k.advance_by : ["human"],
    judge: k.judge ?? null,
    signoff_arm: k.signoff_arm ?? null,
    resources: k.resources ?? [],
    goals: k.goals ?? [],
    success_criteria: k.success_criteria ?? [],
  };
}
```

In `normalizeState`, map slices to normalize their knots:

```ts
    slices: [...(base.slices ?? [])]
      .map((s) => (s.strand ? { ...s, strand: { ...s.strand, knots: (s.strand.knots ?? []).map(normalizeKnot) } } : s))
      .sort(compareSlices),
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "seedStrand copies" && npx vitest run tests/extension/project-tracker.test.ts -t "normalizeState backfills"`
Expected: PASS both.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker.test.ts
git commit -m "feat(tracker): seed + normalize advance_by/judge/signoff_arm"
```

---

## Phase 3 — Agent two-phase armed sign-off

### Task 4: `signOffActiveKnotInPlace` refactor + `handleAgentSignOff`

**Files:** Modify `extensions/project-tracker-core.ts`, `tests/extension/project-tracker.test.ts`

- [ ] **Step 1: Write the failing tests.** Add a new describe block:

```ts
describe("agent two-phase sign-off", () => {
  const WINDOW = 300;
  function armed(state: any, knot: string) {
    let s = handleSliceActivate(state, "dns-cache").state;
    s = handleKnotStart(s, { slice_id: "dns-cache", knot, goals: [], criteria: ["c1", "c2"] }).state;
    return s;
  }
  const t0 = "2026-06-04T00:00:00.000Z";
  const t1 = "2026-06-04T00:02:00.000Z";   // +120s (within 300)
  const tLate = "2026-06-04T00:10:00.000Z"; // +600s (expired)

  test("refused when agent not permitted (default human knot)", () => {
    const s = armed(withSlice(), "Prototype"); // quick.Prototype = ["human"]
    const r = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW);
    expect(r.error).toBe("agent advance not permitted");
    expect(r.text).toContain("/project:knot:advance");
  });

  test("first call arms (no advance) and returns the criteria challenge", () => {
    const s = armed(withSlice(), "Realization"); // quick.Realization = ["agent"]
    const r = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW);
    expect(r.error).toBe("armed");
    expect(r.state.slices[0]!.strand.knots[1]!.signoff_arm).toEqual({ armed_at: t0 });
    expect(r.state.slices[0]!.strand.knots[1]!.status).toBe("active"); // not advanced
    expect(r.text).toContain("c1");
  });

  test("second call within window + all met + evidence advances and clears arm", () => {
    let s = armed(withSlice(), "Realization");
    s = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW).state; // arm
    s = handleVerifyCriterion(s, "dns-cache", "knot", 0, "e0").state;
    s = handleVerifyCriterion(s, "dns-cache", "knot", 1, "e1").state;
    const r = handleAgentSignOff(s, "dns-cache", "agent done", "all green", t1, WINDOW);
    expect(r.error).toBeUndefined();
    const knot = r.state.slices[0]!.strand.knots[1]!;
    expect(knot.status).toBe("signed_off");
    expect(knot.validation_evidence_summary).toBe("all green");
    expect(knot.signoff_arm).toBeNull();
    expect(r.state.slices[0]!.strand.current_knot).toBeNull();
  });

  test("confirm with unmet criteria is refused (stays armed)", () => {
    let s = armed(withSlice(), "Realization");
    s = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW).state;
    const r = handleAgentSignOff(s, "dns-cache", "m", "e", t1, WINDOW);
    expect(r.error).toBe("unmet criteria");
    expect(r.state.slices[0]!.strand.knots[1]!.signoff_arm).toEqual({ armed_at: t0 });
  });

  test("second call after window re-arms instead of advancing", () => {
    let s = armed(withSlice(), "Realization");
    s = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW).state;
    s = handleVerifyCriterion(s, "dns-cache", "knot", 0, "e0").state;
    s = handleVerifyCriterion(s, "dns-cache", "knot", 1, "e1").state;
    const r = handleAgentSignOff(s, "dns-cache", "m", "all green", tLate, WINDOW);
    expect(r.error).toBe("armed"); // re-armed, not advanced
    expect(r.state.slices[0]!.strand.knots[1]!.signoff_arm).toEqual({ armed_at: tLate });
    expect(r.state.slices[0]!.strand.knots[1]!.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "agent two-phase"`
Expected: FAIL — `handleAgentSignOff` undefined.

- [ ] **Step 3: Refactor the advance primitive, then add the two-phase handler.** Replace the body of `handleKnotSignOff` to delegate to a shared in-place mutator, and add both `signOffActiveKnotInPlace` and `handleAgentSignOff`:

```ts
/** Sign off the slice's active knot in place. Returns null on success, or an error tuple. */
function signOffActiveKnotInPlace(slice: Slice, message: string, evidence: string): { error: string; text: string } | null {
  const knot = getActiveKnot(slice);
  if (!knot) return { error: "no active knot", text: `Error: slice ${slice.id} has no active knot` };
  const unmet = knot.success_criteria.filter((c) => !c.met);
  if (unmet.length > 0) return { error: "unmet criteria", text: `Error: ${slice.id} → ${knot.name} has unmet criteria: ${unmet.map((c) => c.text).join("; ")}` };
  if (!evidence?.trim()) return { error: "missing evidence", text: "Error: validation evidence is required" };
  knot.status = "signed_off";
  knot.signed_off = true;
  knot.signed_off_message = message?.trim() || null;
  knot.validation_evidence_summary = evidence.trim();
  knot.completed_at = isoNow();
  knot.signoff_arm = null;
  slice.strand.current_knot = null;
  return null;
}

export function handleKnotSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knotName = slice.strand.current_knot;
  const err = signOffActiveKnotInPlace(slice, message, evidence);
  if (err) return { text: err.text, state, error: err.error };
  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Signed off ${slice.id} → ${knotName}. ${tail}`, state: touch(normalizeState(current)) };
}

function elapsedSeconds(fromIso: string, nowIso: string): number {
  return (Date.parse(nowIso) - Date.parse(fromIso)) / 1000;
}

export function handleAgentSignOff(
  state: ProjectState, sliceId: string, message: string, evidence: string, now: string, windowSeconds: number
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };

  if (!knot.advance_by.includes("agent")) {
    return {
      text: `Error: agent self-advance is not permitted for ${slice.id} → ${knot.name} (advance_by=[${knot.advance_by.join(", ")}]). Ask the user to sign off via /project:knot:advance ${slice.id}.`,
      state,
      error: "agent advance not permitted",
    };
  }

  const armedFresh = knot.signoff_arm && elapsedSeconds(knot.signoff_arm.armed_at, now) <= windowSeconds;

  if (!armedFresh) {
    knot.signoff_arm = { armed_at: now };
    const lines = [
      `ARMED ${slice.id} → ${knot.name}. This did NOT advance — it is a deliberate two-step confirmation.`,
      `Goals: ${knot.goals.length ? knot.goals.join("; ") : "(none set)"}`,
      `Success criteria:`,
      ...knot.success_criteria.map((c, i) => `  ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`),
      ``,
      `Verify every criterion with real evidence via verify_criterion. Once all are genuinely met, call knot:sign_off again WITH an evidence summary within ${windowSeconds}s to confirm. After that window this resets.`,
    ];
    return { text: lines.join("\n"), state: touch(normalizeState(current)), error: "armed" };
  }

  // Within window → confirm.
  const err = signOffActiveKnotInPlace(slice, message, evidence);
  if (err) return { text: err.text, state, error: err.error }; // arm preserved (current discarded)
  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Agent-confirmed sign-off ${slice.id} → ${knot.name}. ${tail}`, state: touch(normalizeState(current)) };
}
```

> Note: `error: "armed"` is an in-band signal (not a hard failure) — the wrapper still writes the armed state and surfaces the challenge text. On a refused confirm (`unmet criteria`/`missing evidence`) we return the original `state`, so the existing arm is preserved.

- [ ] **Step 4: Run the full core suite, expect pass.**

Run: `npx vitest run tests/extension/project-tracker.test.ts`
Expected: PASS (all blocks, including the unchanged "sign-off (persistent, lossless)" block which still calls `handleKnotSignOff` directly).

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker.test.ts
git commit -m "feat(tracker): agent two-phase armed sign-off (handleAgentSignOff) + shared advance primitive"
```

---

## Phase 4 — Wrapper wiring

### Task 5: Window config + route `knot:sign_off` + context line

**Files:** Modify `extensions/project-tracker.ts`

- [ ] **Step 1: Import `handleAgentSignOff` and `isoNow`.** Add both to the import block from `./project-tracker-core.js` (alongside `handleKnotSignOff`).

- [ ] **Step 2: Expose the window from config.** In `loadProjectConfig`, after computing `strands`, add to the returned object a resolved window:

```ts
  const signoffWindowSeconds = typeof config.agent_signoff_window_seconds === "number" && config.agent_signoff_window_seconds > 0
    ? config.agent_signoff_window_seconds
    : 300;
```

Add `signoffWindowSeconds` to the merged config's return object (extend the function's return type to include `signoffWindowSeconds: number`).

- [ ] **Step 3: Route the agent path.** Replace the `case "knot:sign_off":` body so the tool (agent) path uses the two-phase handler:

```ts
        case "knot:sign_off": {
          result = await mutateState(ctx.cwd, (s, runtime) =>
            handleAgentSignOff(s, params.slice_id ?? "", params.message ?? "", params.evidence ?? "", isoNow(), runtime.signoffWindowSeconds)
          );
          break;
        }
```

(The `/project:knot:advance` command keeps calling `handleKnotSignOff` directly — the human override — unchanged.)

- [ ] **Step 4: Announce advance_by in per-turn context.** In `buildProjectStrandContext`, where the active-slice summary is built, add an advance_by line per active knot. After the existing `summary` is pushed, append for each active slice with an active knot:

```ts
  for (const slice of active) {
    const knot = slice.strand.knots.find((k) => k.name === slice.strand.current_knot);
    if (!knot) continue;
    const agentOk = knot.advance_by.includes("agent");
    parts.push(
      agentOk
        ? `${slice.id} → ${knot.name}: agent self-advance ALLOWED (advance_by=[${knot.advance_by.join(", ")}]). Protocol: verify all criteria, then knot:sign_off (arms + returns the checklist) → knot:sign_off WITH evidence within the window to confirm.`
        : `${slice.id} → ${knot.name}: agent self-advance NOT allowed (advance_by=[${knot.advance_by.join(", ")}]). Advancement is via ${knot.advance_by.includes("judge") ? "the judge (Phase B) or " : ""}user /project:knot:advance ${slice.id}.`
    );
  }
```

- [ ] **Step 5: Run the suite + load smoke.**

Run: `npm test 2>&1 | tail -4`
Expected: PASS. Then confirm the wrapper loads:
`cd <repo> && printf 'import m from "./extensions/project-tracker.ts"; console.log(typeof m.default)\n' > ./_s.ts && npx jiti ./_s.ts && rm -f ./_s.ts`
Expected: prints `function`.

- [ ] **Step 6: Commit.**

```bash
git add extensions/project-tracker.ts
git commit -m "feat(tracker): route agent knot:sign_off to two-phase handler; advance_by in context"
```

---

## Phase 5 — Strand authoring carries advance_by (subagent-friendly leaf)

### Task 6: `advance_by` in `project_strand` + validation

**Files:** Modify `extensions/strand-authoring-core.ts`, `extensions/project-strand.ts`, `tests/extension/strand-authoring-core.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/extension/strand-authoring-core.test.ts` add:

```ts
import { validateStrandProposal, buildStrandConfigText } from "../../extensions/strand-authoring-core.js";
import { parse } from "jsonc-parser";

test("validateStrandProposal rejects bad advance_by values", () => {
  const err = validateStrandProposal("s", [{ name: "K", focus: "f", advance_by: ["robot" as any] }], []);
  expect(err).toMatch(/advance_by/);
});

test("buildStrandConfigText includes advance_by when present", () => {
  const out = buildStrandConfigText("{}", "s", "d", [{ name: "K", focus: "f", advance_by: ["agent"] }]);
  expect(parse(out).strands.s.knots[0].advance_by).toEqual(["agent"]);
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/strand-authoring-core.test.ts -t advance_by`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `strand-authoring-core.ts`:

Extend `StrandKnotInput`:
```ts
export interface StrandKnotInput { name: string; focus: string; advance_by?: string[]; }
const ADVANCE_ACTORS = ["human", "agent", "judge"];
```

In `validateStrandProposal`, after the focus check, add:
```ts
  for (const k of knots) {
    if (k.advance_by && k.advance_by.some((a) => !ADVANCE_ACTORS.includes(a))) {
      return `knot "${k.name}" has invalid advance_by; allowed: ${ADVANCE_ACTORS.join(", ")}`;
    }
  }
```

In `buildStrandConfigText`, include `advance_by` in the emitted knot object when present:
```ts
    knots: knots.map((k) => (k.advance_by && k.advance_by.length > 0
      ? { name: k.name.trim(), focus: k.focus.trim(), advance_by: k.advance_by }
      : { name: k.name.trim(), focus: k.focus.trim() })),
```

In `extensions/project-strand.ts`, extend the `knots` item schema in `ProjectStrandParams` with an optional `advance_by`:
```ts
      advance_by: Type.Optional(Type.Array(StringEnum(["human", "agent", "judge"] as const), { description: "Who may advance this knot (default human)" })),
```
and pass `advance_by: k.advance_by` through when constructing the `knots` array handed to `buildStrandConfigText` (the validate call already receives the knots array).

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/strand-authoring-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/strand-authoring-core.ts extensions/project-strand.ts tests/extension/strand-authoring-core.test.ts
git commit -m "feat(strand): project_strand define accepts per-knot advance_by"
```

---

## Phase 6 — Bootstrap + skill text (subagent-friendly leaf)

### Task 7: Document advance_by in bootstrap + frs-strategy

**Files:** Modify `extensions/superpowers-bootstrap.ts`, `tests/extension/superpowers-bootstrap.test.ts`, `skills/frs-strategy/SKILL.md`

- [ ] **Step 1: Update the bootstrap test.** Add to `tests/extension/superpowers-bootstrap.test.ts`:

```ts
test("bootstrap documents advance_by and the agent two-phase protocol", () => {
  const text = buildProjectStrandBootstrap();
  expect(text).toContain("advance_by");
  expect(text).toContain("two-step");
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts -t advance_by`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `buildProjectStrandBootstrap()` add a short block to the FRS section:

```
**Advancement policy (advance_by):** each knot declares who may advance it — `human`, `agent`, and/or `judge`. You (the user) can always advance via `/project:knot:advance` as an override. When a knot's `advance_by` includes `agent`, the agent may self-advance via a deliberate **two-step** confirmation: the first `knot:sign_off` arms and returns the criteria checklist (it does NOT advance); after verifying every criterion with evidence, a second `knot:sign_off` WITH an evidence summary within the freshness window confirms and advances. Knots without `agent` require the human (or, later, a judge) to advance.
```

In `skills/frs-strategy/SKILL.md` (body only — do NOT touch the `description` frontmatter), add a short "Advancement policy" subsection covering: `advance_by` is per-knot (`human`/`agent`/`judge`), the default is `["human"]`, the human override always works, the agent two-phase armed confirmation, and that the built-in defaults use "human at the bookends, agent in the middle" (deep-research/spike run autonomously; quick/change/granular gate direction and shipping).

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts && npm test -- tests/skills`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/superpowers-bootstrap.ts tests/extension/superpowers-bootstrap.test.ts skills/frs-strategy/SKILL.md
git commit -m "docs: document advance_by + agent two-phase protocol in bootstrap and frs-strategy"
```

---

## Phase 7 — Cleanup, changelog, gate

### Task 8: Remove stray paste, changelog, version bump, final gate

**Files:** Delete `references/extended-project.json`; modify `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Remove the stray terminal paste.**

```bash
git rm -q references/extended-project.json 2>/dev/null || rm -f references/extended-project.json
```

- [ ] **Step 2: Changelog.** Under `## [Unreleased]` add a section describing: per-knot `advance_by` (`human`/`agent`/`judge`, any-of + human override); five generic default strands (spike, quick, deep-research, change, granular) with the bookend posture (replacing the prior quick/granular-only defaults — note this is a **default-strands change**); the agent two-phase armed sign-off (`agent_signoff_window_seconds`, default 300); `project_strand` `advance_by` support; `judge` config parsed but enforced in Phase B.

- [ ] **Step 3: Version bump.** `package.json` `0.4.0` → `0.5.0`. Rename the CHANGELOG `## [Unreleased]` to `## [0.5.0] - 2026-06-04` with a fresh empty `## [Unreleased]` above it.

- [ ] **Step 4: Full gate + manifest parity.**

Run: `npm test`
Expected: all green. (package-metadata + readme-parity must still pass; no `pi.extensions` change in Phase A.)

- [ ] **Step 5: Commit.**

```bash
git add CHANGELOG.md package.json references/extended-project.json
git commit -m "chore(release): v0.5.0 — advancement policy; remove stray paste"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §3 config (`advance_by`, `judge`, `agent_signoff_window_seconds`) → Tasks 1, 5.
- §3.1 five default strands + bookend posture → Task 2.
- §4 data model (`AdvanceActor`/`JudgeConfig`/`SignoffArm`, knot fields, seed/normalize, migrate via seedStrand default) → Tasks 1, 3.
- §5 authorization matrix (agent gated; human override unchanged; judge accepted, human-only pre-B) → Tasks 4, 5.
- §6 two-phase armed confirmation (arm/confirm/expiry/unmet, injected `now`+window) → Tasks 4, 5.
- §7 wiring (tool→two-phase, command unchanged, project_strand advance_by, new:slice unaffected) → Tasks 5, 6.
- §8 context + bootstrap/skill text → Tasks 5, 7.
- §3.1 stray file removal → Task 8.

**Known gaps surfaced (not silently dropped):**
- Migration of legacy state to `advance_by` is handled implicitly: `migrateLegacyState` builds templates without `advance_by`, and `seedStrand` defaults them to `["human"]`; existing v0.4.0 state files are backfilled by `normalizeState` (Task 3). No separate migration task needed.
- `/project:new:slice` strand-selection previews could mention each strand's autonomy posture — minor, deferred (not required for Phase A correctness).
- Judge (`advance_by` includes `judge`, `judge` config) is parsed/stored only; Phase B implements enforcement.

**Type consistency:** `handleAgentSignOff(state, sliceId, message, evidence, now, windowSeconds)` is used identically in Task 4 (tests) and Task 5 (wrapper). `signOffActiveKnotInPlace` is the single advance primitive shared by `handleKnotSignOff` and `handleAgentSignOff`. `advance_by`/`judge`/`signoff_arm` field names match across core, seed, normalize, authoring, and tests.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; test steps show real assertions and exact commands with expected pass/fail.
