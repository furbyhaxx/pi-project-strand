# Pi Superpowers Upstream Sync and Pi-Native Parity Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Bring `@furbyhaxx/pi-superpowers` up to date with meaningful upstream `obra/superpowers` workflow improvements, while replacing harness-specific behavior with pi-native skills, tools, and extensions where appropriate.

**Architecture:** Treat upstream `obra/superpowers` as the behavioral source of truth for workflow content, but not as an implementation template for Claude/Codex/OpenCode-specific glue. Sync the core skills first, then add pi-native equivalents for the missing bootstrap/onboarding and visual brainstorming capabilities, then harden the package with regression and integration tests.

**Tech Stack:** Markdown `SKILL.md` files, TypeScript pi extensions, Vitest, `@earendil-works/pi-coding-agent` extension APIs, `AskUserQuestion`, `plan_tracker`, `pi -p` smoke/integration runs.

---

## Source Material Matrix

Use these exact sources during implementation. Do not freehand or rely on memory.

### Upstream behavior source
- Repo root: `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers`
- Release history: `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/RELEASE-NOTES.md`
- Testing guidance: `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/docs/testing.md`
- Claude behavioral test docs: `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/tests/claude-code/README.md`
- Feedback-derived hardening notes: `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/docs/plans/2025-11-28-skills-improvements-from-user-feedback.md`

### Upstream skill files to sync/adapt
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/finishing-a-development-branch/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/brainstorming/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/brainstorming/visual-companion.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/writing-plans/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/executing-plans/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/requesting-code-review/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/requesting-code-review/code-reviewer.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/implementer-prompt.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/spec-reviewer-prompt.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/code-quality-reviewer-prompt.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/using-superpowers/SKILL.md`
- `/home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/writing-skills/SKILL.md`

### Pi-native implementation sources
- Pi extension docs: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi package docs: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`
- Example extension: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/system-prompt-header.ts`
- Example extension: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/prompt-customizer.ts`
- Example extension: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/questionnaire.ts`
- Example extension: `/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/status-line.ts`

### Local package targets
- Repo root: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers`
- Skills dir: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/skills`
- Extensions dir: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/extensions`
- Tests dir: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/tests`
- Package manifest: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/package.json`
- README: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/README.md`
- Changelog: `/home/arnold/.pi/agent/custom-extensions/pi-superpowers/CHANGELOG.md`

### Non-goals
- Do **not** port `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.opencode/`, or `hooks/`.
- Do **not** blindly copy the upstream browser brainstorm server.
- Prefer pi-native `AskUserQuestion` preview flows and pi extensions over harness-specific shell hooks.

---

### Task 1: Create a source map and regression test scaffold

**Files:**
- Create: `docs/upstream-superpowers-source-map.md`
- Create: `tests/skills/upstream-parity.test.ts`
- Test: `tests/skills/upstream-parity.test.ts`

**Step 1: Write the failing regression test file**

```ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, test, expect } from "vitest";

const ROOT = resolve(__dirname, "../..");

async function file(path: string) {
  return readFile(join(ROOT, path), "utf-8");
}

describe("upstream parity regressions", () => {
  test("using-git-worktrees includes isolation detection", async () => {
    const text = await file("skills/using-git-worktrees/SKILL.md");
    expect(text).toContain("Step 0: Detect Existing Isolation");
    expect(text).toContain("Would you like me to set up an isolated worktree?");
  });

  test("finishing-a-development-branch includes provenance cleanup", async () => {
    const text = await file("skills/finishing-a-development-branch/SKILL.md");
    expect(text).toContain("Detached HEAD");
    expect(text).toContain("Only runs for Options 1 and 4");
    expect(text).toContain("Only clean up worktrees under");
  });

  test("brainstorming includes hard gate and user review gate", async () => {
    const text = await file("skills/brainstorming/SKILL.md");
    expect(text).toContain("<HARD-GATE>");
    expect(text).toContain("User reviews written spec");
  });

  test("writing-plans includes no-placeholders rules", async () => {
    const text = await file("skills/writing-plans/SKILL.md");
    expect(text).toContain("## No Placeholders");
    expect(text).toContain("docs/superpowers/plans/");
  });

  test("visual companion guidance exists", async () => {
    const text = await file("skills/brainstorming/visual-companion.md");
    expect(text).toContain("AskUserQuestion");
  });

  test("bootstrap extension exists", async () => {
    const text = await file("extensions/superpowers-bootstrap.ts");
    expect(text).toContain("before_agent_start");
  });
});
```

**Step 2: Run the new test to verify it fails**

Run: `npx vitest run tests/skills/upstream-parity.test.ts`
Expected: FAIL because the new parity expectations and new files do not exist yet.

**Step 3: Write the source map document**

```md
# Upstream Superpowers Source Map

