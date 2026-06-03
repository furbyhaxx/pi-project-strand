export type SliceType = "vertical" | "horizontal";
export type SliceStatus = "defined" | "active" | "on_hold" | "complete";
export type PlanStatus = "linked" | "complete";

export interface ProjectInfo {
  name: string;
  description: string;
  updated_at: string;
}

export interface Criterion {
  text: string;
  verified: boolean;
  evidence?: string;
  verified_at?: string;
}

export interface ActiveKnot {
  knot: string;
  started_at: string;
  criteria: Criterion[];
  notes?: string;   // design notes, decisions, howtos specific to this knot's work
}

export interface PendingFastForward {
  from_knot: string;
  target_knot: string;
  squashed_knots: string[];   // knots between from and target (exclusive of both)
  user_instructions: string;
  initiated_at: string;
}

export interface KnotRecord {
  knot: string;
  started_at: string;
  completed_at: string;
  evidence_summary: string;
  signed_off: true;
  fast_forward?: {
    from_knot: string;
    squashed_knots: string[];
    user_instructions: string;
  };
}

export interface Slice {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority: number;
  status: SliceStatus;
  current_knot: string | null;
  active_knot: ActiveKnot | null;
  active_plan: string | null;
  active_plan_status: PlanStatus | null;
  knot_history: KnotRecord[];
  notes?: string;   // persistent design notes, key decisions, architecture details for this slice
  pending_fast_forward?: PendingFastForward;
}

export interface Milestone {
  name: string;
  description: string;
  reached_at: string;
}

export interface ProjectState {
  project: ProjectInfo;
  slices: Slice[];
  milestones: Milestone[];
}

export interface ProjectTrackerDetails {
  action: string;
  state: ProjectState;
  error?: string;
}

export interface ActionResult {
  text: string;
  state: ProjectState;
  error?: string;
}

export interface ProjectConfig {
  project?: {
    name?: string;
    description?: string;
  };
  knots?: Array<{ name: string; focus?: string }>;
}

export interface MutationBase {
  slice_id?: string;
}

export interface SliceCreateInput {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority?: number;
}

export interface KnotStartInput extends MutationBase {
  knot: string;
  criteria: string[];
}

export interface VerifyCriterionInput extends MutationBase {
  index: number;
  evidence: string;
}

export interface PlanLinkInput extends MutationBase {
  file_path: string;
}

export interface MilestoneInput {
  name: string;
  description: string;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function createInitialState(config: ProjectConfig = {}, cwdName = "Project"): ProjectState {
  return {
    project: {
      name: config.project?.name?.trim() || cwdName,
      description: config.project?.description?.trim() || "",
      updated_at: isoNow(),
    },
    slices: [],
    milestones: [],
  };
}

export function normalizeState(state: ProjectState, config: ProjectConfig = {}, cwdName = "Project"): ProjectState {
  const base = state ?? createInitialState(config, cwdName);
  return {
    project: {
      name: config.project?.name?.trim() || base.project?.name || cwdName,
      description: config.project?.description?.trim() ?? base.project?.description ?? "",
      updated_at: base.project?.updated_at || isoNow(),
    },
    slices: [...(base.slices ?? [])].sort(compareSlices),
    milestones: [...(base.milestones ?? [])],
  };
}

function touch(state: ProjectState): ProjectState {
  return {
    ...state,
    project: {
      ...state.project,
      updated_at: isoNow(),
    },
  };
}

function compareSlices(a: Slice, b: Slice): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id.localeCompare(b.id);
}

function cloneState(state: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(state)) as ProjectState;
}

function findSlice(state: ProjectState, sliceId: string | undefined): Slice | undefined {
  if (!sliceId) return undefined;
  return state.slices.find((slice) => slice.id === sliceId);
}

function nextPriority(state: ProjectState): number {
  if (state.slices.length === 0) return 100;
  return Math.max(...state.slices.map((slice) => slice.priority)) + 10;
}

function criteriaProgress(activeKnot: ActiveKnot | null): string {
  if (!activeKnot) return "0/0";
  const total = activeKnot.criteria.length;
  const verified = activeKnot.criteria.filter((criterion) => criterion.verified).length;
  return `${verified}/${total}`;
}

