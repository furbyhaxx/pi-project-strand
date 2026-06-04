# Design: Knot Judge (Phase B of the advancement policy)

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Builds on:** v0.5.0 advancement policy (`docs/plans/2026-06-03-knot-advancement-policy-design.md` §10). Phase A shipped `advance_by` with `judge` accepted-but-not-enforced; this enforces it.
- **SDK:** `@earendil-works/pi-coding-agent` v0.75.3 — `createAgentSession`, `defineTool`, `getModel`, `AuthStorage`, `ModelRegistry`, `SessionManager.inMemory`, `resourceLoaderOptions: { noExtensions, noSkills, additionalExtensionPaths, systemPromptOverride }` all confirmed present.

---

## 1. What this adds

When a knot's `advance_by` includes `judge`, advancement can be gated by an **independent auditor agent** running in its own clean-room pi session. The judge reviews the knot against the project's, slice's, strand's, and knot's goals/criteria (and the recorded project knowledge), then **approves** (advances the knot) or **rejects** (records why and leaves it). This enables autonomous-but-audited strands: e.g. `granular.Release = advance_by:["judge"]` ships only when an opus-tier judge signs off.

## 2. Decisions (from brainstorming)

1. **Trigger:** a `knot:judge` tool action (agent self-requests) **and** a `/project:knot:judge <slice>` command (human-triggered). Both run the same audit.
2. **Judge session is clean-room:** `noExtensions: true`, `noSkills: true`, focused judge system prompt, running in the project `cwd`. This prevents the judge from seeing `project_tracker` (no self-advance recursion) or the FRS bootstrap.
3. **Judge toolset (default):** `read`, `grep`, `find`, `ls`, `bash`, `project_knowledge` (loaded explicitly so it can consult decisions/constraints/warnings/rejected approaches), and a custom `submit_verdict`. **Plus** a configurable `judge.tools` allowlist that **appends** to these defaults.
4. **Model:** `provider/model:thinking`, resolved **knot → strand → project**; if unset anywhere, **fall back to the calling session's model + thinking** (with a warning to configure a dedicated judge).
5. **Reject:** store a `last_verdict` and append a note on the knot; return the reasons to the caller so the agent fixes them and re-requests. **Approve:** advance the knot (the unconditional primitive) with judge-sourced evidence.
6. **Timeout:** the judge runs synchronously inside the tool/command; default **600s** (`judge_timeout_seconds`), then abort + inconclusive.

## 3. Config (`.pi/project.jsonc`)

`JudgeConfig` (Phase A had `{ model: string }`; extended):

```jsonc
{
  "judge_timeout_seconds": 600,                 // optional, default 600
  "judge": { "model": "anthropic/claude-opus-4-8:high", "tools": ["web_search"] }, // project default
  "strands": {
    "granular": {
      "judge": { "model": "anthropic/claude-opus-4-8:high" },   // strand default
      "knots": [
        { "name": "Release", "advance_by": ["judge"],
          "judge": { "model": "anthropic/claude-opus-4-8:max", "tools": ["web_search"] } } // knot override
      ]
    }
  }
}
```

```ts
export interface JudgeConfig {
  model?: string;                   // fixed judge model "provider/model[:thinking]"
  models?: Record<string, string>;  // glob(current session "provider/model") -> judge model; first match wins
  tools?: string[];                 // extra tool names appended to the default judge toolset
}
```

Example with the conditional pattern map (project-level): use a cross-model judge when the session runs a GPT-5-class model, otherwise fall back to the session model.

```jsonc
"judge": {
  "models": {
    "*gpt*5*": "github-copilot/claude-opus-4.8:high",
    "anthropic/claude-opus*": "anthropic/claude-opus-4-8:max"
  }
}
```

- **Config resolution:** the effective judge config for a knot is the most specific present object — `knot.judge ?? strand.judge ?? project.judge ?? {}` (whole-object precedence, not field-merge — predictable).
- **Model resolution** (given the effective config + the current session model string `"<provider>/<id>"`, from `ctx.model`):
  1. if `models` is set → iterate its entries in insertion order; the **first** key whose glob (`*` wildcards, case-insensitive, full match) matches the session model string → use its value.
  2. else if `model` is set → use it.
  3. else (or no `models` key matched and no `model`) → **fall back to the session model + thinking** (`ctx.model`/`ctx.thinkingLevel`), with a warning that judging is weaker/non-independent.