| Local target | Upstream source | Pi-native adaptation |
|---|---|---|
| `skills/using-git-worktrees/SKILL.md` | `skills/using-git-worktrees/SKILL.md` | keep `/skill:` references and pi wording |
| `skills/brainstorming/visual-companion.md` | `skills/brainstorming/visual-companion.md` | replace browser server flow with `AskUserQuestion` previews |
| `extensions/superpowers-bootstrap.ts` | `skills/using-superpowers/SKILL.md` | implement as `before_agent_start` extension |
```

**Step 4: Re-run the test and keep it failing**

Run: `npx vitest run tests/skills/upstream-parity.test.ts`
Expected: FAIL again, now with the source map file present but implementation still missing.

**Step 5: Commit the scaffold**

```bash
git add docs/upstream-superpowers-source-map.md tests/skills/upstream-parity.test.ts
git commit -m "test: add upstream parity regression scaffold"
```

---

### Task 2: Sync the worktree lifecycle skills

**Files:**
- Modify: `skills/using-git-worktrees/SKILL.md`
- Modify: `skills/finishing-a-development-branch/SKILL.md`
- Test: `tests/skills/upstream-parity.test.ts`

**Step 1: Add focused assertions for the worktree skills**

```ts
test("using-git-worktrees prefers native tools before git fallback", async () => {
  const text = await file("skills/using-git-worktrees/SKILL.md");
  expect(text).toContain("### 1a. Native Worktree Tools (preferred)");
  expect(text).toContain("### 1b. Git Worktree Fallback");
  expect(text).toContain("Submodule guard");
});

test("finishing skill never cleans PR worktrees", async () => {
  const text = await file("skills/finishing-a-development-branch/SKILL.md");
  expect(text).toContain("Options 2 and 3 always preserve the worktree");
  expect(text).toContain("Detached HEAD");
  expect(text).toContain("provenance");
});
```

**Step 2: Run the focused assertions and confirm failure**

Run: `npx vitest run tests/skills/upstream-parity.test.ts -t worktree`
Expected: FAIL because the local skills still use the older workflow text.

**Step 3: Replace the local skill bodies with adapted upstream content**

Use these exact diff sources while editing:

```bash
diff -u \
  /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md \
  skills/using-git-worktrees/SKILL.md

diff -u \
  /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/finishing-a-development-branch/SKILL.md \
  skills/finishing-a-development-branch/SKILL.md
```

Apply these exact adaptations while porting:
- Keep pi-style `/skill:` references instead of `superpowers:` names.
- Preserve pi terminology like `plan_tracker` where relevant.
- Keep the upstream safety rules: existing-isolation detection, consent before creating a worktree, detached-HEAD handling, provenance-based cleanup, and no cleanup for PR/keep options.
- Remove any wording that assumes Claude/Codex-specific host features.

**Step 4: Run the regression tests and full suite**

Run: `npm test`
Expected: PASS for the new worktree parity checks and all existing tests.

**Step 5: Commit the synced lifecycle skills**

```bash
git add skills/using-git-worktrees/SKILL.md skills/finishing-a-development-branch/SKILL.md tests/skills/upstream-parity.test.ts
git commit -m "feat: sync worktree lifecycle skills"
```

---

### Task 3: Sync brainstorming and writing-plans, with a pi-native visual companion

**Files:**
- Modify: `skills/brainstorming/SKILL.md`
- Create: `skills/brainstorming/visual-companion.md`
- Modify: `skills/writing-plans/SKILL.md`
- Test: `tests/skills/upstream-parity.test.ts`

**Step 1: Add failing tests for brainstorming and planning upgrades**

```ts
test("brainstorming uses a hard gate and checklist", async () => {
  const text = await file("skills/brainstorming/SKILL.md");
  expect(text).toContain("<HARD-GATE>");
  expect(text).toContain("## Checklist");
  expect(text).toContain("Scope decomposition");
  expect(text).toContain("User reviews written spec");
});

