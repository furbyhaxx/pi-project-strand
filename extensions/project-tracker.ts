import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { dirname, join, resolve, basename } from "node:path";
import { mkdir, readFile, rename, writeFile, access } from "node:fs/promises";
import { parse } from "jsonc-parser";
import { Type, type Static } from "typebox";
import {
  DEFAULT_STRANDS,
  type ProjectConfig,
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
} from "./project-tracker-core.js";
import { migrateLegacyState } from "./project-tracker-migrate.js";

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

async function loadProjectConfig(cwd: string): Promise<{ root: string; configPath: string; config: ProjectStrandConfig; strands: Record<string, StrandTemplate>; statePath: string; signoffWindowSeconds: number }> {
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
  return { root, configPath, config: merged, strands, statePath, signoffWindowSeconds };
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
  const active = state.slices.filter((s) => s.status === "active").slice(0, 3);
  if (active.length === 0) return `${state.project.name}: no active slices`;
  const summary = active.map((s) => `${s.id}[${s.strand.current_knot ?? "-"}]`).join(" · ");
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
    parts.push(
      knot.advance_by.includes("agent")
        ? `${slice.id} → ${knot.name}: agent self-advance ALLOWED (advance_by=[${knot.advance_by.join(", ")}]). Protocol: verify all criteria, then knot:sign_off (arms + returns the checklist) → knot:sign_off WITH evidence within the freshness window to confirm.`
        : `${slice.id} → ${knot.name}: agent self-advance NOT allowed (advance_by=[${knot.advance_by.join(", ")}]). Advance via ${knot.advance_by.includes("judge") ? "the judge (Phase B) or " : ""}user /project:knot:advance ${slice.id}.`
    );
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

export default function (pi: ExtensionAPI) {
  for (const event of ["session_start", "session_switch", "session_fork", "session_tree"] as const) {
    pi.on(event, async (_event, ctx) => {
      await updateWidget(ctx);
    });
  }

  pi.registerTool({
    name: "project_tracker",
    label: "Project Tracker",
    description: "Persistent, project-scoped FRS tracking. Slices follow a named strand of durable knots; query and mutate slices, knots, success criteria, plans, resources, and milestones.",
    parameters: ProjectTrackerParams,
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
          result = await mutateState(ctx.cwd, (s) => handleKnotSetPlan(s, params.slice_id, params.file_path ?? "", params.plan_status ?? "linked"));
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
