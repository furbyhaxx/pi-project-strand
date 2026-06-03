export type SliceType = "vertical" | "horizontal";
export type SliceStatus = "defined" | "active" | "on_hold" | "complete";
export type KnotStatus = "pending" | "active" | "signed_off" | "fast_forwarded";
export type PlanStatus = "linked" | "complete";
export type ResourceType = "doc" | "file" | "url" | "report" | "memory" | "knowledge";
export type Target = "slice" | "knot";

export interface ProjectInfo {
  name: string;
  description: string;
  updated_at: string;
}

export interface SuccessCriterion {
  text: string;
  met: boolean;
  evidence?: string;
  met_at?: string;
}

export interface Resource {
  type: ResourceType;
  ref: string;
  title?: string;
  note?: string;
}

export interface KnotPlan {
  path: string;
  status: PlanStatus;
}

export interface Knot {
  name: string;
  title: string | null;
  focus: string;
  status: KnotStatus;
  goals: string[];
  success_criteria: SuccessCriterion[];
  plan: KnotPlan | null;
  resources: Resource[];
  started_at: string | null;
  completed_at: string | null;
  signed_off: boolean;
  signed_off_message: string | null;
  validation_evidence_summary: string | null;
  notes: string | null;
}

export interface PendingFastForward {
  target_knot: string;
  user_instructions: string;
  initiated_at: string;
}

export interface SliceStrand {
  name: string;
  description: string;
  current_knot: string | null;
  pending_fast_forward: PendingFastForward | null;
  knots: Knot[];
}

