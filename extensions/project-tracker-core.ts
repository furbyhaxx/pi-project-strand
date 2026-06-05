export type SliceType = "vertical" | "horizontal";
export type SliceStatus = "defined" | "active" | "on_hold" | "complete";
export type KnotStatus = "pending" | "active" | "signed_off" | "fast_forwarded";
export type PlanStatus = "linked" | "complete";
export type ResourceType = "doc" | "file" | "url" | "report" | "memory" | "knowledge";
export type Target = "slice" | "knot";
export type AdvanceActor = "human" | "agent" | "judge";

export interface JudgeConfig {
  model?: string;                   // fixed judge model "provider/model[:thinking]"
  models?: Record<string, string>;  // glob(current session "provider/model") -> judge model; first match wins
  tools?: string[];                 // extra tool names appended to the default judge toolset
}

export interface JudgeVerdict {
  approved: boolean;
  reasons: string;
  unmet: string[];
  model: string; // resolved "provider/model[:thinking]" actually used (or "<id> (session fallback)")
  at: string;    // ISO
}

export interface SignoffArm {
  armed_at: string; // ISO; set in agent two-phase phase-1, cleared on advance/expiry
}

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
  advance_by: AdvanceActor[];
  judge: JudgeConfig | null;
  signoff_arm: SignoffArm | null;
  last_verdict: JudgeVerdict | null;
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
  advance_by?: AdvanceActor[]; // default ["human"]
  judge?: JudgeConfig;         // Phase B; per-knot override
}

export interface StrandTemplate {
  description: string;
  knots: StrandKnotTemplate[];
  judge?: JudgeConfig;         // Phase B; strand default
}

export interface ProjectConfig {
  project?: {
    name?: string;
    description?: string;
  };
  strands?: Record<string, StrandTemplate>;
  judge?: JudgeConfig;                     // project default
  agent_signoff_window_seconds?: number;   // default 300
  judge_timeout_seconds?: number;          // default 600
}

export function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Strand templates & seeding
// ---------------------------------------------------------------------------

