import { describe, expect, test } from "vitest";
import projectCommandsExtension, { buildProjectCommandMessage, formatProjectAudit, type ProjectAudit } from "../../extensions/project-commands.js";

const audit: ProjectAudit = {
  cwd: "/repo",
  targetPath: "/repo",
  targetExists: true,
  isGitRepo: true,
  requiredFiles: [
    { file: "PROJECT.md", exists: true },
    { file: "VISION.md", exists: false },
    { file: "ARCHITECTURE.md", exists: true },
    { file: "AGENTS.md", exists: false },
  ],
  projectStateExists: true,
  projectKnowledgeExists: false,
  topLevelEntries: ["PROJECT.md", "src", "package.json"],
};

describe("project command registration", () => {
  test("registers exact /project:* command names", () => {
    const names: string[] = [];
    projectCommandsExtension({
      registerCommand: (name: string) => {
        names.push(name);
      },
    } as any);

    expect(names).toEqual([
      "project:onboard",
      "project:new:slice",
      "project:new:strand",
      "project:build",
      "project:implement",
      "project:change",
    ]);
  });
});

describe("project command message builders", () => {
  test("formats deterministic audit context", () => {
    const text = formatProjectAudit(audit);
    expect(text).toContain("Target path: /repo");
    expect(text).toContain("present: PROJECT.md");
    expect(text).toContain("missing: VISION.md");
    expect(text).toContain("project_knowledge state: missing");
  });

  test("onboard command requires real project files and knowledge seeding", () => {
    const text = buildProjectCommandMessage("onboard", "", audit);
    expect(text).toContain("/project:onboard");
    expect(text).toContain("PROJECT.md, VISION.md, ARCHITECTURE.md, and AGENTS.md");
    expect(text).toContain("Planned Features / Capabilities");
    expect(text).toContain("Seed project_knowledge");
    expect(text).toContain("Do not dump all questions at once");
  });

  test("new:slice message drives the funnel and ends by creating a defined slice", () => {
    const msg = buildProjectCommandMessage("new:slice", "DNS caching", undefined);
    expect(msg).toContain('name="/project:new:slice"');
    expect(msg).toContain("/skill:brainstorming");
    expect(msg).toContain("ask_user_question");
    expect(msg).toContain("strand");
    expect(msg).toContain("slice:create");
    expect(msg).toContain("defined");
  });

  test("brainstorm is no longer a supported command type", () => {
    // @ts-expect-error brainstorm removed from ProjectCommand union
    expect(() => buildProjectCommandMessage("brainstorm", "", undefined)).not.toThrow();
  });

  test("build command routes by project_tracker state", () => {
    const text = buildProjectCommandMessage("build", "", audit);
    expect(text).toContain("/project:build");
    expect(text).toContain("Read project_tracker status");
    expect(text).toContain("Active slice with an active knot + linked plan");
  });

  test("change command enforces dual-write architecture updates", () => {
    const text = buildProjectCommandMessage("change", "rename subsystem", audit);
    expect(text).toContain("/project:change");
    expect(text).toContain("Planned Features / Capabilities");
    expect(text).toContain("dual-write");
    expect(text).toContain("project_knowledge decision entry");
  });
});
