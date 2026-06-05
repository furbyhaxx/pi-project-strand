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
    expect(slice.track).toBe("main");
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
