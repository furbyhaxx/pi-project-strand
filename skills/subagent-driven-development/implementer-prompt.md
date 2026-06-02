# Worker Task Brief Template

Use this template when delegating an implementation task to the `worker` teammate via `delegate`.

```
delegate:
  teammate: "worker"
  context: "new"
  cwd: "[project root]"
  task: |
    You are implementing Task N: [task name]

    ## FRS Context

    **MVFoS**: [extracted from plan header — the slice being built]
    **FRS Knot**: [PoW | Alpha | Beta | ... — from plan header]
    **Knot Done Criteria**: [extracted from plan header]

    The FRS knot determines the quality bar for your work:
    - **PoW**: TDD relaxed, manual validation acceptable. Goal: prove approach AND establish
      design/API/pattern decisions for Alpha. Code is explicitly throwaway.
    - **Alpha and beyond**: TDD mandatory. No skipping tests. Meaningful errors required.
    - Match the knot's quality bar — do not overbuild for PoW, do not underbuild for Alpha+.

    ## Task Description

    [FULL TEXT of task from plan — paste it here, do NOT tell the worker to read a file]

    ## Context

    [Scene-setting: where this fits in the overall system, what's already built, key dependencies,
    architectural context, relevant file paths]

    ## Before You Begin

    If you have questions about:
    - The requirements or acceptance criteria
    - The approach or implementation strategy
    - Dependencies or assumptions
    - Anything unclear in the task description

    **Ask them now.** Raise concerns before starting work.

    ## Your Job

    Once you're clear on requirements:
    1. Implement exactly what the task specifies (no more, no less)
    2. Write tests (follow TDD if knot is Alpha or beyond; manual validation OK for PoW)
    3. Verify implementation works
    4. Commit your work
    5. Self-review (see below)
    6. Report back

    ## Code Organization

    - Follow the file structure defined in the plan
    - Each file should have one clear responsibility with a well-defined interface
    - If a file you're creating is growing beyond the plan's intent, stop and report as
      DONE_WITH_CONCERNS — don't restructure files without plan guidance
    - In existing codebases, follow established patterns

    ## When You're in Over Your Head

    It is always OK to stop and say "this is too hard for me." Bad work is worse than no work.

    **STOP and escalate when:**
    - Task requires architectural decisions with multiple valid approaches
    - You need to understand code beyond what was provided and can't find clarity
    - You feel uncertain about whether your approach is correct
    - You've been reading file after file without progress

    **How to escalate:** Report BLOCKED or NEEDS_CONTEXT with: what you're stuck on, what
    you've tried, what kind of help you need.

    ## Before Reporting Back: Self-Review

    **Completeness:**
    - Did I fully implement everything in the spec?
    - Are there edge cases I didn't handle?
    - Is every deliverable real and working — no stubs or hollow shells?

    **Quality (calibrated to knot):**
    - Is this my best work for this knot level?
    - Are names clear and accurate?
    - Did I avoid overbuilding (YAGNI)?

    **Testing:**
    - Do tests verify real behavior (not just mock behavior)?
    - Did I follow TDD if knot is Alpha or beyond?

    Fix issues found during self-review before reporting.

    ## Report Format

    - Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - What you implemented (or what you attempted, if blocked)
    - Test results
    - Files changed
    - Self-review findings (if any)

    Never silently produce work you're unsure about.
```
