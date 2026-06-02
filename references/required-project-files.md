# Required Project Files

Every project using pi-project-strand needs these four files. They provide the persistent context that survives session clears and lets any AI agent orient quickly without re-interviewing the user.

Use `/project-onboard` to create them interactively when starting a new project.

---

## PROJECT.md

**Purpose:** What the project IS right now — components, current state, conventions, key links. Updated as the project evolves.

**Template:**

```markdown
# [Project Name]

**[One sentence: what this is and what it does.]**

## Overview

[2-3 sentences: purpose, who uses it, what problems it solves]

## Components

| Component | Role |
|-----------|------|
| [name] | [role] |

## Current State

[Brief status: what's working, what's in progress, what's next. Keep this current.]

## Conventions

- [Key coding convention agents must follow]
- [Key architectural convention]

## Links

- Docs: [path or URL]
- Related repos: [if any]
```

**Keep it current.** PROJECT.md is the first thing an agent reads when joining a session. Stale status = wasted time re-discovering.

---

## VISION.md

**Purpose:** The WHY and WHERE — long-term direction that rarely changes. Anchors all architectural decisions.

**Template:**

```markdown
# Vision: [Project Name]

## The Problem

[The specific, concrete problem this project solves — avoid vague generalities]

## The Vision

[The ideal future state this project achieves, in 1-3 sentences]

## Goals

1. [Primary goal]
2. [Secondary goal]

## Non-Goals

- [Explicitly what this project does NOT do — this is as important as the goals]
- [Anti-features to avoid scope creep]

## Target Users

- **Primary:** [Who uses this most and what they need]
- **Secondary:** [Other users with different needs]

## Design Principles

1. [Core principle that guides trade-off decisions]
2. [Another principle]
```

**Rarely changes.** Update VISION.md only when the fundamental direction shifts, not for feature additions. When it does change, update `project_knowledge` with a `decision` entry explaining why.

---

## ARCHITECTURE.md

**Purpose:** How the system is built — decisions, patterns, constraints, tech stack. The ground truth for architectural choices that AI agents must respect.

**Template:**

```markdown
# Architecture: [Project Name]

## Overview

[1-2 sentences: the key structural pattern or approach]

## Structure

[Directory layout or component diagram]

## Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| [What was decided] | [Why] | [when] |

## Technology Stack

| Technology | Role | Why |
|------------|------|-----|
| [name] | [how it's used] | [why chosen] |

## Constraints

- **[Constraint name]:** [What is forbidden or required, and why]

## Patterns

- **[Pattern name]:** [When and how it's used — be specific]

## Known Issues / Tech Debt

| Issue | Impact | Planned Resolution |
|-------|--------|--------------------|
| [issue] | [impact] | [plan or "tracked"] |
```

**Dual-write rule:** When making an architectural decision, update BOTH `ARCHITECTURE.md` AND `project_knowledge` (as a `decision` entry with `slice_id` if relevant). This ensures it surfaces in context even after the file is no longer read.

---

## AGENTS.md

**Purpose:** Instructions specifically for AI agents working in this repo. Terse, operational, focused on non-obvious facts.

**Template:**

```markdown
# AGENTS.md: [Project Name]

## About This Repo

[What language/framework, what the top-level directories contain, key entry points]

## Build & Test

```bash
[exact build command]          # [what it does]
[exact test command]           # [what it does]
[exact lint/format command]    # [what it does]
```

## Conventions

- [Convention agents must follow — be specific, not "follow best practices"]
- [Naming convention]
- [File organization rule]

## Architecture Notes

[Things that aren't obvious from reading the code — gotchas, non-obvious patterns, cross-cutting constraints]

## DO NOT

- [Hard prohibition with reason]
- [Another hard rule]

## Before Committing

[What to verify before claiming work is done — specific commands or checks]
```

**Style:** AGENTS.md is not documentation or a tutorial. It's instructions for a skilled agent who needs the non-obvious stuff. Keep it terse. Every line should answer "what does an agent need to know that it can't easily infer?" — if the answer is "it's obvious," cut the line.

Follow the `agents-md-authoring` skill for detailed conventions and validation checklist.

---

## Placement

All four files live at the repository root (or subproject root for monorepos). For monorepos with distinct subprojects, each subproject can have its own nested AGENTS.md with local overrides.

## Initialization

The `/project-onboard` prompt template guides interactive creation of all four files when starting a new project. It:
1. Scans for missing files
2. Interviews you about the project (one question at a time)
3. Creates each file using the templates above
4. Initializes the `project_tracker` with initial slices if needed
5. Seeds `project_knowledge` with key decisions from the interview
