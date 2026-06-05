import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Task } from "./plan-tracker-core.js";
import type { Knot, ProjectState, Slice } from "./project-tracker-core.js";
import { activeFg, component, doneFg, fg } from "./tui-render.js";

interface ProgressWidgetState {
  tasks: Task[];
  projectState: ProjectState | null;
}

const progressState: ProgressWidgetState = {
  tasks: [],
  projectState: null,
};

const LEGACY_WIDGET_KEYS = ["plan_tracker", "project_tracker"] as const;

function firstActiveSlice(state: ProjectState | null): Slice | undefined {
  if (!state) return undefined;
  const active = [...state.slices]
    .filter((slice) => slice.status === "active")
    .sort((a, b) => (a.track === b.track ? 0 : a.track === "main" ? -1 : 1) || a.priority - b.priority || a.id.localeCompare(b.id));
  return active[0];
}

function activeKnot(slice: Slice | undefined): Knot | undefined {
  if (!slice || !slice.strand.current_knot) return undefined;
  return slice.strand.knots.find((knot) => knot.name === slice.strand.current_knot);
}

function taskIcons(tasks: Task[], theme: Theme): string {
  return tasks
    .map((task) => {
      switch (task.status) {
        case "complete":
          return doneFg(theme, "●");
        case "in_progress":
          return activeFg(theme, "●");
        default:
          return "○";
      }
    })
    .join("");
}

function knotIcons(slice: Slice, theme: Theme): string {
  const doneCount = slice.strand.knots.filter((knot) => knot.status === "signed_off" || knot.status === "fast_forwarded").length;
  return slice.strand.knots
    .map((knot) => {
      let icon: string;
      if (knot.status === "signed_off" || knot.status === "fast_forwarded") {
        icon = doneFg(theme, "●");
      } else if (knot.status === "active") {
        icon = activeFg(theme, "●");
      } else {
        icon = "○";
      }
      return `${icon} ${fg(theme, "toolOutput", knot.name)}`;
    })
    .join(fg(theme, "muted", " / ")) + ` ${fg(theme, "muted", `(${doneCount}/${slice.strand.knots.length})`)}`;
}

export function buildProgressWidgetLines(theme: Theme, state: ProgressWidgetState): string[] {
  const lines: string[] = [];
  const slice = firstActiveSlice(state.projectState);
  if (slice && state.projectState) {
    lines.push(`${fg(theme, "muted", "Slice:")} ${fg(theme, "toolOutput", state.projectState.project.name)} ${fg(theme, "muted", "/")} ${fg(theme, "toolOutput", slice.id)}`);
    lines.push(`${fg(theme, "muted", "Knots:")} ${knotIcons(slice, theme)}`);
  }

  if (state.tasks.length > 0) {
    const complete = state.tasks.filter((task) => task.status === "complete").length;
    const current = state.tasks.find((task) => task.status === "in_progress") ?? state.tasks.find((task) => task.status === "pending");
    const suffix = current ? `  ${fg(theme, "toolOutput", current.name)}` : "";
    lines.push(`${fg(theme, "muted", "Tasks:")} ${taskIcons(state.tasks, theme)} ${fg(theme, "muted", `(${complete}/${state.tasks.length})`)}${suffix}`);
  }

  return lines;
}

export function setProgressWidgetTasks(tasks: Task[]): void {
  progressState.tasks = [...tasks];
}

export function setProgressWidgetProjectState(state: ProjectState | null): void {
  progressState.projectState = state;
}

export function updateProgressWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  for (const key of LEGACY_WIDGET_KEYS) {
    ctx.ui.setWidget(key, undefined);
  }

  const hasState = progressState.projectState || progressState.tasks.length > 0;
  if (!hasState) {
    ctx.ui.setWidget("project_progress", undefined);
    return;
  }

  ctx.ui.setWidget("project_progress", (_tui, theme) => component(buildProgressWidgetLines(theme, progressState)));
}
