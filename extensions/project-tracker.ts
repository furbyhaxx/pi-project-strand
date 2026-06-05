import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { dirname, join, resolve, basename } from "node:path";
import { mkdir, readFile, rename, writeFile, access } from "node:fs/promises";
import { parse } from "jsonc-parser";
import { Type, type Static } from "typebox";
import {
  DEFAULT_STRANDS,
  type ProjectConfig,
  type ProjectInfo,
  type ProjectState,
  type ProjectTrackerDetails,
  type SliceStatus,
  type SliceType,
  type StrandTemplate,
  type Target,
  type ResourceType,
  createInitialState,
  normalizeState,
  isoNow,
  computeNext,
  formatProjectStatus,
  formatSliceList,
  handleStatus,
  handleSliceList,
  handleSliceGet,
  handleNext,
  handleSliceCreate,
  handleSliceUpdate,
  handleSliceActivate,
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
} from "./project-tracker-core.js";
import { migrateLegacyState } from "./project-tracker-migrate.js";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import { runJudgeSession } from "./judge.js";
import {
  judgePreflight,
  resolveJudgeConfig,
  resolveJudgeModel,
  resolveJudgeTools,
  buildJudgeSystemPrompt,
  buildJudgeAuditPrompt,
} from "./judge-core.js";
import {
  fg,
  firstLine,
  outputLines,
  plural,
  renderFrameCall,
  renderFrameResult,
  semanticTruncate,
  textContent,
  type ToolRenderContextLike,
} from "./tui-render.js";
import {
  setProgressWidgetProjectState,
  updateProgressWidget,
} from "./progress-widget.js";

const DEFAULTS = { stateFile: ".pi/project/state.json" } as const;

type ProjectStrandConfig = ProjectConfig & { stateFile?: string };

