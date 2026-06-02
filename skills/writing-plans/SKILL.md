---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

> **Related skills:** `/skill:frs-strategy` defines FRS knots and quality bars — plan must encode the current knot and its done criteria.

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `/skill:using-git-worktrees` skill at execution time.

**Spec input:** The approved design spec should normally live under `docs/superpowers/specs/`. It must contain an FRS Plan section with knot criteria and should identify which `PROJECT.md` planned feature/capability it advances.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

Before writing tasks, check `PROJECT.md` Planned Features / Capabilities. The plan must either advance one listed capability or explicitly include a docs/tracker update that adds the new capability. Do not create plans that are locally coherent but disconnected from what the user ultimately wants.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]
**Planned Capability:** [PROJECT.md feature/capability this advances]
**MVFoS:** [The minimum viable slice — must be real and observable, no stubs]
**FRS Knot:** [PoW | Alpha | Beta | Gamma | RC1 | RC2 | Release — determines quality bar for all tasks]
**Architecture:** [2-3 sentences about approach]
**Tech Stack:** [Key technologies/libraries]

**Knot Done Criteria:**
- Done means: [observable, verifiable condition — not "code is written"]
- Must provide: [required deliverables for this knot]
- Must NOT provide: [explicitly out of scope — prevents overbuilding]
- Validation: [specific commands or steps to prove done criteria]

---
```

**Missing or vague planned capability or knot done criteria = plan failure.** The implementer cannot know why they are doing the work or when they are done without them.

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Knot-Appropriate Task Design

The FRS knot in the plan header determines task content and quality expectations:

**PoW knot:** Tasks focus on proving the approach and establishing design decisions (API shape, patterns, data layout) that later knots will build on. TDD is relaxed — manual validation steps are acceptable. Mark PoW tasks clearly: "(PoW — throwaway, prove concept and establish design decisions)". Do NOT write production error handling, polish, or docs tasks. Include an explicit "Document decisions + evaluate: continue to Alpha or pivot?" task at the end.

**Alpha and beyond:** TDD mandatory. All tasks must include failing test steps. Error handling, logging, and basic documentation required. No skipping test steps.

**Never write a plan that delivers stubs or hollow shells.** If the slice cannot be fully implemented at this knot, narrow the slice — do not ship incomplete scaffolding.

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task
- Stub implementations "to be filled in later" (narrow the slice instead)

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Knot criteria coverage:** Re-read the done criteria in the plan header. Is there a task that provably satisfies each criterion? If a criterion has no task implementing it, add the task. If a criterion cannot be verified with the planned tasks, the criterion or tasks are wrong — fix both.

**5. Planned capability coverage:** Does the plan clearly advance the named `PROJECT.md` planned feature/capability? If the capability is missing from PROJECT.md, add a documentation/tracker update task or stop and fix the spec.

**6. Stubs and shells check:** Does every deliverable in every task have a real, working implementation? Any stub, placeholder, or "will be wired up later" = plan failure. Narrow the slice.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:**

**1. Teammate-Driven (recommended)** — delegate a fresh `worker` per task via `delegate`, `reviewer` review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using `/skill:executing-plans`, batch execution with checkpoints

**Which approach?"**

**If Teammate-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development`
- Fresh `worker` per task + two-stage `reviewer` review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use `/skill:executing-plans`
- Batch execution with checkpoints for review
