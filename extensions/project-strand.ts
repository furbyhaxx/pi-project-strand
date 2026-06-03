import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join, resolve } from "node:path";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
import { Type, type Static } from "typebox";
import {
  buildStrandConfigText,
  validateStrandProposal,
  type StrandKnotInput,
} from "./strand-authoring-core.js";

const ProjectStrandParams = Type.Object(
  {
    action: StringEnum(["define"] as const, { description: "Strand authoring action" }),
    name: Type.String({ description: "Strand name (key under strands in project.jsonc)" }),
    description: Type.Optional(Type.String({ description: "Short description of when to use this strand" })),
    knots: Type.Array(
      Type.Object(
        {
          name: Type.String({ description: "Knot name" }),
          focus: Type.String({ description: "What this knot is about / its quality bar" }),
        },
        { additionalProperties: false }
      ),
      { description: "Ordered knot sequence for the strand" }
    ),
  },
  { additionalProperties: false }
);

type ProjectStrandInput = Static<typeof ProjectStrandParams>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRoot(startCwd: string): Promise<string> {
  let current = resolve(startCwd);
  while (true) {
    const candidate = join(current, ".pi", "project.jsonc");
    if (await exists(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startCwd);
    current = parent;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "project_strand",
    label: "Project Strand",
    description: "Define a named strand (a reusable knot sequence) in .pi/project.jsonc for use when creating slices.",
    parameters: ProjectStrandParams,
    async execute(_toolCallId, params: ProjectStrandInput, _signal, _onUpdate, ctx) {
      const root = await findProjectRoot(ctx.cwd);
      const configPath = join(root, ".pi", "project.jsonc");

      const configText = (await exists(configPath)) ? await readFile(configPath, "utf-8") : "";
      const parsed = configText.trim() ? parse(configText) : undefined;
      const existing = Object.keys((parsed as { strands?: Record<string, unknown> } | undefined)?.strands ?? {});

      const knots = (params.knots ?? []) as StrandKnotInput[];
      const error = validateStrandProposal(params.name, knots, existing);
      if (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          details: { error },
        };
      }

      const nextText = buildStrandConfigText(configText, params.name, params.description ?? "", knots);
      await mkdir(dirname(configPath), { recursive: true });
      const tmpPath = `${configPath}.tmp`;
      await writeFile(tmpPath, nextText, "utf-8");
      await rename(tmpPath, configPath);

      const strandName = params.name.trim();
      const knotNames = knots.map((k) => k.name.trim());
      const text = [
        `Defined strand "${strandName}" with ${knotNames.length} knot(s): ${knotNames.join(" → ")}.`,
        `Written to ${configPath}. It is now available to /project:new:slice.`,
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { action: params.action, name: strandName, knots: knotNames },
      };
    },
  });
}
