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

  test("README does not describe executing-plans with stale checkpoint wording", async () => {
    const text = await read("README.md");
    expect(text).not.toContain("Batch execution with checkpoints for architect review");
  });

  test("writing-skills no longer claims only two frontmatter fields exist", async () => {
    const text = await read("skills/writing-skills/SKILL.md");
    expect(text).toContain("Two required fields");
    expect(text).not.toContain("Only two fields supported");
  });

  test("integration smoke derives package version dynamically", async () => {
    const text = await read("tests/integration/pi-superpowers-workflow.sh");
    expect(text).toContain("PACKAGE_VERSION=");
    expect(text).toContain("package.json");
    expect(text).not.toContain("@furbyhaxx/pi-superpowers@0.2.1");
  });
});
