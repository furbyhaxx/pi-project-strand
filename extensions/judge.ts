import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AuthStorage, ModelRegistry, SessionManager, createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { RawVerdict } from "./judge-core.js";

function knowledgeExtPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "project-knowledge.ts");
}

export interface RunJudgeOptions {
  cwd: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: string[];
  systemPrompt: string;
  auditPrompt: string;
  timeoutMs: number;
}

export interface RunJudgeResult {
  verdict: RawVerdict | null;
  error?: string;
}

export async function runJudgeSession(opts: RunJudgeOptions): Promise<RunJudgeResult> {
  let captured: RawVerdict | null = null;

  const submitVerdict = defineTool({
    name: "submit_verdict",
    label: "Submit Verdict",
    description: "Submit your final audit verdict. Call this exactly once when you are done auditing.",
    parameters: Type.Object(
      {
        approved: Type.Boolean({ description: "True only if every success criterion is genuinely satisfied" }),
        reasons: Type.String({ description: "Concise justification for the decision" }),
        unmet_criteria: Type.Array(Type.String(), { description: "Criteria not satisfied (empty if approved)" }),
      },
      { additionalProperties: false }
    ),
    execute: async (_id, p) => {
      captured = { approved: p.approved, reasons: p.reasons, unmet: p.unmet_criteria ?? [] };
      return { content: [{ type: "text", text: "Verdict recorded." }], details: { ...captured }, terminate: true };
    },
  });

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const { session } = await createAgentSession({
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
    cwd: opts.cwd,
    model: opts.model,
    thinkingLevel: opts.thinkingLevel,
    tools: [...opts.tools, "submit_verdict"],
    customTools: [submitVerdict],
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      additionalExtensionPaths: [knowledgeExtPath()],
      systemPromptOverride: () => opts.systemPrompt,
    },
  });

  try {
    let timedOut = false;
    const timeout = new Promise<void>((resolve) => setTimeout(() => { timedOut = true; resolve(); }, opts.timeoutMs));
    await Promise.race([session.prompt(opts.auditPrompt), timeout]);
    if (timedOut && !captured) {
      await session.abort().catch(() => {});
      return { verdict: null, error: `judge timed out after ${Math.round(opts.timeoutMs / 1000)}s` };
    }
    if (!captured) return { verdict: null, error: "judge ended without submitting a verdict" };
    return { verdict: captured };
  } catch (e) {
    return { verdict: null, error: `judge session error: ${(e as Error).message}` };
  } finally {
    session.dispose();
  }
}
