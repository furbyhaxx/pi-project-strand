# Knot Judge (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `advance_by: ["judge"]` by auditing a knot in an isolated clean-room pi sub-session (chosen via a pattern→model map or fixed config, falling back to the session model) that approves → advances the knot, or rejects → records the verdict.

**Architecture:** Pure helpers in `extensions/judge-core.ts` (model-string parsing, glob matching, config/model/tool resolution, prompt builders, preflight) and `applyJudgeVerdict` in `extensions/project-tracker-core.ts`. The SDK orchestration lives in `extensions/judge.ts` (`runJudgeSession`, imported not registered). The wrapper `extensions/project-tracker.ts` adds a `knot:judge` action + `/project:knot:judge` command that resolve config → run the judge → apply the verdict.

**Tech Stack:** TypeScript (jiti, no build), `@earendil-works/pi-coding-agent` SDK (`createAgentSession`, `defineTool`, `SessionManager.inMemory`, `AuthStorage`, `ModelRegistry`, `resourceLoaderOptions`), `@earendil-works/pi-ai` (`getModel`, `Model`, `ThinkingLevel`), TypeBox, Vitest. Gate: `npm test`.

**Spec:** `docs/plans/2026-06-04-judge-phase-b-design.md` (read first).

**Conventions (AGENTS.md):** core files pure (no pi/SDK imports, no I/O); `StringEnum` not `Type.Union`; throw or in-band errors (never crash the calling tool); file-mutating wrappers use `withFileMutationQueue` (already in `mutateState`); `npm test` green before commits; conventional commits; CHANGELOG; minor bump on ship (0.5.0 → 0.6.0).

**Coverage boundary (explicit):** `runJudgeSession` spawns a real model session — it is verified by a **load smoke** + **manual end-to-end**, not a unit test. All pure pieces (parse/match/resolve/prompt/verdict-apply/preflight) ARE unit-tested.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `extensions/judge-core.ts` | Pure: `parseJudgeModel`, `matchModelGlob`, `resolveJudgeConfig`, `resolveJudgeModel`, `resolveJudgeTools`, `judgePreflight`, `buildJudgeSystemPrompt`, `buildJudgeAuditPrompt`, `DEFAULT_JUDGE_TOOLS`, `RawVerdict` | **Create** |
| `extensions/judge.ts` | SDK clean-room session runner `runJudgeSession` (imported, not registered) | **Create** |
| `extensions/project-tracker-core.ts` | Extend `JudgeConfig`; add `JudgeVerdict` + `Knot.last_verdict`; `judge_timeout_seconds` on config; `applyJudgeVerdict`; seed/normalize `last_verdict` | **Modify** |
| `extensions/project-tracker.ts` | `knot:judge` action + `/project:knot:judge` command + `judgeTimeoutSeconds` config + context line | **Modify** |
| `extensions/superpowers-bootstrap.ts`, `skills/frs-strategy/SKILL.md` | Document the judge path | **Modify (subagent)** |
| `tests/extension/judge-core.test.ts` | Unit tests for judge-core | **Create** |
| `tests/extension/project-tracker.test.ts` | `applyJudgeVerdict` + seed/normalize `last_verdict` tests | **Modify** |
| `CHANGELOG.md`, `package.json` | Changelog + v0.6.0 | **Modify** |

**Phase ordering:** 1 (tracker-core data + applyJudgeVerdict) → 2 (judge-core helpers) → 3 (judge.ts runner) → 4 (wrapper wiring) → 5 (docs subagent) → 6 (finalize). Inline spine: 1–4. Subagent: 5. Inline finalize: 6.

---

## Phase 1 — tracker-core: verdict data + apply

### Task 1: Extend `JudgeConfig`, add `JudgeVerdict` + `Knot.last_verdict` + config field

**Files:** Modify `extensions/project-tracker-core.ts`, `tests/extension/project-tracker.test.ts`

- [ ] **Step 1: Replace the Phase-A `JudgeConfig`** (currently `export interface JudgeConfig { model: string; }`) with:

```ts
export interface JudgeConfig {
  model?: string;                   // fixed judge model "provider/model[:thinking]"
  models?: Record<string, string>;  // glob(current session "provider/model") -> judge model; first match wins
  tools?: string[];                 // extra tool names appended to the default judge toolset
}

export interface JudgeVerdict {
  approved: boolean;
  reasons: string;
  unmet: string[];
  model: string;   // resolved "provider/model[:thinking]" actually used (or "<id> (session fallback)")
  at: string;      // ISO
}
```

- [ ] **Step 2: Add `last_verdict` to `Knot`.** In the `Knot` interface, after `signoff_arm: SignoffArm | null;` add:

```ts
  last_verdict: JudgeVerdict | null;
```

- [ ] **Step 3: Add the timeout config field.** In `ProjectConfig`, after `agent_signoff_window_seconds?: number;` add:

```ts
  judge_timeout_seconds?: number;          // default 600
```

- [ ] **Step 4: Seed + normalize `last_verdict`.** In `seedStrand`'s knot map add `last_verdict: null,` (next to `signoff_arm: null,`). In `normalizeKnot` add `last_verdict: k.last_verdict ?? null,`.

- [ ] **Step 5: Write the failing test.** Append to the "seeding" describe block in `tests/extension/project-tracker.test.ts`:

```ts
  test("seedStrand + normalize default last_verdict to null", () => {
    expect(seedStrand("quick", quick).knots.every((k) => k.last_verdict === null)).toBe(true);
    const base = withSlice();
    delete (base.slices[0]!.strand.knots[0] as any).last_verdict;
    const norm = normalizeState(base, { project: { name: "EdgeOS" } }, "fallback");
    expect(norm.slices[0]!.strand.knots[0]!.last_verdict).toBeNull();
  });
```

- [ ] **Step 6: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "last_verdict"`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker.test.ts
git commit -m "feat(tracker): JudgeConfig (model/models/tools), JudgeVerdict, knot.last_verdict"
```

### Task 2: `applyJudgeVerdict`

**Files:** Modify `extensions/project-tracker-core.ts`, `tests/extension/project-tracker.test.ts`

- [ ] **Step 1: Write the failing tests.** Append a new describe block to `tests/extension/project-tracker.test.ts`:

```ts
describe("applyJudgeVerdict", () => {
  function activeJudgeKnot() {
    // put dns-cache on an active knot; advance_by content is irrelevant to applyJudgeVerdict
    let s = handleSliceActivate(withSlice(), "dns-cache").state;
    s = handleKnotStart(s, { slice_id: "dns-cache", knot: "Prototype", goals: [], criteria: ["c1", "c2"] }).state;
    return s;
  }
  const v = (approved: boolean): any => ({ approved, reasons: approved ? "all good" : "missing tests", unmet: approved ? [] : ["c2"], model: "anthropic/claude-opus-4-8:high", at: "2026-06-04T00:00:00.000Z" });

  test("approve marks criteria met (judge-verified), advances, records verdict", () => {
    const r = applyJudgeVerdict(activeJudgeKnot(), "dns-cache", v(true));
    expect(r.error).toBeUndefined();
    const knot = r.state.slices[0]!.strand.knots[0]!;
    expect(knot.status).toBe("signed_off");
    expect(knot.success_criteria.every((c) => c.met)).toBe(true);
    expect(knot.validation_evidence_summary).toContain("judge(anthropic/claude-opus-4-8:high)");
    expect(knot.last_verdict!.approved).toBe(true);
    expect(r.state.slices[0]!.strand.current_knot).toBeNull();
  });

  test("reject records verdict + note, does not advance", () => {
    const r = applyJudgeVerdict(activeJudgeKnot(), "dns-cache", v(false));
    expect(r.error).toBeUndefined();
    const knot = r.state.slices[0]!.strand.knots[0]!;
    expect(knot.status).toBe("active");
    expect(knot.last_verdict!.approved).toBe(false);
    expect(knot.notes).toContain("Judge rejection");
    expect(knot.notes).toContain("missing tests");
    expect(r.state.slices[0]!.strand.current_knot).toBe("Prototype");
  });
});
```

