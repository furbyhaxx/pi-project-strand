import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Type, type Static } from "typebox";
import {
  type AddInput,
  type ContextInput,
  type GraphInput,
  type KnowledgeCategory,
  type KnowledgeRelation,
  type KnowledgeStore,
  type ListFilter,
  type RelateInput,
  type RelationType,
  type UnrelateInput,
  type UpdateInput,
  createEmptyStore,
  formatStoreStats,
  handleAdd,
  handleContext,
  handleGet,
  handleGraph,
  handleList,
  handleRelate,
  handleRemove,
  handleSearch,
  handleUnrelate,
  handleUpdate,
} from "./project-knowledge-core.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWLEDGE_FILE = ".pi/project/knowledge.json";

// ─── File I/O ─────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
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
    if (await fileExists(join(current, ".pi", "project.jsonc"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startCwd);
    current = parent;
  }
}

async function resolveKnowledgePath(cwd: string): Promise<string> {
  const root = await findProjectRoot(cwd);
  return resolve(root, KNOWLEDGE_FILE);
}

async function loadStore(cwd: string): Promise<{ store: KnowledgeStore; knowledgePath: string }> {
  const knowledgePath = await resolveKnowledgePath(cwd);
  if (!(await fileExists(knowledgePath))) {
    return { store: createEmptyStore(), knowledgePath };
  }
  const raw = await readFile(knowledgePath, "utf-8");
  const parsed = JSON.parse(raw) as KnowledgeStore;
  return { store: parsed, knowledgePath };
}

