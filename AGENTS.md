# AGENTS.md: pi-project-strand

## About This Repo

TypeScript pi package providing FRS/MVFoS project tracking, persistent knowledge graph, and vibe-coded collaboration patterns. Pi loads TypeScript via jiti — **no build step**.

**Layout:**
- `extensions/` — Pi extension modules (auto-discovered, no build)
- `skills/` — Pi skill directories (`<name>/SKILL.md`)
- `extensions/project-commands.ts` — registered `/project:*` commands that call `pi.sendUserMessage(...)`
- `references/` — Reference docs for skills to load on demand
- `tests/` — Vitest unit + integration tests

## Build & Test

```bash
npm test                   # vitest run (all unit tests)
npm run test:watch         # vitest watch mode
npm run test:integration   # bash integration smoke test
```

No build step. No compilation. `npm test` is the only verification gate.

## Architecture Conventions

### Core/Wrapper Split — mandatory
- `*-core.ts` files: pure functions only, no imports from pi, no filesystem I/O, fully testable
- `*.ts` extension wrappers: pi tool registration + file I/O only, thin as possible
- Never mix I/O or pi imports into core files

### Adding a new tool
1. Add pure functions to `*-core.ts`
2. Add unit tests in `tests/extension/*-core.test.ts`
3. Register tool in `*.ts` wrapper
4. Add to `pi.extensions` in `package.json` if creating a new file
5. Run `npm test` — all tests must pass

### Adding a new skill
1. Create `skills/<name>/SKILL.md` — directory name must equal `name` frontmatter field exactly
2. Follow the `writing-skills` skill for TDD-based skill authoring
3. Keep `description` to triggering conditions only — no workflow summary in description
4. Add to `pi.skills` in `package.json` (or leave as `"skills"` to auto-discover the directory)

### Adding a new slash command
1. Register it in `extensions/project-commands.ts` with `pi.registerCommand("namespace:name", ...)`
2. Keep deterministic audit/build-message helpers exported and unit-tested
3. Use `pi.sendUserMessage(...)` to trigger LLM-driven workflows; use `deliverAs: "followUp"` if the agent is busy
4. Add the extension file to `package.json` `pi.extensions` only if creating a new extension module

## DO NOT

- **No build artifacts committed.** If you see `.js` or `.d.ts` files next to `.ts` source, they're artifacts — add them to `.gitignore`, don't commit them.
- **No `Type.Union(Type.Literal(...))` for string enums.** Always use `StringEnum` from `@earendil-works/pi-ai` — `Type.Union` breaks Google AI APIs.
- **No pi core packages in `dependencies`.** They belong in `peerDependencies`. The pi runtime provides them.
- **No changing `*-core.ts` files without updating tests.** Core functions must stay unit-tested.
- **No EdgeOS-specific content in generic skills.** `frs-strategy` has an EdgeOS deployment section — that's acceptable for now. New skills must be generic unless explicitly scoped.
- **Do not edit `.pi/project/state.json` or `.pi/project/knowledge.json` manually** — use the registered tools.

## Before Committing

```bash
npm test   # must pass — all tests green
```

Also check:
- `package.json` `files` array includes any new top-level directories
- `CHANGELOG.md` updated (conventional commits format)
- New reference files are linked from a skill's SKILL.md if they're meant to be found

## Skill Descriptions — Critical Rule

The `description` field in a skill's frontmatter YAML is the LLM's trigger. **Never summarize the workflow in the description** — agents will follow the description as a shortcut and skip reading the skill body. Description = triggering conditions only. See `writing-skills` skill for the full explanation.
