# Design: Per-Knot Advancement Policy (`advance_by`: human / agent / judge)

- **Date:** 2026-06-03
- **Status:** Draft for review
- **Builds on:** v0.4.0 strand model (`docs/plans/2026-06-03-strand-redesign-design.md`).
- **Phasing:** **Phase A** (this doc, detailed) — `advance_by` config + human/agent gating incl. the agent two-phase armed confirmation. **Phase B** (outline here, detailed later) — the `judge` sub-session.
- **Back-compat:** v0.4.0 state files are forward-compatible — knots without `advance_by` normalize to `["human"]` (today's behavior).

---

## 1. Motivation

Strands today have no notion of *who* may advance a knot. Worse, the `knot:sign_off` tool action is agent-callable, so an agent can silently self-advance any knot — there is no enforced human gate. This feature makes advancement an explicit, per-knot policy so a strand can range from **fully human-gated** to **mostly autonomous**, and makes agent self-advancement *trustworthy* via a deliberate two-phase confirmation rather than a reflexive self-approval.

## 2. Decisions (from brainstorming)

1. **`advance_by` is a per-knot set of permitted advancement actors** drawn from `human | agent | judge`. Defined in the strand template (`project.jsonc`), snapshotted onto each knot at slice creation.
2. **Semantics = any-of + human override.** `advance_by` governs the *autonomous* actors (agent, judge): any listed actor may advance. **The human path (`/project:knot:advance`) always works**, even if `human` isn't listed — you are the boss.
3. **Agent self-advance is a two-phase "armed confirmation"** with a freshness window (default 300s, configurable) — see §6.
4. **Judge config = `provider/model:thinking`, resolved knot → strand → project.** (Phase B.)
5. **Default `advance_by` (absent) = `["human"]`** — preserves today's behavior; agents cannot self-advance unless a strand opts in.
6. **Phase A then B.**

## 3. Config (`.pi/project.jsonc`)

```jsonc
{
  // optional project-level judge default (Phase B) and the agent confirmation window
  "agent_signoff_window_seconds": 300,
  "judge": { "model": "anthropic/claude-opus-4-8:high" },   // Phase B; project-level default
  "strands": {
    "autonomous": {
      "description": "Mostly self-driving strand",
      "judge": { "model": "anthropic/claude-opus-4-8:high" }, // Phase B; strand-level default
      "knots": [
        { "name": "Prototype",   "focus": "...", "advance_by": ["agent"] },
        { "name": "Realization",  "focus": "...", "advance_by": ["agent", "judge"] },
        { "name": "Finalization", "focus": "...", "advance_by": ["judge"],
          "judge": { "model": "anthropic/claude-opus-4-8:max" } }  // Phase B; per-knot override
      ]
    },
    "gated": {
      "description": "Human-gated strand",
      "knots": [
        { "name": "Prototype",   "focus": "..." },                       // advance_by defaults to ["human"]
        { "name": "Realization",  "focus": "...", "advance_by": ["human"] },
        { "name": "Finalization", "focus": "...", "advance_by": ["judge", "human"] }
      ]
    }
  }
}
```

- `advance_by` omitted → `["human"]`. Empty array → also effectively human-override-only (no autonomous actor) — normalized to `["human"]`.
- `agent_signoff_window_seconds` (top-level, default `300`).
- **Phase A parses and stores `advance_by`, `judge`, and the window, but only enforces `human` + `agent`.** A knot whose `advance_by` is `["judge"]` during Phase A has no working judge yet, so only the human override can advance it (logged in context) until Phase B ships.
- **Built-in default strands** are expanded to five generic strands, each carrying a per-knot `advance_by` posture — see §3.1.

### 3.1 Built-in default strands

`DEFAULT_STRANDS` expands from `quick`/`granular` to **five generic strands** (resolves Open Item #1). `automation` and `integration` are intentionally **not** shipped as generic defaults — they carry domain-specific assumptions (vendor CI; device flashing) and remain project-local strands authored via `/project:new:strand`. The `advance_by` posture follows **"human at the bookends, agent in the middle"**: a human gate confirms direction at the start and quality at the ship, while the build band runs autonomously; research and spikes run hands-off.

| Strand | Knots (`advance_by`) | Use for |
|---|---|---|
| **spike** | Setup `[agent]` → Experiment `[agent]` → Decision `[human]` | Throwaway experiments to choose a direction before real work. |
| **quick** | Prototype `[human]` → Realization `[agent]` → Finalization `[human]` | Small, well-scoped slices. |
| **deep-research** | Preparation `[agent]` → DeepResearch `[agent]` → Synthesis `[agent]` → Finalization `[agent]` | Fully autonomous research/synthesis slices. |
| **change** | Scope `[human]` → Patch `[agent]` → Verify `[human]` | Scoped edits to something that already exists. |
| **granular** | Proof-of-Work `[human]` → Alpha `[agent]` → Beta `[agent]` → Gamma `[agent]` → RC1 `[agent]` → RC2 `[human]` → Release `[human]` | Complex/high-risk slices needing multiple gates. |

Full per-knot `focus` text is authored fresh in `DEFAULT_STRANDS` (concise, domain-agnostic). The truncated terminal paste in `references/extended-project.json` supplied the knot names/intent only and **will be removed** during implementation (it is not a shippable reference doc). Once Phase B lands, the `[human]` ship-gates (e.g. `quick.Finalization`, `change.Verify`, `granular.RC2`/`Release`, `spike.Decision`) are the natural spots to swap to `[judge]` or `[judge, human]` for autonomous-but-audited shipping.

## 4. Data model

```ts
export type AdvanceActor = "human" | "agent" | "judge";

export interface JudgeConfig { model: string; }   // "provider/model:thinking"; Phase B

export interface StrandKnotTemplate {
  name: string;
  focus: string;
  title?: string;
  advance_by?: AdvanceActor[];     // default ["human"]
  judge?: JudgeConfig;             // Phase B; per-knot override
}

export interface StrandTemplate {
  description: string;
  knots: StrandKnotTemplate[];
  judge?: JudgeConfig;             // Phase B; strand default
}

export interface ProjectConfig {
  project?: { name?: string; description?: string };
  strands?: Record<string, StrandTemplate>;
  judge?: JudgeConfig;                       // Phase B; project default
  agent_signoff_window_seconds?: number;     // default 120
}
```

`Knot` (state) gains:
```ts
export interface SignoffArm { armed_at: string; }   // transient agent two-phase state

export interface Knot {
  // ...existing fields...
  advance_by: AdvanceActor[];          // snapshotted; default ["human"]
  judge: JudgeConfig | null;           // Phase B; resolved/!snapshotted (knot override only) — see §10
  signoff_arm: SignoffArm | null;      // transient; set in phase-1, cleared on advance/expiry
}
```

- `seedStrand` copies `advance_by` (default `["human"]`), `judge` (knot-level if present, else null), `signoff_arm: null`.
- `normalizeState` ensures every knot has `advance_by` (default `["human"]`, empty→`["human"]`) and `signoff_arm` (default `null`) — this is the forward-compat shim for v0.4.0 state files.
- `migrateLegacyState`: migrated knots get `advance_by: ["human"]`.

## 5. Authorization semantics

| Path | Entry point | Gate |
|------|-------------|------|
| **Human** | `/project:knot:advance <id>` command | **Always allowed** (override). Calls `handleKnotSignOff` directly. |
| **Agent** | `project_tracker action=knot:sign_off` (tool) | Allowed only if active knot `advance_by` includes `agent`; **two-phase** (§6). |
| **Judge** | `project_tracker action=knot:judge` (tool) — Phase B | Allowed only if `advance_by` includes `judge`; spawns judge sub-session (§10). |

`handleKnotSignOff` stays the **unconditional advance primitive** (criteria-met + evidence check only). It is called by: the human command, the agent two-phase on confirm, and the judge on approval. The agent **tool** path no longer calls it directly — it routes through the two-phase handler.

> This closes today's gap where any agent could self-advance any knot: with the default `["human"]`, the agent's `knot:sign_off` is refused and points to `/project:knot:advance`.

## 6. Agent two-phase "armed confirmation"

New core handler (pure, deterministic — `now` and `windowSeconds` are injected):

```ts
export function handleAgentSignOff(
  state: ProjectState, sliceId: string, evidence: string, now: string, windowSeconds: number
): ActionResult
```

Algorithm (on the slice's active knot):
1. Resolve slice + active knot; error if none.
2. If `advance_by` excludes `"agent"` →
   `error: "agent self-advance not permitted for <knot> (advance_by=[...]). Use /project:knot:advance (human)` *(or the judge, once Phase B ships)*`."` — no state change.
3. Determine arm state:
   - **Not armed, or armed but expired** (`now - armed_at > windowSeconds`): set `knot.signoff_arm = { armed_at: now }` and return the **Phase-1 challenge** (no advance):
     - lists the knot's `goals`, and every `success_criteria` with ✓/○ + evidence,
     - directive: *"Verify each criterion with real evidence via `verify_criterion`, confirm all are genuinely met, then call `knot:sign_off` again with an `evidence` summary within `<windowSeconds>`s to confirm. After that window this resets."*
   - **Armed and within window** (the confirm):
     - If any criterion unmet → return the unmet list (keep the arm; still within window). No advance.
     - If `evidence` empty → error "evidence required to confirm". (Keep arm.)
     - Else → **advance**: delegate to `handleKnotSignOff(state, sliceId, message, evidence)`, then clear `signoff_arm`. Return its result.

Notes:
- The window default (300s) comes from `agent_signoff_window_seconds`; the wrapper passes `now = isoNow()` and the resolved window.
- Re-arming on expiry is silent and intentional — the confirm must reflect *recent* verification.
- `signoff_arm` is transient per-knot state; it is naturally absent on freshly-started knots and cleared on advance.

## 7. Tool & command wiring

- **`project_tracker action=knot:sign_off`** → routes to `handleAgentSignOff(state, slice_id, evidence, isoNow(), windowSeconds)`. (Was `handleKnotSignOff`.) `message` param still accepted and forwarded on confirm.
- **`/project:knot:advance`** (command) → unchanged: prompts for evidence, calls `handleKnotSignOff` (human override).
- **`/project:slice:advance`** → unchanged.
- **`project_strand action=define`** (C) → `knots[]` items gain optional `advance_by: AdvanceActor[]` (and `judge` in B); the `strand-authoring-core` validator checks `advance_by` values ∈ enum.
- **`project_tracker action=slice:create`** → no new params; `advance_by` flows from the chosen strand template snapshot.
- **`/project:new:slice` funnel** → when presenting strands, the previews note each strand's advancement posture (e.g. "agent-driven", "human-gated").

## 8. Context injection

`buildProjectStrandContext` adds, per active slice with an active knot, a line stating the knot's `advance_by` and whether **agent self-advance is permitted**, plus a one-line reminder of the two-phase protocol when it is:

```
dns-cache (autonomous) → Realization (1/3 criteria) — advance_by: agent,judge
  ↳ agent self-advance ALLOWED: verify all criteria, then knot:sign_off (arm) → knot:sign_off+evidence within 300s (confirm).
```

The `superpowers-bootstrap` FRS section gains a short paragraph describing the `advance_by` policy and the two-phase agent protocol. `frs-strategy` gets the same in its body.

## 9. Testing (Phase A)

Core unit tests (`now` injected, deterministic):
- `seedStrand` copies `advance_by` (default `["human"]`); `normalizeState` defaults missing/empty `advance_by` → `["human"]` and `signoff_arm` → `null`.
- `migrateLegacyState` → migrated knots `advance_by: ["human"]`.
- `handleAgentSignOff`: refused when `agent` not in `advance_by`; arms on first call (no advance, `signoff_arm` set, challenge text lists criteria); confirms within window (advances, arm cleared) only when all criteria met + evidence; rejects unmet criteria at confirm; re-arms after expiry (`now` past window); evidence-required at confirm.
- `handleKnotSignOff` still works as the direct primitive (human path) regardless of `advance_by`.

`strand-authoring-core`: `advance_by` enum validation.

Gate: `npm test` green; `CHANGELOG.md`; minor version bump on ship.

## 10. Phase B — judge sub-session (outline; detailed design later)

- **Trigger:** `project_tracker action=knot:judge slice_id=<id>` (agent- or human-invokable). Requires `judge` ∈ `advance_by`.
- **Model resolution:** `knot.judge ?? strand.judge ?? project.judge`; error if none. Parse `provider/model:thinking` into model id + thinking level.
- **Sub-session:** in the tool's `execute`, build a one-shot agent via SDK `createAgentSession({ authStorage: AuthStorage.create(), modelRegistry: ModelRegistry.create(...), sessionManager: SessionManager.inMemory(), model/thinking, tools: ["read","grep","find","bash"], customTools: [submit_verdict] })`, running in the same `cwd` so it can inspect the repo and run tests. Respect an abort/timeout.
- **Audit prompt:** embeds the project goal, slice goal + success_criteria, strand name, and the knot's focus + goals + success_criteria, and instructs the judge to verify each criterion against the actual repo state and render a verdict.
- **Verdict capture:** a custom `submit_verdict({ approved: boolean, reasons: string, unmet: string[] })` tool with `terminate: true`.
- **Outcome:** on `approved` → `handleKnotSignOff` with `evidence = "judge(<model>): <reasons>"`; on rejected → record the verdict (knot notes / a judge log) and do **not** advance. Dispose the session.
- **Risks to resolve in B's design:** auth availability for the chosen provider in non-interactive sub-sessions; long-running audits (timeout/streaming progress); cost; whether the judge may also be required *after* an agent confirm (a "agent proposes → judge ratifies" pipeline) — deferred unless requested.

## 11. Open items for reviewer

1. ~~Built-in strands?~~ **Resolved** — five generic defaults (spike, quick, deep-research, change, granular) with the bookend `advance_by` posture in §3.1. `automation`/`integration` stay project-local; `references/extended-project.json` will be removed.
2. ~~Window default?~~ **Resolved — 300s** (`agent_signoff_window_seconds` default), so a full test run/build between arm and confirm doesn't force a re-arm. Configurable per project.
3. ~~`["judge"]`-only knot pre-B?~~ **Resolved — allowed**: config may list `judge` now; Phase A accepts it but only the human override can advance such a knot until Phase B (context says so). Lets you author judge strands ahead of B.
