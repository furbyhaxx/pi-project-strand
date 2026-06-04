import { applyEdits, modify } from "jsonc-parser";

export interface StrandKnotInput { name: string; focus: string; advance_by?: string[]; }

const ADVANCE_ACTORS = ["human", "agent", "judge"];

export function validateStrandProposal(name: string, knots: StrandKnotInput[], existing: string[]): string | undefined {
  if (!name || !name.trim()) return "strand name is required";
  if (existing.includes(name.trim())) return `strand "${name.trim()}" already exists`;
  if (!Array.isArray(knots) || knots.length === 0) return "at least one knot is required";
  const names = knots.map((k) => (k.name ?? "").trim());
  if (names.some((n) => !n)) return "every knot needs a name";
  if (new Set(names).size !== names.length) return "knot names must be unique within the strand";
  if (knots.some((k) => !(k.focus ?? "").trim())) return "every knot needs a focus";
  for (const k of knots) {
    if (k.advance_by && k.advance_by.some((a) => !ADVANCE_ACTORS.includes(a))) {
      return `knot "${k.name}" has invalid advance_by; allowed: ${ADVANCE_ACTORS.join(", ")}`;
    }
  }
  return undefined;
}

export function buildStrandConfigText(configText: string, name: string, description: string, knots: StrandKnotInput[]): string {
  const base = configText.trim() ? configText : "{}";
  const value = {
    description: description ?? "",
    knots: knots.map((k) => (k.advance_by && k.advance_by.length > 0
      ? { name: k.name.trim(), focus: k.focus.trim(), advance_by: k.advance_by }
      : { name: k.name.trim(), focus: k.focus.trim() })),
  };
  const edits = modify(base, ["strands", name.trim()], value, { formattingOptions: { tabSize: 2, insertSpaces: true } });
  return applyEdits(base, edits);
}