const ResourceParam = Type.Object(
  {
    type: StringEnum(["doc", "url", "file", "report", "memory", "knowledge"] as const, { description: "Resource kind" }),
    ref: Type.String({ description: "Path, URL, knowledge id, or memory slug" }),
    title: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

const ProjectTrackerParams = Type.Object(
  {
    action: StringEnum(
      [
        "status",
        "slice:list",
        "slice:get",
        "next",
        "slice:create",
        "slice:update",
        "slice:activate",
        "slice:hold",
        "slice:sign_off",
        "knot:start",
        "knot:update",
        "knot:set_plan",
        "knot:sign_off",
        "knot:fast_forward",
        "knot:complete_fast_forward",
        "knot:judge",
        "verify_criterion",
        "annotate",
        "resource:add",
        "resource:remove",
        "milestone:add",
      ] as const,
      { description: "Project tracker action" }
    ),
    slice_id: Type.Optional(Type.String({ description: "Slice id" })),
    id: Type.Optional(Type.String({ description: "New slice id (slice:create)" })),
    name: Type.Optional(Type.String({ description: "Name for slice or milestone" })),
    description: Type.Optional(Type.String({ description: "Description for slice or milestone" })),
    type: Type.Optional(StringEnum(["vertical", "horizontal"] as const, { description: "Slice type" })),
    priority: Type.Optional(Type.Integer({ description: "Slice priority" })),
    status: Type.Optional(StringEnum(["defined", "active", "on_hold", "complete"] as const, { description: "Status filter (slice:list)" })),
    strand: Type.Optional(Type.String({ description: "Strand name to seed (slice:create); must exist in project.jsonc strands" })),
    goal: Type.Optional(Type.String({ description: "Slice goal (slice:create/update)" })),
    criteria: Type.Optional(Type.Array(Type.String(), { description: "Success criteria text (slice:create seeds slice-level; knot:start seeds knot-level)" })),
    goals: Type.Optional(Type.Array(Type.String(), { description: "Knot goals (knot:start/update)" })),
    title: Type.Optional(Type.String({ description: "Knot title (knot:update)" })),
    knot: Type.Optional(Type.String({ description: "Knot name (knot:start) or fast-forward target (knot:fast_forward)" })),
    target: Type.Optional(StringEnum(["slice", "knot"] as const, { description: "Whether verify_criterion/annotate/resource targets the slice or its active knot" })),
    index: Type.Optional(Type.Integer({ minimum: 0, description: "Criterion or resource index" })),
    evidence: Type.Optional(Type.String({ description: "Verification/sign-off evidence" })),
    message: Type.Optional(Type.String({ description: "Sign-off message (knot:sign_off, slice:sign_off)" })),
    file_path: Type.Optional(Type.String({ description: "Plan file path (knot:set_plan)" })),
    plan_status: Type.Optional(StringEnum(["linked", "complete"] as const, { description: "Plan status (knot:set_plan)" })),
    notes: Type.Optional(Type.String({ description: "Notes (annotate) or fast-forward instructions (knot:fast_forward)" })),
    notes_mode: Type.Optional(StringEnum(["set", "append"] as const, { description: "annotate: set (replace) or append" })),
    resource: Type.Optional(ResourceParam),
  },
  { additionalProperties: false }
);

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

async function loadProjectConfig(cwd: string): Promise<{ root: string; configPath: string; config: ProjectStrandConfig; strands: Record<string, StrandTemplate>; statePath: string; signoffWindowSeconds: number; judgeTimeoutSeconds: number }> {
  const root = await findProjectRoot(cwd);
  const configPath = join(root, ".pi", "project.jsonc");

  let config: ProjectStrandConfig = {};
  if (await exists(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    const parsed = parse(raw);
    if (parsed && typeof parsed === "object") config = parsed as ProjectStrandConfig;
  }

  const strands = config.strands && Object.keys(config.strands).length > 0 ? config.strands : DEFAULT_STRANDS;
  const merged: ProjectStrandConfig = {
    ...config,
    project: { name: config.project?.name, description: config.project?.description },
    strands,
    stateFile: config.stateFile?.trim() || DEFAULTS.stateFile,
  };

  const statePath = resolve(root, merged.stateFile!);
  const signoffWindowSeconds =
    typeof config.agent_signoff_window_seconds === "number" && config.agent_signoff_window_seconds > 0
      ? config.agent_signoff_window_seconds
      : 300;
  const judgeTimeoutSeconds =
    typeof config.judge_timeout_seconds === "number" && config.judge_timeout_seconds > 0
      ? config.judge_timeout_seconds
      : 600;
  return { root, configPath, config: merged, strands, statePath, signoffWindowSeconds, judgeTimeoutSeconds };
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

function trackerVerbAndTarget(args: Partial<ProjectTrackerInput> | undefined): { verb: string; target: string } {
  const action = args?.action ?? "status";
  switch (action) {
    case "status":
      return { verb: "Project", target: "status" };
    case "next":
      return { verb: "Project", target: "next" };
    case "slice:list":
      return { verb: "Project Slice", target: `list${args?.status ? ` · ${args.status}` : ""}` };
    case "slice:get":
      return { verb: "Project Slice", target: `get${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "slice:create":
      return { verb: "Project Slice", target: `create${args?.id ? ` · ${args.id}` : ""}${args?.strand ? ` · ${args.strand}` : ""}` };
    case "slice:update":
      return { verb: "Project Slice", target: `update${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "slice:activate":
      return { verb: "Project Slice", target: `activate${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "slice:hold":
      return { verb: "Project Slice", target: `hold${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "slice:sign_off":
      return { verb: "Project Slice", target: `sign-off${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "knot:start":
      return { verb: "Project Knot", target: `start${args?.slice_id ? ` · ${args.slice_id}` : ""}${args?.knot ? ` → ${args.knot}` : ""}` };
    case "knot:update":
      return { verb: "Project Knot", target: `update${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "knot:set_plan":
      return { verb: "Project Knot", target: `plan${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "knot:sign_off":
      return { verb: "Project Knot", target: `sign-off${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "knot:fast_forward":
      return { verb: "FastForward", target: `${args?.slice_id ?? "slice"}${args?.knot ? ` → ${args.knot}` : ""}` };
    case "knot:complete_fast_forward":
      return { verb: "FastForward", target: `complete${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "knot:judge":
      return { verb: "Judge", target: args?.slice_id ?? "slice" };
    case "verify_criterion":
      return { verb: "Criterion", target: `${args?.target ?? "knot"}${args?.slice_id ? ` · ${args.slice_id}` : ""}${args?.index !== undefined ? `[${args.index}]` : ""}` };
    case "annotate":
      return { verb: "Notes", target: `${args?.target ?? "slice"}${args?.slice_id ? ` · ${args.slice_id}` : ""}${args?.notes_mode ? ` · ${args.notes_mode}` : ""}` };
    case "resource:add":
      return { verb: "Resource", target: `add · ${args?.target ?? "slice"}${args?.slice_id ? ` · ${args.slice_id}` : ""}` };
    case "resource:remove":
      return { verb: "Resource", target: `remove · ${args?.target ?? "slice"}${args?.slice_id ? ` · ${args.slice_id}` : ""}${args?.index !== undefined ? `[${args.index}]` : ""}` };
    case "milestone:add":
      return { verb: "Milestone", target: `add${args?.name ? ` · "${semanticTruncate(args.name, 36)}"` : ""}` };
    default:
      return { verb: "Project", target: action };
  }
}

function criteriaProgressText(criteria: Array<{ met: boolean }>): string {
  return `${criteria.filter((c) => c.met).length}/${criteria.length}`;
}

function activeKnot(slice: ProjectState["slices"][number]) {
  return slice.strand.knots.find((k) => k.name === slice.strand.current_knot);
}

function sliceById(state: ProjectState, sliceId: string | undefined) {
  return sliceId ? state.slices.find((slice) => slice.id === sliceId) : undefined;
}

function knotIcon(status: string, theme: Parameters<typeof fg>[0]): string {
  switch (status) {
    case "signed_off":
      return fg(theme, "success", "✓");
    case "fast_forwarded":
      return fg(theme, "success", "»");
    case "active":
      return fg(theme, "success", "▶");
    default:
      return fg(theme, "dim", "○");
  }
}

function sliceIcon(status: SliceStatus, theme: Parameters<typeof fg>[0]): string {
  switch (status) {
    case "active":
      return fg(theme, "success", "▶");
    case "complete":
      return fg(theme, "success", "✓");
    case "on_hold":
      return fg(theme, "warning", "‖");
    default:
      return fg(theme, "dim", "○");
  }
}

function criterionLine(theme: Parameters<typeof fg>[0], criterion: { text: string; met: boolean; evidence?: string }, index: number): string {
  const icon = criterion.met ? fg(theme, "success", "✓") : fg(theme, "dim", "○");
  const evidence = criterion.evidence ? fg(theme, "muted", ` — ${criterion.evidence}`) : "";
  return `${icon} ${fg(theme, "accent", `[${index}]`)} ${fg(theme, "toolOutput", criterion.text)}${evidence}`;
}

function sliceLine(theme: Parameters<typeof fg>[0], slice: ProjectState["slices"][number]): string {
  const knot = activeKnot(slice);
  const knotText = knot ? `${knot.name} ${criteriaProgressText(knot.success_criteria)}` : slice.strand.current_knot ?? "no active knot";
  return `${sliceIcon(slice.status, theme)} ${fg(theme, "accent", `[${slice.priority}] ${slice.id}`)} ${fg(theme, "muted", `${slice.strand.name} · ${slice.status} · ${knotText}`)}`;
}

function projectStatusBody(theme: Parameters<typeof fg>[0], state: ProjectState): string[] {
  const active = state.slices.filter((slice) => slice.status === "active");
  if (active.length === 0) return [];
  return active.map((slice) => sliceLine(theme, slice));
}

function sliceDetailBody(theme: Parameters<typeof fg>[0], slice: ProjectState["slices"][number]): string[] {
  const lines: string[] = [];
  lines.push(`${fg(theme, "muted", "goal:")} ${fg(theme, "toolOutput", slice.goal)}`);
  if (slice.success_criteria.length > 0) {
    lines.push(fg(theme, "muted", `criteria (${criteriaProgressText(slice.success_criteria)}):`));
    slice.success_criteria.forEach((criterion, index) => lines.push(criterionLine(theme, criterion, index)));
  }
  if (slice.resources.length > 0) {
    lines.push(fg(theme, "muted", "resources:"));
    slice.resources.forEach((resource, index) => lines.push(`${fg(theme, "accent", `[${index}]`)} ${fg(theme, "toolOutput", `${resource.type}:${resource.ref}`)}`));
  }
  lines.push(fg(theme, "muted", "knots:"));
  for (const knot of slice.strand.knots) {
    const progress = knot.success_criteria.length ? ` ${criteriaProgressText(knot.success_criteria)}` : "";
    lines.push(`${knotIcon(knot.status, theme)} ${fg(theme, "accent", knot.name)} ${fg(theme, "muted", `[${knot.status}]${progress}`)} ${fg(theme, "toolOutput", semanticTruncate(knot.focus, 96))}`);
  }
  return lines;
}

function signedOffKnotFromText(text: string): string | undefined {
  return text.match(/(?:sign-off|Signed off|APPROVED|REJECTED)\s+[^→]+→\s+([^\.:]+)[\.:]/)?.[1]?.trim();
}

function nextFromText(text: string): string | undefined {
  return text.match(/Next pending knot:\s*([^\.]+)\./)?.[1]?.trim();
}

function squashedFromText(text: string): string | undefined {
  return text.match(/squashing:?\s*([^\)\.]+)/i)?.[1]?.trim();
}

function renderProjectTrackerResult(
  result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
  theme: Parameters<typeof fg>[0],
  context: ToolRenderContextLike | undefined
) {
  const details = result.details as ProjectTrackerDetails | undefined;
  const text = textContent(result);
  const line = firstLine(text);
  const args = (context as { args?: Partial<ProjectTrackerInput> } | undefined)?.args;

  if (!details) {
    return renderFrameResult(theme, context, fg(theme, "muted", line || "Done"), outputLines(theme, text).slice(1), { cap: 12 });
  }

  if (details.error) {
    return renderFrameResult(theme, context, fg(theme, "error", `Error: ${details.error}`), outputLines(theme, text).slice(1), { status: "error", cap: 10 });
  }

  const state = details.state;
  switch (details.action) {
    case "status": {
      const counts = {
        active: state.slices.filter((s) => s.status === "active").length,
        defined: state.slices.filter((s) => s.status === "defined").length,
        onHold: state.slices.filter((s) => s.status === "on_hold").length,
        complete: state.slices.filter((s) => s.status === "complete").length,
      };
      const summary = `${state.project.name} · ${counts.active} active · ${counts.defined} defined · ${counts.onHold} on hold · ${counts.complete} complete`;
      return renderFrameResult(theme, context, fg(theme, "muted", summary), projectStatusBody(theme, state), { cap: 12 });
    }
    case "slice:list": {
      const slices = args?.status ? state.slices.filter((s) => s.status === args.status) : state.slices;
      const summary = `Listed ${plural(slices.length, args?.status ? `${args.status} slice` : "slice")}`;
      return renderFrameResult(theme, context, fg(theme, "muted", summary), slices.map((slice) => sliceLine(theme, slice)), { cap: 15 });
    }
    case "slice:get": {
      const slice = sliceById(state, args?.slice_id);
      if (!slice) return renderFrameResult(theme, context, fg(theme, "muted", line || "Slice not found"));
      const knot = activeKnot(slice);
      const summary = `${slice.id} · ${slice.status} · ${slice.strand.name}${knot ? ` · ${knot.name} ${criteriaProgressText(knot.success_criteria)}` : ""}`;
      return renderFrameResult(theme, context, fg(theme, "muted", summary), sliceDetailBody(theme, slice), { cap: 16 });
    }
    case "next":
      return renderFrameResult(theme, context, fg(theme, "muted", `Next: ${line}`));
    case "slice:create": {
      const slice = sliceById(state, args?.id);
      const summary = slice ? `Created ${slice.id} · ${slice.strand.name} · ${slice.status}` : line;
      const body = slice ? [
        `${fg(theme, "muted", "goal:")} ${fg(theme, "toolOutput", slice.goal)}`,
        `${fg(theme, "muted", "criteria:")} ${fg(theme, "toolOutput", String(slice.success_criteria.length))}`,
        `${fg(theme, "muted", "knots:")} ${fg(theme, "toolOutput", slice.strand.knots.map((k) => k.name).join(" → "))}`,
      ] : [];
      return renderFrameResult(theme, context, fg(theme, "muted", summary), body, { cap: 8 });
    }
    case "slice:update": {
      const changed = ["name", "description", "goal", "criteria", "priority", "type"].filter((key) => (args as Record<string, unknown> | undefined)?.[key] !== undefined);
      return renderFrameResult(theme, context, fg(theme, "muted", line || `Updated ${args?.slice_id ?? "slice"}`), changed.length ? [fg(theme, "muted", `changed: ${changed.join(", ")}`)] : [], { cap: 4 });
    }
    case "slice:activate":
    case "slice:hold":
      return renderFrameResult(theme, context, fg(theme, "muted", line || "Updated slice"));
    case "slice:sign_off": {
      const body = args?.evidence ? [fg(theme, "muted", `evidence: ${semanticTruncate(args.evidence, 120)}`)] : [];
      return renderFrameResult(theme, context, fg(theme, "muted", line || `Completed ${args?.slice_id ?? "slice"}`), body, { cap: 4 });
    }
    case "knot:start": {
      const slice = sliceById(state, args?.slice_id);
      const knot = slice?.strand.knots.find((candidate) => candidate.name === args?.knot);
      const summary = knot ? `Started ${knot.name} · ${criteriaProgressText(knot.success_criteria)} criteria` : line;
      const body = [
        ...(knot?.plan ? [fg(theme, "toolOutput", knot.plan.path)] : text.match(/Preferred plan path:\s*(.+)$/m)?.[1] ? [fg(theme, "toolOutput", text.match(/Preferred plan path:\s*(.+)$/m)![1]!)] : []),
        ...(knot?.success_criteria.map((criterion, index) => criterionLine(theme, criterion, index)) ?? []),
      ];
      return renderFrameResult(theme, context, fg(theme, "muted", summary), body, { cap: 12 });
    }
    case "knot:update": {
      const parts = [args?.goals ? `goals=${args.goals.length}` : "", args?.title !== undefined ? "title set" : ""].filter(Boolean);
      return renderFrameResult(theme, context, fg(theme, "muted", `${line || "Updated knot"}${parts.length ? ` · ${parts.join(" · ")}` : ""}`));
    }
    case "knot:set_plan": {
      const path = text.match(/:\s*(.+)$/)?.[1] ?? args?.file_path;
      const summary = `Plan ${args?.plan_status ?? "linked"}${path ? ` · ${path}` : ""}`;
      return renderFrameResult(theme, context, fg(theme, "muted", summary));
    }
    case "knot:sign_off": {
      if (line.startsWith("ARMED")) {
        const slice = sliceById(state, args?.slice_id);
        const knot = slice ? activeKnot(slice) : undefined;
        const textLines = text.split("\n");
        const body = [fg(theme, "toolOutput", textLines[textLines.length - 1] ?? "Call again with evidence to confirm."), ...(knot?.success_criteria.map((criterion, index) => criterionLine(theme, criterion, index)) ?? [])];
        return renderFrameResult(theme, context, fg(theme, "warning", `Armed ${knot?.name ?? "knot"} for agent sign-off · not advanced`), body, { status: "warning", cap: 12 });
      }
      const knotName = signedOffKnotFromText(line);
      const next = nextFromText(line);
      const summary = `Signed off ${knotName ?? "knot"}${next ? ` · next: ${next}` : ""}`;
      const body = args?.evidence ? [fg(theme, "muted", `evidence: ${semanticTruncate(args.evidence, 120)}`)] : [];
      return renderFrameResult(theme, context, fg(theme, "muted", summary), body, { cap: 4 });
    }
    case "knot:fast_forward": {
      const squashed = squashedFromText(line);
      const body = [args?.notes ? fg(theme, "toolOutput", `User instructions: ${semanticTruncate(args.notes, 140)}`) : "", fg(theme, "muted", "Complete with knot:complete_fast_forward")].filter(Boolean);
      return renderFrameResult(theme, context, fg(theme, "warning", `Fast-forward pending${squashed ? ` · squashing ${squashed}` : ""}`), body, { status: "warning", cap: 6 });
    }
    case "knot:complete_fast_forward": {
      const target = text.match(/\.\s*([^\.]+) is pending/)?.[1];
      const squashed = text.match(/squashed\s+([^\.]+)\./)?.[1];
      const body = squashed ? squashed.split(", ").map((name) => `${fg(theme, "success", "»")} ${fg(theme, "toolOutput", name)}`) : [];
      return renderFrameResult(theme, context, fg(theme, "muted", `Fast-forward complete${target ? ` · ${target} pending` : ""}`), body, { cap: 10 });
    }
    case "knot:judge": {
      if (line.startsWith("Judge REJECTED")) {
        const unmet = text.match(/unmet:\s*(.+)$/)?.[1]?.split("; ") ?? [];
        const body = [fg(theme, "toolOutput", line.replace(/^Judge REJECTED [^:]+:\s*/, "Reason: ")), ...unmet.map((item) => `${fg(theme, "dim", "○")} ${fg(theme, "toolOutput", `Missing: ${item}`)}`)];
        return renderFrameResult(theme, context, fg(theme, "warning", `Rejected ${signedOffKnotFromText(line) ?? "active knot"}${unmet.length ? ` · ${plural(unmet.length, "unmet criterion", "unmet criteria")}` : ""}`), body, { status: "warning", cap: 10 });
      }
      if (line.startsWith("Judge APPROVED")) {
        const next = nextFromText(line);
        return renderFrameResult(theme, context, fg(theme, "muted", `Approved ${signedOffKnotFromText(line) ?? "active knot"}${next ? ` · next: ${next}` : ""}`), [fg(theme, "success", "✓ All unmet criteria marked judge-verified")], { cap: 5 });
      }
      return renderFrameResult(theme, context, fg(theme, "muted", line || "Judge complete"), outputLines(theme, text).slice(1), { cap: 8 });
    }
    case "verify_criterion":
      return renderFrameResult(theme, context, fg(theme, "muted", line || `Verified ${args?.target ?? "knot"} criterion`), args?.evidence ? [fg(theme, "muted", `evidence: ${semanticTruncate(args.evidence, 120)}`)] : [], { cap: 4 });
    case "annotate":
      return renderFrameResult(theme, context, fg(theme, "muted", line || `Updated ${args?.target ?? "slice"} notes`));
    case "resource:add":
      return renderFrameResult(theme, context, fg(theme, "muted", line || "Added resource"), args?.resource?.ref ? [fg(theme, "toolOutput", args.resource.ref)] : [], { cap: 4 });
    case "resource:remove":
      return renderFrameResult(theme, context, fg(theme, "muted", line || "Removed resource"));
    case "milestone:add":
      return renderFrameResult(theme, context, fg(theme, "muted", "Added milestone"), args?.name ? [fg(theme, "toolOutput", args.name)] : [], { cap: 4 });
    default:
      return renderFrameResult(theme, context, fg(theme, "muted", line || "Done"), outputLines(theme, text).slice(1), { cap: 12 });
  }
}

async function updateWidget(ctx: ExtensionContext): Promise<void> {
  const { runtime } = await loadState(ctx.cwd);
  if (!(await exists(runtime.statePath))) {
    setProgressWidgetProjectState(null);
    updateProgressWidget(ctx);
    return;
  }
  const { state } = await loadState(ctx.cwd);
  setProgressWidgetProjectState(state);
  updateProgressWidget(ctx);
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

async function promptForEvidence(ctx: ExtensionCommandContext, label: string): Promise<string | undefined> {
  if (!ctx.hasUI) return undefined;
  return ctx.ui.editor(label, "Validated criteria and sign-off basis:\n");
}

export async function buildProjectStrandContext(cwd: string): Promise<{ text: string; activeSliceId?: string } | undefined> {
  const { state, runtime } = await loadState(cwd);
  if (!(await exists(runtime.statePath)) && !(await exists(runtime.configPath))) return undefined;

  const active = state.slices.filter((s) => s.status === "active");
  const activeSliceId = active[0]?.id;
  const summary = active.length > 0
    ? active
        .map((s) => {
          const knot = s.strand.knots.find((k) => k.name === s.strand.current_knot);
          const prog = knot ? `${knot.success_criteria.filter((c) => c.met).length}/${knot.success_criteria.length}` : "0/0";
          return `${s.id} (${s.strand.name}) → ${s.strand.current_knot ?? "no knot"} (${prog} criteria)`;
        })
        .join(" · ")
    : "none";

  const parts: string[] = [
    [
      `[pi-project-strand] ${state.project.name}`,
      `Active: ${summary}`,
      `Next up: ${computeNext(state)}`,
    ].join("\n"),
  ];

  for (const slice of active) {
    const knot = slice.strand.knots.find((k) => k.name === slice.strand.current_knot);
    if (!knot) continue;
    if (knot.advance_by.includes("agent")) {
      const arm = knot.signoff_arm
        ? ` ARMED at ${knot.signoff_arm.armed_at}; confirm with project_tracker action=knot:sign_off slice_id=${slice.id} evidence=<summary> within ${runtime.signoffWindowSeconds}s, or it re-arms.`
        : ` Protocol: verify all criteria, then project_tracker action=knot:sign_off slice_id=${slice.id} (arms + returns the checklist) → repeat with evidence within ${runtime.signoffWindowSeconds}s to confirm.`;
      parts.push(`${slice.id} → ${knot.name}: agent self-advance ALLOWED (advance_by=[${knot.advance_by.join(", ")}]).${arm}`);
    } else if (knot.advance_by.includes("judge")) {
      const last = knot.last_verdict && !knot.last_verdict.approved ? ` Last judge verdict: REJECTED — ${knot.last_verdict.reasons}` : "";
      parts.push(`${slice.id} → ${knot.name}: advance via the judge — project_tracker action=knot:judge slice_id=${slice.id} (or /project:knot:advance to override).${last}`);
    } else {
      parts.push(`${slice.id} → ${knot.name}: agent self-advance NOT allowed (advance_by=[${knot.advance_by.join(", ")}]). Advance via /project:knot:advance ${slice.id}.`);
    }
  }

  for (const slice of active.filter((s) => s.strand.pending_fast_forward)) {
    const pff = slice.strand.pending_fast_forward!;
    const fromName = slice.strand.current_knot ?? slice.strand.knots.find((k) => k.status === "pending")?.name ?? "?";
    const fromIndex = slice.strand.knots.findIndex((k) => k.name === fromName);
    const targetIndex = slice.strand.knots.findIndex((k) => k.name === pff.target_knot);
    const squashed = slice.strand.knots.slice(Math.max(fromIndex, 0), targetIndex);
    const focusLines = squashed.map((k) => `  - ${k.name}: ${k.focus}`).join("\n");
    parts.push(
      [
        `⚡ FAST-FORWARD PENDING — ${slice.id}`,
        `Target: ${pff.target_knot}  |  Squashing: ${squashed.map((k) => k.name).join(", ")}`,
        `User instructions: "${pff.user_instructions}"`,
        ``,
        `Squashed knot focus areas:`,
        focusLines,
        ``,
        `REQUIRED BEFORE ACTING:`,
        `1. Load /skill:frs-strategy for the quality bars of each squashed knot.`,
        `2. Synthesize one action plan covering every squashed knot's focus + quality bars + the user instructions.`,
        `3. Present the plan for approval — do NOT start before approval.`,
        `4. Execute, then call project_tracker action=knot:complete_fast_forward slice_id=${slice.id} evidence=<summary>.`,
      ].join("\n")
    );
  }

  return { text: parts.join("\n\n"), activeSliceId };
}

/** A state file is legacy if any slice predates the strand model (no `strand` field). */
function isLegacyState(parsed: any): boolean {
  if (!parsed || !Array.isArray(parsed.slices)) return false;
  return parsed.slices.some((s: any) => s && typeof s === "object" && s.strand === undefined);
}

const MIGRATE_PASS2_MESSAGE = [
  `<pi-project-strand-command name="/project:migrate">`,
  `Pass-1 mechanical migration of state.json is complete (a .bak backup was written). Now run the interactive Pass-2 backfill.`,
  ``,
  `The legacy format lacked fields the new model needs. Work through the slices ONE AT A TIME. CLARIFY WITH THE USER whenever a value cannot be confidently derived — never fabricate or silently leave important fields empty.`,
  ``,
  `For each slice:`,
  `1. Read it: project_tracker action=slice:get slice_id=<id>. Gather evidence from each knot's validation_evidence_summary, linked plan files, project_knowledge entries for the slice, PROJECT.md/VISION.md, and \`git log\`.`,
  `2. Goal + success criteria: propose a concise slice \`goal\` and slice-level \`success_criteria\` ("what done means"). Confirm with the user, then apply: project_tracker action=slice:update slice_id=<id> goal=<...> criteria=[...].`,
  `3. Active knot (if any): propose \`goals\` for the in-progress knot and apply project_tracker action=knot:update slice_id=<id> goals=[...]. Its success_criteria carried over from the legacy criteria — verify they still read correctly.`,
  `4. Resources: attach relevant pointers (knowledge ids, plan paths, reports) via project_tracker action=resource:add.`,
  `5. Historical signed-off / fast-forwarded knots keep their validation_evidence_summary; per-criterion detail is NOT reconstructed — tell the user this.`,
  `6. Optional tidy-up: if .pi/project.jsonc still has a stale top-level \`knots\` array, offer to remove it; optionally formalize the migrated sequence as a named strand via /project:new:strand.`,
  ``,
  `When all slices are done, summarize what you reconstructed and every point you asked the user about.`,
  `</pi-project-strand-command>`,
].join("\n");

async function runKnotJudge(ctx: ExtensionContext, sliceId: string): Promise<{ text: string; error?: string }> {
  const { state, runtime } = await loadState(ctx.cwd);
  const slice = state.slices.find((s) => s.id === sliceId);
  if (!slice) return { text: `Unknown slice: ${sliceId}`, error: "unknown slice" };

  const pre = judgePreflight(slice);
  if (!pre.ok) return { text: `Error: ${pre.error}`, error: "preflight" };
  const knot = pre.knot;

  const strandJudge = runtime.config.strands?.[slice.strand.name]?.judge ?? null;
  const cfg = resolveJudgeConfig(knot.judge, strandJudge, runtime.config.judge ?? null);
  const sessionModelId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
  const resolution = resolveJudgeModel(cfg, sessionModelId);

  let model = ctx.model;
  let thinkingLevel = (ctx.thinkingLevel ?? "off") as ThinkingLevel;
  let modelSpec: string;
  if (resolution.fromSession) {
    if (!model) return { text: "Error: no judge model configured and no active session model to fall back to.", error: "no model" };
    modelSpec = `${model.provider}/${model.id} (session fallback)`;
  } else {
    const resolved = ctx.modelRegistry.find(resolution.provider, resolution.model);
    if (!resolved) return { text: `Error: judge model "${resolution.spec}" not found in the model registry.`, error: "model not found" };
    model = resolved;
    thinkingLevel = (resolution.thinking ?? thinkingLevel ?? "off") as ThinkingLevel;
    modelSpec = resolution.spec;
  }

  const run = await runJudgeSession({
    cwd: ctx.cwd,
    model,
    thinkingLevel,
    tools: resolveJudgeTools(cfg),
    systemPrompt: buildJudgeSystemPrompt(),
    auditPrompt: buildJudgeAuditPrompt(state.project as ProjectInfo, slice, knot),
    timeoutMs: runtime.judgeTimeoutSeconds * 1000,
  });

  if (!run.verdict) return { text: `Judge inconclusive for ${sliceId} → ${knot.name}: ${run.error}`, error: run.error ?? "inconclusive" };

  const applied = await mutateState(ctx.cwd, (s) =>
    applyJudgeVerdict(s, sliceId, { ...run.verdict!, model: modelSpec, at: isoNow() })
  );
  return { text: applied.text, error: applied.error };
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
    description: "Persistent, project-scoped FRS tracking. Use this for durable project state across sessions: slices, knots, success criteria, linked plan files, resources, milestones, and advancement/sign-off. Do not use it for the short-lived task checklist of the current implementation pass — that belongs in plan_tracker.",
    promptSnippet: "Track persistent project progress across slices, knots, criteria, linked plans, and milestones.",
    promptGuidelines: [
      "Use project_tracker for persistent project state across sessions: slices, knots, criteria, plan links, resources, milestones, and advancement/sign-off.",
      "Use plan_tracker only for the ad-hoc execution checklist currently being worked in this session; do not use it as a substitute for project_tracker lifecycle state.",
    ],
    parameters: ProjectTrackerParams,
    renderShell: "self",
    async execute(_toolCallId, params: ProjectTrackerInput, _signal, _onUpdate, ctx) {
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
        case "next": {
          const { state } = await loadState(ctx.cwd);
          result = handleNext(state);
          break;
        }
        case "slice:create": {
          result = await mutateState(ctx.cwd, (state, runtime) => {
            const strandName = params.strand ?? "";
            const template = runtime.strands[strandName];
            if (!template) {
              return { text: `Error: unknown strand "${strandName}". Available: ${Object.keys(runtime.strands).join(", ")}`, state, error: "unknown strand" };
            }
            return handleSliceCreate(
              state,
              {
                id: params.id ?? "",
                name: params.name ?? "",
                description: params.description ?? "",
                type: (params.type as SliceType) ?? "vertical",
                priority: params.priority,
                goal: params.goal ?? "",
                criteria: params.criteria ?? [],
                strand: strandName,
              },
              template
            );
          });
          break;
        }
        case "slice:update": {
          result = await mutateState(ctx.cwd, (state) =>
            handleSliceUpdate(state, params.slice_id, {
              name: params.name,
              description: params.description,
              goal: params.goal,
              priority: params.priority,
              type: params.type as SliceType | undefined,
              criteria: params.criteria,
            })
          );
          break;
        }
        case "slice:activate": {
          result = await mutateState(ctx.cwd, (s) => handleSliceActivate(s, params.slice_id));
          break;
        }
        case "slice:hold": {
          result = await mutateState(ctx.cwd, (s) => handleSliceHold(s, params.slice_id));
          break;
        }
        case "slice:sign_off": {
          result = await mutateState(ctx.cwd, (s) => handleSliceSignOff(s, params.slice_id ?? "", params.message ?? "", params.evidence ?? ""));
          break;
        }
        case "knot:start": {
          result = await mutateState(ctx.cwd, (s) =>
            handleKnotStart(s, { slice_id: params.slice_id, knot: params.knot ?? "", goals: params.goals ?? [], criteria: params.criteria ?? [] })
          );
          break;
        }
        case "knot:update": {
          result = await mutateState(ctx.cwd, (s) => handleKnotUpdate(s, params.slice_id, { goals: params.goals, title: params.title }));
          break;
        }
        case "knot:set_plan": {
          result = await mutateState(ctx.cwd, (s) => handleKnotSetPlan(s, params.slice_id, params.file_path, params.plan_status ?? "linked"));
          break;
        }
        case "knot:sign_off": {
          result = await mutateState(ctx.cwd, (s, runtime) =>
            handleAgentSignOff(s, params.slice_id ?? "", params.message ?? "", params.evidence ?? "", isoNow(), runtime.signoffWindowSeconds)
          );
          break;
        }
        case "knot:fast_forward": {
          result = await mutateState(ctx.cwd, (s) => handleKnotFastForward(s, params.slice_id ?? "", params.knot ?? "", params.notes ?? ""));
          break;
        }
        case "knot:complete_fast_forward": {
          result = await mutateState(ctx.cwd, (s) => handleCompleteFastForward(s, params.slice_id ?? "", params.evidence ?? ""));
          break;
        }
        case "knot:judge": {
          const r = await runKnotJudge(ctx, params.slice_id ?? "");
          const { state } = await loadState(ctx.cwd);
          result = { text: r.text, state, ...(r.error ? { error: r.error } : {}) };
          break;
        }
        case "verify_criterion": {
          result = await mutateState(ctx.cwd, (s) => handleVerifyCriterion(s, params.slice_id, (params.target ?? "knot") as Target, params.index ?? -1, params.evidence ?? ""));
          break;
        }
        case "annotate": {
          result = await mutateState(ctx.cwd, (s) => handleAnnotate(s, params.slice_id, (params.target ?? "slice") as Target, params.notes ?? "", params.notes_mode ?? "set"));
          break;
        }
        case "resource:add": {
          result = await mutateState(ctx.cwd, (s) =>
            handleResourceAdd(s, params.slice_id, (params.target ?? "slice") as Target, {
              type: (params.resource?.type ?? "doc") as ResourceType,
              ref: params.resource?.ref ?? "",
              title: params.resource?.title,
              note: params.resource?.note,
            })
          );
          break;
        }
        case "resource:remove": {
          result = await mutateState(ctx.cwd, (s) => handleResourceRemove(s, params.slice_id, (params.target ?? "slice") as Target, params.index ?? -1));
          break;
        }
        case "milestone:add": {
          result = await mutateState(ctx.cwd, (s) => handleMilestoneAdd(s, { name: params.name ?? "", description: params.description ?? "" }));
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

    renderCall(args, theme, context) {
      const { verb, target } = trackerVerbAndTarget(args as Partial<ProjectTrackerInput> | undefined);
      return renderFrameCall(theme, context as ToolRenderContextLike, verb, target);
    },

    renderResult(result, _options, theme, context) {
      return renderProjectTrackerResult(result, theme, context as ToolRenderContextLike);
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
    description: "Show a slice's knots and linked plans: /project:plan <slice-id>",
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
    description: "User sign-off: advance a slice's active knot to signed_off",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:knot:advance <slice-id>", "warning");
        return;
      }

      const { state } = await loadState(ctx.cwd);
      const slice = state.slices.find((candidate) => candidate.id === sliceId);
      if (!slice) {
        ctx.ui.notify(`Unknown slice: ${sliceId}`, "warning");
        return;
      }
      if (!slice.strand.current_knot) {
        ctx.ui.notify(`Slice ${sliceId} has no active knot`, "warning");
        return;
      }
      const activeKnot = slice.strand.knots.find((k) => k.name === slice.strand.current_knot)!;
      if (activeKnot.success_criteria.some((c) => !c.met)) {
        ctx.ui.notify(`Slice ${sliceId} still has unmet criteria`, "warning");
        return;
      }

      const evidence = await promptForEvidence(ctx, `Evidence summary for ${sliceId} ${activeKnot.name}`);
      if (!evidence) {
        ctx.ui.notify("Knot advancement cancelled", "info");
        return;
      }

      const result = await mutateState(ctx.cwd, (fresh) => handleKnotSignOff(fresh, sliceId, "Signed off via /project:knot:advance", evidence));
      await updateWidget(ctx);
      await showText(ctx, "Knot advanced", result.text);
    },
  });

  pi.registerCommand("project:slice:advance", {
    description: "User sign-off: finalize a slice once all its knots are signed off",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:slice:advance <slice-id>", "warning");
        return;
      }
      const evidence = await promptForEvidence(ctx, `Final validation evidence for ${sliceId}`);
      if (!evidence) {
        ctx.ui.notify("Slice sign-off cancelled", "info");
        return;
      }
      const result = await mutateState(ctx.cwd, (fresh) => handleSliceSignOff(fresh, sliceId, "Signed off via /project:slice:advance", evidence));
      await updateWidget(ctx);
      await showText(ctx, "Slice sign-off", result.text);
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

      const { state } = await loadState(ctx.cwd);
      const slice = state.slices.find((s) => s.id === sliceId);
      if (!slice) {
        ctx.ui.notify(`Unknown slice: ${sliceId}`, "warning");
        return;
      }
      if (slice.status !== "active") {
        ctx.ui.notify(`Slice ${sliceId} is not active`, "warning");
        return;
      }
      if (slice.strand.pending_fast_forward) {
        ctx.ui.notify(`Slice ${sliceId} already has a pending fast-forward (→ ${slice.strand.pending_fast_forward.target_knot})`, "warning");
        return;
      }

      const knotNames = slice.strand.knots.map((k) => k.name);
      const fromName = slice.strand.current_knot ?? slice.strand.knots.find((k) => k.status === "pending")?.name;
      const fromIndex = fromName ? knotNames.indexOf(fromName) : -1;
      if (fromIndex === -1 || fromIndex >= knotNames.length - 1) {
        ctx.ui.notify(`Slice ${sliceId} cannot fast-forward (no later knot)`, "warning");
        return;
      }

      const availableTargets = knotNames.slice(fromIndex + 1);
      const focusMap = Object.fromEntries(slice.strand.knots.map((k) => [k.name, k.focus]));
      const targetLines = availableTargets.map((name) => `  ${name}${focusMap[name] ? ` — ${focusMap[name]}` : ""}`).join("\n");

      const template = [
        `Fast-forward: ${sliceId} (from: ${fromName})`,
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
      if (!targetKnot || !availableTargets.includes(targetKnot)) {
        ctx.ui.notify(`Invalid target knot: "${targetKnot ?? ""}". Must be one of: ${availableTargets.join(", ")}`, "error");
        return;
      }

      const instructionsSectionStart = filled.indexOf("Instructions —");
      const instructions =
        instructionsSectionStart === -1
          ? ""
          : filled
              .slice(instructionsSectionStart)
              .split("\n")
              .slice(4)
              .join("\n")
              .trim();
      if (!instructions) {
        ctx.ui.notify("Instructions are required — describe what the agent must accomplish.", "warning");
        return;
      }

      const result = await mutateState(ctx.cwd, (fresh) => handleKnotFastForward(fresh, sliceId, targetKnot, instructions));
      await updateWidget(ctx);
      await showText(ctx, "Fast-forward initiated", result.text);
    },
  });

  pi.registerCommand("project:knot:judge", {
    description: "Run the judge to audit a slice's active knot and advance it if approved",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) {
        ctx.ui.notify("Usage: /project:knot:judge <slice-id>", "warning");
        return;
      }
      ctx.ui.notify(`Running judge for ${sliceId}… (spawns an auditor session)`, "info");
      const r = await runKnotJudge(ctx, sliceId);
      await updateWidget(ctx);
      await showText(ctx, "Judge", r.text);
    },
  });

  pi.registerCommand("project:migrate", {
    description: "Migrate legacy project state to the strand model (Pass-1 mechanical + interactive Pass-2 backfill)",
    handler: async (_args, ctx) => {
      const runtime = await loadProjectConfig(ctx.cwd);
      if (!(await exists(runtime.statePath))) {
        ctx.ui.notify("No state.json found — nothing to migrate.", "info");
        return;
      }
      const raw = await readFile(runtime.statePath, "utf-8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.ui.notify("state.json is not valid JSON — aborting migration.", "error");
        return;
      }
      if (!isLegacyState(parsed)) {
        ctx.ui.notify("state.json already uses the strand model — nothing to migrate.", "info");
        return;
      }

      // Prefer the project's OLD knot sequence (if project.jsonc still has a flat `knots` array)
      // so legacy knot names map exactly; otherwise fall back to the granular default.
      let template = runtime.strands.granular ?? DEFAULT_STRANDS.granular;
      let strandName = "granular";
      if (await exists(runtime.configPath)) {
        const cfg = parse(await readFile(runtime.configPath, "utf-8")) as { knots?: Array<{ name: string; focus?: string }> } | undefined;
        if (cfg?.knots && cfg.knots.length > 0) {
          template = { description: "Migrated from the legacy knot sequence", knots: cfg.knots.map((k) => ({ name: k.name, focus: k.focus ?? "" })) };
          strandName = "legacy";
        }
      }

      await writeFile(`${runtime.statePath}.bak`, raw, "utf-8");
      const migrated = migrateLegacyState(parsed, template, strandName);
      await atomicWriteState(runtime.statePath, migrated);
      await updateWidget(ctx);
      ctx.ui.notify(
        `Pass-1 migration complete: ${migrated.slices.length} slice(s) → "${strandName}" strand. Backup at ${runtime.statePath}.bak. Starting interactive Pass-2 backfill…`,
        "info"
      );

      if (ctx.isIdle()) {
        pi.sendUserMessage(MIGRATE_PASS2_MESSAGE);
      } else {
        pi.sendUserMessage(MIGRATE_PASS2_MESSAGE, { deliverAs: "followUp" });
        ctx.ui.notify("Queued Pass-2 backfill for after the current turn", "info");
      }
    },
  });
}
