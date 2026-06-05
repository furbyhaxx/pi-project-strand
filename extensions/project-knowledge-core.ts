/**
 * Project Knowledge Core
 *
 * Pure functions for a persistent, project-scoped knowledge graph.
 * Stores decisions, rejections, howtos, conventions, constraints, warnings, and notes.
 * Entries are linked by typed, directed relations and surfaced automatically via
 * slice/knot scope, path triggers, and tags.
 *
 * No pi dependencies — operates on plain data types for testability.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type KnowledgeCategory =
  | "decision"    // a choice made: what + why + consequences
  | "rejected"    // something considered and deliberately not chosen
  | "howto"       // how to implement/do X in this project
  | "convention"  // a pattern or style rule that applies project-wide
  | "constraint"  // a hard limit that must not be violated
  | "warning"     // a gotcha, known risk, or thing to watch out for
  | "note";       // general context, background, open question

export type RelationType =
  | "supersedes"      // this entry replaces / supersedes target
  | "rejected-by"     // this (an idea) was rejected in favour of target (a decision)
  | "alternative-to"  // this is an unchosen sibling of target
  | "implements"      // this realizes / builds on target
  | "requires"        // this is only valid if target holds
  | "relates-to"      // general connection
  | "warns-about"     // this warning applies to target decision/howto
  | "blocks";         // target cannot proceed until this is resolved

export interface KnowledgeRelation {
  type: RelationType;
  target_id: string;
  note?: string;
}

export interface KnowledgeEntry {
  id: string;              // e.g. "dec-001", "rej-002", "how-003"
  category: KnowledgeCategory;
  title: string;
  content: string;         // markdown, freeform

  // Scoping and auto-surface triggers
  tags: string[];
  slice_id?: string;       // auto-surfaced when this slice is active/queried
  knot_scope?: string;     // e.g. "rust-workspace/PoW" — lifecycle anchor
  path_triggers?: string[];// glob patterns: ["**/edge-portald/**", "**/portal*"]

  // Directed relations — reverse-indexed in memory for bidirectional traversal
  relations: KnowledgeRelation[];

  created_at: string;
  updated_at: string;
}

export interface KnowledgeStore {
  entries: KnowledgeEntry[];
  meta: { updated_at: string; version: number };
}

export interface KnowledgeResult {
  text: string;
  store: KnowledgeStore;
  error?: string;
}

// Input types for actions
export interface AddInput {
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags?: string[];
  slice_id?: string;
  knot_scope?: string;
  path_triggers?: string[];
}

export interface UpdateInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  slice_id?: string;
  knot_scope?: string;
  path_triggers?: string[];
}

export interface RelateInput {
  from_id: string;
  to_id: string;
  type: RelationType;
  note?: string;
}

export interface UnrelateInput {
  from_id: string;
  to_id: string;
  type: RelationType;
}

export interface ListFilter {
  category?: KnowledgeCategory;
  tags?: string[];
  slice_id?: string;
  knot_scope?: string;
  limit?: number;
}

export interface ContextInput {
  slice_id?: string;
  slice_ids?: string[];
  path?: string;
  limit?: number;
}