export function formatProjectStatus(state: ProjectState): string {
  const active = state.slices.filter((slice) => slice.status === "active");
  const defined = state.slices.filter((slice) => slice.status === "defined");
  const onHold = state.slices.filter((slice) => slice.status === "on_hold");
  const complete = state.slices.filter((slice) => slice.status === "complete");

  const lines: string[] = [];
  lines.push(`${state.project.name}` + (state.project.description ? ` — ${state.project.description}` : ""));
  lines.push(`Slices: ${state.slices.length} total (${active.length} active, ${defined.length} defined, ${onHold.length} on hold, ${complete.length} complete)`);

  if (active.length > 0) {
    lines.push("");
    lines.push("Active slices:");
    for (const slice of active.sort(compareSlices)) {
      lines.push(`- ${slice.id} [${slice.current_knot ?? "no knot"}] (${criteriaProgress(slice.active_knot)} criteria)${slice.active_plan ? ` plan=${slice.active_plan_status ?? "linked"}` : ""}`);
    }
  }

  return lines.join("\n");
}

export function formatSliceList(state: ProjectState, status?: SliceStatus): string {
  const slices = status ? state.slices.filter((slice) => slice.status === status) : state.slices;
  if (slices.length === 0) return status ? `No slices with status ${status}.` : "No slices defined.";

  const lines = slices
    .sort(compareSlices)
    .map((slice) => `- [${slice.priority}] ${slice.id} (${slice.type}) — ${slice.status}, knot=${slice.current_knot ?? "none"}, criteria=${criteriaProgress(slice.active_knot)}`);
  return lines.join("\n");
}

export function formatSliceDetail(slice: Slice): string {
  const lines: string[] = [];
  lines.push(`${slice.id} — ${slice.name}`);
  lines.push(slice.description);
  lines.push(`type=${slice.type}, priority=${slice.priority}, status=${slice.status}`);
  lines.push(`current_knot=${slice.current_knot ?? "none"}`);
  lines.push(`active_plan=${slice.active_plan ?? "none"}${slice.active_plan_status ? ` (${slice.active_plan_status})` : ""}`);

  if (slice.notes) {
    lines.push("");
    lines.push("Slice notes:");
    lines.push(slice.notes);
  }

  if (slice.pending_fast_forward) {
    const pff = slice.pending_fast_forward;
    const squashed = [pff.from_knot, ...pff.squashed_knots];
    lines.push("");
    lines.push(`⚡ Pending fast-forward: ${pff.from_knot} → ${pff.target_knot}`);
    if (pff.squashed_knots.length > 0) lines.push(`  Squashing: ${squashed.join(", ")}`);
    lines.push(`  Instructions: ${pff.user_instructions}`);
    lines.push(`  Initiated: ${pff.initiated_at}`);
  }

  if (slice.active_knot) {
    lines.push("");
    lines.push(`Active knot: ${slice.active_knot.knot} (${criteriaProgress(slice.active_knot)} verified)`);
    slice.active_knot.criteria.forEach((criterion, index) => {
      lines.push(`  ${criterion.verified ? "✓" : "○"} [${index}] ${criterion.text}${criterion.evidence ? ` — ${criterion.evidence}` : ""}`);
    });
    if (slice.active_knot.notes) {
      lines.push("");
      lines.push(`Knot notes (${slice.active_knot.knot}):`);
      lines.push(slice.active_knot.notes);
    }
  }

  if (slice.knot_history.length > 0) {
    lines.push("");
    lines.push("Knot history:");
    for (const record of slice.knot_history) {
      lines.push(`  ✓ ${record.knot} @ ${record.completed_at} — ${record.evidence_summary}`);
    }
  }

  return lines.join("\n");
}

export function formatCriteria(slice: Slice): string {
  if (!slice.active_knot) return `${slice.id} has no active knot.`;
  const lines = [`${slice.id} → ${slice.active_knot.knot} criteria (${criteriaProgress(slice.active_knot)})`];
  slice.active_knot.criteria.forEach((criterion, index) => {
    lines.push(`${criterion.verified ? "✓" : "○"} [${index}] ${criterion.text}${criterion.evidence ? ` — ${criterion.evidence}` : ""}`);
  });
  if (slice.active_knot.notes) {
    lines.push("");
    lines.push("Knot notes:");
    lines.push(slice.active_knot.notes);
  }
  if (slice.notes) {
    lines.push("");
    lines.push("Slice notes:");
    lines.push(slice.notes);
  }
  return lines.join("\n");
}

