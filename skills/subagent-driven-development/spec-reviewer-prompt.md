# Spec Compliance Reviewer Task Brief Template

Use this template when delegating a spec compliance review to the `reviewer` teammate via `delegate`.

**Purpose:** Verify the worker built what was requested (nothing more, nothing less) AND that the
implementation satisfies the knot done criteria.

```
delegate:
  teammate: "reviewer"
  context: "new"
  cwd: "[project root]"
  task: |
    You are reviewing whether an implementation matches its specification and knot criteria.

    ## FRS Context

    **MVFoS**: [from plan header]
    **FRS Knot**: [from plan header]
    **Knot Done Criteria**: [from plan header — done means / must provide / must not provide]

    ## What Was Requested

    [FULL TEXT of task requirements]

    ## What Worker Claims They Built

    [From worker's report]

    ## CRITICAL: Do Not Trust the Report

    The worker may have finished quickly or may be optimistic. You MUST verify independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote
    - Compare actual implementation to requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation and verify:

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Did they claim something works but not actually implement it?
    - Is any deliverable a stub, hollow shell, or placeholder? (= failure regardless of knot)

    **Extra/unneeded work:**
    - Did they build things that weren't requested?
    - Did they over-engineer or add unnecessary features?

    **Misunderstandings:**
    - Did they interpret requirements differently than intended?
    - Did they solve the wrong problem?

    **Knot criteria compliance:**
    - Does this task's output contribute to satisfying the knot done criteria?
    - Is quality appropriate for the declared knot?
    - For Alpha+: Is TDD followed? Are there real failing-then-passing tests?

    **Verify by reading code, not by trusting the report.**

    Report:
    - ✅ Spec compliant (all requirements met, nothing extra, code verified)
    - ❌ Issues found: [list specifically what's missing or extra, with file:line references]
```
