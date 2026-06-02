import { describe, expect, test } from "vitest";
import {
  createEmptyStore,
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
  matchesGlob,
} from "../../extensions/project-knowledge-core.js";

describe("knowledge store core", () => {
  test("adds entries and generates sequential ids per category", () => {
    let store = createEmptyStore();
    const r1 = handleAdd(store, { category: "decision", title: "Portal split", content: "edged and portald are separate." });
    store = r1.store;
    const r2 = handleAdd(store, { category: "decision", title: "Privilege model", content: "Least privilege." });
    store = r2.store;
    const r3 = handleAdd(store, { category: "rejected", title: "Monolith", content: "Rejected." });
    store = r3.store;

    expect(store.entries).toHaveLength(3);
    expect(store.entries[0]!.id).toBe("dec-001");
    expect(store.entries[1]!.id).toBe("dec-002");
    expect(store.entries[2]!.id).toBe("rej-001");
  });

  test("updates entry fields without touching others", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "warning", title: "Old title", content: "Old content", tags: ["a"] }).store;
    const id = store.entries[0]!.id;
    store = handleUpdate(store, { id, title: "New title" }).store;

    expect(store.entries[0]!.title).toBe("New title");
    expect(store.entries[0]!.content).toBe("Old content");
    expect(store.entries[0]!.tags).toEqual(["a"]);
  });

  test("removes entry and cleans reverse relations", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: "." }).store;
    store = handleAdd(store, { category: "rejected", title: "B", content: "." }).store;
    const idA = "dec-001";
    const idB = "rej-001";
    store = handleRelate(store, { from_id: idB, to_id: idA, type: "rejected-by" }).store;
    expect(store.entries.find((e) => e.id === idB)!.relations).toHaveLength(1);

    store = handleRemove(store, idA).store;
    expect(store.entries.find((e) => e.id === idA)).toBeUndefined();
    expect(store.entries.find((e) => e.id === idB)!.relations).toHaveLength(0);
  });

  test("relates entries and prevents duplicates", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: "." }).store;
    store = handleAdd(store, { category: "rejected", title: "B", content: "." }).store;
    store = handleRelate(store, { from_id: "dec-001", to_id: "rej-001", type: "supersedes" }).store;
    const result = handleRelate(store, { from_id: "dec-001", to_id: "rej-001", type: "supersedes" });
    expect(result.error).toBeUndefined();
    expect(store.entries[0]!.relations).toHaveLength(1); // still 1
  });

  test("unrelates removes only the specific edge", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: "." }).store;
    store = handleAdd(store, { category: "rejected", title: "B", content: "." }).store;
    store = handleRelate(store, { from_id: "dec-001", to_id: "rej-001", type: "supersedes" }).store;
    store = handleRelate(store, { from_id: "dec-001", to_id: "rej-001", type: "relates-to" }).store;
    store = handleUnrelate(store, { from_id: "dec-001", to_id: "rej-001", type: "supersedes" }).store;
    expect(store.entries[0]!.relations).toHaveLength(1);
    expect(store.entries[0]!.relations[0]!.type).toBe("relates-to");
  });

  test("searches by title, content, and tags", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "Portal privilege", content: "portald runs as non-root", tags: ["privilege"] }).store;
    store = handleAdd(store, { category: "howto", title: "Build workflow", content: "cargo build --workspace" }).store;

    const r1 = handleSearch(store, "privilege");
    expect(r1.text).toContain("dec-001");
    expect(r1.text).not.toContain("how-001");

    const r2 = handleSearch(store, "cargo");
    expect(r2.text).toContain("how-001");
  });

  test("lists with category and slice_id filter", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: ".", slice_id: "rust-workspace" }).store;
    store = handleAdd(store, { category: "warning", title: "B", content: ".", slice_id: "config-loader" }).store;
    store = handleAdd(store, { category: "decision", title: "C", content: "." }).store;

    const filtered = handleList(store, { category: "decision" });
    expect(filtered.text).toContain("dec-001");
    expect(filtered.text).toContain("dec-002");
    expect(filtered.text).not.toContain("war-001");

    const bySlice = handleList(store, { slice_id: "rust-workspace" });
    expect(bySlice.text).toContain("dec-001");
    expect(bySlice.text).not.toContain("war-001");
  });

  test("context surfaces warnings first, then slice-tagged, then path-triggered", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "Some decision", content: "." }).store;
    store = handleAdd(store, { category: "warning", title: "Critical warning", content: "Watch out!" }).store;
    store = handleAdd(store, { category: "howto", title: "How to build", content: ".", slice_id: "rust-workspace" }).store;
    store = handleAdd(store, { category: "note", title: "Unrelated note", content: ".", slice_id: "dns-cache" }).store;

    const result = handleContext(store, { slice_id: "rust-workspace", limit: 10 });
    expect(result.text).toContain("Critical warning");
    expect(result.text).toContain("How to build");
    expect(result.text).not.toContain("Unrelated note");
  });

  test("graph traverses relations bidirectionally up to depth", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: "." }).store;
    store = handleAdd(store, { category: "rejected", title: "B", content: "." }).store;
    store = handleAdd(store, { category: "note", title: "C", content: "." }).store;
    store = handleRelate(store, { from_id: "dec-001", to_id: "rej-001", type: "supersedes" }).store;
    store = handleRelate(store, { from_id: "nte-001", to_id: "dec-001", type: "relates-to" }).store;

    const result = handleGraph(store, { id: "dec-001", depth: 2 });
    expect(result.text).toContain("dec-001");
    expect(result.text).toContain("rej-001");
    expect(result.text).toContain("nte-001");
  });

  test("get returns entry with incoming relations", () => {
    let store = createEmptyStore();
    store = handleAdd(store, { category: "decision", title: "A", content: "." }).store;
    store = handleAdd(store, { category: "rejected", title: "B", content: "." }).store;
    store = handleRelate(store, { from_id: "rej-001", to_id: "dec-001", type: "rejected-by" }).store;

    const result = handleGet(store, "dec-001");
    expect(result.text).toContain("dec-001");
    expect(result.text).toContain("Incoming relations");
    expect(result.text).toContain("rej-001");
  });
});

describe("glob matching", () => {
  test("matches exact paths", () => {
    expect(matchesGlob("edge-portald/main.rs", "edge-portald/main.rs")).toBe(true);
    expect(matchesGlob("edge-portald/main.rs", "edge-netd/main.rs")).toBe(false);
  });

  test("* matches single segment", () => {
    expect(matchesGlob("edge-portald/*.rs", "edge-portald/main.rs")).toBe(true);
    expect(matchesGlob("edge-portald/*.rs", "edge-portald/src/main.rs")).toBe(false);
  });

  test("** matches multiple segments", () => {
    expect(matchesGlob("**/edge-portald/**", "edgeos/edge-portald/src/main.rs")).toBe(true);
    expect(matchesGlob("**/edge-portald/**", "edgeos/edge-netd/src/main.rs")).toBe(false);
    expect(matchesGlob("edge-portald/**", "edge-portald/main.rs")).toBe(true);
    expect(matchesGlob("edge-portald/**", "edge-netd/main.rs")).toBe(false);
  });
});
