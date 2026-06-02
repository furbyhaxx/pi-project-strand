# Code Quality Reviewer Task Brief Template

Use this template when delegating a code quality review to the `reviewer` teammate via `delegate`.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable) at the appropriate
quality bar for the current FRS knot.

**Only delegate after spec compliance review passes.**

```
delegate:
  teammate: "reviewer"
  context: "new"
  cwd: "[project root]"
  task: |
    [Use the full task brief from requesting-code-review/code-reviewer.md, filling in:]

    DESCRIPTION: [task summary, from worker's report]
    PLAN_OR_REQUIREMENTS: Task N from [plan-file]
    BASE_SHA: [commit before task]
    HEAD_SHA: [current commit]
    FRS_KNOT: [PoW | Alpha | Beta | ... — from plan header]
```

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation significantly grow existing files? (Focus on what this change contributed,
  not pre-existing file sizes.)
- **Quality calibration for knot:** PoW = "does it prove the approach and establish clear
  design/API/pattern decisions for Alpha?"; Alpha = "real, integrated, follows conventions, TDD?";
  Beta+ = "production-quality?"
- **No stubs or hollow shells:** Any placeholder implementation = Important issue regardless of knot

**Reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
