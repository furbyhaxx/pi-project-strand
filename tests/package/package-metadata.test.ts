import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const ROOT_DIR = resolve(__dirname, "../..");
const PACKAGE_JSON = join(ROOT_DIR, "package.json");
const README = join(ROOT_DIR, "README.md");

let packageJson: any;
let readme = "";

beforeAll(async () => {
  packageJson = JSON.parse(await readFile(PACKAGE_JSON, "utf-8"));
  readme = await readFile(README, "utf-8");
});

describe("package metadata", () => {
  test("uses the pi-project-strand package name", () => {
    expect(packageJson.name).toBe("pi-project-strand");
  });

  test("points repository metadata at pi-project-strand", () => {
    expect(packageJson.repository?.url).toBe("https://github.com/furbyhaxx/pi-project-strand.git");
    expect(packageJson.homepage).toBe("https://github.com/furbyhaxx/pi-project-strand#readme");
    expect(packageJson.bugs?.url).toBe("https://github.com/furbyhaxx/pi-project-strand/issues");
  });

  test("registers the project knowledge extension", () => {
    expect(packageJson.pi?.extensions).toContain("extensions/project-knowledge.ts");
  });

  test("registers the project tracker extension", () => {
    expect(packageJson.pi?.extensions).toContain("extensions/project-tracker.ts");
  });

  test("uses current pi peer dependency scopes", () => {
    expect(packageJson.peerDependencies).toMatchObject({
      "@earendil-works/pi-ai": "*",
      "@earendil-works/pi-agent-core": "*",
      "@earendil-works/pi-coding-agent": "*",
      "@earendil-works/pi-tui": "*",
      typebox: "*",
    });
  });

  test("includes jsonc-parser as runtime dependency", () => {
    expect(packageJson.dependencies).toMatchObject({
      "jsonc-parser": expect.any(String),
    });
  });
});

describe("README install instructions", () => {
  test("documents local package-path install flow", () => {
    expect(readme).toContain("pi install -l /root/.pi/agent/custom-extensions/pi-project-strand");
    expect(readme).toContain('"/root/.pi/agent/custom-extensions/pi-project-strand"');
  });

  test("documents project jsonc configuration", () => {
    expect(readme).toContain(".pi/project.jsonc");
    expect(readme).toContain("state.json");
  });

  test("uses current upstream pi repository links", () => {
    expect(readme).toContain("https://github.com/earendil-works/pi");
    expect(readme).not.toContain("https://github.com/badlogic/pi-mono");
  });
});