export const DEFAULT_STRANDS: Record<string, StrandTemplate> = {
  spike: {
    description: "Throwaway experiments to explore and decide on a direction before committing to real implementation.",
    knots: [
      { name: "Setup", focus: "Frame the question/hypothesis, define what a useful answer looks like, and prepare a disposable experiment environment.", advance_by: ["agent"] },
      { name: "Experiment", focus: "Run the fastest experiments that produce real signal; optimize for learning, not production quality.", advance_by: ["agent"] },
      { name: "Decision", focus: "Capture findings and make a clear recommendation; record what to keep, discard, or follow up with a real slice.", advance_by: ["human"] },
    ],
  },
  quick: {
    description: "Small, well-scoped slices that need a compact path from proof to implementation.",
    knots: [
      { name: "Prototype", focus: "Establish a minimal, observable proof of the slice direction and de-risk the core approach.", advance_by: ["human"] },
      { name: "Realization", focus: "Implement the slice completely enough to satisfy its success criteria with real behavior and tests.", advance_by: ["agent"] },
      { name: "Finalization", focus: "Verify, document, clean up, and prepare the slice for sign-off.", advance_by: ["human"] },
    ],
  },
  "deep-research": {
    description: "Substantial research slices where a broad question must be scoped, sourced, analyzed, and synthesized into a cited answer.",
    knots: [
      { name: "Preparation", focus: "Broad source scouting and scope shaping: collect high-value sources, record decision points, and frame the research question.", advance_by: ["agent"] },
      { name: "DeepResearch", focus: "Targeted deep analysis of the selected sources: extract evidence, compare claims, and probe for gaps and contradictions.", advance_by: ["agent"] },
      { name: "Synthesis", focus: "Aggregate research outputs into the relevant findings: reconcile conflicts, separate signal from noise, and structure conclusions.", advance_by: ["agent"] },
      { name: "Finalization", focus: "Produce the final answer/report package with citations, reproducibility notes, and a confidence assessment.", advance_by: ["agent"] },
    ],
  },
  change: {
    description: "A scoped change to something that already exists: a targeted edit to existing components, patches, or configuration.",
    knots: [
      { name: "Scope", focus: "Pin down exactly what changes, why, the blast radius, and how the change will be verified.", advance_by: ["human"] },
      { name: "Patch", focus: "Make the focused change with minimal collateral impact and clear, reviewable diffs.", advance_by: ["agent"] },
      { name: "Verify", focus: "Confirm the change works and nothing relevant regressed, with evidence appropriate to the change.", advance_by: ["human"] },
    ],
  },
  granular: {
    description: "Complex or high-risk slices that benefit from multiple quality gates before release.",
    knots: [
      { name: "Proof-of-Work", focus: "Demonstrate feasibility, identify constraints, and prove the core work can be done.", advance_by: ["human"] },
      { name: "Alpha", focus: "Build the first functional implementation covering the main path with known gaps explicitly noted.", advance_by: ["agent"] },
      { name: "Beta", focus: "Harden behavior, cover important edge cases, and validate against realistic usage.", advance_by: ["agent"] },
      { name: "Gamma", focus: "Stabilize the slice, resolve remaining major issues, and prepare release-candidate quality.", advance_by: ["agent"] },
      { name: "RC1", focus: "Run release-candidate validation, catch regressions, and verify readiness against success criteria.", advance_by: ["agent"] },
      { name: "RC2", focus: "Perform final regression checks and polish after RC1 fixes, with no known critical blockers.", advance_by: ["human"] },
      { name: "Release", focus: "Finalize documentation, evidence, cleanup, and sign-off for production-ready completion.", advance_by: ["human"] },
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
      advance_by: k.advance_by && k.advance_by.length > 0 ? [...k.advance_by] : ["human"],
      judge: k.judge ?? null,
      signoff_arm: null,
      last_verdict: null,
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

function normalizeKnot(k: Knot): Knot {
  return {
    ...k,
    advance_by: Array.isArray(k.advance_by) && k.advance_by.length > 0 ? k.advance_by : ["human"],
    judge: k.judge ?? null,
    signoff_arm: k.signoff_arm ?? null,
    last_verdict: k.last_verdict ?? null,
    resources: k.resources ?? [],
    goals: k.goals ?? [],
    success_criteria: k.success_criteria ?? [],
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
    slices: [...(base.slices ?? [])]
      .map((s) => (s.strand ? { ...s, strand: { ...s.strand, knots: (s.strand.knots ?? []).map(normalizeKnot) } } : s))
      .sort(compareSlices),
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
  criteria?: string[];
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
  if (patch.criteria) slice.success_criteria = patch.criteria.map((text) => ({ text, met: false }));
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

/** Sign off the slice's active knot in place. Returns null on success, or an error tuple. */
function signOffActiveKnotInPlace(slice: Slice, message: string, evidence: string): { error: string; text: string } | null {
  const knot = getActiveKnot(slice);
  if (!knot) return { error: "no active knot", text: `Error: slice ${slice.id} has no active knot` };
  const unmet = knot.success_criteria.filter((c) => !c.met);
  if (unmet.length > 0) return { error: "unmet criteria", text: `Error: ${slice.id} → ${knot.name} has unmet criteria: ${unmet.map((c) => c.text).join("; ")}` };
  if (!evidence?.trim()) return { error: "missing evidence", text: "Error: validation evidence is required" };
  knot.status = "signed_off";
  knot.signed_off = true;
  knot.signed_off_message = message?.trim() || null;
  knot.validation_evidence_summary = evidence.trim();
  knot.completed_at = isoNow();
  knot.signoff_arm = null;
  slice.strand.current_knot = null;
  return null;
}

export function handleKnotSignOff(state: ProjectState, sliceId: string, message: string, evidence: string): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knotName = slice.strand.current_knot;
  const err = signOffActiveKnotInPlace(slice, message, evidence);
  if (err) return { text: err.text, state, error: err.error };
  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Signed off ${slice.id} → ${knotName}. ${tail}`, state: touch(normalizeState(current)) };
}

function elapsedSeconds(fromIso: string, nowIso: string): number {
  return (Date.parse(nowIso) - Date.parse(fromIso)) / 1000;
}

export function handleAgentSignOff(
  state: ProjectState,
  sliceId: string,
  message: string,
  evidence: string,
  now: string,
  windowSeconds: number
): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };

  if (!knot.advance_by.includes("agent")) {
    return {
      text: `Error: agent self-advance is not permitted for ${slice.id} → ${knot.name} (advance_by=[${knot.advance_by.join(", ")}]). Ask the user to sign off via /project:knot:advance ${slice.id}.`,
      state,
      error: "agent advance not permitted",
    };
  }

  const armedFresh = knot.signoff_arm && elapsedSeconds(knot.signoff_arm.armed_at, now) <= windowSeconds;

  if (!armedFresh) {
    knot.signoff_arm = { armed_at: now };
    const lines = [
      `ARMED ${slice.id} → ${knot.name}. This did NOT advance — it is a deliberate two-step confirmation.`,
      `Goals: ${knot.goals.length ? knot.goals.join("; ") : "(none set)"}`,
      `Success criteria:`,
      ...knot.success_criteria.map((c, i) => `  ${c.met ? "✓" : "○"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`),
      ``,
      `Verify every criterion with real evidence via verify_criterion. Once all are genuinely met, call knot:sign_off again WITH an evidence summary within ${windowSeconds}s to confirm. After that window this resets.`,
    ];
    // Arming is a successful state mutation, not an error. The extension wrapper
    // only persists non-error results, so returning an error here discards the
    // `signoff_arm` timestamp and causes every later call to re-arm forever.
    return { text: lines.join("\n"), state: touch(normalizeState(current)) };
  }

  // Within window → confirm.
  const err = signOffActiveKnotInPlace(slice, message, evidence);
  if (err) return { text: err.text, state, error: err.error }; // arm preserved (clone discarded)
  const next = firstPendingKnot(slice);
  const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
  return { text: `Agent-confirmed sign-off ${slice.id} → ${knot.name}. ${tail}`, state: touch(normalizeState(current)) };
}

export function applyJudgeVerdict(state: ProjectState, sliceId: string, verdict: JudgeVerdict): ActionResult {
  const current = cloneState(state);
  const slice = findSlice(current, sliceId);
  if (!slice) return { text: `Error: unknown slice ${sliceId}`, state, error: "unknown slice" };
  const knot = getActiveKnot(slice);
  if (!knot) return { text: `Error: slice ${slice.id} has no active knot`, state, error: "no active knot" };

  knot.last_verdict = verdict;

  if (verdict.approved) {
    for (const c of knot.success_criteria) {
      if (!c.met) {
        c.met = true;
        c.evidence = c.evidence ?? `judge-verified (${verdict.model})`;
        c.met_at = isoNow();
      }
    }
    const knotName = knot.name;
    const err = signOffActiveKnotInPlace(slice, `Judge approved (${verdict.model})`, `judge(${verdict.model}): ${verdict.reasons}`);
    if (err) return { text: err.text, state, error: err.error };
    const next = firstPendingKnot(slice);
    const tail = next ? `Next pending knot: ${next.name}.` : "All knots signed off — ready for slice sign-off.";
    return { text: `Judge APPROVED ${slice.id} → ${knotName}. ${tail}`, state: touch(normalizeState(current)) };
  }

  const note = `Judge rejection (${verdict.model}): ${verdict.reasons}${verdict.unmet.length ? ` | unmet: ${verdict.unmet.join("; ")}` : ""}`;
  knot.notes = knot.notes ? `${knot.notes}\n\n${note}` : note;
  return { text: `Judge REJECTED ${slice.id} → ${knot.name}: ${verdict.reasons}`, state: touch(normalizeState(current)) };
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
      return formatKnotAdvancementNext(slice, knot);
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

function formatKnotAdvancementNext(slice: Slice, knot: Knot): string {
  if (knot.advance_by.includes("agent")) {
    const action = `project_tracker action=knot:sign_off slice_id=${slice.id}`;
    if (knot.signoff_arm) {
      return `${slice.id} → ${knot.name} is armed for agent sign-off; confirm with ${action} evidence=<summary> within the configured freshness window.`;
    }
    return `${slice.id} → ${knot.name} is ready for agent sign-off (${action}; first call arms, second call confirms with evidence).`;
  }

  if (knot.advance_by.includes("judge")) {
    return `${slice.id} → ${knot.name} is ready for judge sign-off (project_tracker action=knot:judge slice_id=${slice.id}; /project:knot:advance ${slice.id} overrides).`;
  }

  return `${slice.id} → ${knot.name} is ready for user sign-off (/project:knot:advance ${slice.id})`;
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
