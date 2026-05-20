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

  test("using-git-worktrees prefers native tools before git fallback", async () => {
    const text = await file("skills/using-git-worktrees/SKILL.md");
    expect(text).toContain("### 1a. Native Worktree Tools (preferred)");
    expect(text).toContain("### 1b. Git Worktree Fallback");
    expect(text).toContain("Submodule guard");
  });

  test("finishing-a-development-branch includes provenance cleanup", async () => {
    const text = await file("skills/finishing-a-development-branch/SKILL.md");
    expect(text).toContain("Detached HEAD");
    expect(text).toContain("Only runs for Options 1 and 4");
    expect(text).toContain("Only clean up worktrees under");
  });

  test("finishing skill never cleans PR worktrees", async () => {
    const text = await file("skills/finishing-a-development-branch/SKILL.md");
    expect(text).toContain("Options 2 and 3 always preserve the worktree");
    expect(text).toContain("Detached HEAD");
    expect(text).toContain("provenance");
  });

  test("brainstorming includes hard gate and user review gate", async () => {
    const text = await file("skills/brainstorming/SKILL.md");
    expect(text).toContain("<HARD-GATE>");
    expect(text).toContain("User reviews written spec");
  });

  test("brainstorming uses a hard gate and checklist", async () => {
    const text = await file("skills/brainstorming/SKILL.md");
    expect(text).toContain("<HARD-GATE>");
    expect(text).toContain("## Checklist");
    expect(text).toContain("scope decomposition");
    expect(text).toContain("User reviews written spec");
  });

  test("writing-plans includes no-placeholders rules", async () => {
    const text = await file("skills/writing-plans/SKILL.md");
    expect(text).toContain("## No Placeholders");
    expect(text).toContain("docs/superpowers/plans/");
  });

  test("writing-plans uses superpowers paths and placeholder rules", async () => {
    const text = await file("skills/writing-plans/SKILL.md");
    expect(text).toContain("docs/superpowers/specs/");
    expect(text).toContain("docs/superpowers/plans/");
    expect(text).toContain("## No Placeholders");
    expect(text).toContain("## Self-Review");
  });

  test("visual companion guidance exists", async () => {
    const text = await file("skills/brainstorming/visual-companion.md");
    expect(text).toContain("AskUserQuestion");
  });

  test("visual companion is pi-native, not browser-server specific", async () => {
    const text = await file("skills/brainstorming/visual-companion.md");
    expect(text).toContain("AskUserQuestion");
    expect(text).toContain("preview");
    expect(text).not.toContain("start-server.sh");
  });

  test("bootstrap extension exists", async () => {
    const text = await file("extensions/superpowers-bootstrap.ts");
    expect(text).toContain("before_agent_start");
  });
});
