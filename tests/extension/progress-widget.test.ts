import { describe, expect, test } from "vitest";
import { buildProgressWidgetLines } from "../../extensions/progress-widget.js";
import type { ProjectState } from "../../extensions/project-tracker-core.js";
import type { Task } from "../../extensions/plan-tracker-core.js";

const theme = {
  fg: (_key: string, text: string) => text,
  bg: (_key: string, text: string) => text,
  bold: (text: string) => text,
};

describe("progress widget", () => {
  test("renders slice, knots, and tasks in unified order", () => {
    const state: ProjectState = {
      project: { name: "serde_yass", description: "", updated_at: "2026-06-05T00:00:00.000Z" },
      milestones: [],
      slices: [
        {
          id: "foundations-research",
          name: "Foundations research",
          description: "",
          type: "vertical",
          track: "main",
          priority: 100,
          status: "active",
          goal: "",
          success_criteria: [],
          started_at: null,
          completed_at: null,
          signed_off: false,
          signed_off_message: null,
          validation_evidence_summary: null,
          notes: null,
          resources: [],
          strand: {
            name: "deep-research",
            description: "",
            current_knot: "Synthesis",
            pending_fast_forward: null,
            knots: [
              { name: "Preparation", title: null, focus: "", status: "signed_off", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: true, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["agent"], judge: null, signoff_arm: null, last_verdict: null },
              { name: "DeepResearch", title: null, focus: "", status: "signed_off", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: true, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["agent"], judge: null, signoff_arm: null, last_verdict: null },
              { name: "Synthesis", title: null, focus: "", status: "active", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: false, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["agent"], judge: null, signoff_arm: null, last_verdict: null },
              { name: "Finalization", title: null, focus: "", status: "pending", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: false, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["agent"], judge: null, signoff_arm: null, last_verdict: null },
            ],
          },
        },
        {
          id: "docs-follow-up",
          name: "Docs follow-up",
          description: "",
          type: "vertical",
          track: "side",
          priority: 120,
          status: "active",
          goal: "",
          success_criteria: [],
          started_at: null,
          completed_at: null,
          signed_off: false,
          signed_off_message: null,
          validation_evidence_summary: null,
          notes: null,
          resources: [],
          strand: {
            name: "change",
            description: "",
            current_knot: "Patch",
            pending_fast_forward: null,
            knots: [
              { name: "Scope", title: null, focus: "", status: "signed_off", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: true, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["human"], judge: null, signoff_arm: null, last_verdict: null },
              { name: "Patch", title: null, focus: "", status: "active", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: false, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["agent"], judge: null, signoff_arm: null, last_verdict: null },
              { name: "Verify", title: null, focus: "", status: "pending", goals: [], success_criteria: [], plan: null, resources: [], started_at: null, completed_at: null, signed_off: false, signed_off_message: null, validation_evidence_summary: null, notes: null, advance_by: ["human"], judge: null, signoff_arm: null, last_verdict: null },
            ],
          },
        },
      ],
    };

    const tasks: Task[] = [
      { name: "Draft final report", status: "complete" },
      { name: "Update ARCHITECTURE.md", status: "complete" },
      { name: "Write final foundations research report", status: "in_progress" },
      { name: "Record knowledge entries", status: "pending" },
      { name: "Verify finalization", status: "pending" },
    ];

    const lines = buildProgressWidgetLines(theme, { projectState: state, tasks });
    expect(lines).toEqual([
      "Quest: foundations-research[Synthesis] · +1 side",
      "Knots: ● Preparation / ● DeepResearch / ● Synthesis / ○ Finalization (2/4)",
      "Tasks: ●●●○○ (2/5)  Write final foundations research report",
    ]);
  });

  test("renders tasks only when no active slice exists", () => {
    const lines = buildProgressWidgetLines(theme, {
      projectState: null,
      tasks: [{ name: "Write plan", status: "pending" }],
    });
    expect(lines).toEqual(["Tasks: ○ (0/1)  Write plan"]);
  });
});
