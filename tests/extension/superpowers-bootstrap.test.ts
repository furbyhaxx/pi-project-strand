import { describe, expect, test } from "vitest";
import { buildProjectStrandBootstrap } from "../../extensions/superpowers-bootstrap.js";
import { DEFAULT_STRANDS } from "../../extensions/project-tracker-core.js";

describe("buildProjectStrandBootstrap", () => {
  test("prioritizes user instructions over project-strand rules", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("User instructions override project-strand guidance");
  });

  test("requires skill-first behavior before action", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("If even a 1% chance a skill applies");
    expect(text).toContain("before any response or action");
  });

  test("mentions both trackers and delegate-driven teammates", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("plan_tracker");
    expect(text).toContain("project_tracker");
    expect(text).toContain("delegate");
  });

  test("describes PROJECT.md as the planned capability map", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("high-level planned features/capabilities");
  });

  test("bootstrap explains configurable strands and persistent knots", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("strand");
    expect(text).toContain("Strands are named knot sequences");
    expect(text).toContain("/project:new:slice");
    expect(text).toContain("main");
    expect(text).toContain("side");
    expect(text).toContain("/project:slice:execute");
    expect(text).not.toContain("/project:brainstorm");
  });

  test("bootstrap documents advance_by and the agent two-phase protocol", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("advance_by");
    expect(text).toContain("two-step");
    expect(text).toContain("project_tracker action=knot:sign_off");
    expect(text).not.toContain("Request knot sign-off (/project:knot:advance)");
  });

  test("bootstrap documents the judge path", () => {
    const text = buildProjectStrandBootstrap();
    expect(text).toContain("knot:judge");
  });

  test("lists every built-in default strand (generated from DEFAULT_STRANDS, can't drift)", () => {
    const text = buildProjectStrandBootstrap();
    for (const name of Object.keys(DEFAULT_STRANDS)) {
      expect(text).toContain(name);
    }
    // the five current defaults, explicitly
    expect(Object.keys(DEFAULT_STRANDS)).toEqual(expect.arrayContaining(["spike", "quick", "deep-research", "change", "granular"]));
  });
});
