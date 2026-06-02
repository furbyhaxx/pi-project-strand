# Vision: pi-project-strand

## The Problem

Vibe-coded projects — where AI agents do most of the implementation — fail in predictable ways:

- **No continuity:** Each session starts blank. Decisions, rejected approaches, constraints, and architectural choices evaporate when the context window clears.
- **No methodology:** "Just build it" leads to shallow proof-of-concepts shipped as production code, missed quality bars, and features that don't compose.
- **No collaboration model:** Either the user micromanages every detail (defeating the point) or the AI steamrolls ahead without the right checkpoints.
- **No memory:** The same design mistakes get made repeatedly. The same questions get asked again.
- **No onboarding:** A new session can't pick up where the last left off without lengthy re-explanation.

## The Vision

**pi-project-strand is the operating system for vibe-coded project development.**

It gives AI agents the institutional memory, methodology, and collaboration model they need to build software the same way a skilled development team would — but at AI speed, without human bottlenecks on implementation details.

### For Users

- Drop into any project session and get immediately useful context: what's being built, what was decided, what's next
- Be involved at the right level: vision, key decisions, review and sign-off — not implementation details
- Trust that the AI won't forget what you discussed, violate constraints you established, or repeat approaches you already rejected

### For AI Agents

- Always know the active slice, current knot, and what "done" means for the current stage
- Have instant access to architectural decisions and rejected approaches — without re-discovering them
- Know exactly when to pause and ask the user, and when to proceed independently

## Goals

1. **Persistent memory** — decisions, constraints, rejections, and warnings survive session clears
2. **Methodology** — every feature follows FRS knots from PoW to Release, with explicit done criteria at each stage
3. **Collaboration model** — clear, stable role separation: user owns vision + decisions, AI owns all operations
4. **Skill-based specialization** — right skill for the right task, surfaced automatically or on demand
5. **Portable** — works for any project type; project-specific rules live in AGENTS.md and project_knowledge

## Non-Goals

- **Not a replacement for human architecture decisions** — the user still makes the final calls on direction
- **Not a project management tool** — no burndown charts, velocity tracking, or PM ceremony
- **Not a standalone product** — it's a pi package; it extends pi's existing capabilities
- **Not opinionated about tech stack** — the methodology is language/framework agnostic

## Target Users

- **Primary:** Developers vibe-coding complex projects with AI agents who need session-to-session continuity
- **Secondary:** AI agents themselves, who need reliable context and methodology to produce consistent quality

## Design Principles

1. **Memory over repetition** — Persist facts once, surface them on demand — never rediscover what's already known
2. **Methodology over vibes** — FRS/MVFoS gives every feature a quality progression and verifiable done criteria
3. **Collaboration over micromanagement** — Clear role separation lets the AI move fast without overstepping
4. **Context on demand** — Surface only what's relevant now (path triggers, slice scope, constraints/warnings)
5. **Portable and composable** — Works for any project; project-specific rules stay in project files, not hardcoded