- `model`/map values parsed as `provider/model[:thinking]` (thinking optional → model's default).
- `tools` from the resolved config is appended (de-duped) to the default judge toolset.

## 4. Data model

Add to `Knot`:
```ts
export interface JudgeVerdict {
  approved: boolean;
  reasons: string;
  unmet: string[];
  model: string;        // resolved "provider/model:thinking" actually used
  at: string;           // ISO
}
// Knot:
  last_verdict: JudgeVerdict | null;   // most recent judge result (approve or reject)
```
`seedStrand`/`normalizeState` default `last_verdict` to `null` (forward-compat, same shim as `signoff_arm`).

## 5. Module layout (core/wrapper split)

| File | Responsibility |
|---|---|
| **`extensions/judge-core.ts`** (new, pure — no pi, no SDK) | `parseJudgeModel(str)`, `matchModelGlob(pattern, value)`, `resolveJudgeConfig(knot, strand, project)`, `resolveJudgeModel(effectiveConfig, sessionModelId)` → `{ model, provider, thinking } | { fromSession: true }`, `resolveJudgeTools(effectiveConfig)` (defaults + de-duped append), `buildJudgeSystemPrompt()`, `buildJudgeAuditPrompt(project, slice, knot)`, `JudgeVerdict`, `DEFAULT_JUDGE_TOOLS`. |
| **`extensions/judge.ts`** (new, SDK orchestration — imported, NOT registered) | `runJudgeSession({ cwd, model, thinkingLevel, tools, knowledgeExtPath, systemPrompt, auditPrompt, timeoutMs, sessionModel })` → spawns `createAgentSession`, captures the `submit_verdict` call, returns `{ verdict: JudgeVerdict | null, error?: string }`. |
| **`extensions/project-tracker-core.ts`** (modify) | `Knot.last_verdict`; `applyJudgeVerdict(state, sliceId, verdict)` → on approve, advance via the existing sign-off primitive with evidence `judge(<model>): <reasons>`; on reject, set `last_verdict` + append note. |
| **`extensions/project-tracker.ts`** (modify) | `knot:judge` action + `/project:knot:judge` command: resolve config → `runJudgeSession` → `applyJudgeVerdict`. Reads `judge_timeout_seconds`. |

## 6. Trigger flow (`knot:judge` action and `/project:knot:judge`)

Both paths share one handler:
1. Load state; find slice + active knot. Error if no active knot.
2. If `advance_by` excludes `judge` → error ("this knot does not use a judge; advance_by=[…]").
3. Resolve judge config (knot→strand→project), then `resolveJudgeModel(effective, "<ctx.model.provider>/<ctx.model.id>")`: pattern-map match → fixed `model` → session fallback. A concrete model resolves via `getModel(provider, id)` + thinking; the session-fallback case reuses `ctx.model`/`ctx.thinkingLevel` (warn).
4. Build the clean-room session (§7), run the audit (§8), capture the verdict.
5. `applyJudgeVerdict`:
   - **approve** → advance the knot (unconditional sign-off primitive) with evidence `judge(<model>): <reasons>`; set `last_verdict {approved:true,…}`.
   - **reject** → set `last_verdict {approved:false, reasons, unmet, …}`, append a `Judge rejection (<model>): <reasons>` note; do not advance.
   - **inconclusive** (no verdict / timeout / error) → no state change; return an explanatory error.
6. Return the verdict text. The agent (or user) acts on it.

> The agent path is gated to `advance_by ∋ judge`. Like the agent two-phase, the human `/project:knot:advance` override remains available regardless.

## 7. Clean-room judge session

```ts
const { session } = await createAgentSession({
  authStorage: AuthStorage.create(),
  modelRegistry: ModelRegistry.create(authStorage),
  sessionManager: SessionManager.inMemory(),
  cwd,                          // project cwd → judge can read the repo + run tests
  model, thinkingLevel,
  tools: ["read", "grep", "find", "ls", "bash", "project_knowledge", ...extraTools],
  customTools: [submitVerdictTool],
  resourceLoaderOptions: {
    noExtensions: true,         // strip the project's own .pi extensions (no project_tracker!)
    noSkills: true,
    additionalExtensionPaths: [knowledgeExtPath],   // re-add ONLY project_knowledge
    systemPromptOverride: () => JUDGE_SYSTEM_PROMPT,
  },
});
```

- `knowledgeExtPath` = this package's `extensions/project-knowledge.ts`, resolved from `judge.ts`'s own location (`fileURLToPath(import.meta.url)` → sibling path). Loading it explicitly (while `noExtensions` strips auto-discovery) gives the judge **`project_knowledge` but not `project_tracker`**.
- **System prompt** (`JUDGE_SYSTEM_PROMPT`): "You are an independent quality auditor. You do NOT implement, modify, or fix anything. Verify the work against the provided goals and success criteria. Rules: (a) use `project_knowledge` in **query/read** mode only — never create or edit entries; (b) use `bash` only for **read-only or mandatory verification** commands needed to judge — run the project's existing tests/build/lint/inspection commands, but never modify files, git state, or external systems; (c) prefer read/grep/find/ls for inspection. Consult `project_knowledge` for constraints, decisions, and rejected approaches and check the work against them. When finished, call `submit_verdict` exactly once." (Resolves open items #1 and #2: knowledge is reused read-only by instruction; `bash` stays in the default toolset, scoped to verification.)
- **Audit prompt** (`buildJudgeAuditPrompt`): the user message handed to `session.prompt(...)`, embedding: project name + description; slice id/name/goal + slice-level success_criteria (with met/evidence); strand name; the target knot's name/focus/goals + knot success_criteria (with met/evidence); and the instruction to verify each criterion independently and submit a verdict (`approved` only if every criterion is genuinely satisfied).

## 8. Verdict capture, timeout, errors

- `submit_verdict` is a `defineTool` with `parameters: { approved: boolean, reasons: string, unmet_criteria: string[] }` and returns `{ ..., details, ... }` with `terminate: true` (ends the judge loop after submission). Its `execute` stores the args into a closure variable owned by `runJudgeSession`.
- `runJudgeSession` runs `await Promise.race([session.prompt(auditPrompt), timeout(timeoutMs)])`. On timeout → `session.abort()`; return `{ verdict: null, error: "judge timed out" }`. Always `session.dispose()` in `finally`.
- If the loop ends with no captured verdict → `{ verdict: null, error: "judge did not submit a verdict" }`.
- Auth/model errors (unknown provider/model, missing key) → caught, returned as `{ verdict: null, error }` (in-band; never crash the calling tool).
- The verdict's `model` field records the resolved `provider/model:thinking` actually used.

## 9. Context injection update

`buildProjectStrandContext`: for an active knot whose `advance_by` includes `judge`, the existing "agent self-advance NOT allowed" line already points to "the judge (Phase B)"; update it to name the concrete path: "advance via the judge — call `project_tracker action=knot:judge slice_id=<id>` — or `/project:knot:advance` (you)". If `last_verdict` exists and was a rejection, surface a one-liner so the agent sees the outstanding reasons.

## 10. Testing

Pure unit tests (`tests/extension/judge-core.test.ts`):
- `parseJudgeModel`: `"anthropic/claude-opus-4-8:high"` → `{provider:"anthropic", model:"claude-opus-4-8", thinking:"high"}`; no-thinking form; rejects malformed.
- `resolveJudgeConfig`: knot wins over strand over project; empty → `{}` (→ session fallback).
- `matchModelGlob`: `"*gpt*5*"` matches `"openai/gpt-5-turbo"`, case-insensitive; `"anthropic/claude-opus*"` matches `"anthropic/claude-opus-4-8"`; non-matches return false; literal (no `*`) requires full match.
- `resolveJudgeModel`: first matching map pattern wins (insertion order) over a later match and over a fixed `model`; no pattern matches → fixed `model`; neither set → `{ fromSession: true }`.
- `buildJudgeAuditPrompt`: contains the slice goal, knot focus, and each criterion text.
- `resolveJudgeTools`: default toolset + `judge.tools` append/de-dupe.

`tests/extension/project-tracker.test.ts`:
- `applyJudgeVerdict` approve → knot signed_off, `current_knot` advanced, `last_verdict.approved=true`, evidence mentions the model.
- reject → not advanced, `last_verdict.approved=false`, note appended.
- `knot:judge` refused when `advance_by` excludes judge.
- `seedStrand`/`normalizeState` default `last_verdict=null`.

`runJudgeSession` (the live sub-session) is **not** unit-tested (spawns a real model). It gets a load smoke (`judge.ts` imports + builds the session options without throwing) and a manual end-to-end check noted in the plan. This is the known, accepted coverage boundary.

Gate: `npm test` green; CHANGELOG; minor bump (0.5.0 → 0.6.0).

## 11. Files

- Create: `extensions/judge-core.ts`, `extensions/judge.ts`, `tests/extension/judge-core.test.ts`.
- Modify: `extensions/project-tracker-core.ts` (`last_verdict`, `applyJudgeVerdict`, seed/normalize), `extensions/project-tracker.ts` (`knot:judge` action + `/project:knot:judge` command + `judge_timeout_seconds`), `extensions/superpowers-bootstrap.ts` + `skills/frs-strategy/SKILL.md` (judge usage), `CHANGELOG.md`, `package.json`.
- `extensions/judge.ts` is imported by `project-tracker.ts` (not registered in `pi.extensions`), like `project-tracker-migrate.ts`.

## 12. Open items for reviewer — all resolved

1. ~~Knowledge read-only?~~ **Resolved** — reuse the existing `project_knowledge` tool; the judge system prompt restricts it to query/read mode (§7).
2. ~~bash in default toolset?~~ **Resolved** — keep `bash` in the defaults, scoped by the system prompt to read-only/mandatory verification commands only (§7).
3. ~~Model fallback independence?~~ **Resolved** — added a `judge.models` pattern→model map (glob on the current session model) so a cross-model/independent judge can be selected conditionally; when nothing matches, fall back to the session model+thinking with a warning (§3).
