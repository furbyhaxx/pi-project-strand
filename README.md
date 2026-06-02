# pi-project-strand

![pi-project-strand banner](banner.jpg)

Persistent, project-scoped FRS/MVFoS tracking and workflow skills for [pi](https://github.com/earendil-works/pi).

`pi-project-strand` keeps two layers separate on purpose:

- **`project_tracker`** — persistent, shared, file-backed state for slices, knots, criteria, linked plans, and milestones
- **`plan_tracker`** — session-scoped, teammate-local task tracking for the work happening right now

This package is portable. EdgeOS is the first project using it, but project specifics live in `.pi/project.jsonc`, not in the package code.

## Install

### Local package path

```bash
pi install -l /root/.pi/agent/custom-extensions/pi-project-strand
```

Or add it to the current project's `.pi/settings.json`:

```json
{
  "packages": [
    "/root/.pi/agent/custom-extensions/pi-project-strand"
  ]
}
```

## Project configuration

Create `.pi/project.jsonc` in the project root:

```jsonc
{
  "project": {
    "name": "EdgeOS",
    "description": "High-performance Alpine-based edge router",
  },

  // Optional override
  // "stateFile": ".pi/project/state.json",

  // Optional custom knot sequence
  // "knots": [
  //   { "name": "PoW", "focus": "Prove approach and establish design decisions" },
  //   { "name": "Alpha", "focus": "First real, integrated implementation" },
  // ]
}
```

State is stored persistently in `.pi/project/state.json` by default using **atomic updates**.

## What's inside

### Extensions

- `extensions/plan-tracker.ts` — session-scoped todo/task progress widget
- `extensions/project-tracker.ts` — persistent project tracker tool + slash commands
- `extensions/superpowers-bootstrap.ts` — injects project-strand reminders and project summary into the system prompt

### Tools

#### `plan_tracker`
Session-scoped task tracking:

```ts
plan_tracker({ action: "init", tasks: ["Task 1", "Task 2"] })
plan_tracker({ action: "update", index: 0, status: "complete" })
plan_tracker({ action: "status" })
plan_tracker({ action: "clear" })
```

#### `project_tracker`
Persistent project-scoped tracking:

```ts
project_tracker({ action: "slice:create", id: "dns-cache", name: "DNS Cache", description: "...", type: "vertical" })
project_tracker({ action: "knot:start", slice_id: "dns-cache", knot: "PoW", criteria: ["Approach validated", "API shape decided"] })
project_tracker({ action: "knot:verify_criterion", slice_id: "dns-cache", index: 0, evidence: "Spike succeeded" })
project_tracker({ action: "status" })
project_tracker({ action: "next" })
```

### Slash commands

- `/project:status`
- `/project:dashboard`
- `/project:slice <slice-id>`
- `/project:next`
- `/project:plan <slice-id>`
- `/project:knot:advance <slice-id>` — **user sign-off gate**

### Skills

This package includes the adapted workflow skills, including:

- `brainstorming`
- `frs-strategy`
- `writing-plans`
- `executing-plans`
- `subagent-driven-development` (delegate/teammate-based)
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`
- `requesting-code-review`
- `receiving-code-review`
- `dispatching-parallel-agents`
- `using-git-worktrees`
- `finishing-a-development-branch`
- `writing-skills`

## Workflow model

1. **Define or inspect the project strand** with `project_tracker` or `/project:*`
2. **Brainstorm** with `/skill:brainstorming`
3. **Write or link a plan** for the active slice and knot
4. **Track per-session execution** with `plan_tracker`
5. **Verify criteria** in `project_tracker`
6. **User signs off the knot** with `/project:knot:advance`

## Development

### Testing

```bash
npm test
```

Tests cover:
- `plan_tracker` core behavior
- `project_tracker` persistent state transitions
- bootstrap prompt generation
- package metadata and README parity
- skill validation and cross-references
- install/discovery smoke coverage

## Attribution

The workflow skills started from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent, then were adapted for pi and extended for project-scoped FRS/MVFoS work.

## License

MIT — see [LICENSE](LICENSE)