test("writing-plans uses superpowers paths and placeholder rules", async () => {
  const text = await file("skills/writing-plans/SKILL.md");
  expect(text).toContain("docs/superpowers/specs/");
  expect(text).toContain("docs/superpowers/plans/");
  expect(text).toContain("## No Placeholders");
  expect(text).toContain("## Self-Review");
});

test("visual companion is pi-native, not browser-server specific", async () => {
  const text = await file("skills/brainstorming/visual-companion.md");
  expect(text).toContain("AskUserQuestion");
  expect(text).toContain("preview");
  expect(text).not.toContain("start-server.sh");
});
```

**Step 2: Run the tests to verify failure**

Run: `npx vitest run tests/skills/upstream-parity.test.ts -t "brainstorming|writing-plans|visual companion"`
Expected: FAIL because the local skills still use the old lighter content and the visual companion file does not exist.

**Step 3: Port the upstream brainstorming workflow and write a pi-native visual companion guide**

Source files to read before editing:

```bash
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/brainstorming/SKILL.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/brainstorming/visual-companion.md
```

The new `skills/brainstorming/visual-companion.md` should use this exact pi-native pattern instead of the upstream browser server:

```md
## Default pi-native mechanism
Use `AskUserQuestion` with `preview` for single-select visual comparisons.

```ts
AskUserQuestion({
  questions: [{
    question: "Which layout works better?",
    header: "Layout",
    multiSelect: false,
    options: [
      { label: "Option A", description: "Single-column", preview: "```md\n[wireframe]\n```" },
      { label: "Option B", description: "Sidebar", preview: "```md\n[wireframe]\n```" }
    ]
  }]
})
```
```

Also port these upstream brainstorming behaviors into `skills/brainstorming/SKILL.md`:
- hard gate before implementation
- explicit checklist
- scope decomposition for oversized projects
- design-for-isolation guidance
- spec self-review
- user review gate before planning
- visual-companion decision point

**Step 4: Port the upstream writing-plans workflow with pi naming retained**

Source file:

```bash
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/writing-plans/SKILL.md
```

Port these exact concepts into `skills/writing-plans/SKILL.md`:
- `docs/superpowers/plans/` output path
- scope check
- file-structure planning before tasks
- checkbox task steps
- no-placeholders rules
- self-review section
- subagent-driven vs executing-plans execution handoff

**Step 5: Run the updated tests and full suite**

Run: `npm test`
Expected: PASS for the brainstorming/planning parity assertions and all existing tests.

**Step 6: Commit the updated workflow docs**

```bash
git add skills/brainstorming/SKILL.md skills/brainstorming/visual-companion.md skills/writing-plans/SKILL.md tests/skills/upstream-parity.test.ts
git commit -m "feat: port brainstorming and planning workflow upgrades"
```

---

### Task 4: Sync execution, review, and subagent workflow skills and prompts

**Files:**
- Modify: `skills/executing-plans/SKILL.md`
- Modify: `skills/requesting-code-review/SKILL.md`
- Modify: `skills/requesting-code-review/code-reviewer.md`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `skills/subagent-driven-development/implementer-prompt.md`
- Modify: `skills/subagent-driven-development/spec-reviewer-prompt.md`
- Modify: `skills/subagent-driven-development/code-quality-reviewer-prompt.md`
- Test: `tests/skills/upstream-parity.test.ts`

**Step 1: Add failing tests for the execution/review workflow**

```ts
test("executing-plans recommends subagent-driven-development first", async () => {
  const text = await file("skills/executing-plans/SKILL.md");
  expect(text).toContain("works much better with access to subagents");
  expect(text).toContain("use superpowers:subagent-driven-development instead");
});

test("subagent-driven-development includes model selection and status handling", async () => {
  const text = await file("skills/subagent-driven-development/SKILL.md");
  expect(text).toContain("## Model Selection");
  expect(text).toContain("DONE_WITH_CONCERNS");
  expect(text).toContain("NEEDS_CONTEXT");
});