export interface Slice {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority: number;
  status: SliceStatus;
  goal: string;
  success_criteria: SuccessCriterion[];
  started_at: string | null;
  completed_at: string | null;
  signed_off: boolean;
  signed_off_message: string | null;
  validation_evidence_summary: string | null;
  notes: string | null;
  resources: Resource[];
  strand: SliceStrand;
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

export interface StrandKnotTemplate {
  name: string;
  focus: string;
  title?: string;
}

export interface StrandTemplate {
  description: string;
  knots: StrandKnotTemplate[];
}

export interface ProjectConfig {
  project?: {
    name?: string;
    description?: string;
  };
  strands?: Record<string, StrandTemplate>;
}

export function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Strand templates & seeding
// ---------------------------------------------------------------------------

export const DEFAULT_STRANDS: Record<string, StrandTemplate> = {
  quick: {
    description: "Quick strand for simple, scoped, or smaller work.",
    knots: [
      { name: "Prototype", focus: "Research/prototype approaches and ground the decision on how to build it." },
      { name: "Realization", focus: "Build the final implementation incl. required tests, ready for finalization." },
      { name: "Finalization", focus: "Validation, review, and polishing to finalize the strand." },
    ],
  },
  granular: {
    description: "Granular strand for complex or large-scope work.",
    knots: [
      { name: "Proof-of-Work", focus: "Prove the approach; establish design, API, patterns, and decisions for later knots." },
      { name: "Alpha", focus: "First real, integrated implementation." },
      { name: "Beta", focus: "Ready to show someone else." },
      { name: "Gamma", focus: "Staging-ready, all core features." },
      { name: "RC1", focus: "Feature complete, polishing." },
      { name: "RC2", focus: "Early-adopter ready." },
      { name: "Release", focus: "Production confident." },
    ],
  },
};

export function seedStrand(name: string, template: StrandTemplate): SliceStrand {
  return {
    name,
    description: template.description ?? "",
    current_knot: null,
    pending_fast_forward: null,
    knots: template.knots.map((k) => ({
      name: k.name,
      title: k.title ?? null,
      focus: k.focus ?? "",
      status: "pending",
      goals: [],
      success_criteria: [],
      plan: null,
      resources: [],
      started_at: null,
      completed_at: null,
      signed_off: false,
      signed_off_message: null,
      validation_evidence_summary: null,
      notes: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// State scaffolding & helpers
// ---------------------------------------------------------------------------

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

function compareSlices(a: Slice, b: Slice): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id.localeCompare(b.id);
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
  return { ...state, project: { ...state.project, updated_at: isoNow() } };
}

function cloneState(state: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(state)) as ProjectState;
}

function findSlice(state: ProjectState, sliceId: string | undefined): Slice | undefined {
  if (!sliceId) return undefined;
  return state.slices.find((slice) => slice.id === sliceId);
}

function findKnot(slice: Slice, knotName: string | null | undefined): Knot | undefined {
  if (!knotName) return undefined;
  return slice.strand.knots.find((k) => k.name === knotName);
}

function getActiveKnot(slice: Slice): Knot | undefined {
  return findKnot(slice, slice.strand.current_knot);
}

function firstPendingKnot(slice: Slice): Knot | undefined {
  return slice.strand.knots.find((k) => k.status === "pending");
}

function nextPriority(state: ProjectState): number {
  if (state.slices.length === 0) return 100;
  return Math.max(...state.slices.map((s) => s.priority)) + 10;
}

function criteriaProgress(criteria: SuccessCriterion[]): string {
  const met = criteria.filter((c) => c.met).length;
  return `${met}/${criteria.length}`;
}

// ---------------------------------------------------------------------------
// Slice handlers
// ---------------------------------------------------------------------------

export interface SliceCreateInput {
  id: string;
  name: string;
  description: string;
  type: SliceType;
  priority?: number;
  goal: string;
  criteria: string[];
  strand: string;
}

export function handleSliceCreate(state: ProjectState, input: SliceCreateInput, template: StrandTemplate): ActionResult {
  const current = cloneState(state);
  if (!input.id?.trim() || !input.name?.trim() || !input.description?.trim() || !input.goal?.trim()) {
    return { text: "Error: id, name, description, and goal are required", state, error: "missing fields" };
  }
  if (!template || !Array.isArray(template.knots) || template.knots.length === 0) {
    return { text: `Error: strand "${input.strand}" has no knots`, state, error: "invalid strand" };
  }
  if (current.slices.some((s) => s.id === input.id)) {
    return { text: `Error: slice ${input.id} already exists`, state, error: "duplicate slice" };
  }

  current.slices.push({
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    priority: input.priority ?? nextPriority(current),
    status: "defined",
    goal: input.goal.trim(),
    success_criteria: (input.criteria ?? []).map((text) => ({ text, met: false })),
    started_at: null,
    completed_at: null,
    signed_off: false,
    signed_off_message: null,
    validation_evidence_summary: null,
    notes: null,
    resources: [],
    strand: seedStrand(input.strand, template),
  });

  return { text: `Created slice ${input.id} on strand "${input.strand}"`, state: touch(normalizeState(current)) };
}

export interface SliceUpdateInput {
  name?: string;
  description?: string;
  goal?: string;
  priority?: number;
  type?: SliceType;
}

export function handleSliceUpdate(state: ProjectState, sliceId: string | undefined, patch: SliceUpdateInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (patch.name?.trim()) slice.name = patch.name.trim();
  if (patch.description?.trim()) slice.description = patch.description.trim();
  if (patch.goal?.trim()) slice.goal = patch.goal.trim();
  if (typeof patch.priority === "number") slice.priority = patch.priority;
  if (patch.type) slice.type = patch.type;
  return { text: `Updated slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceActivate(state: ProjectState, sliceId: string | undefined): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (slice.status === "complete") return { text: `Error: slice ${slice.id} is already complete`, state, error: "already complete" };
  slice.status = "active";
  if (!slice.started_at) slice.started_at = isoNow();
  return { text: `Activated slice ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleSliceHold(state: ProjectState, sliceId: string | undefined): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  slice.status = "on_hold";
  return { text: `Put slice ${slice.id} on hold`, state: touch(normalizeState(current)) };
}

export function handleSliceSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const incomplete = slice.strand.knots.filter((k) => k.status !== "signed_off" && k.status !== "fast_forwarded");
  if (incomplete.length > 0) {
    return {
      text: `Error: ${slice.id} has knots not yet signed off: ${incomplete.map((k) => k.name).join(", ")}`,
      state,
      error: "knots incomplete",
    };
  }
  if (!evidence?.trim()) return { text: "Error: validation evidence is required", state, error: "missing evidence" };

  slice.status = "complete";
  slice.signed_off = true;
  slice.signed_off_message = message?.trim() || null;
  slice.validation_evidence_summary = evidence.trim();
  slice.completed_at = isoNow();
  slice.strand.current_knot = null;
  return { text: `Slice ${slice.id} signed off and complete.`, state: touch(normalizeState(current)) };
}

// ---------------------------------------------------------------------------
// Knot handlers
// ---------------------------------------------------------------------------

export interface KnotStartInput {
  slice_id?: string;
  knot: string;
  goals: string[];
  criteria: string[];
}

export function handleKnotStart(state: ProjectState, input: KnotStartInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, input.slice_id);
  if (!slice) return { text: `Error: unknown slice ${input.slice_id ?? "<missing>"}`, state, error: "unknown slice" };
  if (!input.knot?.trim()) return { text: "Error: knot is required", state, error: "missing knot" };
  const knot = findKnot(slice, input.knot);
  if (!knot) {
    const valid = slice.strand.knots.map((k) => k.name).join(", ");
    return { text: `Error: invalid knot "${input.knot}". Valid knots: ${valid}`, state, error: "invalid knot" };
  }
  if (slice.strand.current_knot) {
    return { text: `Error: slice ${slice.id} already has active knot ${slice.strand.current_knot}`, state, error: "active knot exists" };
  }
  if (knot.status !== "pending") {
    return { text: `Error: knot ${knot.name} is ${knot.status}, not pending`, state, error: "knot not pending" };
  }
  if (!input.criteria || input.criteria.length === 0) {
    return { text: "Error: at least one success criterion is required", state, error: "missing criteria" };
  }

  knot.status = "active";
  knot.goals = [...(input.goals ?? [])];
  knot.success_criteria = input.criteria.map((text) => ({ text, met: false }));
  knot.started_at = isoNow();
  slice.strand.current_knot = knot.name;
  slice.status = "active";
  if (!slice.started_at) slice.started_at = isoNow();

  return { text: `Started ${slice.id} → ${knot.name}`, state: touch(normalizeState(current)) };
}

export interface KnotUpdateInput {
  goals?: string[];
  title?: string;
}

export function handleKnotUpdate(state: ProjectState, sliceId: string | undefined, patch: KnotUpdateInput): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (patch.goals) knot.goals = [...patch.goals];
  if (typeof patch.title === "string") knot.title = patch.title.trim() || null;
  return { text: `Updated knot ${slice.id} → ${knot.name}`, state: touch(normalizeState(current)) };
}

export function handleKnotSetPlan(state: ProjectState, sliceId: string | undefined, filePath: string, status: PlanStatus): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (!filePath?.trim()) return { text: "Error: file_path is required", state, error: "missing file_path" };
  knot.plan = { path: filePath.trim(), status };
  return { text: `Plan ${status} for ${slice.id} → ${knot.name}: ${knot.plan.path}`, state: touch(normalizeState(current)) };
}

export function handleKnotSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  const unmet = knot.success_criteria.filter((c) => !c.met);
  if (unmet.length > 0) {
    return {
      text: `Error: ${slice.id} → ${knot.name} has unmet criteria: ${unmet.map((c) => c.text).join("; ")}`,
      state,
      error: "unmet criteria",
    };
  }
  if (!evidence?.trim()) return { text: "Error: validation evidence is required", state, error: "missing evidence" };

