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

  test("update can replace slice-level success_criteria (used by migration backfill)", () => {
    const state = handleSliceUpdate(withSlice(), "dns-cache", { criteria: ["new crit a", "new crit b"] }).state;
    expect(state.slices[0]!.success_criteria).toEqual([
      { text: "new crit a", met: false },
      { text: "new crit b", met: false },
    ]);
  });
});

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

  test("start rejects an unknown knot and a second active knot", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    expect(handleKnotStart(state, { slice_id: "dns-cache", knot: "Nope", goals: [], criteria: ["c"] }).error).toBe("invalid knot");
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    expect(handleKnotStart(state, { slice_id: "dns-cache", knot: "Realization", goals: [], criteria: ["c"] }).error).toBe("active knot exists");
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

describe("fast-forward", () => {
  test("init records pending_fast_forward; complete squashes the range and lands at target pending", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    const init = handleKnotFastForward(state, "dns-cache", "Finalization", "skip ahead, integrate everything in Finalization");
    expect(init.error).toBeUndefined();
    expect(init.state.slices[0]!.strand.pending_fast_forward).toMatchObject({ target_knot: "Finalization" });

    const done = handleCompleteFastForward(init.state, "dns-cache", "combined work done");
    expect(done.error).toBeUndefined();
    const knots = done.state.slices[0]!.strand.knots;
    expect(knots[0]!.status).toBe("fast_forwarded");
    expect(knots[1]!.status).toBe("fast_forwarded");
    expect(knots[0]!.validation_evidence_summary).toBe("combined work done");
    expect(knots[2]!.status).toBe("pending");
    expect(done.state.slices[0]!.strand.current_knot).toBeNull();
    expect(done.state.slices[0]!.strand.pending_fast_forward).toBeNull();
  });

  test("init rejects a target that is not after the current position", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    expect(handleKnotFastForward(state, "dns-cache", "Prototype", "x").error).toBe("invalid target");
  });
});

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

describe("computeNext", () => {
  test("walks the lifecycle", () => {
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
