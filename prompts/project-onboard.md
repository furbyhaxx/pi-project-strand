---
description: Interactive onboarding wizard — creates required project files and initializes tracking for a new or uninitialized project
argument-hint: "[project path — defaults to current directory]"
---

Act as Key Account Manager and run an interactive onboarding wizard for this project.

**Working directory:** $1 (or the current directory if not provided)

## Step 1: Audit current state

Check which required project files exist:
- `PROJECT.md`
- `VISION.md`
- `ARCHITECTURE.md`
- `AGENTS.md` (root + any nested subdirectory AGENTS.md files)
- `.pi/project/state.json` (project_tracker initialized)
- `.pi/project/knowledge.json` (knowledge graph initialized)

Also check: is this a git repo? What language/framework is this? What's in the root directory?

## Step 2: Report findings

Tell me concisely what exists and what's missing. Be specific — "VISION.md missing, PROJECT.md exists but appears to be a placeholder" is more useful than a generic list.

## Step 3: Interactive creation

For each missing required file, guide me through creating it **one file at a time**. Read the templates from `pi-project-strand/references/required-project-files.md` before creating each file.

Ask focused questions to understand:
- What the project does and who uses it
- The vision and non-goals
- Architectural decisions already made or in progress
- Any hard constraints or conventions that must be captured

**One question at a time.** Wait for my answer before asking the next.

After each file, confirm it looks right before moving to the next one.

## Step 4: Initialize project tracking

If `project_tracker` hasn't been initialized (`project:status` returns nothing), propose initial slices based on what you've learned. Ask for my input on priorities.

## Step 5: Seed knowledge graph

Persist everything important you learned during the interview into `project_knowledge`:
- Architectural decisions (category: `decision`)
- Rejected approaches you learned about (category: `rejected`)
- Hard constraints (category: `constraint`)
- Key conventions (category: `convention`)

## Step 6: Summary

At the end, give me a brief summary of:
- What was created
- What was initialized  
- Key decisions that were captured in `project_knowledge`
- Suggested next steps (which slice to start, which skill to use)
