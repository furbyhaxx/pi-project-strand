import { describe, expect, test } from "vitest";
import askUserQuestionExtension from "../../extensions/ask-user-question.js";
import planTrackerExtension from "../../extensions/plan-tracker.js";
import projectKnowledgeExtension from "../../extensions/project-knowledge.js";
import projectStrandExtension from "../../extensions/project-strand.js";
import projectTrackerExtension from "../../extensions/project-tracker.js";
import {
  DEFAULT_STRANDS,
  createInitialState,
  handleKnotStart,
  handleSliceActivate,
  handleSliceCreate,
  normalizeState,
} from "../../extensions/project-tracker-core.js";

const theme = {
  fg: (_key: string, text: string) => text,
  bg: (_key: string, text: string) => text,
  bold: (text: string) => text,
};

function render(component: { render(width: number): string[] }, width = 120): string[] {
  return component.render(width);
}

function captureTool(register: (pi: any) => void, name: string): any {
  let tool: any;
  const pi = {
    on() {},
    registerCommand() {},
    registerTool(def: any) {
      if (def.name === name) tool = def;
    },
  };
  register(pi);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool;
}

function context(args: Record<string, unknown> = {}) {
  return { args, state: {}, invalidate() {} };
}

describe("tool renderers", () => {
  test("plan_tracker uses self-framed action-specific output", () => {
    const tool = captureTool(planTrackerExtension, "plan_tracker");
    expect(tool.renderShell).toBe("self");

    const args = { action: "init", tasks: ["Audit renderers", "Add frames"] };
    expect(render(tool.renderCall(args, theme, context(args)))[0]).toBe("● Plan(init · 2 tasks)");

    const result = {
      content: [{ type: "text", text: "Plan initialized with 2 tasks." }],
      details: {
        action: "init",
        tasks: [
          { name: "Audit renderers", status: "pending" },
          { name: "Add frames", status: "pending" },
        ],
      },
    };
    const lines = render(tool.renderResult(result, {}, theme, context(args)));
    expect(lines[0]).toBe("  ⎿  Initialized 2 tasks");
    expect(lines[1]).toContain("○ [0] Audit renderers");
  });

  test("ask_user_question summarizes answers and cancellations in the shared frame", () => {
    const tool = captureTool(askUserQuestionExtension, "ask_user_question");
    expect(tool.renderShell).toBe("self");

    const args = {
      questions: [
        {
          question: "Which strand?",
          header: "Strand",
          multiSelect: false,
          options: [
            { label: "quick", description: "Small" },
            { label: "granular", description: "Large" },
          ],
        },
      ],
    };
    expect(render(tool.renderCall(args, theme, context(args)))[0]).toBe("● Ask(1 question: Strand)");

    const answered = render(tool.renderResult({ content: [], details: { cancelled: false, answers: { "Which strand?": "quick" } } }, {}, theme, context(args)));
    expect(answered[0]).toBe("  ⎿  Answered 1/1");
    expect(answered[1]).toContain("✓ Strand → quick");

    const cancelled = render(tool.renderResult({ content: [], details: { cancelled: true } }, {}, theme, context(args)));
    expect(cancelled[0]).toBe("  ⎿  Cancelled by user");
  });

  test("project_strand renders strand definitions compactly", () => {
    const tool = captureTool(projectStrandExtension, "project_strand");
    expect(tool.renderShell).toBe("self");

    const args = { action: "define", name: "integration", knots: [{ name: "Survey", focus: "look" }, { name: "Build", focus: "ship" }] };
    expect(render(tool.renderCall(args, theme, context(args)))[0]).toBe("● Strand(define · integration)");

    const result = {
      content: [{ type: "text", text: "Defined strand \"integration\" with 2 knot(s): Survey → Build.\nWritten to .pi/project.jsonc." }],
      details: { action: "define", name: "integration", knots: ["Survey", "Build"] },
    };
    const lines = render(tool.renderResult(result, {}, theme, context(args)));
    expect(lines[0]).toBe("  ⎿  Defined integration · 2 knots");
    expect(lines[1]).toContain("Survey → Build");
  });

  test("project_knowledge uses text badges instead of emoji category output", () => {
    const tool = captureTool(projectKnowledgeExtension, "project_knowledge");
    expect(tool.renderShell).toBe("self");

    const args = { action: "get", id: "dec-001" };
    expect(render(tool.renderCall(args, theme, context(args)))[0]).toBe("● Knowledge(get · dec-001)");

    const result = {
      content: [{ type: "text", text: "📌 [dec-001] Use JSONC\nCategory: decision\n\nUse .pi/project.jsonc." }],
      details: { action: "get", stats: "1 entries (1 decision)" },
    };
    const lines = render(tool.renderResult(result, {}, theme, context(args)));
    expect(lines[0]).toBe("  ⎿  dec-001 · decision · Use JSONC");
    expect(lines.join("\n")).toContain("[decision] dec-001 Use JSONC");
  });

  test("project_tracker renders knot actions with project-specific summaries", () => {
    const tool = captureTool(projectTrackerExtension, "project_tracker");
    expect(tool.renderShell).toBe("self");

    const args = { action: "knot:start", slice_id: "dns-cache", knot: "Prototype" };
    expect(render(tool.renderCall(args, theme, context(args)))[0]).toBe("● Knot(start · dns-cache → Prototype)");

    let state = normalizeState(createInitialState({ project: { name: "EdgeOS", description: "router" } }, "fallback"));
    state = handleSliceCreate(state, {
      id: "dns-cache",
      name: "DNS cache",
      description: "Cache DNS",
      type: "vertical",
      goal: "Reduce DNS latency",
      criteria: ["p99 < 1ms"],
      strand: "quick",
    }, DEFAULT_STRANDS.quick).state;
    state = handleSliceActivate(state, "dns-cache").state;
    state = handleKnotStart(state, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["Wireframes approved"] }).state;

    const result = {
      content: [{ type: "text", text: "Started dns-cache → Prototype\nPreferred plan path: .pi/project/plans/dns-cache/prototype.md" }],
      details: { action: "knot:start", state },
    };
    const lines = render(tool.renderResult(result, {}, theme, context(args)));
    expect(lines[0]).toBe("  ⎿  Started Prototype · 0/1 criteria");
    expect(lines.join("\n")).toContain(".pi/project/plans/dns-cache/prototype.md");
  });
});
