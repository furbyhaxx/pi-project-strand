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
