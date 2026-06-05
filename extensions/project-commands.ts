import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const REQUIRED_PROJECT_FILES = ["PROJECT.md", "VISION.md", "ARCHITECTURE.md", "AGENTS.md"] as const;

type ProjectCommand = "onboard" | "new:slice" | "new:strand" | "build" | "change";

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
7. Initialize project_tracker only after understanding the project and its planned capability map. Each slice carries its own named strand (a persistent sequence of knots); do not create slices here — point the user to /project:new:slice to specify the first slice and pick its strand.
8. Seed project_knowledge with decisions, rejected approaches, constraints, warnings, conventions, and howtos learned during onboarding.
9. End with a concise summary: created files, initialized state, captured knowledge, planned capability map, and tell the user to run /project:new:slice for the first feature.

Do not dump all questions at once. Do not ask the user to implement anything.`;
  }

  if (command === "new:slice") {
    return `${header}

Run the pi-project-strand new-slice funnel: an interactive, LLM-driven workflow that turns a feature request into a fully-specified, tracked slice.

Requirements:
1. Load /skill:brainstorming and follow it. Surface PROJECT.md Planned Features / Capabilities, project_tracker status, and relevant project_knowledge (decisions, constraints, rejected approaches) BEFORE asking design questions.
2. Ask focused questions one at a time to establish purpose, scope, constraints, and complexity. Research (web/local) where it changes the decision; persist findings as project_knowledge entries and attach them as slice resources.
3. Converge with the user on the slice GOAL and slice-level SUCCESS CRITERIA ("what done means").
4. Strand selection: call ask_user_question with one single-select question. Offer each strand defined in .pi/project.jsonc (or the built-in defaults: spike, quick, deep-research, change, granular) as an option — each option's description states when to use it (pros/cons), and its preview shows the knot sequence with focus. Assess complexity and mark your recommended strand first with "(Recommended)".
5. Create the slice: project_tracker action=slice:create with id, name, description, type, the chosen strand name, goal, and criteria (the slice-level success criteria). The slice is created status=defined with the full knot sequence pending.
6. Do NOT start a knot here. End with a summary (goal, success criteria, chosen strand + why) and tell the user to run /project:build to activate the slice and start its first knot.

Do not dump all questions at once. Do not ask the user to implement anything. Respect the design-approval gate before any implementation work.`;
  }

  if (command === "new:strand") {
    return `${header}

Run the pi-project-strand new-strand authoring workflow: an interactive, LLM-driven process that designs a custom strand (a reusable, ordered knot sequence) and writes it into .pi/project.jsonc under "strands".

A strand is a SEED-ONLY template. It is snapshotted into a slice when that slice is created via /project:new:slice. Editing or deleting it later never affects existing slices.

Requirements:
1. Load context first: read .pi/project.jsonc (note the strands already defined), PROJECT.md Planned Features / Capabilities, and relevant project_knowledge. Understand the kind of work this strand is for before proposing anything.
2. Clarify the use case ONE question at a time (optionally via ask_user_question): what kind of work the strand targets, and the intended granularity (few coarse knots vs. many fine-grained gates). Contrast with the built-in strands (spike, quick, deep-research, change, granular) so the user picks a distinct, useful shape.
3. Propose an ordered knot sequence: for each knot give a short name and a one-line focus (what that knot is about / its quality bar). Present the full sequence and CONFIRM with the user before writing. Refine until the user approves.
4. Write it: call project_strand action=define name=<strand-name> description=<when-to-use> knots=[{name, focus}, ...]. The tool validates (unique name, >=1 knot, unique knot names, every knot has a focus) and returns an in-band error if invalid — fix and retry, do not fabricate.
5. On success, tell the user the strand is now available to /project:new:slice and summarize the knot sequence.

Do not dump all questions at once. Do not start any implementation work.`;
  }

  if (command === "build") {
    return `${header}

Resume or start implementing the active pi-project-strand project slice.

Requirements:
1. Read project_tracker status, next action, active slice, active knot, criteria, and linked plan status.
2. Read PROJECT.md Planned Features / Capabilities and relevant project_knowledge entries for the active slice and current files.
3. Route based on state:
   - Active slice with an active knot and all criteria met: follow that knot's \`advance_by\` policy (\`agent\` → two-step \`project_tracker action=knot:sign_off\`, \`judge\` → \`project_tracker action=knot:judge\`, \`human\` → prompt the user for \`/project:knot:advance\`).
   - Active slice with an active knot + linked plan: resume with /skill:executing-plans or /skill:subagent-driven-development.
   - Active slice with an active knot but no plan: use /skill:writing-plans first.
   - Active slice, no active knot, pending knots remain: use /skill:frs-strategy to knot:start the next pending knot (define its goals + success_criteria).
   - Active slice, all knots signed off: prompt the user for final /project:slice:advance sign-off.
   - Defined slice: ask the user to activate it (slice:activate), or run /project:new:slice for a new feature.
   - No project files/tracker state: run /project:onboard first.
4. Explain the routing briefly, then proceed with the appropriate skill.
5. Keep required gates: design approval, spec review, \`advance_by\` knot advancement, deployment approval.`;
  }

  return `${header}

Run a pi-project-strand project change workflow.

Requirements:
1. Identify what is changing: PROJECT.md (including Planned Features / Capabilities), VISION.md, ARCHITECTURE.md, AGENTS.md, project_tracker slices (each with its own named strand of persistent knots) and their goals/success criteria, project_knowledge, or implementation plans. A wholly new feature is usually a new slice — route that to /project:new:slice rather than editing here.
2. Ask focused clarification if the requested change is ambiguous.
3. Assess impact before editing: active knot goals/success_criteria, architecture consistency, superseded knowledge, dependent slices.
4. For planned-feature changes, update PROJECT.md and consider whether a new slice should be created via /project:new:slice, or whether existing slices must be held, advanced, or reprioritized.
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

  pi.registerCommand("project:new:slice", {
    description: "Interactive funnel: turn a feature request into a fully-specified, tracked slice with a chosen strand",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("new:slice", args, audit));
    },
  });

  pi.registerCommand("project:new:strand", {
    description: "Interactively design a custom strand (knot sequence) and add it to project.jsonc",
    handler: async (args, ctx) => {
      const audit = await auditProject(ctx.cwd);
      sendProjectCommand(pi, ctx, buildProjectCommandMessage("new:strand", args, audit));
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
