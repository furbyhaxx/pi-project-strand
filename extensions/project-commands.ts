import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const REQUIRED_PROJECT_FILES = ["PROJECT.md", "VISION.md", "ARCHITECTURE.md", "AGENTS.md"] as const;

type ProjectCommand = "onboard" | "brainstorm" | "build" | "change";

export interface ProjectAudit {
  cwd: string;
  targetPath: string;
  targetExists: boolean;
  isGitRepo: boolean;
  requiredFiles: Array<{ file: string; exists: boolean }>;
  projectStateExists: boolean;
  projectKnowledgeExists: boolean;
  topLevelEntries: string[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveTargetPath(cwd: string, args: string): string {
  const trimmed = args.trim();
  if (!trimmed) return cwd;
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
}

export async function auditProject(cwd: string, args = ""): Promise<ProjectAudit> {
  const targetPath = resolveTargetPath(cwd, args);
  const targetExists = await exists(targetPath);
  const topLevelEntries = targetExists
    ? (await readdir(targetPath)).sort().slice(0, 80)
    : [];

  return {
    cwd,
    targetPath,
    targetExists,
    isGitRepo: targetExists && await exists(path.join(targetPath, ".git")),
    requiredFiles: await Promise.all(
      REQUIRED_PROJECT_FILES.map(async (file) => ({ file, exists: targetExists && await exists(path.join(targetPath, file)) }))
    ),
    projectStateExists: targetExists && await exists(path.join(targetPath, ".pi", "project", "state.json")),
    projectKnowledgeExists: targetExists && await exists(path.join(targetPath, ".pi", "project", "knowledge.json")),
    topLevelEntries,
  };
}

export function formatProjectAudit(audit: ProjectAudit): string {
  const required = audit.requiredFiles
    .map((entry) => `- ${entry.exists ? "present" : "missing"}: ${entry.file}`)
    .join("\n");
  const entries = audit.topLevelEntries.length > 0 ? audit.topLevelEntries.join(", ") : "<none/read failed>";

  return [
    `Target path: ${audit.targetPath}`,
    `Target exists: ${audit.targetExists ? "yes" : "no"}`,
    `Git repo: ${audit.isGitRepo ? "yes" : "no"}`,
    "Required project files:",
    required,
    `project_tracker state: ${audit.projectStateExists ? "present" : "missing"}`,
    `project_knowledge state: ${audit.projectKnowledgeExists ? "present" : "missing"}`,
    `Top-level entries: ${entries}`,
  ].join("\n");
}

function baseCommandHeader(command: ProjectCommand, args: string, audit?: ProjectAudit): string {
  return [
    `<pi-project-strand-command name="/project:${command}">`,
    args.trim() ? `User arguments: ${args.trim()}` : "User arguments: <none>",
    audit ? `\nDeterministic project audit:\n${formatProjectAudit(audit)}` : "",
    `</pi-project-strand-command>`,
  ].filter(Boolean).join("\n");
}

export function buildProjectCommandMessage(command: ProjectCommand, args: string, audit?: ProjectAudit): string {
  const header = baseCommandHeader(command, args, audit);

  if (command === "onboard") {
    return `${header}

Run the pi-project-strand onboarding workflow as an interactive, LLM-driven process.

Requirements:
1. Act as Key Account Manager: collaborate tightly, ask one focused question at a time, and persist decisions.
2. Use the deterministic audit above to identify missing or placeholder project files.
3. Required project files are PROJECT.md, VISION.md, ARCHITECTURE.md, and AGENTS.md.
4. Read pi-project-strand/references/required-project-files.md before drafting file contents.
5. PROJECT.md must include a high-level Planned Features / Capabilities section. Capture what the user ultimately wants the project to include, not just what exists now.
6. If files are missing, interview the user and create them one at a time. Confirm each before moving on.
7. Initialize or update project_tracker slices/knots only after understanding the project and its planned capability map.
8. Seed project_knowledge with decisions, rejected approaches, constraints, warnings, conventions, and howtos learned during onboarding.
9. End with a concise summary: created files, initialized state, captured knowledge, planned capability map, suggested next slice.

Do not dump all questions at once. Do not ask the user to implement anything.`;
  }

  if (command === "brainstorm") {
    return `${header}

Start a pi-project-strand brainstorming workflow for the requested topic.

Requirements:
1. Load /skill:brainstorming before proceeding.
2. Check PROJECT.md Planned Features / Capabilities, project_tracker status, and project_knowledge context before asking design questions.
3. Surface relevant existing planned capabilities, decisions, constraints, and rejected approaches at the start.
4. If no topic was provided, ask the user what change/feature/decision to brainstorm.
5. Follow the brainstorming skill completely: design approval before plan, spec review before implementation.
6. Persist new decisions and constraints into project_knowledge as they emerge.`;
  }

  if (command === "build") {
    return `${header}

Resume or start implementing the active pi-project-strand project slice.

Requirements:
1. Read project_tracker status, next action, active slice, active knot, criteria, and linked plan status.
2. Read PROJECT.md Planned Features / Capabilities and relevant project_knowledge entries for the active slice and current files.
3. Route based on state:
   - Active slice + linked plan: resume with /skill:executing-plans or /skill:subagent-driven-development.
   - Active slice + knot criteria but no plan: use /skill:writing-plans first.
   - No active knot: use /skill:frs-strategy to start the next knot and define criteria.
   - No active slice: show defined slices and ask which to activate.
   - No project files/tracker state: run /project:onboard first.
4. Explain the routing briefly, then proceed with the appropriate skill.
5. Keep user gates: design approval, spec review, knot sign-off, deployment approval.`;
  }

  return `${header}

Run a pi-project-strand project change workflow.

Requirements:
1. Identify what is changing: PROJECT.md (including Planned Features / Capabilities), VISION.md, ARCHITECTURE.md, AGENTS.md, project_tracker slices/knots/criteria, project_knowledge, or implementation plans.
2. Ask focused clarification if the requested change is ambiguous.
3. Assess impact before editing: active knot criteria, architecture consistency, superseded knowledge, dependent slices.
4. For planned-feature changes, update PROJECT.md and consider whether project_tracker slices must be created, held, completed, or reprioritized.
5. For architecture changes, dual-write: update the relevant doc and add/update a project_knowledge decision entry with rationale.
6. For rejected paths, use project_knowledge category rejected and link/supersede related decisions when appropriate.
7. Verify docs/tracker/knowledge consistency after the change.
8. Commit with a conventional commit message only after verification.

Do not proceed with unclear architectural changes without user approval.`;
}

function sendProjectCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string): void {
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
    return;
  }
  pi.sendUserMessage(message, { deliverAs: "followUp" });
  ctx.ui.notify("Queued project command for after the current turn", "info");
}

export default function projectCommandsExtension(pi: ExtensionAPI) {
  pi.registerCommand("project:onboard", {
    description: "Interactive LLM-driven project onboarding and required-file initialization",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd, args);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("onboard", args, audit));
    },
  });

  pi.registerCommand("project:brainstorm", {
    description: "Start an LLM-driven brainstorming workflow for a feature, change, or decision",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("brainstorm", args, audit));
    },
  });

  pi.registerCommand("project:build", {
    description: "Resume or start implementation based on current project_tracker state",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("build", args, audit));
    },
  });

  pi.registerCommand("project:implement", {
    description: "Alias for /project:build",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("build", args, audit));
    },
  });

  pi.registerCommand("project:change", {
    description: "Interactively change project docs, tracker state, knowledge, architecture, or plans",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("change", args, audit));
    },
  });
}
