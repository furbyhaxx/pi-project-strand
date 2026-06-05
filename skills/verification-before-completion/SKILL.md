---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

> **Related skills:** `/skill:frs-strategy` defines knot done criteria that must be verified before claiming any knot is complete.

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

0. KNOT CHECK (if claiming a knot is done):
   - Read the plan's "Knot Done Criteria" section
   - Read the plan's "Planned Capability" and `PROJECT.md` Planned Features / Capabilities
   - Confirm the completed work advances the intended capability, not just a locally plausible task
   - Create a checklist from done criteria
   - Verify EACH criterion with evidence (command + output)
   - If any criterion is unmet → state what is missing, do NOT claim completion
   - Pass all criteria → continue to step 1

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Knot is done | Verify every done criterion with evidence | Tests pass |
| Feature/slice aligns with project direction | `PROJECT.md` planned capability + active slice/plan evidence | Implemented something useful-looking |
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |
| Daemon/service works | Actually started it, verified logs/behavior | Unit tests pass |
| Interactive CLI works | Actually ran it interactively | Unit tests pass |
| Config applied | Observable effect confirmed | No errors on load |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Verifying Configuration Changes

When testing changes to configuration, providers, feature flags, or environment:

**Don't just verify the operation succeeded. Verify the output reflects the intended change.**

### Common Failure Pattern

Operation succeeds because *some* valid config exists, but it's not the config you intended to test.

### Examples

| Change | Insufficient | Required |
|--------|-------------|----------|
| Switch LLM provider | Status 200 | Response contains expected model name |
| Enable feature flag | No errors | Feature behavior actually active |
| Change environment | Deploy succeeds | Logs/vars reference new environment |
| Set credentials | Auth succeeds | Authenticated user/context is correct |

### Gate Function

```
BEFORE claiming configuration change works:

1. IDENTIFY: What should be DIFFERENT after this change?
2. LOCATE: Where is that difference observable?
   - Response field (model name, user ID)
   - Log line (environment, provider)
   - Behavior (feature active/inactive)
3. RUN: Command that shows the observable difference
4. VERIFY: Output contains expected difference
5. ONLY THEN: Claim configuration change works

Red flags:
  - "Request succeeded" without checking content
  - Checking status code but not response body
  - Verifying no errors but not positive confirmation
```

## Live Validation Rule

For interactive, daemon, and service components — **scripted/unit tests passing ≠ confirmed working.**

**Confirmed working** means: started, used, and interacted with as an end user would.

| Component type | What "confirmed working" requires |
|----------------|----------------------------------|
| System daemon / service | Actually started it, verified logs + PID + behavior |
| CLI tool | Ran it interactively with real inputs, observed output |
| TUI application | Launched it, navigated it, exercised primary flows |
| Web / desktop app | Opened it in a browser/OS, clicked through primary flows |
| Config file applied | Restarted the service, verified observable behavioral change |
| nftables / network rules | Verified with `nft list ruleset` or traffic test |

**The user is the final validator for live testing** on fw02. AI agents must not claim "confirmed working" for interactive/daemon components without explicit user test confirmation.

## Knot Advancement

BEFORE claiming a knot is complete and advancing to the next:

1. Re-read ALL done criteria from the plan's Knot Done Criteria section
2. Run each validation command specified and capture output
3. Record evidence for every criterion with `project_tracker action=verify_criterion`
4. Follow the active knot's `advance_by` path:
   - `human`: present criteria + evidence to the user and wait for `/project:knot:advance`
   - `agent`: use the two-step `project_tracker action=knot:sign_off` arm/confirm flow with an evidence summary
   - `judge`: run `project_tracker action=knot:judge` and respect the verdict unless the user overrides
5. ONLY THEN: update CHANGELOG.md and plan docs as the project requires

Partial criteria met = knot not complete. Never advance with unmet criteria.

## Why This Matters

From failure patterns:
- User said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.