export function computeNext(state: ProjectState): string {
  const pendingFastForward = state.slices
    .filter((s) => s.status === "active" && s.pending_fast_forward)
    .sort(compareSlices);
  if (pendingFastForward.length > 0) {
    const slice = pendingFastForward[0]!;
    const pff = slice.pending_fast_forward!;
    return `Execute fast-forward plan for ${slice.id}: ${pff.from_knot} → ${pff.target_knot}`;
  }

  const activeWithUnverified = state.slices
    .filter((slice) => slice.status === "active" && slice.active_knot && slice.active_knot.criteria.some((criterion) => !criterion.verified))
    .sort(compareSlices);
  if (activeWithUnverified.length > 0) {
    const slice = activeWithUnverified[0]!;
    return `Continue ${slice.id} → ${slice.active_knot!.knot} (${criteriaProgress(slice.active_knot)} criteria verified)`;
  }

  const readyForSignoff = state.slices
    .filter((slice) => slice.status === "active" && slice.active_knot && slice.active_knot.criteria.every((criterion) => criterion.verified))
    .sort(compareSlices);
  if (readyForSignoff.length > 0) {
    const slice = readyForSignoff[0]!;
    return `${slice.id} → ${slice.active_knot!.knot} is ready for user sign-off`;
  }

  const activeWithoutStartedKnot = state.slices
    .filter((slice) => slice.status === "active" && slice.current_knot && !slice.active_knot)
    .sort(compareSlices);
  if (activeWithoutStartedKnot.length > 0) {
    const slice = activeWithoutStartedKnot[0]!;
    return `Start ${slice.id} → ${slice.current_knot}`;
  }

  const nextDefined = state.slices.filter((slice) => slice.status === "defined").sort(compareSlices);
  if (nextDefined.length > 0) {
    const slice = nextDefined[0]!;
    return `Activate ${slice.id} (${slice.type}, priority ${slice.priority})`;
  }

  return "No obvious next slice.";
}

export function handleStatus(state: ProjectState): ActionResult {
  return { text: formatProjectStatus(state), state };
}

export function handleSliceList(state: ProjectState, status?: SliceStatus): ActionResult {
  return { text: formatSliceList(state, status), state };
}

