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