async function saveStore(knowledgePath: string, store: KnowledgeStore): Promise<void> {
  await mkdir(dirname(knowledgePath), { recursive: true });
  const tmp = `${knowledgePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  await rename(tmp, knowledgePath);
}

async function mutateStore(
  cwd: string,
  mutator: (store: KnowledgeStore) => { text: string; store: KnowledgeStore; error?: string }
): Promise<{ text: string; store: KnowledgeStore; error?: string }> {
  const { knowledgePath } = await loadStore(cwd);
  return withFileMutationQueue(knowledgePath, async () => {
    const { store } = await loadStore(cwd);
    const result = mutator(store);
    if (!result.error) await saveStore(knowledgePath, result.store);
    return result;
  });
}

// ─── Tool parameters ──────────────────────────────────────────────────────────

const CATEGORIES = [
  "decision", "rejected", "howto", "convention",
  "constraint", "warning", "note",
] as const;

const RELATION_TYPES = [
  "supersedes", "rejected-by", "alternative-to",
  "implements", "requires", "relates-to",
  "warns-about", "blocks",
] as const;

const ProjectKnowledgeParams = Type.Object({
  action: StringEnum(
    ["add", "update", "remove", "get", "list", "search", "relate", "unrelate", "graph", "context"] as const,
    { description: "Knowledge graph action" }
  ),

  // add / update fields
  id:            Type.Optional(Type.String({ description: "Entry id (for update/remove/get/relate/graph)" })),
  category:      Type.Optional(StringEnum(CATEGORIES, { description: "Entry category" })),
  title:         Type.Optional(Type.String({ description: "Entry title" })),
  content:       Type.Optional(Type.String({ description: "Entry content (markdown)" })),
  tags:          Type.Optional(Type.Array(Type.String(), { description: "Tags/keywords" })),
  slice_id:      Type.Optional(Type.String({ description: "Link to slice id" })),
  knot_scope:    Type.Optional(Type.String({ description: "Lifecycle anchor e.g. rust-workspace/PoW" })),
  path_triggers: Type.Optional(Type.Array(Type.String(), { description: "Glob patterns that trigger auto-surface" })),

  // relate / unrelate
  from_id:       Type.Optional(Type.String({ description: "Source entry id for relation" })),
  to_id:         Type.Optional(Type.String({ description: "Target entry id for relation" })),
  relation_type: Type.Optional(StringEnum(RELATION_TYPES, { description: "Relation type" })),
  relation_note: Type.Optional(Type.String({ description: "Annotation on the relation edge" })),

  // list / search / context
  query:         Type.Optional(Type.String({ description: "Search query" })),
  filter_category: Type.Optional(StringEnum(CATEGORIES, { description: "Filter list by category" })),
  filter_tags:   Type.Optional(Type.Array(Type.String(), { description: "Filter list by tags (any match)" })),
  path:          Type.Optional(Type.String({ description: "Current file/directory path for context surfacing" })),
  limit:         Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Max results" })),

  // graph
  depth:         Type.Optional(Type.Integer({ minimum: 1, maximum: 5, description: "Graph traversal depth (default 2)" })),
});

type ProjectKnowledgeInput = Static<typeof ProjectKnowledgeParams>;

// ─── Exported context builder (used by bootstrap) ─────────────────────────────

export async function buildKnowledgeContext(
  cwd: string,
  sliceId?: string,
  path?: string
): Promise<string> {
  try {
    const { store } = await loadStore(cwd);
    if (store.entries.length === 0) return "";
    const result = handleContext(store, { slice_id: sliceId, path, limit: 6 });
    return result.text;
  } catch {
    return "";
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "project_knowledge",
    label: "Project Knowledge",
    description:
      "Persistent project-scoped knowledge graph. Store and retrieve decisions, rejections, howtos, conventions, constraints, warnings, and notes. Entries are linked by typed directed relations and surface automatically via slice scope, path triggers, and tags.",
    parameters: ProjectKnowledgeParams,

    async execute(_toolCallId, params: ProjectKnowledgeInput, _signal, _onUpdate, ctx) {
      let result: { text: string; store: KnowledgeStore; error?: string };

      switch (params.action) {
        case "add": {
          result = await mutateStore(ctx.cwd, (store) =>
            handleAdd(store, {
              category: (params.category as KnowledgeCategory) ?? "note",
              title: params.title ?? "",
              content: params.content ?? "",
              tags: params.tags,
              slice_id: params.slice_id,
              knot_scope: params.knot_scope,
              path_triggers: params.path_triggers,
            } satisfies AddInput)
          );
          break;
        }

        case "update": {
          result = await mutateStore(ctx.cwd, (store) =>
            handleUpdate(store, {
              id: params.id ?? "",
              title: params.title,
              content: params.content,
              tags: params.tags,
              slice_id: params.slice_id,
              knot_scope: params.knot_scope,
              path_triggers: params.path_triggers,
            } satisfies UpdateInput)
          );
          break;
        }

        case "remove": {
          result = await mutateStore(ctx.cwd, (store) => handleRemove(store, params.id));
          break;
        }

        case "get": {
          const { store } = await loadStore(ctx.cwd);
          result = handleGet(store, params.id);
          break;
        }

        case "list": {
          const { store } = await loadStore(ctx.cwd);
          result = handleList(store, {
            category: params.filter_category as KnowledgeCategory | undefined,
            tags: params.filter_tags,
            slice_id: params.slice_id,
            knot_scope: params.knot_scope,
            limit: params.limit,
          } satisfies ListFilter);
          break;
        }

        case "search": {
          const { store } = await loadStore(ctx.cwd);
          result = handleSearch(store, params.query, params.limit);
          break;
        }

        case "relate": {
          result = await mutateStore(ctx.cwd, (store) =>
            handleRelate(store, {
              from_id: params.from_id ?? "",
              to_id: params.to_id ?? "",
              type: (params.relation_type as RelationType) ?? "relates-to",
              note: params.relation_note,
            } satisfies RelateInput)
          );
          break;
        }

        case "unrelate": {
          result = await mutateStore(ctx.cwd, (store) =>
            handleUnrelate(store, {
              from_id: params.from_id ?? "",
              to_id: params.to_id ?? "",
              type: (params.relation_type as RelationType) ?? "relates-to",
            } satisfies UnrelateInput)
          );
          break;
        }

        case "graph": {
          const { store } = await loadStore(ctx.cwd);
          result = handleGraph(store, { id: params.id ?? "", depth: params.depth } satisfies GraphInput);
          break;
        }

        case "context": {
          const { store } = await loadStore(ctx.cwd);
          result = handleContext(store, {
            slice_id: params.slice_id,
            path: params.path,
            limit: params.limit,
          } satisfies ContextInput);
          if (!result.text) result = { ...result, text: "No relevant knowledge entries for current context." };
          break;
        }

        default: {
          const { store } = await loadStore(ctx.cwd);
          result = { text: `Unknown action: ${params.action}`, store, error: "unknown action" };
        }
      }

      return {
        content: [{ type: "text", text: result.text }],
        details: {
          action: params.action,
          ...(result.error ? { error: result.error } : {}),
          stats: formatStoreStats(result.store),
        },
      };
    },

    renderCall(args, theme) {
      const a = args as ProjectKnowledgeInput | undefined;
      let text = theme.fg("toolTitle", theme.bold("project_knowledge "));
      text += theme.fg("muted", a?.action ?? "");
      if (a?.action === "add" && a.category) text += ` ${theme.fg("accent", a.category)}`;
      if (a?.id) text += ` ${theme.fg("dim", a.id)}`;
      if (a?.title) text += ` ${theme.fg("dim", `"${a.title}"`)}`;
      if (a?.action === "relate" && a.from_id && a.to_id) {
        text += ` ${theme.fg("dim", `[${a.from_id}] --${a.relation_type ?? "relates-to"}--> [${a.to_id}]`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const d = result.details as { action: string; error?: string; stats?: string } | undefined;
      if (d?.error) return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
      const stats = d?.stats ? theme.fg("muted", ` (${d.stats})`) : "";
      const icon = d?.action === "add" ? "✓ " : d?.action === "remove" ? "✓ " : "";
      const content = result.content[0];
      const firstLine = content?.type === "text"
        ? content.text.split("\n")[0] ?? ""
        : "";
      return new Text(theme.fg("success", icon) + theme.fg("muted", firstLine) + stats, 0, 0);
    },
  });
}