export function handleSliceGet(state: ProjectState, sliceId?: string): ActionResult {
  const slice = findSlice(state, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  return { text: formatSliceDetail(slice), state };
}

export function handleKnotCriteria(state: ProjectState, sliceId?: string): ActionResult {
  const slice = findSlice(state, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  return { text: formatCriteria(slice), state };
}

export function handleNext(state: ProjectState): ActionResult {
  return { text: computeNext(state), state };
}

export function handlePlanList(state: ProjectState): ActionResult {
  const linked = state.slices.filter((slice) => slice.active_plan);
  if (linked.length === 0) return { text: "No active plans linked.", state };
  return {
    text: linked
      .sort(compareSlices)
      .map((slice) => `- ${slice.id}: ${slice.active_plan} (${slice.active_plan_status ?? "linked"})`)
      .join("\n"),
    state,
  };
}

export function handleSliceCreate(state: ProjectState, input: SliceCreateInput): ActionResult {
  const current = cloneState(state);
  if (!input.id?.trim() || !input.name?.trim() || !input.description?.trim()) {
    return { text: "Error: id, name, and description are required", state, error: "missing fields" };
  }
  if (current.slices.some((slice) => slice.id === input.id)) {
    return { text: `Error: slice ${input.id} already exists`, state, error: "duplicate slice" };
  }

  current.slices.push({
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    priority: input.priority ?? nextPriority(current),
    status: "defined",
    current_knot: null,
    active_knot: null,
    active_plan: null,
    active_plan_status: null,
    knot_history: [],
  });

  const next = touch(normalizeState(current));
  return { text: `Created slice ${input.id}`, state: next };
}

export function handleSliceActivate(state: ProjectState, sliceId?: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (slice.status === "complete") {
    return { text: `Error: slice ${slice.id} is already complete`, state, error: "already complete" };
  }
  slice.status = "active";
  return { text: `Activated slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceHold(state: ProjectState, sliceId?: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  slice.status = "on_hold";
  return { text: `Put slice ${slice.id} on hold`, state: touch(normalizeState(current)) };
}

export function handleKnotStart(state: ProjectState, input: KnotStartInput, validKnots: string[]): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, input.slice_id);
  if (!slice) return { text: `Error: unknown slice ${input.slice_id ?? "<missing>"}`, state, error: "unknown slice" };
  if (!input.knot?.trim()) return { text: "Error: knot is required", state, error: "missing knot" };
  if (validKnots.length > 0 && !validKnots.includes(input.knot)) {
    return { text: `Error: invalid knot ${input.knot}`, state, error: "invalid knot" };
  }
  if (!input.criteria || input.criteria.length === 0) {
    return { text: "Error: at least one criterion is required", state, error: "missing criteria" };
  }
  if (slice.active_knot) {
    return { text: `Error: slice ${slice.id} already has active knot ${slice.active_knot.knot}`, state, error: "active knot exists" };
  }

  slice.status = "active";
  slice.current_knot = input.knot;
  slice.active_knot = {
    knot: input.knot,
    started_at: isoNow(),
    criteria: input.criteria.map((text) => ({ text, verified: false })),
  };

  return { text: `Started ${slice.id} → ${input.knot}`, state: touch(normalizeState(current)) };
}

export function handleVerifyCriterion(state: ProjectState, input: VerifyCriterionInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, input.slice_id);
  if (!slice) return { text: `Error: unknown slice ${input.slice_id ?? "<missing>"}`, state, error: "unknown slice" };
  if (!slice.active_knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (input.index < 0 || input.index >= slice.active_knot.criteria.length) {
    return { text: `Error: criterion index ${input.index} out of range`, state, error: "criterion out of range" };
  }
  const criterion = slice.active_knot.criteria[input.index]!;
  criterion.verified = true;
  criterion.evidence = input.evidence.trim();
  criterion.verified_at = isoNow();
  return { text: `Verified criterion [${input.index}] for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleKnotRequestSignoff(state: ProjectState, sliceId?: string): ActionResult {
  const slice = findSlice(state, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!slice.active_knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  const unverified = slice.active_knot.criteria.filter((criterion) => !criterion.verified);
  if (unverified.length > 0) {
    return {
      text: `${slice.id} → ${slice.active_knot.knot} is not ready for sign-off (${unverified.length} criteria unverified)`,
      state,
      error: "criteria not complete",
    };
  }
  return {
    text: `${slice.id} → ${slice.active_knot.knot} is ready for user sign-off via /project:knot:advance ${slice.id}`,
    state,
  };
}

export function handlePlanLink(state: ProjectState, input: PlanLinkInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, input.slice_id);
  if (!slice) return { text: `Error: unknown slice ${input.slice_id ?? "<missing>"}`, state, error: "unknown slice" };
  slice.active_plan = input.file_path.trim();
  slice.active_plan_status = "linked";
  return { text: `Linked plan ${slice.active_plan} to ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handlePlanComplete(state: ProjectState, sliceId?: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!slice.active_plan) return { text: `Error: slice ${slice.id} has no linked plan`, state, error: "no linked plan" };
  slice.active_plan_status = "complete";
  return { text: `Marked plan complete for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceAnnotate(
  state: ProjectState,
  sliceId: string | undefined,
  notes: string,
  mode: "set" | "append"
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!notes.trim()) return { text: "Error: notes content is required", state, error: "empty notes" };

  if (mode === "append" && slice.notes) {
    slice.notes = `${slice.notes}\n\n${notes.trim()}`;
  } else {
    slice.notes = notes.trim();
  }
  return { text: `Updated notes for slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleKnotAnnotate(
  state: ProjectState,
  sliceId: string | undefined,
  notes: string,
  mode: "set" | "append"
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!slice.active_knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (!notes.trim()) return { text: "Error: notes content is required", state, error: "empty notes" };

  if (mode === "append" && slice.active_knot.notes) {
    slice.active_knot.notes = `${slice.active_knot.notes}\n\n${notes.trim()}`;
  } else {
    slice.active_knot.notes = notes.trim();
  }
  return { text: `Updated knot notes for ${slice.id} → ${slice.active_knot.knot}`, state: touch(normalizeState(current)) };
}

export function handleMilestoneAdd(state: ProjectState, input: MilestoneInput): ActionResult {
  const current = cloneState(state);
  if (!input.name?.trim() || !input.description?.trim()) {
    return { text: "Error: milestone name and description are required", state, error: "missing milestone fields" };
  }
  current.milestones.push({
    name: input.name.trim(),
    description: input.description.trim(),
    reached_at: isoNow(),
  });
  return { text: `Added milestone ${input.name}`, state: touch(normalizeState(current)) };
}

/** Returns IDs of all currently active slices. */
export function getActiveSliceIds(state: ProjectState): string[] {
  return state.slices.filter((s) => s.status === "active").map((s) => s.id);
}

export function handleInitFastForward(
  state: ProjectState,
  sliceId: string,
  targetKnot: string,
  userInstructions: string,
  knotSequence: string[]
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  if (slice.status !== "active") return { text: `Error: slice ${sliceId} is not active`, state, error: "not active" };
  if (!slice.current_knot) return { text: `Error: slice ${sliceId} has no current knot`, state, error: "no current knot" };
  if (!userInstructions.trim()) return { text: "Error: instructions are required", state, error: "missing instructions" };

  const fromIndex = knotSequence.indexOf(slice.current_knot);
  const targetIndex = knotSequence.indexOf(targetKnot);
  if (fromIndex === -1) return { text: `Error: current knot "${slice.current_knot}" not in sequence`, state, error: "invalid knot" };
  if (targetIndex === -1) return { text: `Error: target knot "${targetKnot}" not in sequence`, state, error: "invalid target knot" };
  if (targetIndex <= fromIndex) return { text: `Error: target knot must come after current knot "${slice.current_knot}"`, state, error: "invalid target" };

  const squashedKnots = knotSequence.slice(fromIndex + 1, targetIndex);
  slice.pending_fast_forward = {
    from_knot: slice.current_knot,
    target_knot: targetKnot,
    squashed_knots: squashedKnots,
    user_instructions: userInstructions.trim(),
    initiated_at: isoNow(),
  };

  const squashDesc = squashedKnots.length > 0
    ? `, squashing ${[slice.current_knot, ...squashedKnots].join(", ")}`
    : ` from ${slice.current_knot}`;
  return {
    text: `Fast-forward initiated: ${sliceId} → ${targetKnot}${squashDesc}.\nAgent will synthesize an action plan for approval on next turn.`,
    state: touch(normalizeState(current)),
  };
}

export function handleCompleteFastForward(
  state: ProjectState,
  sliceId: string,
  evidenceSummary: string
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  if (!slice.pending_fast_forward) return { text: `Error: slice ${sliceId} has no pending fast-forward`, state, error: "no pending fast-forward" };
  if (!evidenceSummary.trim()) return { text: "Error: evidence summary is required", state, error: "missing evidence" };

  const pff = slice.pending_fast_forward;
  const now = isoNow();

  slice.knot_history.push({
    knot: `fast-forward:${pff.from_knot}→${pff.target_knot}`,
    started_at: pff.initiated_at,
    completed_at: now,
    evidence_summary: evidenceSummary.trim(),
    signed_off: true,
    fast_forward: {
      from_knot: pff.from_knot,
      squashed_knots: pff.squashed_knots,
      user_instructions: pff.user_instructions,
    },
  });

  slice.active_knot = null;
  slice.active_plan = null;
  slice.active_plan_status = null;
  slice.current_knot = pff.target_knot;
  slice.pending_fast_forward = undefined;

  const squashed = [pff.from_knot, ...pff.squashed_knots];
  return {
    text: `Fast-forward complete: ${sliceId} landed at ${pff.target_knot}.\nSquashed: ${squashed.join(", ")}.\nReady to start ${pff.target_knot} knot with knot:start.`,
    state: touch(normalizeState(current)),
  };
}

export function advanceKnotForSignoff(
  state: ProjectState,
  sliceId: string,
  knotSequence: string[],
  evidenceSummary: string
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  if (!slice.active_knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (slice.active_knot.criteria.some((criterion) => !criterion.verified)) {
    return { text: `Error: ${slice.id} has unverified criteria`, state, error: "unverified criteria" };
  }

  const active = slice.active_knot;
  slice.knot_history.push({
    knot: active.knot,
    started_at: active.started_at,
    completed_at: isoNow(),
    evidence_summary: evidenceSummary.trim(),
    signed_off: true,
  });

  const currentIndex = knotSequence.indexOf(active.knot);
  const nextKnot = currentIndex >= 0 ? knotSequence[currentIndex + 1] ?? null : null;

  slice.current_knot = nextKnot;
  slice.active_knot = null;
  slice.active_plan = null;
  slice.active_plan_status = null;
  if (!nextKnot) {
    slice.status = "complete";
  } else {
    slice.status = "active";
  }

  const next = touch(normalizeState(current));
  return {
    text: nextKnot
      ? `Advanced ${slice.id} from ${active.knot} to ${nextKnot}`
      : `Completed final knot ${active.knot} for ${slice.id}`,
    state: next,
  };
}