Add `applyJudgeVerdict` to the test file's import list from `../../extensions/project-tracker-core.js`.

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "applyJudgeVerdict"`
Expected: FAIL — `applyJudgeVerdict` undefined.

- [ ] **Step 3: Implement.** Add to `extensions/project-tracker-core.ts` (after `handleAgentSignOff`, so `signOffActiveKnotInPlace`/`firstPendingKnot`/`getActiveKnot` are in scope):

```ts
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
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/project-tracker.test.ts -t "applyJudgeVerdict"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/project-tracker-core.ts tests/extension/project-tracker.test.ts
git commit -m "feat(tracker): applyJudgeVerdict (approve advances + marks criteria; reject records)"
```

---

## Phase 2 — judge-core (pure helpers)

### Task 3: `judge-core.ts` + tests

**Files:** Create `extensions/judge-core.ts`, `tests/extension/judge-core.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/extension/judge-core.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  parseJudgeModel,
  matchModelGlob,
  resolveJudgeConfig,
  resolveJudgeModel,
  resolveJudgeTools,
  judgePreflight,
  buildJudgeAuditPrompt,
  DEFAULT_JUDGE_TOOLS,
} from "../../extensions/judge-core.js";

describe("parseJudgeModel", () => {
  test("parses provider/model:thinking", () => {
    expect(parseJudgeModel("anthropic/claude-opus-4-8:high")).toEqual({ provider: "anthropic", model: "claude-opus-4-8", thinking: "high" });
  });
  test("parses without thinking", () => {
    expect(parseJudgeModel("github-copilot/claude-opus-4.8")).toEqual({ provider: "github-copilot", model: "claude-opus-4.8" });
  });
  test("rejects malformed", () => {
    expect(parseJudgeModel("noslash")).toBeNull();
    expect(parseJudgeModel("")).toBeNull();
  });
});

describe("matchModelGlob", () => {
  test("wildcards, case-insensitive", () => {
    expect(matchModelGlob("*gpt*5*", "openai/GPT-5-turbo")).toBe(true);
    expect(matchModelGlob("anthropic/claude-opus*", "anthropic/claude-opus-4-8")).toBe(true);
    expect(matchModelGlob("*gpt*5*", "anthropic/claude-opus-4-8")).toBe(false);
  });
  test("literal requires full match", () => {
    expect(matchModelGlob("openai/gpt-5", "openai/gpt-5")).toBe(true);
    expect(matchModelGlob("openai/gpt-5", "openai/gpt-5-turbo")).toBe(false);
  });
});

describe("resolveJudgeConfig + resolveJudgeModel + resolveJudgeTools", () => {
  test("knot wins over strand over project", () => {
    expect(resolveJudgeConfig({ model: "k/k" }, { model: "s/s" }, { model: "p/p" })).toEqual({ model: "k/k" });
    expect(resolveJudgeConfig(null, { model: "s/s" }, { model: "p/p" })).toEqual({ model: "s/s" });
    expect(resolveJudgeConfig(null, null, null)).toEqual({});
  });
  test("model map: first match wins, then fixed, then session", () => {
    const cfg = { models: { "*gpt*5*": "github-copilot/claude-opus-4.8:high", "*": "anthropic/claude-opus-4-8" }, model: "fixed/fixed" };
    expect(resolveJudgeModel(cfg, "openai/gpt-5")).toMatchObject({ fromSession: false, provider: "github-copilot", model: "claude-opus-4.8", thinking: "high" });
    expect(resolveJudgeModel({ model: "anthropic/claude-opus-4-8:max" }, "openai/gpt-5")).toMatchObject({ fromSession: false, model: "claude-opus-4-8", thinking: "max" });
    expect(resolveJudgeModel({}, "openai/gpt-5")).toEqual({ fromSession: true });
  });
  test("tools default + append + dedupe", () => {
    expect(resolveJudgeTools({})).toEqual(DEFAULT_JUDGE_TOOLS);
    expect(resolveJudgeTools({ tools: ["web_search", "bash"] })).toEqual([...DEFAULT_JUDGE_TOOLS, "web_search"]);
  });
});

