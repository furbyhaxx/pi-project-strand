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
  test("uses the scoped furbyhaxx package name", () => {
    expect(packageJson.name).toBe("@furbyhaxx/pi-superpowers");
  });

  test("points repository metadata at the furbyhaxx fork", () => {
    expect(packageJson.repository?.url).toBe("https://github.com/furbyhaxx/pi-superpowers.git");
    expect(packageJson.homepage).toBe("https://github.com/furbyhaxx/pi-superpowers#readme");
    expect(packageJson.bugs?.url).toBe("https://github.com/furbyhaxx/pi-superpowers/issues");
  });

  test("uses current pi peer dependency scopes", () => {
    expect(packageJson.peerDependencies).toMatchObject({
      "@earendil-works/pi-ai": "*",
      "@earendil-works/pi-agent-core": "*",
      "@earendil-works/pi-coding-agent": "*",
      "@earendil-works/pi-tui": "*",
      typebox: "*",
    });
    expect(Object.keys(packageJson.peerDependencies)).not.toContain("@mariozechner/pi-ai");
    expect(Object.keys(packageJson.peerDependencies)).not.toContain("@mariozechner/pi-coding-agent");
    expect(Object.keys(packageJson.peerDependencies)).not.toContain("@mariozechner/pi-tui");
    expect(Object.keys(packageJson.peerDependencies)).not.toContain("@sinclair/typebox");
  });
});

describe("README install instructions", () => {
  test("points install commands at the furbyhaxx fork", () => {
    expect(readme).toContain("pi install git:github.com/furbyhaxx/pi-superpowers");
    expect(readme).toContain('"packages": ["git:github.com/furbyhaxx/pi-superpowers"]');
  });

  test("uses current upstream pi repository links", () => {
    expect(readme).toContain("https://github.com/earendil-works/pi");
    expect(readme).not.toContain("https://github.com/badlogic/pi-mono");
  });

  test("does not reference the old coctostan fork", () => {
    expect(readme).not.toContain("github.com/coctostan/pi-superpowers");
  });
});
