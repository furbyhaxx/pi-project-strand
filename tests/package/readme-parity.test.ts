import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(__dirname, "../..");

async function read(path: string) {
  return readFile(join(ROOT, path), "utf-8");
}

describe("README parity", () => {
  test("documents both project_tracker and plan_tracker", async () => {
    const text = await read("README.md");
    expect(text).toContain("project_tracker");
    expect(text).toContain("plan_tracker");
  });

  test("documents project jsonc config and knot advance command", async () => {
    const text = await read("README.md");
    expect(text).toContain(".pi/project.jsonc");
    expect(text).toContain(".pi/project/plans/<slice-id>/<knot-slug>.md");
    expect(text).toContain("/project:knot:advance");
    expect(text).toContain("/project:slice:execute");
    expect(text).toContain("knot:sign_off");
  });

  test("writing-skills no longer claims only two frontmatter fields exist", async () => {
    const text = await read("skills/writing-skills/SKILL.md");
    expect(text).toContain("Two required fields");
    expect(text).not.toContain("Only two fields supported");
  });

  test("required PROJECT.md template includes planned feature map", async () => {
    const template = await read("references/required-project-files.md");
    const project = await read("PROJECT.md");
    expect(template).toContain("## Planned Features / Capabilities");
    expect(template).toContain("The planned feature/capability list is mandatory");
    expect(project).toContain("## Planned Features / Capabilities");
  });

  test("integration smoke derives package version dynamically", async () => {
    const text = await read("tests/integration/pi-superpowers-workflow.sh");
    expect(text).toContain("PACKAGE_VERSION=");
    expect(text).toContain("package.json");
  });
});
