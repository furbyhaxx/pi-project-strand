/**
 * Plan Tracker Extension
 *
 * A native pi tool for tracking plan progress.
 * State is stored in tool result details for proper branching support.
 * Shows a persistent TUI widget above the editor.
 *
 * Pure logic lives in plan-tracker-core.ts for testability.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import {
  type Task,
  type BranchEntry,
  type PlanTrackerDetails,
  handleInit,
  handleUpdate,
  handleStatus,
  handleClear,
  reconstructFromBranch,
} from "./plan-tracker-core.js";
import {
  fg,
  firstLine,
  outputLines,
  plural,
  renderFrameCall,
  renderFrameResult,
  textContent,
  type ToolRenderContextLike,
} from "./tui-render.js";
import {
  setProgressWidgetTasks,
  updateProgressWidget,
} from "./progress-widget.js";

const PlanTrackerParams = Type.Object({
  action: StringEnum(["init", "update", "status", "clear"] as const, {
    description: "Action to perform",
  }),
  tasks: Type.Optional(
    Type.Array(Type.String(), {
      description: "Task names (for init)",
    })
  ),
  index: Type.Optional(
    Type.Integer({
      minimum: 0,
      description: "Task index, 0-based (for update)",
    })
  ),
  status: Type.Optional(
    StringEnum(["pending", "in_progress", "complete"] as const, {
      description: "New status (for update)",
    })
  ),
});

export type PlanTrackerInput = Static<typeof PlanTrackerParams>;

function planTarget(args: Partial<PlanTrackerInput> | undefined): string {
  const action = args?.action ?? "status";
  switch (action) {
    case "init":
      return `init${args?.tasks ? ` · ${plural(args.tasks.length, "task")}` : ""}`;
    case "update":
      return `update${args?.index !== undefined ? ` · [${args.index}]` : ""}${args?.status ? ` → ${args.status}` : ""}`;
    default:
      return action;
  }
}

function taskIcon(status: Task["status"], theme: Theme): string {
  switch (status) {
    case "complete":
      return fg(theme, "success", "✓");
    case "in_progress":
      return fg(theme, "warning", "→");
    default:
      return fg(theme, "dim", "○");
  }
}

function taskLine(theme: Theme, task: Task, index: number): string {
  return `${taskIcon(task.status, theme)} ${fg(theme, "accent", `[${index}]`)} ${fg(theme, "toolOutput", task.name)}`;
}

function taskSummary(tasks: Task[]): { complete: number; inProgress: number; pending: number } {
  return {
    complete: tasks.filter((t) => t.status === "complete").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
  };
}

export default function (pi: ExtensionAPI) {
  let tasks: Task[] = [];

  const reconstructState = (ctx: ExtensionContext) => {
    tasks = reconstructFromBranch(ctx.sessionManager.getBranch() as BranchEntry[]);
  };

  const updateWidget = (ctx: ExtensionContext) => {
    setProgressWidgetTasks(tasks);
    updateProgressWidget(ctx);
  };

  // Reconstruct state + widget on session events
  for (const event of [
    "session_start",
    "session_switch",
    "session_fork",
    "session_tree",
  ] as const) {
    pi.on(event, async (_event, ctx) => {
      reconstructState(ctx);
      updateWidget(ctx);
    });
  }

  pi.registerTool({
    name: "plan_tracker",
    label: "Plan Tracker",
    description:
      "Track progress on the ad-hoc execution plan currently being worked: the active knot plan, a written implementation checklist, or the current teammate-local work queue. Use this for short-lived in-progress tasks for the current session. Do not use it for persistent slice/knot/project lifecycle state — that belongs in project_tracker. Actions: init (set task list), update (change task status), status (show current state), clear (remove plan).",
    promptSnippet: "Track progress on the current ad-hoc execution plan or working checklist for this session.",
    promptGuidelines: [
      "Use plan_tracker for the ad-hoc execution plan currently being worked in this session: the active knot plan, a written checklist, or the immediate task queue.",
      "Use project_tracker for persistent slice, knot, criteria, plan-link, and milestone state across the whole project; do not use plan_tracker as a substitute for project progress.",
    ],
    parameters: PlanTrackerParams,
    renderShell: "self",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let result;

      switch (params.action) {
        case "init": {
          result = handleInit(params.tasks);
          if (!result.error) {
            tasks = result.tasks;
            updateWidget(ctx);
          } else {
            // Preserve existing tasks in details on error (don't destroy active plan)
            result = { ...result, tasks: [...tasks] };
          }
          break;
        }
        case "update": {
          result = handleUpdate(tasks, params.index, params.status);
          tasks = result.tasks;
          updateWidget(ctx);
          break;
        }
        case "status": {
          result = handleStatus(tasks);
          break;
        }
        case "clear": {
          result = handleClear(tasks);
          tasks = result.tasks;
          updateWidget(ctx);
          break;
        }
        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${params.action}` }],
            details: {
              action: "status",
              tasks: [...tasks],
              error: "unknown action",
            } as PlanTrackerDetails,
          };
      }

      const details: PlanTrackerDetails = {
        action: params.action,
        tasks: result.tasks,
        ...(result.error ? { error: result.error } : {}),
      };

      return {
        content: [{ type: "text", text: result.text }],
        details,
      };
    },

    renderCall(args, theme, context) {
      return renderFrameCall(theme, context as ToolRenderContextLike, "Ad-hoc Plan", planTarget(args));
    },

    renderResult(result, _options, theme, context) {
      const details = result.details as PlanTrackerDetails | undefined;
      if (!details) {
        const text = textContent(result);
        return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", firstLine(text) || "Done"), outputLines(theme, text).slice(1));
      }

      if (details.error) {
        return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "error", `Error: ${details.error}`), [], { status: "error" });
      }

      const taskList = details.tasks;
      switch (details.action) {
        case "init":
          return renderFrameResult(
            theme,
            context as ToolRenderContextLike,
            fg(theme, "muted", `Initialized ${plural(taskList.length, "task")}`),
            taskList.map((task, index) => taskLine(theme, task, index)),
            { cap: 12 }
          );
        case "update": {
          const args = (context as { args?: Partial<PlanTrackerInput> } | undefined)?.args;
          const { complete } = taskSummary(taskList);
          const updated = args?.index !== undefined ? taskList[args.index] : undefined;
          const body = updated ? [taskLine(theme, updated, args!.index!)] : taskList.map((task, index) => taskLine(theme, task, index));
          const target = args?.index !== undefined ? ` [${args.index}]` : "";
          return renderFrameResult(
            theme,
            context as ToolRenderContextLike,
            fg(theme, "muted", `Updated${target} · ${complete}/${taskList.length} complete`),
            body,
            { cap: 6 }
          );
        }
        case "status": {
          if (taskList.length === 0) {
            return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", "No plan active"));
          }
          const { complete, inProgress, pending } = taskSummary(taskList);
          return renderFrameResult(
            theme,
            context as ToolRenderContextLike,
            fg(theme, "muted", `${complete}/${taskList.length} complete · ${inProgress} in progress · ${pending} pending`),
            taskList.map((task, index) => taskLine(theme, task, index)),
            { cap: 15 }
          );
        }
        case "clear": {
          const line = firstLine(textContent(result));
          const match = line.match(/Plan cleared \((\d+) tasks? removed\)/);
          const summary = match ? `Cleared ${plural(Number(match[1]), "task")}` : "No plan active";
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary));
        }
        default:
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", "Done"));
      }
    },
  });
}
