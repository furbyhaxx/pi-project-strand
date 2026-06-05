# pi-project-strand

![pi-project-strand banner](banner.jpg)

Persistent, project-scoped FRS/MVFoS tracking and workflow skills for [pi](https://github.com/earendil-works/pi).

`pi-project-strand` keeps two layers separate on purpose:

- **`project_tracker`** — persistent, shared, file-backed lifecycle state for slices, knots, criteria, linked plan files, resources, and milestones
- **Main/side slice tracks** — every slice lives on the durable `main` or `side` track; bare `/project:build` advances the main quest, while `/project:slice:execute <id>` targets a specific slice or side quest
- **`plan_tracker`** — the ad-hoc, session-scoped task checklist for the plan currently being executed right now

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
    "description": "High-performance Alpine-based edge router"
  },

  // Optional override
  // "stateFile": ".pi/project/state.json",

  // Optional custom strand templates. If omitted, built-in defaults are used.
  // "strands": {
  //   "quick": {
  //     "description": "Small, well-scoped slices",
  //     "knots": [
  //       { "name": "Prototype", "focus": "De-risk the approach" },
  //       { "name": "Realization", "focus": "Build the real behavior" },
  //       { "name": "Finalization", "focus": "Verify and polish" }
  //     ]
  //   }
  // }
}
```

State is stored persistently in `.pi/project/state.json` by default using **atomic updates**.
Knowledge is stored in `.pi/project/knowledge.json`. Implementation plan files are preferably stored under `.pi/project/plans/<slice-id>/<knot-slug>.md`; this is a convention, not a hard requirement, and `project_tracker action=knot:set_plan` can link any path.

## What's inside

### Extensions

- `extensions/plan-tracker.ts` — session-scoped todo/task progress widget
- `extensions/project-tracker.ts` — persistent project tracker tool
- `extensions/project-knowledge.ts` — persistent project knowledge graph tool
- `extensions/project-commands.ts` — registered `/project:*` slash commands that trigger LLM workflows via `pi.sendUserMessage(...)`
- `extensions/superpowers-bootstrap.ts` — injects project-strand reminders and project summary into the system prompt

### Tools

#### `plan_tracker`
Session-scoped ad-hoc plan tracking for the work currently in flight. Use this for the active knot's execution checklist or teammate-local implementation queue. Do **not** use it for persistent project progress:

```ts
plan_tracker({ action: "init", tasks: ["Task 1", "Task 2"] })
plan_tracker({ action: "update", index: 0, status: "complete" })
plan_tracker({ action: "status" })
plan_tracker({ action: "clear" })
```

#### `project_tracker`
Persistent project-scoped lifecycle tracking. Use this for durable progress across slices, knots, criteria, plan links, resources, milestones, and sign-off:

```ts
project_tracker({
  action: "slice:create",
  id: "dns-cache",
  name: "DNS Cache",
  description: "Cache upstream DNS responses",
  type: "vertical",
  track: "main",
  strand: "quick",
  goal: "Cut repeat DNS latency without stale answers",
  criteria: ["p99 cached lookup < 1ms", "respects upstream TTLs"],
})
project_tracker({ action: "slice:set_track", slice_id: "dns-cache", track: "side" })
project_tracker({ action: "knot:start", slice_id: "dns-cache", knot: "Prototype", criteria: ["Approach validated", "API shape decided"] })
project_tracker({ action: "knot:set_plan", slice_id: "dns-cache" }) // links the preferred .pi/project/plans/dns-cache/prototype.md path
project_tracker({ action: "verify_criterion", slice_id: "dns-cache", target: "knot", index: 0, evidence: "Spike succeeded" })
project_tracker({ action: "knot:sign_off", slice_id: "dns-cache" }) // arm agent-gated sign-off when advance_by permits it
project_tracker({ action: "knot:sign_off", slice_id: "dns-cache", evidence: "All agent-gated criteria verified" }) // confirm
project_tracker({ action: "status" })
project_tracker({ action: "next" })
```

### Slash commands

Workflow commands:

- `/project:onboard`
- `/project:new:slice <request>`
- `/project:new:strand`
- `/project:build` — advance the main quest only
- `/project:slice:execute <slice-id>` — advance one explicit slice or side quest
- `/project:implement` — alias for `/project:build`
- `/project:change`

Tracker/status commands:

- `/project:status`
- `/project:dashboard`
- `/project:slice <slice-id>`
- `/project:next`
- `/project:plan <slice-id>`
- `/project:knot:advance <slice-id>` — user sign-off / human override
- `/project:knot:judge <slice-id>` — independent judge advancement for judge-gated knots
- `/project:knot:fast_forward <slice-id>` — user-approved knot squash/skip workflow
- `/project:slice:advance <slice-id>` — final slice sign-off

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
3. **Choose the right execution entry point**: `/project:build` for the main quest, `/project:slice:execute <id>` for a specific or side-track slice
4. **Write or link a plan** for the active slice and knot, preferably at `.pi/project/plans/<slice-id>/<knot-slug>.md`
5. **Track the current ad-hoc execution checklist** with `plan_tracker`
6. **Track durable slice/knot/project progress** in `project_tracker`
7. **Advance the knot according to `advance_by`**: `agent` uses the two-step `project_tracker action=knot:sign_off`, `judge` uses `project_tracker action=knot:judge`, and `human` waits for `/project:knot:advance`

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
