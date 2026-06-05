import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, test, expect } from "vitest";

const ROOT = resolve(__dirname, "../..");

async function file(path: string) {
  return readFile(join(ROOT, path), "utf-8");
}

describe("workflow regressions", () => {
  test("using-git-worktrees includes isolation detection", async () => {
    const text = await file("skills/using-git-worktrees/SKILL.md");
    expect(text).toContain("Step 0: Detect Existing Isolation");
    expect(text).toContain("Would you like me to set up an isolated worktree?");
  });

  test("using-git-worktrees prefers native tools before git fallback", async () => {
    const text = await file("skills/using-git-worktrees/SKILL.md");
    expect(text).toContain("### 1a. Native Worktree Tools (preferred)");
    expect(text).toContain("### 1b. Git Worktree Fallback");
    expect(text).toContain("Submodule guard");
  });

  test("finishing-a-development-branch includes knot assessment", async () => {
    const text = await file("skills/finishing-a-development-branch/SKILL.md");
    expect(text).toContain("Step 1.5: Assess Knot Done Criteria");
    expect(text).toContain("Detached HEAD");
  });

  test("brainstorming includes FRS context, planned capability context, and hard gate", async () => {
    const text = await file("skills/brainstorming/SKILL.md");
    expect(text).toContain("Identify FRS context");
    expect(text).toContain("Define MVFoS + knot criteria");
    expect(text).toContain("PROJECT.md` Planned Features / Capabilities");
    expect(text).toContain("<HARD-GATE>");
  });

  test("writing-plans includes planned capability, knot header, and no-placeholders rules", async () => {
    const text = await file("skills/writing-plans/SKILL.md");
    expect(text).toContain("**Planned Capability:**");
    expect(text).toContain("**FRS Knot:**");
    expect(text).toContain("**Knot Done Criteria:**");
    expect(text).toContain("## No Placeholders");
  });

  test("visual companion guidance exists", async () => {
    const text = await file("skills/brainstorming/visual-companion.md");
    expect(text).toContain("AskUserQuestion");
  });

  test("executing-plans recommends teammate-driven-development first", async () => {
    const text = await file("skills/executing-plans/SKILL.md");
    expect(text).toContain("Teammate-driven execution via `/skill:subagent-driven-development`");
    expect(text).toContain("inline, non-delegated execution");
  });

  test("subagent-driven-development is delegate-based", async () => {
    const text = await file("skills/subagent-driven-development/SKILL.md");
    expect(text).toContain("delegate worker");
    expect(text).toContain("teammate: \"worker\"");
    expect(text).toContain("teammate: \"reviewer\"");
  });

  test("implementer prompt uses worker teammate brief", async () => {
    const text = await file("skills/subagent-driven-development/implementer-prompt.md");
    expect(text).toContain('teammate: "worker"');
    expect(text).toContain("Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT");
  });

  test("verification-before-completion includes config-change verification and live validation", async () => {
    const text = await file("skills/verification-before-completion/SKILL.md");
    expect(text).toContain("Verifying Configuration Changes");
    expect(text).toContain("Live Validation Rule");
  });

  test("requesting-code-review template is reviewer/delegate oriented", async () => {
    const text = await file("skills/requesting-code-review/code-reviewer.md");
    expect(text).toContain('teammate: "reviewer"');
  });

  test("bootstrap extension exists", async () => {
    const text = await file("extensions/superpowers-bootstrap.ts");
    expect(text).toContain("before_agent_start");
  });

  test("frs-strategy skill exists and anchors MVFoS to planned capabilities", async () => {
    const text = await file("skills/frs-strategy/SKILL.md");
    expect(text).toContain("Feature Realization Strand");
    expect(text).toContain("MVFoS");
    expect(text).toContain("PROJECT.md` Planned Features / Capabilities");
  });

  test("frs-strategy documents all advance_by advancement paths", async () => {
    const text = await file("skills/frs-strategy/SKILL.md");
    expect(text).toContain("project_tracker action=knot:sign_off");
    expect(text).toContain("project_tracker action=knot:judge");
    expect(text).toContain("/project:knot:advance");
  });
});
