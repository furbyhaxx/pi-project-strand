---
name: frs-strategy
description: Use when defining scope for a new feature or slice, identifying the current development knot, setting quality standards for current work, or determining what is in and out of scope for an implementation phase in the EdgeOS project
---

# Feature Realization Strand (FRS) & MVFoS Strategy

**The EdgeOS project development methodology. All planning, implementation, and quality decisions reference this.**

> **Related skills:** `/skill:brainstorming` applies FRS during design. `/skill:writing-plans` encodes knot criteria in every plan. `/skill:verification-before-completion` checks knot criteria before claiming done.

## FRS Knots

Every feature or slice advances through knots in order. Knots are not skipped without explicit user approval.

| Knot | Focus | Done When |
|------|-------|-----------|
| **PoW** | Quick experiment: prove the approach, establish design/API/patterns/layout for later knots | Approach validated, decisions made, limitations known, code is throwaway |
| **Alpha** | First real, integrated implementation | Works end-to-end, TDD, basic error handling, integrated with system |
| **Beta** | Ready to show someone else | Good UX, comprehensive error handling, docs started |
| **Gamma** | Could be used in testing/staging | All core features + UI/UX, performance acceptable |
| **RC1** | Feature complete | Edge cases handled, polishing done, no new features |
| **RC2** | Ready for early adopters | Security reviewed, backward compat documented |
| **Release** | Production confident | Monitoring in place, rollback plan ready |

## Knot Criteria Template

**Define these BEFORE any implementation starts.** Record in design doc or plan header.

```
**MVFoS**: [the slice being built — must be real and observable, no stubs]
**Knot**: [PoW | Alpha | Beta | Gamma | RC1 | RC2 | Release]

**Done means**: [observable, verifiable condition — not "code is written"]
**Must provide**: [required deliverables for this knot]
**Must NOT provide**: [explicitly out of scope — prevents overbuilding]
**Nice to have**: [optional extras only if time allows]
**Validation**: [specific commands or steps that prove done criteria]
```

## PoW Knot Rules

PoW is an **experiment**, not a deliverable. Its twin goals are:
1. **Prove** the approach works (or definitively doesn't)
2. **Establish** the approach, patterns, design, API shape, data layout, and architecture decisions that the Alpha knot will build on

The output of PoW is a **decision and a direction** — not production code.

- TDD is **relaxed** — manual/minimal validation acceptable
- PoW code is **explicitly throwaway** — Alpha starts fresh or with deliberate, reviewed extraction
- No production error handling, polish, or documentation required
- Done = "we know our approach, its trade-offs, and the shape of what Alpha will build"
- **Shipping PoW as Alpha = violation.** PoW → Alpha requires a conscious restart.
- The PoW must produce documented decisions (what approach we chose and why) so Alpha implementers have clear direction

## MVFoS Selection

Pick the **next minimum slice** that:
1. Maps to the user's high-level planned feature/capability list in `PROJECT.md` — or updates that list first if this is a new capability
2. Delivers real, observable value — **no hollow shells, stubs, or placeholders**
3. Can be independently tested and understood
4. Has a clear, verifiable done condition

`PROJECT.md` Planned Features / Capabilities is the destination map. FRS slices are how that destination becomes real. If the planned feature list is missing, stale, or contradicts the proposed slice, stop and clarify/update it before defining MVFoS criteria. Otherwise agents will happily optimize the wrong future, because apparently they need the obvious written down.

**Prefer vertical slices** (end-to-end feature). Use horizontal slices (cross-cutting concerns: config loading, logging, error framework) only when they block multiple vertical slices.

**Never build:**
- Interfaces with no real implementation behind them
- Placeholder structures "to be filled in later"
- Features not required for the current knot

## Stakeholder Model

| Role | Party | Responsibilities |
|------|-------|-----------------|
| **Stakeholder / Final Authority** | User | Approve designs, review specs, live testing, knot sign-off, deployment approval |
| **Implementer / Worker** | AI agents | Everything else: design, code, tests, review, debug, document |

**Mandatory user gates** — always stop and wait:
1. **Design approval** — after brainstorming, before writing plan
2. **Spec review** — after writing spec, before implementation
3. **Knot sign-off** — before advancing to next knot
4. **Deployment approval** — before installing anything on fw02 as a service

The user's job is to judge. If the user is being asked to implement something, stop and redirect that work back to the AI team.

## Deployment Model

```
build + dry-run on fw02 → user review / live testing → install as service
```

**Target:** `fw02.viitrium.net` — Alpine Linux 3.23, musl libc, x86_64

1. Build binary or package and run dry validation on fw02
2. Present to user for review and interactive testing
3. User approves → configure and install as system service
4. Document install steps and configuration in CHANGELOG.md
5. Verify service is running and behaving correctly

## Quality Bar by Knot

| Area | PoW | Alpha | Beta | Gamma+ |
|------|-----|-------|------|--------|
| Tests | Manual/minimal | TDD: unit + integration | Comprehensive | Full suite + edge cases |
| Error handling | None required | Meaningful errors, no panics | User-facing messages | Graceful degradation |
| Documentation | None | Inline code docs | User docs started | Complete |
| Code quality | "Does it prove the point" | Follows Rust/project conventions | Clean, maintainable | Production-grade |
| Performance | Ignored | Acceptable | Measured | Meeting targets |
| Alpine/musl compat | Best-effort | Verified | Verified | Verified + CI |

## Knot Advancement Checklist

Before advancing from one knot to the next:
- [ ] All done criteria for current knot verified with evidence
- [ ] Evidence presented to user
- [ ] User explicitly signs off on this knot
- [ ] CHANGELOG.md updated with knot completion
- [ ] Plan/design doc updated to reflect advancement
