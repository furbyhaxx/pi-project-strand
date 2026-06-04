import { describe, expect, test } from "vitest";
import {
  parseJudgeModel,
  matchModelGlob,
  resolveJudgeConfig,
  resolveJudgeModel,
  resolveJudgeTools,
  judgePreflight,
  buildJudgeAuditPrompt,
  DEFAULT_JUDGE_TOOLS,
} from "../../extensions/judge-core.js";

describe("parseJudgeModel", () => {
  test("parses provider/model:thinking", () => {
    expect(parseJudgeModel("anthropic/claude-opus-4-8:high")).toEqual({ provider: "anthropic", model: "claude-opus-4-8", thinking: "high" });
  });
  test("parses without thinking", () => {
    expect(parseJudgeModel("github-copilot/claude-opus-4.8")).toEqual({ provider: "github-copilot", model: "claude-opus-4.8" });
  });
  test("rejects malformed", () => {
    expect(parseJudgeModel("noslash")).toBeNull();
    expect(parseJudgeModel("")).toBeNull();
  });
});

describe("matchModelGlob", () => {
  test("wildcards, case-insensitive", () => {
    expect(matchModelGlob("*gpt*5*", "openai/GPT-5-turbo")).toBe(true);
    expect(matchModelGlob("anthropic/claude-opus*", "anthropic/claude-opus-4-8")).toBe(true);
    expect(matchModelGlob("*gpt*5*", "anthropic/claude-opus-4-8")).toBe(false);
  });
  test("literal requires full match", () => {
    expect(matchModelGlob("openai/gpt-5", "openai/gpt-5")).toBe(true);
    expect(matchModelGlob("openai/gpt-5", "openai/gpt-5-turbo")).toBe(false);
  });
});

describe("resolveJudgeConfig + resolveJudgeModel + resolveJudgeTools", () => {
  test("knot wins over strand over project", () => {
    expect(resolveJudgeConfig({ model: "k/k" }, { model: "s/s" }, { model: "p/p" })).toEqual({ model: "k/k" });
    expect(resolveJudgeConfig(null, { model: "s/s" }, { model: "p/p" })).toEqual({ model: "s/s" });
    expect(resolveJudgeConfig(null, null, null)).toEqual({});
  });
  test("model map: first match wins, then fixed, then session", () => {
    const cfg = { models: { "*gpt*5*": "github-copilot/claude-opus-4.8:high", "*": "anthropic/claude-opus-4-8" }, model: "fixed/fixed" };
    expect(resolveJudgeModel(cfg, "openai/gpt-5")).toMatchObject({ fromSession: false, provider: "github-copilot", model: "claude-opus-4.8", thinking: "high" });
    expect(resolveJudgeModel({ model: "anthropic/claude-opus-4-8:max" }, "openai/gpt-5")).toMatchObject({ fromSession: false, model: "claude-opus-4-8", thinking: "max" });
    expect(resolveJudgeModel({}, "openai/gpt-5")).toEqual({ fromSession: true });
  });
  test("tools default + append + dedupe", () => {
    expect(resolveJudgeTools({})).toEqual(DEFAULT_JUDGE_TOOLS);
    expect(resolveJudgeTools({ tools: ["web_search", "bash"] })).toEqual([...DEFAULT_JUDGE_TOOLS, "web_search"]);
  });
});

describe("judgePreflight + buildJudgeAuditPrompt", () => {
  const slice: any = {
    id: "dns",
    name: "DNS",
    description: "d",
    goal: "cut latency",
    success_criteria: [{ text: "p99<1ms", met: false }],
    strand: {
      name: "quick",
      current_knot: "Realization",
      knots: [
        { name: "Prototype", advance_by: ["human"], status: "signed_off", focus: "f0", goals: [], success_criteria: [] },
        { name: "Realization", advance_by: ["judge"], status: "active", focus: "build it", goals: ["g1"], success_criteria: [{ text: "tests pass", met: false }] },
      ],
    },
  };
  test("preflight ok only when active knot uses judge", () => {
    expect(judgePreflight(slice).ok).toBe(true);
    const noJudge = { ...slice, strand: { ...slice.strand, current_knot: "Prototype" } };
    expect(judgePreflight(noJudge as any).ok).toBe(false);
  });
  test("audit prompt embeds goal, knot focus, criteria", () => {
    const p = buildJudgeAuditPrompt({ name: "EdgeOS", description: "router", updated_at: "" }, slice, slice.strand.knots[1]);
    expect(p).toContain("cut latency");
    expect(p).toContain("build it");
    expect(p).toContain("tests pass");
  });
});
