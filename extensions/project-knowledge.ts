import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
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
import {
  fg,
  firstLine,
  outputLines,
  plural,
  renderFrameCall,
  renderFrameResult,
  semanticTruncate,
  textContent,
  type ToolRenderContextLike,
} from "./tui-render.js";

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

const CATEGORY_FROM_PREFIX: Record<string, KnowledgeCategory> = {
  dec: "decision",
  rej: "rejected",
  how: "howto",
  con: "convention",
  cst: "constraint",
  war: "warning",
  nte: "note",
};

function categoryForId(id: string | undefined): KnowledgeCategory | undefined {
  if (!id) return undefined;
  return CATEGORY_FROM_PREFIX[id.slice(0, 3)];
}

function categoryColor(category: KnowledgeCategory | undefined): string {
  switch (category) {
    case "constraint":
    case "warning":
      return "warning";
    case "rejected":
      return "error";
    case "decision":
    case "convention":
      return "accent";
    default:
      return "muted";
  }
}

function knowledgeTarget(args: Partial<ProjectKnowledgeInput> | undefined): string {
  const action = args?.action ?? "list";
  switch (action) {
    case "add":
      return `add${args?.category ? ` · ${args.category}` : ""}${args?.title ? ` · "${semanticTruncate(args.title, 36)}"` : ""}`;
    case "update":
    case "remove":
    case "get":
    case "graph":
      return `${action}${args?.id ? ` · ${args.id}` : ""}${action === "graph" && args?.depth ? ` · depth ${args.depth}` : ""}`;
    case "search":
      return `search${args?.query ? ` · "${semanticTruncate(args.query, 44)}"` : ""}`;
    case "relate":
    case "unrelate":
      return `${action}${args?.from_id && args?.to_id ? ` · ${args.from_id} --${args.relation_type ?? "relates-to"}--> ${args.to_id}` : ""}`;
    case "list": {
      const filters = [args?.filter_category ? `category=${args.filter_category}` : "", args?.slice_id ? `slice=${args.slice_id}` : "", args?.limit ? `limit=${args.limit}` : ""].filter(Boolean);
      return `list${filters.length ? ` · ${filters.join(" · ")}` : ""}`;
    }
    case "context": {
      const filters = [args?.slice_id ? `slice=${args.slice_id}` : "", args?.path ? `path=${semanticTruncate(args.path, 32)}` : ""].filter(Boolean);
      return `context${filters.length ? ` · ${filters.join(" · ")}` : ""}`;
    }
    default:
      return action;
  }
}

function styledKnowledgeLine(theme: Theme, line: string): string {
  const entry = line.match(/^.*\[((?:dec|rej|how|con|cst|war|nte)-\d{3})\]\s+(.+)$/);
  if (entry) {
    const id = entry[1]!;
    const category = categoryForId(id);
    const badge = category ? `[${category}]` : "[entry]";
    return `${fg(theme, categoryColor(category), badge)} ${fg(theme, "accent", id)} ${fg(theme, "toolOutput", entry[2]!)}`;
  }
  if (line === "---") return fg(theme, "muted", line);
  if (/^(Category|Tags|Path triggers|Relations|Incoming relations|Edge summary):/.test(line)) return fg(theme, "muted", line);
  if (/^\s*[←→]/.test(line) || line.includes("--")) return fg(theme, "muted", line);
  return fg(theme, "toolOutput", line);
}

function knowledgeBody(theme: Theme, text: string): string[] {
  return text.split("\n").slice(1).map((line) => styledKnowledgeLine(theme, line));
}

function uniqueEntryCount(text: string): number {
  return new Set(Array.from(text.matchAll(/\[((?:dec|rej|how|con|cst|war|nte)-\d{3})\]/g)).map((m) => m[1])).size;
}

function edgeCount(text: string): number {
  return text.split("\n").filter((line) => line.includes("--") || /^\s*[←→]/.test(line)).length;
}