test("implementer prompt requires explicit status reporting", async () => {
  const text = await file("skills/subagent-driven-development/implementer-prompt.md");
  expect(text).toContain("Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT");
});
```

**Step 2: Run the failing tests**

Run: `npx vitest run tests/skills/upstream-parity.test.ts -t "executing-plans|subagent-driven-development|implementer prompt"`
Expected: FAIL because the local files still use the older content.

**Step 3: Port the upstream skill and prompt bodies with pi-specific substitutions**

Use these source files directly while editing:

```bash
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/executing-plans/SKILL.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/requesting-code-review/SKILL.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/requesting-code-review/code-reviewer.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/SKILL.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/implementer-prompt.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/spec-reviewer-prompt.md
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/subagent-driven-development/code-quality-reviewer-prompt.md
```

Apply these exact substitutions while porting:
- `TodoWrite` → `plan_tracker`
- `superpowers:<name>` → `/skill:<name>` in user-facing references
- keep dispatch wording neutral enough for pi subagent extensions or `pi -p` fallback
- keep the upstream model-selection/status/escalation behavior verbatim where possible

**Step 4: Verify the new prompts with unit tests**

Run: `npm test`
Expected: PASS, including the new execution/review assertions.

**Step 5: Commit the synced execution/review workflow**

```bash
git add \
  skills/executing-plans/SKILL.md \
  skills/requesting-code-review/SKILL.md \
  skills/requesting-code-review/code-reviewer.md \
  skills/subagent-driven-development/SKILL.md \
  skills/subagent-driven-development/implementer-prompt.md \
  skills/subagent-driven-development/spec-reviewer-prompt.md \
  skills/subagent-driven-development/code-quality-reviewer-prompt.md \
  tests/skills/upstream-parity.test.ts

git commit -m "feat: sync execution and review workflow skills"
```

---

### Task 5: Add a pi-native bootstrap extension from `using-superpowers`

**Files:**
- Create: `extensions/superpowers-bootstrap.ts`
- Modify: `package.json`
- Create: `tests/extension/superpowers-bootstrap.test.ts`
- Test: `tests/extension/superpowers-bootstrap.test.ts`

**Step 1: Write a failing unit test for the bootstrap helper**

```ts
import { describe, expect, test } from "vitest";
import { buildSuperpowersBootstrap } from "../../extensions/superpowers-bootstrap.js";