  knot.status = "signed_off";
  knot.signed_off = true;
  knot.signed_off_message = message?.trim() || null;
  knot.validation_evidence_summary = evidence.trim();
  knot.completed_at = isoNow();
  slice.strand.current_knot = null;

  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Signed off ${slice.id} → ${knot.name}. ${tail}`, state: touch(normalizeState(current)) };
}

// ---------------------------------------------------------------------------
// Fast-forward
// ---------------------------------------------------------------------------

function fastForwardFromIndex(slice: Slice): number {
  if (slice.strand.current_knot) {
    return slice.strand.knots.findIndex((k) => k.name === slice.strand.current_knot);
  }
  return slice.strand.knots.findIndex((k) => k.status === "pending");
}

export function handleKnotFastForward(state: ProjectState, sliceId: string, targetKnot: string, instructions: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  if (slice.status !== "active") return { text: `Error: slice ${sliceId} is not active`, state, error: "not active" };
  if (slice.strand.pending_fast_forward) return { text: `Error: slice ${sliceId} already has a pending fast-forward`, state, error: "pending fast-forward exists" };
  if (!instructions?.trim()) return { text: "Error: fast-forward instructions are required", state, error: "missing instructions" };

  const fromIndex = fastForwardFromIndex(slice);
  const targetIndex = slice.strand.knots.findIndex((k) => k.name === targetKnot);
  if (fromIndex === -1) return { text: `Error: slice ${sliceId} has no pending knot to fast-forward from`, state, error: "no from knot" };
  if (targetIndex === -1) return { text: `Error: target knot "${targetKnot}" not in strand`, state, error: "invalid target" };
  if (targetIndex <= fromIndex) return { text: `Error: target must come after the current position`, state, error: "invalid target" };

  slice.strand.pending_fast_forward = {
    target_knot: targetKnot,
    user_instructions: instructions.trim(),
    initiated_at: isoNow(),
  };
  const squashed = slice.strand.knots.slice(fromIndex, targetIndex).map((k) => k.name).join(", ");
  return { text: `Fast-forward initiated for ${sliceId} → ${targetKnot} (squashing: ${squashed}). Synthesize and execute a combined plan, then call knot:complete_fast_forward.`, state: touch(normalizeState(current)) };
}

export function handleCompleteFastForward(state: ProjectState, sliceId: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const pff = slice.strand.pending_fast_forward;
  if (!pff) return { text: `Error: slice ${sliceId} has no pending fast-forward`, state, error: "no pending fast-forward" };
  if (!evidence?.trim()) return { text: "Error: evidence summary is required", state, error: "missing evidence" };

  const fromIndex = fastForwardFromIndex(slice);
  const targetIndex = slice.strand.knots.findIndex((k) => k.name === pff.target_knot);
  const now = isoNow();
  for (let i = fromIndex; i < targetIndex; i++) {
    const knot = slice.strand.knots[i]!;
    if (knot.status === "signed_off" || knot.status === "fast_forwarded") continue;
    knot.status = "fast_forwarded";
    knot.signed_off = true;
    knot.started_at = knot.started_at ?? pff.initiated_at;
    knot.completed_at = now;
    knot.validation_evidence_summary = evidence.trim();
    knot.signed_off_message = `Fast-forwarded into ${pff.target_knot}: ${pff.user_instructions}`;
  }
  slice.strand.current_knot = null;
  slice.strand.pending_fast_forward = null;
  const squashed = slice.strand.knots.slice(fromIndex, targetIndex).map((k) => k.name).join(", ");
  return { text: `Fast-forward complete: squashed ${squashed}. ${pff.target_knot} is pending — start it with knot:start.`, state: touch(normalizeState(current)) };
}

// ---------------------------------------------------------------------------
// Cross-cutting handlers (target discriminator)
// ---------------------------------------------------------------------------

function targetCriteria(slice: Slice, target: Target): { ok: true; list: SuccessCriterion[] } | { ok: false; error: string } {
  if (target === "slice") return { ok: true, list: slice.success_criteria };
  const knot = getActiveKnot(slice);
  if (!knot) return { ok: false, error: "no active knot" };
  return { ok: true, list: knot.success_criteria };
}

export function handleVerifyCriterion(state: ProjectState, sliceId: string | undefined, target: Target, index: number, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const sel = targetCriteria(slice, target);
  if (!sel.ok) return { text: `Error: ${sel.error}`, state, error: sel.error };
  if (index < 0 || index >= sel.list.length) return { text: `Error: criterion index ${index} out of range`, state, error: "criterion out of range" };
  const c = sel.list[index]!;
  c.met = true;
  c.evidence = evidence.trim();
  c.met_at = isoNow();
  return { text: `Verified ${target} criterion [${index}] for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleAnnotate(state: ProjectState, sliceId: string | undefined, target: Target, notes: string, mode: "set" | "append"): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!notes?.trim()) return { text: "Error: notes content is required", state, error: "empty notes" };
  const apply = (prev: string | null) => (mode === "append" && prev ? `${prev}\n\n${notes.trim()}` : notes.trim());
  if (target === "slice") {
    slice.notes = apply(slice.notes);
  } else {
    const knot = getActiveKnot(slice);
    if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
    knot.notes = apply(knot.notes);
  }
  return { text: `Updated ${target} notes for ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleResourceAdd(state: ProjectState, sliceId: string | undefined, target: Target, resource: Resource): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  if (!resource?.ref?.trim()) return { text: "Error: resource.ref is required", state, error: "missing resource" };
  const entry: Resource = {
    type: resource.type,
    ref: resource.ref.trim(),
    ...(resource.title ? { title: resource.title } : {}),
    ...(resource.note ? { note: resource.note } : {}),
  };
  if (target === "slice") {
    slice.resources.push(entry);
  } else {
    const knot = getActiveKnot(slice);
    if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
    knot.resources.push(entry);
  }
  return { text: `Added ${target} resource ${entry.ref} to ${slice.id}`, state: touch(normalizeState(current)) };
}

export function handleResourceRemove(state: ProjectState, sliceId: string | undefined, target: Target, index: number): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId ?? "<missing>"}`, state, error: "unknown slice" };
  const list = target === "slice" ? slice.resources : getActiveKnot(slice)?.resources;
  if (!list) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };
  if (index < 0 || index >= list.length) return { text: `Error: resource index ${index} out of range`, state, error: "resource out of range" };
  list.splice(index, 1);
  return { text: `Removed ${target} resource [${index}] from ${slice.id}`, state: touch(normalizeState(current)) };
}

