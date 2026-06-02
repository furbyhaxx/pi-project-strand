---
name: executing-plans
description: Use when you have a written implementation plan to execute in the current session without delegating to teammates
---

> **Related skills:** `/skill:frs-strategy` for knot context. `/skill:verification-before-completion` for knot done-criteria verification before finishing.

# Executing Plans

## Overview

Load plan, review critically, execute all tasks inline, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Teammate-driven execution via `/skill:subagent-driven-development` (using `delegate`) produces significantly higher quality results through fresh `worker` context per task and two-stage `reviewer` review. Use this skill only when you explicitly need inline, non-delegated execution.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. **Extract FRS context:** MVFoS, current knot, and knot done criteria from plan header
3. Review critically - identify any questions or concerns about the plan
4. Note the knot: it determines quality expectations for every task (PoW = relaxed, Alpha+ = TDD mandatory)
5. If concerns: Raise them with your human partner before starting
6. If no concerns: Create `plan_tracker` entries and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as `in_progress`
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as `complete`

### Step 3: Complete Development

After all tasks complete and verified:
1. **Verify knot done criteria** — re-read the plan's Knot Done Criteria section; run each validation command; confirm all criteria are met with evidence
2. If any criterion unmet: return to implementation, fix the gap
3. Announce: "I'm using the finishing-a-development-branch skill to complete this work."
4. **REQUIRED SUB-SKILL:** Use `/skill:finishing-a-development-branch`
5. Follow that skill to verify tests, assess knot criteria, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **`/skill:using-git-worktrees`** - Ensures isolated workspace (creates one or verifies existing)
- **`/skill:writing-plans`** - Creates the plan this skill executes
- **`/skill:finishing-a-development-branch`** - Complete development after all tasks
