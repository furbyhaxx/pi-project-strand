# Upstream Superpowers Source Map

This document tracks where `pi-superpowers` sources behavior from upstream `obra/superpowers`, and where the fork intentionally replaces harness-specific mechanisms with pi-native equivalents.

## Core mapping

| Local target | Upstream source | Pi-native adaptation |
|---|---|---|
| `skills/using-git-worktrees/SKILL.md` | `skills/using-git-worktrees/SKILL.md` | keep pi wording and `/skill:` references |
| `skills/finishing-a-development-branch/SKILL.md` | `skills/finishing-a-development-branch/SKILL.md` | preserve provenance-based cleanup and detached-HEAD handling |
| `skills/brainstorming/SKILL.md` | `skills/brainstorming/SKILL.md` | preserve workflow, remove harness-specific assumptions |
| `skills/brainstorming/visual-companion.md` | `skills/brainstorming/visual-companion.md` | replace browser-server flow with `AskUserQuestion` previews |
| `skills/writing-plans/SKILL.md` | `skills/writing-plans/SKILL.md` | keep upstream structure, adapt execution references to pi |
| `skills/executing-plans/SKILL.md` | `skills/executing-plans/SKILL.md` | replace `TodoWrite` language with `plan_tracker` |
| `skills/requesting-code-review/*` | `skills/requesting-code-review/*` | preserve reviewer workflow, adapt dispatch language |
| `skills/subagent-driven-development/*` | `skills/subagent-driven-development/*` | preserve model/status logic, adapt to pi-friendly terminology |
| `extensions/superpowers-bootstrap.ts` | `skills/using-superpowers/SKILL.md` | implement as `before_agent_start` extension |

## Intentionally non-ported upstream areas

These upstream directories are not copied as-is because pi has better native mechanisms or because they are harness-specific:
- `.claude-plugin/`
- `.codex-plugin/`
- `.cursor-plugin/`
- `.opencode/`
- `hooks/`
- browser-server brainstorm launcher scripts

## Additional hardening source

Some guidance in this fork comes from upstream design/feedback documents rather than shipped skill files:
- `docs/plans/2025-11-28-skills-improvements-from-user-feedback.md`

That source drives the added sections for:
- configuration-change verification
- mock-interface drift prevention
- explicit code-review file-reading guidance
