import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { dirname, join, resolve, basename } from "node:path";
import { mkdir, readFile, rename, writeFile, access } from "node:fs/promises";
import { parse } from "jsonc-parser";
import { Type, type Static } from "typebox";
import {
  type ProjectConfig,
  type ProjectState,
  type ProjectTrackerDetails,
  type SliceStatus,
  advanceKnotForSignoff,
  computeNext,
  createInitialState,
  formatCriteria,
  formatProjectStatus,
  formatSliceDetail,
  formatSliceList,
  handleKnotCriteria,
  handleKnotRequestSignoff,
  handleMilestoneAdd,
  handleNext,
  handlePlanComplete,
  handlePlanLink,
  handlePlanList,
  handleSliceActivate,
  handleSliceCreate,
  handleSliceGet,
  handleSliceHold,
  handleSliceList,
  handleStatus,
  handleKnotStart,
  handleVerifyCriterion,
  handleSliceAnnotate,
  handleKnotAnnotate,
  handleInitFastForward,
  handleCompleteFastForward,
  normalizeState,
} from "./project-tracker-core.js";

const DEFAULTS = {
  stateFile: ".pi/project/state.json",
  knots: [
    { name: "PoW", focus: "Prove approach, establish design/API/patterns for later knots" },
    { name: "Alpha", focus: "First real, integrated implementation" },
    { name: "Beta", focus: "Ready to show someone else" },
    { name: "Gamma", focus: "Staging-ready, all core features" },
    { name: "RC1", focus: "Feature complete, polishing" },
    { name: "RC2", focus: "Early-adopter ready" },
    { name: "Release", focus: "Production confident" },
  ],
} as const;

type ProjectStrandConfig = ProjectConfig & {
  stateFile?: string;
};

const ProjectTrackerParams = Type.Object({
  action: StringEnum(
    [
      "status",
      "slice:list",
      "slice:get",
      "knot:criteria",
      "next",
      "plan:list",
      "slice:create",
      "slice:activate",
      "slice:hold",
      "knot:start",
      "knot:verify_criterion",
      "knot:request_signoff",
      "plan:link",
      "plan:complete",
      "milestone:add",
      "slice:annotate",
      "knot:annotate",
      "knot:complete_fast_forward",
    ] as const,
    { description: "Project tracker action" }
  ),
  slice_id: Type.Optional(Type.String({ description: "Slice id" })),
  id: Type.Optional(Type.String({ description: "New slice id" })),
  name: Type.Optional(Type.String({ description: "Name for slice or milestone" })),
  description: Type.Optional(Type.String({ description: "Description for slice or milestone" })),
  type: Type.Optional(StringEnum(["vertical", "horizontal"] as const, { description: "Slice type" })),
  priority: Type.Optional(Type.Integer({ description: "Slice priority" })),
  status: Type.Optional(StringEnum(["defined", "active", "on_hold", "complete"] as const, { description: "Slice status filter" })),
  knot: Type.Optional(Type.String({ description: "Knot name" })),
  criteria: Type.Optional(Type.Array(Type.String(), { description: "Knot done criteria" })),
  index: Type.Optional(Type.Integer({ minimum: 0, description: "Criterion index" })),
  evidence: Type.Optional(Type.String({ description: "Verification evidence for a criterion" })),
  file_path: Type.Optional(Type.String({ description: "Linked plan file path" })),
  notes: Type.Optional(Type.String({ description: "Notes content for slice:annotate or knot:annotate" })),
  notes_mode: Type.Optional(StringEnum(["set", "append"] as const, { description: "set (replace) or append to existing notes (default: set)" })),
});

