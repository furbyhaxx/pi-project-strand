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
| **Knot** | A quality stage within a slice's FRS progression |
| **Project Memory** | Persistent knowledge graph (`project_knowledge`) + slice/knot tracker (`project_tracker`) |

## Components

### Extensions (TypeScript)

| File | Tool Registered | Purpose |
|------|----------------|---------|
| `plan-tracker.ts` | `plan_tracker` | Session-scoped task planning and progress tracking |
| `project-tracker.ts` | `project_tracker` | Persistent FRS slice/knot state across sessions |
| `project-knowledge.ts` | `project_knowledge` | Project-scoped knowledge graph (decisions, constraints, etc.) |
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
| `/project:brainstorm` | Start a guided brainstorming session |
| `/project:build` | Resume or start implementing the current active slice |
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
| `.pi/project/knowledge.json.tmp` | Atomic write scratch file (ephemeral) |

## Current State

Core feature set: complete. The package provides project tracking, knowledge graph, bootstrap injection, skills, and registered `/project:*` slash commands for a full vibe-coded development workflow.

See `CHANGELOG.md` for detailed version history.
