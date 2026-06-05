---
name: frs-strategy
description: Use when defining scope for a new feature or slice, identifying the current development knot, setting quality standards for current work, or determining what is in and out of scope for an implementation phase in the EdgeOS project
---

# Feature Realization Strand (FRS) & MVFoS Strategy

**The EdgeOS project development methodology. All planning, implementation, and quality decisions reference this.**

> **Related skills:** `/skill:brainstorming` applies FRS during design. `/skill:writing-plans` encodes knot criteria in every plan. `/skill:verification-before-completion` checks knot criteria before claiming done.

## Slices and Strands

Every feature is a **slice**. Each slice follows a **strand** — a named, ordered sequence of **knots** (quality stages). A slice advances knot by knot; knots are not skipped without explicit user approval.

Each slice also belongs to a durable **track**:

- **`main`** — the project's primary questline / spine
- **`side`** — optional parallel work / side quest

Only **one** main-track slice may be active at a time; side-track slices may run in parallel. Bare `/project:build` always advances the main quest. Use `/project:slice:execute <id>` when the user wants a specific slice, especially a side quest.

**Strands are configurable.** They are templates defined per project under `strands` in `.pi/project.jsonc` (each entry has a `description` and an ordered list of `knots`, each with a `name` and a `focus`). When a slice is created, the chosen strand is **snapshotted** onto the slice — the slice is self-contained from then on, so later edits to the project template do not retroactively alter existing slices.

**Built-in default strands:**

| Strand | Knots | When |
|--------|-------|------|
| **spike** | Setup → Experiment → Decision | Throwaway experiments to choose a direction before real work |
| **quick** | Prototype → Realization → Finalization | Simple, scoped, or smaller work |
| **deep-research** | Preparation → DeepResearch → Synthesis → Finalization | Scoping, sourcing, analyzing, and synthesizing a research question |
| **change** | Scope → Patch → Verify | A scoped change to something that already exists |
| **granular** | Proof-of-Work → Alpha → Beta → Gamma → RC1 → RC2 → Release | Complex or large-scope work |