export interface GraphInput {
  id: string;
  depth?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_PREFIX: Record<KnowledgeCategory, string> = {
  decision:   "dec",
  rejected:   "rej",
  howto:      "how",
  convention: "con",
  constraint: "cst",
  warning:    "war",
  note:       "nte",
};

const CATEGORY_ICON: Record<KnowledgeCategory, string> = {
  decision:   "📌",
  rejected:   "🚫",
  howto:      "📖",
  convention: "📐",
  constraint: "🔒",
  warning:    "⚠️",
  note:       "📝",
};

export function createEmptyStore(): KnowledgeStore {
  return { entries: [], meta: { updated_at: new Date().toISOString(), version: 1 } };
}

function isoNow(): string {
  return new Date().toISOString();
}

function nextId(store: KnowledgeStore, category: KnowledgeCategory): string {
  const prefix = CATEGORY_PREFIX[category];
  const existing = store.entries
    .filter((e) => e.id.startsWith(prefix + "-"))
    .map((e) => parseInt(e.id.slice(prefix.length + 1), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function findEntry(store: KnowledgeStore, id: string): KnowledgeEntry | undefined {
  return store.entries.find((e) => e.id === id);
}

function touchStore(store: KnowledgeStore): KnowledgeStore {
  return { ...store, meta: { ...store.meta, updated_at: isoNow() } };
}

function cloneStore(store: KnowledgeStore): KnowledgeStore {
  return JSON.parse(JSON.stringify(store)) as KnowledgeStore;
}

/**
 * Simple glob-style path matching.
 * Supports ** (any path, including slashes) and * (any segment, no slashes).
 */
export function matchesGlob(pattern: string, path: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")  // escape regex special chars (not * or ?)
    .replace(/\*\*/g, "\x00")               // temp-encode **
    .replace(/\*/g, "[^/]*")               // * = any non-slash
    .replace(/\x00/g, ".*");               // ** = anything including /
  try {
    return new RegExp(`(^|/)${regexStr}($|/)`).test(path) ||
           new RegExp(`^${regexStr}$`).test(path);
  } catch {
    return false;
  }
}

function pathTriggered(entry: KnowledgeEntry, path: string): boolean {
  if (!entry.path_triggers || entry.path_triggers.length === 0) return false;
  return entry.path_triggers.some((pattern) => matchesGlob(pattern, path));
}

function tagsOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map((t) => t.toLowerCase()));
  return b.some((t) => set.has(t.toLowerCase()));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatEntry(entry: KnowledgeEntry, includeContent = true): string {
  const icon = CATEGORY_ICON[entry.category];
  const lines: string[] = [];
  lines.push(`${icon} [${entry.id}] ${entry.title}`);
  lines.push(`Category: ${entry.category}${entry.slice_id ? ` | Slice: ${entry.slice_id}` : ""}${entry.knot_scope ? ` | Knot: ${entry.knot_scope}` : ""}`);
  if (entry.tags.length > 0) lines.push(`Tags: ${entry.tags.join(", ")}`);
  if (entry.path_triggers && entry.path_triggers.length > 0) {
    lines.push(`Path triggers: ${entry.path_triggers.join(", ")}`);
  }
  if (includeContent) {
    lines.push("");
    lines.push(entry.content);
  }
  if (entry.relations.length > 0) {
    lines.push("");
    lines.push("Relations:");
    for (const rel of entry.relations) {
      lines.push(`  → ${rel.type} [${rel.target_id}]${rel.note ? ` (${rel.note})` : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatEntryList(entries: KnowledgeEntry[], includeContent = false): string {
  if (entries.length === 0) return "No matching knowledge entries.";
  return entries.map((e) => formatEntry(e, includeContent)).join("\n\n---\n\n");
}

export function formatContext(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";
  const lines: string[] = ["Relevant knowledge:"];
  for (const e of entries) {
    const icon = CATEGORY_ICON[e.category];
    // Short form for context injection — title + first 200 chars of content
    const snippet = e.content.length > 200 ? e.content.slice(0, 200) + "…" : e.content;
    lines.push(`  ${icon} [${e.id}] ${e.title}`);
    lines.push(`    ${snippet.replace(/\n/g, " ")}`);
  }
  return lines.join("\n");
}

function formatGraph(
  startId: string,
  nodes: Map<string, KnowledgeEntry>,
  edges: Array<{ from: string; to: string; type: RelationType; note?: string }>
): string {
  const lines: string[] = [`Knowledge graph from [${startId}] (depth ${nodes.size} nodes):`];
  for (const [, entry] of nodes) {
    lines.push(`\n${formatEntry(entry, true)}`);
  }
  if (edges.length > 0) {
    lines.push("\nEdge summary:");
    for (const edge of edges) {
      lines.push(`  [${edge.from}] --${edge.type}--> [${edge.to}]${edge.note ? ` (${edge.note})` : ""}`);
    }
  }
  return lines.join("\n");
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

export function handleAdd(store: KnowledgeStore, input: AddInput): KnowledgeResult {
  if (!input.title?.trim()) return { text: "Error: title is required", store, error: "missing title" };
  if (!input.content?.trim()) return { text: "Error: content is required", store, error: "missing content" };

  const current = cloneStore(store);
  const id = nextId(current, input.category);
  const entry: KnowledgeEntry = {
    id,
    category: input.category,
    title: input.title.trim(),
    content: input.content.trim(),
    tags: (input.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
    slice_id: input.slice_id?.trim() || undefined,
    knot_scope: input.knot_scope?.trim() || undefined,
    path_triggers: (input.path_triggers ?? []).filter(Boolean),
    relations: [],
    created_at: isoNow(),
    updated_at: isoNow(),
  };
  current.entries.push(entry);
  return { text: `Added ${id}: ${entry.title}`, store: touchStore(current) };
}

export function handleUpdate(store: KnowledgeStore, input: UpdateInput): KnowledgeResult {
  if (!input.id?.trim()) return { text: "Error: id is required", store, error: "missing id" };
  const current = cloneStore(store);
  const entry = findEntry(current, input.id);
  if (!entry) return { text: `Error: entry ${input.id} not found`, store, error: "not found" };

  if (input.title !== undefined) entry.title = input.title.trim();
  if (input.content !== undefined) entry.content = input.content.trim();
  if (input.tags !== undefined) entry.tags = input.tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (input.slice_id !== undefined) entry.slice_id = input.slice_id.trim() || undefined;
  if (input.knot_scope !== undefined) entry.knot_scope = input.knot_scope.trim() || undefined;
  if (input.path_triggers !== undefined) entry.path_triggers = input.path_triggers.filter(Boolean);
  entry.updated_at = isoNow();

  return { text: `Updated ${entry.id}: ${entry.title}`, store: touchStore(current) };
}

export function handleRemove(store: KnowledgeStore, id?: string): KnowledgeResult {
  if (!id?.trim()) return { text: "Error: id is required", store, error: "missing id" };
  const current = cloneStore(store);
  const index = current.entries.findIndex((e) => e.id === id);
  if (index === -1) return { text: `Error: entry ${id} not found`, store, error: "not found" };

  const title = current.entries[index]!.title;
  current.entries.splice(index, 1);
  // Remove all relations pointing to this entry
  for (const entry of current.entries) {
    entry.relations = entry.relations.filter((r) => r.target_id !== id);
  }
  return { text: `Removed ${id}: ${title}`, store: touchStore(current) };
}

export function handleGet(store: KnowledgeStore, id?: string): KnowledgeResult {
  if (!id?.trim()) return { text: "Error: id is required", store, error: "missing id" };
  const entry = findEntry(store, id);
  if (!entry) return { text: `Error: entry ${id} not found`, store, error: "not found" };

  // Include incoming relations (reverse index scan)
  const incoming = store.entries.flatMap((e) =>
    e.relations
      .filter((r) => r.target_id === id)
      .map((r) => `  ← ${r.type} [${e.id}] ${e.title}${r.note ? ` (${r.note})` : ""}`)
  );

  let text = formatEntry(entry, true);
  if (incoming.length > 0) {
    text += "\n\nIncoming relations:\n" + incoming.join("\n");
  }
  return { text, store };
}

export function handleList(store: KnowledgeStore, filter: ListFilter): KnowledgeResult {
  let entries = [...store.entries];

  if (filter.category) entries = entries.filter((e) => e.category === filter.category);
  if (filter.slice_id) entries = entries.filter((e) => e.slice_id === filter.slice_id);
  if (filter.knot_scope) entries = entries.filter((e) => e.knot_scope === filter.knot_scope);
  if (filter.tags && filter.tags.length > 0) {
    entries = entries.filter((e) => tagsOverlap(e.tags, filter.tags!));
  }

  // Sort: warnings/constraints first, then by updated_at desc
  entries.sort((a, b) => {
    const priority = (e: KnowledgeEntry) =>
      e.category === "constraint" ? 0 : e.category === "warning" ? 1 : 2;
    if (priority(a) !== priority(b)) return priority(a) - priority(b);
    return b.updated_at.localeCompare(a.updated_at);
  });

  if (filter.limit) entries = entries.slice(0, filter.limit);

  return { text: formatEntryList(entries, false), store };
}

export function handleSearch(store: KnowledgeStore, query?: string, limit = 20): KnowledgeResult {
  if (!query?.trim()) return { text: "Error: query is required", store, error: "missing query" };

  const q = query.toLowerCase();
  const scored = store.entries
    .map((e) => {
      let score = 0;
      if (e.id.toLowerCase().includes(q)) score += 10;
      if (e.title.toLowerCase().includes(q)) score += 8;
      if (e.tags.some((t) => t.includes(q))) score += 5;
      if (e.content.toLowerCase().includes(q)) score += 2;
      return { entry: e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);

  if (scored.length === 0) return { text: `No entries matching "${query}"`, store };
  return { text: `${scored.length} result(s) for "${query}":\n\n${formatEntryList(scored, false)}`, store };
}

export function handleRelate(store: KnowledgeStore, input: RelateInput): KnowledgeResult {
  if (!input.from_id?.trim() || !input.to_id?.trim()) {
    return { text: "Error: from_id and to_id are required", store, error: "missing ids" };
  }
  if (!findEntry(store, input.from_id)) {
    return { text: `Error: entry ${input.from_id} not found`, store, error: "from not found" };
  }
  if (!findEntry(store, input.to_id)) {
    return { text: `Error: entry ${input.to_id} not found`, store, error: "to not found" };
  }

  const current = cloneStore(store);
  const from = findEntry(current, input.from_id)!;

  // Avoid duplicate relations
  const exists = from.relations.some(
    (r) => r.target_id === input.to_id && r.type === input.type
  );
  if (exists) {
    return { text: `Relation ${input.from_id} --${input.type}--> ${input.to_id} already exists`, store };
  }

  from.relations.push({
    type: input.type,
    target_id: input.to_id,
    ...(input.note ? { note: input.note } : {}),
  });
  from.updated_at = isoNow();

  return {
    text: `Related [${input.from_id}] --${input.type}--> [${input.to_id}]${input.note ? ` (${input.note})` : ""}`,
    store: touchStore(current),
  };
}

export function handleUnrelate(store: KnowledgeStore, input: UnrelateInput): KnowledgeResult {
  if (!input.from_id?.trim() || !input.to_id?.trim()) {
    return { text: "Error: from_id and to_id are required", store, error: "missing ids" };
  }
  const current = cloneStore(store);
  const from = findEntry(current, input.from_id);
  if (!from) return { text: `Error: entry ${input.from_id} not found`, store, error: "not found" };

  const before = from.relations.length;
  from.relations = from.relations.filter(
    (r) => !(r.target_id === input.to_id && r.type === input.type)
  );
  if (from.relations.length === before) {
    return { text: `Relation ${input.from_id} --${input.type}--> ${input.to_id} not found`, store };
  }
  from.updated_at = isoNow();
  return { text: `Removed relation [${input.from_id}] --${input.type}--> [${input.to_id}]`, store: touchStore(current) };
}

export function handleGraph(store: KnowledgeStore, input: GraphInput): KnowledgeResult {
  if (!input.id?.trim()) return { text: "Error: id is required", store, error: "missing id" };
  const start = findEntry(store, input.id);
  if (!start) return { text: `Error: entry ${input.id} not found`, store, error: "not found" };

  const maxDepth = Math.min(input.depth ?? 2, 5);
  const visited = new Map<string, KnowledgeEntry>();
  const edges: Array<{ from: string; to: string; type: RelationType; note?: string }> = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: input.id, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.id)) continue;
    const entry = findEntry(store, item.id);
    if (!entry) continue;
    visited.set(item.id, entry);

    if (item.depth < maxDepth) {
      // Forward edges
      for (const rel of entry.relations) {
        edges.push({ from: item.id, to: rel.target_id, type: rel.type, note: rel.note });
        if (!visited.has(rel.target_id)) {
          queue.push({ id: rel.target_id, depth: item.depth + 1 });
        }
      }
      // Reverse edges (entries that point to this one)
      for (const other of store.entries) {
        for (const rel of other.relations) {
          if (rel.target_id === item.id && !visited.has(other.id)) {
            edges.push({ from: other.id, to: item.id, type: rel.type, note: rel.note });
            queue.push({ id: other.id, depth: item.depth + 1 });
          }
        }
      }
    }
  }

  return { text: formatGraph(input.id, visited, edges), store };
}

export function handleContext(store: KnowledgeStore, input: ContextInput): KnowledgeResult {
  const limit = input.limit ?? 8;
  const seen = new Set<string>();
  const result: KnowledgeEntry[] = [];
  const sliceIds = Array.from(
    new Set(
      [...(input.slice_ids ?? []), ...(input.slice_id ? [input.slice_id] : [])]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  const add = (e: KnowledgeEntry) => {
    if (!seen.has(e.id) && result.length < limit) {
      seen.add(e.id);
      result.push(e);
    }
  };

  // 1. Always: constraints and warnings
  for (const e of store.entries) {
    if (e.category === "constraint" || e.category === "warning") add(e);
  }

  // 2. Active slice entries (ordered main quest first when callers provide slice_ids that way)
  if (sliceIds.length > 0) {
    for (const sliceId of sliceIds) {
      for (const e of store.entries) {
        if (e.slice_id === sliceId) add(e);
      }
    }
  }

  // 3. Path-triggered entries
  if (input.path) {
    for (const e of store.entries) {
      if (pathTriggered(e, input.path)) add(e);
    }
  }

  // 4. Recent decisions and conventions (fill remaining slots)
  const recent = [...store.entries]
    .filter((e) => e.category === "decision" || e.category === "convention")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const e of recent) add(e);

  if (result.length === 0) return { text: "", store };
  return { text: formatContext(result), store };
}

export function formatStoreStats(store: KnowledgeStore): string {
  const counts: Partial<Record<KnowledgeCategory, number>> = {};
  for (const e of store.entries) {
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }
  const parts = (Object.entries(counts) as Array<[KnowledgeCategory, number]>)
    .map(([cat, n]) => `${n} ${cat}`)
    .join(", ");
  return `${store.entries.length} entries (${parts || "none"})`;
}
