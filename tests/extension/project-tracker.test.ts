import { describe, expect, test } from "vitest";
import {
  DEFAULT_STRANDS,
  preferredPlanPath,
  seedStrand,
  createInitialState,
  normalizeState,
  handleSliceCreate,
  handleSliceUpdate,
  handleSliceActivate,
  handleSliceSetTrack,
  handleSliceHold,
  handleSliceSignOff,
  handleKnotStart,
  handleKnotUpdate,
  handleKnotSetPlan,
  handleKnotSignOff,
  handleAgentSignOff,
  handleKnotFastForward,
  handleCompleteFastForward,
  handleVerifyCriterion,
  handleAnnotate,
  handleResourceAdd,
  handleResourceRemove,
  handleMilestoneAdd,
  applyJudgeVerdict,
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
  test("DEFAULT_STRANDS ships the five generic strands with bookend advance_by", () => {
    expect(Object.keys(DEFAULT_STRANDS).sort()).toEqual(["change", "deep-research", "granular", "quick", "spike"]);
    expect(quick.knots.map((k) => k.name)).toEqual(["Prototype", "Realization", "Finalization"]);
    expect(DEFAULT_STRANDS.granular.knots).toHaveLength(7);
    expect(quick.knots.map((k) => k.advance_by)).toEqual([["human"], ["agent"], ["human"]]);
    expect(DEFAULT_STRANDS["deep-research"].knots.every((k) => k.advance_by?.[0] === "agent")).toBe(true);
    expect(DEFAULT_STRANDS.spike.knots.map((k) => k.advance_by![0])).toEqual(["agent", "agent", "human"]);
    expect(DEFAULT_STRANDS.granular.knots.map((k) => k.advance_by![0])).toEqual(["human", "agent", "agent", "agent", "agent", "human", "human"]);
  });

  test("seedStrand copies advance_by (default human) + judge + null signoff_arm", () => {
    const s = seedStrand("quick", quick);
    expect(s.knots.map((k) => k.advance_by)).toEqual([["human"], ["agent"], ["human"]]);
    expect(s.knots.every((k) => k.signoff_arm === null && k.judge === null)).toBe(true);
    const noAdvance = seedStrand("x", { description: "d", knots: [{ name: "K", focus: "f" }] });
    expect(noAdvance.knots[0]!.advance_by).toEqual(["human"]);
  });

  test("normalizeState backfills advance_by/signoff_arm on legacy-shaped knots", () => {
    const base = withSlice();
    delete (base.slices[0]!.strand.knots[0] as any).advance_by;
    delete (base.slices[0]!.strand.knots[0] as any).signoff_arm;
    const norm = normalizeState(base, { project: { name: "EdgeOS" } }, "fallback");
    expect(norm.slices[0]!.strand.knots[0]!.advance_by).toEqual(["human"]);
    expect(norm.slices[0]!.strand.knots[0]!.signoff_arm).toBeNull();
  });

  test("seedStrand + normalize default last_verdict to null", () => {
    expect(seedStrand("quick", quick).knots.every((k) => k.last_verdict === null)).toBe(true);
    const base = withSlice();
    delete (base.slices[0]!.strand.knots[0] as any).last_verdict;
    const norm = normalizeState(base, { project: { name: "EdgeOS" } }, "fallback");
    expect(norm.slices[0]!.strand.knots[0]!.last_verdict).toBeNull();
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
    expect(slice.track).toBe("main");
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

  test("create honors explicit side track", () => {
    const created = handleSliceCreate(freshState(), {
      id: "docs-research",
      name: "Docs research",
      description: "Gather docs",
      type: "vertical",
      track: "side",
      goal: "Collect relevant docs",
      criteria: ["sources linked"],
      strand: "quick",
    }, quick);
    expect(created.state.slices[0]!.track).toBe("side");
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

  test("single-active-main is enforced while side quests may run in parallel", () => {
    let state = withSlice();
    state = handleSliceCreate(state, {
      id: "api-cleanup",
      name: "API cleanup",
      description: "Fix the API",
      type: "vertical",
      goal: "Reduce API noise",
      criteria: ["public API trimmed"],
      strand: "quick",
    }, quick).state;
    state = handleSliceActivate(state, "dns-cache").state;
    expect(handleSliceActivate(state, "api-cleanup").error).toBe("main active");

    state = handleSliceSetTrack(state, "api-cleanup", "side").state;
    expect(handleSliceActivate(state, "api-cleanup").error).toBeUndefined();
  });

  test("slice:set_track blocks creating a second active main but allows inactive retagging", () => {
    let state = withSlice();
    state = handleSliceCreate(state, {
      id: "docs-research",
      name: "Docs research",
      description: "Gather docs",
      type: "vertical",
      track: "side",
      goal: "Collect docs",
      criteria: ["sources linked"],
      strand: "quick",
    }, quick).state;
    state = handleSliceActivate(state, "dns-cache").state;
    state = handleSliceActivate(state, "docs-research").state;

    const blocked = handleSliceSetTrack(state, "docs-research", "main");
    expect(blocked.error).toBe("main active");

    const inactive = handleSliceSetTrack(handleSliceHold(state, "docs-research").state, "docs-research", "main");
    expect(inactive.error).toBeUndefined();
    expect(inactive.state.slices.find((slice) => slice.id === "docs-research")!.track).toBe("main");
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

  test("knot:start enforces the active-main invariant while side quests remain allowed", () => {
    let state = withSlice();
    state = handleSliceCreate(state, {
      id: "api-cleanup",
      name: "API cleanup",
      description: "Fix the API",
      type: "vertical",
      goal: "Reduce API noise",
      criteria: ["public API trimmed"],
      strand: "quick",
    }, quick).state;
    state = handleSliceActivate(state, "dns-cache").state;

    expect(handleKnotStart(state, { slice_id: "api-cleanup", knot: "Prototype", goals: [], criteria: ["c"] }).error).toBe("main active");

    state = handleSliceSetTrack(state, "api-cleanup", "side").state;
    expect(handleKnotStart(state, { slice_id: "api-cleanup", knot: "Prototype", goals: [], criteria: ["c"] }).error).toBeUndefined();
  });

  test("preferredPlanPath stores plans under the project tracker hierarchy", () => {
    expect(preferredPlanPath("dns-cache", "Prototype")).toBe(".pi/project/plans/dns-cache/prototype.md");
    expect(preferredPlanPath("DNS Cache", "Proof-of-Work")).toBe(".pi/project/plans/dns-cache/proof-of-work.md");
  });

  test("update edits goals/title; set_plan defaults to preferred path but allows overrides", () => {
    let state = handleKnotStart(handleSliceActivate(withSlice(), "dns-cache").state, {
      slice_id: "dns-cache", knot: "Prototype", goals: ["g"], criteria: ["c"],
    }).state;
    state = handleKnotUpdate(state, "dns-cache", { goals: ["g1", "g2"], title: "LRU spike" }).state;
    expect(state.slices[0]!.strand.knots[0]!.goals).toEqual(["g1", "g2"]);
    expect(state.slices[0]!.strand.knots[0]!.title).toBe("LRU spike");
    state = handleKnotSetPlan(state, "dns-cache", undefined, "linked").state;
    expect(state.slices[0]!.strand.knots[0]!.plan).toEqual({ path: ".pi/project/plans/dns-cache/prototype.md", status: "linked" });
    state = handleKnotSetPlan(state, "dns-cache", "docs/plans/p.md", "complete").state;
    expect(state.slices[0]!.strand.knots[0]!.plan).toEqual({ path: "docs/plans/p.md", status: "complete" });
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
    expect(computeNext(state)).toContain("ready for user sign-off");

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

  test("ready agent-authorized knot points agents at knot:sign_off, not the human override", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "e").state;
    state = handleKnotSignOff(state, "dns-cache", "m", "e").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Realization", goals: [], criteria: ["c"] }).state;
    state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "e").state;

    const next = computeNext(state);
    expect(next).toContain("agent sign-off");
    expect(next).toContain("project_tracker action=knot:sign_off slice_id=dns-cache");
    expect(next).not.toContain("/project:knot:advance dns-cache");
  });

  test("ready judge-authorized knot points at knot:judge", () => {
    let state = handleSliceActivate(withSlice(), "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c"] }).state;
    state.slices[0]!.strand.knots[0]!.advance_by = ["judge"];
    state = handleVerifyCriterion(state, "dns-cache", "knot", 0, "e").state;

    const next = computeNext(state);
    expect(next).toContain("judge sign-off");
    expect(next).toContain("project_tracker action=knot:judge slice_id=dns-cache");
  });

  test("ignores side quests for the main headline next step", () => {
    let state = withSlice();
    state = handleSliceCreate(state, {
      id: "docs-research",
      name: "Docs research",
      description: "Gather docs",
      type: "vertical",
      track: "side",
      goal: "Collect docs",
      criteria: ["sources linked"],
      strand: "quick",
    }, quick).state;
    state = handleSliceActivate(state, "docs-research").state;
    state = handleKnotStart(state, { slice_id: "docs-research", knot: "Prototype", goals: [], criteria: ["c"] }).state;

    expect(computeNext(state)).toContain("Activate dns-cache");

    state = handleSliceSetTrack(state, "dns-cache", "side").state;
    expect(computeNext(state)).toContain("Use /project:slice:execute <id>");
  });
});

describe("normalizeState", () => {
  test("defaults missing track to main and grandfathers legacy multi-active mains", () => {
    const state = normalizeState({
      project: { name: "EdgeOS", description: "router", updated_at: "2026-06-05T00:00:00.000Z" },
      milestones: [],
      slices: [
        { ...withSlice().slices[0]!, status: "active", started_at: null },
        {
          ...handleSliceCreate(freshState(), {
            id: "api-cleanup",
            name: "API cleanup",
            description: "Fix the API",
            type: "vertical",
            goal: "Reduce API noise",
            criteria: ["public API trimmed"],
            strand: "quick",
          }, quick).state.slices[0]!,
          status: "active",
          started_at: null,
        },
      ].map((slice) => {
        const clone = JSON.parse(JSON.stringify(slice));
        delete clone.track;
        return clone;
      }) as any,
    } as any, { project: { name: "EdgeOS" } }, "fallback");

    expect(state.slices.every((slice) => slice.track === "main")).toBe(true);
    expect(state.slices.filter((slice) => slice.status === "active")).toHaveLength(2);
  });
});

describe("agent two-phase sign-off", () => {
  const WINDOW = 300;
  function armed(state: any, knot: string) {
    let s = handleSliceActivate(state, "dns-cache").state;
    s = handleKnotStart(s, { slice_id: "dns-cache", knot, goals: [], criteria: ["c1", "c2"] }).state;
    return s;
  }
  const t0 = "2026-06-04T00:00:00.000Z";
  const t1 = "2026-06-04T00:02:00.000Z"; // +120s (within 300)
  const tLate = "2026-06-04T00:10:00.000Z"; // +600s (expired)

  test("refused when agent not permitted (default human knot)", () => {
    const s = armed(withSlice(), "Prototype"); // quick.Prototype = ["human"]
    const r = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW);
    expect(r.error).toBe("agent advance not permitted");
    expect(r.text).toContain("/project:knot:advance");
  });

  test("first call arms as a successful mutation (no advance) and returns the criteria challenge", () => {
    const s = armed(withSlice(), "Realization"); // quick.Realization = ["agent"]
    const r = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW);
    expect(r.error).toBeUndefined();
    expect(r.state.slices[0]!.strand.knots[1]!.signoff_arm).toEqual({ armed_at: t0 });
    expect(r.state.slices[0]!.strand.knots[1]!.status).toBe("active");
    expect(r.text).toContain("c1");
  });

  test("second call within window + all met + evidence advances and clears arm", () => {
    let s = armed(withSlice(), "Realization");
    s = handleAgentSignOff(s, "dns-cache", "m", "e", t0, WINDOW).state;
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
    expect(r.error).toBeUndefined();
    expect(r.state.slices[0]!.strand.knots[1]!.signoff_arm).toEqual({ armed_at: tLate });
    expect(r.state.slices[0]!.strand.knots[1]!.status).toBe("active");
  });
});