Projects may define their own strands; pick the strand whose granularity matches the work. (See "Advancement policy" below for each default's per-knot `advance_by` posture.)

## Slice goals vs. knot goals

There are **two** levels of goal + success criteria. Keep them distinct:

- **Slice-level `goal` + `success_criteria`** — the overall outcome the whole slice must deliver, and the conditions that prove the *feature* is done. Defined at slice creation. The slice is signed off only once all of its knots are signed off (or fast-forwarded) and its slice-level success criteria are verified.
- **Per-knot `goals` + `success_criteria`** — what *this stage* must achieve, and the conditions that prove *this knot* is done. Defined when the knot is started (`knot:start`). Each criterion is verified individually with evidence before the knot can be signed off.

## Knots are persistent records

A knot is **not** transient state that gets erased on completion — it is a durable record that accumulates, for the life of the slice:

- **goals** — what the knot set out to achieve
- **success_criteria** — each verified individually, each carrying its own **evidence** and a `met_at` timestamp
- **plan** — an optional linked plan file and its status (`linked` / `complete`); prefer `.pi/project/plans/<slice-id>/<knot-slug>.md` unless the user/project chooses another path
- **resources** — docs, files, URLs, reports, memory/knowledge references attached to the knot
- **sign-off summary** — the `signed_off_message` plus a `validation_evidence_summary` recorded at sign-off

When a knot is signed off, its criteria, evidence, plan, and resources are preserved. Nothing is wiped. This history is queryable for later knots and for slice sign-off.

## Advancement policy

Each knot declares an **`advance_by`** list naming who may advance it: any combination of **`human`**, **`agent`**, and **`judge`**. It is **per-knot** and **any-of** — any listed actor may advance the knot. The default is **`["human"]`**.

- **Human override is always available.** Regardless of `advance_by`, the user can always advance a knot via `/project:knot:advance`. The list only gates *autonomous* actors.
- **Agent self-advance is a deliberate two-phase armed confirmation.** When `advance_by` includes `agent`, the agent does **not** advance in a single step:
  1. **Arm** — the first `knot:sign_off` records an arm timestamp and returns the criteria checklist. It does **not** advance the knot.
  2. **Confirm** — after genuinely verifying every success criterion with evidence, a second `knot:sign_off` **with an evidence summary**, within the freshness window (`agent_signoff_window_seconds`, default 300s), confirms and advances. If criteria are unmet the confirm is refused (the arm is kept); if the window has lapsed, the call re-arms instead of advancing.
- **`judge`** is enforced by an independent auditor (see the **Judge** subsection below).

### Judge

When `advance_by` includes `judge`, advancement is gated by an independent auditor agent that runs in its own **clean-room** pi session (no project extensions/skills beyond read-only `project_knowledge` and verification-only `bash`). The judge audits the **active knot** against the slice goal/success criteria and the knot's goals/success criteria, verifying each independently against the actual repository state rather than trusting the agent's claims.

- **Configuration** (resolved **knot → strand → project**, first match wins, falling back to the current session model when unset):
  - **`judge.model`** — a fixed judge model, `provider/model[:thinking]`.
  - **`judge.models`** — a map of glob pattern (matched against the current session model `provider/model`) → judge model; the first matching pattern wins.
  - **`judge.tools`** — extra tool names appended to the default judge toolset.
- **Invocation:** the agent runs `project_tracker action=knot:judge slice_id=<id>`; the user runs `/project:knot:judge <slice>`.
- **Outcome:** on **approve**, the judge advances the knot (marking criteria judge-verified) and records its verdict; on **reject**, it records `last_verdict` plus a rejection note on the knot and does **not** advance.
- **Human override:** the user can always bypass the judge via `/project:knot:advance`.

**Built-in defaults — human at the bookends, agent in the middle.** The five default strands gate *direction* at the start and *shipping* at the end with the human, while letting the agent run the productive middle:

- **deep-research** runs autonomously (`agent` on every knot) — research synthesis needs no human gate between stages.
- **spike** lets the agent run Setup and Experiment, then returns to the human for the Decision knot.
- **quick**, **change**, and **granular** keep the human on the opening knot (set direction) and the closing knot(s) (sign off shipping), with `agent` on the implementation knots in between.

## Lifecycle commands

### Tracking split — use the right tool

- **`project_tracker`** = persistent project lifecycle state across sessions: slices, knots, criteria, linked plan files, resources, milestones, advancement.
- **`plan_tracker`** = the ad-hoc execution checklist for the work currently in progress in this session: the active knot plan, the current implementation pass, or a teammate-local task queue.
- If the information should still matter when the current ad-hoc plan is cleared, it belongs in `project_tracker`, not `plan_tracker`.

- **`/project:new:slice <request>`** — interactive funnel that captures the slice goal + success criteria, asks whether it belongs on the `main` or `side` track, picks a strand, and creates the slice (replaces the old brainstorm entry point).
+- **`/project:build`** — advance the main quest only: the active main-track slice, or the next defined main-track slice.
+- **`/project:slice:execute <id>`** — advance one explicit slice id, including side quests and user-directed main-quest switches.
- **`project_tracker action=knot:sign_off`** — agent self-advance path for knots whose `advance_by` includes `agent`: first call arms, second call within the freshness window confirms with evidence.
- **`project_tracker action=knot:judge` / `/project:knot:judge`** — judge path for knots whose `advance_by` includes `judge`.
- **`/project:knot:advance`** — user sign-off / human override for the active knot: verifies every per-knot success criterion has evidence, records the sign-off summary, and clears the active knot so the next one can start.
- **`/project:slice:advance`** — finalize the slice: requires all knots signed off (or fast-forwarded), then signs off the slice and marks it complete.
- **`/project:knot:fast_forward`** — the explicit, user-approved way to skip ahead: squash the knots between the current position and a later target into the target, recording a combined evidence summary. This is the only sanctioned way to skip a knot.

## Knot Criteria Template

**Define these BEFORE any implementation starts.** Record in the design doc or plan header.

```
**MVFoS**: [the slice being built — must be real and observable, no stubs]
**Strand**: [e.g. spike | quick | deep-research | change | granular | <project-defined strand>]
**Knot**: [the current knot name in that strand]

**Done means**: [observable, verifiable condition — not "code is written"]
**Must provide**: [required deliverables for this knot]
**Must NOT provide**: [explicitly out of scope — prevents overbuilding]
**Nice to have**: [optional extras only if time allows]
**Validation**: [specific commands or steps that prove the per-knot success criteria]
```

## Per-knot quality bar (granular as the worked example)

The guidance below describes the *quality intent* of each stage. It is written against the **granular** strand's knots because they are the most fine-grained, but it applies to whichever strand is in play — map your strand's knots onto the nearest stage (e.g. on **quick**: Prototype ≈ Proof-of-Work, Realization ≈ Alpha/Beta, Finalization ≈ RC/Release).

| Knot | Focus | Done When |
|------|-------|-----------|
| **Proof-of-Work** | Quick experiment: prove the approach, establish design/API/patterns/layout for later knots | Approach validated, decisions made, limitations known, code is throwaway |
| **Alpha** | First real, integrated implementation | Works end-to-end, TDD, basic error handling, integrated with system |
| **Beta** | Ready to show someone else | Good UX, comprehensive error handling, docs started |
| **Gamma** | Could be used in testing/staging | All core features + UI/UX, performance acceptable |
| **RC1** | Feature complete | Edge cases handled, polishing done, no new features |
| **RC2** | Ready for early adopters | Security reviewed, backward compat documented |
| **Release** | Production confident | Monitoring in place, rollback plan ready |

### Proof-of-Work knot rules

The first knot of a strand (Proof-of-Work on granular, Prototype on quick) is an **experiment**, not a deliverable. Its twin goals are:
1. **Prove** the approach works (or definitively doesn't)
2. **Establish** the approach, patterns, design, API shape, data layout, and architecture decisions that the Alpha knot will build on

The output of this first knot is a **decision and a direction** — not production code.

- TDD is **relaxed** — manual/minimal validation acceptable
- The code is **explicitly throwaway** — the next knot starts fresh or with deliberate, reviewed extraction
- No production error handling, polish, or documentation required
- Done = "we know our approach, its trade-offs, and the shape of what the next knot will build"
- **Shipping the proof-of-work as the next knot = violation.** It requires a conscious restart.
- It must produce documented decisions (what approach we chose and why) so the next knot's implementers have clear direction

## MVFoS Selection

Pick the **next minimum slice** that:
1. Maps to the user's high-level planned feature/capability list in `PROJECT.md` — or updates that list first if this is a new capability
2. Delivers real, observable value — **no hollow shells, stubs, or placeholders**
3. Can be independently tested and understood
4. Has a clear, verifiable done condition

`PROJECT.md` Planned Features / Capabilities is the destination map. FRS slices are how that destination becomes real. If the planned feature list is missing, stale, or contradicts the proposed slice, stop and clarify/update it before defining MVFoS criteria. Otherwise agents will happily optimize the wrong future, because apparently they need the obvious written down.

**Prefer vertical slices** (end-to-end feature). Use horizontal slices (cross-cutting concerns: config loading, logging, error framework) only when they block multiple vertical slices.

**Never build:**
- Interfaces with no real implementation behind them
- Placeholder structures "to be filled in later"
- Features not required for the current knot

## Stakeholder Model

| Role | Party | Responsibilities |
|------|-------|-----------------|
| **Stakeholder / Final Authority** | User | Approve designs, review specs, live testing, human-gated knot sign-off, final slice sign-off, deployment approval |
| **Implementer / Worker** | AI agents | Everything else: design, code, tests, review, debug, document; may advance `agent`-gated knots through the two-step protocol |

**Mandatory gates** — never skip the gate that applies:
1. **Design approval** — after brainstorming, before writing plan
2. **Spec review** — after writing spec, before implementation
3. **Knot advancement** — follow the active knot's `advance_by`: `human` waits for `/project:knot:advance`, `agent` uses two-step `knot:sign_off`, `judge` uses `knot:judge`
4. **Deployment approval** — before installing anything on fw02 as a service

The user's job is to judge. If the user is being asked to implement something, stop and redirect that work back to the AI team.

## Deployment Model

```
build + dry-run on fw02 → user review / live testing → install as service
```

**Target:** `fw02.viitrium.net` — Alpine Linux 3.23, musl libc, x86_64

1. Build binary or package and run dry validation on fw02
2. Present to user for review and interactive testing
3. User approves → configure and install as system service
4. Document install steps and configuration in CHANGELOG.md
5. Verify service is running and behaving correctly

## Quality Bar by Knot (granular as the worked example)

Columns use the granular knots; map your strand's knots onto the nearest column.

| Area | Proof-of-Work | Alpha | Beta | Gamma+ |
|------|-----|-------|------|--------|
| Tests | Manual/minimal | TDD: unit + integration | Comprehensive | Full suite + edge cases |
| Error handling | None required | Meaningful errors, no panics | User-facing messages | Graceful degradation |
| Documentation | None | Inline code docs | User docs started | Complete |
| Code quality | "Does it prove the point" | Follows Rust/project conventions | Clean, maintainable | Production-grade |
| Performance | Ignored | Acceptable | Measured | Meeting targets |
| Alpine/musl compat | Best-effort | Verified | Verified | Verified + CI |

## Knot Advancement Checklist

Before advancing from one knot to the next:
- [ ] Every per-knot `success_criteria` entry verified individually, each with recorded evidence
- [ ] Evidence summary is ready and honest; no criterion is merely assumed
- [ ] The active knot's `advance_by` path is followed:
  - `human`: present evidence to the user and wait for `/project:knot:advance`
  - `agent`: call `project_tracker action=knot:sign_off` once to arm, then call it again with evidence within the freshness window to confirm
  - `judge`: call `project_tracker action=knot:judge` and respect the verdict unless the user overrides
- [ ] CHANGELOG.md updated with knot completion when the project requires it
- [ ] Plan/design doc updated to reflect advancement

To finalize the whole slice (`/project:slice:advance`): all knots signed off (or fast-forwarded via `/project:knot:fast_forward`), slice-level `success_criteria` verified, and the user signs off the slice.

> To skip ahead, never silently leave knots behind — use `/project:knot:fast_forward` so the squashed knots are recorded with a combined evidence summary.