describe("judgePreflight + buildJudgeAuditPrompt", () => {
  const slice: any = {
    id: "dns", name: "DNS", description: "d", goal: "cut latency",
    success_criteria: [{ text: "p99<1ms", met: false }],
    strand: { name: "quick", current_knot: "Realization", knots: [
      { name: "Prototype", advance_by: ["human"], status: "signed_off", focus: "f0", goals: [], success_criteria: [] },
      { name: "Realization", advance_by: ["judge"], status: "active", focus: "build it", goals: ["g1"], success_criteria: [{ text: "tests pass", met: false }] },
    ] },
  };
  test("preflight ok only when active knot uses judge", () => {
    expect(judgePreflight(slice).ok).toBe(true);
    const noJudge = { ...slice, strand: { ...slice.strand, current_knot: "Prototype" } };
    const r = judgePreflight(noJudge as any);
    expect(r.ok).toBe(false);
  });
  test("audit prompt embeds goal, knot focus, criteria", () => {
    const p = buildJudgeAuditPrompt({ name: "EdgeOS", description: "router", updated_at: "" }, slice, slice.strand.knots[1]);
    expect(p).toContain("cut latency");
    expect(p).toContain("build it");
    expect(p).toContain("tests pass");
  });
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/judge-core.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Create `extensions/judge-core.ts`:

```ts
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
    "- Use `bash` ONLY for read-only or mandatory verification commands (run existing tests/build/lint, inspect state). Never modify files, git state, or external systems.",
    "- Prefer read/grep/find/ls for inspection.",
    "- Consult `project_knowledge` for constraints, decisions, and rejected approaches, and check the work against them.",
    "- Approve only if EVERY success criterion is genuinely satisfied by real, observable behavior. When unsure, reject with specifics.",
    "When finished, call `submit_verdict` exactly once with your decision, concise reasons, and any unmet criteria.",
  ].join("\n");
}

function formatCriteria(list: { text: string; met: boolean; evidence?: string }[]): string {
  if (list.length === 0) return "  (none)";
  return list.map((c, i) => `  ${c.met ? "[claimed met]" : "[unmet]"} [${i}] ${c.text}${c.evidence ? ` — ${c.evidence}` : ""}`).join("\n");
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
```

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/judge-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/judge-core.ts tests/extension/judge-core.test.ts
git commit -m "feat(judge): pure judge-core helpers (model parse/glob/resolve, tools, preflight, prompts)"
```

---

## Phase 3 — judge.ts (SDK clean-room runner)

### Task 4: `runJudgeSession`

**Files:** Create `extensions/judge.ts`

- [ ] **Step 1: Implement.** Create `extensions/judge.ts`:

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { RawVerdict } from "./judge-core.js";

function knowledgeExtPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "project-knowledge.ts");
}

export interface RunJudgeOptions {
  cwd: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: string[];
  systemPrompt: string;
  auditPrompt: string;
  timeoutMs: number;
}

export interface RunJudgeResult {
  verdict: RawVerdict | null;
  error?: string;
}

export async function runJudgeSession(opts: RunJudgeOptions): Promise<RunJudgeResult> {
  let captured: RawVerdict | null = null;

  const submitVerdict = defineTool({
    name: "submit_verdict",
    label: "Submit Verdict",
    description: "Submit your final audit verdict. Call this exactly once when you are done auditing.",
    parameters: Type.Object(
      {
        approved: Type.Boolean({ description: "True only if every success criterion is genuinely satisfied" }),
        reasons: Type.String({ description: "Concise justification for the decision" }),
        unmet_criteria: Type.Array(Type.String(), { description: "Criteria not satisfied (empty if approved)" }),
      },
      { additionalProperties: false }
    ),
    execute: async (_id, p) => {
      captured = { approved: p.approved, reasons: p.reasons, unmet: p.unmet_criteria ?? [] };
      return { content: [{ type: "text", text: "Verdict recorded." }], details: { ...captured }, terminate: true };
    },
  });

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
    cwd: opts.cwd,
    model: opts.model,
    thinkingLevel: opts.thinkingLevel,
    tools: [...opts.tools, "submit_verdict"],
    customTools: [submitVerdict],
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      additionalExtensionPaths: [knowledgeExtPath()],
      systemPromptOverride: () => opts.systemPrompt,
    },
  });

  try {
    let timedOut = false;
    const timeout = new Promise<void>((resolve) => setTimeout(() => { timedOut = true; resolve(); }, opts.timeoutMs));
    await Promise.race([session.prompt(opts.auditPrompt), timeout]);
    if (timedOut && !captured) {
      await session.abort().catch(() => {});
      return { verdict: null, error: `judge timed out after ${Math.round(opts.timeoutMs / 1000)}s` };
    }
    if (!captured) return { verdict: null, error: "judge ended without submitting a verdict" };
    return { verdict: captured };
  } catch (e) {
    return { verdict: null, error: `judge session error: ${(e as Error).message}` };
  } finally {
    session.dispose();
  }
}
```

- [ ] **Step 2: Load smoke (no model spawned — just verify the module imports and the tool/option construction don't throw at import time).**

Run:
```bash
cd <repo> && printf 'import { runJudgeSession } from "./extensions/judge.ts"; console.log("judge runner:", typeof runJudgeSession)\n' > ./_s.ts && npx jiti ./_s.ts && rm -f ./_s.ts
```
Expected: prints `judge runner: function`.

- [ ] **Step 3: Commit.**

```bash
git add extensions/judge.ts
git commit -m "feat(judge): clean-room SDK runner (runJudgeSession) with submit_verdict + timeout"
```

> If `Model`/`ThinkingLevel` are not exported from `@earendil-works/pi-ai`, import them from `@earendil-works/pi-coding-agent` instead (grep its `dist/*.d.ts` for `ThinkingLevel`/`export type Model`). Adjust the import line; everything else stays.

---

## Phase 4 — wrapper: knot:judge action + command

### Task 5: Config window, `knot:judge` action, `/project:knot:judge`, context line

**Files:** Modify `extensions/project-tracker.ts`

- [ ] **Step 1: Imports.** Add to the `./project-tracker-core.js` import block: `applyJudgeVerdict`, `type ProjectInfo`. Add new imports:

```ts
import { getModel } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import { runJudgeSession } from "./judge.js";
import { judgePreflight, resolveJudgeConfig, resolveJudgeModel, resolveJudgeTools, buildJudgeSystemPrompt, buildJudgeAuditPrompt } from "./judge-core.js";
```

(If `getModel`/`ThinkingLevel` live in `@earendil-works/pi-coding-agent` in this version, import from there — grep to confirm, same as Task 4's note.)

- [ ] **Step 2: Add `judgeTimeoutSeconds` to `loadProjectConfig`.** Next to `signoffWindowSeconds`:

```ts
  const judgeTimeoutSeconds =
    typeof config.judge_timeout_seconds === "number" && config.judge_timeout_seconds > 0
      ? config.judge_timeout_seconds
      : 600;
```

Add `judgeTimeoutSeconds` to the returned object and its return-type annotation (alongside `signoffWindowSeconds: number`).

- [ ] **Step 3: Add the shared judge orchestrator** (place above `export default function`):

```ts
async function runKnotJudge(ctx: ExtensionCommandContext | ExtensionContext, sliceId: string): Promise<{ text: string; error?: string }> {
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
  let thinkingLevel = ctx.thinkingLevel as ThinkingLevel;
  let modelSpec: string;
  if (resolution.fromSession) {
    if (!model) return { text: "Error: no judge model configured and no active session model to fall back to.", error: "no model" };
    modelSpec = `${model.provider}/${model.id} (session fallback)`;
  } else {
    const resolved = getModel(resolution.provider, resolution.model);
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
```

- [ ] **Step 4: Add `knot:judge` to the action enum** (in `ProjectTrackerParams`, add `"knot:judge"` after `"knot:complete_fast_forward"`).

- [ ] **Step 5: Handle the action** in the execute switch (note: this runs a sub-session, so it isn't wrapped in `mutateState` — `runKnotJudge` does its own state read + `mutateState` for the verdict):

```ts
        case "knot:judge": {
          const r = await runKnotJudge(ctx, params.slice_id ?? "");
          const { state } = await loadState(ctx.cwd);
          result = { text: r.text, state, ...(r.error ? { error: r.error } : {}) };
          break;
        }
```

- [ ] **Step 6: Register the command** (after `/project:knot:fast_forward`):

```ts
  pi.registerCommand("project:knot:judge", {
    description: "Run the judge to audit a slice's active knot and advance it if approved",
    handler: async (args, ctx) => {
      const sliceId = args.trim();
      if (!sliceId) { ctx.ui.notify("Usage: /project:knot:judge <slice-id>", "warning"); return; }
      ctx.ui.notify(`Running judge for ${sliceId}… (this spawns an auditor session)`, "info");
      const r = await runKnotJudge(ctx, sliceId);
      await updateWidget(ctx);
      await showText(ctx, "Judge", r.text);
    },
  });
```

- [ ] **Step 7: Update the context line** in `buildProjectStrandContext`. Replace the existing non-agent branch so judge knots name the concrete path and surface a prior rejection:

```ts
    if (knot.advance_by.includes("agent")) {
      parts.push(`${slice.id} → ${knot.name}: agent self-advance ALLOWED (advance_by=[${knot.advance_by.join(", ")}]). Protocol: verify all criteria, then knot:sign_off (arms + returns the checklist) → knot:sign_off WITH evidence within the freshness window to confirm.`);
    } else if (knot.advance_by.includes("judge")) {
      const last = knot.last_verdict && !knot.last_verdict.approved ? ` Last judge verdict: REJECTED — ${knot.last_verdict.reasons}` : "";
      parts.push(`${slice.id} → ${knot.name}: advance via the judge — project_tracker action=knot:judge slice_id=${slice.id} (or /project:knot:advance to override).${last}`);
    } else {
      parts.push(`${slice.id} → ${knot.name}: agent self-advance NOT allowed (advance_by=[${knot.advance_by.join(", ")}]). Advance via /project:knot:advance ${slice.id}.`);
    }
```

(Replace the previous two-branch `parts.push(... ? ... : ...)` block for active knots with this three-branch version.)

- [ ] **Step 8: Run the suite + load smoke.**

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all pass. Then:
`cd <repo> && printf 'import m from "./extensions/project-tracker.ts"; console.log(typeof m)\n' > ./_s.ts && npx jiti ./_s.ts && rm -f ./_s.ts`
Expected: `function`.

- [ ] **Step 9: Commit.**

```bash
git add extensions/project-tracker.ts
git commit -m "feat(tracker): knot:judge action + /project:knot:judge command + judge timeout config"
```

---

## Phase 5 — docs (subagent leaf)

### Task 6: Document the judge in bootstrap + frs-strategy

**Files:** Modify `extensions/superpowers-bootstrap.ts`, `tests/extension/superpowers-bootstrap.test.ts`, `skills/frs-strategy/SKILL.md`

- [ ] **Step 1: Update the bootstrap test.** Add to `tests/extension/superpowers-bootstrap.test.ts`:

```ts
test("bootstrap documents the judge path", () => {
  const text = buildProjectStrandBootstrap();
  expect(text).toContain("knot:judge");
});
```

- [ ] **Step 2: Run, expect failure.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts -t "judge path"`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `buildProjectStrandBootstrap()`'s advance-policy paragraph, extend the judge sentence to:

```
When a knot's advance_by includes `judge`, advancement is gated by an independent auditor running in its own clean-room session: call `project_tracker action=knot:judge slice_id=<id>` (or `/project:knot:judge <id>`); it approves and advances, or rejects with reasons recorded on the knot. You can always override with `/project:knot:advance`.
```

In `skills/frs-strategy/SKILL.md` (BODY only, not the `description` frontmatter), extend the "Advancement policy" section with a "Judge" subsection: the judge audits the active knot against the slice/knot goals + success criteria in a clean-room session; configured via `judge.model` / `judge.models` (pattern→model map on the current session model) / `judge.tools`, resolved knot→strand→project, falling back to the session model; invoked by `knot:judge` (agent) or `/project:knot:judge` (user); approve advances, reject records `last_verdict` + a note.

- [ ] **Step 4: Run, expect pass.**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts && npm test -- tests/skills`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add extensions/superpowers-bootstrap.ts tests/extension/superpowers-bootstrap.test.ts skills/frs-strategy/SKILL.md
git commit -m "docs: document the knot judge path in bootstrap and frs-strategy"
```

---

## Phase 6 — finalize

### Task 7: Changelog, version bump, gate, manual note, merge

**Files:** Modify `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]` add `## [0.6.0] - 2026-06-04` with: judge enforcement of `advance_by:["judge"]`; `knot:judge` action + `/project:knot:judge` command; clean-room judge sub-session (read-only knowledge + verification-only bash + `submit_verdict`); `judge.model`/`judge.models` (pattern→model map)/`judge.tools` config resolved knot→strand→project with session-model fallback; `judge_timeout_seconds` (default 600); `knot.last_verdict`.

- [ ] **Step 2: Version bump.** `package.json` `0.5.0` → `0.6.0`. Add a fresh empty `## [Unreleased]` above `## [0.6.0]`.

- [ ] **Step 3: Full gate.**

Run: `npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all green.

- [ ] **Step 4: Manual end-to-end (document, do not automate).** In a scratch project with `advance_by:["judge"]` on an active knot and a configured judge model, run `/project:knot:judge <slice>` and confirm: a sub-session runs, a verdict returns, approve advances the knot, reject records `last_verdict`. Note the result in the PR/commit message. (This is the accepted manual coverage for the live sub-session.)

- [ ] **Step 5: Commit + merge.**

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): v0.6.0 — knot judge (Phase B)"
git checkout main
git merge --no-ff feat/judge-phase-b -m "Merge feat/judge-phase-b: knot judge sub-session (v0.6.0)"
npm test 2>&1 | grep -E "Tests "
git branch -d feat/judge-phase-b
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §3 config (`JudgeConfig` model/models/tools, resolution, `judge_timeout_seconds`) → Tasks 1, 3, 5.
- §4 data model (`JudgeVerdict`, `last_verdict`, seed/normalize) → Task 1.
- §5 module layout (judge-core / judge.ts / applyJudgeVerdict / wrapper) → Tasks 2, 3, 4, 5.
- §6 trigger flow (preflight, resolve, run, apply; agent action + human command) → Tasks 3, 5.
- §7 clean-room session (noExtensions/noSkills, additionalExtensionPaths knowledge, system prompt, audit prompt, toolset) → Tasks 3, 4.
- §8 verdict capture + timeout + in-band errors → Task 4.
- §9 context line update → Task 5 step 7.
- §10 testing (pure helpers unit-tested; runner load-smoke + manual) → Tasks 1–4 tests, Task 7 step 4.
- §3 model-pattern map → Task 3 (`resolveJudgeModel` + `matchModelGlob`) + Task 5 (session-model id from `ctx.model`).

**Known gaps surfaced (not silently dropped):**
- `runJudgeSession` has no unit test (spawns a real model). Covered by the Task 4 load smoke + Task 7 manual e2e — stated as the accepted boundary.
- `getModel`/`Model`/`ThinkingLevel` import source is version-dependent; Tasks 4 & 5 include a grep-and-adjust note.
- The judge's `tools` whitelist assumes `project_knowledge` (from `additionalExtensionPaths`) is enabled by name; if the SDK auto-enables extension tools regardless, listing it is harmless.

**Type consistency:** `JudgeConfig`/`JudgeVerdict`/`RawVerdict` shapes match across judge-core, judge.ts, tracker-core, and wrapper. `runJudgeSession` returns `{verdict: RawVerdict|null, error?}`; the wrapper stamps `model`+`at` to build the full `JudgeVerdict` for `applyJudgeVerdict`. `resolveJudgeModel` return union (`fromSession` vs concrete) is consumed exactly in Task 5.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; test steps show real assertions + exact commands with expected results.
