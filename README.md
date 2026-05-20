# @furbyhaxx/pi-superpowers

![pi-superpowers banner](banner.jpg)

Structured workflow skills for [pi](https://github.com/earendil-works/pi), adapted from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent.

Brainstorming → Planning → TDD → Debugging → Code Review → Finishing — as composable skills your coding agent loads on demand.

This fork is intentionally **pi-native**. It ports the useful workflow content from upstream Superpowers, but does not carry over harness-specific plugin manifests, session-start hooks, or browser-server glue where pi has better native options.

## Install

```bash
pi install git:github.com/furbyhaxx/pi-superpowers
```

Or add to `.pi/settings.json` (project-level) or `~/.pi/agent/settings.json` (global):

```json
{
  "packages": ["git:github.com/furbyhaxx/pi-superpowers"]
}
```

## Optional: Subagent Tool

Several skills can dispatch work to subagents (marked with 🤖 below). **pi-superpowers does not include a subagent tool.** These skills still work as process guides without one — you just run tasks manually instead of dispatching them.

To enable automated dispatch, install a subagent extension:

- **pi's example subagent extension** — Ships with pi at `examples/extensions/subagent/`. See [its README](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent) for installation via symlinks into `~/.pi/agent/extensions/subagent/`.
- **Any compatible subagent extension** — Any extension that provides a `subagent` tool works.
- **Manual alternative** — Run `pi -p "prompt"` in another terminal, or use tmux panes for parallel tasks.

## What's Inside

### Skills

| Skill | Description | Invoke |
|-------|-------------|--------|
| **brainstorming** | Socratic design refinement — questions, alternatives, incremental validation | `/skill:brainstorming` |
| **writing-plans** | Detailed implementation plans with bite-sized TDD tasks | `/skill:writing-plans` |
| **executing-plans** | Batch execution with checkpoints for architect review | `/skill:executing-plans` |
| 🤖 **subagent-driven-development** | Fresh subagent per task with two-stage review | `/skill:subagent-driven-development` |
| **test-driven-development** | RED-GREEN-REFACTOR cycle (includes anti-patterns reference) | `/skill:test-driven-development` |
| **systematic-debugging** | 4-phase root cause investigation | `/skill:systematic-debugging` |
| **verification-before-completion** | Evidence before claims, always | `/skill:verification-before-completion` |
| 🤖 **requesting-code-review** | Pre-merge review with severity categories | `/skill:requesting-code-review` |
| **receiving-code-review** | Technical evaluation of review feedback | `/skill:receiving-code-review` |
| 🤖 **dispatching-parallel-agents** | Concurrent subagent workflows | `/skill:dispatching-parallel-agents` |
| **using-git-worktrees** | Isolated development branches | `/skill:using-git-worktrees` |
| **finishing-a-development-branch** | Merge/PR decision workflow | `/skill:finishing-a-development-branch` |
| 🤖 **writing-skills** | TDD applied to process documentation — create, test, and bulletproof skills | `/skill:writing-skills` |

### Plan Tracker

The `plan_tracker` tool replaces file-based task tracking. It stores state in the session and shows progress in the TUI:

```
Tasks: ✓✓→○○ (2/5)  Task 3: Recovery modes
```

Usage by the agent:
```
plan_tracker({ action: "init", tasks: ["Task 1: Setup", "Task 2: Core", ...] })
plan_tracker({ action: "update", index: 0, status: "complete" })
plan_tracker({ action: "status" })
plan_tracker({ action: "clear" })
```

### Bootstrap Extension

The `superpowers-bootstrap` extension injects a lightweight pi-native reminder before agent turns:
- skill-first behavior before action
- user instructions override superpowers guidance
- prefer `/skill:`, `AskUserQuestion`, and `plan_tracker`

If you inspect package resources you will see:
- `extensions/superpowers-bootstrap.ts`

### Visual Brainstorming

Visual brainstorming is pi-native too. Instead of upstream browser-server flows, this package uses **AskUserQuestion preview** patterns for side-by-side comparisons and lightweight mockups:
- single-select visual comparisons
- inline preview-driven layout choices
- easy fallback back to plain chat when visuals are unnecessary

See:
- `skills/brainstorming/visual-companion.md`

## The Workflow

1. **Brainstorm** — `/skill:brainstorming` refines your idea into a design document under `docs/superpowers/specs/`
2. **Isolate** — `/skill:using-git-worktrees` creates or verifies a safe workspace
3. **Plan** — `/skill:writing-plans` breaks work into bite-sized TDD tasks under `docs/superpowers/plans/`
4. **Execute** — `/skill:executing-plans` or `/skill:subagent-driven-development` works through the plan
5. **Verify** — `/skill:verification-before-completion` proves it works
6. **Review** — `/skill:requesting-code-review` catches issues
7. **Finish** — `/skill:finishing-a-development-branch` merges or creates a PR

Each skill cross-references related skills so the agent knows what to use next.

## Upstream Provenance

This package is derived from `obra/superpowers`, but ports only the behavior that makes sense for pi.

Intentionally **not** ported directly:
- `.claude-plugin/`
- `.codex-plugin/`
- `.cursor-plugin/`
- `.opencode/`
- `hooks/`
- upstream browser-server brainstorm launcher scripts

For the exact upstream-to-local mapping, see:
- `docs/upstream-superpowers-source-map.md`

## Development

### Testing

Tests use [vitest](https://vitest.dev/) and live in `tests/`:

```
tests/
├── extension/
│   ├── plan-tracker.test.ts          # Unit tests for plan-tracker core logic
│   └── superpowers-bootstrap.test.ts # Bootstrap helper coverage
├── integration/
│   ├── pi-superpowers-workflow.sh    # Deterministic install/discovery smoke test
│   └── README.md
├── package/
│   ├── package-metadata.test.ts      # Package metadata and install references
│   └── readme-parity.test.ts         # README / docs consistency checks
└── skills/
    ├── skill-validation.test.ts      # Frontmatter, cross-refs, file refs
    └── upstream-parity.test.ts       # Upstream sync regression coverage
```

Run the full suite:

```bash
npm test
```

Run in watch mode during development:

```bash
npm run test:watch
```

**Skill validation tests** check that every skill in `skills/` has:
- A valid `SKILL.md` with YAML frontmatter (`name`, `description`)
- Name matching directory name, lowercase with hyphens, ≤ 64 chars
- All `/skill:name` cross-references pointing to existing skills
- All referenced `.md`, `.sh`, `.ts` files existing on disk
- Correct wiring in `package.json` (`pi.skills`, `pi.extensions`)

**Extension tests** cover the plan-tracker core and bootstrap helper: init, update, status, clear, formatting, widget data, state reconstruction from conversation branches, bootstrap prompt generation, and deterministic install/discovery smoke coverage.

## Attribution

Skill content adapted from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent, licensed under MIT.

## License

MIT — see [LICENSE](LICENSE) for details.