describe("buildSuperpowersBootstrap", () => {
  test("prioritizes user instructions over superpowers rules", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("User instructions override superpowers guidance");
  });

  test("requires skill-first behavior before action", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("If even a 1% chance a skill applies");
    expect(text).toContain("before any response or action");
  });

  test("uses pi-native wording", () => {
    const text = buildSuperpowersBootstrap();
    expect(text).toContain("/skill:");
    expect(text).toContain("AskUserQuestion");
    expect(text).not.toContain("Skill tool");
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts`
Expected: FAIL because the extension file does not exist yet.

**Step 3: Implement the extension using pi examples, not upstream hook files**

Source files to read first:

```bash
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/skills/using-superpowers/SKILL.md
read /home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/system-prompt-header.ts
read /home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/prompt-customizer.ts
```

Implement this exact shape:

```ts
export function buildSuperpowersBootstrap(): string {
  return [
    "Use pi-superpowers workflows before acting.",
    "User instructions override superpowers guidance.",
    "If even a 1% chance a skill applies, check and use it before any response or action.",
    "Prefer pi-native tools like /skill:, AskUserQuestion, and plan_tracker.",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${buildSuperpowersBootstrap()}`,
  }));
}
```

Then register the new extension in `package.json`:

```json
"pi": {
  "extensions": [
    "extensions/plan-tracker.ts",
    "extensions/superpowers-bootstrap.ts"
  ],
  "skills": ["skills"]
}
```

**Step 4: Run the extension tests and a smoke import**

Run: `npx vitest run tests/extension/superpowers-bootstrap.test.ts`
Expected: PASS.

Run: `node --input-type=module -e 'import jitiFactory from "jiti"; const jiti = jitiFactory(import.meta.url,{interopDefault:true}); const mod = await jiti("./extensions/superpowers-bootstrap.ts"); console.log(typeof mod.default, typeof mod.buildSuperpowersBootstrap);'`
Expected: `function function`

**Step 5: Commit the bootstrap extension**

```bash
git add extensions/superpowers-bootstrap.ts package.json tests/extension/superpowers-bootstrap.test.ts
git commit -m "feat: add pi-native superpowers bootstrap"
```

---

### Task 6: Apply feedback-derived hardening improvements not yet in the shipped upstream skill set

**Files:**
- Modify: `skills/verification-before-completion/SKILL.md`
- Modify: `skills/test-driven-development/testing-anti-patterns.md`
- Modify: `skills/requesting-code-review/code-reviewer.md`
- Modify: `skills/subagent-driven-development/implementer-prompt.md`
- Test: `tests/skills/upstream-parity.test.ts`

**Step 1: Add failing tests for the hardening improvements**

```ts
test("verification-before-completion includes config-change verification", async () => {
  const text = await file("skills/verification-before-completion/SKILL.md");
  expect(text).toContain("Verifying Configuration Changes");
  expect(text).toContain("What should be DIFFERENT after this change?");
});

test("testing anti-patterns covers mock-interface drift", async () => {
  const text = await file("skills/test-driven-development/testing-anti-patterns.md");
  expect(text).toContain("Mocks Derived from Implementation");
  expect(text).toContain("derive mock from interface");
});

test("code reviewer prompt explicitly reads files before analysis", async () => {
  const text = await file("skills/requesting-code-review/code-reviewer.md");
  expect(text).toContain("BEFORE analyzing, read these files");
});
```

**Step 2: Run the tests to verify failure**

Run: `npx vitest run tests/skills/upstream-parity.test.ts -t "config-change|mock-interface|reads files"`
Expected: FAIL because these improvements are not present yet.

**Step 3: Port the hardening ideas from the upstream feedback document**

Source document:

```bash
read /home/arnold/.cache/pi-searxng/git/github.com/obra/superpowers/docs/plans/2025-11-28-skills-improvements-from-user-feedback.md
```

Port these exact improvements:
- `skills/verification-before-completion/SKILL.md`
  - add a `## Verifying Configuration Changes` section
  - include the five-step gate function
- `skills/test-driven-development/testing-anti-patterns.md`
  - add the mock-interface-drift anti-pattern
- `skills/requesting-code-review/code-reviewer.md`
  - add explicit file-reading instructions before review
- `skills/subagent-driven-development/implementer-prompt.md`
  - keep upstream self-review, but add the “if you identify issues during self-reflection, fix them now” emphasis if it is still missing after Task 4

**Step 4: Re-run the suite**

Run: `npm test`
Expected: PASS for the hardening checks and the full suite.

**Step 5: Commit the hardening pass**

```bash
git add \
  skills/verification-before-completion/SKILL.md \
  skills/test-driven-development/testing-anti-patterns.md \
  skills/requesting-code-review/code-reviewer.md \
  skills/subagent-driven-development/implementer-prompt.md \
  tests/skills/upstream-parity.test.ts

git commit -m "feat: harden verification and review skills"
```

---

### Task 7: Refresh package documentation and provenance notes

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `skills/writing-skills/SKILL.md`
- Modify: `docs/upstream-superpowers-source-map.md`
- Create: `tests/package/readme-parity.test.ts`
- Test: `tests/package/readme-parity.test.ts`

**Step 1: Write a failing README/doc parity test**

```ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(__dirname, "../..");

async function read(path: string) {
  return readFile(join(ROOT, path), "utf-8");
}

describe("README parity", () => {
  test("documents pi-native bootstrap and visual companion", async () => {
    const text = await read("README.md");
    expect(text).toContain("superpowers-bootstrap");
    expect(text).toContain("AskUserQuestion preview");
  });

  test("writing-skills no longer claims only two frontmatter fields exist", async () => {
    const text = await read("skills/writing-skills/SKILL.md");
    expect(text).toContain("Two required fields");
    expect(text).not.toContain("Only two fields supported");
  });
});
```

**Step 2: Run the test to verify failure**

Run: `npx vitest run tests/package/readme-parity.test.ts`
Expected: FAIL because the docs have not been updated yet.

**Step 3: Update README, source-map docs, and writing-skills**

README updates must include:
- pi-native bootstrap extension
- visual brainstorming via `AskUserQuestion` preview
- new workflow skill defaults (`docs/superpowers/specs` and `docs/superpowers/plans`)
- note that upstream plugin/hook directories are intentionally not ported
- provenance note pointing to `docs/upstream-superpowers-source-map.md`

`skills/writing-skills/SKILL.md` must be corrected to match the upstream fix:

```md
- Two required fields: `name` and `description` (see agentskills/pi docs for additional supported fields)
```

Update `CHANGELOG.md` with a new unreleased entry summarizing the sync and pi-native feature work.

**Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS.

**Step 5: Commit the doc refresh**

```bash
git add README.md CHANGELOG.md skills/writing-skills/SKILL.md docs/upstream-superpowers-source-map.md tests/package/readme-parity.test.ts
git commit -m "docs: refresh pi-superpowers sync documentation"
```

---

### Task 8: Add pi-native workflow integration coverage and final verification

**Files:**
- Create: `tests/integration/pi-superpowers-workflow.sh`
- Create: `tests/integration/README.md`
- Modify: `package.json`
- Test: `tests/integration/pi-superpowers-workflow.sh`

**Step 1: Write the integration script first**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_AGENT="$(mktemp -d)"
TMP_PROJ="$(mktemp -d)"
trap 'rm -rf "$TMP_AGENT" "$TMP_PROJ"' EXIT

cd "$TMP_PROJ"
PI_CODING_AGENT_DIR="$TMP_AGENT" pi install -l "$ROOT"

PI_CODING_AGENT_DIR="$TMP_AGENT" pi -p --no-session --no-context-files \
  "I want to add a new feature to my app" > brainstorm.txt

PI_CODING_AGENT_DIR="$TMP_AGENT" pi -p --no-session --no-context-files \
  "I finished implementation and need to wrap up my branch" > finish.txt

rg -n "brainstorm|design|spec" brainstorm.txt
rg -n "branch|merge|pull request|worktree" finish.txt
```

**Step 2: Run the script to confirm it fails or is incomplete before final wiring**

Run: `bash tests/integration/pi-superpowers-workflow.sh`
Expected: FAIL initially or produce output that proves the workflow guidance still needs adjustment.

**Step 3: Add integration docs and package script**

Add this to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:integration": "bash tests/integration/pi-superpowers-workflow.sh"
}
```

Create `tests/integration/README.md` documenting:
- required `pi` binary
- temp `PI_CODING_AGENT_DIR` usage
- what the smoke test proves
- how to inspect failures

**Step 4: Run complete verification**

Run: `npm test`
Expected: PASS.

Run: `npm run test:integration`
Expected: PASS and show skill-guided output for brainstorming and branch-finishing scenarios.

Run: `tmp_agent=$(mktemp -d) && tmp_proj=$(mktemp -d) && cd "$tmp_proj" && PI_CODING_AGENT_DIR="$tmp_agent" pi install -l git:github.com/furbyhaxx/pi-superpowers`
Expected: PASS.

Run: `npm pack --dry-run`
Expected: PASS and include the new extension, skill resources, docs, and tests as intended.

**Step 5: Commit the integration coverage**

```bash
git add tests/integration/pi-superpowers-workflow.sh tests/integration/README.md package.json
git commit -m "test: add pi workflow integration coverage"
```

---

## Final Verification Checklist

Before calling the project updated, run all of these from `/home/arnold/.pi/agent/custom-extensions/pi-superpowers`:

```bash
npm test
npm run test:integration
node --input-type=module -e 'import jitiFactory from "jiti"; const jiti = jitiFactory(import.meta.url,{interopDefault:true}); const mod = await jiti("./extensions/superpowers-bootstrap.ts"); console.log(typeof mod.default, typeof mod.buildSuperpowersBootstrap);'
pi install -l .
npm pack --dry-run
```

Expected results:
- all Vitest suites pass
- integration smoke test passes
- bootstrap extension imports as functions
- local install succeeds
- dry-run package contains the new extension and skill resources

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-20-pi-superpowers-upstream-sync.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