function conciseMutationSummary(action: string, line: string, stats: string | undefined): string {
  const suffix = stats ? ` · ${stats}` : "";
  const idTitle = line.match(/^(Added|Updated|Removed)\s+([^:]+):\s+(.+)$/);
  if (idTitle) return `${idTitle[1]} ${idTitle[2]}${suffix}`;
  const related = line.match(/^Related \[?([^\]\s]+)\]? --([^\s]+)--> \[?([^\]\s]+)\]?/);
  if (related) return `Related ${related[1]} --${related[2]}--> ${related[3]}${suffix}`;
  const unrelated = line.match(/^Removed relation \[?([^\]\s]+)\]? --([^\s]+)--> \[?([^\]\s]+)\]?/);
  if (unrelated) return `Removed relation ${unrelated[1]} --${unrelated[2]}--> ${unrelated[3]}${suffix}`;
  return `${action[0]?.toUpperCase()}${action.slice(1)}${suffix}`;
}

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
    renderShell: "self",

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

    renderCall(args, theme, context) {
      return renderFrameCall(theme, context as ToolRenderContextLike, "Knowledge", knowledgeTarget(args as Partial<ProjectKnowledgeInput> | undefined));
    },

    renderResult(result, _options, theme, context) {
      const d = result.details as { action: string; error?: string; stats?: string } | undefined;
      const text = textContent(result);
      const line = firstLine(text);
      if (d?.error) {
        return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "error", `Error: ${d.error}`), outputLines(theme, text).slice(1), { status: "error" });
      }

      const action = d?.action ?? "list";
      const stats = d?.stats;
      const statsSuffix = stats ? ` · ${stats}` : "";

      switch (action) {
        case "add":
        case "update":
        case "remove":
        case "relate":
        case "unrelate":
          return renderFrameResult(
            theme,
            context as ToolRenderContextLike,
            fg(theme, "muted", conciseMutationSummary(action, line, stats)),
            knowledgeBody(theme, text),
            { cap: 6 }
          );
        case "get": {
          const id = (context as { args?: Partial<ProjectKnowledgeInput> } | undefined)?.args?.id;
          const category = categoryForId(id);
          const title = line.replace(/^.*\[[^\]]+\]\s+/, "");
          const summary = id ? `${id}${category ? ` · ${category}` : ""}${title ? ` · ${title}` : ""}` : line || "Entry";
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary), text.split("\n").map((l) => styledKnowledgeLine(theme, l)), { cap: 15 });
        }
        case "list": {
          const count = uniqueEntryCount(text);
          const summary = count > 0 ? `Listed ${plural(count, "entry", "entries")}${statsSuffix}` : `No matching knowledge entries${statsSuffix}`;
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary), text ? text.split("\n").map((l) => styledKnowledgeLine(theme, l)) : [], { cap: 15 });
        }
        case "search": {
          const count = uniqueEntryCount(text);
          const query = (context as { args?: Partial<ProjectKnowledgeInput> } | undefined)?.args?.query;
          const summary = count > 0 ? `Found ${plural(count, "entry", "entries")}${query ? ` for "${query}"` : ""}` : line || "No matches";
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary), knowledgeBody(theme, text), { cap: 15 });
        }
        case "graph": {
          const count = uniqueEntryCount(text);
          const edges = edgeCount(text);
          const id = (context as { args?: Partial<ProjectKnowledgeInput> } | undefined)?.args?.id;
          const summary = `Graph ${id ?? "entry"} · ${plural(count, "node")} · ${plural(edges, "edge")}`;
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary), knowledgeBody(theme, text), { cap: 15 });
        }
        case "context": {
          const count = uniqueEntryCount(text);
          const summary = count > 0 ? `Surfaced ${plural(count, "relevant entry", "relevant entries")}` : "No relevant knowledge entries";
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", summary), knowledgeBody(theme, text), { cap: 12 });
        }
        default:
          return renderFrameResult(theme, context as ToolRenderContextLike, fg(theme, "muted", line || "Done"), outputLines(theme, text).slice(1), { cap: 12 });
      }
    },
  });
}
