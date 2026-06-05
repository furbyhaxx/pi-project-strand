# pi-project-strand

**A pi package that provides AI agents with everything they need to collaborate on vibe-coded projects: persistent memory, FRS/MVFoS planning, and a clear human-AI collaboration model.**

## Overview

`pi-project-strand` equips pi AI agents with project-level institutional memory and a development methodology for building software in a vibe-coded model — where AI agents own all implementation work and humans provide vision, key decisions, and stakeholder feedback.

It is the difference between a stateless session that forgets everything when closed and a persistent, methodology-driven project partner that never loses context.

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **FRS** (Feature Realization Strand) | A graduated quality progression: PoW → Alpha → Beta → Gamma → RC1 → RC2 → Release |
| **MVFoS** (Minimum Viable Feature or Slice) | The smallest real, observable, testable unit of work — no stubs, no placeholders |
| **Slice** | An independent vertical or horizontal feature unit that advances through FRS knots |
| **Track** | The slice's durable questline: `main` for the primary spine, `side` for parallel optional work |
| **Knot** | A quality stage within a slice's FRS progression |
| **Project Memory** | Persistent knowledge graph (`project_knowledge`) + slice/knot tracker (`project_tracker`) |

## Planned Features / Capabilities

This is the high-level destination map for pi-project-strand. It tells future AI agents what the user wants the package to become, not merely what exists today. Individual slices and knots track realization progress; this list anchors direction.

| Capability | Status | Notes |
|------------|--------|-------|
| Required project-file onboarding | Available | `/project:onboard` creates or repairs `PROJECT.md`, `VISION.md`, `ARCHITECTURE.md`, and `AGENTS.md` through an LLM-driven workflow. |
| High-level planned feature map in `PROJECT.md` | In progress | Every onboarded project must expose the intended end-state feature/capability list so agents understand what the user wants long-term. |
| FRS slice/knot tracking | Available | `project_tracker` persists slices, current knots, criteria, linked plans, milestones, and annotations. |
| Main/side quest tracks | Available | Slices carry a durable `track` (`main` or `side`); only one main-track slice may be active at a time while side quests may run in parallel. |
| Preferred plan artifact storage | Available | Active-knot plans should live under `.pi/project/plans/<slice-id>/<knot-slug>.md` by convention, while `knot:set_plan` can still link any project-specific path. |
| Persistent project knowledge graph | Available | `project_knowledge` stores decisions, rejections, constraints, warnings, howtos, conventions, and notes with relations and path/slice scoping. |
| Rich slice/knot annotations | Available | `project_tracker slice:annotate` and `knot:annotate` preserve design notes and implementation context. |
| Project context bootstrap injection | Available | `superpowers-bootstrap.ts` injects FRS foundations, the main quest, active side quests, and relevant knowledge each turn. |
| `/project:*` workflow commands | Available | `/project:onboard`, `/project:new:slice`, `/project:new:strand`, `/project:build`, `/project:slice:execute`, `/project:implement`, and `/project:change` trigger deterministic audits plus LLM workflows. |
| Project change consistency workflow | Available | `/project:change` guides updates across docs, tracker state, and knowledge graph entries. |
| Better project-file audits | Planned | Detect placeholder sections, missing planned-feature lists, stale status, and contradiction between `PROJECT.md`, tracker state, and knowledge entries. |
| Generic FRS skill | Planned | Remove remaining project-specific assumptions from `frs-strategy` so the package is cleanly reusable outside EdgeOS-style projects. |
| Command transcript/status items | Planned | Add custom transcript items or status summaries for `/project:*` command audits and workflow transitions. |
| Wizard-grade UI | Planned | Improve command UX with pi UI dialogs/custom components where deterministic collection is better than free-form prompting. |
| Packaging/publishing polish | Planned | Finalize npm/package metadata, docs, and installation examples for public sharing. |

## Components

### Extensions (TypeScript)

| File | Tool Registered | Purpose |
|------|----------------|---------|
| `plan-tracker.ts` | `plan_tracker` | Session-scoped task planning and progress tracking |
| `project-tracker.ts` | `project_tracker` | Persistent FRS slice/knot state across sessions |
| `project-knowledge.ts` | `project_knowledge` | Project-scoped knowledge graph (decisions, constraints, etc.) |
| `project-commands.ts` | `/project:*` | LLM-driven project workflow slash commands |
| `superpowers-bootstrap.ts` | _(event hook)_ | Injects project context + foundational instructions per turn |

### Skills

| Skill | When to use |
|-------|-------------|
| `brainstorming` | Before any implementation — design → spec → plan |
| `frs-strategy` | FRS/MVFoS methodology, knot quality bars |
| `writing-plans` | Authoring implementation plans |
| `executing-plans` | Inline plan execution |
| `subagent-driven-development` | Parallel teammate-driven implementation |
| `systematic-debugging` | Structured debugging methodology |
| `requesting-code-review` / `receiving-code-review` | Code review flows |
| `test-driven-development` | TDD patterns |
| `verification-before-completion` | Pre-completion checks |
| `using-git-worktrees` | Isolated workspace setup |
| `finishing-a-development-branch` | Branch completion |
| `writing-skills` | Creating and testing new skills |

### Slash Commands

Registered by `extensions/project-commands.ts`. Commands compute deterministic project context, then call `pi.sendUserMessage(...)` to trigger the LLM-driven workflow.

| Command | Purpose |
|---------|---------|
| `/project:onboard` | Interactive wizard to create required project files and initialize tracking |
| `/project:new:slice` | Interactive funnel to specify a slice, choose a strand, and create tracker state |
| `/project:new:strand` | Interactively design and save a custom strand template |
| `/project:build` | Resume or start implementing the current main-track slice |
| `/project:slice:execute` | Resume or start implementing one explicit slice or side quest |
| `/project:implement` | Alias for `/project:build` |
| `/project:change` | Interactively change project docs, architecture, plans, or tracking structure |

## Required Project Files

Every project using pi-project-strand should maintain:
- `PROJECT.md` — what the project is, components, current state, conventions
- `VISION.md` — vision, goals, non-goals, design principles
- `ARCHITECTURE.md` — architectural decisions, patterns, constraints, tech stack
- `AGENTS.md` — build commands, conventions, and do-nots for AI agents

See `references/required-project-files.md` for templates.

## State Files (auto-managed, do not edit manually)

| File | Content |
|------|---------|
| `.pi/project/state.json` | Slice/knot tracker state |
| `.pi/project/knowledge.json` | Knowledge graph entries |
| `.pi/project/plans/<slice-id>/<knot-slug>.md` | Preferred active-knot implementation plan artifacts |
| `.pi/project/*.tmp` | Atomic write scratch files (ephemeral) |

## Current State

Core feature set: complete. The package provides project tracking, knowledge graph, bootstrap injection, skills, and registered `/project:*` slash commands for a full vibe-coded development workflow.

See `CHANGELOG.md` for detailed version history.
