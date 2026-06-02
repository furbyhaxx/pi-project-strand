import { describe, expect, test } from "vitest";
import {
  advanceKnotForSignoff,
  computeNext,
  createInitialState,
  handleKnotRequestSignoff,
  handleKnotStart,
  handleMilestoneAdd,
  handlePlanComplete,
  handlePlanLink,
  handleSliceActivate,
  handleSliceCreate,
  handleVerifyCriterion,
  normalizeState,
} from "../../extensions/project-tracker-core.js";

const config = {
  project: { name: "EdgeOS", description: "router" },
  knots: [{ name: "PoW" }, { name: "Alpha" }, { name: "Beta" }],
};

describe("project tracker core", () => {
  test("creates initial state from config", () => {
    const state = createInitialState(config, "fallback");
    expect(state.project.name).toBe("EdgeOS");
    expect(state.slices).toEqual([]);
  });

  test("creates and activates a slice", () => {
    const base = normalizeState(createInitialState(config, "fallback"), config, "fallback");
    const created = handleSliceCreate(base, {
      id: "dns-cache",
      name: "DNS Cache",
      description: "Cache DNS queries",
      type: "vertical",
      priority: 10,
    });
    expect(created.error).toBeUndefined();
    expect(created.state.slices[0]?.status).toBe("defined");

    const activated = handleSliceActivate(created.state, "dns-cache");
    expect(activated.state.slices[0]?.status).toBe("active");
  });

  test("starts knot, verifies criteria, requests signoff, advances knot", () => {
    const base = normalizeState(createInitialState(config, "fallback"), config, "fallback");
    const created = handleSliceCreate(base, {
      id: "dns-cache",
      name: "DNS Cache",
      description: "Cache DNS queries",
      type: "vertical",
      priority: 10,
    }).state;

    const started = handleKnotStart(
      created,
      {
        slice_id: "dns-cache",
        knot: "PoW",
        criteria: ["Approach validated", "API shape decided"],
      },
      ["PoW", "Alpha", "Beta"]
    );
    expect(started.error).toBeUndefined();
    expect(started.state.slices[0]?.active_knot?.criteria).toHaveLength(2);

    const verified0 = handleVerifyCriterion(started.state, {
      slice_id: "dns-cache",
      index: 0,
      evidence: "Spike succeeded",
    });
    const prematureSignoff = handleKnotRequestSignoff(verified0.state, "dns-cache");
    expect(prematureSignoff.error).toBe("criteria not complete");

    const verified1 = handleVerifyCriterion(verified0.state, {
      slice_id: "dns-cache",
      index: 1,
      evidence: "Decision recorded",
    });
    const ready = handleKnotRequestSignoff(verified1.state, "dns-cache");
    expect(ready.error).toBeUndefined();

    const advanced = advanceKnotForSignoff(verified1.state, "dns-cache", ["PoW", "Alpha", "Beta"], "PoW complete");
    expect(advanced.error).toBeUndefined();
    expect(advanced.state.slices[0]?.current_knot).toBe("Alpha");
    expect(advanced.state.slices[0]?.active_knot).toBeNull();
    expect(advanced.state.slices[0]?.knot_history).toHaveLength(1);
  });

  test("links and completes plan state", () => {
    const base = normalizeState(createInitialState(config, "fallback"), config, "fallback");
    const created = handleSliceCreate(base, {
      id: "dns-cache",
      name: "DNS Cache",
      description: "Cache DNS queries",
      type: "vertical",
      priority: 10,
    }).state;
    const linked = handlePlanLink(created, { slice_id: "dns-cache", file_path: "docs/plans/dns-cache.md" });
    expect(linked.state.slices[0]?.active_plan).toBe("docs/plans/dns-cache.md");
    expect(linked.state.slices[0]?.active_plan_status).toBe("linked");

    const completed = handlePlanComplete(linked.state, "dns-cache");
    expect(completed.state.slices[0]?.active_plan_status).toBe("complete");
  });

  test("adds milestones", () => {
    const base = normalizeState(createInitialState(config, "fallback"), config, "fallback");
    const result = handleMilestoneAdd(base, { name: "PoW core ready", description: "persistent state machine validated" });
    expect(result.state.milestones).toHaveLength(1);
  });

  test("computes next recommendation", () => {
    const base = normalizeState(createInitialState(config, "fallback"), config, "fallback");
    const created = handleSliceCreate(base, {
      id: "dns-cache",
      name: "DNS Cache",
      description: "Cache DNS queries",
      type: "vertical",
      priority: 10,
    }).state;
    expect(computeNext(created)).toContain("Activate dns-cache");
  });
});
