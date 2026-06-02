---
description: Interactively change project docs, architecture, plans, slice/knot structure, or knowledge graph entries
argument-hint: "[what to change]"
---

Guide me through making a change to the project in a way that keeps everything consistent.

**What I want to change:** $@

If nothing was specified, ask me what I'd like to change before proceeding.

## Process

### 1. Identify the target

What exactly is being changed? Options:
- **Project docs:** `PROJECT.md`, `VISION.md`, `ARCHITECTURE.md`
- **Agent instructions:** `AGENTS.md` (root or nested)
- **Project tracking:** `project_tracker` slices, knots, or criteria
- **Knowledge graph:** `project_knowledge` entries (add, update, remove)
- **Implementation plans:** files in `docs/` or wherever plans live
- **Architecture decision:** any combination of the above

Ask clarifying questions to understand what specifically is changing and why.

### 2. Assess impact

Before making changes, identify:
- Does this change any active knot's done criteria?
- Does this contradict or supersede any existing `project_knowledge` entry?
- Does this affect any other slice that depends on the thing being changed?
- Does `ARCHITECTURE.md` need updating? Does `project_knowledge` need a new decision entry?

Surface any impacts you find and confirm with me before proceeding.

### 3. Make the changes

Apply the changes. Follow the templates in `pi-project-strand/references/required-project-files.md` for format.

**Dual-write rule for architectural changes:** Update both the relevant doc file AND `project_knowledge` (add a `decision` entry with the rationale).

### 4. Verify consistency

After changes, quickly check:
- Are related docs still consistent with each other?
- If a `project_knowledge` entry was superseded, mark it as such or remove it
- If a slice annotation needs updating, update it

### 5. Commit

Commit the changes with a clear conventional commit message describing what was changed and why.

Ask one question at a time. Be efficient — if you understand what's needed, proceed and confirm after.
