import type { ProjectInfo, Slice, Knot, JudgeConfig } from "./project-tracker-core.js";

export const DEFAULT_JUDGE_TOOLS = ["read", "grep", "find", "ls", "bash", "project_knowledge"];

export interface RawVerdict {
  approved: boolean;
  reasons: string;
  unmet: string[];
}

export interface ParsedJudgeModel {
  provider: string;
  model: string;
  thinking?: string;
}

export function parseJudgeModel(spec: string): ParsedJudgeModel | null {
  if (!spec || !spec.includes("/")) return null;
  const slash = spec.indexOf("/");
  const provider = spec.slice(0, slash).trim();
  let rest = spec.slice(slash + 1).trim();
  if (!provider || !rest) return null;
  let thinking: string | undefined;
  const colon = rest.lastIndexOf(":");
  if (colon !== -1) {
    thinking = rest.slice(colon + 1).trim() || undefined;
    rest = rest.slice(0, colon).trim();
  }
  if (!rest) return null;
  return thinking ? { provider, model: rest, thinking } : { provider, model: rest };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchModelGlob(pattern: string, value: string): boolean {
  const rx = new RegExp("^" + pattern.toLowerCase().split("*").map(escapeRegex).join(".*") + "$");
  return rx.test(value.toLowerCase());
}

export function resolveJudgeConfig(
  knot?: JudgeConfig | null,
  strand?: JudgeConfig | null,
  project?: JudgeConfig | null
): JudgeConfig {
  return knot ?? strand ?? project ?? {};
}

export type JudgeModelResolution =
  | { fromSession: true }
  | { fromSession: false; provider: string; model: string; thinking?: string; spec: string };

export function resolveJudgeModel(cfg: JudgeConfig, sessionModelId: string): JudgeModelResolution {
  if (cfg.models) {
    for (const [pattern, spec] of Object.entries(cfg.models)) {
      if (matchModelGlob(pattern, sessionModelId)) {
        const parsed = parseJudgeModel(spec);
        if (parsed) return { fromSession: false, ...parsed, spec };
      }
    }
  }
  if (cfg.model) {
    const parsed = parseJudgeModel(cfg.model);
    if (parsed) return { fromSession: false, ...parsed, spec: cfg.model };
  }
  return { fromSession: true };
}

export function resolveJudgeTools(cfg: JudgeConfig): string[] {
  return [...new Set([...DEFAULT_JUDGE_TOOLS, ...(cfg.tools ?? [])])];
}

export function judgePreflight(slice: Slice): { ok: true; knot: Knot } | { ok: false; error: string } {
  const knot = slice.strand.knots.find((k) => k.name === slice.strand.current_knot);
  if (!knot) return { ok: false, error: `slice ${slice.id} has no active knot to judge` };
  if (!knot.advance_by.includes("judge")) {
    return { ok: false, error: `knot ${knot.name} does not use a judge (advance_by=[${knot.advance_by.join(", ")}])` };
  }
  return { ok: true, knot };
}

export function buildJudgeSystemPrompt(): string {
  return [
    "You are an independent quality auditor for a software project. You do NOT implement, modify, or fix anything.",
    "Your job: decide whether the active knot genuinely satisfies its goals and success criteria, then submit a verdict.",
    "Rules:",
    "- Use `project_knowledge` in query/read mode ONLY — never create or edit entries.",
    "- Use `bash` ONLY for read-only or mandatory verification commands needed to judge (run existing tests/build/lint, inspect state). Never modify files, git state, or external systems.",
    "- Prefer read/grep/find/ls for inspection.",
    "- Consult `project_knowledge` for constraints, decisions, and rejected approaches, and check the work against them.",
    "- Approve only if EVERY success criterion is genuinely satisfied by real, observable behavior. When unsure, reject with specifics.",
    "When finished, call `submit_verdict` exactly once with your decision, concise reasons, and any unmet criteria.",
  ].join("\n");
}

function formatCriteria(list: { text: string; met: boolean; evidence?: string }[]): string {
  if (list.length === 0) return "  (none)";
  return list
    .map((c, i) => `  ${c.met ? "[claimed met]" : "[unmet]"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`)
    .join("\n");
}

export function buildJudgeAuditPrompt(project: ProjectInfo, slice: Slice, knot: Knot): string {
  return [
    `# Audit request`,
    `Project: ${project.name}${project.description ? ` — ${project.description}` : ""}`,
    ``,
    `## Slice: ${slice.id} — ${slice.name}`,
    slice.description,
    `Slice goal: ${slice.goal}`,
    `Slice-level success criteria:`,
    formatCriteria(slice.success_criteria),
    ``,
    `## Strand: ${slice.strand.name}`,
    `## Knot under review: ${knot.name}`,
    `Focus: ${knot.focus}`,
    `Knot goals: ${knot.goals.length ? knot.goals.join("; ") : "(none)"}`,
    `Knot success criteria (the agent CLAIMS these are met — verify independently):`,
    formatCriteria(knot.success_criteria),
    ``,
    `Independently verify each criterion against the actual repository state in this working directory.`,
    `Run the project's existing tests/checks if relevant. Consult project_knowledge for constraints and rejected approaches.`,
    `Then call submit_verdict. Approve ONLY if every criterion is genuinely satisfied.`,
  ].join("\n");
}
