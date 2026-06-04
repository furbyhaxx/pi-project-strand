import { describe, expect, test } from "vitest";
import { parse } from "jsonc-parser";
import { buildStrandConfigText, validateStrandProposal, type StrandKnotInput } from "../../extensions/strand-authoring-core.js";

const validKnots: StrandKnotInput[] = [
  { name: "Prototype", focus: "Research/prototype the approach" },
  { name: "Realization", focus: "Build the final implementation" },
  { name: "Finalization", focus: "Validate and polish" },
];

describe("validateStrandProposal", () => {
  test("returns undefined for a valid proposal", () => {
    expect(validateStrandProposal("quick", validKnots, ["granular"])).toBeUndefined();
  });

  test("errors on empty name", () => {
    expect(validateStrandProposal("   ", validKnots, [])).toBe("strand name is required");
  });

  test("errors on duplicate name against existing", () => {
    expect(validateStrandProposal("quick", validKnots, ["quick"])).toBe('strand "quick" already exists');
  });

  test("errors on zero knots", () => {
    expect(validateStrandProposal("quick", [], [])).toBe("at least one knot is required");
  });

  test("errors on blank knot name", () => {
    const knots: StrandKnotInput[] = [{ name: "  ", focus: "do stuff" }];
    expect(validateStrandProposal("quick", knots, [])).toBe("every knot needs a name");
  });

  test("errors on duplicate knot names", () => {
    const knots: StrandKnotInput[] = [
      { name: "A", focus: "first" },
      { name: "A", focus: "second" },
    ];
    expect(validateStrandProposal("quick", knots, [])).toBe("knot names must be unique within the strand");
  });

  test("errors on missing focus", () => {
    const knots: StrandKnotInput[] = [{ name: "A", focus: "  " }];
    expect(validateStrandProposal("quick", knots, [])).toBe("every knot needs a focus");
  });
});

describe("buildStrandConfigText", () => {
  test("inserts into empty {} and yields parseable JSON matching knots", () => {
    const text = buildStrandConfigText("{}", "quick", "Quick strand", validKnots);
    const parsed = parse(text);
    expect(parsed.strands.quick.description).toBe("Quick strand");
    expect(parsed.strands.quick.knots).toEqual([
      { name: "Prototype", focus: "Research/prototype the approach" },
      { name: "Realization", focus: "Build the final implementation" },
      { name: "Finalization", focus: "Validate and polish" },
    ]);
  });

  test("preserves an existing strands.granular entry and adds the new one", () => {
    const existing = JSON.stringify({
      strands: {
        granular: { description: "Granular strand", knots: [{ name: "PoW", focus: "prove it" }] },
      },
    });
    const text = buildStrandConfigText(existing, "quick", "Quick strand", validKnots);
    const parsed = parse(text);
    expect(parsed.strands.granular).toEqual({ description: "Granular strand", knots: [{ name: "PoW", focus: "prove it" }] });
    expect(parsed.strands.quick.knots).toHaveLength(3);
    expect(parsed.strands.quick.knots[0]).toEqual({ name: "Prototype", focus: "Research/prototype the approach" });
  });

  test("preserves a line comment in the config", () => {
    const configText = `{
  // foo
  "project": { "name": "Demo" }
}`;
    const text = buildStrandConfigText(configText, "quick", "Quick strand", validKnots);
    expect(text).toContain("// foo");
    const parsed = parse(text);
    expect(parsed.project.name).toBe("Demo");
    expect(parsed.strands.quick.knots).toHaveLength(3);
  });
});

test("validateStrandProposal rejects bad advance_by values", () => {
  const err = validateStrandProposal("s", [{ name: "K", focus: "f", advance_by: ["robot" as any] }], []);
  expect(err).toMatch(/advance_by/);
});

test("buildStrandConfigText includes advance_by when present", () => {
  const out = buildStrandConfigText("{}", "s", "d", [{ name: "K", focus: "f", advance_by: ["agent"] }]);
  expect(parse(out).strands.s.knots[0].advance_by).toEqual(["agent"]);
});