describe("applyJudgeVerdict", () => {
  function activeJudgeKnot() {
    let s = handleSliceActivate(withSlice(), "dns-cache").state;
    s = handleKnotStart(s, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c1", "c2"] }).state;
    return s;
  }
  const v = (approved: boolean): any => ({
    approved,
    reasons: approved ? "all good" : "missing tests",
    unmet: approved ? [] : ["c2"],
    model: "anthropic/claude-opus-4-8:high",
    at: "2026-06-04T00:00:00.000Z",
  });

  test("approve marks criteria met (judge-verified), advances, records verdict", () => {
    const r = applyJudgeVerdict(activeJudgeKnot(), "dns-cache", v(true));
    expect(r.error).toBeUndefined();
    const knot = r.state.slices[0]!.strand.knots[0]!;
    expect(knot.status).toBe("signed_off");
    expect(knot.success_criteria.every((c) => c.met)).toBe(true);
    expect(knot.validation_evidence_summary).toContain("judge(anthropic/claude-opus-4-8:high)");
    expect(knot.last_verdict!.approved).toBe(true);
    expect(r.state.slices[0]!.strand.current_knot).toBeNull();
  });

  test("reject records verdict + note, does not advance", () => {
    const r = applyJudgeVerdict(activeJudgeKnot(), "dns-cache", v(false));
    expect(r.error).toBeUndefined();
    const knot = r.state.slices[0]!.strand.knots[0]!;
    expect(knot.status).toBe("active");
    expect(knot.last_verdict!.approved).toBe(false);
    expect(knot.notes).toContain("Judge rejection");
    expect(knot.notes).toContain("missing tests");
    expect(r.state.slices[0]!.strand.current_knot).toBe("Prototype");
  });
});