type ProjectTrackerInput = Static<typeof ProjectTrackerParams>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRoot(startCwd: string): Promise<string> {
  let current = resolve(startCwd);
  while (true) {
    const candidate = join(current, ".pi", "project.jsonc");
    if (await exists(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startCwd);
    current = parent;
  }
}

async function loadProjectConfig(cwd: string): Promise<{ root: string; configPath: string; config: ProjectStrandConfig; knots: string[]; statePath: string }> {
  const root = await findProjectRoot(cwd);
  const configPath = join(root, ".pi", "project.jsonc");

  let config: ProjectStrandConfig = {};
  if (await exists(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    const parsed = parse(raw);
    if (parsed && typeof parsed === "object") config = parsed as ProjectStrandConfig;
  }

  const merged: ProjectStrandConfig = {
    ...config,
    project: {
      name: config.project?.name,
      description: config.project?.description,
    },
    knots: config.knots && config.knots.length > 0 ? config.knots : [...DEFAULTS.knots],
    stateFile: config.stateFile?.trim() || DEFAULTS.stateFile,
  };

  const statePath = resolve(root, merged.stateFile!);
  const knots = (merged.knots ?? DEFAULTS.knots).map((knot) => knot.name);
  return { root, configPath, config: merged, knots, statePath };
}

async function loadState(cwd: string): Promise<{ state: ProjectState; runtime: Awaited<ReturnType<typeof loadProjectConfig>> }> {
  const runtime = await loadProjectConfig(cwd);
  if (!(await exists(runtime.statePath))) {
    const initial = createInitialState(runtime.config, basename(runtime.root));
    return { state: normalizeState(initial, runtime.config, basename(runtime.root)), runtime };
  }

  const raw = await readFile(runtime.statePath, "utf-8");
  const parsed = JSON.parse(raw) as ProjectState;
  return { state: normalizeState(parsed, runtime.config, basename(runtime.root)), runtime };
}

async function atomicWriteState(statePath: string, state: ProjectState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  await rename(tmpPath, statePath);
}

async function mutateState(
  cwd: string,
  mutator: (state: ProjectState, runtime: Awaited<ReturnType<typeof loadProjectConfig>>) => Promise<{ text: string; state: ProjectState; error?: string }> | { text: string; state: ProjectState; error?: string }
): Promise<{ text: string; state: ProjectState; error?: string }> {
  const runtime = await loadProjectConfig(cwd);
  return withFileMutationQueue(runtime.statePath, async () => {
    const { state } = await loadState(cwd);
    const result = await mutator(state, runtime);
    if (!result.error) await atomicWriteState(runtime.statePath, result.state);
    return result;
  });
}

function renderProjectWidgetText(state: ProjectState): string {
  const active = state.slices.filter((slice) => slice.status === "active").slice(0, 3);
  if (active.length === 0) return `${state.project.name}: no active slices`;
  const summary = active
    .map((slice) => `${slice.id}[${slice.current_knot ?? "-"}]`)
    .join(" · ");
  return `${state.project.name}: ${summary}`;
}

async function updateWidget(ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) return;
  const { runtime } = await loadState(ctx.cwd);
  if (!(await exists(runtime.statePath))) {
    ctx.ui.setWidget("project_tracker", undefined);
    return;
  }
  const { state } = await loadState(ctx.cwd);
  ctx.ui.setWidget("project_tracker", (_tui, _theme) => new Text(renderProjectWidgetText(state), 0, 0));
}

function formatDashboard(state: ProjectState): string {
  const groups: Array<[string, SliceStatus]> = [
    ["Active", "active"],
    ["Defined", "defined"],
    ["On Hold", "on_hold"],
    ["Complete", "complete"],
  ];

  const lines: string[] = [];
  lines.push(formatProjectStatus(state));
  for (const [label, status] of groups) {
    const slices = state.slices.filter((slice) => slice.status === status);
    if (slices.length === 0) continue;
    lines.push("");
    lines.push(`${label}:`);
    lines.push(formatSliceList(state, status));
  }
  if (state.milestones.length > 0) {
    lines.push("");
    lines.push("Milestones:");
    for (const milestone of state.milestones.slice(-5)) {
      lines.push(`- ${milestone.reached_at}: ${milestone.name} — ${milestone.description}`);
    }
  }
  return lines.join("\n");
}

async function showText(ctx: ExtensionCommandContext, title: string, text: string): Promise<void> {
  if (!ctx.hasUI) return;
  ctx.ui.notify(`${title}\n${text}`, "info");
}

async function promptForEvidence(ctx: ExtensionCommandContext, sliceId: string, knot: string): Promise<string | undefined> {
  if (!ctx.hasUI) return undefined;
  return ctx.ui.editor(`Evidence summary for ${sliceId} ${knot}`, "Validated criteria and sign-off basis:\n");
}

export async function buildProjectStrandContext(cwd: string): Promise<{ text: string; activeSliceId?: string } | undefined> {
  const { state, runtime } = await loadState(cwd);
  if (!(await exists(runtime.statePath)) && !(await exists(runtime.configPath))) return undefined;

  const knotSequence = runtime.knots.join(" → ");
  const active = state.slices.filter((slice) => slice.status === "active");
  const activeSliceId = active[0]?.id;
  const activeSummary = active.length > 0
    ? active.map((slice) => `${slice.id} → ${slice.current_knot ?? "no knot"} (${slice.active_knot ? slice.active_knot.criteria.filter((c) => c.verified).length : 0}/${slice.active_knot?.criteria.length ?? 0} criteria)`).join(" · ")
    : "none";

  const parts: string[] = [
    [
      `[pi-project-strand] ${state.project.name}`,
      `Knot sequence: ${knotSequence}`,
      `Active: ${activeSummary}`,
      `Next up: ${computeNext(state)}`,
    ].join("\n"),
  ];

  for (const slice of active.filter((s) => s.pending_fast_forward)) {
    const pff = slice.pending_fast_forward!;
    const squashed = [pff.from_knot, ...pff.squashed_knots];
    const knotFocusLines = squashed
      .map((name) => {
        const focus = (runtime.config.knots ?? []).find((k) => k.name === name)?.focus;
        return focus ? `  - ${name}: ${focus}` : `  - ${name}`;
      })
      .join("\n");
    parts.push(
      [
        `⚡ FAST-FORWARD PENDING — ${slice.id}`,
        `From: ${pff.from_knot} → Target: ${pff.target_knot}  |  Squashing: ${squashed.join(", ")}`,
        `User instructions: "${pff.user_instructions}"`,
        ``,
        `Squashed knot focus areas:`,
        knotFocusLines,
        ``,
        `REQUIRED BEFORE ACTING:`,
        `1. Load /skill:frs-strategy to get quality bars for each squashed knot.`,
        `2. Synthesize a single action plan covering every squashed knot's focus + quality bars + user instructions.`,
        `3. Present the plan to the user for approval — do NOT start work before approval.`,
        `4. Execute the approved plan. When done, call project_tracker action=knot:complete_fast_forward slice_id=${slice.id} evidence=<summary>.`,
      ].join("\n")
    );
  }

  return { text: parts.join("\n\n"), activeSliceId };
}

export default function (pi: ExtensionAPI) {
  for (const event of ["session_start", "session_switch", "session_fork", "session_tree"] as const) {
    pi.on(event, async (_event, ctx) => {
      await updateWidget(ctx);
    });
  }

  pi.registerTool({
    name: "project_tracker",
    label: "Project Tracker",
    description: "Persistent, project-scoped FRS/MVFoS tracking. Query and mutate slices, knots, criteria, plans, and milestones.",
    parameters: ProjectTrackerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let result: { text: string; state: ProjectState; error?: string };

      switch (params.action) {
        case "status": {
          const { state } = await loadState(ctx.cwd);
          result = handleStatus(state);
          break;
        }
        case "slice:list": {
          const { state } = await loadState(ctx.cwd);
          result = handleSliceList(state, params.status as SliceStatus | undefined);
          break;
        }
        case "slice:get": {
          const { state } = await loadState(ctx.cwd);
          result = handleSliceGet(state, params.slice_id);
          break;
        }
        case "knot:criteria": {
          const { state } = await loadState(ctx.cwd);
          result = handleKnotCriteria(state, params.slice_id);
          break;
        }
        case "next": {
          const { state } = await loadState(ctx.cwd);
          result = handleNext(state);
          break;
        }
        case "plan:list": {
          const { state } = await loadState(ctx.cwd);
          result = handlePlanList(state);
          break;
        }
        case "slice:create": {
          result = await mutateState(ctx.cwd, (state) =>
            handleSliceCreate(state, {
              id: params.id ?? "",
              name: params.name ?? "",
              description: params.description ?? "",
              type: (params.type as "vertical" | "horizontal") ?? "vertical",
              priority: params.priority,
            })
          );
          break;
        }
        case "slice:activate": {
          result = await mutateState(ctx.cwd, (state) => handleSliceActivate(state, params.slice_id));
          break;
        }
        case "slice:hold": {
          result = await mutateState(ctx.cwd, (state) => handleSliceHold(state, params.slice_id));
          break;
        }
        case "knot:start": {
          result = await mutateState(ctx.cwd, (state, runtime) =>
            handleKnotStart(state, { slice_id: params.slice_id, knot: params.knot ?? "", criteria: params.criteria ?? [] }, runtime.knots)
          );
          break;
        }
        case "knot:verify_criterion": {
          result = await mutateState(ctx.cwd, (state) =>
            handleVerifyCriterion(state, { slice_id: params.slice_id, index: params.index ?? -1, evidence: params.evidence ?? "" })
          );
          break;
        }
        case "knot:request_signoff": {
          const { state } = await loadState(ctx.cwd);
          result = handleKnotRequestSignoff(state, params.slice_id);
          break;
        }
        case "plan:link": {
          result = await mutateState(ctx.cwd, (state) =>
            handlePlanLink(state, { slice_id: params.slice_id, file_path: params.file_path ?? "" })
          );
          break;
        }
        case "plan:complete": {
          result = await mutateState(ctx.cwd, (state) => handlePlanComplete(state, params.slice_id));
          break;
        }
        case "milestone:add": {
          result = await mutateState(ctx.cwd, (state) =>
            handleMilestoneAdd(state, { name: params.name ?? "", description: params.description ?? "" })
          );
          break;
        }
        case "slice:annotate": {
          result = await mutateState(ctx.cwd, (state) =>
            handleSliceAnnotate(state, params.slice_id, params.notes ?? "", params.notes_mode ?? "set")
          );
          break;
        }
        case "knot:annotate": {
          result = await mutateState(ctx.cwd, (state) =>
            handleKnotAnnotate(state, params.slice_id, params.notes ?? "", params.notes_mode ?? "set")
          );
          break;
        }
        case "knot:complete_fast_forward": {
          result = await mutateState(ctx.cwd, (state) =>
            handleCompleteFastForward(state, params.slice_id ?? "", params.evidence ?? "")
          );
          break;
        }
        default: {
          const { state } = await loadState(ctx.cwd);
          result = { text: `Error: unknown action ${params.action}`, state, error: "unknown action" };
          break;
        }
      }

      await updateWidget(ctx);

      const details: ProjectTrackerDetails = {
        action: params.action,
        state: result.state,
        ...(result.error ? { error: result.error } : {}),
      };

      return {
        content: [{ type: "text", text: result.text }],
        details,
      };
    },
  });

  pi.registerCommand("project:status", {
    description: "Show compact project strand status",
    handler: async (_args, ctx) => {
      const { state } = await loadState(ctx.cwd);
      await showText(ctx, "Project status", formatProjectStatus(state));
    },
  });

  pi.registerCommand("project:dashboard", {
    description: "Show full project dashboard",
    handler: async (_args, ctx) => {
      const { state } = await loadState(ctx.cwd);
      await showText(ctx, "Project dashboard", formatDashboard(state));
    },
  });

  pi.registerCommand("project:slice", {
    description: "Show one slice in detail: /project:slice <slice-id>",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:slice <slice-id>", "warning");
        return;
      }
      const { state } = await loadState(ctx.cwd);
      const result = handleSliceGet(state, sliceId);
      await showText(ctx, `Slice ${sliceId}`, result.text);
    },
  });

  pi.registerCommand("project:next", {
    description: "Show the recommended next slice or knot step",
    handler: async (_args, ctx) => {
      const { state } = await loadState(ctx.cwd);
      await showText(ctx, "Next", computeNext(state));
    },
  });

  pi.registerCommand("project:plan", {
    description: "Show active plan link for a slice: /project:plan <slice-id>",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:plan <slice-id>", "warning");
        return;
      }
      const { state } = await loadState(ctx.cwd);
      const result = handleSliceGet(state, sliceId);
      await showText(ctx, `Plan ${sliceId}`, result.text);
    },
  });

  pi.registerCommand("project:knot:advance", {
    description: "User sign-off: advance a slice to its next knot",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:knot:advance <slice-id>", "warning");
        return;
      }

      const { state, runtime } = await loadState(ctx.cwd);
      const slice = state.slices.find((candidate) => candidate.id === sliceId);
      if (!slice) {
        ctx.ui.notify(`Unknown slice: ${sliceId}`, "warning");
        return;
      }
      if (!slice.active_knot) {
        ctx.ui.notify(`Slice ${sliceId} has no active knot`, "warning");
        return;
      }
      if (slice.active_knot.criteria.some((criterion) => !criterion.verified)) {
        ctx.ui.notify(`Slice ${sliceId} still has unverified criteria`, "warning");
        return;
      }

      const evidence = await promptForEvidence(ctx, sliceId, slice.active_knot.knot);
      if (!evidence) {
        ctx.ui.notify("Knot advancement cancelled", "info");
        return;
      }

      const result = await mutateState(ctx.cwd, (freshState) =>
        advanceKnotForSignoff(freshState, sliceId, runtime.knots, evidence)
      );
      await updateWidget(ctx);
      await showText(ctx, "Knot advanced", result.text);
    },
  });

  pi.registerCommand("project:knot:fast_forward", {
    description: "Initiate a fast-forward: squash knots into a single agent-executed plan",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:knot:fast_forward <slice-id>", "warning");
        return;
      }

      const { state, runtime } = await loadState(ctx.cwd);
      const slice = state.slices.find((s) => s.id === sliceId);
      if (!slice) {
        ctx.ui.notify(`Unknown slice: ${sliceId}`, "warning");
        return;
      }
      if (slice.status !== "active") {
        ctx.ui.notify(`Slice ${sliceId} is not active`, "warning");
        return;
      }
      if (!slice.current_knot) {
        ctx.ui.notify(`Slice ${sliceId} has no current knot`, "warning");
        return;
      }
      if (slice.pending_fast_forward) {
        ctx.ui.notify(`Slice ${sliceId} already has a pending fast-forward (${slice.pending_fast_forward.from_knot} → ${slice.pending_fast_forward.target_knot})`, "warning");
        return;
      }

      const currentIndex = runtime.knots.indexOf(slice.current_knot);
      if (currentIndex === -1 || currentIndex >= runtime.knots.length - 1) {
        ctx.ui.notify(`Slice ${sliceId} is already at the final knot (${slice.current_knot})`, "warning");
        return;
      }

      const availableTargets = runtime.knots.slice(currentIndex + 1);
      const focusMap = Object.fromEntries(
        (runtime.config.knots ?? []).map((k) => [k.name, k.focus ?? ""])
      );
      const targetLines = availableTargets
        .map((name) => `  ${name}${focusMap[name] ? ` — ${focusMap[name]}` : ""}`)
        .join("\n");

      const template = [
        `Fast-forward: ${sliceId} (currently at: ${slice.current_knot})`,
        ``,
        `Available target knots:`,
        targetLines,
        ``,
        `Target knot: `,
        ``,
        `Instructions — describe what must be accomplished for this fast-forward to succeed.`,
        `The agent will synthesize a full action plan from these instructions combined with`,
        `the quality bars of every knot being squashed, then present it for your approval.`,
        ``,
      ].join("\n");

      const filled = await ctx.ui.editor(`Fast-forward ${sliceId}`, template);
      if (!filled?.trim()) {
        ctx.ui.notify("Fast-forward cancelled", "info");
        return;
      }

      const targetMatch = filled.match(/^Target knot:\s*(.+)$/m);
      const targetKnot = targetMatch?.[1]?.trim();
      if (!targetKnot || !runtime.knots.includes(targetKnot)) {
        ctx.ui.notify(
          `Invalid target knot: "${targetKnot ?? ""}". Must be one of: ${availableTargets.join(", ")}`,
          "error"
        );
        return;
      }

      const instructionsSectionStart = filled.indexOf("Instructions —");
      const instructions =
        instructionsSectionStart === -1
          ? ""
          : filled
              .slice(instructionsSectionStart)
              .split("\n")
              .slice(4) // skip header line + 3 boilerplate description lines
              .join("\n")
              .trim();
      if (!instructions) {
        ctx.ui.notify("Instructions are required — describe what the agent must accomplish.", "warning");
        return;
      }

      const result = await mutateState(ctx.cwd, (freshState) =>
        handleInitFastForward(freshState, sliceId, targetKnot, instructions, runtime.knots)
      );
      await updateWidget(ctx);
      await showText(ctx, "Fast-forward initiated", result.text);
    },
  });
}
