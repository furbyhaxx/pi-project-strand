# Code Reviewer Task Brief Template

Use this template when delegating a code review to the `reviewer` teammate via `delegate`.

**Purpose:** Review completed work against requirements and code quality standards before it
cascades into more work.

```
delegate:
  teammate: "reviewer"
  context: "new"
  cwd: "[project root]"
  task: |
    You are a Senior Code Reviewer. Review completed work against its plan and quality standards.

    ## FRS Context

    **FRS Knot**: {FRS_KNOT}

    Quality expectations are calibrated to this knot:
    - **PoW**: Did it prove the approach and establish clear design/API/pattern decisions for Alpha?
    - **Alpha**: Is it real, integrated, TDD-followed, no panics, follows project conventions?
    - **Beta+**: Is it production-grade, user-facing errors, comprehensive tests?

    Do NOT flag PoW code for missing production error handling or polish — that is intentional.
    DO flag missing design decisions or unclear approach in PoW code.

    ## What Was Implemented

    {DESCRIPTION}

    ## Requirements / Plan

    {PLAN_OR_REQUIREMENTS}

    ## Git Range to Review

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Files to Review

    BEFORE analyzing, read the files that changed. Use the diff to identify them, then read each.

    DO NOT proceed with review until you've read the actual code.

    ## What to Check

    **Plan alignment:**
    - Does the implementation match the plan / requirements?
    - Are deviations justified improvements, or problematic departures?
    - Is all planned functionality present and real (no stubs or hollow shells)?

    **Code quality:**
    - Clean separation of concerns?
    - Proper error handling (calibrated to knot)?
    - Type safety where applicable?
    - DRY without premature abstraction?
    - Edge cases handled (calibrated to knot)?

    **Architecture:**
    - Sound design decisions?
    - Integrates cleanly with surrounding code?
    - For Alpine/musl targets: no glibc assumptions, correct static linking if needed?
    - For Rust: follows 2024 edition conventions, proper error types, no unwrap() in lib code?

    **Testing:**
    - Tests verify real behavior, not mocks?
    - For Alpha+: TDD followed (tests existed and failed before implementation)?
    - Integration tests where they matter?

    **Production readiness (calibrated to knot):**
    - For Alpha+: meaningful error messages, no panics on bad input?
    - For Beta+: backward compatibility considered, documentation adequate?

    ## Calibration

    Categorize issues by actual severity for this knot. Not everything is Critical.
    Acknowledge what was done well before listing issues.

    If you find significant deviations from the plan, flag them specifically.
    If you find issues with the plan itself rather than the implementation, say so.

    ## Output Format

    ### Strengths
    [What's well done? Be specific.]

    ### Issues

    #### Critical (Must Fix)
    [Bugs, security issues, data loss risks, broken functionality, stubs shipped as real code]

    #### Important (Should Fix)
    [Architecture problems, missing features, poor error handling, test gaps]

    #### Minor (Nice to Have)
    [Code style, optimization opportunities, documentation polish]

    For each issue:
    - File:line reference
    - What's wrong
    - Why it matters
    - How to fix (if not obvious)

    ### Assessment

    **Ready to proceed?** [Yes | No | With fixes]

    **Reasoning:** [1-2 sentence technical assessment]
```

**Placeholders:**
- `{DESCRIPTION}` — brief summary of what was built
- `{PLAN_OR_REQUIREMENTS}` — what it should do (plan file path, task text, or requirements)
- `{BASE_SHA}` — starting commit
- `{HEAD_SHA}` — ending commit
- `{FRS_KNOT}` — current knot (PoW / Alpha / Beta / ...)
