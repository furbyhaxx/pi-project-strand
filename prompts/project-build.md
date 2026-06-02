---
description: Resume or start implementing the current active project slice — checks project state and routes to the right implementation skill
---

Check the current project state and determine the best next action, then proceed.

## Step 1: Read project state

Run `project_tracker status` and `project_tracker next` to get:
- Active slice and current knot
- Knot done criteria (verified vs unverified)
- Any linked implementation plan and its status

## Step 2: Determine what to do

**If an active slice has an in-progress knot with a linked plan:**
→ Check if the plan file exists at the linked path. If yes, resume it using `/skill:executing-plans` or `/skill:subagent-driven-development`. Show me which tasks are still pending.

**If an active slice has an in-progress knot but no plan:**
→ The knot has criteria but no plan. Use `/skill:writing-plans` to write one based on the knot done criteria. Show me the criteria first and confirm before writing the plan.

**If an active slice has no active knot (knot was just signed off or not yet started):**
→ Ask me which knot to start next. Use `/skill:frs-strategy` to confirm the quality bar. Then use `/skill:writing-plans` to create the plan.

**If there's no active slice:**
→ Show me the defined slices (with `project_tracker slice:list`) and ask which to activate next.

**If nothing is set up at all:**
→ Suggest running `/project-onboard` first, then come back here.

## Step 3: Proceed

Once the path is clear, proceed with the appropriate skill. Don't ask me to approve the routing decision — just take the right path and briefly explain what you're doing and why.