export interface MilestoneInput {
  name: string;
  description: string;
}

export function handleMilestoneAdd(state: ProjectState, input: MilestoneInput): ActionResult {
  const current = cloneState(state);
  if (!input.name?.trim() || !input.description?.trim()) {
    return { text: "Error: milestone name and description are required", state, error: "missing milestone fields" };
  }
  current.milestones.push({ name: input.name.trim(), description: input.description.trim(), reached_at: isoNow() });
  return { text: `Added milestone ${input.name}`, state: touch(normalizeState(current)) };
}

// ---------------------------------------------------------------------------
// computeNext, queries, formatters
// ---------------------------------------------------------------------------

export function computeNext(state: ProjectState): string {
  const active = state.slices.filter((s) => s.status === "active").sort(compareSlices);

  const ff = active.find((s) => s.strand.pending_fast_forward);
  if (ff) return `Execute fast-forward plan for ${ff.id} → ${ff.strand.pending_fast_forward!.target_knot}`;

  for (const slice of active) {
    const knot = getActiveKnot(slice);
    if (knot && knot.success_criteria.some((c) => !c.met)) {
      return `Continue ${slice.id} → ${knot.name} (${criteriaProgress(knot.success_criteria)} criteria met)`;
    }
  }
  for (const slice of active) {
    const knot = getActiveKnot(slice);
    if (knot && knot.success_criteria.every((c) => c.met)) {
      return `${slice.id} → ${knot.name} is ready for sign-off (/project:knot:advance ${slice.id})`;
    }
  }
  for (const slice of active) {
    if (slice.strand.current_knot) continue;
    const pending = firstPendingKnot(slice);
    if (pending) return `Start ${slice.id} → ${pending.name}`;
    return `${slice.id} is ready for slice sign-off (/project:slice:advance ${slice.id})`;
  }

  const defined = state.slices.filter((s) => s.status === "defined").sort(compareSlices);
  if (defined.length > 0) return `Activate ${defined[0]!.id} (${defined[0]!.type}, priority ${defined[0]!.priority})`;

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

export function handleNext(state: ProjectState): ActionResult {
  return { text: computeNext(state), state };
}

export function formatProjectStatus(state: ProjectState): string {
  const by = (s: SliceStatus) => state.slices.filter((x) => x.status === s);
  const lines: string[] = [];
  lines.push(state.project.name + (state.project.description ? ` — ${state.project.description}` : ""));
  lines.push(`Slices: ${state.slices.length} total (${by("active").length} active, ${by("defined").length} defined, ${by("on_hold").length} on hold, ${by("complete").length} complete)`);
  const active = by("active").sort(compareSlices);
  if (active.length > 0) {
    lines.push("", "Active slices:");
    for (const slice of active) {
      const knot = getActiveKnot(slice);
      const prog = knot ? ` [${knot.name} ${criteriaProgress(knot.success_criteria)}]` : ` [${slice.strand.current_knot ?? "no knot"}]`;
      lines.push(`- ${slice.id} (${slice.strand.name})${prog}${slice.strand.pending_fast_forward ? " ⚡FF" : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatSliceList(state: ProjectState, status?: SliceStatus): string {
  const slices = (status ? state.slices.filter((s) => s.status === status) : state.slices).sort(compareSlices);
  if (slices.length === 0) return status ? `No slices with status ${status}.` : "No slices defined.";
  return slices
    .map((s) => `- [${s.priority}] ${s.id} (${s.type}, ${s.strand.name}) — ${s.status}, knot=${s.strand.current_knot ?? "none"}`)
    .join("\n");
}

export function formatSliceDetail(slice: Slice): string {
  const lines: string[] = [];
  lines.push(`${slice.id} — ${slice.name}`);
  lines.push(slice.description);
  lines.push(`type=${slice.type}, priority=${slice.priority}, status=${slice.status}, strand=${slice.strand.name}`);
  lines.push(`goal: ${slice.goal}`);
  if (slice.success_criteria.length > 0) {
    lines.push(`success criteria (${criteriaProgress(slice.success_criteria)}):`);
    slice.success_criteria.forEach((c, i) => lines.push(`  ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
  }
  if (slice.resources.length > 0) {
    lines.push("resources:");
    slice.resources.forEach((r, i) => lines.push(`  [${i}] ${r.type}:${r.ref}${r.title ? ` (${r.title})` : ""}`));
  }
  if (slice.notes) lines.push("", "Slice notes:", slice.notes);
  if (slice.strand.pending_fast_forward) {
    const pff = slice.strand.pending_fast_forward;
    lines.push("", `⚡ Pending fast-forward → ${pff.target_knot}: ${pff.user_instructions}`);
  }
  lines.push("", "Knots:");
  for (const k of slice.strand.knots) {
    const marker = k.status === "signed_off" ? "✓" : k.status === "fast_forwarded" ? "»" : k.status === "active" ? "▶" : "○";
    lines.push(`  ${marker} ${k.name} [${k.status}] — ${k.focus}`);
    if (k.goals.length > 0) lines.push(`      goals: ${k.goals.join("; ")}`);
    if (k.success_criteria.length > 0) {
      lines.push(`      criteria (${criteriaProgress(k.success_criteria)}):`);
      k.success_criteria.forEach((c, i) => lines.push(`        ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
    }
    if (k.plan) lines.push(`      plan: ${k.plan.path} (${k.plan.status})`);
    if (k.validation_evidence_summary) lines.push(`      evidence: ${k.validation_evidence_summary}`);
    if (k.notes) lines.push(`      notes: ${k.notes}`);
  }
  return lines.join("\n");
}

export function formatCriteria(slice: Slice): string {
  const knot = getActiveKnot(slice);
  if (!knot) return `${slice.id} has no active knot.`;
  const lines = [`${slice.id} → ${knot.name} criteria (${criteriaProgress(knot.success_criteria)})`];
  knot.success_criteria.forEach((c, i) => lines.push(`${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`));
  return lines.join("\n");
}

export function getActiveSliceIds(state: ProjectState): string[] {
  return state.slices.filter((s) => s.status === "active").map((s) => s.id);
}
